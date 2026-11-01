import { describe, expect, it } from "vitest";
import { EXTERNAL, makePlan, Solver, type PlanConfig, type TreeNode } from "./solver";

const base = (over: Partial<PlanConfig> = {}): PlanConfig => ({
  targets: [],
  recipeChoice: {},
  defaultSpark: "spark-stumpy",
  stationSpark: {},
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
  it("sizes a simple chain with stumpy sparks", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)] }));
    // sawbench: 120 / 16 = 7.5 crafts/min -> 7.5 timber/min each
    expect(p.materials.get("sawn-timber")!.machines).toBeCloseTo(8);
    // 2 logs per timber, logger makes 120 / 2 = 60 logs/min
    expect(p.materials.get("wooden-log")!.gross).toBeCloseTo(120);
    expect(p.materials.get("wooden-log")!.machines).toBeCloseTo(2);
  });

  it("applies crafty spark speed globally", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)], defaultSpark: "spark-crafty" }));
    expect(p.materials.get("sawn-timber")!.machines).toBeCloseTo(60 / 11.25);
    expect(p.materials.get("sawn-timber")!.machinesBuilt).toBe(6);
    expect(p.materials.get("wooden-log")!.machines).toBeCloseTo(120 / 90);
  });

  it("applies per-workstation spark overrides", () => {
    const p = makePlan(
      base({ targets: [target("sawn-timber", 60)], stationSpark: { sawbench: "spark-crafty" } }),
    );
    expect(p.materials.get("sawn-timber")!.spark!.id).toBe("spark-crafty");
    expect(p.materials.get("sawn-timber")!.machines).toBeCloseTo(60 / 11.25);
    expect(p.materials.get("wooden-log")!.machines).toBeCloseTo(2);
  });

  it("converts a machine-count target into a rate", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 2, "machines")] }));
    expect(p.materials.get("sawn-timber")!.gross).toBeCloseTo(15);
  });

  it("ignores spark speed on the miasma collector", () => {
    const s = new Solver(base({ defaultSpark: "spark-crafty" }));
    expect(s.outputPerMachine("miasma-vial")).toBeCloseTo((120 / 16) * 2);
  });

  it("closes the coal-fuels-coal loop", () => {
    // One furnace: 15 coal/min, burns 2 coal/min -> 13 net
    const p = makePlan(
      base({ targets: [target("coal", 13)], fuel: { material: "coal", perMinute: 2 } }),
    );
    const coal = p.materials.get("coal")!;
    expect(coal.gross).toBeCloseTo(15);
    expect(coal.machines).toBeCloseTo(1);
    expect(p.materials.get("wooden-log")!.gross).toBeCloseTo(45);
    const tree = p.trees[0];
    expect(tree.gross).toBeCloseTo(15);
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
    expect(sawbench.machinesBuilt).toBe(8);
    // sawbench costs 20 wooden logs
    expect(p.buildCost.find((c) => c.material === "wooden-log")!.amount).toBeGreaterThanOrEqual(160);
  });
});
