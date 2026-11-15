/** Geometric arrow crossings in a finished layout (for tests and tuning). */
import type { Layout, Segment } from "./layout";

const bez = (s: Segment, t: number) => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: k[0] * s.p0.x + k[1] * s.c1.x + k[2] * s.c2.x + k[3] * s.p3.x, y: k[0] * s.p0.y + k[1] * s.c1.y + k[2] * s.c2.y + k[3] * s.p3.y };
};
type P = { x: number; y: number };
const cross = (a: P, b: P, c: P, d: P) => {
  const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6));
};

/** Pairs of arrows that cross each other (arrows sharing a card don't count against each other). */
export function countCrossings(l: Layout): number {
  const lines = l.edges.map((e) => {
    const pts: P[] = [];
    for (const s of e.segments) for (let i = 0; i <= 10; i++) pts.push(bez(s, i / 10));
    return { e, pts };
  });
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      const ea = a.e.edge, eb = b.e.edge;
      if (ea.from === eb.from || ea.to === eb.to || ea.from === eb.to || ea.to === eb.from) continue;
      let hit = false;
      for (let p = 1; p < a.pts.length && !hit; p++)
        for (let q = 1; q < b.pts.length && !hit; q++) hit = cross(a.pts[p - 1], a.pts[p], b.pts[q - 1], b.pts[q]);
      if (hit) n++;
    }
  }
  return n;
}
