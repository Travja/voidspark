<script lang="ts">
  import { GAME } from "../engine/data";
  import { layoutFlow, splitSources, type Segment } from "../engine/layout";
  import type { FlowEdge, FlowNode, Plan, RecipePlan, Solver } from "../engine/solver";
  import { fmt, fmtLoad, fmtRate } from "../format";
  import type { AppState } from "../state.svelte";
  import CrewPicker from "./CrewPicker.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";
  import RecipePicker from "./RecipePicker.svelte";
  import Sites from "./Sites.svelte";
  import Staffing from "./Staffing.svelte";

  let { plan, solver, app }: { plan: Plan; solver: Solver; app: AppState } = $props();

  // Workstation totals: open on wide screens, a one-line summary on phones.
  let stationsOpen = $state(typeof matchMedia === "undefined" || matchMedia("(min-width: 701px)").matches);

  // Raw inputs get one card per consumer, placed right next to it (they aren't machines).
  const graph = $derived(splitSources(plan.flow.nodes, plan.flow.edges));

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
    layoutFlow(graph.nodes, graph.edges, {
      direction: dir,
      cardWidth: dir === "tb" ? 168 : 210,
      columnGap: dir === "tb" ? 72 : 130,
      rowGap: dir === "tb" ? 12 : 18,
      height: nodeHeight,
    }),
  );

  /**
   * Top-to-bottom: each label rides on its own arrow, in the middle of the gap before the card it
   * feeds. Labels in the same gap that would overlap move up or down a tier, sliding along their
   * arrow so they stay on it.
   */
  const labelPos = $derived.by(() => {
    const result = new Map<(typeof layout.edges)[number], { x: number; y: number }>();
    if (layout.direction !== "tb") return result;
    const at = (seg: Segment, t: number) => {
      const u = 1 - t;
      const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      return {
        x: k[0] * seg.p0.x + k[1] * seg.c1.x + k[2] * seg.c2.x + k[3] * seg.p3.x,
        y: k[0] * seg.p0.y + k[1] * seg.c1.y + k[2] * seg.c2.y + k[3] * seg.p3.y,
      };
    };
    /** Point on a downward segment at height y (y is monotonic along it). */
    const atY = (seg: Segment, y: number) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (at(seg, mid).y < y) lo = mid;
        else hi = mid;
      }
      return at(seg, (lo + hi) / 2);
    };
    const width = (e: (typeof layout.edges)[number]) => 34 + 6.6 * fmtRate(e.edge.rate, app.cfg.unit).length;
    const gaps = new Map<number, (typeof layout.edges)[number][]>();
    for (const e of layout.edges) {
      const key = Math.round(e.segments.at(-1)!.p0.y);
      gaps.set(key, [...(gaps.get(key) ?? []), e]);
    }
    const TIERS = [0, -20, 20];
    for (const list of gaps.values()) {
      const items = list
        .map((e) => ({ e, seg: e.segments.at(-1)!, w: width(e) }))
        .map((it) => ({ ...it, mid: at(it.seg, 0.5) }))
        .sort((a, b) => a.mid.x - b.mid.x);
      const taken: { left: number; right: number; tier: number }[] = [];
      for (const it of items) {
        let best = { tier: 0, overlap: Infinity, point: it.mid };
        for (const [tier, dy] of TIERS.entries()) {
          const point = dy ? atY(it.seg, it.mid.y + dy) : it.mid;
          const left = point.x - it.w / 2 - 4;
          const right = point.x + it.w / 2 + 4;
          const overlap = taken
            .filter((t) => t.tier === tier)
            .reduce((n, t) => n + Math.max(0, Math.min(right, t.right) - Math.max(left, t.left)), 0);
          if (overlap < best.overlap) best = { tier, overlap, point };
          if (!overlap) break;
        }
        taken.push({ left: best.point.x - it.w / 2 - 4, right: best.point.x + it.w / 2 + 4, tier: best.tier });
        result.set(it.e, best.point);
      }
    }
    return result;
  });
  const unit = $derived(app.cfg.unit);
  const maxRate = $derived(Math.max(1e-9, ...graph.edges.map((e) => e.rate)));
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
    if (e.pointerType !== "mouse" || !viewport || (e.target as HTMLElement).closest(".flow-card, .edge-label, .build-check") || e.button !== 0) return;
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
    for (const e of graph.edges) {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    }
    return set;
  });
  const linked = (e: FlowEdge) => !focus || e.from === focus || e.to === focus;

  const strokeWidth = (rate: number) => 1.5 + 3 * Math.sqrt(rate / maxRate);
  const nodeById = $derived(new Map(graph.nodes.map((n) => [n.id, n])));
  const selectedNode = $derived(selected ? nodeById.get(selected) : undefined);

  function nodeLabel(id: string) {
    const n = nodeById.get(id);
    if (!n) return id;
    if (n.kind === "recipe") return `${n.line!.machinesBuilt} × ${displayName(n.line!.recipe.workstation)} (${displayName(n.material)})`;
    if (n.kind === "target") return `Target: ${displayName(n.material)}`;
    return `${displayName(n.material)} (${n.kind === "loop" ? "supply separately" : "raw input"})`;
  }

  // --- build checklist ---
  function toggleBuilt(line: RecipePlan) {
    const done = app.builtCount(line.recipe.id) >= line.machinesBuilt;
    app.setBuilt(line.recipe.id, done ? 0 : line.machinesBuilt);
  }

  const progress = $derived.by(() => {
    let groups = 0;
    let builtGroups = 0;
    let machines = 0;
    let builtMachines = 0;
    for (const line of plan.recipes.values()) {
      if (line.machinesBuilt <= 0) continue;
      const done = Math.min(app.builtCount(line.recipe.id), line.machinesBuilt);
      groups++;
      machines += line.machinesBuilt;
      builtMachines += done;
      if (done >= line.machinesBuilt) builtGroups++;
    }
    return { groups, builtGroups, machines, builtMachines };
  });

  function resetBuilt() {
    if (confirm("Clear all build checkmarks for this plan?")) app.resetBuilt();
  }

  /** Outputs of a recipe line that nothing consumes. */
  function surplusOf(n: FlowNode) {
    if (!n.line) return [];
    return n.line.outputs
      .map((o) => {
        const used = graph.edges.filter((e) => e.from === n.id && e.material === o.material).reduce((s, e) => s + e.rate, 0);
        return { material: o.material, rate: o.rate - used };
      })
      .filter((o) => o.rate > 1e-7);
  }
</script>

{#if graph.nodes.length}
  <Staffing {plan} {app} />
  <Sites {plan} {app} />
  <details class="station-strip" bind:open={stationsOpen}>
    <summary class="muted small">
      {total} machines · {plan.stations.length} workstation types{stationsOpen ? ":" : ""}
    </summary>
    <div class="station-chips">
      {#each plan.stations as s (s.workstation)}
        <span class="station-chip">
          <Icon id={s.workstation} size={22} />
          <strong>{s.machinesBuilt} × {displayName(s.workstation)}</strong>
          <CrewPicker workstation={s.workstation} {app} />
        </span>
      {/each}
    </div>
  </details>

  <div class="build-progress small" class:complete={progress.machines > 0 && progress.builtMachines >= progress.machines}>
    {#if progress.builtMachines > 0}
      <span>
        <strong>Built {progress.builtGroups}/{progress.groups}</strong> groups · {progress.builtMachines}/{progress.machines}
        machines
      </span>
      <span class="progress-bar" aria-hidden="true">
        <span style:width="{(100 * progress.builtMachines) / Math.max(1, progress.machines)}%"></span>
      </span>
      <button class="small" onclick={resetBuilt}>Reset</button>
    {:else}
      <span class="muted">Tick each machine group's ✓ box as you build it.</span>
    {/if}
  </div>

  <div class="toolbar">
    <span class="muted small">
      {dir === "tb" ? "Raw inputs at the top, your targets at the bottom." : "Raw inputs on the left, your targets on the right."}
      Each card is a group of machines running one recipe, and arrows show what it feeds. Hover or tap a card to
      trace it and see details.
    </span>
    <span class="spacer"></span>
    <span class="muted small">Layout</span>
    <button class:active={dir === "lr"} title="Left to right" aria-label="Lay out left to right" onclick={() => (direction = "lr")}>↔<span class="wide-only"> Across</span></button>
    <button class:active={dir === "tb"} title="Top to bottom" aria-label="Lay out top to bottom" onclick={() => (direction = "tb")}>↕<span class="wide-only"> Down</span></button>
    <span class="muted small">Zoom</span>
    <button class:active={scale === fitScale && zoom !== 0.75 && zoom !== 1} onclick={() => (zoom = "fit")}>Overview</button>
    <button class="wide-only" class:active={zoom === 0.75} onclick={() => (zoom = 0.75)}>75%</button>
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
            <!-- Fixed-size arrowheads: userSpaceOnUse stops them growing with the line width. -->
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
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
            style:left="{labelPos.get(e)?.x ?? e.x2 - 10}px"
            style:top="{labelPos.get(e)?.y ?? e.y2}px"
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
            class:built={n.line && app.builtCount(n.line.recipe.id) >= n.line.machinesBuilt}
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
                {:else if GAME.materials.get(n.material)?.siteResource}
                  <span class="tag site" title="Produced in place by the site this machine is built on">
                    from {GAME.materials.get(n.material)!.siteResource!.site}
                  </span>
                {:else}
                  <span class="tag raw">raw input</span>
                {/if}
                <span class="rate">{fmtRate(n.rate, unit)}</span>
              </span>
            {/if}
          </button>
          {#if n.line}
            {@const done = Math.min(app.builtCount(n.line.recipe.id), n.line.machinesBuilt)}
            {@const all = n.line.machinesBuilt}
            <!-- Beside the card, not inside it: a button can't contain another button. -->
            <button
              class="build-check"
              class:done={done >= all}
              class:partial={done > 0 && done < all}
              class:dim={neighbours && !neighbours.has(n.id)}
              style:left="{p.x + p.width - 6}px"
              style:top="{p.y + 6}px"
              aria-pressed={done >= all}
              aria-label="{done >= all ? 'Built' : 'Mark as built'}: {all} × {displayName(n.line.recipe.workstation)} ({displayName(n.material)})"
              title={done >= all ? "Built. Tap to untick" : done ? `${done} of ${all} built. Tap to tick all` : "Tap when built"}
              onclick={() => toggleBuilt(n.line!)}
            >
              {done >= all ? "✓" : done > 0 ? `${done}/${all}` : ""}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  </div>

  {#if selectedNode}
    {@const n = selectedNode}
    {@const fedBy = graph.edges.filter((e) => e.to === n.id)}
    {@const feeds = graph.edges.filter((e) => e.from === n.id)}
    <section class="card flow-details" bind:this={details}>
      <header class="card-row">
        <Icon id={n.line ? n.line.recipe.workstation : n.material} size={32} />
        <h3>{nodeLabel(n.id)}</h3>
        <span class="spacer"></span>
        <button class="icon-btn" aria-label="Close details" onclick={() => (selected = null)}>✕</button>
      </header>
      {#if n.line}
        {#if GAME.workstations.get(n.line.recipe.workstation)?.site}
          <p class="small">
            Built on: <strong>{n.line.machinesBuilt} × {GAME.workstations.get(n.line.recipe.workstation)!.site}</strong>
            <span class="muted">(one per machine)</span>
          </p>
        {/if}
        <p class="small muted">
          {n.line.recipe.name} · {fmt(n.line.machines, 3)} machines exactly ({fmtLoad(n.line.machines)} busy) ·
          {fmt(n.line.crafts, 3)} crafts/min
          {#if n.line.recipe.cycles}· growth recipe, rate approximate{/if}
        </p>
        <div class="detail-controls">
          <label class="small">Sparks <CrewPicker workstation={n.line.recipe.workstation} {app} /></label>
          <label class="small">Recipe <RecipePicker material={n.material} {solver} {app} /></label>
          <span class="built-stepper small">
            Built
            <button
              class="icon-btn"
              aria-label="One fewer built"
              disabled={app.builtCount(n.line.recipe.id) <= 0}
              onclick={() => app.setBuilt(n.line!.recipe.id, Math.min(app.builtCount(n.line!.recipe.id), n.line!.machinesBuilt) - 1)}
            >−</button>
            <strong>{Math.min(app.builtCount(n.line.recipe.id), n.line.machinesBuilt)} / {n.line.machinesBuilt}</strong>
            <button
              class="icon-btn"
              aria-label="One more built"
              disabled={app.builtCount(n.line.recipe.id) >= n.line.machinesBuilt}
              onclick={() => app.setBuilt(n.line!.recipe.id, app.builtCount(n.line!.recipe.id) + 1)}
            >+</button>
          </span>
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
