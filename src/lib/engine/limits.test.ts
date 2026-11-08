import { describe, expect, it } from "vitest";
import { checkLimits, floorSig, type Limit } from "./limits";
import { Solver, type PlanConfig } from "./solver";

const cfg = (over: Partial<PlanConfig> = {}): PlanConfig => ({
  targets: [{ id: "t", material: "refined-aether", mode: "rate", value: 1 }],
  recipeChoice: {},
  defaultCrew: ["spark-crafty", "spark-crafty"],
  stationCrew: {},
  fuel: { material: "wooden-log", perMinute: 0 },
  ...over,
});
const limit = (kind: Limit["kind"], key: string, amount: number): Limit => ({ id: key, kind, key, amount });
const report = (c: PlanConfig, limits: Limit[]) => {
  const s = new Solver(c);
  return checkLimits(s.plan(), s, limits);
};

describe("what I have", () => {
  it("2 Noxious Corals make at most 7.5 Refined Aether/min", () => {
    // Each coral: 15 miasma/min -> 7.5 collector crafts -> 15 vials. 2 vials -> 1 raw aether,
    // 2 raw aether -> 1 refined. 30 vials -> 15 raw -> 7.5 refined.
    const r = report(cfg(), [limit("site", "Noxious Coral", 2)]);
    expect(r.bottleneck?.limit.key).toBe("Noxious Coral");
    expect(r.maxRates[0].rate).toBeCloseTo(7.5);
  });

  it("the tightest limit wins, and says when the plan doesn't fit", () => {
    const r = report(cfg({ targets: [{ id: "t", material: "refined-aether", mode: "rate", value: 10 }] }), [
      limit("site", "Noxious Coral", 2),
      limit("item", "aether-shard", 100),
    ]);
    expect(r.scale).toBeCloseTo(0.75);
    expect(r.uses[0].used).toBeCloseTo(40 / 15); // 10 refined/min = 40 vials/min = 2.67 corals
    expect(r.maxRates[0].rate).toBeCloseTo(7.5);
  });

  it("limits on items coming in and on machines", () => {
    // 15 aether shards/min feed 15 raw aether -> 7.5 refined.
    expect(report(cfg(), [limit("item", "aether-shard", 15)]).maxRates[0].rate).toBeCloseTo(7.5);
    const alch = report(cfg(), [limit("workstation", "alchemy-lab", 4)]);
    expect(alch.bottleneck?.limit.key).toBe("alchemy-lab");
    expect(alch.scale).toBeGreaterThan(0);
  });

  it("scales several targets together and ignores unrelated limits", () => {
    const two = cfg({
      targets: [
        { id: "a", material: "refined-aether", mode: "rate", value: 1 },
        { id: "b", material: "miasma-vial", mode: "rate", value: 2 },
      ],
    });
    const r = report(two, [limit("site", "Noxious Coral", 1), limit("site", "Aetheric Fissure", 5)]);
    // Coral use: 1 refined = 4 vials, plus 2 vials = 6 vials/min of 15.
    expect(r.scale).toBeCloseTo(15 / 6);
    expect(r.uses[1].used).toBe(0);
    expect(report(cfg(), [limit("site", "Aetheric Fissure", 5)]).scale).toBeNull();
  });

  it("rounds scaled targets down", () => {
    expect(floorSig(7.5)).toBe(7.5);
    expect(floorSig(7.4999999999)).toBe(7.5);
    expect(floorSig(2.6667)).toBe(2.66);
    expect(floorSig(0.012345)).toBe(0.0123);
    expect(floorSig(0)).toBe(0);
  });
});
