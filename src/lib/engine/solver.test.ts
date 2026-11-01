import { describe, expect, it } from "vitest";
import { loadGameData } from "./data";
import { EXTERNAL, makePlan, Solver, type Plan, type PlanConfig, type TreeNode } from "./solver";

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

/** Machines and output for the recipe that makes `material`. */
function line(p: Plan, material: string) {
  const mp = p.materials.get(material)!;
  const rp = mp.recipe ? p.recipes.get(mp.recipe.id) : undefined;
  return { ...mp, machines: rp?.machines ?? 0, machinesBuilt: rp?.machinesBuilt ?? 0, crew: rp?.crew ?? [], gross: mp.produced || mp.supplied };
}

function sumTree(node: TreeNode, acc = new Map<string, number>()) {
  if (node.kind === "craft") acc.set(node.material, (acc.get(node.material) ?? 0) + node.gross);
  node.children.forEach((c) => sumTree(c, acc));
  return acc;
}

describe("solver", () => {
  it("sizes a simple chain with one stumpy per station", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)] }));
    // sawbench: 16 s per craft -> 60 / 16 = 3.75 timber/min each
    expect(line(p, "sawn-timber").machines).toBeCloseTo(16);
    // 2 logs per timber, logger: 2 s per log -> 30 logs/min
    expect(line(p, "wooden-log").gross).toBeCloseTo(120);
    expect(line(p, "wooden-log").machines).toBeCloseTo(4);
  });

  it("applies crafty spark speed globally", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)], defaultCrew: ["spark-crafty"] }));
    expect(line(p, "sawn-timber").machines).toBeCloseTo(60 / 5.625);
    expect(line(p, "sawn-timber").machinesBuilt).toBe(11);
    expect(line(p, "wooden-log").machines).toBeCloseTo(120 / 45);
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
    expect(line(p, "sawn-timber").crew.map((c) => c.id)).toEqual(["spark-crafty", "spark-crafty"]);
    expect(line(p, "sawn-timber").machines).toBeCloseTo(60 / 11.25);
    expect(line(p, "wooden-log").machines).toBeCloseTo(4);
  });

  it("converts a machine-count target into a rate", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 2, "machines")] }));
    expect(line(p, "sawn-timber").gross).toBeCloseTo(7.5);
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
    const coal = line(p, "coal")!;
    expect(coal.gross).toBeCloseTo(7.5);
    expect(coal.machines).toBeCloseTo(1);
    expect(line(p, "wooden-log").gross).toBeCloseTo(22.5);
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
    expect(line(p, "aether-shard").gross).toBeCloseTo(12);
    expect(line(p, "raw-aether").gross).toBeCloseTo(2);
    expect(line(p, "miasma-vial").gross).toBeCloseTo(4);
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
      if (mp.recipe) expect(sums.get(mp.material) ?? 0).toBeCloseTo(mp.produced * mp.ownShare, 6);
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

/** A tiny game for exact byproduct / chance tests. Every station: 60 s per craft at 1x. */
function miniGame(process: object[], extraMaterials: string[] = []) {
  const ids = new Set([
    ...extraMaterials,
    ...process.flatMap((p) => [
      ...(p as { from: { material: string }[] }).from.map((f) => f.material),
      ...(p as { to: { material: string }[] }).to.map((t) => t.material),
    ]),
  ]);
  return loadGameData({
    version: "test",
    spark: [{ id: "s1", name: "Stumpy Spark", block: "s1", speed: 100 }],
    category: [],
    workstation: [{ id: "ws", name: "WS", category: "x", cost: [] }],
    process: process.map((p) => ({ workstation: "ws", buildTime: 60, fuelRequired: false, ...p })) as never,
    material: [...ids].map((id) => ({ id, name: id, category: "x", craftable: true })),
    fuel: [],
  });
}
const miniCfg = (targets: [string, number][], recipeChoice: Record<string, string> = {}): PlanConfig => ({
  targets: targets.map(([material, value]) => target(material, value)),
  recipeChoice,
  defaultCrew: ["s1"],
  stationCrew: {},
  fuel: { material: "none", perMinute: 0 },
});

describe("multi-output recipes", () => {
  const game = miniGame([
    // split: 1 ore -> 2 A + 1 B
    { id: "split", name: "split", from: [{ material: "ore", amount: 1 }], to: [{ material: "a", amount: 2 }, { material: "b", amount: 1 }] },
    // makeB: 1 ore -> 1 B
    { id: "makeB", name: "makeB", from: [{ material: "ore", amount: 1 }], to: [{ material: "b", amount: 1 }] },
  ]);

  it("credits byproducts and reports surplus", () => {
    // Need 10 A (5 splits -> 5 B as byproduct) and 3 B: makeB stays off, 2 B surplus.
    const p = makePlan(miniCfg([["a", 10], ["b", 3]]), game);
    expect(p.recipes.get("split")!.crafts).toBeCloseTo(5);
    expect(p.recipes.get("makeB")!.crafts).toBeCloseTo(0);
    expect(p.materials.get("b")!.surplus).toBeCloseTo(2);
    expect(p.materials.get("ore")!.supplied).toBeCloseTo(5);
    expect(p.warnings).toEqual([]);
  });

  it("tops up with the material's own recipe when byproducts fall short", () => {
    const p = makePlan(miniCfg([["a", 10], ["b", 8]]), game);
    expect(p.recipes.get("split")!.crafts).toBeCloseTo(5);
    expect(p.recipes.get("makeB")!.crafts).toBeCloseTo(3);
    expect(p.materials.get("b")!.ownShare).toBeCloseTo(3 / 8);
  });

  it("drives a shared recipe by its most demanding output", () => {
    // Both A and B choose "split"; 9 B needs 9 crafts even though A only needs 1.
    const p = makePlan(miniCfg([["a", 2], ["b", 9]], { b: "split" }), game);
    expect(p.recipes.get("split")!.crafts).toBeCloseTo(9);
    expect(p.recipes.get("split")!.primary).toBe("b");
    expect(p.materials.get("a")!.surplus).toBeCloseTo(16);
  });

  it("shows byproduct-covered materials as byproduct leaves in the tree", () => {
    const p = makePlan(miniCfg([["a", 10], ["b", 3]]), game);
    const bTree = p.trees[1];
    expect(bTree.kind).toBe("byproduct");
    expect(p.trees[0].byproducts).toEqual([{ material: "b", rate: 5, fuel: false }]);
  });
});

describe("randomised and catalyst recipes", () => {
  it("counts chance outputs at their expected value", () => {
    const game = miniGame([
      { id: "geode", name: "geode", from: [{ material: "rock", amount: 1 }], to: [{ material: "gem", amount: 10, chance: 0.25 }, { material: "dust", amount: 4, chance: 0.75 }] },
    ]);
    const p = makePlan(miniCfg([["gem", 5]]), game);
    expect(p.recipes.get("geode")!.crafts).toBeCloseTo(2); // 2.5 gems per craft
    expect(p.materials.get("dust")!.surplus).toBeCloseTo(6);
  });

  it("nets out a recipe that consumes part of its own product", () => {
    // Like Fertiliser Enrichment: 1 F + 5 ice -> 5 F, net +4 per craft.
    const game = miniGame([
      { id: "enrich", name: "enrich", from: [{ material: "f", amount: 1 }, { material: "ice", amount: 5 }], to: [{ material: "f", amount: 5 }] },
    ]);
    const p = makePlan(miniCfg([["f", 8]]), game);
    expect(p.recipes.get("enrich")!.crafts).toBeCloseTo(2);
    expect(p.materials.get("ice")!.supplied).toBeCloseTo(10);
    const loop = p.trees[0].children.find((c) => c.kind === "loop")!;
    expect(loop.material).toBe("f");
    expect(loop.rate).toBeCloseTo(2);
  });
});

describe("wiki data", () => {
  it("imports the 1.0 production chains", () => {
    // Handy Spark: 5 Crafty + 4 Copper Ingot + 1 Aether Crystal at the Spark Workshop.
    const p = makePlan(base({ targets: [target("handy-spark-block", 1)], defaultCrew: ["spark-crafty", "spark-crafty"] }));
    expect(p.recipes.get(new Solver(base()).recipeFor("handy-spark-block")!.id)!.recipe.workstation).toBe("spark-workshop");
    expect(p.materials.get("copper-ingot")!.consumed).toBeCloseTo(4);
    expect(p.warnings).toEqual([]);
  });

  it("keeps every PirateSpark recipe id", async () => {
    const legacy = (await import("../../../legacy/piratespark/data/oddsparks_0_2.json")).default;
    const solver = new Solver(base());
    for (const r of legacy.process) expect(solver.data.recipesById.has(r.id), r.id).toBe(true);
  });
});
