import { GAME, type SparkType } from "../engine/data";

export interface CrewOption {
  key: string;
  ids: string[];
  label: string;
  speed: number;
}

const crewKey = (ids: string[]) => ids.join("+");

/** Every crew of 1..slots sparks, as unordered combinations, slowest first. */
export function crewOptions(slots: number): CrewOption[] {
  const out: CrewOption[] = [];
  const sparks = GAME.sparks;
  const walk = (start: number, picked: SparkType[]) => {
    if (picked.length) {
      const ids = picked.map((s) => s.id);
      const speed = picked.reduce((n, s) => n + s.speed / 100, 0);
      out.push({ key: crewKey(ids), ids, label: `${crewLabel(picked)} (${+speed.toFixed(2)}×)`, speed });
    }
    if (picked.length === slots) return;
    for (let i = start; i < sparks.length; i++) walk(i, [...picked, sparks[i]]);
  };
  walk(0, []);
  return out.sort((a, b) => a.speed - b.speed || a.ids.length - b.ids.length);
}

/** "2 Crafty", "Stumpy + Crafty". */
export function crewLabel(crew: SparkType[]): string {
  const counts = new Map<string, number>();
  for (const s of crew) counts.set(s.name.replace(/ Spark$/, ""), (counts.get(s.name.replace(/ Spark$/, "")) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${c} ${n}` : n)).join(" + ");
}

/** Canonical key for a list of spark ids, matching crewOptions ordering. */
export function normalizeCrewKey(ids: string[]): string {
  const order = new Map(GAME.sparks.map((s, i) => [s.id, i]));
  return crewKey([...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
}
