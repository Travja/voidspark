<script lang="ts">
  import type { Solver, TreeNode } from "../engine/solver";
  import type { AppState } from "../state.svelte";
  import TreeBranch from "./TreeBranch.svelte";

  let { trees, solver, app }: { trees: TreeNode[]; solver: Solver; app: AppState } = $props();

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
      Each row feeds the row it hangs from. Machine counts are for that branch only. The Machines tab has the
      combined totals.
    </span>
  </div>
  <ul class="tree root">
    {#each trees as t (t.id)}
      <TreeBranch node={t} {solver} {app} {collapsed} {toggle} />
    {/each}
  </ul>
{:else}
  <p class="muted">Add a target to see its production tree.</p>
{/if}
