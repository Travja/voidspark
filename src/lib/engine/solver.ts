/**
 * VoidSpark production solver.
 *
 * Model (checked against oddsparks.wiki.gg Template:Recipe):
 *   crafts/min per machine = 60 * crewSpeed / buildTime, capped by the station's craftCap.
 *   crewSpeed is the sum of the sparks working the station (Stumpy 1, Crafty 1.5, Handy 2.5).
 *   A fuelled station burns `fuel.perMinute` items of the chosen fuel per minute while running.
 *   Randomised outputs count at their expected value (amount * chance).
 *
 * The unknowns are crafts/min for each active recipe. Every active recipe is tied to one
 * "primary" material, and the net production of that material (all recipes' outputs, minus all
 * inputs and fuel) must equal its demand. That is a square linear system, so loops such as coal
 * fuelling coal furnaces, or Fertiliser Enrichment consuming fertiliser, need no special cases.
 * Byproducts are credited: when they already cover a material, that material's own recipe is
 * switched off (x = 0) and the extra is reported as surplus.
 */
import {
  expectedOutput,
  GAME,
  inputAmount,
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
  /** Units of `material` consumed per unit of the parent's output. */
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
  /** The material this recipe is run for. */
  primary: string;
  crew: SparkType[];
  /** Crafts per minute across all machines. */
  crafts: number;
  craftsPerMachine: number;
  /** Exact machines needed (fractional). */
  machines: number;
  /** Machines to build (ceil). */
  machinesBuilt: number;
  inputs: Flow[];
  outputs: Flow[];
}

export interface MaterialPlan {
  material: string;
  /** Recipe chosen for this material (may be idle if byproducts cover it). */
  recipe: Recipe | null;
  produced: number;
  consumed: number;
  /** Items/min asked for directly by targets. */
  targetRate: number;
  /** Items/min that must come from outside the plan. */
  supplied: number;
  /** Items/min made but not used. */
  surplus: number;
  /** Fraction of production that comes from this material's own recipe (rest: byproducts). */
  ownShare: number;
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
   * craft: made by its recipe. raw: supplied from outside. loop: fed back from further up the
   * tree. byproduct: covered by another recipe's extra output.
   */
  kind: "craft" | "raw" | "loop" | "byproduct";
  /** Items/min this node delivers to its parent (or to the target, for roots). */
  rate: number;
  /** Items/min the machines in this branch make, including the loop-back share. */
  gross: number;
  machines: number;
  recipe: Recipe | null;
  crew: SparkType[];
  fuel: boolean;
  /** Items/min of `rate` covered by byproducts made elsewhere in the plan. */
  fromByproducts: number;
  /** Other outputs this branch's machines make. */
  byproducts: Flow[];
  children: TreeNode[];
  /** Inputs not expanded because the tree hit its size limit. */
  truncated?: boolean;
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
  warnings: string[];
}

const EPS = 1e-9;
/** Tree size limits; see buildTrees. */
const TREE_NODE_BUDGET = 1500;
const TREE_MAX_DEPTH = 30;

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

  /** Net units of `material` per craft of `recipe` (outputs minus inputs and fuel). */
  private net(recipe: Recipe, material: string): number {
    let n = expectedOutput(recipe, material) - inputAmount(recipe, material);
    if (material === this.cfg.fuel.material) n -= this.fuelPerCraft(recipe);
    return n;
  }

  /** Inputs (with fuel) per craft of `recipe`. */
  private craftInputs(recipe: Recipe): Edge[] {
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

  // --- global solve ------------------------------------------------------------------------------

  /** Recipes needed for the targets, each tied to the first material that pulled it in. */
  private activeRecipes(roots: string[]): Map<string, string> {
    const primary = new Map<string, string>();
    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length) {
      const m = queue.shift()!;
      if (seen.has(m)) continue;
      seen.add(m);
      const r = this.recipeFor(m);
      if (!r) continue;
      if (!primary.has(r.id)) primary.set(r.id, m);
      for (const e of this.craftInputs(r)) queue.push(e.material);
    }
    return primary;
  }

  private solveLinear(M: number[][], b: number[]): number[] {
    const n = b.length;
    const A = M.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) throw new SingularError(c);
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < n; r++) {
        if (r === c || A[r][c] === 0) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((row, i) => row[n] / row[i]);
  }

  private solveRates(demand: Map<string, number>): { rates: Map<string, number>; primary: Map<string, string> } {
    const primary = this.activeRecipes([...demand.keys()]);
    const ids = [...primary.keys()];
    const recipes = ids.map((id) => this.data.recipesById.get(id)!);
    const off = new Set<string>();
    let x: number[] = [];

    const balance = (m: string) =>
      recipes.reduce((n, r, j) => n + this.net(r, m) * (x[j] ?? 0), 0) - (demand.get(m) ?? 0);

    for (let iter = 0; iter < 60; iter++) {
      const M = recipes.map((_, i) =>
        off.has(ids[i]) ? recipes.map((__, j) => (i === j ? 1 : 0)) : recipes.map((r) => this.net(r, primary.get(ids[i])!)),
      );
      const b = recipes.map((_, i) => (off.has(ids[i]) ? 0 : (demand.get(primary.get(ids[i])!) ?? 0)));
      try {
        x = this.solveLinear(M, b);
      } catch (e) {
        if (!(e instanceof SingularError)) throw e;
        throw new Error(
          `Can't balance ${this.name(primary.get(ids[e.column])!)}: its production loop consumes at least as much as it makes. Pick a different recipe or supply it externally.`,
        );
      }
      let changed = false;
      // Byproducts already cover a material: switch its recipe off.
      x.forEach((v, j) => {
        if (v < -EPS && !off.has(ids[j])) {
          off.add(ids[j]);
          changed = true;
        }
      });
      // A switched-off recipe whose material ran short again: switch it back on.
      for (const id of off) {
        if (balance(primary.get(id)!) < -1e-7) {
          off.delete(id);
          changed = true;
        }
      }
      // A recipe chosen for several of its outputs: let the most demanding one drive it.
      for (const [j, r] of recipes.entries()) {
        if (off.has(ids[j])) continue;
        for (const t of r.to) {
          if (t.material === primary.get(ids[j]) || this.recipeFor(t.material)?.id !== r.id) continue;
          if (balance(t.material) < -1e-7) {
            primary.set(ids[j], t.material);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return { rates: new Map(ids.map((id, j) => [id, Math.max(0, x[j] ?? 0)])), primary };
  }

  // --- tree ------------------------------------------------------------------------------------

  private ownShare = new Map<string, number>();

  /** Inputs per unit of `material` made by its own recipe, scaled by its own share of supply. */
  private treeEdges(material: string): Edge[] {
    const r = this.recipeFor(material);
    const share = this.ownShare.get(material) ?? 0;
    if (!r || share <= 0) return [];
    const out = expectedOutput(r, material);
    return this.craftInputs(r).map((e) => ({ ...e, perUnit: (e.perUnit / out) * share }));
  }

  /** Strongly connected components of the tree graph: materials that can loop into each other. */
  private sccOf = new Map<string, number>();

  private computeSccs(materials: Iterable<string>) {
    // Tarjan's algorithm.
    let index = 0;
    let comp = 0;
    const idx = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const visit = (v: string) => {
      idx.set(v, index);
      low.set(v, index++);
      stack.push(v);
      onStack.add(v);
      for (const e of this.treeEdges(v)) {
        const w = e.material;
        if (!idx.has(w)) {
          visit(w);
          low.set(v, Math.min(low.get(v)!, low.get(w)!));
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
      if (low.get(v) === idx.get(v)) {
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          this.sccOf.set(w, comp);
        } while (w !== v);
        comp++;
      }
    };
    for (const m of materials) if (!idx.has(m)) visit(m);
  }

  private grossCache = new Map<string, number>();

  /**
   * Gross units of `material` to make per unit delivered, counting loops back into `material`
   * that do not pass through `ancestors` (those belong to an ancestor's node). Only materials in
   * the same loop group (strongly connected component) can feed back, so the solve is limited to
   * that group, and so is the cache key.
   */
  private grossFactor(material: string, ancestors: Set<string>): number {
    const comp = this.sccOf.get(material);
    const group = [...this.sccOf].filter(([, c]) => c === comp).map(([m]) => m);
    const selfLoop = this.treeEdges(material).some((e) => e.material === material);
    if (group.length === 1 && !selfLoop) return 1;
    const blocked = group.filter((m) => ancestors.has(m)).sort();
    const key = `${material}|${blocked.join(",")}`;
    const hit = this.grossCache.get(key);
    if (hit !== undefined) return hit;
    const nodes = group.filter((m) => !ancestors.has(m));
    const idx = new Map(nodes.map((m, i) => [m, i]));
    const M = nodes.map((_, i) => nodes.map((__, j) => (i === j ? 1 : 0)));
    nodes.forEach((m, j) => {
      for (const e of this.treeEdges(m)) {
        const i = idx.get(e.material);
        if (i !== undefined) M[i][j] -= e.perUnit;
      }
    });
    let x = 1;
    try {
      x = this.solveLinear(M, nodes.map((m) => (m === material ? 1 : 0)))[idx.get(material)!];
    } catch {
      x = 1;
    }
    this.grossCache.set(key, x);
    return x;
  }

  /**
   * Build the trees breadth-first with a node budget. The 1.0 recipe graph is dense enough that
   * fully expanding every path explodes, so past the budget nodes are left collapsed (truncated).
   */
  private buildTrees(roots: { material: string; rate: number; id: string }[]): TreeNode[] {
    type Job = { node: TreeNode; ancestors: Set<string>; depth: number };
    let budget = TREE_NODE_BUDGET;
    const queue: Job[] = [];
    const trees = roots.map((r) => {
      const node = this.makeNode(r.material, r.rate, r.id, false);
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
      const crafts = node.gross / expectedOutput(node.recipe, node.material);
      for (const e of this.craftInputs(node.recipe)) {
        const rate = crafts * e.perUnit;
        const id = `${node.id}/${e.material}${e.fuel ? "~fuel" : ""}`;
        budget--;
        if (below.has(e.material)) {
          node.children.push({ ...this.emptyNode(id, e.material, rate, e.fuel), kind: "loop" });
        } else {
          const child = this.makeNode(e.material, rate, id, e.fuel, below);
          node.children.push(child);
          queue.push({ node: child, ancestors: below, depth: depth + 1 });
        }
      }
    }
    return trees;
  }

  private emptyNode(id: string, material: string, rate: number, fuel: boolean): TreeNode {
    return {
      id,
      material,
      kind: "raw",
      rate,
      gross: rate,
      machines: 0,
      recipe: null,
      crew: [],
      fuel,
      fromByproducts: 0,
      byproducts: [],
      children: [],
    };
  }

  private makeNode(material: string, rate: number, id: string, fuel: boolean, ancestors = new Set<string>()): TreeNode {
    const base = this.emptyNode(id, material, rate, fuel);
    const recipe = this.recipeFor(material);
    const share = this.ownShare.get(material) ?? (recipe ? 1 : 0);
    if (!recipe) return base;
    if (share <= EPS) return { ...base, kind: "byproduct", recipe };
    const made = rate * share;
    const gross = made * this.grossFactor(material, ancestors);
    const crafts = gross / expectedOutput(recipe, material);
    return {
      ...base,
      kind: "craft",
      gross,
      machines: crafts / this.craftsPerMinute(recipe),
      recipe,
      crew: this.crewFor(recipe.workstation),
      fromByproducts: rate - made,
      byproducts: recipe.to
        .filter((t) => t.material !== material)
        .map((t) => ({ material: t.material, rate: crafts * t.amount * (t.chance ?? 1), fuel: false })),
    };
  }

  // --- plan --------------------------------------------------------------------------------------

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

    const { rates, primary } = this.solveRates(demand);

    const recipes = new Map<string, RecipePlan>();
    for (const [id, crafts] of rates) {
      const recipe = this.data.recipesById.get(id)!;
      const cpm = this.craftsPerMinute(recipe);
      const machines = crafts / cpm;
      recipes.set(id, {
        recipe,
        primary: primary.get(id)!,
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
          supplied: 0,
          surplus: 0,
          ownShare: 0,
          producers: [],
          consumers: [],
        };
        materials.set(m, mp);
      }
      return mp;
    };
    for (const m of demand.keys()) mat(m);
    for (const rp of recipes.values()) {
      if (rp.crafts <= EPS) continue;
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
      const balance = mp.produced - mp.consumed - mp.targetRate;
      if (balance < -1e-7) mp.supplied = -balance;
      else if (balance > 1e-7) mp.surplus = balance;
      const own = mp.recipe ? recipes.get(mp.recipe.id) : undefined;
      const ownMade = own && own.primary === mp.material ? own.crafts * expectedOutput(own.recipe, mp.material) : 0;
      mp.ownShare = mp.produced > EPS ? Math.min(1, ownMade / mp.produced) : mp.recipe ? 1 : 0;
      this.ownShare.set(mp.material, mp.ownShare);
      if (mp.recipe && mp.supplied > 1e-7) {
        warnings.push(`${this.name(mp.material)} is short by ${+mp.supplied.toFixed(3)}/min; supply the rest externally.`);
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
    const recipeOrder = [...recipes.values()]
      .filter((rp) => rp.crafts > EPS)
      .sort((a, b) => (level.get(a.primary) ?? 99) - (level.get(b.primary) ?? 99));
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
      for (const c of this.data.workstations.get(s.workstation)?.cost ?? []) {
        cost.set(c.id, (cost.get(c.id) ?? 0) + c.amount * s.machinesBuilt);
      }
    }

    this.computeSccs(materials.keys());
    const trees = this.buildTrees(
      this.cfg.targets
        .filter((t) => this.data.materials.has(t.material))
        .map((t) => ({ material: t.material, rate: this.targetRate(t), id: t.id })),
    );

    return {
      materials,
      recipes,
      order,
      rawInputs: order.map((m) => materials.get(m)!).filter((mp) => mp.supplied > 1e-7),
      surplus: order.map((m) => materials.get(m)!).filter((mp) => mp.surplus > 1e-7),
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

class SingularError extends Error {
  constructor(readonly column: number) {
    super("singular");
  }
}

export function makePlan(cfg: PlanConfig, data: GameData = GAME): Plan {
  return new Solver(cfg, data).plan();
}
