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

/** Machines and flows for the recipe that makes `material`. */
function line(p: Plan, material: string) {
  const mp = p.materials.get(material)!;
  const rp = mp.recipe ? p.recipes.get(mp.recipe.id) : undefined;
  return { ...mp, machines: rp?.machines ?? 0, machinesBuilt: rp?.machinesBuilt ?? 0, crew: rp?.crew ?? [] };
}

/** Crafts per recipe summed over the visible tree. */
function treeCrafts(node: TreeNode, acc = new Map<string, number>()) {
  if (node.kind === "craft" && node.recipe) {
    const out = node.recipe.to.find((t) => t.material === node.material)!;
    acc.set(node.recipe.id, (acc.get(node.recipe.id) ?? 0) + node.rate / (out.amount * (out.chance ?? 1)));
  }
  node.children.forEach((c) => treeCrafts(c, acc));
  return acc;
}

/** True if a material is crafted below itself anywhere in the tree. */
function hasLoop(node: TreeNode, path: string[] = []): boolean {
  if (node.kind === "craft" && path.includes(node.material)) return true;
  return node.children.some((c) => hasLoop(c, [...path, node.material]));
}

describe("rates and spark crews", () => {
  it("sizes a simple chain with one stumpy per station", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)] }));
    // sawbench: 16 s per craft -> 60 / 16 = 3.75 timber/min each
    expect(line(p, "sawn-timber").machines).toBeCloseTo(16);
    // 2 logs per timber, logger: 2 s per log -> 30 logs/min
    expect(line(p, "wooden-log").produced).toBeCloseTo(120);
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
    expect(line(p, "sawn-timber").produced).toBeCloseTo(7.5);
  });

  it("caps the miasma collector at its miasma supply", () => {
    expect(new Solver(base()).outputPerMachine("miasma-vial")).toBeCloseTo(3.75 * 2);
    const s = new Solver(base({ defaultCrew: ["spark-crafty", "spark-crafty"] }));
    expect(s.outputPerMachine("miasma-vial")).toBeCloseTo(7.5 * 2);
  });

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

describe("one-way production (no loops)", () => {
  it("supplies coal for the coal furnace separately instead of looping", () => {
    // 5.5 coal/min, 1 stumpy: a furnace does 7.5 crafts/min -> 0.733 furnaces burning 2 coal/min each.
    const p = makePlan(base({ targets: [target("coal", 5.5)], fuel: { material: "coal", perMinute: 2 } }));
    const coal = line(p, "coal");
    expect(coal.produced).toBeCloseTo(5.5);
    expect(coal.machines).toBeCloseTo(5.5 / 7.5);
    expect(coal.supplied).toBeCloseTo((5.5 / 7.5) * 2);
    expect(coal.loopSupplied).toBeCloseTo((5.5 / 7.5) * 2);
    expect(line(p, "wooden-log").produced).toBeCloseTo(16.5);
    const loop = p.trees[0].children.find((c) => c.kind === "loop")!;
    expect(loop.material).toBe("coal");
    expect(loop.fuel).toBe(true);
    expect(p.warnings.some((w) => w.startsWith("Coal"))).toBe(true);
  });

  it("supplies aether shards for the transmutation separately", () => {
    // 10 shards: 10/6 raw aether -> 10/6 transmutations, each needing 1 shard from outside.
    const p = makePlan(
      base({ targets: [target("aether-shard", 10)], recipeChoice: { "aether-shard": "raw-distillation" } }),
    );
    expect(line(p, "aether-shard").produced).toBeCloseTo(10);
    expect(line(p, "raw-aether").produced).toBeCloseTo(10 / 6);
    expect(p.materials.get("aether-shard")!.loopSupplied).toBeCloseTo(10 / 6);
    expect(line(p, "miasma-vial").produced).toBeCloseTo(20 / 6);
  });

  it("treats external materials as raw inputs", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)], recipeChoice: { "wooden-log": EXTERNAL } }));
    expect(p.rawInputs.map((r) => r.material)).toEqual(["wooden-log"]);
    expect(p.trees[0].children[0].kind).toBe("raw");
  });

  it("sizes shared intermediates per branch and sums them in the totals", () => {
    const p = makePlan(
      base({ targets: [target("ladder", 6), target("small-vial", 4)], fuel: { material: "wooden-log", perMinute: 12 } }),
    );
    const sums = new Map<string, number>();
    for (const t of p.trees) for (const [id, c] of treeCrafts(t)) sums.set(id, (sums.get(id) ?? 0) + c);
    for (const rp of p.recipes.values()) expect(sums.get(rp.recipe.id) ?? 0).toBeCloseTo(rp.crafts, 6);
  });

  it("aggregates stations and build cost", () => {
    const p = makePlan(base({ targets: [target("sawn-timber", 60)] }));
    const sawbench = p.stations.find((s) => s.workstation === "sawbench")!;
    expect(sawbench.machinesBuilt).toBe(16);
    expect(p.buildCost.find((c) => c.material === "wooden-log")!.amount).toBeGreaterThanOrEqual(320);
  });
});

/** A tiny game for exact byproduct / chance tests. Every station: 60 s per craft at 1x. */
function miniGame(process: object[]) {
  const ids = new Set(
    process.flatMap((p) => [
      ...(p as { from: { material: string }[] }).from.map((f) => f.material),
      ...(p as { to: { material: string }[] }).to.map((t) => t.material),
    ]),
  );
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

describe("byproducts", () => {
  const game = miniGame([
    // split: 1 ore -> 2 A + 1 B
    { id: "split", name: "split", from: [{ material: "ore", amount: 1 }], to: [{ material: "a", amount: 2 }, { material: "b", amount: 1 }] },
    // makeB: 1 ore -> 1 B
    { id: "makeB", name: "makeB", from: [{ material: "ore", amount: 1 }], to: [{ material: "b", amount: 1 }] },
    // useB: 1 B -> 1 C (a later machine that wants B)
    { id: "useB", name: "useB", from: [{ material: "b", amount: 1 }], to: [{ material: "c", amount: 1 }] },
  ]);

  it("never credits byproducts against other branches: they are surplus", () => {
    // 10 A makes 5 B as a byproduct, but the 3 B target gets its own makeB line.
    const p = makePlan(miniCfg([["a", 10], ["b", 3]]), game);
    expect(p.recipes.get("split")!.crafts).toBeCloseTo(5);
    expect(p.recipes.get("makeB")!.crafts).toBeCloseTo(3);
    expect(p.materials.get("b")!.surplus).toBeCloseTo(5);
    expect(p.materials.get("ore")!.supplied).toBeCloseTo(8);
  });

  it("never feeds a byproduct into another chain", () => {
    // C needs B; split's B byproduct exists, but the chain to C makes its own B.
    const p = makePlan(miniCfg([["a", 10], ["c", 2]]), game);
    expect(p.recipes.get("makeB")!.crafts).toBeCloseTo(2);
    expect(p.materials.get("b")!.surplus).toBeCloseTo(5);
  });

  it("lists byproducts on the tree node that makes them", () => {
    const p = makePlan(miniCfg([["a", 10]]), game);
    expect(p.trees[0].byproducts).toEqual([{ material: "b", rate: 5, fuel: false }]);
  });

  it("runs a recipe chosen for its secondary output at the rate that output needs", () => {
    const p = makePlan(miniCfg([["b", 9]], { b: "split" }), game);
    expect(p.recipes.get("split")!.crafts).toBeCloseTo(9);
    expect(p.materials.get("a")!.surplus).toBeCloseTo(18);
  });

  it("counts chance outputs at their expected value", () => {
    const g = miniGame([
      { id: "geode", name: "geode", from: [{ material: "rock", amount: 1 }], to: [{ material: "gem", amount: 10, chance: 0.25 }, { material: "dust", amount: 4, chance: 0.75 }] },
    ]);
    const p = makePlan(miniCfg([["gem", 5]]), g);
    expect(p.recipes.get("geode")!.crafts).toBeCloseTo(2); // 2.5 gems per craft
    expect(p.materials.get("dust")!.surplus).toBeCloseTo(6);
  });

  it("supplies the seed of a self-consuming recipe separately", () => {
    // Like Fertiliser Enrichment: 1 F + 5 ice -> 5 F. 8 F needs 1.6 crafts and 1.6 F from outside.
    const g = miniGame([
      { id: "enrich", name: "enrich", from: [{ material: "f", amount: 1 }, { material: "ice", amount: 5 }], to: [{ material: "f", amount: 5 }] },
    ]);
    const p = makePlan(miniCfg([["f", 8]]), g);
    expect(p.recipes.get("enrich")!.crafts).toBeCloseTo(1.6);
    expect(p.materials.get("f")!.loopSupplied).toBeCloseTo(1.6);
    expect(p.materials.get("ice")!.supplied).toBeCloseTo(8);
  });
});

describe("wiki data", () => {
  it("imports the 1.0 production chains", () => {
    const p = makePlan(base({ targets: [target("handy-spark-block", 1)], defaultCrew: ["spark-crafty", "spark-crafty"] }));
    expect(p.recipes.get(new Solver(base()).recipeFor("handy-spark-block")!.id)!.recipe.workstation).toBe("spark-workshop");
    expect(p.materials.get("copper-ingot")!.consumed).toBeCloseTo(4);
    expect(line(p, "copper-ore").recipe!.workstation).toBe("ore-miner");
  });

  it("has loop-free default recipes for every item", () => {
    const s = new Solver(base());
    for (const m of s.data.materials.keys()) {
      const p = makePlan(base({ targets: [target(m, 1)] }));
      expect(p.trees.some((t) => hasLoop(t)), m).toBe(false);
      expect([...p.materials.values()].filter((x) => x.loopSupplied > 0).map((x) => x.material), m).toEqual([]);
    }
  });

  it("keeps every PirateSpark recipe id", async () => {
    const legacy = (await import("../../../legacy/piratespark/data/oddsparks_0_2.json")).default;
    const solver = new Solver(base());
    for (const r of legacy.process) expect(solver.data.recipesById.has(r.id), r.id).toBe(true);
  });
});

describe("staffing", () => {
  const staff = (p: Plan) => Object.fromEntries(p.staffing.map((s) => [s.spark.id, s.count]));

  it("counts one crew per machine built", () => {
    // 16 sawbenches + 4 loggers, one Stumpy each
    expect(staff(makePlan(base({ targets: [target("sawn-timber", 60)] })))).toEqual({ "spark-stumpy": 20 });
    // 2 Crafty: 60 / 11.25 -> 6 sawbenches, 120 / 90 -> 2 loggers, two sparks each
    const p = makePlan(base({ targets: [target("sawn-timber", 60)], defaultCrew: ["spark-crafty", "spark-crafty"] }));
    expect(staff(p)).toEqual({ "spark-crafty": 16 });
  });

  it("splits mixed crews by spark type", () => {
    const p = makePlan(
      base({
        targets: [target("sawn-timber", 60)],
        defaultCrew: ["spark-crafty", "spark-crafty"],
        stationCrew: { logger: ["spark-stumpy", "spark-crafty"] },
      }),
    );
    // 6 sawbenches x 2 Crafty, and 120 / 75 -> 2 loggers x (1 Stumpy + 1 Crafty)
    expect(staff(p)).toEqual({ "spark-stumpy": 2, "spark-crafty": 14 });
  });

  it("needs no sparks for stations that don't use them", () => {
    const p = makePlan(base({ targets: [target("aether-apple", 1)] }));
    const arboretum = [...p.recipes.values()].find((r) => r.recipe.workstation === "arboretum")!;
    expect(arboretum.crew).toEqual([]);
    const total = p.staffing.reduce((n, s) => n + s.count, 0);
    const expected = [...p.recipes.values()].reduce((n, r) => n + r.machinesBuilt * r.crew.length, 0);
    expect(total).toBe(expected);
  });
});
