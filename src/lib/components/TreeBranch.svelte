<script lang="ts">
  import type { Solver, TreeNode } from "../engine/solver";
  import { fmt } from "../format";
  import { UNIT_FACTOR, type AppState } from "../state.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";
  import RecipePicker from "./RecipePicker.svelte";
  import CrewPicker from "./CrewPicker.svelte";
  import TreeBranch from "./TreeBranch.svelte";

  let {
    node,
    solver,
    app,
    collapsed,
    toggle,
  }: {
    node: TreeNode;
    solver: Solver;
    app: AppState;
    collapsed: Set<string>;
    toggle: (id: string) => void;
  } = $props();

  const isCollapsed = $derived(collapsed.has(node.id));
  const unit = $derived(app.cfg.unit);
  const u = $derived(UNIT_FACTOR[unit]);
  const built = $derived(Math.ceil(node.machines - 1e-9));
</script>

<li class="branch kind-{node.kind}" class:is-fuel={node.fuel}>
  <div class="node">
    <button
      class="twisty"
      disabled={!node.children.length}
      onclick={() => toggle(node.id)}
      aria-label={isCollapsed ? "Expand" : "Collapse"}
    >
      {node.children.length ? (isCollapsed ? "▸" : "▾") : ""}
    </button>
    <Icon id={node.material} size={32} />
    <div class="node-main">
      <div class="node-title">
        <strong>{displayName(node.material)}</strong>
        <span class="rate">{fmt(node.rate * u)}/{unit}</span>
        {#if node.fuel}<span class="tag fuel" title="Burnt as fuel">🔥 fuel</span>{/if}
        {#if node.kind === "raw"}<span class="tag raw">raw input</span>{/if}
        {#if node.kind === "loop"}
          <span class="tag loop" title="Taken from the production of this material further up the tree">
            ↻ loops back up the tree
          </span>
        {/if}
        {#if node.kind === "byproduct"}
          <span class="tag byproduct" title="Covered by the extra output of another recipe in this plan">
            ♻ byproduct of another line
          </span>
        {/if}
        {#if node.kind === "craft" && node.fromByproducts > 1e-6}
          <span class="muted small" title="Covered by the extra output of another recipe in this plan">
            ({fmt(node.fromByproducts * u)}/{unit} from byproducts)
          </span>
        {/if}
        {#if node.kind === "craft" && Math.abs(node.gross - (node.rate - node.fromByproducts)) > 1e-6}
          <span class="muted small" title="Gross output including what gets fed back into the loop">
            (makes {fmt(node.gross * u)}/{unit})
          </span>
        {/if}
      </div>
      {#if node.kind === "craft" && node.recipe}
        <div class="node-machine">
          <Icon id={node.recipe.workstation} size={22} />
          <span class="machines" title="{fmt(node.machines, 3)} exact">
            {built} × {displayName(node.recipe.workstation)}
          </span>
          <span class="muted small">({fmt(node.machines, 2)} exact)</span>
          <span class="crew">
            {#each node.crew as s, i (i)}
              <Icon id={s.block} size={18} title="{s.name} · {s.speed / 100}×" />
            {/each}
          </span>
          <CrewPicker workstation={node.recipe.workstation} {app} />
          <RecipePicker material={node.material} {solver} {app} />
          {#if node.recipe.to.some((t) => t.chance)}
            <span class="tag chance" title="Randomised outputs counted at their expected value">🎲 random</span>
          {/if}
          {#if node.recipe.cycles}
            <span
              class="tag approx"
              title="Growth recipe ({node.recipe.cycles} cycles); the wiki doesn't say exactly how cycles work, so this rate is approximate"
            >
              ≈ growth
            </span>
          {/if}
        </div>
        {#if node.byproducts.some((b) => b.rate > 1e-9)}
          <div class="node-byproducts small muted">
            also makes
            {#each node.byproducts as b (b.material)}
              <span class="cell-mat"><Icon id={b.material} size={16} /> {displayName(b.material)} {fmt(b.rate * u)}/{unit}</span>
            {/each}
          </div>
        {/if}
      {:else if node.kind === "raw" || node.kind === "byproduct"}
        <div class="node-machine">
          <RecipePicker material={node.material} {solver} {app} />
        </div>
      {/if}
    </div>
  </div>
  {#if node.children.length && !isCollapsed}
    <ul class="tree">
      {#each node.children as c (c.id)}
        <TreeBranch node={c} {solver} {app} {collapsed} {toggle} />
      {/each}
    </ul>
  {/if}
</li>
