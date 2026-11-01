/**
 * VoidSpark production solver.
 *
 * Model (kept compatible with PirateSpark):
 *   crafts/min per machine = 120 * (sparkSpeed / 100) / buildTime
 *   Stations that aren't spark-powered always run at 100%.
 *   A fuelled station burns `fuel.perMinute` items of the chosen fuel per minute while running.
 *
 * Everything is expressed per unit of output. A[i][j] is how many units of material i are
 * consumed to produce one unit of material j, counting fuel. For external demand d, gross
 * production G solves (I - A) G = d. Loops (coal fuelling the coal furnace, aether shards
 * feeding the aether chain) fall out of the same solve with no special cases.
 */
import { GAME, WORK_PER_MINUTE, type GameData, type Recipe, type SparkType } from "./data";

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
  /** Spark id used at every spark-powered workstation unless overridden. */
  defaultSpark: string;
  /** workstation id -> spark id. */
  stationSpark: Record<string, string>;
  fuel: { material: string; perMinute: number };
}

/** Defaults inherited from PirateSpark: bark from the sawbench, aether shards supplied. */
export const DEFAULT_RECIPE_CHOICE: Record<string, string> = {
  "tree-bark": "bark",
  "aether-shard": EXTERNAL,
};

export interface Edge {
  material: string;
  /** Units of `material` consumed per unit of the parent's output. */
  perUnit: number;
  fuel: boolean;
}

export interface Flow {
  material: string;
  /** Items per minute flowing along this edge. */
  rate: number;
  fuel: boolean;
}

export interface MaterialPlan {
  material: string;
  recipe: Recipe | null;
  spark: SparkType | null;
  /** Total items/min produced (or supplied, for raw inputs). */
  gross: number;
  /** Items/min asked for directly by targets. */
  targetRate: number;
  /** Exact machines needed (fractional). 0 for raw inputs. */
  machines: number;
  /** Machines to build (ceil). */
  machinesBuilt: number;
  outputPerMachine: number;
  inputs: Flow[];
  consumers: Flow[];
}

export interface StationSummary {
  workstation: string;
  machinesExact: number;
  machinesBuilt: number;
  lines: MaterialPlan[];
}

export interface TreeNode {
  /** Stable path id for collapse state. */
  id: string;
  material: string;
  kind: "craft" | "raw" | "loop";
  /** Items/min this node delivers to its parent (or to the target, for roots). */
  rate: number;
  /** Items/min the machines in this branch produce, including the loop-back share. */
  gross: number;
  machines: number;
  recipe: Recipe | null;
  spark: SparkType | null;
  fuel: boolean;
  children: TreeNode[];
}

export interface Plan {
  materials: Map<string, MaterialPlan>;
  /** Produced materials, ordered from targets down to raw inputs. */
  order: string[];
  rawInputs: MaterialPlan[];
  stations: StationSummary[];
  buildCost: { material: string; amount: number }[];
  trees: TreeNode[];
  warnings: string[];
}

const EPS = 1e-9;

export class Solver {
  constructor(
    readonly cfg: PlanConfig,
    readonly data: GameData = GAME,
  ) {}

  recipeFor(material: string): Recipe | null {
    const choice = this.cfg.recipeChoice[material] ?? DEFAULT_RECIPE_CHOICE[material];
    if (choice === EXTERNAL) return null;
    const options = this.data.recipesFor.get(material) ?? [];
    const mat = this.data.materials.get(material);
    if (options.length === 0 || (mat && !mat.craftable)) return null;
    return options.find((r) => r.id === choice) ?? options[0];
  }

  sparkFor(workstation: string): SparkType | null {
    const ws = this.data.workstations.get(workstation);
    if (ws && !ws.sparkPowered) return null;
    const id = this.cfg.stationSpark[workstation] ?? this.cfg.defaultSpark;
    return this.data.sparks.find((s) => s.id === id) ?? this.data.sparks[0];
  }

  craftsPerMinute(recipe: Recipe): number {
    const spark = this.sparkFor(recipe.workstation);
    const speed = spark ? spark.speed / 100 : 1;
    return (WORK_PER_MINUTE * speed) / recipe.buildTime;
  }

  outputPerMachine(material: string): number {
    const r = this.recipeFor(material);
    if (!r) return 0;
    const out = r.to.find((t) => t.material === material)?.amount ?? 0;
    return this.craftsPerMinute(r) * out;
  }

  private edgeCache = new Map<string, Edge[]>();

  /** What one unit of `material` costs in direct inputs and fuel. */
  edges(material: string): Edge[] {
    const hit = this.edgeCache.get(material);
    if (hit) return hit;
    const r = this.recipeFor(material);
    const result: Edge[] = [];
    if (r) {
      const out = r.to.find((t) => t.material === material)?.amount ?? 1;
      for (const f of r.from) result.push({ material: f.material, perUnit: f.amount / out, fuel: false });
      if (r.fuelRequired && this.cfg.fuel.perMinute > 0) {
        result.push({
          material: this.cfg.fuel.material,
          perUnit: this.cfg.fuel.perMinute / this.outputPerMachine(material),
          fuel: true,
        });
      }
    }
    this.edgeCache.set(material, result);
    return result;
  }

  targetRate(t: Target): number {
    if (!(t.value > 0)) return 0;
    if (t.mode === "machines") return t.value * this.outputPerMachine(t.material);
    return t.value;
  }

  /** Materials reachable from `roots` along input edges, skipping `excluded`. */
  private reachable(roots: string[], excluded: Set<string> = new Set()): string[] {
    const seen = new Set<string>();
    const stack = roots.filter((r) => !excluded.has(r));
    while (stack.length) {
      const m = stack.pop()!;
      if (seen.has(m)) continue;
      seen.add(m);
      for (const e of this.edges(m)) if (!seen.has(e.material) && !excluded.has(e.material)) stack.push(e.material);
    }
    return [...seen];
  }

  /** Solve (I - A) x = d over `nodes`. Throws if the loops never converge. */
  private solve(nodes: string[], demand: Map<string, number>): Map<string, number> {
    const n = nodes.length;
    const idx = new Map(nodes.map((m, i) => [m, i]));
    const M = nodes.map((_, i) => {
      const row = new Array<number>(n + 1).fill(0);
      row[i] = 1;
      row[n] = demand.get(nodes[i]) ?? 0;
      return row;
    });
    nodes.forEach((m, j) => {
      for (const e of this.edges(m)) {
        const i = idx.get(e.material);
        if (i !== undefined) M[i][j] -= e.perUnit;
      }
    });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) {
        throw new Error(`The production loop through "${nodes[c]}" consumes at least as much as it makes.`);
      }
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c || M[r][c] === 0) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return new Map(nodes.map((m, i) => [m, M[i][n] / M[i][i]]));
  }

  private grossCache = new Map<string, number>();

  /**
   * Gross units of `material` to produce per unit delivered, counting loops back into
   * `material` that do not pass through `ancestors` (those loops belong to an ancestor's node).
   */
  private grossFactor(material: string, ancestors: Set<string>): number {
    const key = `${material}|${[...ancestors].sort().join(",")}`;
    const hit = this.grossCache.get(key);
    if (hit !== undefined) return hit;
    const nodes = this.reachable([material], ancestors);
    const x = this.solve(nodes, new Map([[material, 1]])).get(material) ?? 1;
    this.grossCache.set(key, x);
    return x;
  }

  private buildTree(
    material: string,
    rate: number,
    id: string,
    ancestors: Set<string>,
    fuel: boolean,
    depth: number,
  ): TreeNode {
    const recipe = this.recipeFor(material);
    if (!recipe) {
      return { id, material, kind: "raw", rate, gross: rate, machines: 0, recipe: null, spark: null, fuel, children: [] };
    }
    const gross = rate * this.grossFactor(material, ancestors);
    const node: TreeNode = {
      id,
      material,
      kind: "craft",
      rate,
      gross,
      machines: gross / this.outputPerMachine(material),
      recipe,
      spark: this.sparkFor(recipe.workstation),
      fuel,
      children: [],
    };
    if (depth > 40) return node;
    const below = new Set(ancestors).add(material);
    for (const e of this.edges(material)) {
      const childRate = gross * e.perUnit;
      const childId = `${id}/${e.material}${e.fuel ? "~fuel" : ""}`;
      if (below.has(e.material)) {
        node.children.push({
          id: childId,
          material: e.material,
          kind: "loop",
          rate: childRate,
          gross: childRate,
          machines: 0,
          recipe: null,
          spark: null,
          fuel: e.fuel,
          children: [],
        });
      } else {
        node.children.push(this.buildTree(e.material, childRate, childId, below, e.fuel, depth + 1));
      }
    }
    return node;
  }

  plan(): Plan {
    const warnings: string[] = [];
    const demand = new Map<string, number>();
    for (const t of this.cfg.targets) {
      if (!this.data.materials.has(t.material)) continue;
      if (t.mode === "machines" && !this.recipeFor(t.material)) {
        warnings.push(`${this.name(t.material)} has no recipe selected, so set its target as a rate.`);
      }
      demand.set(t.material, (demand.get(t.material) ?? 0) + this.targetRate(t));
    }

    const nodes = this.reachable([...demand.keys()]);
    const gross = this.solve(nodes, demand);

    const materials = new Map<string, MaterialPlan>();
    for (const m of nodes) {
      const recipe = this.recipeFor(m);
      const g = Math.max(0, gross.get(m) ?? 0);
      const opm = this.outputPerMachine(m);
      const machines = recipe && opm > 0 ? g / opm : 0;
      materials.set(m, {
        material: m,
        recipe,
        spark: recipe ? this.sparkFor(recipe.workstation) : null,
        gross: g,
        targetRate: demand.get(m) ?? 0,
        machines,
        machinesBuilt: Math.ceil(machines - EPS),
        outputPerMachine: opm,
        inputs: this.edges(m).map((e) => ({ material: e.material, rate: g * e.perUnit, fuel: e.fuel })),
        consumers: [],
      });
    }
    for (const mp of materials.values()) {
      for (const f of mp.inputs) {
        materials.get(f.material)?.consumers.push({ material: mp.material, rate: f.rate, fuel: f.fuel });
      }
    }

    // Order: longest distance from a target first, so producers come after their consumers.
    const level = new Map<string, number>();
    const visit = (m: string, d: number, path: Set<string>) => {
      if (path.has(m) || (level.get(m) ?? -1) >= d) return;
      level.set(m, d);
      path.add(m);
      for (const e of this.edges(m)) visit(e.material, d + 1, path);
      path.delete(m);
    };
    for (const m of demand.keys()) visit(m, 0, new Set());
    const order = [...materials.keys()].sort(
      (a, b) => (level.get(a) ?? 0) - (level.get(b) ?? 0) || this.name(a).localeCompare(this.name(b)),
    );

    const byStation = new Map<string, StationSummary>();
    for (const m of order) {
      const mp = materials.get(m)!;
      if (!mp.recipe) continue;
      const ws = mp.recipe.workstation;
      const s = byStation.get(ws) ?? { workstation: ws, machinesExact: 0, machinesBuilt: 0, lines: [] };
      s.machinesExact += mp.machines;
      s.machinesBuilt += mp.machinesBuilt;
      s.lines.push(mp);
      byStation.set(ws, s);
    }
    const stations = [...byStation.values()].sort((a, b) => b.machinesBuilt - a.machinesBuilt);

    const cost = new Map<string, number>();
    for (const s of stations) {
      for (const c of this.data.workstations.get(s.workstation)?.cost ?? []) {
        cost.set(c.id, (cost.get(c.id) ?? 0) + c.amount * s.machinesBuilt);
      }
    }

    const trees = this.cfg.targets
      .filter((t) => this.data.materials.has(t.material))
      .map((t) => this.buildTree(t.material, this.targetRate(t), t.id, new Set(), false, 0));

    return {
      materials,
      order,
      rawInputs: order.map((m) => materials.get(m)!).filter((mp) => !mp.recipe),
      stations,
      buildCost: [...cost].map(([material, amount]) => ({ material, amount })),
      trees,
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
