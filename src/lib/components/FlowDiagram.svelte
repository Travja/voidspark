<script lang="ts">
  import { layoutFlow } from "../engine/layout";
  import type { FlowEdge, FlowNode, Plan, Solver } from "../engine/solver";
  import { fmt, fmtLoad, fmtRate } from "../format";
  import type { AppState } from "../state.svelte";
  import CrewPicker from "./CrewPicker.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";
  import RecipePicker from "./RecipePicker.svelte";
  import Staffing from "./Staffing.svelte";

  let { plan, solver, app }: { plan: Plan; solver: Solver; app: AppState } = $props();

  /** "auto": top-to-bottom on narrow screens (phones), left-to-right otherwise. */
  let direction = $state<"auto" | "lr" | "tb">("auto");
  let viewportWidth = $state(1000);
  const dir = $derived(direction === "auto" ? (viewportWidth < 700 ? "tb" : "lr") : direction);

  // Left-to-right: arrows enter along the card's side, so tall cards spread many inputs.
  // Top-to-bottom: arrows enter along the top, so cards stay a fixed height.
  const nodeHeight = (n: FlowNode, ins: number, outs: number) =>
    dir === "tb"
      ? n.kind === "recipe"
        ? 86
        : 56
      : n.kind === "recipe"
        ? Math.max(86, 24 * Math.max(ins, outs) + 14)
        : Math.max(54, 22 * outs + 12);

  const layout = $derived(
    layoutFlow(plan.flow.nodes, plan.flow.edges, {
      direction: dir,
      cardWidth: dir === "tb" ? 168 : 210,
      columnGap: dir === "tb" ? 72 : 130,
      rowGap: dir === "tb" ? 12 : 18,
      height: nodeHeight,
    }),
  );

  /** Top-to-bottom: labels above each card's top edge, staggered when they would collide. */
  const labelOffset = $derived.by(() => {
    const offsets = new Map<(typeof layout.edges)[number], number>();
    if (layout.direction !== "tb") return offsets;
    const byTarget = new Map<string, (typeof layout.edges)[number][]>();
    for (const e of layout.edges) byTarget.set(e.edge.to, [...(byTarget.get(e.edge.to) ?? []), e]);
    for (const list of byTarget.values()) {
      list.sort((a, b) => a.x2 - b.x2);
      const tight = list.length > 1 && (list[list.length - 1].x2 - list[0].x2) / (list.length - 1) < 70;
      list.forEach((e, i) => offsets.set(e, tight && i % 2 ? 20 : 0));
    }
    return offsets;
  });
  const unit = $derived(app.cfg.unit);
  const maxRate = $derived(Math.max(1e-9, ...plan.flow.edges.map((e) => e.rate)));
  const total = $derived(plan.stations.reduce((n, s) => n + s.machinesBuilt, 0));

  let hovered = $state<string | null>(null);
  let selected = $state<string | null>(null);
  let details = $state<HTMLElement>();

  // On small screens the details panel opens below the diagram, off-screen: bring it into view.
  $effect(() => {
    if (selected && details && details.getBoundingClientRect().top > innerHeight - 80) {
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  /** "auto": fit when that stays legible (>= 75%), otherwise 100%. */
  let zoom = $state<"auto" | "fit" | number>("auto");
  let viewport = $state<HTMLDivElement>();

  const VIEWPORT_PADDING = 24;
  const fitScale = $derived(Math.min(1, (viewportWidth - VIEWPORT_PADDING - 2) / Math.max(1, layout.width)));
  const scale = $derived(
    zoom === "fit" ? fitScale : zoom === "auto" ? (fitScale >= 0.75 ? fitScale : 1) : zoom,
  );

  // When the diagram doesn't fit, start at the target end, where the plan begins.
  $effect(() => {
    const target = layout.nodes.find((n) => n.node.kind === "target");
    if (!viewport || !target) return;
    const cx = (target.x + target.width / 2) * scale;
    const cy = (target.y + target.height / 2) * scale;
    const el = viewport;
    // Wait a frame so the browser has laid out the new diagram size before scrolling.
    const frame = requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, cx - el.clientWidth / 2);
      el.scrollTop = Math.max(0, cy - el.clientHeight / 2);
    });
    return () => cancelAnimationFrame(frame);
  });

  // Drag the background to pan.
  let drag = $state<{ x: number; y: number; left: number; top: number } | null>(null);
  function startPan(e: PointerEvent) {
    // Mouse only: on touch screens the browser's own scrolling already pans the diagram.
    if (e.pointerType !== "mouse" || !viewport || (e.target as HTMLElement).closest(".flow-card, .edge-label") || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(e.pointerId);
  }
  function pan(e: PointerEvent) {
    if (!drag || !viewport) return;
    viewport.scrollLeft = drag.left - (e.clientX - drag.x);
    viewport.scrollTop = drag.top - (e.clientY - drag.y);
  }
  function endPan() {
    drag = null;
  }
  const focus = $derived(hovered ?? selected);
  const neighbours = $derived.by(() => {
    if (!focus) return null;
    const set = new Set([focus]);
    for (const e of plan.flow.edges) {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    }
    return set;
  });
  const linked = (e: FlowEdge) => !focus || e.from === focus || e.to === focus;

  const strokeWidth = (rate: number) => 1.5 + 4 * Math.sqrt(rate / maxRate);
  const nodeById = $derived(new Map(plan.flow.nodes.map((n) => [n.id, n])));
  const selectedNode = $derived(selected ? nodeById.get(selected) : undefined);

  function nodeLabel(id: string) {
    const n = nodeById.get(id);
    if (!n) return id;
    if (n.kind === "recipe") return `${n.line!.machinesBuilt} × ${displayName(n.line!.recipe.workstation)} (${displayName(n.material)})`;
    if (n.kind === "target") return `Target: ${displayName(n.material)}`;
    return `${displayName(n.material)} (${n.kind === "loop" ? "supply separately" : "raw input"})`;
  }

  /** Outputs of a recipe line that nothing consumes. */
  function surplusOf(n: FlowNode) {
    if (!n.line) return [];
    return n.line.outputs
      .map((o) => {
        const used = plan.flow.edges.filter((e) => e.from === n.id && e.material === o.material).reduce((s, e) => s + e.rate, 0);
        return { material: o.material, rate: o.rate - used };
      })
      .filter((o) => o.rate > 1e-7);
  }
</script>

{#if plan.flow.nodes.length}
  <Staffing {plan} {app} />
  <div class="station-strip">
    <span class="muted small">{total} machines:</span>
    {#each plan.stations as s (s.workstation)}
      <span class="station-chip">
        <Icon id={s.workstation} size={22} />
        <strong>{s.machinesBuilt} × {displayName(s.workstation)}</strong>
        <CrewPicker workstation={s.workstation} {app} />
      </span>
    {/each}
  </div>

  <div class="toolbar">
    <span class="muted small">
      {dir === "tb" ? "Raw inputs at the top, your targets at the bottom." : "Raw inputs on the left, your targets on the right."}
      Each card is a group of machines running one recipe, and arrows show what it feeds. Hover or tap a card to
      trace it and see details.
    </span>
    <span class="spacer"></span>
    <span class="muted small">Layout</span>
    <button class:active={dir === "lr"} title="Left to right" onclick={() => (direction = "lr")}>↔ Across</button>
    <button class:active={dir === "tb"} title="Top to bottom" onclick={() => (direction = "tb")}>↕ Down</button>
    <span class="muted small">Zoom</span>
    <button class:active={scale === fitScale && zoom !== 0.75 && zoom !== 1} onclick={() => (zoom = "fit")}>Overview</button>
    <button class:active={zoom === 0.75} onclick={() => (zoom = 0.75)}>75%</button>
    <button class:active={scale === 1 && zoom !== "fit"} onclick={() => (zoom = 1)}>100%</button>
  </div>

  <div
    class="flow-viewport"
    class:panning={drag}
    bind:this={viewport}
    bind:clientWidth={viewportWidth}
    onpointerdown={startPan}
    onpointermove={pan}
    onpointerup={endPan}
    onpointercancel={endPan}
    role="region"
    aria-label="Build diagram. Drag to pan."
  >
    <div class="flow-sizer" style:width="{layout.width * scale}px" style:height="{layout.height * scale}px">
      <div class="flow-canvas" style:width="{layout.width}px" style:height="{layout.height}px" style:transform="scale({scale})">
        <svg class="flow-edges" width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="arrowhead" />
            </marker>
          </defs>
          {#each layout.edges as e (`${e.edge.from}>${e.edge.to}>${e.edge.material}>${e.edge.fuel}`)}
            <path
              d={e.path}
              class="edge"
              class:fuel={e.edge.fuel}
              class:dim={!linked(e.edge)}
              class:hot={focus && linked(e.edge)}
              stroke-width={strokeWidth(e.edge.rate)}
              marker-end="url(#arrow)"
            />
          {/each}
        </svg>

        {#each layout.edges as e (`label:${e.edge.from}>${e.edge.to}>${e.edge.material}>${e.edge.fuel}`)}
          <div
            class="edge-label"
            class:tb={layout.direction === "tb"}
            class:dim={!linked(e.edge)}
            class:fuel={e.edge.fuel}
            style:left="{layout.direction === "tb" ? e.x2 : e.x2 - 10}px"
            style:top="{layout.direction === "tb" ? e.y2 - 6 - (labelOffset.get(e) ?? 0) : e.y2}px"
            title="{displayName(e.edge.material)}{e.edge.fuel ? ' (fuel)' : ''}: {nodeLabel(e.edge.from)} → {nodeLabel(e.edge.to)}"
          >
            <Icon id={e.edge.material} size={14} />
            {fmtRate(e.edge.rate, unit)}{e.edge.fuel ? " 🔥" : ""}
          </div>
        {/each}

        {#each layout.nodes as p (p.node.id)}
          {@const n = p.node}
          <button
            class="flow-card kind-{n.kind}"
            class:dim={neighbours && !neighbours.has(n.id)}
            class:selected={selected === n.id}
            style:left="{p.x}px"
            style:top="{p.y}px"
            style:width="{p.width}px"
            style:height="{p.height}px"
            onmouseenter={() => (hovered = n.id)}
            onmouseleave={() => (hovered = null)}
            onfocus={() => (hovered = n.id)}
            onblur={() => (hovered = null)}
            onclick={() => (selected = selected === n.id ? null : n.id)}
          >
            {#if n.kind === "recipe" && n.line}
              <span class="card-row">
                <Icon id={n.line.recipe.workstation} size={26} />
                <strong>{n.line.machinesBuilt} × {displayName(n.line.recipe.workstation)}</strong>
              </span>
              <span class="card-row">
                <Icon id={n.material} size={18} />
                <span class="ellipsis">{displayName(n.material)}</span>
                <span class="rate">{fmtRate(n.line.outputs.find((o) => o.material === n.material)?.rate ?? 0, unit)}</span>
              </span>
              <span class="card-row small muted">
                {fmtLoad(n.line.machines)} busy
                <span class="crew">
                  {#each n.line.crew as s, i (i)}<Icon id={s.block} size={14} title={s.name} />{/each}
                </span>
                {#if surplusOf(n).length}<span class="tag surplus" title="Extra outputs nothing uses">+ surplus</span>{/if}
                {#if n.line.recipe.cycles}<span class="tag approx">≈</span>{/if}
              </span>
            {:else if n.kind === "target"}
              <span class="card-row"><span class="tag target">target</span></span>
              <span class="card-row">
                <Icon id={n.material} size={22} />
                <strong class="ellipsis">{displayName(n.material)}</strong>
                <span class="rate">{fmtRate(n.rate, unit)}</span>
              </span>
            {:else}
              <span class="card-row">
                <Icon id={n.material} size={22} />
                <strong class="ellipsis">{displayName(n.material)}</strong>
              </span>
              <span class="card-row small">
                {#if n.kind === "loop"}
                  <span class="tag loop" title="Already made later in this chain; bring it in separately">↻ supply separately</span>
                {:else}
                  <span class="tag raw">raw input</span>
                {/if}
                <span class="rate">{fmtRate(n.rate, unit)}</span>
              </span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  {#if selectedNode}
    {@const n = selectedNode}
    {@const fedBy = plan.flow.edges.filter((e) => e.to === n.id)}
    {@const feeds = plan.flow.edges.filter((e) => e.from === n.id)}
    <section class="card flow-details" bind:this={details}>
      <header class="card-row">
        <Icon id={n.line ? n.line.recipe.workstation : n.material} size={32} />
        <h3>{nodeLabel(n.id)}</h3>
        <span class="spacer"></span>
        <button class="icon-btn" aria-label="Close details" onclick={() => (selected = null)}>✕</button>
      </header>
      {#if n.line}
        <p class="small muted">
          {n.line.recipe.name} · {fmt(n.line.machines, 3)} machines exactly ({fmtLoad(n.line.machines)} busy) ·
          {fmt(n.line.crafts, 3)} crafts/min
          {#if n.line.recipe.cycles}· growth recipe, rate approximate{/if}
        </p>
        <div class="detail-controls">
          <label class="small">Sparks <CrewPicker workstation={n.line.recipe.workstation} {app} /></label>
          <label class="small">Recipe <RecipePicker material={n.material} {solver} {app} /></label>
        </div>
      {:else if n.kind !== "target"}
        <div class="detail-controls">
          <label class="small">Recipe <RecipePicker material={n.material} {solver} {app} /></label>
        </div>
      {/if}
      <div class="two-col">
        <div>
          <h4>Fed by</h4>
          {#each fedBy as e, i (i)}
            <div class="flow-line">
              <Icon id={e.material} size={18} />
              {fmtRate(e.rate, unit)} {displayName(e.material)}{e.fuel ? " 🔥" : ""} ← {nodeLabel(e.from)}
            </div>
          {:else}
            <p class="muted small">Nothing; this is where the line starts.</p>
          {/each}
        </div>
        <div>
          <h4>Feeds</h4>
          {#each feeds as e, i (i)}
            <div class="flow-line">
              <Icon id={e.material} size={18} />
              {fmtRate(e.rate, unit)} {displayName(e.material)}{e.fuel ? " 🔥" : ""} → {nodeLabel(e.to)}
            </div>
          {:else}
            <p class="muted small">Nothing.</p>
          {/each}
          {#each surplusOf(n) as s (s.material)}
            <div class="flow-line">
              <Icon id={s.material} size={18} />
              {fmtRate(s.rate, unit)} {displayName(s.material)} → <span class="tag surplus">surplus</span>
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}
{:else}
  <p class="muted">Nothing to build yet.</p>
{/if}
