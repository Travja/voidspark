import raw from "../data/oddsparks_0_2.json";

export interface Amount {
  material: string;
  amount: number;
}

export interface Recipe {
  id: string;
  name: string;
  workstation: string;
  /** Seconds per craft with one Stumpy Spark working the station (the wiki's `duration`). */
  buildTime: number;
  fuelRequired: boolean;
  from: Amount[];
  to: Amount[];
}

export interface Material {
  id: string;
  name: string;
  category: string;
  craftable: boolean;
}

export interface Workstation {
  id: string;
  name: string;
  category: string;
  cost: { id: string; amount: number }[];
  /** False for stations that run without a spark working them. */
  sparkPowered: boolean;
  /** How many sparks can work the station at once. Their speeds add up. */
  sparkSlots: number;
  /** Hard limit on crafts per minute regardless of crew, e.g. a supply-limited collector. */
  craftCap?: number;
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
  /** Recipes that produce a material, in data-file order. */
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

/** Workstations that are not driven by a spark (none known in the current data). */
const NOT_SPARK_POWERED = new Set<string>();

/**
 * Supply caps. Miasma Collector: miasma arrives at 15/min and a craft uses 2, so at most 7.5
 * crafts/min ("production is capped to 8 seconds", oddsparks.wiki.gg/wiki/Miasma_Collector).
 */
const CRAFT_CAP: Record<string, number> = { "miasma-collector": 7.5 };

interface RawData {
  version: string;
  spark: { id: string; name: string; block: string; speed: number }[];
  category: { id: string; name: string }[];
  workstation: { id: string; name: string; category: string; cost: { id: string; amount: number }[] }[];
  process: Recipe[];
  material: Material[];
  fuel: { id: string; name: string; amount: number }[];
}

export function loadGameData(json: RawData = raw as RawData): GameData {
  const materials = new Map(json.material.map((m) => [m.id, m]));
  const workstations = new Map(
    json.workstation.map((w) => [
      w.id,
      {
        ...w,
        sparkPowered: !NOT_SPARK_POWERED.has(w.id),
        sparkSlots: DEFAULT_SPARK_SLOTS,
        craftCap: CRAFT_CAP[w.id],
      },
    ]),
  );
  const recipesFor = new Map<string, Recipe[]>();
  for (const r of json.process) {
    for (const t of r.to) {
      const list = recipesFor.get(t.material) ?? [];
      list.push(r);
      recipesFor.set(t.material, list);
    }
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
