<script lang="ts">
  import "$lib/styles.css";
  import "$lib/logic/logic.css";
  import { resolve } from "$app/paths";
  import Icon from "$lib/components/Icon.svelte";
  import { emptyCircuit, freeSpot, newId } from "$lib/logic/circuit";
  import { EXAMPLES } from "$lib/logic/examples";
  import { TICK } from "$lib/logic/parts";
  import { Sim } from "$lib/logic/sim";
  import { LogicStore, type Tool } from "$lib/logic/store.svelte";
  import { erase } from "$lib/logic/grid";
  import type { Circuit, PortRef, Rot } from "$lib/logic/types";
  import Canvas from "$lib/logic/ui/Canvas.svelte";
  import Inspector from "$lib/logic/ui/Inspector.svelte";
  import Palette from "$lib/logic/ui/Palette.svelte";
  import { untrack } from "svelte";

  const store = new LogicStore();

  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(message: string) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }

  // --- simulation ---------------------------------------------------------------------------

  const build = (prev?: Sim) => new Sim($state.snapshot(store.circuit) as Circuit, prev && prev.tick > 0 ? prev.snapshot() : undefined);
  let sim = $state.raw(untrack(() => build()));
  let frame = $state(0);
  let running = $state(true);
  let speed = $state(1);

  // Rebuild after every edit, carrying the running state over.
  $effect(() => {
    void store.version;
    untrack(() => {
      sim = build(sim);
      frame++;
    });
  });

  $effect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += Math.min(0.25, (now - last) / 1000) * speed;
      last = now;
      let n = 0;
      while (acc >= TICK && n < 800) {
        sim.step();
        acc -= TICK;
        n++;
      }
      if (n) frame++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  function stepOnce() {
    running = false;
    sim.step();
    frame++;
  }

  function reset() {
    sim = new Sim($state.snapshot(store.circuit) as Circuit);
    frame++;
  }

  const clock = $derived.by(() => {
    void frame;
    const t = sim.time;
    return t < 60 ? `${t.toFixed(1)} s` : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  });

  // --- editing ------------------------------------------------------------------------------

  let canvas: Canvas;
  let placing = $state<string | null>(null);
  let wiringFrom = $state<PortRef | null>(null);
  let tool = $state<Tool>("select");
  const TOOLS: { id: Tool; label: string; icon: string; key: string; tip: string }[] = [
    { id: "select", label: "Select", icon: "✋", key: "v", tip: "Select, move, wire port-to-port, pan" },
    { id: "wire", label: "Wire", icon: "╱", key: "w", tip: "Draw wire tiles: drag across the grid" },
    { id: "ribbon", label: "Ribbon", icon: "☰", key: "g", tip: "Draw ribbon tiles (4 bits)" },
    { id: "erase", label: "Erase", icon: "⌫", key: "x", tip: "Drag over tiles to remove them" },
  ];
  let paletteOpen = $state(false);
  let sheetMin = $state(false);
  const wide = typeof matchMedia !== "undefined" ? matchMedia("(min-width: 900px)") : null;
  let isWide = $state(wide?.matches ?? true);
  $effect(() => {
    const on = () => (isWide = wide?.matches ?? true);
    wide?.addEventListener("change", on);
    return () => wide?.removeEventListener("change", on);
  });

  function pick(type: string | null) {
    placing = type;
    if (type) tool = "select";
    wiringFrom = null;
    paletteOpen = false;
  }

  function deleteSelection() {
    const sel = store.selection;
    if (!sel) return;
    store.edit((c) => {
      if (sel.kind === "cell") erase(c.cells, sel.id);
      else if (sel.kind === "part") {
        c.parts = c.parts.filter((p) => p.id !== sel.id);
        c.wires = c.wires.filter((w) => w.from.part !== sel.id && w.to.part !== sel.id);
      } else c.wires = c.wires.filter((w) => w.id !== sel.id);
    });
    store.selection = null;
  }

  function rotateSelection() {
    const sel = store.selection;
    if (sel?.kind !== "part") return;
    store.edit((c) => {
      const p = c.parts.find((x) => x.id === sel.id);
      if (p) p.rot = ((p.rot + 1) % 4) as Rot;
    });
  }

  function duplicateSelection() {
    const sel = store.selection;
    if (sel?.kind !== "part") return;
    const src = store.circuit.parts.find((p) => p.id === sel.id);
    if (!src) return;
    const copy = { ...($state.snapshot(src) as typeof src), id: newId("c") };
    const spot = freeSpot(store.circuit, copy.type, copy.x + 1, copy.y + 1, copy.rot);
    copy.x = spot.x;
    copy.y = spot.y;
    store.edit((c) => void c.parts.push(copy));
    store.selection = { kind: "part", id: copy.id };
  }

  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (el.closest("input, select, textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      store.redo();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (store.selection) {
        e.preventDefault();
        deleteSelection();
      }
    } else if (e.key === "r" && !mod) rotateSelection();
    else if (!mod && TOOLS.some((t) => t.key === e.key)) {
      tool = TOOLS.find((t) => t.key === e.key)!.id;
      placing = null;
      wiringFrom = null;
    } else if (e.key === "Escape") {
      placing = null;
      wiringFrom = null;
      tool = "select";
      store.selection = null;
    } else if (e.key === " " && !mod) {
      e.preventDefault();
      running = !running;
    }
  }

  // --- circuits -----------------------------------------------------------------------------

  let renaming = $state(false);
  let menuOpen = $state(false);
  let menuEl = $state<HTMLDetailsElement>();
  $effect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (!menuEl?.contains(e.target as Node)) menuOpen = false;
    };
    addEventListener("pointerdown", away, true);
    return () => removeEventListener("pointerdown", away, true);
  });
  function openExample(id: string) {
    const ex = EXAMPLES.find((x) => x.id === id);
    if (!ex) return;
    store.add(ex.build());
    reset();
    notify(`Opened example “${ex.name}”`);
  }
  function newCircuit() {
    store.add(emptyCircuit());
    reset();
  }
  function deleteCircuit() {
    if (store.saved.length <= 1) return notify("You need at least one circuit.");
    if (confirm(`Delete “${store.circuit.name}”? This can't be undone.`)) store.remove();
  }
  async function share() {
    const url = await store.shareUrl();
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${store.circuit.name} · VoidSpark logic`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      notify("Link copied");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") prompt("Copy this link:", url);
    }
  }

  async function openShared() {
    const name = await store.openShared();
    if (name === "invalid") notify("That share link isn't a valid circuit.");
    else if (name) {
      reset();
      notify(`Opened shared circuit “${name}”`);
    }
  }
  openShared();
  $effect(() => {
    addEventListener("hashchange", openShared);
    return () => removeEventListener("hashchange", openShared);
  });

  const selectedName = $derived(store.selection ? true : false);
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Logic sandbox · VoidSpark</title></svelte:head>

<div class="logic-app">
  <header class="logic-top">
    <a class="brand" href={resolve("/")} title="Back to the production planner">
      <Icon id="crafty-spark-block" size={28} />
      <span class="brand-name">VoidSpark</span>
    </a>
    <nav class="site-nav" aria-label="Sections">
      <a href={resolve("/")}>Planner</a>
      <a href={resolve("/logic")} aria-current="page">Logic</a>
    </nav>
    <div class="circuit-bar">
      {#if renaming}
        <input
          class="name-input"
          value={store.circuit.name}
          aria-label="Circuit name"
          maxlength="60"
          onkeydown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onblur={(e) => {
            store.rename(e.currentTarget.value);
            renaming = false;
          }}
          {@attach (el) => el.focus()}
        />
      {:else}
        <select aria-label="Saved circuits" value={store.currentId} onchange={(e) => store.select(e.currentTarget.value)}>
          {#each store.saved as s (s.id)}<option value={s.id}>{s.circuit.name}</option>{/each}
        </select>
      {/if}
      <details class="menu" bind:open={menuOpen} bind:this={menuEl}>
        <summary aria-label="Circuit menu">⋯</summary>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="menu-list" role="menu" tabindex="-1" onclick={() => (menuOpen = false)}>
          <button onclick={newCircuit}>New circuit</button>
          <button onclick={() => (renaming = true)}>Rename</button>
          <button onclick={() => store.duplicate()}>Duplicate</button>
          <button onclick={share}>Share link</button>
          <button class="danger" onclick={deleteCircuit}>Delete</button>
          <hr />
          <span class="muted small">Examples</span>
          {#each EXAMPLES as ex (ex.id)}
            <button onclick={() => openExample(ex.id)} title={ex.blurb}>{ex.name}</button>
          {/each}
        </div>
      </details>
      <button class="share-btn" onclick={share} title="Copy a link to this circuit">Share</button>
    </div>
  </header>

  <div class="toolbar-row">
    <div class="sim-controls" role="group" aria-label="Simulation">
      <button class="primary play" onclick={() => (running = !running)} aria-label={running ? "Pause" : "Play"}>
        {running ? "⏸" : "▶"}
      </button>
      <button onclick={stepOnce} title="Advance one tick (0.05 s)" aria-label="Step">⏭</button>
      <button onclick={reset} title="Reset to starting values" aria-label="Reset">↺</button>
      <select aria-label="Speed" bind:value={speed}>
        <option value={0.25}>¼×</option>
        <option value={0.5}>½×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
        <option value={10}>10×</option>
      </select>
      <span class="clock" aria-label="Simulated time">{clock}</span>
    </div>
    <div class="edit-controls" role="group" aria-label="Edit">
      <button onclick={() => store.undo()} disabled={!store.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">↶</button>
      <button onclick={() => store.redo()} disabled={!store.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">↷</button>
      <button onclick={() => canvas.fit()} aria-label="Fit to screen" title="Fit to screen">⤢</button>
      <button class="wide-only" onclick={() => canvas.zoomBy(1.25)} aria-label="Zoom in">＋</button>
      <button class="wide-only" onclick={() => canvas.zoomBy(0.8)} aria-label="Zoom out">－</button>
    </div>
  </div>

  <div class="logic-main">
    {#if isWide}
      <aside class="side palette-side"><Palette {placing} onpick={pick} /></aside>
    {/if}

    <div class="stage">
      <Canvas bind:this={canvas} {store} {sim} {frame} {running} bind:placing bind:wiringFrom bind:tool {notify} />
      <div class="tools" role="toolbar" aria-label="Tools">
        {#each TOOLS as t (t.id)}
          <button
            class:active={tool === t.id}
            aria-pressed={tool === t.id}
            aria-label={t.label}
            title="{t.tip} ({t.key.toUpperCase()})"
            onclick={() => {
              tool = t.id;
              placing = null;
              wiringFrom = null;
            }}><span class="tool-icon" aria-hidden="true">{t.icon}</span><span class="tool-label">{t.label}</span></button
          >
        {/each}
      </div>
      {#if placing || wiringFrom || tool !== "select"}
        <div class="hint" role="status">
          {#if placing}
            Tap the grid to place <strong>{placing.replace(/-/g, " ")}</strong>
          {:else if wiringFrom}
            Tap another port: a wire is laid on the grid
          {:else if tool === "erase"}
            Drag over tiles to erase · two fingers pan
          {:else}
            Drag to draw {tool} tiles · two fingers pan
          {/if}
          <button
            onclick={() => {
              placing = null;
              wiringFrom = null;
              tool = "select";
            }}>{placing || wiringFrom ? "Cancel" : "Done"}</button
          >
        </div>
      {/if}
      {#if !isWide}
        <button class="fab" onclick={() => (paletteOpen = true)} aria-label="Add a part">＋ Add</button>
      {/if}
    </div>

    {#if isWide}
      <aside class="side insp-side">
        {#if store.selection}
          <Inspector
            {store}
            {sim}
            {frame}
            {running}
            onrotate={rotateSelection}
            ondelete={deleteSelection}
            onduplicate={duplicateSelection}
            onclose={() => (store.selection = null)}
          />
        {:else}
          {@render help()}
        {/if}
      </aside>
    {/if}
  </div>
  {#if !isWide && selectedName}
    <div class="sheet insp-sheet" class:min={sheetMin}>
      <button class="sheet-grip" aria-label={sheetMin ? "Expand" : "Collapse"} onclick={() => (sheetMin = !sheetMin)}></button>
      <Inspector
        {store}
        {sim}
        {frame}
        {running}
        onrotate={rotateSelection}
        ondelete={deleteSelection}
        onduplicate={duplicateSelection}
        onclose={() => (store.selection = null)}
      />
    </div>
  {/if}
</div>

{#if !isWide && paletteOpen}
  <div class="sheet-backdrop" role="presentation" onclick={() => (paletteOpen = false)}></div>
  <div class="sheet palette-sheet" role="dialog" aria-label="Add a part">
    <div class="sheet-head">
      <strong>Add a part</strong>
      <button class="icon-btn" aria-label="Close" onclick={() => (paletteOpen = false)}>✕</button>
    </div>
    <Palette {placing} onpick={pick} />
  </div>
{/if}

{#snippet help()}
  <div class="help">
    <h2>{store.circuit.name}</h2>
    <p class="muted small">
      {store.circuit.parts.length} parts · {Object.keys(store.circuit.cells).length} wire tiles · {store.circuit.wires.length} paths and sensor links
    </p>
    <ul class="small">
      <li><strong>Add:</strong> pick a part, then tap the grid.</li>
      <li>
        <strong>Wire:</strong> logic runs on buried wire tiles, as in the game. Tap a logic port, then another, and a wire is laid on the grid for you
        (building a three-tile Wire Bridge to hop another wire if it must). Or draw tiles yourself with the Wire tool, and place a Wire Bridge from the palette (Wiring) to cross wires by hand. Tiles only join where drawn, so wires can run side
        by side.
      </li>
      <li>
        <strong>Ribbon:</strong> one tile carrying four signals (bits 0–3). A plain wire joining a ribbon uses bit 0; Ribbon Writers and Readers use bits
        1–3; a Four Pixel Display shows all four.
      </li>
      <li><strong>Paths:</strong> square ports carry items; tap an exit then an entrance. Diamonds link a Capacity Sensor to a storage.</li>
      <li><strong>Move:</strong> drag a part. <strong>Pan:</strong> drag the grid. <strong>Zoom:</strong> wheel or pinch.</li>
      <li><strong>Run:</strong> ▶ plays; tap levers, buttons and blockers to toggle them. Select a part to see its inputs, outputs and why it's on or off.</li>
      <li>Keys: V select, W wire, G ribbon, X erase, R rotate, Delete remove, Ctrl+Z / Ctrl+Y undo/redo, Space play/pause, Esc cancel.</li>
    </ul>
    <label>
      Spark walking speed <span class="muted">(tiles/s)</span>
      <input
        type="number"
        min="0.2"
        max="10"
        step="0.1"
        value={store.circuit.settings.walkSpeed}
        onchange={(e) => {
          const v = Math.min(10, Math.max(0.2, +e.currentTarget.value || 2));
          store.edit((c) => (c.settings.walkSpeed = v));
        }}
      />
    </label>
    <p class="muted small">
      Behaviour follows the <a href="https://oddsparks.wiki.gg">Oddsparks Wiki</a>. Where the wiki is silent the sandbox makes an assumption; see
      <a href="https://github.com/Travja/voidspark/blob/master/docs/logic-components.md" target="_blank" rel="noopener">logic-components.md</a>.
    </p>
  </div>
{/snippet}

{#if toast}
  <div class="toast" role="status" aria-live="polite">{toast}</div>
{/if}
