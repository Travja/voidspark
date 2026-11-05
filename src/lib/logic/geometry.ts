import type { Part, PortDef, Rot, Side } from "./types";

export interface Point {
  x: number;
  y: number;
}

/** Size of a part on the grid after rotation. */
export function footprint(w: number, h: number, rot: Rot): { w: number; h: number } {
  return rot % 2 ? { w: h, h: w } : { w, h };
}

const NORMAL: Record<Side, Point> = { l: { x: -1, y: 0 }, r: { x: 1, y: 0 }, t: { x: 0, y: -1 }, b: { x: 0, y: 1 } };

/** Rotates a point inside a w×h box a quarter turn clockwise `rot` times. */
function rotatePoint(p: Point, w: number, h: number, rot: Rot): Point {
  let { x, y } = p;
  let bw = w;
  let bh = h;
  for (let i = 0; i < rot; i++) {
    [x, y] = [bh - y, x];
    [bw, bh] = [bh, bw];
  }
  return { x, y };
}

function rotateVec(v: Point, rot: Rot): Point {
  let { x, y } = v;
  for (let i = 0; i < rot; i++) [x, y] = [-y, x];
  return { x: x || 0, y: y || 0 };
}

/** Port position (in grid units) and outward direction for a placed part. */
export function portPosition(part: Pick<Part, "x" | "y" | "rot">, w: number, h: number, port: PortDef): { p: Point; n: Point } {
  const local: Point =
    port.side === "l"
      ? { x: 0, y: port.at * h }
      : port.side === "r"
        ? { x: w, y: port.at * h }
        : port.side === "t"
          ? { x: port.at * w, y: 0 }
          : { x: port.at * w, y: h };
  const r = rotatePoint(local, w, h, part.rot);
  return { p: { x: part.x + r.x, y: part.y + r.y }, n: rotateVec(NORMAL[port.side], part.rot) };
}

/** Control points for the curve drawn between two ports. */
export function wireCurve(a: { p: Point; n: Point }, b: { p: Point; n: Point }): [Point, Point, Point, Point] {
  const d = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y);
  const k = Math.min(2.5, Math.max(0.4, d * 0.4));
  return [a.p, { x: a.p.x + a.n.x * k, y: a.p.y + a.n.y * k }, { x: b.p.x + b.n.x * k, y: b.p.y + b.n.y * k }, b.p];
}

export function bezierPoint([p0, p1, p2, p3]: [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Approximate arc length of a curve, in grid units. */
export function curveLength(c: [Point, Point, Point, Point]): number {
  let len = 0;
  let prev = c[0];
  for (let i = 1; i <= 16; i++) {
    const p = bezierPoint(c, i / 16);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}
