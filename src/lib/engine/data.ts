import raw from "../data/oddsparks_0_2.json";

export interface Amount {
  material: string;
  amount: number;
}

export interface Recipe {
  id: string;
  name: string;
  workstation: string;
  /** Work units per craft. One spark at 100% speed does 2 work units per second. */
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
  /** False for stations that run without a spark working them, e.g. the miasma collector. */
  sparkPowered: boolean;
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

/** Workstations that are not driven by a spark (rate is unaffected by spark speed). */
const NOT_SPARK_POWERED = new Set(["miasma-collector"]);

/** One work unit per half second at 100% speed: crafts/min = WORK_PER_MINUTE * speed / buildTime. */
export const WORK_PER_MINUTE = 120;

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
    json.workstation.map((w) => [w.id, { ...w, sparkPowered: !NOT_SPARK_POWERED.has(w.id) }]),
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
