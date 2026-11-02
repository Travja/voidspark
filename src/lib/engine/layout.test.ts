import { describe, expect, it } from "vitest";
import { layoutFlow } from "./layout";
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
