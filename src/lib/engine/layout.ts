/**
 * Layered layout for the build diagram (a light Sugiyama-style layout):
 *   1. Columns: targets on the right; every other node sits one column left of the furthest
 *      node it feeds, so arrows always point right.
 *   2. Order within a column: a few barycenter sweeps to reduce crossings.
 *   3. Coordinates: columns are vertically centred; arrow ports are spread along each card edge,
 *      sorted by where the other end is, so arrows into one card don't pile up.
 * With `direction: "tb"` the same layers become rows (raw inputs at the top, targets at the
 * bottom, arrows pointing down), which suits narrow screens.
 */
import type { FlowEdge, FlowNode } from "./solver";

export interface LayoutOptions {
  cardWidth: number;
  /** Gap between layers (columns, or rows when top-to-bottom); arrows run through it. */
  columnGap: number;
  /** Gap between cards in the same layer. */
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

export interface PlacedEdge {
  edge: FlowEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** SVG path for the arrow. */
  path: string;
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
  columns: number;
  direction: "lr" | "tb";
}

export function layoutFlow(nodes: FlowNode[], edges: FlowEdge[], opt: LayoutOptions): Layout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, FlowEdge[]>();
  const inc = new Map<string, FlowEdge[]>();
  for (const n of nodes) {
    out.set(n.id, []);
    inc.set(n.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to) || e.from === e.to) continue;
    out.get(e.from)!.push(e);
    inc.get(e.to)!.push(e);
  }

  // 1. Rank = longest path to a sink. Back edges (only possible with user-chosen loops) are
  //    ignored by marking nodes in progress.
  const rank = new Map<string, number>();
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): number => {
    if (state.get(id) === 2) return rank.get(id)!;
    if (state.get(id) === 1) return -1;
    state.set(id, 1);
    let r = 0;
    for (const e of out.get(id)!) {
      const s = visit(e.to);
      if (s >= 0) r = Math.max(r, s + 1);
    }
    // Targets always sit in the last column.
    if (byId.get(id)!.kind === "target") r = 0;
    state.set(id, 2);
    rank.set(id, r);
    return r;
  };
  nodes.forEach((n) => visit(n.id));
  const maxRank = Math.max(0, ...rank.values());
  const columnOf = (id: string) => maxRank - rank.get(id)!;

  const columns: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  // Initial order: depth-first from the targets, so related nodes start close together.
  const seen = new Set<string>();
  const place = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    columns[columnOf(id)].push(id);
    [...inc.get(id)!].sort((a, b) => b.rate - a.rate).forEach((e) => place(e.from));
  };
  nodes.filter((n) => n.kind === "target").forEach((n) => place(n.id));
  nodes.forEach((n) => place(n.id));

  // 2. Barycenter sweeps.
  const pos = new Map<string, number>();
  const index = () => columns.forEach((col) => col.forEach((id, i) => pos.set(id, i / Math.max(1, col.length - 1))));
  index();
  const sweep = (col: string[], neighbours: (id: string) => string[]) => {
    const bary = new Map<string, number>();
    col.forEach((id) => {
      const ns = neighbours(id).filter((n) => pos.has(n));
      bary.set(id, ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!);
    });
    col.sort((a, b) => bary.get(a)! - bary.get(b)!);
  };
  for (let it = 0; it < 8; it++) {
    for (let c = columns.length - 2; c >= 0; c--) {
      sweep(columns[c], (id) => out.get(id)!.map((e) => e.to));
      index();
    }
    for (let c = 1; c < columns.length; c++) {
      sweep(columns[c], (id) => inc.get(id)!.map((e) => e.from));
      index();
    }
  }

  // 3. Coordinates. A layer's "length" runs across the flow (height for lr, width for tb); its
  //    "depth" runs along the flow (card width for lr, tallest card for tb).
  const tb = opt.direction === "tb";
  const placed = new Map<string, PlacedNode>();
  const size = (id: string) => ({
    w: opt.cardWidth,
    h: opt.height(byId.get(id)!, inc.get(id)!.length, out.get(id)!.length),
  });
  const across = (id: string) => (tb ? size(id).w : size(id).h);
  const layerLength = columns.map((col) => col.reduce((n, id, i) => n + across(id) + (i ? opt.rowGap : 0), 0));
  const layerDepth = columns.map((col) => (tb ? Math.max(0, ...col.map((id) => size(id).h)) : opt.cardWidth));
  const crossSize = Math.max(0, ...layerLength);
  let along = 0;
  columns.forEach((col, c) => {
    let pos = (crossSize - layerLength[c]) / 2;
    for (const id of col) {
      const { w, h } = size(id);
      // In tb, cards in a row are top-aligned so arrows leave from a common baseline.
      placed.set(id, { node: byId.get(id)!, column: c, x: tb ? pos : along, y: tb ? along : pos, width: w, height: h });
      pos += across(id) + opt.rowGap;
    }
    along += layerDepth[c] + opt.columnGap;
  });
  const flowSize = Math.max(0, along - opt.columnGap);
  const width = tb ? crossSize : flowSize;
  const height = tb ? flowSize : crossSize;

  // Ports: spread along the card edge facing the flow, ordered by the other end's position.
  const centre = (n: PlacedNode) => (tb ? n.x + n.width / 2 : n.y + n.height / 2);
  const port = new Map<FlowEdge, { out: number; in: number }>();
  const spread = (list: FlowEdge[], card: PlacedNode, other: (e: FlowEdge) => PlacedNode, side: "out" | "in") => {
    const sorted = [...list].sort((a, b) => centre(other(a)) - centre(other(b)));
    const start = tb ? card.x : card.y;
    const length = tb ? card.width : card.height;
    const inset = Math.min(18, length * 0.2);
    sorted.forEach((e, i) => {
      const p = port.get(e) ?? { out: 0, in: 0 };
      p[side] = sorted.length === 1 ? start + length / 2 : start + inset + ((length - 2 * inset) * i) / (sorted.length - 1);
      port.set(e, p);
    });
  };
  for (const [id, card] of placed) {
    spread(out.get(id)!, card, (e) => placed.get(e.to)!, "out");
    spread(inc.get(id)!, card, (e) => placed.get(e.from)!, "in");
  }

  const placedEdges: PlacedEdge[] = [];
  for (const e of edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    const p = port.get(e);
    if (!a || !b || !p) continue;
    if (tb) {
      const x1 = p.out;
      const y1 = a.y + a.height;
      const x2 = p.in;
      const y2 = b.y;
      const dy = Math.max(30, (y2 - y1) / 2);
      placedEdges.push({ edge: e, x1, y1, x2, y2, path: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}` });
    } else {
      const x1 = a.x + a.width;
      const x2 = b.x;
      const y1 = p.out;
      const y2 = p.in;
      const dx = Math.max(40, (x2 - x1) / 2);
      placedEdges.push({ edge: e, x1, y1, x2, y2, path: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` });
    }
  }

  return {
    nodes: [...placed.values()],
    edges: placedEdges,
    width,
    height,
    columns: columns.length,
    direction: tb ? "tb" : "lr",
  };
}
