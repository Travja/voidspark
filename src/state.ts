import { useEffect, useReducer } from "react";
import { GAME } from "./engine/data";
import type { PlanConfig, Target } from "./engine/solver";

export type RateUnit = "sec" | "min" | "hr";
export const UNIT_FACTOR: Record<RateUnit, number> = { sec: 1 / 60, min: 1, hr: 60 };

export interface AppState extends PlanConfig {
  unit: RateUnit;
  view: "tree" | "machines" | "inputs";
}

const STORAGE_KEY = "voidspark:v1";

let nextId = 1;
export const newTargetId = () => `t${Date.now().toString(36)}${nextId++}`;

const initial: AppState = {
  targets: [{ id: "t0", material: "crafty-spark-block", mode: "rate", value: 1 }],
  recipeChoice: {},
  defaultSpark: "spark-crafty",
  stationSpark: {},
  fuel: { material: "wooden-log", perMinute: GAME.fuels.find((f) => f.id === "wooden-log")!.perMinute },
  unit: "min",
  view: "tree",
};

function load(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && Array.isArray(saved.targets)) return { ...initial, ...saved };
  } catch {
    /* storage unavailable */
  }
  return initial;
}

export type Action =
  | { type: "set"; patch: Partial<AppState> }
  | { type: "addTarget"; material: string }
  | { type: "updateTarget"; id: string; patch: Partial<Target> }
  | { type: "removeTarget"; id: string }
  | { type: "chooseRecipe"; material: string; recipe: string }
  | { type: "stationSpark"; workstation: string; spark: string | null }
  | { type: "reset" };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "set":
      return { ...s, ...a.patch };
    case "addTarget":
      return { ...s, targets: [...s.targets, { id: newTargetId(), material: a.material, mode: "rate", value: 1 }] };
    case "updateTarget":
      return { ...s, targets: s.targets.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) };
    case "removeTarget":
      return { ...s, targets: s.targets.filter((t) => t.id !== a.id) };
    case "chooseRecipe":
      return { ...s, recipeChoice: { ...s.recipeChoice, [a.material]: a.recipe } };
    case "stationSpark": {
      const stationSpark = { ...s.stationSpark };
      if (a.spark === null) delete stationSpark[a.workstation];
      else stationSpark[a.workstation] = a.spark;
      return { ...s, stationSpark };
    }
    case "reset":
      return initial;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);
  return [state, dispatch] as const;
}
