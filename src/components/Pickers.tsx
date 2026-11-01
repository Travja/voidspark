import { GAME } from "../engine/data";
import { EXTERNAL, type Solver } from "../engine/solver";
import type { Action } from "../state";
import { displayName } from "./Icon";

export function MaterialPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Material">
      {GAME.categories.map((c) => {
        const mats = [...GAME.materials.values()].filter((m) => m.category === c.id);
        if (!mats.length) return null;
        return (
          <optgroup key={c.id} label={c.name}>
            {mats.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

/** Choose which recipe makes a material, or mark it as supplied externally. */
export function RecipePicker({
  material,
  solver,
  dispatch,
}: {
  material: string;
  solver: Solver;
  dispatch: (a: Action) => void;
}) {
  const options = GAME.recipesFor.get(material) ?? [];
  const mat = GAME.materials.get(material);
  if (!options.length || (mat && !mat.craftable)) return null;
  const current = solver.recipeFor(material)?.id ?? EXTERNAL;
  return (
    <select
      className="recipe-picker"
      value={current}
      title="Recipe used for this material"
      onChange={(e) => dispatch({ type: "chooseRecipe", material, recipe: e.target.value })}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((r) => (
        <option key={r.id} value={r.id}>
          {displayName(r.workstation)}: {r.from.length ? r.from.map((f) => `${f.amount} ${displayName(f.material)}`).join(" + ") : "harvest"}
        </option>
      ))}
      <option value={EXTERNAL}>Supply externally (raw input)</option>
    </select>
  );
}

export function SparkPicker({
  workstation,
  solver,
  dispatch,
  compact,
}: {
  workstation: string;
  solver: Solver;
  dispatch: (a: Action) => void;
  compact?: boolean;
}) {
  const ws = GAME.workstations.get(workstation);
  if (ws && !ws.sparkPowered) return <span className="muted small">no spark</span>;
  const override = solver.cfg.stationSpark[workstation] ?? "";
  const def = GAME.sparks.find((s) => s.id === solver.cfg.defaultSpark);
  return (
    <select
      className={compact ? "spark-picker compact" : "spark-picker"}
      value={override}
      title={`Spark working each ${displayName(workstation)}`}
      onChange={(e) => dispatch({ type: "stationSpark", workstation, spark: e.target.value || null })}
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">Default ({def?.name ?? "?"})</option>
      {GAME.sparks.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.speed}%)
        </option>
      ))}
    </select>
  );
}
