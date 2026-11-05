<script lang="ts">
  // The editing surface: an SVG grid with pan/zoom (wheel, drag, pinch), parts, wires and moving
  // items. Touch-first: tap a palette entry then tap the grid to place; tap a port then another
  // port to wire; drag parts to move them.
  import { iconUrl } from "$lib/components/icons";
  import { connectLogic, freeSpot, makePart, newId, overlaps, partSize, planWire } from "../circuit";
  import { bezierPoint, wireCurve, type Point } from "../geometry";
  import { cellKey, cellLine, DIRS, erase, kindOf, maskOf, paint, parseKey, portCell } from "../grid";
  import { PARTS } from "../parts";
  import { placedPort, type Sim } from "../sim";
  import type { LogicStore } from "../store.svelte";
  import type { Circuit, Part, PortDef, PortRef, Rot } from "../types";
  import type { Tool } from "../store.svelte";
  import PartView from "./PartView.svelte";

  let {
    store,
    sim,
    frame,
    running,
    placing = $bindable(),
    wiringFrom = $bindable(),
    tool = $bindable("select"),
    notify,
  }: {
    store: LogicStore;
    sim: Sim;
    frame: number;
    running: boolean;
    placing: string | null;
    wiringFrom: PortRef | null;
    tool?: Tool;
    notify: (msg: string) => void;
  } = $props();

  let svg: SVGSVGElement;
  let width = $state(800);
  let height = $state(600);
  /** Screen pixels per grid cell, and the screen position of grid (0, 0). */
  let zoom = $state(40);
  let tx = $state(40);
  let ty = $state(40);
  let hover = $state<Point | null>(null);
  let pointerWorld = $state<Point | null>(null);

  const circuit = $derived(store.circuit);

  // --- view ---------------------------------------------------------------------------------

  const toWorld = (sx: number, sy: number): Point => ({ x: (sx - tx) / zoom, y: (sy - ty) / zoom });
  function local(e: { clientX: number; clientY: number }) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  export function fit() {
    if (!circuit.parts.length) {
      zoom = 40;
      tx = width / 2;
      ty = height / 2;
      return;
    }
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const p of circuit.parts) {
      const s = partSize(p);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + s.w);
      y1 = Math.max(y1, p.y + s.h + 0.5);
    }
    const pad = 1;
    zoom = Math.max(10, Math.min(56, Math.min(width / (x1 - x0 + 2 * pad), height / (y1 - y0 + 2 * pad))));
    tx = (width - (x1 + x0) * zoom) / 2;
    ty = (height - (y1 + y0) * zoom) / 2;
  }

  export function zoomBy(factor: number, cx = width / 2, cy = height / 2) {
    const z = Math.max(8, Math.min(140, zoom * factor));
    const w = toWorld(cx, cy);
    zoom = z;
    tx = cx - w.x * z;
    ty = cy - w.y * z;
  }

  /** Middle of the visible area, in grid cells (where palette taps on desktop drop parts). */
  export function center(): Point {
    const w = toWorld(width / 2, height / 2);
    return { x: Math.round(w.x), y: Math.round(w.y) };
  }

  let lastFitFor = "";
  $effect(() => {
    // Fit when a different circuit is opened.
    const id = store.currentId;
    if (id !== lastFitFor && width > 0) {
      lastFitFor = id;
      queueMicrotask(fit);
    }
  });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX) * 2) {
      // Pinch on a trackpad arrives as ctrl+wheel; plain wheel zooms too.
      const k = e.deltaMode === 1 ? 0.05 : 0.0015;
      zoomBy(Math.exp(-e.deltaY * k * (e.ctrlKey ? 4 : 1)), p.x, p.y);
    } else {
      tx -= e.deltaX;
      ty -= e.deltaY;
    }
  }

  // --- live state ---------------------------------------------------------------------------

  const live = $derived.by(() => {
    void frame;
    void store.version;
    const status = new Map(circuit.parts.map((p) => [p.id, sim.status(p.id)]));
    const tokens: { id: number; item: string; x: number; y: number }[] = [];
    for (const l of sim.paths) {
      for (const t of l.tokens) {
        const pt = bezierPoint(l.curve, Math.min(1, t.pos / l.length));
        tokens.push({ id: t.token.id, item: t.token.item, x: pt.x, y: pt.y });
      }
    }
    const cellOn = new Map<string, boolean[]>();
    for (const k of Object.keys(circuit.cells)) cellOn.set(k, sim.cellOn(k));
    return { status, tokens, cellOn };
  });

  /** Short stubs from a tile to the ports plugged into it (direction from the tile centre). */
  const stubs = $derived.by(() => {
    const m = new Map<string, number[]>();
    for (const part of circuit.parts) {
      for (const port of PARTS.get(part.type)?.ports ?? []) {
        if (port.kind !== "logic") continue;
        const c = portCell(part, port);
        const k = cellKey(c.x, c.y);
        if (!circuit.cells[k]) continue;
        const d = DIRS.findIndex((v) => v.x === -c.n.x && v.y === -c.n.y);
        m.set(k, [...(m.get(k) ?? []), d]);
      }
    }
    return m;
  });

  /** Tiles as drawable segments. */
  const tiles = $derived(
    Object.entries(circuit.cells).map(([k, v]) => {
      const [x, y] = parseKey(k);
      const kind = kindOf(v)!;
      const mask = maskOf(v);
      const arms = [0, 1, 2, 3].filter((d) => mask & (1 << d));
      const ports = stubs.get(k) ?? [];
      const seg = (ds: number[]) => ds.map((d) => `M${x + 0.5} ${y + 0.5}l${DIRS[d].x * 0.5} ${DIRS[d].y * 0.5}`).join("");
      return { k, x, y, kind, d: seg([...new Set([...arms, ...ports])]), lone: arms.length + ports.length === 0, ports };
    }),
  );

  function portOn(part: string, port: string) {
    void frame;
    return sim.port(part, port);
  }

  // --- geometry for drawing -----------------------------------------------------------------

  const partById = $derived(new Map(circuit.parts.map((p) => [p.id, p])));

  function curveFor(from: PortRef, to: PortRef) {
    const a = partById.get(from.part);
    const b = partById.get(to.part);
    if (!a || !b) return null;
    return wireCurve(placedPort(a, from.port), placedPort(b, to.port));
  }
  const d = (c: [Point, Point, Point, Point]) => `M${c[0].x} ${c[0].y}C${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${c[3].x} ${c[3].y}`;

  const wiringPort = $derived(wiringFrom ? PARTS.get(partById.get(wiringFrom.part)?.type ?? "")?.ports.find((p) => p.id === wiringFrom!.port) : undefined);

  /** While wiring: whether a port could be the other end. */
  function compatible(part: Part, port: PortDef) {
    if (!wiringFrom || !wiringPort) return true;
    if (part.id === wiringFrom.part && port.id === wiringFrom.port) return true;
    return "wire" in planWire(circuit, wiringFrom, { part: part.id, port: port.id });
  }

  // --- pointer handling ---------------------------------------------------------------------

  type Press =
    | { kind: "pan"; sx: number; sy: number; tx: number; ty: number }
    | { kind: "part"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
    | { kind: "port"; ref: PortRef; sx: number; sy: number; moved: boolean }
    | { kind: "wire"; id: string; sx: number; sy: number }
    | { kind: "cell"; id: string; sx: number; sy: number; tx: number; ty: number }
    | { kind: "paint"; last: [number, number]; sx: number; sy: number }
    | { kind: "pinch" };

  const pointers = new Map<number, Point>();
  let press: Press | null = null;
  let pinch: { dist: number; mid: Point; zoom: number; world: Point } | null = null;
  const SLOP = 7;

  function targetOf(el: EventTarget | null) {
    const e = (el as Element | null)?.closest?.("[data-port],[data-part],[data-wire],[data-cell]") as HTMLElement | null;
    if (!e) return null;
    if (e.dataset.cell) return { kind: "cell" as const, id: e.dataset.cell };
    if (e.dataset.port) {
      const [part, port] = e.dataset.port.split("|");
      return { kind: "port" as const, ref: { part, port } };
    }
    if (e.dataset.part) return { kind: "part" as const, id: e.dataset.part };
    return { kind: "wire" as const, id: e.dataset.wire! };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      // Second finger: switch to pinch-zoom, cancelling whatever the first finger started.
      if ((press?.kind === "part" && press.moved) || press?.kind === "paint") store.touched();
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid, zoom, world: toWorld(mid.x, mid.y) };
      press = { kind: "pinch" };
      return;
    }
    if (pointers.size > 2) return;
    if (tool !== "select" && !placing) {
      const w = toWorld(p.x, p.y);
      const cell: [number, number] = [Math.floor(w.x), Math.floor(w.y)];
      store.checkpoint();
      press = { kind: "paint", last: cell, sx: p.x, sy: p.y };
      brush([cell]);
      return;
    }
    const t = targetOf(e.target);
    if (t?.kind === "port") press = { kind: "port", ref: t.ref, sx: p.x, sy: p.y, moved: false };
    else if (t?.kind === "part" && !placing) {
      const part = partById.get(t.id)!;
      press = { kind: "part", id: t.id, sx: p.x, sy: p.y, ox: part.x, oy: part.y, moved: false };
    } else if (t?.kind === "wire" && !placing) press = { kind: "wire", id: t.id, sx: p.x, sy: p.y };
    else if (t?.kind === "cell" && !placing) press = { kind: "cell", id: t.id, sx: p.x, sy: p.y, tx, ty };
    else press = { kind: "pan", sx: p.x, sy: p.y, tx, ty };
  }

  function onPointerMove(e: PointerEvent) {
    const p = local(e);
    if (e.pointerType === "mouse") {
      const w = toWorld(p.x, p.y);
      hover = { x: Math.floor(w.x), y: Math.floor(w.y) };
      pointerWorld = w;
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, p);
    if (press?.kind === "pinch" && pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoom = Math.max(8, Math.min(140, pinch.zoom * (dist / pinch.dist)));
      tx = mid.x - pinch.world.x * zoom;
      ty = mid.y - pinch.world.y * zoom;
      return;
    }
    if (!press || press.kind === "pinch") return;
    const far = Math.hypot(p.x - press.sx, p.y - press.sy) > SLOP;
    if (press.kind === "paint") {
      const w = toWorld(p.x, p.y);
      const cell: [number, number] = [Math.floor(w.x), Math.floor(w.y)];
      if (cell[0] === press.last[0] && cell[1] === press.last[1]) return;
      brush(cellLine(press.last[0], press.last[1], cell[0], cell[1]));
      press.last = cell;
      return;
    }
    if (press.kind === "pan" || press.kind === "cell") {
      tx = press.tx + (p.x - press.sx);
      ty = press.ty + (p.y - press.sy);
    } else if (press.kind === "part") {
      if (!press.moved && !far) return;
      const part = partById.get(press.id);
      if (!part) return;
      if (!press.moved) {
        store.checkpoint();
        press.moved = true;
        store.selection = { kind: "part", id: part.id };
      }
      part.x = press.ox + Math.round((p.x - press.sx) / zoom);
      part.y = press.oy + Math.round((p.y - press.sy) / zoom);
    } else if (press.kind === "port") {
      if (far && !press.moved) {
        press.moved = true;
        wiringFrom = press.ref;
      }
      pointerWorld = toWorld(p.x, p.y);
    }
  }

  function onPointerUp(e: PointerEvent) {
    const had = pointers.delete(e.pointerId);
    if (pointers.size === 1 && press?.kind === "pinch") {
      // One finger left after a pinch: carry on panning with it.
      const [q] = [...pointers.values()];
      press = { kind: "pan", sx: q.x, sy: q.y, tx, ty };
      pinch = null;
      return;
    }
    if (!had || pointers.size > 0) return;
    const p = local(e);
    const pr = press;
    press = null;
    pinch = null;
    if (!pr || pr.kind === "pinch") return;
    const tapped = Math.hypot(p.x - pr.sx, p.y - pr.sy) <= SLOP;

    if (pr.kind === "paint") {
      store.touched();
      return;
    }
    if (pr.kind === "cell") {
      if (tapped) {
        if (wiringFrom) wiringFrom = null;
        else store.selection = { kind: "cell", id: pr.id };
      }
      return;
    }

    if (pr.kind === "port") {
      if (pr.moved) {
        // Dragged from a port: connect to whatever port is under the finger.
        const under = targetOf(document.elementFromPoint(e.clientX, e.clientY));
        if (under?.kind === "port") connect(pr.ref, under.ref);
        else wiringFrom = null;
        pointerWorld = e.pointerType === "mouse" ? pointerWorld : null;
      } else tapPort(pr.ref);
      return;
    }
    if (pr.kind === "part") {
      if (pr.moved) {
        store.touched();
        return;
      }
      if (wiringFrom) {
        wiringFrom = null;
        return;
      }
      const part = partById.get(pr.id);
      if (part && running && PARTS.get(part.type)?.tap && sim.tap(part.id)) {
        store.selection = { kind: "part", id: part.id };
        return;
      }
      store.selection = { kind: "part", id: pr.id };
      return;
    }
    if (pr.kind === "wire") {
      if (tapped) store.selection = { kind: "wire", id: pr.id };
      return;
    }
    // Background
    if (!tapped) return;
    if (wiringFrom) {
      wiringFrom = null;
      return;
    }
    if (placing) {
      const w = toWorld(p.x, p.y);
      place(placing, Math.floor(w.x), Math.floor(w.y));
      return;
    }
    store.selection = null;
  }

  function onPointerCancel(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if ((press?.kind === "part" && press.moved) || press?.kind === "paint") store.touched();
    press = null;
    pinch = null;
  }

  // --- actions ------------------------------------------------------------------------------

  export function place(type: string, x: number, y: number) {
    const t = PARTS.get(type);
    if (!t) return;
    // Centre bigger parts on the tapped cell.
    const rot: Rot = 0;
    const spot = freeSpot(circuit, type, x - Math.floor((t.w - 1) / 2), y - Math.floor((t.h - 1) / 2), rot);
    const part = makePart(type, spot.x, spot.y, rot);
    store.edit((c) => void c.parts.push(part));
    store.selection = { kind: "part", id: part.id };
    placing = null;
  }

  function tapPort(ref: PortRef) {
    if (!wiringFrom) {
      wiringFrom = ref;
      store.selection = { kind: "part", id: ref.part };
      return;
    }
    if (wiringFrom.part === ref.part && wiringFrom.port === ref.port) {
      wiringFrom = null;
      return;
    }
    connect(wiringFrom, ref);
  }

  /** Applies the current tool to a run of tiles. */
  function brush(path: [number, number][]) {
    if (tool === "wire" || tool === "ribbon") paint(circuit.cells, tool === "wire" ? "w" : "r", path);
    else if (tool === "erase") for (const [x, y] of path) erase(circuit.cells, cellKey(x, y));
  }

  function connect(a: PortRef, b: PortRef) {
    const kindA = PARTS.get(partById.get(a.part)?.type ?? "")?.ports.find((p) => p.id === a.port)?.kind;
    if (kindA === "logic") {
      // Lay the wire on a copy first so a failed route leaves nothing behind (or in the history).
      const draft = $state.snapshot(circuit) as Circuit;
      const err = connectLogic(draft, a, b);
      if (err) {
        notify(err);
        if (err === "Already connected.") wiringFrom = null;
        return;
      }
      // Takes the new tiles, plus any Wire Bridges the route needed.
      store.edit((c) => {
        c.cells = draft.cells;
        c.parts = draft.parts;
      });
      wiringFrom = null;
      return;
    }
    const plan = planWire(circuit, a, b);
    if ("error" in plan) {
      notify(plan.error);
      // Keep wiring from the first port so a near miss can be retried.
      return;
    }
    const wire = { id: newId("w"), ...plan.wire };
    store.edit((c) => void c.wires.push(wire));
    store.selection = { kind: "wire", id: wire.id };
    wiringFrom = null;
  }

  const ghost = $derived.by(() => {
    if (!placing || !hover) return null;
    const t = PARTS.get(placing)!;
    const x = hover.x - Math.floor((t.w - 1) / 2);
    const y = hover.y - Math.floor((t.h - 1) / 2);
    return { part: { id: "ghost", type: placing, x, y, rot: 0 as Rot, cfg: t.defaults() }, clash: overlaps(circuit, placing, x, y, 0) };
  });

  const PORT_R = 0.13;
  const tokenIcon = (item: string) => iconUrl(item);
  const selectedId = $derived(store.selection?.id);
</script>

<div class="canvas-wrap" bind:clientWidth={width} bind:clientHeight={height}>
  <svg
    bind:this={svg}
    class="canvas"
    class:placing={!!placing}
    class:wiring={!!wiringFrom}
    class:painting={tool !== "select"}
    {width}
    {height}
    role="application"
    aria-label="Circuit editor"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    onpointerleave={(e) => {
      if (e.pointerType === "mouse" && !pointers.size) hover = null;
    }}
    onwheel={onWheel}
  >
    <defs>
      <pattern id="grid" width={zoom} height={zoom} patternUnits="userSpaceOnUse" x={tx} y={ty}>
        <circle cx="0.5" cy="0.5" r={zoom > 20 ? 1.1 : 0.7} class="grid-dot" />
      </pattern>
    </defs>
    <rect class="grid-bg" x="0" y="0" {width} {height} fill="url(#grid)" />
    <g transform="translate({tx} {ty}) scale({zoom})">
      <!-- Logic tiles (buried: drawn under parts) -->
      {#each tiles as t (t.k)}
        {@const on = live.cellOn.get(t.k) ?? []}
        <g data-cell={t.k} class="tile {t.kind === 'w' ? 'wire-t' : 'ribbon-t'}" class:on={on[0]} class:selected={selectedId === t.k}>
          <rect class="tile-hit" x={t.x} y={t.y} width="1" height="1" />
            <path class="seg" d={t.d} />
            {#if t.lone || t.kind === "r"}<rect class="node" x={t.x + 0.32} y={t.y + 0.32} width=".36" height=".36" rx=".08" />{/if}
            {#if t.kind === "r"}
              {#each [0, 1, 2, 3] as bit (bit)}
                <circle class="bit" class:on={on[bit]} cx={t.x + 0.41 + (bit % 2) * 0.18} cy={t.y + 0.41 + Math.floor(bit / 2) * 0.18} r=".065" />
              {/each}
            {/if}
        </g>
      {/each}

      <!-- Paths and sensor links -->
      {#each circuit.wires as w (w.id)}
        {@const c = curveFor(w.from, w.to)}
        {#if c}
          {@const kind = PARTS.get(partById.get(w.from.part)!.type)!.ports.find((p) => p.id === w.from.port)?.kind}
          <g data-wire={w.id} class="wire {kind}" class:on={kind === "logic" && portOn(w.from.part, w.from.port)} class:selected={selectedId === w.id}>
            <path class="wire-hit" d={d(c)} />
            <path class="wire-line" d={d(c)} />
          </g>
        {/if}
      {/each}

      <!-- Parts -->
      {#each circuit.parts as part (part.id)}
        <g data-part={part.id} data-type={part.type}>
          <PartView {part} status={live.status.get(part.id) ?? {}} selected={selectedId === part.id} />
        </g>
      {/each}

      <!-- Items on paths -->
      {#each live.tokens as t (t.id)}
        {@const url = tokenIcon(t.item)}
        <g class="token" transform="translate({t.x} {t.y})">
          <circle r=".2" />
          {#if url}<image href={url} x="-.17" y="-.17" width=".34" height=".34" />{/if}
        </g>
      {/each}

      <!-- Ports (on top so they're easy to hit) -->
      {#each circuit.parts as part (part.id)}
        {#each PARTS.get(part.type)?.ports ?? [] as port (port.id)}
          {@const pp = placedPort(part, port.id)}
          {@const isFrom = wiringFrom?.part === part.id && wiringFrom?.port === port.id}
          <g
            data-port="{part.id}|{port.id}"
            class="port {port.kind} {port.dir}"
            class:on={port.kind === "logic" && portOn(part.id, port.id)}
            class:from={isFrom}
            class:dim={!!wiringFrom && !compatible(part, port)}
            transform="translate({pp.p.x} {pp.p.y})"
          >
            <circle class="port-hit" r={Math.min(0.42, Math.max(0.3, 14 / zoom))} />
            {#if port.kind === "item"}
              <rect class="port-dot" x={-PORT_R} y={-PORT_R} width={PORT_R * 2} height={PORT_R * 2} rx=".03" />
            {:else if port.kind === "observe"}
              <path class="port-dot" d="M{-PORT_R * 1.2} 0L0 {-PORT_R * 1.2}L{PORT_R * 1.2} 0L0 {PORT_R * 1.2}Z" />
            {:else}
              <circle class="port-dot" r={PORT_R} />
            {/if}
          </g>
        {/each}
      {/each}

      <!-- Wire being drawn -->
      {#if wiringFrom && pointerWorld && partById.get(wiringFrom.part)}
        {@const a = placedPort(partById.get(wiringFrom.part)!, wiringFrom.port)}
        <path class="rubber" d="M{a.p.x} {a.p.y}L{pointerWorld.x} {pointerWorld.y}" />
      {/if}

      {#if ghost}
        <g class:clash={ghost.clash}><PartView part={ghost.part} status={{}} ghost /></g>
      {/if}
    </g>
  </svg>
</div>
