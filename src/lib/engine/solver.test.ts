import { describe, expect, it } from "vitest";
import { EXTERNAL, makePlan, Solver, type PlanConfig, type TreeNode } from "./solver";

const base = (over: Partial<PlanConfig> = {}): PlanConfig => ({
  targets: [],
  recipeChoice: {},
  defaultCrew: ["spark-stumpy"],
  stationCrew: {},
  fuel: { material: "wooden-log", perMinute: 12 },
  ...over,
});

const target = (material: string, value: number, mode: "rate" | "machines" = "rate") => ({
  id: `t-${material}`,
  material,
  mode,
  value,
});

function sumTree(node: TreeNode, acc = new Map<string, number>()) {
  if (node.kind === "craft") acc.set(node.material, (acc.get(node.material) ?? 0) + node.gross);
  node.children.forEach((c) => sumTree(c, acc));
  return acc;
}

describe("solver", () => {
  it("sizes a simple chain with one stumpy per station", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)] }));
    // sawbench: 16 s per craft -> 60 / 16 = 3.75 timber/min each
    expect(p.materials.get("sawn-timber")!.machines).toBeCloseTo(16);
    // 2 logs per timber, logger: 2 s per log -> 30 logs/min
    expect(p.materials.get("wooden-log")!.gross).toBeCloseTo(120);
    expect(p.materials.get("wooden-log")!.machines).toBeCloseTo(4);
  });

  it("applies crafty spark speed globally", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)], defaultCrew: ["spark-crafty"] }));
    expect(p.materials.get("sawn-timber")!.machines).toBeCloseTo(60 / 5.625);
    expect(p.materials.get("sawn-timber")!.machinesBuilt).toBe(11);
    expect(p.materials.get("wooden-log")!.machines).toBeCloseTo(120 / 45);
  });

  it("adds up the speeds of a mixed crew", () => {
    // Wiki: "1 Stumpy & 1 Crafty" = 2.5x
    const s = new Solver(base({ defaultCrew: ["spark-stumpy", "spark-crafty"] }));
    expect(s.crewSpeed("sawbench")).toBeCloseTo(2.5);
    expect(s.outputPerMachine("sawn-timber")).toBeCloseTo((60 * 2.5) / 16);
  });

  it("trims crews to the station's spark slots", () => {
    const s = new Solver(base({ defaultCrew: ["spark-handy", "spark-handy", "spark-handy"] }));
    expect(s.crewFor("sawbench")).toHaveLength(2);
    expect(s.crewSpeed("sawbench")).toBeCloseTo(5);
  });

  it("applies per-workstation crew overrides", () => {
    const p = makePlan(
      base({ targets: [target("sawn-timber", 60)], stationCrew: { sawbench: ["spark-crafty", "spark-crafty"] } }),
    );
    expect(p.materials.get("sawn-timber")!.crew.map((c) => c.id)).toEqual(["spark-crafty", "spark-crafty"]);
    expect(p.materials.get("sawn-timber")!.machines).toBeCloseTo(60 / 11.25);
    expect(p.materials.get("wooden-log")!.machines).toBeCloseTo(4);
  });

  it("converts a machine-count target into a rate", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 2, "machines")] }));
    expect(p.materials.get("sawn-timber")!.gross).toBeCloseTo(7.5);
  });

  it("caps the miasma collector at its miasma supply", () => {
    // 1 stumpy: 60 / 16 = 3.75 crafts/min, under the cap
    expect(new Solver(base()).outputPerMachine("miasma-vial")).toBeCloseTo(3.75 * 2);
    // 2 crafty: 11.25 crafts/min, capped to 7.5 (15 miasma/min, 2 per craft)
    const s = new Solver(base({ defaultCrew: ["spark-crafty", "spark-crafty"] }));
    expect(s.outputPerMachine("miasma-vial")).toBeCloseTo(7.5 * 2);
  });

  it("closes the coal-fuels-coal loop", () => {
    // One furnace: 60 / 8 = 7.5 coal/min, burns 2 coal/min -> 5.5 net
    const p = makePlan(
      base({ targets: [target("coal", 5.5)], fuel: { material: "coal", perMinute: 2 } }),
    );
    const coal = p.materials.get("coal")!;
    expect(coal.gross).toBeCloseTo(7.5);
    expect(coal.machines).toBeCloseTo(1);
    expect(p.materials.get("wooden-log")!.gross).toBeCloseTo(22.5);
    const tree = p.trees[0];
    expect(tree.gross).toBeCloseTo(7.5);
    const loop = tree.children.find((c) => c.kind === "loop")!;
    expect(loop.material).toBe("coal");
    expect(loop.fuel).toBe(true);
    expect(loop.rate).toBeCloseTo(2);
  });

  it("closes the aether shard loop", () => {
    // raw-distillation: 1 raw -> 6 shards; transmutation: 2 vials + 1 shard -> 1 raw
    const p = makePlan(
      base({ targets: [target("aether-shard", 10)], recipeChoice: { "aether-shard": "raw-distillation" } }),
    );
    expect(p.materials.get("aether-shard")!.gross).toBeCloseTo(12);
    expect(p.materials.get("raw-aether")!.gross).toBeCloseTo(2);
    expect(p.materials.get("miasma-vial")!.gross).toBeCloseTo(4);
  });

  it("treats external materials as raw inputs", () => {
    const p = makePlan(
      base({ targets: [target("sawn-timber", 60)], recipeChoice: { "wooden-log": EXTERNAL } }),
    );
    expect(p.rawInputs.map((r) => r.material)).toEqual(["wooden-log"]);
    expect(p.trees[0].children[0].kind).toBe("raw");
  });

  it("splits shared intermediates across tree branches without losing totals", () => {
    const cfg = base({
      targets: [target("ladder", 6), target("small-vial", 4)],
      fuel: { material: "coal", perMinute: 2 },
    });
    const p = makePlan(cfg);
    const sums = new Map<string, number>();
    for (const t of p.trees) for (const [m, g] of sumTree(t)) sums.set(m, (sums.get(m) ?? 0) + g);
    for (const mp of p.materials.values()) {
      if (mp.recipe) expect(sums.get(mp.material) ?? 0).toBeCloseTo(mp.gross, 6);
    }
  });

  it("aggregates stations and build cost", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)] }));
    const sawbench = p.stations.find((s) => s.workstation === "sawbench")!;
    expect(sawbench.machinesBuilt).toBe(16);
    // sawbench costs 20 wooden logs
    expect(p.buildCost.find((c) => c.material === "wooden-log")!.amount).toBeGreaterThanOrEqual(320);
  });
});

describe("PirateSpark compatibility", () => {
  it("matches PirateSpark's rates with a crew of two identical sparks", () => {
    // PirateSpark: crafts/min = 120 * speed / buildTime (speed 1.5 for crafty)
    const s = new Solver(base({ defaultCrew: ["spark-crafty", "spark-crafty"] }));
    for (const id of ["sawn-timber", "coal", "crafty-spark-block", "wooden-log"]) {
      const r = s.recipeFor(id)!;
      const out = r.to.find((t) => t.material === id)!.amount;
      expect(s.outputPerMachine(id)).toBeCloseTo(((120 * 1.5) / r.buildTime) * out);
    }
  });
});
