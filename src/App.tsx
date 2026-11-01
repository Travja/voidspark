import { useMemo } from "react";
import { GAME } from "./engine/data";
import { Solver, type Plan } from "./engine/solver";
import { Icon } from "./components/Icon";
import { InputsView, MachinesView } from "./components/MachinesView";
import { MaterialPicker } from "./components/Pickers";
import { TreeView } from "./components/TreeView";
import { UNIT_FACTOR, useAppState, type RateUnit } from "./state";

export default function App() {
  const [state, dispatch] = useAppState();
  const solver = useMemo(() => new Solver(state), [state]);
  const result = useMemo((): { plan: Plan } | { error: string } => {
    try {
      return { plan: solver.plan() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [solver]);
  const u = UNIT_FACTOR[state.unit];

  return (
    <div className="app">
      <header className="top">
        <Icon id="crafty-spark-block" size={36} />
        <div>
          <h1>VoidSpark</h1>
          <div className="muted small">Oddsparks production planner · game data v{GAME.version}</div>
        </div>
      </header>

      <div className="layout">
        <aside>
          <section className="card">
            <h2>Targets</h2>
            {state.targets.map((t) => {
              const canMachines = !!solver.recipeFor(t.material);
              return (
                <div key={t.id} className="target">
                  <Icon id={t.material} size={30} />
                  <MaterialPicker
                    value={t.material}
                    onChange={(material) => dispatch({ type: "updateTarget", id: t.id, patch: { material } })}
                  />
                  <div className="target-row">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label="Amount"
                      value={t.mode === "rate" ? +(t.value * u).toPrecision(6) : t.value}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        dispatch({ type: "updateTarget", id: t.id, patch: { value: t.mode === "rate" ? v / u : v } });
                      }}
                    />
                    <select
                      aria-label="Target type"
                      value={t.mode}
                      onChange={(e) => {
                        const mode = e.target.value as "rate" | "machines";
                        const value = mode === t.mode ? t.value : mode === "rate" ? solver.targetRate(t) : t.value / (solver.outputPerMachine(t.material) || 1);
                        dispatch({ type: "updateTarget", id: t.id, patch: { mode, value: +value.toPrecision(6) } });
                      }}
                    >
                      <option value="rate">items / {state.unit}</option>
                      <option value="machines" disabled={!canMachines}>
                        machines
                      </option>
                    </select>
                    <button className="icon-btn" aria-label="Remove target" onClick={() => dispatch({ type: "removeTarget", id: t.id })}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
            <button onClick={() => dispatch({ type: "addTarget", material: "sawn-timber" })}>+ Add target</button>
          </section>

          <section className="card">
            <h2>Settings</h2>
            <label>
              Rate unit
              <select value={state.unit} onChange={(e) => dispatch({ type: "set", patch: { unit: e.target.value as RateUnit } })}>
                <option value="sec">per second</option>
                <option value="min">per minute</option>
                <option value="hr">per hour</option>
              </select>
            </label>
            <label>
              Default spark at workstations
              <select value={state.defaultSpark} onChange={(e) => dispatch({ type: "set", patch: { defaultSpark: e.target.value } })}>
                {GAME.sparks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.speed}% speed)
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              You can override the spark per workstation type from the tree or the Machines tab.
            </p>
            <label>
              Fuel
              <select
                value={state.fuel.material}
                onChange={(e) => {
                  const f = GAME.fuels.find((x) => x.id === e.target.value)!;
                  dispatch({ type: "set", patch: { fuel: { material: f.id, perMinute: f.perMinute } } });
                }}
              >
                {GAME.fuels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.perMinute}/min per machine)
                  </option>
                ))}
              </select>
            </label>
            {Object.keys(state.stationSpark).length + Object.keys(state.recipeChoice).length > 0 && (
              <button
                onClick={() => dispatch({ type: "set", patch: { stationSpark: {}, recipeChoice: {} } })}
                title="Clear per-station spark overrides and recipe choices"
              >
                Clear overrides
              </button>
            )}
          </section>
        </aside>

        <main>
          <nav className="tabs">
            {(["tree", "machines", "inputs"] as const).map((v) => (
              <button key={v} className={state.view === v ? "active" : ""} onClick={() => dispatch({ type: "set", patch: { view: v } })}>
                {v === "tree" ? "Production tree" : v === "machines" ? "Machines" : "Inputs & cost"}
              </button>
            ))}
          </nav>
          {"error" in result ? (
            <div className="error">{result.error}</div>
          ) : (
            <>
              {result.plan.warnings.map((w) => (
                <div key={w} className="warning">
                  {w}
                </div>
              ))}
              {state.view === "tree" && <TreeView trees={result.plan.trees} solver={solver} unit={state.unit} dispatch={dispatch} />}
              {state.view === "machines" && <MachinesView plan={result.plan} solver={solver} unit={state.unit} dispatch={dispatch} />}
              {state.view === "inputs" && <InputsView plan={result.plan} solver={solver} unit={state.unit} dispatch={dispatch} />}
            </>
          )}
        </main>
      </div>
      <footer className="muted small">
        Built on the recovered <a href="https://github.com/Travja/voidspark/tree/master/legacy/piratespark">PirateSpark</a> data
        and model. Recipes match game version {GAME.version} and may be out of date.
      </footer>
    </div>
  );
}
