<script lang="ts">
  import type { LoopInfo, Solver, TreeNode } from "../engine/solver";
  import { displayName } from "./icons";
  import type { AppState } from "../state.svelte";
  import TreeBranch from "./TreeBranch.svelte";

  let {
    trees,
    solver,
    app,
    loops = [],
  }: { trees: TreeNode[]; solver: Solver; app: AppState; loops?: LoopInfo[] } = $props();
  const fedBack = $derived(loops.filter((l) => l.loopBack && l.fedBack > 1e-9));

  let collapsed = $state(new Set<string>());

  function toggle(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed = next;
  }

  function collectIds(n: TreeNode, out: string[] = []) {
    if (n.children.length) out.push(n.id);
    n.children.forEach((c) => collectIds(c, out));
    return out;
  }

  const collapseToTargets = () => {
    collapsed = new Set(trees.flatMap((t) => collectIds(t).filter((id) => id !== t.id)));
  };
</script>

{#if trees.length}
  <div class="toolbar">
    <button onclick={() => (collapsed = new Set())}>Expand all</button>
    <button onclick={collapseToTargets}>Collapse to targets</button>
    <span class="muted small">
      Each row feeds only the row it hangs from, so every line flows one way. Extra outputs are surplus. Machine
      counts are for that branch only; the Build plan has the combined totals.
    </span>
  </div>
  {#if fedBack.length}
    <p class="muted small tree-note">
      ↻ Loop-backs feed {fedBack.map((l) => displayName(l.material)).join(", ")} back into this plan. The tree shows each
      branch before that feedback; the Build plan and Inputs include it.
    </p>
  {/if}
  <ul class="tree root">
    {#each trees as t (t.id)}
      <TreeBranch node={t} {solver} {app} {collapsed} {toggle} />
    {/each}
  </ul>
{:else}
  <p class="muted">Add a target to see its production tree.</p>
{/if}
