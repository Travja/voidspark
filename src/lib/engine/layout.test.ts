import { describe, expect, it } from "vitest";
import { layoutFlow, splitSources } from "./layout";
import { makePlan, type PlanConfig } from "./solver";
import { GAME } from "./data";

const cfg = (material: string, value = 1, over: Partial<PlanConfig> = {}): PlanConfig => ({
  targets: [{ id: "t", material, mode: "rate", value }],
  recipeChoice: {},
  defaultCrew: ["spark-crafty", "spark-crafty"],
  stationCrew: {},
  fuel: { material: "wooden-log", perMinute: 12 },
  ...over,
});
const opts = { cardWidth: 200, columnGap: 100, rowGap: 10, height: () => 80 };

describe("flow graph", () => {
  it("connects machine groups to what they feed", () => {
    const { flow } = makePlan(cfg("sawn-timber", 60));
    const e = (from: string, to: string) => flow.edges.find((x) => x.from === from && x.to === to);
    expect(e("log-harvesting", "sawn-timber")!.rate).toBeCloseTo(120);
    expect(e("sawn-timber", "target:sawn-timber")!.rate).toBeCloseTo(60);
    expect(flow.nodes.map((n) => n.kind).sort()).toEqual(["recipe", "recipe", "target"]);
  });

  it("shows one shared group feeding several consumers", () => {
    // Crafty Spark: the loggers feed both the Stumpy Spark line and the Sawn Timber line.
    const { flow } = makePlan(cfg("crafty-spark-block", 1));
    const fromLogger = flow.edges.filter((x) => x.from === "log-harvesting").map((x) => x.to).sort();
    expect(fromLogger).toEqual(["sawn-timber", "stumpy-spark"]);
  });

  it("matches each group's inputs and marks raw and loop supplies", () => {
    const p = makePlan(cfg("coal", 10, { fuel: { material: "coal", perMinute: 2 } }));
    for (const n of p.flow.nodes.filter((x) => x.line)) {
      for (const input of n.line!.inputs) {
        const into = p.flow.edges.filter((x) => x.to === n.id && x.material === input.material && x.fuel === input.fuel);
        expect(into.reduce((s, x) => s + x.rate, 0)).toBeCloseTo(input.rate, 6);
      }
    }
    expect(p.flow.nodes.find((x) => x.id === "loop:coal")!.rate).toBeGreaterThan(0);
  });
});

describe("layout", () => {
  it("keeps arrows pointing right and cards apart, for every item", () => {
    for (const m of GAME.materials.keys()) {
      const { flow } = makePlan(cfg(m));
      const l = layoutFlow(flow.nodes, flow.edges, opts);
      for (const e of l.edges) expect(e.x2, `${m}: ${e.edge.from} -> ${e.edge.to}`).toBeGreaterThan(e.x1);
      const byCol = new Map<number, typeof l.nodes>();
      for (const n of l.nodes) byCol.set(n.column, [...(byCol.get(n.column) ?? []), n]);
      for (const col of byCol.values()) {
        const ys = col.map((n) => [n.y, n.y + n.height]).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < ys.length; i++) expect(ys[i][0], m).toBeGreaterThanOrEqual(ys[i - 1][1]);
      }
      const targets = l.nodes.filter((n) => n.node.kind === "target");
      for (const t of targets) expect(t.column, m).toBe(l.columns - 1);
    }
  });
});

describe("top-to-bottom layout", () => {
  it("keeps arrows pointing down and cards apart, for every item", () => {
    for (const m of GAME.materials.keys()) {
      const { flow } = makePlan(cfg(m));
      const l = layoutFlow(flow.nodes, flow.edges, { ...opts, cardWidth: 160, direction: "tb" });
      expect(l.direction).toBe("tb");
      for (const e of l.edges) expect(e.y2, `${m}: ${e.edge.from} -> ${e.edge.to}`).toBeGreaterThan(e.y1);
      const byRow = new Map<number, typeof l.nodes>();
      for (const n of l.nodes) byRow.set(n.column, [...(byRow.get(n.column) ?? []), n]);
      for (const row of byRow.values()) {
        const xs = row.map((n) => [n.x, n.x + n.width]).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < xs.length; i++) expect(xs[i][0], m).toBeGreaterThanOrEqual(xs[i - 1][1]);
      }
      for (const n of l.nodes) {
        expect(n.x + n.width, m).toBeLessThanOrEqual(l.width + 1e-6);
        expect(n.y + n.height, m).toBeLessThanOrEqual(l.height + 1e-6);
      }
      for (const t of l.nodes.filter((n) => n.node.kind === "target")) expect(t.column, m).toBe(l.columns - 1);
    }
  });

  it("is much narrower than left-to-right for a big plan", () => {
    const { flow } = makePlan(cfg("handy-spark-block"));
    const lr = layoutFlow(flow.nodes, flow.edges, opts);
    const tb = layoutFlow(flow.nodes, flow.edges, { ...opts, cardWidth: 160, direction: "tb" });
    expect(tb.width).toBeLessThan(lr.width / 2);
  });
});

describe("arrows never pass behind a machine", () => {
  const bez = (s: import("./layout").Segment, t: number) => {
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return {
      x: k[0] * s.p0.x + k[1] * s.c1.x + k[2] * s.c2.x + k[3] * s.p3.x,
      y: k[0] * s.p0.y + k[1] * s.c1.y + k[2] * s.c2.y + k[3] * s.p3.y,
    };
  };
  const check = (label: string, l: ReturnType<typeof layoutFlow>) => {
    for (const e of l.edges) {
      for (const card of l.nodes) {
        if (card.node.id === e.edge.from || card.node.id === e.edge.to) continue;
        for (const s of e.segments) {
          for (let i = 0; i <= 24; i++) {
            const q = bez(s, i / 24);
            const inside = q.x > card.x + 0.5 && q.x < card.x + card.width - 0.5 && q.y > card.y + 0.5 && q.y < card.y + card.height - 0.5;
            expect(inside, `${label}: ${e.edge.from} -> ${e.edge.to} crosses ${card.node.id}`).toBe(false);
          }
        }
      }
    }
  };

  for (const direction of ["lr", "tb"] as const) {
    it(`for every item (${direction})`, () => {
      for (const m of GAME.materials.keys()) {
        const { flow } = makePlan(cfg(m));
        check(`${m} ${direction}`, layoutFlow(flow.nodes, flow.edges, { ...opts, direction }));
      }
    });

    it(`for a busy multi-target plan (${direction})`, () => {
      const p = makePlan({
        ...cfg("handy-spark-block"),
        targets: ["handy-spark-block", "crashy-spark-block", "ladder", "small-vial", "drilly-spark-block"].map((material, i) => ({
          id: `t${i}`,
          material,
          mode: "rate" as const,
          value: 1,
        })),
      });
      check(`busy ${direction}`, layoutFlow(p.flow.nodes, p.flow.edges, { ...opts, direction }));
    });
  }
});

describe("splitSources", () => {
  it("gives each consumer of a raw input its own card, keeping totals", () => {
    const { flow } = makePlan(cfg("crafty-spark-block"));
    const g = splitSources(flow.nodes, flow.edges);
    for (const n of g.nodes.filter((x) => x.kind === "raw" || x.kind === "loop")) {
      expect(g.edges.filter((e) => e.from === n.id)).toHaveLength(1);
    }
    const supplied = (nodes: typeof flow.nodes) =>
      nodes.filter((n) => n.kind === "raw").reduce((s, n) => s + n.rate, 0);
    expect(supplied(g.nodes)).toBeCloseTo(supplied(flow.nodes));
    expect(g.edges.reduce((s, e) => s + e.rate, 0)).toBeCloseTo(flow.edges.reduce((s, e) => s + e.rate, 0));
  });

  it("shortens the arrows from raw inputs", () => {
    // Sum of layers crossed by arrows leaving raw inputs, before and after splitting.
    let before = 0;
    let after = 0;
    for (const m of GAME.materials.keys()) {
      const { flow } = makePlan(cfg(m));
      const span = (nodes: typeof flow.nodes, edges: typeof flow.edges) => {
        const l = layoutFlow(nodes, edges, { ...opts, direction: "tb" });
        const layer = new Map(l.nodes.map((n) => [n.node.id, n.column]));
        const raw = new Set(nodes.filter((n) => n.kind === "raw").map((n) => n.id));
        return edges.filter((e) => raw.has(e.from)).reduce((s, e) => s + layer.get(e.to)! - layer.get(e.from)! - 1, 0);
      };
      before += span(flow.nodes, flow.edges);
      const g = splitSources(flow.nodes, flow.edges);
      after += span(g.nodes, g.edges);
    }
    expect(after).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});
