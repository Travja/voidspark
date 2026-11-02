<script lang="ts">
  import { flushSync } from "svelte";
  import { GAME, type Material } from "../engine/data";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";

  let { value, onchange }: { value: string; onchange: (id: string) => void } = $props();

  const uid = $props.id();
  const listId = `${uid}-list`;
  const optionId = (id: string) => `${uid}-opt-${id}`;

  const allGroups = GAME.categories
    .map((c) => ({
      ...c,
      mats: [...GAME.materials.values()]
        .filter((m) => m.category === c.id)
        .sort((a, b) => Number(b.craftable) - Number(a.craftable) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.mats.length);

  let open = $state(false);
  let query = $state("");
  let active = $state<string | null>(null);
  let root: HTMLDivElement;
  let button = $state<HTMLButtonElement>();
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLDivElement>();
  let place = $state({ left: 0, width: 0 });

  /** Every word of the query must appear somewhere in the name, in any order. */
  function matches(m: Material, words: string[]): boolean {
    const name = m.name.toLowerCase();
    return words.every((w) => name.includes(w));
  }

  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    const words = q.split(/\s+/);
    return allGroups
      .map((g) => ({
        ...g,
        // Names that start with the query lead their group.
        mats: g.mats
          .filter((m) => matches(m, words))
          .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q))),
      }))
      .filter((g) => g.mats.length);
  });
  const flat = $derived(groups.flatMap((g) => g.mats));

  // Typing moves the highlight to the best match; with no query it starts on the current item.
  $effect(() => {
    if (!open) return;
    if (!active || !flat.some((m) => m.id === active))
      active = (query.trim() ? undefined : flat.find((m) => m.id === value)?.id) ?? flat[0]?.id ?? null;
  });

  $effect(() => {
    if (!open || !active || !list) return;
    list.querySelector<HTMLElement>(`[id="${optionId(active)}"]`)?.scrollIntoView({ block: "nearest" });
  });

  /** Fit the list to the screen; on phones it spans the whole target row. */
  function position() {
    const r = root.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    if (window.matchMedia("(max-width: 600px)").matches) {
      const row = (root.closest(".target") ?? root.parentElement ?? root).getBoundingClientRect();
      place = { left: row.left - r.left, width: row.width };
      return;
    }
    const width = Math.min(Math.max(r.width, 320), vw - 16);
    place = { left: Math.min(0, vw - 8 - width - r.left), width };
  }

  function show() {
    query = "";
    active = null;
    position();
    // Render the input synchronously so focusing it stays inside the tap (opens the phone keyboard).
    flushSync(() => (open = true));
    input?.focus();
  }

  function close(refocus = false) {
    open = false;
    query = "";
    if (refocus) {
      flushSync();
      button?.focus();
    }
  }

  function pick(id: string) {
    if (id !== value) onchange(id);
    close(true);
  }

  function move(delta: number) {
    if (!flat.length) return;
    const i = flat.findIndex((m) => m.id === active);
    const next = i < 0 ? (delta > 0 ? 0 : flat.length - 1) : Math.min(flat.length - 1, Math.max(0, i + delta));
    active = flat[next].id;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "PageDown") move(8);
    else if (e.key === "PageUp") move(-8);
    else if (e.key === "Enter") {
      if (active) pick(active);
    } else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") close();
    else return;
    e.preventDefault();
  }

  function onButtonKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  }

  // Click or tap anywhere outside closes the list.
  $effect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.contains(e.target as Node)) close();
    };
    const resize = () => position();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", resize);
    };
  });
</script>

<div class="picker" bind:this={root}>
  {#if open}
    <div class="field">
      <Icon id={value} size={20} />
      <input
        bind:this={input}
        bind:value={query}
        type="text"
        role="combobox"
        aria-label="Search items"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active ? optionId(active) : undefined}
        placeholder={displayName(value)}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="done"
        oninput={() => (active = null)}
        {onkeydown}
      />
    </div>
    <div
      class="list"
      id={listId}
      role="listbox"
      aria-label="Items"
      tabindex="-1"
      bind:this={list}
      style:left="{place.left}px"
      style:width="{place.width}px"
      onmousedown={(e) => e.preventDefault()}
    >
      {#each groups as g (g.id)}
        <div role="group" aria-labelledby="{uid}-cat-{g.id}">
          <div class="heading" id="{uid}-cat-{g.id}" role="presentation">{g.name}</div>
          {#each g.mats as m (m.id)}
            <div
              class="option"
              class:active={m.id === active}
              class:current={m.id === value}
              id={optionId(m.id)}
              role="option"
              tabindex="-1"
              aria-selected={m.id === active}
              onclick={() => pick(m.id)}
              onkeydown={onkeydown}
              onpointermove={() => (active = m.id)}
            >
              <Icon id={m.id} size={24} />
              <span class="name">{m.name}</span>
              {#if !m.craftable}<span class="tag">raw</span>{/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty">No items match “{query.trim()}”</div>
      {/each}
    </div>
  {:else}
    <button
      bind:this={button}
      type="button"
      class="field trigger"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-label="Item: {displayName(value)}"
      onclick={show}
      onkeydown={onButtonKeydown}
    >
      <Icon id={value} size={20} />
      <span class="name">{displayName(value)}</span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    min-width: 0;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    min-height: 36px;
    padding: 4px 9px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    text-align: left;
    box-sizing: border-box;
  }

  .field:focus-within {
    border-color: var(--accent);
    outline: 2px solid var(--accent-soft);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .field input {
    flex: 1;
    min-width: 0;
    border: 0;
    padding: 2px 0;
    background: transparent;
    outline: none;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .caret {
    color: var(--muted);
    font-size: 12px;
  }

  .list {
    position: absolute;
    top: calc(100% + 4px);
    z-index: 30;
    box-sizing: border-box;
    max-height: min(420px, 60vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 4px 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }

  .heading {
    position: sticky;
    top: -4px;
    z-index: 1;
    padding: 6px 12px 4px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 4px 12px;
    cursor: pointer;
    color: var(--text);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .option.active {
    background: var(--accent-soft);
  }

  .option.current .name {
    font-weight: 600;
    color: var(--accent);
  }

  .tag {
    flex: none;
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 5px;
  }

  .empty {
    padding: 12px;
    color: var(--muted);
  }

  @media (max-width: 600px) {
    .field {
      min-height: 40px;
    }

    .field input {
      /* 16px keeps iOS from zooming in on focus. */
      font-size: 16px;
    }

    .list {
      max-height: min(360px, 55dvh);
    }

    .option {
      min-height: 44px;
    }
  }
</style>
