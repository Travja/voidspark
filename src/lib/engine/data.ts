import raw from "../data/oddsparks.json";

export interface Amount {
  material: string;
  amount: number;
}

export interface Output extends Amount {
  /** Probability of this output per craft (randomised recipes). Absent means always. */
  chance?: number;
}

export interface Recipe {
  id: string;
  name: string;
  workstation: string;
  /** Seconds per craft with one Stumpy Spark working the station (the wiki's `duration`). */
  buildTime: number;
  fuelRequired: boolean;
  from: Amount[];
  to: Output[];
  /**
   * Growth cycles (greenhouse / arboretum). Each cycle takes `buildTime` and uses the inputs in
   * `from`; the products in `to` only come out once all the cycles are done (wiki Template:Recipe,
   * confirmed in game). So one batch of Leafy Growth (64 s, 10 cycles) takes 640 s with one Stumpy
   * and uses 40 Leaves + 20 Fertiliser for 10 Leaf Knots.
   */
  cycles?: number;
  /** Preferred temperature from the wiki. Not modelled. */
  temperature?: string;
  /** Wiki page the recipe was imported from. */
  source?: string;
}

export interface Material {
  id: string;
  name: string;
  category: string;
  craftable: boolean;
  /** Recipe used unless the player picks another. null: supplied externally by default. */
  defaultRecipe?: string | null;
  /**
   * Produced in place by a world site (Miasma by Noxious Coral) and used by the building on it,
   * rather than crafted or carried in.
   */
  siteResource?: { site: string; perMinute: number };
  /** Items per stack (wiki infobox, with importer overrides). */
  stack?: number;
}

export interface Workstation {
  id: string;
  name: string;
  category: string;
  cost: { id: string; amount: number }[];
  /** False for stations that run without a spark working them (e.g. the Arboretum). */
  sparkPowered: boolean;
  /** How many sparks can work the station at once. Their speeds add up. */
  sparkSlots: number;
  /** Hard limit on crafts per minute regardless of crew, e.g. a supply-limited collector. */
  craftCap?: number;
  /** World site each machine must be built on (e.g. "Giant Tree"), one site per machine. */
  site?: string;
}

export interface SparkType {
  id: string;
  name: string;
  /** Material id of the spark block, used for its icon. */
  block: string;
  /** Work speed in percent. 100 = Stumpy. */
  speed: number;
}

export interface FuelOption {
  id: string;
  name: string;
  /** Items burnt per minute by one fuelled workstation. */
  perMinute: number;
}

export interface GameData {
  version: string;
  materials: Map<string, Material>;
  workstations: Map<string, Workstation>;
  recipes: Recipe[];
  recipesById: Map<string, Recipe>;
  /** Recipes that produce a material, best first (the default recipe leads). */
  recipesFor: Map<string, Recipe[]>;
  sparks: SparkType[];
  fuels: FuelOption[];
  categories: { id: string; name: string }[];
}

/**
 * crafts/min = SECONDS_PER_MINUTE * crewSpeed / buildTime, where crewSpeed sums the speed
 * multipliers of the sparks at the station (Stumpy 1, Crafty 1.5, Handy 2.5). This matches the
 * wiki's Template:Recipe calculator. PirateSpark's `120 * speed / buildTime` is the same formula
 * with two identical sparks at every station.
 */
export const SECONDS_PER_MINUTE = 60;

/**
 * Sparks per station. The wiki's recipe calculator offers crews of up to two sparks for every
 * recipe, and the Furnace infobox lists "2 x 1 Spark" slots.
 */
export const DEFAULT_SPARK_SLOTS = 2;

/** Cycles per batch: how many crafts it takes before the products come out. */
export const cyclesOf = (recipe: Recipe) => (recipe.cycles && recipe.cycles > 1 ? recipe.cycles : 1);

/**
 * Expected units of one output per craft, counting the chance of randomised outputs. The solver
 * counts a growth recipe's cycles as its crafts, so a batch's products are spread over its cycles.
 */
export const outputPerCraft = (recipe: Recipe, out: Output) => (out.amount * (out.chance ?? 1)) / cyclesOf(recipe);

/** Expected units of `material` per craft (per cycle, for growth recipes). */
export function expectedOutput(recipe: Recipe, material: string): number {
  return recipe.to.reduce((n, t) => (t.material === material ? n + outputPerCraft(recipe, t) : n), 0);
}

export function inputAmount(recipe: Recipe, material: string): number {
  return recipe.from.reduce((n, f) => (f.material === material ? n + f.amount : n), 0);
}

interface RawData {
  version: string;
  spark: SparkType[];
  category: { id: string; name: string }[];
  workstation: {
    id: string;
    name: string;
    category: string;
    cost: { id: string; amount: number }[];
    sparkPowered?: boolean;
    sparkSlots?: number;
    craftCap?: number;
    site?: string;
  }[];
  process: Recipe[];
  material: Material[];
  fuel: { id: string; name: string; amount: number }[];
}

export function loadGameData(json: RawData = raw as RawData): GameData {
  const materials = new Map(json.material.map((m) => [m.id, m]));
  const workstations = new Map<string, Workstation>(
    json.workstation.map((w) => [
      w.id,
      {
        ...w,
        sparkPowered: w.sparkPowered ?? true,
        sparkSlots: w.sparkSlots ?? DEFAULT_SPARK_SLOTS,
      },
    ]),
  );
  const recipesFor = new Map<string, Recipe[]>();
  for (const r of json.process) {
    for (const t of r.to) {
      const list = recipesFor.get(t.material) ?? [];
      if (!list.includes(r)) list.push(r);
      recipesFor.set(t.material, list);
    }
  }
  // Default recipe first, then recipes where the material is the main output, then byproducts.
  for (const [m, list] of recipesFor) {
    const def = materials.get(m)?.defaultRecipe;
    const rank = (r: Recipe) => (r.id === def ? 0 : r.to[0].material === m ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b));
  }
  return {
    version: json.version,
    materials,
    workstations,
    recipes: json.process,
    recipesById: new Map(json.process.map((r) => [r.id, r])),
    recipesFor,
    sparks: json.spark,
    fuels: json.fuel.map((f) => ({ id: f.id, name: f.name, perMinute: f.amount })),
    categories: json.category,
  };
}

export const GAME = loadGameData();
