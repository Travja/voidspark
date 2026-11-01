import { useState } from "react";
import type { Solver, TreeNode } from "../engine/solver";
import { fmt } from "../format";
import type { Action, RateUnit } from "../state";
import { UNIT_FACTOR } from "../state";
import { displayName, Icon } from "./Icon";
import { RecipePicker, SparkPicker } from "./Pickers";

interface Props {
  trees: TreeNode[];
  solver: Solver;
  unit: RateUnit;
  dispatch: (a: Action) => void;
}

function collectIds(n: TreeNode, out: string[] = []) {
  if (n.children.length) out.push(n.id);
  n.children.forEach((c) => collectIds(c, out));
  return out;
}

export function TreeView({ trees, solver, unit, dispatch }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!trees.length) return <p className="muted">Add a target to see its production tree.</p>;

  return (
    <div>
      <div className="toolbar">
        <button onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button onClick={() => setCollapsed(new Set(trees.flatMap((t) => collectIds(t).filter((id) => id !== t.id))))}>
          Collapse to targets
        </button>
        <span className="muted small">
          Each row feeds the row it hangs from. Machine counts are for that branch only. The Machines tab has the
          combined totals.
        </span>
      </div>
      <ul className="tree root">
        {trees.map((t) => (
          <Branch key={t.id} node={t} solver={solver} unit={unit} dispatch={dispatch} collapsed={collapsed} toggle={toggle} />
        ))}
      </ul>
    </div>
  );
}

function Branch({
  node,
  solver,
  unit,
  dispatch,
  collapsed,
  toggle,
}: Omit<Props, "trees"> & { node: TreeNode; collapsed: Set<string>; toggle: (id: string) => void }) {
  const isCollapsed = collapsed.has(node.id);
  const u = UNIT_FACTOR[unit];
  const rateText = `${fmt(node.rate * u)}/${unit}`;
  const built = Math.ceil(node.machines - 1e-9);

  return (
    <li className={`branch kind-${node.kind}${node.fuel ? " is-fuel" : ""}`}>
      <div className="node">
        <button
          className="twisty"
          disabled={!node.children.length}
          onClick={() => toggle(node.id)}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {node.children.length ? (isCollapsed ? "▸" : "▾") : ""}
        </button>
        <Icon id={node.material} size={32} />
        <div className="node-main">
          <div className="node-title">
            <strong>{displayName(node.material)}</strong>
            <span className="rate">{rateText}</span>
            {node.fuel && <span className="tag fuel" title="Burnt as fuel">🔥 fuel</span>}
            {node.kind === "raw" && <span className="tag raw">raw input</span>}
            {node.kind === "loop" && (
              <span className="tag loop" title="Taken from the production of this material further up the tree">
                ↻ loops back up the tree
              </span>
            )}
            {node.kind === "craft" && Math.abs(node.gross - node.rate) > 1e-6 && (
              <span className="muted small" title="Gross output including what gets fed back into the loop">
                (makes {fmt(node.gross * u)}/{unit})
              </span>
            )}
          </div>
          {node.kind === "craft" && node.recipe && (
            <div className="node-machine">
              <Icon id={node.recipe.workstation} size={22} />
              <span className="machines" title={`${fmt(node.machines, 3)} exact`}>
                {built} × {displayName(node.recipe.workstation)}
              </span>
              <span className="muted small">({fmt(node.machines, 2)} exact)</span>
              {node.spark && <Icon id={node.spark.block} size={18} title={`${node.spark.name} · ${node.spark.speed}%`} />}
              <SparkPicker workstation={node.recipe.workstation} solver={solver} dispatch={dispatch} compact />
              <RecipePicker material={node.material} solver={solver} dispatch={dispatch} />
            </div>
          )}
          {node.kind === "raw" && (
            <div className="node-machine">
              <RecipePicker material={node.material} solver={solver} dispatch={dispatch} />
            </div>
          )}
        </div>
      </div>
      {node.children.length > 0 && !isCollapsed && (
        <ul className="tree">
          {node.children.map((c) => (
            <Branch key={c.id} node={c} solver={solver} unit={unit} dispatch={dispatch} collapsed={collapsed} toggle={toggle} />
          ))}
        </ul>
      )}
    </li>
  );
}
