import { describe, expect, it } from "vitest";
import { decodePlan, defaultPlanConfig, encodePlan } from "./state.svelte";

describe("share links", () => {
  it("round-trips a plan", () => {
    const cfg = defaultPlanConfig();
    cfg.targets = [
      { id: "a", material: "handy-spark-block", mode: "rate", value: 1.5 },
      { id: "b", material: "sawn-timber", mode: "machines", value: 3 },
    ];
    cfg.recipeChoice = { "aether-shard": "raw-distillation", "wooden-log": "external" };
    cfg.defaultCrew = ["spark-stumpy", "spark-crafty"];
    cfg.stationCrew = { logger: ["spark-handy"] };
    cfg.fuel = { material: "coal", perMinute: 2 };
    const back = decodePlan(encodePlan("Copper line ✓", cfg))!;
    expect(back.name).toBe("Copper line ✓");
    expect(back.config.targets.map(({ material, mode, value }) => [material, mode, value])).toEqual([
      ["handy-spark-block", "rate", 1.5],
      ["sawn-timber", "machines", 3],
    ]);
    expect(back.config.recipeChoice).toEqual(cfg.recipeChoice);
    expect(back.config.defaultCrew).toEqual(cfg.defaultCrew);
    expect(back.config.stationCrew).toEqual(cfg.stationCrew);
    expect(back.config.fuel).toEqual({ material: "coal", perMinute: 2 });
  });

  it("produces a URL-safe, reasonably short link", () => {
    const code = encodePlan("Plan", defaultPlanConfig());
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(250);
  });

  it("rejects junk and drops anything not in the game data", () => {
    expect(decodePlan("not-base64!!")).toBeNull();
    expect(decodePlan(btoa("{}"))).toBeNull();
    const evil = btoa(
      JSON.stringify({
        v: 1,
        n: "x".repeat(500),
        t: [["sawn-timber", "r", 5], ["no-such-item", "r", 1], ["coal", "r", -3], ["coal", "q", 1]],
        r: { "sawn-timber": "no-such-recipe", "tree-bark": "bark", nope: "bark" },
        c: ["spark-crafty", "<script>"],
        s: { sawbench: ["spark-handy"], nowhere: ["spark-handy"] },
        f: ["gold", 99],
      }),
    ).replace(/=+$/, "");
    const p = decodePlan(evil)!;
    expect(p.name.length).toBe(60);
    expect(p.config.targets.map((t) => t.material)).toEqual(["sawn-timber"]);
    expect(p.config.recipeChoice).toEqual({ "tree-bark": "bark" });
    expect(p.config.defaultCrew).toEqual(defaultPlanConfig().defaultCrew);
    expect(p.config.stationCrew).toEqual({ sawbench: ["spark-handy"] });
    expect(p.config.fuel).toEqual(defaultPlanConfig().fuel);
  });
});
