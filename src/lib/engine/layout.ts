/**
 * Layered layout for the build diagram (a light Sugiyama-style layout):
 *   1. Layers: targets last; every other node sits one layer before the furthest node it feeds,
 *      so arrows always point forward.
 *   2. Lanes: an arrow that skips layers gets a placeholder ("lane") in every layer it crosses.
 *      Lanes are ordered and spaced like cards, so the arrow runs through a gap reserved for it
 *      and never passes behind a machine.
 *   3. Order within a layer: a few barycenter sweeps to reduce crossings.
 *   4. Coordinates: layers are centred; arrow ports are spread along each card edge, sorted by
 *      where the arrow goes next, so arrows into one card don't pile up.
 * Loop-backs make arrows that run back to an earlier layer. Those are routed around the outside
 * of the diagram (below it, or to its right when top-to-bottom), each in its own track, so they
 * never pass behind a machine either.
 * `direction: "lr"` lays layers out as columns (left to right); "tb" as rows (top to bottom),
 * which suits narrow screens.
 */
import type { FlowEdge, FlowNode } from "./solver";

export interface LayoutOptions {
  cardWidth: number;
  /** Gap between layers (columns, or rows when top-to-bottom); arrows curve through it. */
  columnGap: number;
  /** Gap between cards (and lanes) in the same layer. */
  rowGap: number;
  /** "lr": left to right (default). "tb": top to bottom. */
  direction?: "lr" | "tb";
  /** Card height for a node with the given number of incoming and outgoing arrows. */
  height: (node: FlowNode, inputs: number, outputs: number) => number;
}

export interface PlacedNode {
  node: FlowNode;
  /** Layer index: the column (left to right) or the row (top to bottom). */
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A cubic Bézier piece of an arrow (straight pieces have control points on the line). */
export interface Segment {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

export interface PlacedEdge {
  edge: FlowEdge;
  /** Where the arrow leaves its source card. */
  x1: number;
  y1: number;
  /** Where the arrow enters its destination card (labels sit here). */
  x2: number;
  y2: number;
  segments: Segment[];
  /** SVG path for the arrow. */
  path: string;
  /** Runs back to an earlier layer (a loop-back), around the outside of the diagram. */
  back?: boolean;
  /**
   * Loop-backs carrying the same item into the same card share one track and one way in, so they
   * read as one arrow. Every edge in the group has this; only the lead one shows the label.
   */
  group?: { rate: number; edges: FlowEdge[]; lead: boolean };
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
  columns: number;
  direction: "lr" | "tb";
}

/** Thickness of a lane reserved for an arrow passing through a layer. */
const LANE = 6;
/** Loop-back arrows: distance of the first track outside the cards, and spacing between tracks. */
const BACK_MARGIN = 24;
const BACK_TRACK = 12;
/** Room beside the outermost track for its rate label (half a label's width). */
const BACK_LABEL_ROOM = 48;

interface Vertex {
  id: string;
  /** Real node, or undefined for a lane. */
  node?: FlowNode;
  layer: number;
}

export function layoutFlow(nodes: FlowNode[], edges: FlowEdge[], opt: LayoutOptions): Layout {
  const tb = opt.direction === "tb";
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const live = edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);
  const outReal = new Map<string, FlowEdge[]>(nodes.map((n) => [n.id, []]));
  const incReal = new Map<string, FlowEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of live) {
    outReal.get(e.from)!.push(e);
    incReal.get(e.to)!.push(e);
  }

  // 1. Pick the arrows that point back (loop-backs): keep every ordinary arrow, then add loop
  //    arrows one at a time, own-chain ones before fed-back byproducts, keeping each one that
  //    doesn't close a cycle. What's left over runs back up the line.
  const forward = new Map<string, FlowEdge[]>(nodes.map((n) => [n.id, []]));
  const reaches = (from: string, to: string) => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === to) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of forward.get(id)!) stack.push(e.to);
    }
    return false;
  };
  for (const e of live) if (!e.loop) forward.get(e.from)!.push(e);
  const order = { chain: 0, byproduct: 1 } as const;
  for (const e of live.filter((x) => x.loop).sort((a, b) => order[a.loop!] - order[b.loop!])) {
    if (!reaches(e.to, e.from)) forward.get(e.from)!.push(e);
  }

  // 2. Rank = longest path to a sink along those arrows. Any cycle left (only possible with
  //    user-chosen loops) is broken by marking nodes in progress.
  const rank = new Map<string, number>();
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): number => {
    if (state.get(id) === 2) return rank.get(id)!;
    if (state.get(id) === 1) return -1;
    state.set(id, 1);
    let r = 0;
    for (const e of forward.get(id)!) {
      const s = visit(e.to);
      if (s >= 0) r = Math.max(r, s + 1);
    }
    if (byId.get(id)!.kind === "target") r = 0; // targets always sit in the last layer
    state.set(id, 2);
    rank.set(id, r);
    return r;
  };
  nodes.forEach((n) => visit(n.id));
  const maxRank = Math.max(0, ...rank.values());
  const layerCount = maxRank + 1;

  // 2. Vertices: real nodes plus one lane per layer an arrow skips over.
  const vertices = new Map<string, Vertex>();
  for (const n of nodes) vertices.set(n.id, { id: n.id, node: n, layer: maxRank - rank.get(n.id)! });
  const chain = new Map<FlowEdge, string[]>();
  const outV = new Map<string, string[]>();
  const incV = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    outV.set(a, [...(outV.get(a) ?? []), b]);
    incV.set(b, [...(incV.get(b) ?? []), a]);
  };
  live.forEach((e, i) => {
    const from = vertices.get(e.from)!.layer;
    const to = vertices.get(e.to)!.layer;
    const ids = [e.from];
    for (let l = from + 1; l < to; l++) {
      const id = `lane:${i}:${l}`;
      vertices.set(id, { id, layer: l });
      ids.push(id);
    }
    ids.push(e.to);
    for (let k = 1; k < ids.length; k++) link(ids[k - 1], ids[k]);
    chain.set(e, ids);
  });
  const outs = (id: string) => outV.get(id) ?? [];
  const ins = (id: string) => incV.get(id) ?? [];

  // Initial order: depth-first back from the targets, so related vertices start together.
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  const seen = new Set<string>();
  const place = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    layers[vertices.get(id)!.layer].push(id);
    ins(id).forEach(place);
  };
  nodes.filter((n) => n.kind === "target").forEach((n) => place(n.id));
  vertices.forEach((v) => place(v.id));

  // 3. Barycenter sweeps.
  const pos = new Map<string, number>();
  const index = () => layers.forEach((layer) => layer.forEach((id, i) => pos.set(id, i / Math.max(1, layer.length - 1))));
  index();
  const sweep = (layer: string[], neighbours: (id: string) => string[]) => {
    const bary = new Map<string, number>();
    for (const id of layer) {
      const ns = neighbours(id);
      bary.set(id, ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!);
    }
    layer.sort((a, b) => bary.get(a)! - bary.get(b)!);
  };
  for (let it = 0; it < 8; it++) {
    for (let l = layerCount - 2; l >= 0; l--) {
      sweep(layers[l], outs);
      index();
    }
    for (let l = 1; l < layerCount; l++) {
      sweep(layers[l], ins);
      index();
    }
  }

  // 4. Coordinates. "Across" runs along a layer (y for lr, x for tb); "along" runs with the flow.
  const cardSize = (id: string) => {
    const n = byId.get(id)!;
    return { w: opt.cardWidth, h: opt.height(n, incReal.get(id)!.length, outReal.get(id)!.length) };
  };
  const acrossSize = (id: string) => (vertices.get(id)!.node ? (tb ? cardSize(id).w : cardSize(id).h) : LANE);
  const layerLength = layers.map((layer) => layer.reduce((n, id, i) => n + acrossSize(id) + (i ? opt.rowGap : 0), 0));
  const layerDepth = layers.map((layer) =>
    tb ? Math.max(0, ...layer.filter((id) => vertices.get(id)!.node).map((id) => cardSize(id).h)) : opt.cardWidth,
  );
  const crossSize = Math.max(0, ...layerLength);
  const layerStart: number[] = [];
  let along = 0;
  for (let l = 0; l < layerCount; l++) {
    layerStart.push(along);
    along += layerDepth[l] + opt.columnGap;
  }
  const flowSize = Math.max(0, along - opt.columnGap);

  const placed = new Map<string, PlacedNode>();
  /** Centre of each lane, across the layer. */
  const laneAt = new Map<string, number>();
  const acrossCentre = new Map<string, number>();
  layers.forEach((layer, l) => {
    let p = (crossSize - layerLength[l]) / 2;
    for (const id of layer) {
      const size = acrossSize(id);
      acrossCentre.set(id, p + size / 2);
      const v = vertices.get(id)!;
      if (v.node) {
        const { w, h } = cardSize(id);
        // In tb, cards in a row are top-aligned, so arrows leave from a common baseline.
        placed.set(id, { node: v.node, column: l, x: tb ? p : layerStart[l], y: tb ? layerStart[l] : p, width: w, height: h });
      } else {
        laneAt.set(id, p + size / 2);
      }
      p += size + opt.rowGap;
    }
  });

  const isBack = (e: FlowEdge) => vertices.get(e.to)!.layer <= vertices.get(e.from)!.layer;
  // Ports: spread along the card edge facing the flow, ordered by where each arrow goes next.
  const port = new Map<FlowEdge, { out: number; in: number }>();
  const spread = (card: PlacedNode, list: FlowEdge[], neighbour: (e: FlowEdge) => string, side: "out" | "in") => {
    // Loop-backs leave from the end nearest their track, outside the diagram.
    const key = (e: FlowEdge) => (isBack(e) ? Infinity : acrossCentre.get(neighbour(e))!);
    const sorted = [...list].sort((a, b) => key(a) - key(b));
    const start = tb ? card.x : card.y;
    const length = tb ? card.width : card.height;
    const inset = Math.min(18, length * 0.2);
    sorted.forEach((e, i) => {
      const p = port.get(e) ?? { out: 0, in: 0 };
      p[side] = sorted.length === 1 ? start + length / 2 : start + inset + ((length - 2 * inset) * i) / (sorted.length - 1);
      port.set(e, p);
    });
  };
  // Loop-backs, grouped by the card and item they bring back.
  const backGroups = new Map<string, FlowEdge[]>();
  for (const e of live) {
    if (!isBack(e)) continue;
    const key = [e.to, e.material, e.fuel ? 1 : 0].join("|");
    backGroups.set(key, [...(backGroups.get(key) ?? []), e]);
  }
  const groupOf = new Map<FlowEdge, { index: number; edges: FlowEdge[] }>();
  [...backGroups.values()].forEach((edges, index) => edges.forEach((e) => groupOf.set(e, { index, edges })));
  /** No other card beyond this one in its layer, on the side the loop-back tracks run. */
  const outermost = (id: string) => {
    const layer = layers[vertices.get(id)!.layer];
    return layer.slice(layer.indexOf(id) + 1).every((v) => !vertices.get(v)!.node);
  };

  for (const [id, card] of placed) {
    spread(card, outReal.get(id)!, (e) => chain.get(e)![1], "out");
    // Loop-backs come in their own way (below), so they don't take ports from the ordinary inputs.
    spread(card, incReal.get(id)!.filter((e) => !isBack(e)), (e) => chain.get(e)!.at(-2)!, "in");
  }

  // Arrow geometry: straight through each lane, curving only in the gaps between layers.
  const pt = (alongV: number, acrossV: number): Point => (tb ? { x: acrossV, y: alongV } : { x: alongV, y: acrossV });
  const straight = (a: Point, b: Point): Segment => ({
    p0: a,
    c1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    c2: { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
    p3: b,
  });
  const curve = (a: Point, b: Point): Segment => {
    if (tb) {
      const d = (b.y - a.y) / 2;
      return { p0: a, c1: { x: a.x, y: a.y + d }, c2: { x: b.x, y: b.y - d }, p3: b };
    }
    const d = (b.x - a.x) / 2;
    return { p0: a, c1: { x: a.x + d, y: a.y }, c2: { x: b.x - d, y: b.y }, p3: b };
  };

  const placedEdges: PlacedEdge[] = [];
  let backCount = 0;
  let flowEnd = flowSize;
  for (const e of live) {
    const ids = chain.get(e)!;
    const a = placed.get(e.from)!;
    const b = placed.get(e.to)!;
    const p = port.get(e)!;
    const la = vertices.get(e.from)!.layer;
    const lb = vertices.get(e.to)!.layer;
    const segments: Segment[] = [];
    const back = lb <= la;
    const group = groupOf.get(e);
    if (back && group) {
      // Loop-back: out of the source, round the outside on its group's track, into the target.
      // Several sources of one item into one card share the track and the way in.
      const k = group.index;
      const d = Math.min(opt.columnGap / 3, 10 + 6 * k);
      const g1 = layerStart[la] + layerDepth[la] + d;
      const outside = crossSize + BACK_MARGIN + BACK_TRACK * k;
      const points = [pt(tb ? a.y + a.height : a.x + a.width, p.out), pt(g1, p.out), pt(g1, outside)];
      const bAlongStart = tb ? b.y : b.x;
      const bAlongSize = tb ? b.height : b.width;
      const bAcrossEnd = tb ? b.x + b.width : b.y + b.height;
      if (outermost(e.to)) {
        // Nothing beyond the target: come straight in from the side facing the track.
        const mid = bAlongStart + bAlongSize / 2;
        points.push(pt(mid, outside), pt(mid, bAcrossEnd));
      } else {
        // Otherwise through the gap before it, into the far end of its input edge.
        const g2 = layerStart[lb] - d;
        const inset = Math.min(14, (tb ? b.width : b.height) * 0.15);
        points.push(pt(g2, outside), pt(g2, bAcrossEnd - inset), pt(bAlongStart, bAcrossEnd - inset));
      }
      backCount = Math.max(backCount, k + 1);
      for (let i = 1; i < points.length; i++) segments.push(straight(points[i - 1], points[i]));
      flowEnd = Math.max(flowEnd, g1);
    } else {
      // Leave the source card, and in tb drop to the bottom of its row first (cards are top-aligned).
      let cur = tb ? { x: p.out, y: a.y + a.height } : { x: a.x + a.width, y: p.out };
      const layerEnd = layerStart[la] + layerDepth[la];
      if (tb && cur.y < layerEnd) {
        const down = { x: cur.x, y: layerEnd };
        segments.push(straight(cur, down));
        cur = down;
      }
      for (const id of ids.slice(1, -1)) {
        const l = vertices.get(id)!.layer;
        const entry = pt(layerStart[l], laneAt.get(id)!);
        const exit = pt(layerStart[l] + layerDepth[l], laneAt.get(id)!);
        segments.push(curve(cur, entry), straight(entry, exit));
        cur = exit;
      }
      segments.push(curve(cur, tb ? { x: p.in, y: b.y } : { x: b.x, y: p.in }));
    }
    const f = (q: Point) => `${+q.x.toFixed(1)} ${+q.y.toFixed(1)}`;
    const path = `M ${f(segments[0].p0)} ${segments.map((s) => `C ${f(s.c1)}, ${f(s.c2)}, ${f(s.p3)}`).join(" ")}`;
    const first = segments[0].p0;
    const last = segments.at(-1)!.p3;
    placedEdges.push({
      edge: e,
      x1: first.x,
      y1: first.y,
      x2: last.x,
      y2: last.y,
      segments,
      path,
      ...(back ? { back } : {}),
      ...(group
        ? { group: { rate: group.edges.reduce((n, x) => n + x.rate, 0), edges: group.edges, lead: group.edges[0] === e } }
        : {}),
    });
  }
  // Top to bottom, the tracks run down the right-hand side: leave room for their labels too.
  const crossTotal = crossSize + (backCount ? BACK_MARGIN + BACK_TRACK * backCount + (tb ? BACK_LABEL_ROOM : 0) : 0);

  return {
    nodes: [...placed.values()],
    edges: placedEdges,
    width: tb ? crossTotal : flowEnd,
    height: tb ? flowEnd : crossTotal,
    columns: layerCount,
    direction: tb ? "tb" : "lr",
  };
}

/**
 * Give every consumer of a raw input (or a supply-separately input) its own source card.
 * Those aren't machines, just "bring this in here", so one shared card would only drag long
 * arrows across the diagram. Totals are unchanged: each copy carries its edge's rate.
 */
export function splitSources(nodes: FlowNode[], edges: FlowEdge[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const outCount = new Map<string, number>();
  for (const e of edges) outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
  const isSplit = (n: FlowNode) => (n.kind === "raw" || n.kind === "loop") && (outCount.get(n.id) ?? 0) > 1;
  const split = new Set(nodes.filter(isSplit).map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outNodes = nodes.filter((n) => !split.has(n.id));
  const outEdges: FlowEdge[] = [];
  const copies = new Map<string, number>();
  for (const e of edges) {
    if (!split.has(e.from)) {
      outEdges.push(e);
      continue;
    }
    const i = (copies.get(e.from) ?? 0) + 1;
    copies.set(e.from, i);
    const id = `${e.from}#${i}`;
    outNodes.push({ ...byId.get(e.from)!, id, rate: e.rate });
    outEdges.push({ ...e, from: id });
  }
  return { nodes: outNodes, edges: outEdges };
}
