// Grid wiring, as in the game: logic travels along wire tiles laid on the grid. A tile is a plain
// wire or a ribbon (four signals, bits 0–3). Wires cross with a Wire Bridge, a three-tile building
// (end, gap, end) whose ends are joined, hopping over whatever runs through the gap.
//
// Each tile records which neighbours it joins (the directions it was drawn in). Two tiles connect
// when both point at each other, so wires can run side by side without merging, as they do in the
// game. A plain wire joined to a ribbon lands on the ribbon's bit 0, as the wiki describes. A
// part's logic port plugs into the tile just outside it, in the direction the port faces.
// Framework-free.
import { footprint, portPosition, type Point } from "./geometry";
import { PARTS } from "./parts";
import type { CellKind, Circuit, Part, PortDef, PortRef } from "./types";

export type { CellKind };

/** Path tile kinds and their walking speed (wiki: Dirt Path 60 %, Stone Path 100 %). */
export const PATH_SPEED: Record<string, number> = { s: 1, d: 0.6 };
export const VALID_PATH_TILE = /^[sd](?:[0-9]|1[0-5])$/;

/** Directions: 0 right, 1 down, 2 left, 3 up. A tile's mask has bit (1 << d) to join that way. */
export const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const opp = (d: number) => (d + 2) % 4;

export const cellKey = (x: number, y: number) => `${x},${y}`;
export const parseKey = (k: string): [number, number] => {
  const i = k.indexOf(",");
  return [+k.slice(0, i), +k.slice(i + 1)];
};

/** Tile values are the kind and its join mask, e.g. "w5" (wire joining right and left). */
export const kindOf = (v: string | undefined) => v?.[0] as CellKind | undefined;
export const maskOf = (v: string | undefined) => (!v ? 0 : +v.slice(1) || 0);
export const tile = (kind: string, mask: number) => `${kind}${mask & 15}`;
export const VALID_TILE = /^[wr](?:[0-9]|1[0-5])$/;

export function dirBetween(a: [number, number], b: [number, number]): number {
  return DIRS.findIndex((d) => d.x === b[0] - a[0] && d.y === b[1] - a[1]);
}

/** Whether tiles a and b (neighbours, b in direction d from a) are joined. */
export function joined(cells: Record<string, string>, a: string, b: string, d: number): boolean {
  return !!cells[a] && !!cells[b] && (maskOf(cells[a]) & (1 << d)) !== 0 && (maskOf(cells[b]) & (1 << opp(d))) !== 0;
}

/** The tile a logic port connects through, and which way the port faces. */
export function portCell(part: Pick<Part, "x" | "y" | "rot" | "type">, port: PortDef): { x: number; y: number; n: Point } {
  const t = PARTS.get(part.type)!;
  const { p, n } = portPosition(part, t.w, t.h, port);
  return { x: Math.floor(p.x + n.x * 0.5), y: Math.floor(p.y + n.y * 0.5), n };
}

/** Grid cells covered by a part. */
export function partCells(part: Pick<Part, "x" | "y" | "rot" | "type">): string[] {
  const t = PARTS.get(part.type)!;
  const s = footprint(t.w, t.h, part.rot);
  const out: string[] = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) out.push(cellKey(part.x + x, part.y + y));
  return out;
}

export interface PortAttachment {
  part: string;
  port: string;
  dir: "in" | "out";
  /** Networks, one per bit for a port reading a whole ribbon (-1 where there is none). */
  nets: number[];
  /** The tile it plugs into. */
  cell: string;
}

export interface GridNets {
  count: number;
  /** Networks a tile carries: wire [n], ribbon [b0, b1, b2, b3]. */
  cellNets: Map<string, number[]>;
  /** "part.port" -> networks. */
  portNets: Map<string, number[]>;
  ports: PortAttachment[];
}

const node = (k: string, kind: CellKind, bit: number) => (kind === "w" ? `w${k}` : `r${k}#${bit}`);

/** Works out the logic networks formed by the tiles and the ports plugged into them. */
export function buildNets(circuit: Pick<Circuit, "parts" | "cells">): GridNets {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) {
      const nx = parent.get(c)!;
      parent.set(c, r);
      c = nx;
    }
    return r;
  };
  const add = (a: string) => {
    if (!parent.has(a)) parent.set(a, a);
    return a;
  };
  const union = (a: string, b: string) => {
    const ra = find(add(a));
    const rb = find(add(b));
    if (ra !== rb) parent.set(ra, rb);
  };
  const cells = circuit.cells;
  for (const [k, v] of Object.entries(cells)) {
    const kind = kindOf(v)!;
    if (kind === "w") add(node(k, "w", 0));
    else for (let b = 0; b < 4; b++) add(node(k, "r", b));
    const [x, y] = parseKey(k);
    // Right (d 0) and down (d 1); the other two are handled from the neighbour's side.
    for (const d of [0, 1]) {
      const nk = cellKey(x + DIRS[d].x, y + DIRS[d].y);
      if (!joined(cells, k, nk, d)) continue;
      const nkind = kindOf(cells[nk])!;
      if (kind === "r" && nkind === "r") for (let b = 0; b < 4; b++) union(node(k, "r", b), node(nk, "r", b));
      else union(node(k, kind, 0), node(nk, nkind, 0));
    }
  }

  const portNodes: { part: string; port: string; dir: "in" | "out"; nodes: (string | null)[]; cell: string }[] = [];
  for (const part of circuit.parts) {
    const t = PARTS.get(part.type);
    if (!t) continue;
    for (const port of t.ports) {
      if (port.kind !== "logic") continue;
      const c = portCell(part, port);
      const k = cellKey(c.x, c.y);
      const kind = kindOf(cells[k]);
      if (!kind) continue;
      let nodes: (string | null)[];
      if (port.bus === "all") nodes = kind === "r" ? [0, 1, 2, 3].map((b) => node(k, "r", b)) : [node(k, kind, 0), null, null, null];
      else if (port.bus === "bit" && kind === "r") nodes = [node(k, "r", Number(part.cfg.bit) || 0)];
      else nodes = [node(k, kind, 0)];
      portNodes.push({ part: part.id, port: port.id, dir: port.dir, nodes, cell: k });
    }
  }
  // Buildings whose ports are wired straight through (a Wire Bridge's two ends are one wire).
  for (const part of circuit.parts) {
    for (const [pa, pb] of PARTS.get(part.type)?.joins ?? []) {
      const na = portNodes.find((p) => p.part === part.id && p.port === pa)?.nodes[0];
      const nb = portNodes.find((p) => p.part === part.id && p.port === pb)?.nodes[0];
      if (na && nb) union(na, nb);
    }
  }

  const index = new Map<string, number>();
  const netOf = (n: string) => {
    const r = find(n);
    let i = index.get(r);
    if (i === undefined) {
      i = index.size;
      index.set(r, i);
    }
    return i;
  };
  const cellNets = new Map<string, number[]>();
  for (const [k, v] of Object.entries(cells)) {
    const kind = kindOf(v);
    cellNets.set(
      k,
      kind === "w" ? [netOf(node(k, "w", 0))] : [0, 1, 2, 3].map((b) => netOf(node(k, "r", b))),
    );
  }
  const portNets = new Map<string, number[]>();
  const ports: PortAttachment[] = [];
  for (const p of portNodes) {
    const nets = p.nodes.map((n) => (n ? netOf(n) : -1));
    portNets.set(`${p.part}.${p.port}`, nets);
    ports.push({ part: p.part, port: p.port, dir: p.dir, nets, cell: p.cell });
  }
  return { count: index.size, cellNets, portNets, ports };
}

// --- editing tiles -------------------------------------------------------------------------------

/** Joins two neighbouring tiles (both must exist). */
export function link(cells: Record<string, string>, a: string, b: string) {
  const d = dirBetween(parseKey(a), parseKey(b));
  if (d < 0 || !cells[a] || !cells[b]) return;
  for (const [k, dd] of [
    [a, d],
    [b, opp(d)],
  ] as const) {
    const v = cells[k];
    cells[k] = tile(kindOf(v)!, maskOf(v) | (1 << dd));
  }
}

/**
 * Paints a stroke of tiles (consecutive neighbours), joining each to the next. A tile already
 * there keeps its other joins; painting ribbon over wire (or back) converts it.
 */
export function paint(cells: Record<string, string>, kind: string, path: [number, number][]) {
  let prev: string | null = null;
  for (const [x, y] of path) {
    const k = cellKey(x, y);
    const v = cells[k];
    if (!v) cells[k] = tile(kind, 0);
    else if (kindOf(v) !== kind) cells[k] = tile(kind, maskOf(v));
    if (prev && prev !== k) link(cells, prev, k);
    prev = k;
  }
}

/** Removes a tile, and its neighbours' joins towards it. */
export function erase(cells: Record<string, string>, k: string) {
  if (!cells[k]) return;
  delete cells[k];
  const [x, y] = parseKey(k);
  DIRS.forEach((dv, d) => {
    const nk = cellKey(x + dv.x, y + dv.y);
    const v = cells[nk];
    if (v) cells[nk] = tile(kindOf(v)!, maskOf(v) & ~(1 << opp(d)));
  });
}

/** Every tile joined to tile k: one drawn wire or ribbon (beyond a bridge is a separate run). */
export function connectedTiles(cells: Record<string, string>, k: string): string[] {
  if (!cells[k]) return [];
  const seen = new Set([k]);
  const todo = [k];
  while (todo.length) {
    const c = todo.pop()!;
    const [x, y] = parseKey(c);
    DIRS.forEach((dv, d) => {
      const n = cellKey(x + dv.x, y + dv.y);
      if (!seen.has(n) && joined(cells, c, n, d)) {
        seen.add(n);
        todo.push(n);
      }
    });
  }
  return [...seen];
}

// --- routing -------------------------------------------------------------------------------------

export interface Route {
  /** Tiles along the wire, start to end (existing ones included where it joins them). */
  path: string[];
  /**
   * Wire Bridges to build where the new wire hops another: top-left cell and rotation (0 runs
   * left–right, 1 up–down). The path skips from the cell before the bridge to the cell after it.
   */
  bridges: { x: number; y: number; rot: 0 | 1 }[];
}

const findPort = (c: Pick<Circuit, "parts">, r: PortRef) => {
  const part = c.parts.find((p) => p.id === r.part);
  const port = part && PARTS.get(part.type)?.ports.find((p) => p.id === r.port);
  return part && port ? { part, port } : null;
};

/**
 * Lays a wire on the grid between two logic ports: a short path that goes around parts and other
 * ports, may run alongside other wires, and crosses them with a bridge where it must. Returns
 * null when there's no way through.
 */
export function routeWire(circuit: Pick<Circuit, "parts" | "cells">, a: PortRef, b: PortRef, nets = buildNets(circuit)): Route | null {
  const A = findPort(circuit, a);
  const B = findPort(circuit, b);
  if (!A || !B || A.port.kind !== "logic" || B.port.kind !== "logic") return null;
  const cells = circuit.cells;
  const sc = portCell(A.part, A.port);
  const tc = portCell(B.part, B.port);
  const S = cellKey(sc.x, sc.y);
  const T = cellKey(tc.x, tc.y);
  const aNets = new Set((nets.portNets.get(`${a.part}.${a.port}`) ?? []).filter((n) => n >= 0));
  const bNets = new Set((nets.portNets.get(`${b.part}.${b.port}`) ?? []).filter((n) => n >= 0));
  if ([...aNets].some((n) => bNets.has(n))) return { path: [], bridges: [] };
  const inNets = (k: string, set: Set<number>) => (nets.cellNets.get(k) ?? []).some((n) => set.has(n));

  const blocked = new Set<string>();
  for (const p of circuit.parts) for (const k of partCells(p)) blocked.add(k);
  // Tiles where another port plugs in: running a wire through one would connect that port.
  for (const p of circuit.parts) {
    for (const port of PARTS.get(p.type)?.ports ?? []) {
      if (port.kind !== "logic") continue;
      if ((p.id === a.part && port.id === a.port) || (p.id === b.part && port.id === b.port)) continue;
      const own = nets.portNets.get(`${p.id}.${port.id}`);
      if (own?.some((n) => aNets.has(n) || bNets.has(n))) continue;
      const c = portCell(p, port);
      blocked.add(cellKey(c.x, c.y));
    }
  }
  blocked.delete(S);
  blocked.delete(T);
  if (cells[S] && !inNets(S, aNets)) return null;

  const isGoal = (k: string) => k === T || (!!cells[k] && inNets(k, bNets));
  /** A bridge's end tile: nothing there yet, no part on it, inside the search area. */
  const clear = (x: number, y: number) => !cells[cellKey(x, y)] && !blocked.has(cellKey(x, y)) && x >= x0 && x <= x1 && y >= y0 && y <= y1;
  /** A straight plain-wire tile running across direction d, that a bridge's gap can sit over. */
  const crossable = (k: string, d: number) => {
    const v = cells[k];
    if (kindOf(v) !== "w" || blocked.has(k) || inNets(k, aNets) || inNets(k, bNets)) return false;
    const across = (1 << ((d + 1) % 4)) | (1 << ((d + 3) % 4));
    return maskOf(v) === across;
  };

  // Search bounds: everything in the circuit plus a margin.
  let x0 = Math.min(sc.x, tc.x),
    y0 = Math.min(sc.y, tc.y),
    x1 = Math.max(sc.x, tc.x),
    y1 = Math.max(sc.y, tc.y);
  for (const p of circuit.parts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + 3);
    y1 = Math.max(y1, p.y + 3);
  }
  x0 -= 3;
  y0 -= 3;
  x1 += 3;
  y1 += 3;

  /** Whether the wire may step onto tile k. */
  const free = (x: number, y: number) => {
    const k = cellKey(x, y);
    if (x < x0 || x > x1 || y < y0 || y > y1 || blocked.has(k)) return false;
    return !cells[k] || isGoal(k);
  };

  type Bridge = Route["bridges"][number];
  type St = { k: string; x: number; y: number; d: number; cost: number; prev: St | null; bridge?: Bridge };
  const d0 = DIRS.findIndex((v) => v.x === sc.n.x && v.y === sc.n.y);
  const open: St[] = [{ k: S, x: sc.x, y: sc.y, d: d0, cost: 0, prev: null }];
  const best = new Map<string, number>([[`${S}|${d0}`, 0]]);
  // Branching off a's existing wire is as good as starting at the port.
  for (const [k, v] of Object.entries(cells)) {
    if (k === S || kindOf(v) !== "w" || !inNets(k, aNets)) continue;
    const [x, y] = parseKey(k);
    open.push({ k, x, y, d: -1, cost: 0.5, prev: null });
  }
  let found: St | null = null;
  let guard = 0;
  while (open.length && guard++ < 100_000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if ((best.get(`${cur.k}|${cur.d}`) ?? Infinity) < cur.cost) continue;
    if (isGoal(cur.k)) {
      found = cur;
      break;
    }
    // Existing tiles of a's own network are a dead end except where we started.
    if (cur.prev && cells[cur.k]) continue;
    for (let d = 0; d < 4; d++) {
      if (cur.prev && d === opp(cur.d)) continue;
      if (!cur.prev && cur.k !== S && cells[cellKey(cur.x + DIRS[d].x, cur.y + DIRS[d].y)]) continue;
      const dx = DIRS[d].x;
      const dy = DIRS[d].y;
      const moves: { nx: number; ny: number; extra: number; bridge?: Bridge }[] = [{ nx: cur.x + dx, ny: cur.y + dy, extra: 0 }];
      // Hop a wire with a Wire Bridge: end tile, gap over the wire, end tile, then carry on.
      if (clear(cur.x + dx, cur.y + dy) && crossable(cellKey(cur.x + 2 * dx, cur.y + 2 * dy), d) && clear(cur.x + 3 * dx, cur.y + 3 * dy)) {
        const bridge: Bridge = {
          x: Math.min(cur.x + dx, cur.x + 3 * dx),
          y: Math.min(cur.y + dy, cur.y + 3 * dy),
          rot: d % 2 === 0 ? 0 : 1,
        };
        moves.push({ nx: cur.x + 4 * dx, ny: cur.y + 4 * dy, extra: 3, bridge });
      }
      for (const m of moves) {
        if (!free(m.nx, m.ny)) continue;
        const k = cellKey(m.nx, m.ny);
        const cost = cur.cost + 1 + m.extra + (cur.d >= 0 && d !== cur.d ? 0.4 : 0);
        if ((best.get(`${k}|${d}`) ?? Infinity) <= cost) continue;
        best.set(`${k}|${d}`, cost);
        open.push({ k, x: m.nx, y: m.ny, d, cost, prev: cur, bridge: m.bridge });
      }
    }
  }
  if (!found) return null;
  const path: string[] = [];
  const bridges: Bridge[] = [];
  for (let s: St | null = found; s; s = s.prev) {
    path.push(s.k);
    if (s.bridge) bridges.push(s.bridge);
  }
  return { path: path.reverse(), bridges };
}

/** Lays a route's tiles. Its bridges are parts, which the caller builds. */
export function applyRoute(cells: Record<string, string>, r: Route) {
  let prev: string | null = null;
  for (const k of r.path) {
    if (!cells[k]) cells[k] = tile("w", 0);
    // Neighbours join; the two sides of a bridge don't (its ports plug into them instead).
    if (prev && dirBetween(parseKey(prev), parseKey(k)) >= 0) link(cells, prev, k);
    prev = k;
  }
}

/** Tiles from (x0, y0) to (x1, y1) in 4-connected steps (for painting with a finger). */
export function cellLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [[x0, y0]];
  const tx = x1 - x0;
  const ty = y1 - y0;
  const sx = Math.sign(tx);
  const sy = Math.sign(ty);
  let x = x0;
  let y = y0;
  while (x !== x1 || y !== y1) {
    if (x === x1) y += sy;
    else if (y === y1) x += sx;
    else {
      // Step whichever way stays closer to the straight line.
      const ex = Math.abs((x + sx - x0) * ty - (y - y0) * tx);
      const ey = Math.abs((x - x0) * ty - (y + sy - y0) * tx);
      if (ex <= ey) x += sx;
      else y += sy;
    }
    out.push([x, y]);
  }
  return out;
}
