import { GAME } from "./engine/data";
import type { PlanConfig, Target } from "./engine/solver";

export type RateUnit = "sec" | "min" | "hr";
export const UNIT_FACTOR: Record<RateUnit, number> = { sec: 1 / 60, min: 1, hr: 60 };

export type View = "tree" | "machines" | "inputs";

export interface AppConfig extends PlanConfig {
  unit: RateUnit;
  view: View;
}

const STORAGE_KEY = "voidspark:v1";

let nextId = 1;
const newTargetId = () => `t${Date.now().toString(36)}${nextId++}`;

const defaults = (): AppConfig => ({
  targets: [{ id: "t0", material: "crafty-spark-block", mode: "rate", value: 1 }],
  recipeChoice: {},
  // Machines normally run with two sparks. Matches PirateSpark's default (Crafty, x2).
  defaultCrew: ["spark-crafty", "spark-crafty"],
  stationCrew: {},
  fuel: { material: "wooden-log", perMinute: GAME.fuels.find((f) => f.id === "wooden-log")!.perMinute },
  unit: "min",
  view: "tree",
});

function load(): AppConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && Array.isArray(saved.targets)) return migrate({ ...defaults(), ...saved });
  } catch {
    /* storage unavailable */
  }
  return defaults();
}

/**
 * Earlier versions stored one spark type per station (`defaultSpark`, `stationSpark`) and assumed
 * two of them, so each becomes a crew of two.
 */
function migrate(cfg: AppConfig & { defaultSpark?: string; stationSpark?: Record<string, string> }): AppConfig {
  const { defaultSpark, stationSpark, ...rest } = cfg;
  if (defaultSpark) rest.defaultCrew = [defaultSpark, defaultSpark];
  if (stationSpark) {
    rest.stationCrew = { ...rest.stationCrew };
    for (const [ws, id] of Object.entries(stationSpark)) rest.stationCrew[ws] ??= [id, id];
  }
  return rest;
}

/** Reactive app state. Mutate `cfg` directly or use the helpers. */
export class AppState {
  cfg = $state<AppConfig>(load());

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(this.cfg);
        try {
          localStorage.setItem(STORAGE_KEY, json);
        } catch {
          /* storage unavailable */
        }
      });
    });
  }

  /** Adds a target; `value` is items/min for rate targets. Returns its id. */
  addTarget(material: string, value = 1, mode: Target["mode"] = "rate") {
    const id = newTargetId();
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

  clearOverrides() {
    this.cfg.stationCrew = {};
    this.cfg.recipeChoice = {};
  }
}
