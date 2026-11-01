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
  defaultSpark: "spark-crafty",
  stationSpark: {},
  fuel: { material: "wooden-log", perMinute: GAME.fuels.find((f) => f.id === "wooden-log")!.perMinute },
  unit: "min",
  view: "tree",
});

function load(): AppConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && Array.isArray(saved.targets)) return { ...defaults(), ...saved };
  } catch {
    /* storage unavailable */
  }
  return defaults();
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

  addTarget(material: string) {
    this.cfg.targets.push({ id: newTargetId(), material, mode: "rate", value: 1 });
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

  setStationSpark(workstation: string, spark: string | null) {
    if (spark === null) delete this.cfg.stationSpark[workstation];
    else this.cfg.stationSpark[workstation] = spark;
  }

  clearOverrides() {
    this.cfg.stationSpark = {};
    this.cfg.recipeChoice = {};
  }
}
