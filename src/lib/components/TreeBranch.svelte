<script lang="ts">
  import type { Solver, TreeNode } from "../engine/solver";
  import { fmt, fmtLoad, fmtRate } from "../format";
  import type { AppState } from "../state.svelte";
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
        <span class="rate" title="{+node.rate.toPrecision(4)}/min">{fmtRate(node.rate, unit)}</span>
        {#if node.fuel}<span class="tag fuel" title="Burnt as fuel">🔥 fuel</span>{/if}
        {#if node.kind === "raw"}<span class="tag raw">raw input</span>{/if}
        {#if node.kind === "loop"}
          <span
            class="tag loop"
            title="This item is already made further up this chain. Feeding it back would loop the line, so bring it in separately (or pick another recipe for it)."
          >
            ↻ supply separately (would loop)
          </span>
        {/if}
      </div>
      {#if node.kind === "craft" && node.recipe}
        <div class="node-machine">
          <Icon id={node.recipe.workstation} size={22} />
          <span class="machines" title="{fmt(node.machines, 3)} exact">
            {built} × {displayName(node.recipe.workstation)}
          </span>
          <span class="muted small" title="{fmt(node.machines, 3)} machines exactly">· {fmtLoad(node.machines)} busy</span>
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
        {#if node.truncated}
          <div class="small muted">… inputs not shown (tree too large). The Machines tab includes them.</div>
        {/if}
        {#if node.byproducts.some((b) => b.rate > 1e-9)}
          <div class="node-byproducts small muted" title="Extra output: surplus, not fed into other lines">
            surplus
            {#each node.byproducts as b (b.material)}
              <span class="cell-mat"><Icon id={b.material} size={16} /> {displayName(b.material)} {fmtRate(b.rate, unit)}</span>
            {/each}
          </div>
        {/if}
      {:else if node.kind === "raw" || node.kind === "loop"}
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
