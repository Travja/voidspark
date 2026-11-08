import { GAME } from "./engine/data";
import { fromBase64Url, toBase64Url } from "./base64url";
import { allSites, type Limit } from "./engine/limits";
import { EXTERNAL, type PlanConfig, type Target } from "./engine/solver";
import { History } from "./history";

export type RateUnit = "sec" | "min" | "hr";
export const UNIT_FACTOR: Record<RateUnit, number> = { sec: 1 / 60, min: 1, hr: 60 };

export type View = "tree" | "machines" | "inputs";

/** The current plan's config plus app-wide settings: what the components read and write. */
export interface AppConfig extends Required<PlanConfig> {
  unit: RateUnit;
  view: View;
}

export interface SavedPlan {
  id: string;
  name: string;
  config: PlanConfig;
  /** Build checklist: recipe id -> machines already built for that group. */
  built: Record<string, number>;
}

interface Stored {
  version: 2;
  plans: SavedPlan[];
  current: string;
  unit: RateUnit;
  view: View;
}

const STORAGE_KEY = "voidspark:v2";
/** Single-plan format used before saved plans existed. */
const LEGACY_KEY = "voidspark:v1";

let nextId = 1;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${nextId++}`;

export const defaultPlanConfig = (): PlanConfig => ({
  targets: [{ id: "t0", material: "crafty-spark-block", mode: "rate", value: 1 }],
  recipeChoice: {},
  // Machines normally run with two sparks. Matches PirateSpark's default (Crafty, x2).
  defaultCrew: ["spark-crafty", "spark-crafty"],
  stationCrew: {},
  fuel: { material: "wooden-log", perMinute: GAME.fuels.find((f) => f.id === "wooden-log")!.perMinute },
  limits: [],
});

/**
 * Earlier versions stored one spark type per station (`defaultSpark`, `stationSpark`) and assumed
 * two of them, so each becomes a crew of two.
 */
function migrateConfig(
  raw: Partial<PlanConfig> & { defaultSpark?: string; stationSpark?: Record<string, string> },
): PlanConfig {
  const { defaultSpark, stationSpark, ...rest } = raw;
  const cfg: PlanConfig = { ...defaultPlanConfig(), ...rest };
  if (defaultSpark) cfg.defaultCrew = [defaultSpark, defaultSpark];
  if (stationSpark) {
    cfg.stationCrew = { ...cfg.stationCrew };
    for (const [ws, id] of Object.entries(stationSpark)) cfg.stationCrew[ws] ??= [id, id];
  }
  return cfg;
}

function read(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function load(): Stored {
  const saved = read(STORAGE_KEY);
  if (saved?.version === 2 && Array.isArray(saved.plans) && saved.plans.length) {
    const plans: SavedPlan[] = saved.plans.map((p: SavedPlan) => ({
      id: String(p.id),
      name: String(p.name || "Plan"),
      config: migrateConfig(p.config ?? {}),
      built: p.built && typeof p.built === "object" ? p.built : {},
    }));
    return {
      version: 2,
      plans,
      current: plans.some((p) => p.id === saved.current) ? saved.current : plans[0].id,
      unit: saved.unit in UNIT_FACTOR ? saved.unit : "min",
      view: ["tree", "machines", "inputs"].includes(saved.view) ? saved.view : "tree",
    };
  }
  // First run with saved plans: carry the old single plan over.
  const legacy = read(LEGACY_KEY);
  const plan: SavedPlan = {
    id: newId("p"),
    name: "My plan",
    config: legacy && Array.isArray(legacy.targets) ? migrateConfig(legacy) : defaultPlanConfig(),
    built: {},
  };
  return {
    version: 2,
    plans: [plan],
    current: plan.id,
    unit: legacy?.unit in UNIT_FACTOR ? legacy.unit : "min",
    view: ["tree", "machines", "inputs"].includes(legacy?.view) ? legacy.view : "tree",
  };
}

// ---------------------------------------------------------------------------------------------
// Share links: a compact, versioned encoding of one plan in the URL fragment (#plan=...). The
// fragment never reaches a server. Everything is validated against the game data on the way in.

interface SharePayload {
  v: 1;
  /** name */
  n: string;
  /** targets: [material, mode ("r" | "m"), value] */
  t: [string, "r" | "m", number][];
  /** recipe choices */
  r?: Record<string, string>;
  /** default crew */
  c?: string[];
  /** crew per workstation */
  s?: Record<string, string[]>;
  /** fuel: [material, perMinute] */
  f?: [string, number];
  /** limits: [kind ("s" site | "i" item | "w" workstation), key, amount] */
  l?: [string, string, number][];
}

export function encodePlan(name: string, cfg: PlanConfig): string {
  const payload: SharePayload = {
    v: 1,
    n: name,
    t: cfg.targets.map((t) => [t.material, t.mode === "machines" ? "m" : "r", +t.value.toPrecision(6)]),
  };
  if (Object.keys(cfg.recipeChoice).length) payload.r = cfg.recipeChoice;
  payload.c = cfg.defaultCrew;
  if (Object.keys(cfg.stationCrew).length) payload.s = cfg.stationCrew;
  payload.f = [cfg.fuel.material, cfg.fuel.perMinute];
  if (cfg.limits?.length) {
    payload.l = cfg.limits.map((l) => [l.kind[0], l.key, +l.amount.toPrecision(6)]);
  }
  return toBase64Url(JSON.stringify(payload));
}

const sparkIds = () => new Set(GAME.sparks.map((s) => s.id));
const crewOk = (crew: unknown): crew is string[] =>
  Array.isArray(crew) && crew.length > 0 && crew.length <= 4 && crew.every((id) => sparkIds().has(id));

/** Decode a share link payload. Returns null if it isn't a valid plan. */
export function decodePlan(data: string): { name: string; config: PlanConfig } | null {
  let p: SharePayload;
  try {
    p = JSON.parse(fromBase64Url(data));
  } catch {
    return null;
  }
  if (!p || p.v !== 1 || !Array.isArray(p.t)) return null;
  const config = defaultPlanConfig();
  config.targets = p.t
    .filter(
      (t) =>
        Array.isArray(t) && GAME.materials.has(t[0]) && (t[1] === "r" || t[1] === "m") && Number.isFinite(t[2]) && t[2] >= 0,
    )
    .slice(0, 50)
    .map(([material, mode, value]) => ({ id: newId("t"), material, mode: mode === "m" ? "machines" : "rate", value }));
  if (!config.targets.length) return null;
  for (const [m, r] of Object.entries(p.r ?? {})) {
    if (GAME.materials.has(m) && (r === EXTERNAL || GAME.recipesById.has(r))) config.recipeChoice[m] = r;
  }
  if (crewOk(p.c)) config.defaultCrew = p.c;
  for (const [ws, crew] of Object.entries(p.s ?? {})) {
    if (GAME.workstations.has(ws) && crewOk(crew)) config.stationCrew[ws] = crew;
  }
  const fuel = p.f && GAME.fuels.find((f) => f.id === p.f![0]);
  if (fuel) config.fuel = { material: fuel.id, perMinute: fuel.perMinute };
  const kinds = { s: "site", i: "item", w: "workstation" } as const;
  const sites = new Set(allSites());
  config.limits = (Array.isArray(p.l) ? p.l : [])
    .filter(
      (l): l is [keyof typeof kinds, string, number] =>
        Array.isArray(l) &&
        l[0] in kinds &&
        Number.isFinite(l[2]) &&
        l[2] >= 0 &&
        (l[0] === "s" ? sites.has(l[1]) : l[0] === "i" ? GAME.materials.has(l[1]) : GAME.workstations.has(l[1])),
    )
    .slice(0, 50)
    .map(([k, key, amount]) => ({ id: newId("l"), kind: kinds[k], key, amount }));
  const name = typeof p.n === "string" && p.n.trim() ? p.n.trim().slice(0, 60) : "Shared plan";
  return { name, config };
}

// ---------------------------------------------------------------------------------------------

/** Reactive app state. Components read and write `cfg`; plans are managed with the helpers. */
export class AppState {
  #store = $state<Stored>(load());
  /** Undo covers the plans (targets, choices, limits, checklist), not tabs or units. */
  #history = new History(this.#doc());
  #undoSteps = $state(0);
  #redoSteps = $state(0);

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(this.#store);
        try {
          localStorage.setItem(STORAGE_KEY, json);
        } catch {
          /* storage unavailable */
        }
        this.#history.record(this.#doc());
        this.#syncSteps();
      });
    });
  }

  #doc(): string {
    return JSON.stringify({ plans: this.#store.plans, current: this.#store.current });
  }

  #syncSteps() {
    this.#undoSteps = this.#history.past.length;
    this.#redoSteps = this.#history.future.length;
  }

  #restore(doc: string | null): boolean {
    if (doc === null) return false;
    const { plans, current } = JSON.parse(doc) as Pick<Stored, "plans" | "current">;
    this.#store.plans = plans;
    this.#store.current = current;
    this.#syncSteps();
    return true;
  }

  get canUndo(): boolean {
    return this.#undoSteps > 0;
  }

  get canRedo(): boolean {
    return this.#redoSteps > 0;
  }

  /** Takes back the last change. Returns false if there was nothing to undo. */
  undo(): boolean {
    return this.#restore(this.#history.undo());
  }

  redo(): boolean {
    return this.#restore(this.#history.redo());
  }

  get plans(): SavedPlan[] {
    return this.#store.plans;
  }

  get current(): SavedPlan {
    return this.#store.plans.find((p) => p.id === this.#store.current) ?? this.#store.plans[0];
  }

  /**
   * The current plan's config merged with app-wide settings. Reads and writes go straight to the
   * right place, so `app.cfg.targets.push(...)`, `bind:value={app.cfg.unit}` and
   * `$state.snapshot(app.cfg)` all work.
   */
  readonly cfg: AppConfig = (() => {
    const self = this;
    const planKeys = ["targets", "recipeChoice", "defaultCrew", "stationCrew", "fuel", "limits"] as const;
    const view = {} as AppConfig;
    for (const key of planKeys) {
      Object.defineProperty(view, key, {
        enumerable: true,
        get: () => self.current.config[key],
        set: (v) => ((self.current.config as unknown as Record<string, unknown>)[key] = v),
      });
    }
    for (const key of ["unit", "view"] as const) {
      Object.defineProperty(view, key, {
        enumerable: true,
        get: () => self.#store[key],
        set: (v) => ((self.#store as unknown as Record<string, unknown>)[key] = v),
      });
    }
    return view;
  })();

  // --- targets and choices -------------------------------------------------------------------

  /** Adds a target; `value` is items/min for rate targets. Returns its id. */
  addTarget(material: string, value = 1, mode: Target["mode"] = "rate") {
    const id = newId("t");
    this.cfg.targets.push({ id, material, mode, value });
    return id;
  }

  updateTarget(id: string, patch: Partial<Target>) {
    const t = this.cfg.targets.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  }

  removeTarget(id: string) {
    this.cfg.targets = this.cfg.targets.filter((t) => t.id !== id);
  }

  chooseRecipe(material: string, recipe: string) {
    this.cfg.recipeChoice[material] = recipe;
  }

  setStationCrew(workstation: string, crew: string[] | null) {
    if (crew === null) delete this.cfg.stationCrew[workstation];
    else this.cfg.stationCrew[workstation] = crew;
  }

  // --- what I have --------------------------------------------------------------------------

  addLimit(kind: Limit["kind"], key: string, amount: number) {
    const existing = this.cfg.limits.find((l) => l.kind === kind && l.key === key);
    if (existing) return existing.id;
    const id = newId("l");
    this.cfg.limits.push({ id, kind, key, amount });
    return id;
  }

  updateLimit(id: string, amount: number) {
    const l = this.cfg.limits.find((x) => x.id === id);
    if (l) l.amount = Math.max(0, amount);
  }

  removeLimit(id: string) {
    this.cfg.limits = this.cfg.limits.filter((l) => l.id !== id);
  }

  /** Multiplies every target by `factor` (rounded down, so it stays within the limits). */
  scaleTargets(factor: number, round: (x: number) => number) {
    for (const t of this.cfg.targets) t.value = round(t.value * factor);
  }

  clearOverrides() {
    this.cfg.stationCrew = {};
    this.cfg.recipeChoice = {};
  }

  // --- saved plans ---------------------------------------------------------------------------

  selectPlan(id: string) {
    if (this.#store.plans.some((p) => p.id === id)) this.#store.current = id;
  }

  /** Adds a plan (a fresh default, or the given config) and switches to it. */
  newPlan(name = "New plan", config: PlanConfig = defaultPlanConfig()) {
    const plan: SavedPlan = { id: newId("p"), name: this.uniqueName(name), config, built: {} };
    this.#store.plans.push(plan);
    this.#store.current = plan.id;
    return plan.id;
  }

  duplicatePlan() {
    const src = $state.snapshot(this.current);
    return this.newPlan(`${src.name} copy`, src.config);
  }

  renamePlan(id: string, name: string) {
    const plan = this.#store.plans.find((p) => p.id === id);
    const clean = name.trim().slice(0, 60);
    if (plan && clean) plan.name = clean;
  }

  /** Deletes a plan. The last remaining plan can't be deleted. */
  deletePlan(id: string) {
    if (this.#store.plans.length <= 1) return;
    const i = this.#store.plans.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.#store.plans.splice(i, 1);
    if (this.#store.current === id) this.#store.current = this.#store.plans[Math.max(0, i - 1)].id;
  }

  private uniqueName(name: string) {
    const taken = new Set(this.#store.plans.map((p) => p.name));
    if (!taken.has(name)) return name;
    let n = 2;
    while (taken.has(`${name} (${n})`)) n++;
    return `${name} (${n})`;
  }

  // --- share links ---------------------------------------------------------------------------

  /** Link that opens the current plan for whoever follows it. */
  shareUrl(): string {
    const url = new URL(location.href);
    url.hash = `plan=${encodePlan(this.current.name, $state.snapshot(this.current.config))}`;
    return url.toString();
  }

  /**
   * If the page was opened from a share link, add that plan (or switch to an identical saved
   * one) and clear the link from the address bar. Returns the plan's name, or null.
   */
  openSharedPlan(): string | null {
    const match = /(?:^#|&)plan=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!match) return null;
    history.replaceState(null, "", location.pathname + location.search);
    const shared = decodePlan(match[1]);
    if (!shared) return null;
    const key = (c: PlanConfig) => encodePlan("", { ...c, targets: c.targets.map((t) => ({ ...t, id: "" })) });
    const same = this.#store.plans.find((p) => key($state.snapshot(p.config)) === key(shared.config));
    if (same) {
      this.#store.current = same.id;
      return same.name;
    }
    this.newPlan(shared.name, shared.config);
    return this.current.name;
  }

  // --- build checklist -----------------------------------------------------------------------

  /** Machines already built for a recipe group in the current plan. */
  builtCount(recipeId: string): number {
    return this.current.built[recipeId] ?? 0;
  }

  setBuilt(recipeId: string, count: number) {
    if (count > 0) this.current.built[recipeId] = Math.round(count);
    else delete this.current.built[recipeId];
  }

  resetBuilt() {
    this.current.built = {};
  }
}
