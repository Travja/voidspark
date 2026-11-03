<script lang="ts">
  import type { AppState } from "../state.svelte";

  /** Pick, add, share, rename, duplicate and delete saved plans. */
  let { app, notify }: { app: AppState; notify: (message: string) => void } = $props();

  let menu = $state<HTMLDetailsElement>();

  const closeMenu = () => {
    if (menu) menu.open = false;
  };

  function add() {
    app.newPlan();
    notify("New plan started");
  }

  function rename() {
    closeMenu();
    const name = prompt("Rename plan", app.current.name);
    if (name?.trim()) app.renamePlan(app.current.id, name);
  }

  function duplicate() {
    closeMenu();
    app.duplicatePlan();
    notify(`Copied to “${app.current.name}”`);
  }

  function remove() {
    closeMenu();
    if (app.plans.length <= 1) return;
    if (confirm(`Delete “${app.current.name}”? This can't be undone.`)) {
      const name = app.current.name;
      app.deletePlan(app.current.id);
      notify(`Deleted “${name}”`);
    }
  }

  async function share() {
    const url = app.shareUrl();
    // Phones: the native share sheet. Elsewhere: copy the link.
    if (navigator.share) {
      try {
        await navigator.share({ title: `VoidSpark: ${app.current.name}`, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      notify("Link copied");
    } catch {
      prompt("Copy this link", url);
    }
  }
</script>

<div class="plan-bar">
  <select
    class="plan-select"
    aria-label="Saved plan"
    value={app.current.id}
    onchange={(e) => app.selectPlan(e.currentTarget.value)}
  >
    {#each app.plans as p (p.id)}
      <option value={p.id}>{p.name}</option>
    {/each}
  </select>
  <button class="icon-btn" title="New plan" aria-label="New plan" onclick={add}>＋</button>
  <button title="Share a link to this plan" onclick={share}>Share</button>
  <details class="plan-menu" bind:this={menu}>
    <summary class="icon-btn" title="More plan actions" aria-label="More plan actions">⋯</summary>
    <div class="plan-menu-list" role="menu">
      <button role="menuitem" onclick={rename}>Rename…</button>
      <button role="menuitem" onclick={duplicate}>Duplicate</button>
      <button role="menuitem" onclick={remove} disabled={app.plans.length <= 1}>Delete…</button>
    </div>
  </details>
</div>

<style>
  .plan-bar {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 12px;
  }

  .plan-select {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }

  .plan-menu {
    position: relative;
  }

  .plan-menu summary {
    list-style: none;
    cursor: pointer;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 10px;
    background: var(--surface);
  }

  .plan-menu summary::-webkit-details-marker {
    display: none;
  }

  .plan-menu-list {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 150px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
  }

  .plan-menu-list button {
    border: none;
    text-align: left;
    padding: 10px 12px;
  }

  .plan-menu-list button:hover:not(:disabled) {
    background: var(--accent-soft);
  }
</style>
