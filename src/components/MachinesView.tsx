import type { Plan, Solver } from "../engine/solver";
import { fmt } from "../format";
import { UNIT_FACTOR, type Action, type RateUnit } from "../state";
import { displayName, Icon } from "./Icon";
import { RecipePicker, SparkPicker } from "./Pickers";

interface Props {
  plan: Plan;
  solver: Solver;
  unit: RateUnit;
  dispatch: (a: Action) => void;
}

function FlowList({ flows, unit }: { flows: { material: string; rate: number; fuel: boolean }[]; unit: RateUnit }) {
  if (!flows.length) return <span className="muted">–</span>;
  return (
    <ul className="flows">
      {flows.map((f, i) => (
        <li key={`${f.material}${f.fuel}${i}`}>
          <Icon id={f.material} size={18} />
          {displayName(f.material)} <span className="rate">{fmt(f.rate * UNIT_FACTOR[unit])}</span>
          {f.fuel && <span title="as fuel"> 🔥</span>}
        </li>
      ))}
    </ul>
  );
}

export function MachinesView({ plan, solver, unit, dispatch }: Props) {
  if (!plan.stations.length) return <p className="muted">Nothing to build yet.</p>;
  const total = plan.stations.reduce((n, s) => n + s.machinesBuilt, 0);
  return (
    <div>
      <p className="muted small">
        {total} machines across {plan.stations.length} workstation types. Rates are per {unit}. A material with a
        target also shows its target rate.
      </p>
      {plan.stations.map((s) => (
        <section key={s.workstation} className="station">
          <header>
            <Icon id={s.workstation} size={36} />
            <h3>
              {s.machinesBuilt} × {displayName(s.workstation)}
            </h3>
            <span className="muted small">{fmt(s.machinesExact, 2)} exact</span>
            <span className="spacer" />
            <label className="small">
              Spark <SparkPicker workstation={s.workstation} solver={solver} dispatch={dispatch} />
            </label>
          </header>
          <table>
            <thead>
              <tr>
                <th>Makes</th>
                <th className="num">Machines</th>
                <th className="num">Load</th>
                <th className="num">Output</th>
                <th>Consumes</th>
                <th>Feeds</th>
                <th>Recipe</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.material}>
                  <td>
                    <span className="cell-mat">
                      <Icon id={l.material} size={24} /> {displayName(l.material)}
                    </span>
                  </td>
                  <td className="num">
                    <strong>{l.machinesBuilt}</strong> <span className="muted small">({fmt(l.machines, 2)})</span>
                  </td>
                  <td className="num">{l.machinesBuilt ? `${Math.round((l.machines / l.machinesBuilt) * 100)}%` : "–"}</td>
                  <td className="num">
                    {fmt(l.gross * UNIT_FACTOR[unit])}
                    {l.targetRate > 0 && (
                      <div className="muted small">target {fmt(l.targetRate * UNIT_FACTOR[unit])}</div>
                    )}
                  </td>
                  <td>
                    <FlowList flows={l.inputs} unit={unit} />
                  </td>
                  <td>
                    <FlowList flows={l.consumers} unit={unit} />
                  </td>
                  <td>
                    <RecipePicker material={l.material} solver={solver} dispatch={dispatch} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export function InputsView({ plan, solver, unit, dispatch }: Props) {
  return (
    <div className="two-col">
      <section className="card">
        <h3>Raw inputs</h3>
        <p className="muted small">Things you must harvest, supply, or deliver from elsewhere.</p>
        {plan.rawInputs.length === 0 && <p className="muted">None. Everything is crafted in the plan.</p>}
        <table>
          <tbody>
            {plan.rawInputs.map((r) => (
              <tr key={r.material}>
                <td>
                  <span className="cell-mat">
                    <Icon id={r.material} size={24} /> {displayName(r.material)}
                  </span>
                </td>
                <td className="num">
                  {fmt(r.gross * UNIT_FACTOR[unit])}/{unit}
                </td>
                <td>
                  <RecipePicker material={r.material} solver={solver} dispatch={dispatch} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h3>Build cost</h3>
        <p className="muted small">To place every machine in the Machines tab (rounded up).</p>
        <table>
          <tbody>
            {plan.buildCost.map((c) => (
              <tr key={c.material}>
                <td>
                  <span className="cell-mat">
                    <Icon id={c.material} size={24} /> {displayName(c.material)}
                  </span>
                </td>
                <td className="num">{fmt(c.amount, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
