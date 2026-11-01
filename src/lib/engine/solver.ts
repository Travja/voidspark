/**
 * VoidSpark production solver.
 *
 * Model (checked against oddsparks.wiki.gg Template:Recipe):
 *   crafts/min per machine = 60 * crewSpeed / buildTime, capped by the station's craftCap.
 *   crewSpeed is the sum of the sparks working the station (Stumpy 1, Crafty 1.5, Handy 2.5).
 *   A fuelled station burns `fuel.perMinute` items of the chosen fuel per minute while running.
 *   Randomised outputs count at their expected value (amount * chance).
 *
 * Production flows one way: from raw inputs toward the targets. Each target expands into its
 * own tree and every node is sized for exactly what its parent pulls, so no belt has to run
 * back up the line:
 *   - Extra outputs (byproducts) are surplus. They are never fed back into earlier machines or
 *     credited against other branches.
 *   - If an input already appears further up its own chain (coal fuelling the coal furnace,
 *     a seed that comes from the plant it grows), it is not produced in a loop. It becomes a
 *     separate input, supplied from outside that chain.
 */
import {
  expectedOutput,
  GAME,
  SECONDS_PER_MINUTE,
  type GameData,
  type Recipe,
  type SparkType,
} from "./data";

export const EXTERNAL = "external";

export interface Target {
  id: string;
  material: string;
  /** "rate": value is items/min wanted. "machines": value is how many producing machines to run. */
  mode: "rate" | "machines";
  value: number;
}

export interface PlanConfig {
  targets: Target[];
  /** material -> recipe id, or EXTERNAL to treat it as a supplied raw input. */
  recipeChoice: Record<string, string>;
  /** Spark ids working every spark-powered workstation unless overridden. Speeds add up. */
  defaultCrew: string[];
  /** workstation id -> spark ids working it. */
  stationCrew: Record<string, string[]>;
  fuel: { material: string; perMinute: number };
}

export interface Edge {
  material: string;
  /** Units of `material` consumed per craft. */
  perUnit: number;
  fuel: boolean;
}

export interface Flow {
  material: string;
  /** Items per minute flowing along this edge. */
  rate: number;
  fuel: boolean;
  /** The recipe on the other end of the flow, if any. */
  recipe?: string;
}

export interface RecipePlan {
  recipe: Recipe;
  /** The material this recipe is run for (the first one, if several pick the same recipe). */
  primary: string;
  crew: SparkType[];
  /** Crafts per minute across all branches. */
  crafts: number;
  craftsPerMachine: number;
  /** Exact machines needed (fractional), summed over branches. */
  machines: number;
  /** Machines to build (ceil of the sum). */
  machinesBuilt: number;
  inputs: Flow[];
  outputs: Flow[];
}

export interface MaterialPlan {
  material: string;
  /** Recipe chosen for this material. */
  recipe: Recipe | null;
  produced: number;
  consumed: number;
  /** Items/min asked for directly by targets. */
  targetRate: number;
  /** Items/min that must come from outside the plan (raw inputs and loop breaks). */
  supplied: number;
  /** Part of `supplied` that is only external because producing it in-line would loop. */
  loopSupplied: number;
  /** Items/min made but not used: byproducts. */
  surplus: number;
  producers: Flow[];
  consumers: Flow[];
}

export interface StationSummary {
  workstation: string;
  machinesExact: number;
  machinesBuilt: number;
  lines: RecipePlan[];
}

export interface TreeNode {
  /** Stable path id for collapse state. */
  id: string;
  material: string;
  /**
   * craft: made by its recipe here. raw: supplied from outside. loop: already made further up
   * this chain, so supplied separately instead of looping back.
   */
  kind: "craft" | "raw" | "loop";
  /** Items/min this node delivers to its parent (or to the target, for roots). */
  rate: number;
  machines: number;
  recipe: Recipe | null;
  crew: SparkType[];
  fuel: boolean;
  /** Other outputs this branch's machines make (surplus). */
  byproducts: Flow[];
  children: TreeNode[];
  /** Inputs not shown because the tree hit its display size limit (totals still count them). */
  truncated?: boolean;
}

/**
 * A node in the build diagram: a group of machines running one recipe, a raw supply, an input
 * supplied separately to avoid a loop, or a target.
 */
export interface FlowNode {
  id: string;
  kind: "recipe" | "raw" | "loop" | "target";
  material: string;
  /** For recipe nodes. */
  line?: RecipePlan;
  /** Items/min supplied (raw, loop) or delivered (target). */
  rate: number;
}

/** Items moving from one diagram node to another. */
export interface FlowEdge {
  from: string;
  to: string;
  material: string;
  rate: number;
  fuel: boolean;
}

export interface Plan {
  materials: Map<string, MaterialPlan>;
  recipes: Map<string, RecipePlan>;
  /** Materials from targets down to raw inputs. */
  order: string[];
  rawInputs: MaterialPlan[];
  surplus: MaterialPlan[];
  stations: StationSummary[];
  buildCost: { material: string; amount: number }[];
  trees: TreeNode[];
  /** Machine groups and what feeds what, for the build diagram. */
  flow: { nodes: FlowNode[]; edges: FlowEdge[] };
  warnings: string[];
}

/** What delivering one unit/min of a material costs, all the way down its chain. */
interface Totals {
  /** recipe id -> crafts/min */
  crafts: Map<string, number>;
  /** recipe id -> material it was run for */
  runFor: Map<string, string>;
  /** material -> items/min supplied from outside */
  raw: Map<string, number>;
  /** material -> items/min supplied from outside to avoid a loop */
  loop: Map<string, number>;
  /** edgeKey(from, to, material, fuel) -> items/min; from/to are flow node ids */
  edges: Map<string, number>;
}

const SEP = "\u0000";
const edgeKey = (from: string, to: string, material: string, fuel: boolean) =>
  [from, to, material, fuel ? "1" : "0"].join(SEP);
const emptyTotals = (): Totals => ({ crafts: new Map(), runFor: new Map(), raw: new Map(), loop: new Map(), edges: new Map() });

const EPS = 1e-9;
/** The tree view is capped for display; plan totals are always exact. */
const TREE_NODE_BUDGET = 1500;
const TREE_MAX_DEPTH = 30;

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** target += source * scale */
function mergeInto(target: Totals, source: Totals, scale: number) {
  for (const [k, v] of source.crafts) add(target.crafts, k, v * scale);
  for (const [k, v] of source.runFor) if (!target.runFor.has(k)) target.runFor.set(k, v);
  for (const [k, v] of source.raw) add(target.raw, k, v * scale);
  for (const [k, v] of source.loop) add(target.loop, k, v * scale);
  for (const [k, v] of source.edges) add(target.edges, k, v * scale);
}

export class Solver {
  constructor(
    readonly cfg: PlanConfig,
    readonly data: GameData = GAME,
  ) {}

  recipeFor(material: string): Recipe | null {
    const options = this.data.recipesFor.get(material) ?? [];
    if (!options.length) return null;
    const choice = this.cfg.recipeChoice[material];
    if (choice === EXTERNAL) return null;
    const chosen = choice ? options.find((r) => r.id === choice) : undefined;
    if (chosen) return chosen;
    const def = this.data.materials.get(material)?.defaultRecipe;
    if (def === null) return null;
    return options.find((r) => r.id === def) ?? options[0];
  }

  /** Sparks working one machine of this workstation type (trimmed to its slot count). */
  crewFor(workstation: string): SparkType[] {
    const ws = this.data.workstations.get(workstation);
    if (ws && !ws.sparkPowered) return [];
    const ids = this.cfg.stationCrew[workstation] ?? this.cfg.defaultCrew;
    const crew = ids
      .map((id) => this.data.sparks.find((s) => s.id === id))
      .filter((s): s is SparkType => !!s)
      .slice(0, ws?.sparkSlots ?? ids.length);
    return crew.length ? crew : [this.data.sparks[0]];
  }

  /** Combined speed multiplier of the crew (1 = one Stumpy). */
  crewSpeed(workstation: string): number {
    const ws = this.data.workstations.get(workstation);
    if (ws && !ws.sparkPowered) return 1;
    return this.crewFor(workstation).reduce((n, s) => n + s.speed / 100, 0);
  }

  craftsPerMinute(recipe: Recipe): number {
    const rate = (SECONDS_PER_MINUTE * this.crewSpeed(recipe.workstation)) / recipe.buildTime;
    const cap = this.data.workstations.get(recipe.workstation)?.craftCap;
    return cap !== undefined ? Math.min(rate, cap) : rate;
  }

  /** Expected units of `material` per minute from one machine running its chosen recipe. */
  outputPerMachine(material: string): number {
    const r = this.recipeFor(material);
    return r ? this.craftsPerMinute(r) * expectedOutput(r, material) : 0;
  }

  /** Fuel units burnt per craft of a recipe. */
  fuelPerCraft(recipe: Recipe): number {
    if (!recipe.fuelRequired || !(this.cfg.fuel.perMinute > 0)) return 0;
    return this.cfg.fuel.perMinute / this.craftsPerMinute(recipe);
  }

  /** Inputs (with fuel) per craft of `recipe`. */
  craftInputs(recipe: Recipe): Edge[] {
    const out = recipe.from.map((f) => ({ material: f.material, perUnit: f.amount, fuel: false }));
    const fuel = this.fuelPerCraft(recipe);
    if (fuel > 0) out.push({ material: this.cfg.fuel.material, perUnit: fuel, fuel: true });
    return out;
  }

  targetRate(t: Target): number {
    if (!(t.value > 0)) return 0;
    if (t.mode === "machines") return t.value * this.outputPerMachine(t.material);
    return t.value;
  }

  // --- per-unit totals -------------------------------------------------------------------------

  private reachCache = new Map<string, Set<string>>();

  /** Every material that can appear below `material` in its chain. */
  private reach(material: string): Set<string> {
    const hit = this.reachCache.get(material);
    if (hit) return hit;
    const seen = new Set<string>();
    const stack = [material];
    while (stack.length) {
      const m = stack.pop()!;
      const r = this.recipeFor(m);
      for (const e of r ? this.craftInputs(r) : []) {
        if (!seen.has(e.material)) {
          seen.add(e.material);
          stack.push(e.material);
        }
      }
    }
    this.reachCache.set(material, seen);
    return seen;
  }

  private unitCache = new Map<string, Totals>();

  /**
   * Totals for delivering one unit/min of `material` below `ancestors`. Only ancestors that can
   * reappear below this material change the answer, so they alone form the cache key.
   */
  private unit(material: string, ancestors: Set<string>): Totals {
    const below = this.reach(material);
    const relevant = [...ancestors].filter((a) => below.has(a)).sort();
    const key = `${material}|${relevant.join(",")}`;
    const hit = this.unitCache.get(key);
    if (hit) return hit;

    const t = emptyTotals();
    const recipe = this.recipeFor(material);
    if (!recipe) {
      t.raw.set(material, 1);
    } else {
      const crafts = 1 / expectedOutput(recipe, material);
      t.crafts.set(recipe.id, crafts);
      t.runFor.set(recipe.id, material);
      const next = new Set(relevant).add(material);
      for (const e of this.craftInputs(recipe)) {
        const need = crafts * e.perUnit;
        if (next.has(e.material)) {
          add(t.raw, e.material, need);
          add(t.loop, e.material, need);
          add(t.edges, edgeKey(`loop:${e.material}`, recipe.id, e.material, e.fuel), need);
          continue;
        }
        const childRecipe = this.recipeFor(e.material);
        add(t.edges, edgeKey(childRecipe ? childRecipe.id : `raw:${e.material}`, recipe.id, e.material, e.fuel), need);
        const sub = this.unit(e.material, next);
        mergeInto(t, sub, need);
      }
    }
    this.unitCache.set(key, t);
    return t;
  }

  // --- tree (display) ----------------------------------------------------------------------------

  private node(material: string, rate: number, id: string, fuel: boolean): TreeNode {
    const recipe = this.recipeFor(material);
    const base: TreeNode = { id, material, kind: "raw", rate, machines: 0, recipe: null, crew: [], fuel, byproducts: [], children: [] };
    if (!recipe) return base;
    const crafts = rate / expectedOutput(recipe, material);
    return {
      ...base,
      kind: "craft",
      machines: crafts / this.craftsPerMinute(recipe),
      recipe,
      crew: this.crewFor(recipe.workstation),
      byproducts: recipe.to
        .filter((t) => t.material !== material)
        .map((t) => ({ material: t.material, rate: crafts * t.amount * (t.chance ?? 1), fuel: false })),
    };
  }

  /** Breadth-first so that, past the display budget, the deepest levels are the ones collapsed. */
  private buildTrees(roots: { material: string; rate: number; id: string }[]): TreeNode[] {
    type Job = { node: TreeNode; ancestors: Set<string>; depth: number };
    let budget = TREE_NODE_BUDGET;
    const queue: Job[] = [];
    const trees = roots.map((r) => {
      const node = this.node(r.material, r.rate, r.id, false);
      queue.push({ node, ancestors: new Set(), depth: 0 });
      return node;
    });
    while (queue.length) {
      const { node, ancestors, depth } = queue.shift()!;
      if (node.kind !== "craft" || !node.recipe) continue;
      if (budget <= 0 || depth >= TREE_MAX_DEPTH) {
        node.truncated = this.craftInputs(node.recipe).length > 0;
        continue;
      }
      const below = new Set(ancestors).add(node.material);
      const crafts = node.rate / expectedOutput(node.recipe, node.material);
      for (const e of this.craftInputs(node.recipe)) {
        const rate = crafts * e.perUnit;
        const id = `${node.id}/${e.material}${e.fuel ? "~fuel" : ""}`;
        budget--;
        if (below.has(e.material)) {
          node.children.push({ ...this.node(e.material, rate, id, e.fuel), kind: "loop", machines: 0, recipe: null, crew: [], byproducts: [] });
        } else {
          const child = this.node(e.material, rate, id, e.fuel);
          node.children.push(child);
          queue.push({ node: child, ancestors: below, depth: depth + 1 });
        }
      }
    }
    return trees;
  }

  // --- plan --------------------------------------------------------------------------------------

  plan(): Plan {
    const warnings: string[] = [];
    const targets = this.cfg.targets.filter((t) => this.data.materials.has(t.material));
    const demand = new Map<string, number>();
    const totals = emptyTotals();
    for (const t of targets) {
      if (t.mode === "machines" && !this.recipeFor(t.material)) {
        warnings.push(`${this.name(t.material)} has no recipe selected, so set its target as a rate.`);
      }
      const rate = this.targetRate(t);
      add(demand, t.material, rate);
      mergeInto(totals, this.unit(t.material, new Set()), rate);
      const r = this.recipeFor(t.material);
      add(totals.edges, edgeKey(r ? r.id : `raw:${t.material}`, `target:${t.material}`, t.material, false), rate);
    }

    const recipes = new Map<string, RecipePlan>();
    for (const [id, crafts] of totals.crafts) {
      if (crafts <= EPS) continue;
      const recipe = this.data.recipesById.get(id)!;
      const cpm = this.craftsPerMinute(recipe);
      const machines = crafts / cpm;
      recipes.set(id, {
        recipe,
        primary: totals.runFor.get(id)!,
        crew: this.crewFor(recipe.workstation),
        crafts,
        craftsPerMachine: cpm,
        machines,
        machinesBuilt: Math.ceil(machines - EPS),
        inputs: this.craftInputs(recipe).map((e) => ({ material: e.material, rate: crafts * e.perUnit, fuel: e.fuel })),
        outputs: recipe.to.map((t) => ({ material: t.material, rate: crafts * t.amount * (t.chance ?? 1), fuel: false })),
      });
    }

    const materials = new Map<string, MaterialPlan>();
    const mat = (m: string) => {
      let mp = materials.get(m);
      if (!mp) {
        mp = {
          material: m,
          recipe: this.recipeFor(m),
          produced: 0,
          consumed: 0,
          targetRate: demand.get(m) ?? 0,
          supplied: totals.raw.get(m) ?? 0,
          loopSupplied: totals.loop.get(m) ?? 0,
          surplus: 0,
          producers: [],
          consumers: [],
        };
        materials.set(m, mp);
      }
      return mp;
    };
    for (const m of demand.keys()) mat(m);
    for (const m of totals.raw.keys()) mat(m);
    for (const rp of recipes.values()) {
      for (const o of rp.outputs) {
        const mp = mat(o.material);
        mp.produced += o.rate;
        mp.producers.push({ material: rp.primary, rate: o.rate, fuel: false, recipe: rp.recipe.id });
      }
      for (const i of rp.inputs) {
        const mp = mat(i.material);
        mp.consumed += i.rate;
        mp.consumers.push({ material: rp.primary, rate: i.rate, fuel: i.fuel, recipe: rp.recipe.id });
      }
    }
    for (const mp of materials.values()) {
      const extra = mp.produced + mp.supplied - mp.consumed - mp.targetRate;
      mp.surplus = extra > 1e-7 ? extra : 0;
    }
    for (const mp of materials.values()) {
      if (mp.loopSupplied > 1e-7) {
        warnings.push(
          `${this.name(mp.material)} (${+mp.loopSupplied.toFixed(3)}/min) is needed further down its own chain. Supply it separately rather than looping it back, or pick another recipe.`,
        );
      }
    }

    // Order: shortest distance from a target first.
    const level = new Map<string, number>();
    const queue: [string, number][] = [...demand.keys()].map((m) => [m, 0]);
    while (queue.length) {
      const [m, d] = queue.shift()!;
      if (level.has(m)) continue;
      level.set(m, d);
      const r = this.recipeFor(m);
      if (r) for (const e of this.craftInputs(r)) queue.push([e.material, d + 1]);
    }
    const order = [...materials.keys()].sort(
      (a, b) => (level.get(a) ?? 99) - (level.get(b) ?? 99) || this.name(a).localeCompare(this.name(b)),
    );

    const byStation = new Map<string, StationSummary>();
    const recipeOrder = [...recipes.values()].sort((a, b) => (level.get(a.primary) ?? 99) - (level.get(b.primary) ?? 99));
    for (const rp of recipeOrder) {
      const ws = rp.recipe.workstation;
      const s = byStation.get(ws) ?? { workstation: ws, machinesExact: 0, machinesBuilt: 0, lines: [] };
      s.machinesExact += rp.machines;
      s.machinesBuilt += rp.machinesBuilt;
      s.lines.push(rp);
      byStation.set(ws, s);
    }
    const stations = [...byStation.values()].sort((a, b) => b.machinesBuilt - a.machinesBuilt);

    const cost = new Map<string, number>();
    for (const s of stations) {
      for (const c of this.data.workstations.get(s.workstation)?.cost ?? []) add(cost, c.id, c.amount * s.machinesBuilt);
    }

    const trees = this.buildTrees(targets.map((t) => ({ material: t.material, rate: this.targetRate(t), id: t.id })));

    // Build diagram: one node per recipe line, raw supply, loop break and target.
    const flowNodes = new Map<string, FlowNode>();
    for (const rp of recipes.values()) {
      flowNodes.set(rp.recipe.id, { id: rp.recipe.id, kind: "recipe", material: rp.primary, line: rp, rate: rp.crafts });
    }
    const flowEdges: FlowEdge[] = [];
    for (const [key, rate] of totals.edges) {
      if (rate <= EPS) continue;
      const [from, to, material, fuel] = key.split(SEP);
      for (const id of [from, to]) {
        if (flowNodes.has(id)) continue;
        const [kind, m] = id.split(/:(.*)/s) as ["raw" | "loop" | "target", string];
        flowNodes.set(id, { id, kind, material: m, rate: 0 });
      }
      if (!flowNodes.get(to)!.line) flowNodes.get(to)!.rate += rate;
      if (!flowNodes.get(from)!.line) flowNodes.get(from)!.rate += rate;
      flowEdges.push({ from, to, material, rate, fuel: fuel === "1" });
    }

    return {
      materials,
      recipes,
      order,
      rawInputs: order.map((m) => materials.get(m)!).filter((mp) => mp.supplied > 1e-7),
      surplus: order.map((m) => materials.get(m)!).filter((mp) => mp.surplus > 1e-7),
      stations,
      buildCost: [...cost].map(([material, amount]) => ({ material, amount })),
      trees,
      flow: { nodes: [...flowNodes.values()], edges: flowEdges },
      warnings,
    };
  }

  name(material: string): string {
    return this.data.materials.get(material)?.name ?? this.data.workstations.get(material)?.name ?? material;
  }
}

export function makePlan(cfg: PlanConfig, data: GameData = GAME): Plan {
  return new Solver(cfg, data).plan();
}
