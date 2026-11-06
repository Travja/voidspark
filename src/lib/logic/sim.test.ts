import { describe, expect, it } from "vitest";
import { connectPath, decodeCircuit, encodeCircuit, pathEndpoint, planWire, validateCircuit } from "./circuit";
import { CircuitBuilder, EXAMPLES, legacyExample } from "./examples";
import { PART_TYPES, stackSize, TICK } from "./parts";
import { Sim } from "./sim";
import type { Rot } from "./types";

/** Levers a/b → gate → lamp. Returns the lamp's value once settled. */
function gate(type: string, a: boolean, b: boolean): boolean {
  const c = new CircuitBuilder("t");
  const la = c.add("lever", 0, 0, { on: a });
  const lb = c.add("lever", 0, 2, { on: b });
  const g = c.add(type, 2, 0);
  const lamp = c.add("pixel", 5, 0);
  c.wire(la, "out", g, "a").wire(lb, "out", g, "b").wire(g, "out", lamp, "in");
  const sim = new Sim(c.c);
  sim.run(0.5);
  return sim.state<{ on: boolean }>(lamp)!.on;
}

describe("gates", () => {
  const cases: [boolean, boolean][] = [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ];
  it("AND truth table", () => expect(cases.map(([a, b]) => gate("and", a, b))).toEqual([false, false, false, true]));
  it("OR truth table", () => expect(cases.map(([a, b]) => gate("or", a, b))).toEqual([false, true, true, true]));
  it("XOR truth table", () => expect(cases.map(([a, b]) => gate("xor", a, b))).toEqual([false, true, true, false]));
  it("NOT inverts", () => {
    for (const on of [false, true]) {
      const c = new CircuitBuilder("t");
      const l = c.add("lever", 0, 0, { on });
      const n = c.add("not", 2, 0);
      const lamp = c.add("pixel", 4, 0);
      c.wire(l, "out", n, "in").wire(n, "out", lamp, "in");
      const sim = new Sim(c.c);
      sim.run(0.5);
      expect(sim.state(lamp).on).toBe(!on);
    }
  });

  it("each gate adds one tick of delay", () => {
    const c = new CircuitBuilder("t");
    const l = c.add("lever", 0, 0, { on: true });
    const n1 = c.add("or", 2, 0);
    const n2 = c.add("or", 5, 0);
    c.wire(l, "out", n1, "a").wire(n1, "out", n2, "a");
    const sim = new Sim(c.c);
    sim.step(); // lever output on
    expect(sim.port(n1, "out")).toBe(false);
    sim.step();
    expect(sim.port(n1, "out")).toBe(true);
    expect(sim.port(n2, "out")).toBe(false);
    sim.step();
    expect(sim.port(n2, "out")).toBe(true);
  });

  it("wired outputs combine as OR", () => {
    const c = new CircuitBuilder("t");
    const a = c.add("lever", 0, 0, { on: false });
    const b = c.add("lever", 0, 2, { on: true });
    const lamp = c.add("pixel", 3, 1);
    c.wire(a, "out", lamp, "in").wire(b, "out", lamp, "in");
    const sim = new Sim(c.c);
    sim.run(0.2);
    expect(sim.state(lamp).on).toBe(true);
    sim.tap(b);
    sim.run(0.2);
    expect(sim.state(lamp).on).toBe(false);
  });

  it("a NOT gate looped onto itself oscillates instead of hanging", () => {
    const c = new CircuitBuilder("t");
    const n = c.add("not", 0, 0);
    c.wire(n, "out", n, "in");
    const sim = new Sim(c.c);
    const seen = new Set<boolean>();
    for (let i = 0; i < 10; i++) {
      sim.step();
      seen.add(sim.port(n, "out"));
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
});

/** A button → part → (watch output). Press the button at t=0 for `pulse` seconds. */
function pulseInto(type: string, cfg: Record<string, unknown>, pulse: number) {
  const c = new CircuitBuilder("t");
  const btn = c.add("button", 0, 0, { pulse });
  const g = c.add(type, 2, 0, cfg);
  c.wire(btn, "out", g, "in");
  const sim = new Sim(c.c);
  sim.tap(btn);
  /** Samples the gate's output every tick for `seconds`. */
  const trace = (seconds: number) => {
    const out: boolean[] = [];
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      sim.step();
      out.push(sim.port(g, "out"));
    }
    return out;
  };
  return { sim, btn, g, trace };
}

const onTime = (trace: boolean[]) => +(trace.filter(Boolean).length * TICK).toFixed(2);

describe("timing gates", () => {
  it("Buffer Gate keeps the signal on for its hold time", () => {
    expect(onTime(pulseInto("buffer", { hold: 1 }, 0.5).trace(5))).toBe(1.5);
    expect(onTime(pulseInto("buffer", { hold: 0 }, 0.5).trace(5))).toBe(0.5);
    expect(onTime(pulseInto("buffer", { hold: 2.5 }, 0.2).trace(5))).toBe(2.7);
  });

  it("Filter Gate swallows pulses shorter than its time", () => {
    expect(onTime(pulseInto("filter", { time: 1 }, 0.5).trace(5))).toBe(0);
    // 2 s input, 1 s filter: on for the last second (+1 tick: the input is seen one tick late).
    expect(onTime(pulseInto("filter", { time: 1 }, 2).trace(5))).toBeCloseTo(1.05, 5);
    expect(onTime(pulseInto("filter", { time: 0 }, 0.5).trace(5))).toBe(0.5);
  });

  it("settings are clamped to the game's ranges and steps", () => {
    const c = new CircuitBuilder("t");
    const b = c.add("buffer", 0, 0, { hold: 99 });
    const f = c.add("filter", 0, 2, { time: 0.123 });
    const t = c.add("timer", 0, 4, { on: -3 });
    const w = c.add("wait-gate", 0, 6, { wait: 0.1 });
    const cfg = (id: string) => c.c.parts.find((p) => p.id === id)!.cfg;
    expect(cfg(b).hold).toBe(10);
    expect(cfg(f).time).toBe(0.1);
    expect(cfg(t).on).toBe(0);
    expect(cfg(w).wait).toBe(0.5);
  });

  it("Signal Timer sends for its on time and waits for its off time", () => {
    const c = new CircuitBuilder("t");
    const t = c.add("timer", 0, 0, { on: 0.5, off: 1.5 });
    const sim = new Sim(c.c);
    const trace: boolean[] = [];
    for (let i = 0; i < 160; i++) {
      sim.step();
      trace.push(sim.port(t, "out"));
    }
    expect(onTime(trace)).toBe(2); // 8 s: four periods of 2 s, 0.5 s on each
    expect(trace.slice(0, 10).every(Boolean)).toBe(true);
    expect(trace.slice(10, 40).some(Boolean)).toBe(false);
  });

  it("Counter Gate turns on after N signals and off at the next", () => {
    const c = new CircuitBuilder("t");
    const btn = c.add("button", 0, 0, { pulse: 0.1 });
    const g = c.add("counter-gate", 2, 0, { count: 3 });
    c.wire(btn, "out", g, "in");
    const sim = new Sim(c.c);
    const press = () => {
      sim.tap(btn);
      sim.run(0.5);
      return sim.port(g, "out");
    };
    expect([press(), press(), press(), press(), press(), press(), press()]).toEqual([false, false, true, false, false, false, true]);
  });

  it("Counter Gate can count the turn-off signal as the first of the next run", () => {
    const c = new CircuitBuilder("t");
    const btn = c.add("button", 0, 0, { pulse: 0.1 });
    const g = c.add("counter-gate", 2, 0, { count: 2, edgeCounts: true });
    c.wire(btn, "out", g, "in");
    const sim = new Sim(c.c);
    const press = () => {
      sim.tap(btn);
      sim.run(0.5);
      return sim.port(g, "out");
    };
    expect([press(), press(), press(), press()]).toEqual([false, true, false, true]);
  });
});

describe("memory", () => {
  function latch(priority: "reset" | "set" = "reset") {
    const c = new CircuitBuilder("t");
    const s = c.add("lever", 0, 0);
    const r = c.add("lever", 0, 2);
    const l = c.add("sr-latch", 2, 0, { priority });
    c.wire(s, "out", l, "s").wire(r, "out", l, "r");
    const sim = new Sim(c.c);
    const q = () => [sim.port(l, "q"), sim.port(l, "nq")];
    return { sim, s, r, q };
  }

  it("Set-Reset Latch starts reset, sets, holds, and resets", () => {
    const { sim, s, r, q } = latch();
    sim.run(0.2);
    expect(q()).toEqual([false, true]);
    sim.tap(s);
    sim.run(0.2);
    expect(q()).toEqual([true, false]);
    sim.tap(s); // Set released: still set
    sim.run(2);
    expect(q()).toEqual([true, false]);
    sim.tap(r);
    sim.run(0.2);
    expect(q()).toEqual([false, true]);
    sim.tap(r);
    sim.run(2);
    expect(q()).toEqual([false, true]);
  });

  it("Set-Reset Latch: both inputs on follows the priority setting", () => {
    for (const [priority, expected] of [
      ["reset", false],
      ["set", true],
    ] as const) {
      const { sim, s, r, q } = latch(priority);
      sim.tap(s);
      sim.tap(r);
      sim.run(0.3);
      expect(q()[0]).toBe(expected);
    }
  });

  it("a NOR latch built from gates is stable once set", () => {
    const ex = EXAMPLES.find((e) => e.id === "latch")!.build();
    const sim = new Sim(ex);
    const [set] = ex.parts.filter((p) => p.type === "button");
    const lamp = ex.parts.filter((p) => p.type === "pixel").at(-1)!.id;
    sim.tap(set.id);
    sim.run(1);
    const trace = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      sim.step();
      trace.add(sim.state(lamp).on);
    }
    expect([...trace]).toEqual([true]);
  });

  it("Data Flip-Flop samples Data on the clock's rising edge only", () => {
    const c = new CircuitBuilder("t");
    const d = c.add("lever", 0, 0);
    const clk = c.add("lever", 0, 2);
    const ff = c.add("d-flipflop", 2, 0);
    c.wire(d, "out", ff, "d").wire(clk, "out", ff, "clk");
    const sim = new Sim(c.c);
    sim.run(0.2);
    expect([sim.port(ff, "q"), sim.port(ff, "nq")]).toEqual([false, true]);
    sim.tap(d); // data on, no clock
    sim.run(0.2);
    expect(sim.port(ff, "q")).toBe(false);
    sim.tap(clk); // rising edge
    sim.run(0.2);
    expect(sim.port(ff, "q")).toBe(true);
    sim.tap(d); // data off while clock stays on: holds
    sim.run(0.5);
    expect(sim.port(ff, "q")).toBe(true);
    sim.tap(clk);
    sim.run(0.2);
    sim.tap(clk); // next rising edge samples 0
    sim.run(0.2);
    expect([sim.port(ff, "q"), sim.port(ff, "nq")]).toEqual([false, true]);
  });
});

describe("wireless", () => {
  function radio(txChannel: string, rxChannel: string, on = true) {
    const c = new CircuitBuilder("t");
    const l = c.add("lever", 0, 0, { on });
    const tx = c.add("wireless-sender", 2, 0, { channel: txChannel });
    const rx = c.add("wireless-receiver", 30, 30, { channel: rxChannel });
    c.wire(l, "out", tx, "in");
    const sim = new Sim(c.c);
    sim.run(0.3);
    return sim.port(rx, "out");
  }
  it("delivers on a matching channel, any distance", () => expect(radio("quartz", "quartz")).toBe(true));
  it("ignores other channels", () => expect(radio("quartz", "stone")).toBe(false));
  it("an empty channel never carries a signal", () => expect(radio("", "")).toBe(false));
  it("is off when the sender's input is off", () => expect(radio("quartz", "quartz", false)).toBe(false));
  it("several senders on one channel combine as OR", () => {
    const c = new CircuitBuilder("t");
    const a = c.add("lever", 0, 0, { on: false });
    const b = c.add("lever", 0, 2, { on: false });
    const ta = c.add("wireless-sender", 2, 0, { channel: "coal" });
    const tb = c.add("wireless-sender", 2, 2, { channel: "coal" });
    const rx = c.add("wireless-receiver", 5, 0, { channel: "coal" });
    c.wire(a, "out", ta, "in").wire(b, "out", tb, "in");
    const sim = new Sim(c.c);
    sim.run(0.3);
    expect(sim.port(rx, "out")).toBe(false);
    sim.tap(b);
    sim.run(0.3);
    expect(sim.port(rx, "out")).toBe(true);
  });
});

/** Lays a path between two ports and puts sparks on it at the first end, facing the second. */
function haul(b: CircuitBuilder, a: string, ap: string, z: string, zp: string, count = 1, carry = 1) {
  b.wire(a, ap, z, zp);
  const e = pathEndpoint(b.c, { part: a, port: ap })!;
  const f = pathEndpoint(b.c, { part: z, port: zp })!;
  const rot = (f.x > e.x ? 0 : f.x < e.x ? 2 : f.y > e.y ? 1 : 3) as Rot;
  return b.add("sparks", e.x, e.y, { count, carry }, rot);
}

describe("items on paths", () => {
  it("sparks carry items from a building's exit to another's entrance", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 5 });
    const st = c.add("storage", 6, -1, { capacity: 999 });
    haul(c, src, "out", st, "in", 2, 1);
    const sim = new Sim(c.c);
    sim.run(30);
    expect(sim.storage(st)!.count("stone")).toBeGreaterThan(10);
    expect(sim.sparks.length).toBe(2);
  });

  it("sparks take the right turn when they can, and a filter turns them away", () => {
    // Main row east from the source, with a branch to the south (right) and one to the north.
    const c = new CircuitBuilder("t");
    const src = c.add("source", -1, 0, { items: ["wooden-log", "stone"], rate: 5 });
    void src;
    c.path("s", [0, 0], [6, 0]);
    c.path("s", [3, 0], [3, 3]);
    c.path("s", [3, 0], [3, -3]);
    const south = c.add("storage", 4, 2, { capacity: 999 }); // entrance faces (3, 3)
    const north = c.add("storage", 4, -4, { capacity: 999 }); // entrance faces (3, -3)
    c.sparks(0, 0, 1, 1, 0);
    let sim = new Sim(c.c);
    sim.run(60);
    // Heading east, right is south: everything goes south.
    expect(sim.storage(south)!.total).toBeGreaterThan(3);
    expect(sim.storage(north)!.total).toBe(0);

    // Only logs may enter the south branch. Stone carries on east, turns back at the dead end,
    // and heading west the right turn is north.
    c.add("item-filter", 3, 1, { item: "wooden-log" });
    sim = new Sim(c.c);
    sim.run(150);
    expect(sim.storage(south)!.count("wooden-log")).toBeGreaterThan(4);
    expect(sim.storage(south)!.count("stone")).toBe(0);
    expect(sim.storage(north)!.count("stone")).toBeGreaterThan(4);
    expect(sim.storage(north)!.count("wooden-log")).toBe(0);
  });

  it("a reversed filter blocks its item; a wired, unpowered filter is ignored", () => {
    const build = (filter: Record<string, unknown>, power?: boolean) => {
      const c = new CircuitBuilder("t");
      c.add("source", -1, 0, { items: ["wooden-log"], rate: 5 });
      c.path("s", [0, 0], [3, 0], [3, 3]);
      const st = c.add("storage", 4, 2, { capacity: 999 });
      const f = c.add("item-filter", 3, 1, { item: "wooden-log", ...filter });
      if (power !== undefined) {
        const l = c.add("lever", 6, 0, { on: power });
        c.wire(l, "out", f, "en");
      }
      c.sparks(0, 0, 1, 1, 0);
      const sim = new Sim(c.c);
      sim.run(40);
      return sim.storage(st)!.total;
    };
    expect(build({})).toBeGreaterThan(3);
    expect(build({ invert: true })).toBe(0);
    expect(build({ invert: true }, false)).toBeGreaterThan(3); // unpowered: ignored
    expect(build({ invert: true }, true)).toBe(0);
  });

  it("a Blocker is a wall while active; a Spark Gate makes sparks wait until it opens", () => {
    const run = (type: string, on: boolean) => {
      const c = new CircuitBuilder("t");
      c.add("source", -1, 0, { items: ["stone"], rate: 5 });
      c.path("s", [0, 0], [6, 0]);
      const st = c.add("storage", 7, -1, { capacity: 999 }); // entrance faces (6, 0)
      const g = c.add(type, 3, 0);
      const l = c.add("lever", 3, -3, { on }, 1);
      c.wire(l, "out", g, "en");
      c.sparks(0, 0, 2, 1, 0);
      const sim = new Sim(c.c);
      sim.run(20);
      return { total: sim.storage(st)!.total, sim, c: c.c };
    };
    expect(run("blocker", true).total).toBe(0);
    expect(run("blocker", false).total).toBeGreaterThan(3);
    const closed = run("spark-gate", false);
    expect(closed.total).toBe(0);
    expect(closed.sim.sparks.some((s) => s.stuck.includes("Spark Gate"))).toBe(true);
    expect(run("spark-gate", true).total).toBeGreaterThan(3);
  });

  it("sparks queue behind a closed gate, at most two to a tile", () => {
    const c = new CircuitBuilder("t");
    c.add("source", -1, 0, { items: ["stone"], rate: 5 });
    c.path("s", [0, 0], [8, 0]);
    c.add("spark-gate", 6, 0);
    const l = c.add("lever", 6, -3, { on: false }, 1);
    c.wire(l, "out", c.c.parts.find((p) => p.type === "spark-gate")!.id, "en");
    c.sparks(0, 0, 6, 1, 0);
    const sim = new Sim(c.c);
    sim.run(20);
    const perTile = new Map<number, number>();
    for (const s of sim.sparks) perTile.set(s.x, (perTile.get(s.x) ?? 0) + 1);
    expect(Math.max(...perTile.values())).toBeLessThanOrEqual(2);
    expect(Math.max(...sim.sparks.map((s) => s.x))).toBe(5); // nobody past the gate
  });

  it("a Splitter sends sparks from its back to its exits in turn", () => {
    const c = new CircuitBuilder("t");
    c.add("source", -1, 0, { items: ["stone"], rate: 5 });
    c.path("s", [0, 0], [6, 0]);
    c.path("s", [3, 0], [3, 3]);
    c.add("splitter", 3, 0);
    const south = c.add("storage", 4, 2, { capacity: 999 });
    const east = c.add("storage", 7, -1, { capacity: 999 });
    c.sparks(0, 0, 2, 1, 0);
    const sim = new Sim(c.c);
    sim.run(120);
    const a = sim.storage(south)!.total;
    const b = sim.storage(east)!.total;
    expect(a).toBeGreaterThan(5);
    expect(b).toBeGreaterThan(5);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(3, (a + b) * 0.25));
  });

  it("a Crossing sends sparks straight across a junction", () => {
    const c = new CircuitBuilder("t");
    c.add("source", -1, 0, { items: ["stone"], rate: 5 });
    c.path("s", [0, 0], [6, 0]);
    c.path("s", [3, 0], [3, 3]);
    c.add("crossing", 3, 0);
    const south = c.add("storage", 4, 2, { capacity: 999 });
    const east = c.add("storage", 7, -1, { capacity: 999 });
    c.sparks(0, 0, 2, 1, 0);
    const sim = new Sim(c.c);
    sim.run(60);
    expect(sim.storage(east)!.total).toBeGreaterThan(5);
    expect(sim.storage(south)!.total).toBe(0);
  });

  it("a One Way turns sparks back when they come at it against the arrow", () => {
    // A loop. The spark starts heading west along the top, so it goes round anticlockwise
    // until it meets the One Way, which points east; from then on it goes round clockwise.
    const westbound = (oneWay: boolean) => {
      const c = new CircuitBuilder("t");
      c.path("s", [0, 0], [6, 0], [6, 4], [0, 4], [0, 0]);
      if (oneWay) c.add("one-way", 3, 0, {}, 0);
      c.sparks(1, 0, 1, 1, 2);
      const sim = new Sim(c.c);
      sim.run(20);
      let west = 0;
      for (let i = 0; i < 600; i++) {
        sim.step();
        const sp = sim.sparks[0];
        if (sp.y === 0 && sp.moving && sp.dir === 2) west++;
      }
      return west;
    };
    expect(westbound(false)).toBeGreaterThan(20);
    expect(westbound(true)).toBe(0);
  });

  it("a Wait Gate holds each spark for its wait time", () => {
    const trips = (wait?: number) => {
      const c = new CircuitBuilder("t");
      c.add("source", -1, 0, { items: ["stone"], rate: 10 });
      c.path("s", [0, 0], [2, 0]);
      const st = c.add("storage", 3, -1, { capacity: 999 });
      if (wait) c.add("wait-gate", 1, 0, { wait });
      c.sparks(0, 0, 1, 1, 0);
      const sim = new Sim(c.c);
      sim.run(60);
      return sim.storage(st)!.total;
    };
    const free = trips();
    const held = trips(5); // passed twice per round trip: about 10 s more each
    expect(free).toBeGreaterThan(held * 3);
    expect(held).toBeGreaterThanOrEqual(4);
    expect(held).toBeLessThanOrEqual(6);
  });

  it("an Amount Filter compares what a spark carries", () => {
    const run = (carry: number) => {
      const c = new CircuitBuilder("t");
      c.add("source", -1, 0, { items: ["stone"], rate: 5, stack: 5 });
      c.path("s", [0, 0], [4, 0]);
      const st = c.add("storage", 5, -1, { capacity: 999 });
      c.add("amount-filter", 2, 0, { cmp: "le", amount: 2 });
      c.sparks(0, 0, 1, carry, 0);
      const sim = new Sim(c.c);
      sim.run(30);
      return sim.storage(st)!.total;
    };
    expect(run(1)).toBeGreaterThan(4);
    expect(run(0)).toBe(0); // a whole load of 5 is turned away
  });

  it("a Pressure Sensor signals as sparks step on it", () => {
    const c = new CircuitBuilder("t");
    c.add("source", -1, 0, { items: ["stone"], rate: 5 });
    c.path("s", [0, 0], [4, 0]);
    const pad = c.add("pressure-sensor", 2, 0);
    c.sparks(0, 0, 1, 1, 0);
    const sim = new Sim(c.c);
    let on = 0;
    for (let i = 0; i < 400; i++) {
      sim.step();
      if (sim.port(pad, "sig")) on++;
    }
    expect(on).toBeGreaterThan(10);
    expect(sim.state(pad).passed).toBeGreaterThan(3);
  });

  it("full storage refuses a load; the spark keeps it and walks on", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 5 });
    const st = c.add("storage", 6, -1, { capacity: 7 });
    haul(c, src, "out", st, "in", 2, 1);
    const sim = new Sim(c.c);
    sim.run(40);
    expect(sim.storage(st)!.total).toBe(7);
    expect(sim.sparks.every((s) => s.load?.item === "stone")).toBe(true);
  });

  it("sparks walk Dirt Paths at 60 % of their Stone Path speed", () => {
    const lap = (kind: "s" | "d") => {
      const c = new CircuitBuilder("t");
      c.path(kind, [0, 0], [20, 0]);
      c.sparks(0, 0, 1, 1, 0);
      const sim = new Sim(c.c);
      let t = 0;
      while (sim.sparks[0].x < 20 && t < 4000) {
        sim.step();
        t++;
      }
      return t;
    };
    const stone = lap("s");
    const dirt = lap("d");
    expect(dirt / stone).toBeGreaterThan(1.55);
    expect(dirt / stone).toBeLessThan(1.8);
  });

  it("Machine runs a game recipe only while enabled", () => {
    const c = new CircuitBuilder("t");
    const st = c.add("storage", 0, 0, { stock: [["wooden-log", 40]] });
    const m = c.add("machine", 5, 0, { recipe: "sawn-timber", speed: 4 }); // 16 s / 4 = 4 s per craft
    const out = c.add("storage", 10, 0, {});
    const l = c.add("lever", 5, -3, { on: true }, 1);
    c.wire(l, "out", m, "en");
    haul(c, st, "out", m, "in", 1, 0);
    haul(c, m, "out", out, "in", 1, 0);
    const sim = new Sim(c.c);
    sim.run(30);
    expect(sim.storage(out)!.count("sawn-timber")).toBeGreaterThanOrEqual(4);
    sim.tap(l);
    sim.run(5);
    const made = sim.state(m).made;
    sim.run(20);
    expect(sim.state(m).made).toBe(made);
  });

  it("share links keep path tiles and their kinds", async () => {
    const c = new CircuitBuilder("t");
    c.path("s", [0, 0], [4, 0]);
    c.path("d", [4, 0], [4, 3]);
    c.sparks(0, 0, 3, 0, 0);
    const back = (await decodeCircuit(await encodeCircuit(c.c)))!;
    expect(back.paths).toEqual(c.c.paths);
    expect(back.parts.find((p) => p.type === "sparks")!.cfg).toMatchObject({ count: 3, carry: 0 });
  });

  it("old circuits with link paths are converted to path tiles with sparks", () => {
    const raw = {
      name: "old",
      parts: [
        { id: "s", type: "source", x: 0, y: 0, rot: 0, cfg: { items: ["stone"], rate: 5 } },
        { id: "t", type: "storage", x: 6, y: -1, rot: 0, cfg: { capacity: 999 } },
      ],
      wires: [{ id: "w", from: { part: "s", port: "out" }, to: { part: "t", port: "in" } }],
    };
    const c = validateCircuit(raw)!;
    expect(c.wires).toEqual([]);
    expect(Object.keys(c.paths).length).toBeGreaterThan(3);
    expect(c.parts.some((p) => p.type === "sparks")).toBe(true);
    const sim = new Sim(c);
    sim.run(30);
    expect(sim.storage("t")!.total).toBeGreaterThan(5);
  });
});

describe("capacity sensor", () => {
  function sensor(cfg: Record<string, unknown>, stock: [string, number][], capacity = 100) {
    const c = new CircuitBuilder("t");
    const st = c.add("storage", 0, 0, { capacity, stock, rate: 0 });
    const s = c.add("capacity-sensor", 0, -2, cfg);
    c.wire(s, "eye", st, "sense");
    const sim = new Sim(c.c);
    sim.run(0.2);
    return sim.port(s, "out");
  }
  it("percent ≤ / ≥ thresholds", () => {
    expect(sensor({ mode: "percent", cmp: "le", value: 25 }, [["stone", 25]])).toBe(true);
    expect(sensor({ mode: "percent", cmp: "le", value: 25 }, [["stone", 26]])).toBe(false);
    expect(sensor({ mode: "percent", cmp: "ge", value: 90 }, [["stone", 90]])).toBe(true);
    expect(sensor({ mode: "percent", cmp: "ge", value: 90 }, [["stone", 89]])).toBe(false);
  });
  it("absolute thresholds", () => {
    expect(sensor({ mode: "absolute", cmp: "ge", value: 30 }, [["stone", 30]], 400)).toBe(true);
    expect(sensor({ mode: "absolute", cmp: "le", value: 3 }, [["stone", 4]], 400)).toBe(false);
  });
  it("can count a single item type", () => {
    expect(sensor({ mode: "absolute", cmp: "ge", value: 10, item: "quartz" }, [["stone", 50], ["quartz", 5]])).toBe(false);
    expect(sensor({ mode: "absolute", cmp: "ge", value: 10 }, [["stone", 50], ["quartz", 5]])).toBe(true);
  });
  it("is off when not watching anything", () => {
    const c = new CircuitBuilder("t");
    const s = c.add("capacity-sensor", 0, 0, { cmp: "le", value: 100 });
    const sim = new Sim(c.c);
    sim.run(0.2);
    expect(sim.port(s, "out")).toBe(false);
  });

  it("low/high sensors plus a latch give a refill band (hysteresis)", () => {
    // Destination storage drained by a machine, refilled by sparks behind a Spark Gate the latch opens.
    const c = new CircuitBuilder("t");
    const hub = c.add("storage", 0, 0, { capacity: 999, stock: [["stone", 999]] });
    const dest = c.add("storage", 8, 0, { capacity: 40, stock: [["stone", 20]] });
    const use = c.add("machine", 13, 0, { useAmount: 1, seconds: 0.1 });
    haul(c, hub, "out", dest, "in", 2, 10); // about 4 items/s in while the gate is open
    haul(c, dest, "out", use, "in", 1, 2); // about 1 item/s out
    const gate = c.add("spark-gate", 4, 1);
    const low = c.add("capacity-sensor", 8, -3, { cmp: "le", value: 25 });
    const high = c.add("capacity-sensor", 9, -3, { cmp: "ge", value: 90 });
    const latch = c.add("sr-latch", 11, -4);
    c.wire(low, "eye", dest, "sense").wire(high, "eye", dest, "sense");
    c.wire(low, "out", latch, "s").wire(high, "out", latch, "r").wire(latch, "q", gate, "en");
    const sim = new Sim(c.c);
    let minFill = 1;
    let maxFill = 0;
    let switches = 0;
    let prev = sim.port(latch, "q");
    for (let i = 0; i < 20 * 120; i++) {
      sim.step();
      const fill = sim.storage(dest)!.total / 40;
      if (i > 200) {
        minFill = Math.min(minFill, fill);
        maxFill = Math.max(maxFill, fill);
      }
      const q = sim.port(latch, "q");
      if (q !== prev) switches++;
      prev = q;
    }
    // It cycles between the thresholds instead of chattering at one level.
    expect(switches).toBeGreaterThanOrEqual(4);
    expect(switches).toBeLessThan(60);
    expect(minFill).toBeGreaterThan(0.05); // refilled before it runs dry
    expect(minFill).toBeLessThanOrEqual(0.25);
    expect(maxFill).toBeGreaterThanOrEqual(0.9);
  });
});

describe("distribution center example", () => {
  it("sorts the train's items, and refills each workshop over wireless", () => {
    const c = EXAMPLES[0].build();
    const sim = new Sim(c);
    const byLabel = (label: string) => c.parts.find((p) => p.cfg.label === label)!.id;
    sim.run(240);
    // Hub storages only ever hold their own item.
    for (const [label, item] of [
      ["Hub Logs", "wooden-log"],
      ["Hub Stone", "stone"],
      ["Hub Limestone", "limestone"],
    ]) {
      const v = sim.storage(byLabel(label))!;
      expect(v.count(item)).toBe(v.total);
    }
    // Pebbles match no filter and end up in the overflow Compressor at the end of the line.
    const compressors = c.parts.filter((p) => p.type === "compressor");
    expect(Math.max(...compressors.map((p) => sim.state(p.id).sent))).toBeGreaterThan(0);
    // Every workshop kept crafting: it was refilled from the hub when it asked over wireless.
    for (const p of c.parts.filter((x) => x.type === "machine")) expect(sim.state(p.id).made).toBeGreaterThan(20);
  });

  it("keeps flowing for a long run: no jams at the hub or the workshops", () => {
    const c = EXAMPLES[0].build();
    const sim = new Sim(c);
    const train = c.parts.find((p) => p.type === "source")!.id;
    const machines = c.parts.filter((p) => p.type === "machine").map((p) => p.id);
    sim.run(600);
    const sentAt10 = sim.state(train).made;
    const madeAt10 = machines.map((m) => sim.state(m).made);
    sim.run(300);
    // The train is still being unloaded and every workshop is still crafting.
    expect(sim.state(train).made - sentAt10).toBeGreaterThan(550);
    machines.forEach((m, i) => expect(sim.state(m).made).toBeGreaterThan(madeAt10[i]));
  });

  it("a few hundred parts simulate quickly", () => {
    const b = new CircuitBuilder("big");
    for (let i = 0; i < 100; i++) {
      const t = b.add("timer", 0, i * 3, { on: 0.3, off: 0.4 });
      const n = b.add("not", 2, i * 3);
      const l = b.add("buffer", 4, i * 3);
      const p = b.add("pixel", 6, i * 3);
      b.wire(t, "out", n, "in").wire(n, "out", l, "in").wire(l, "out", p, "in");
    }
    const sim = new Sim(b.c);
    const start = performance.now();
    sim.run(60); // 1200 ticks
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe("circuits and share links", () => {
  it("every example is valid and survives validation unchanged", () => {
    for (const ex of EXAMPLES) {
      const c = ex.build();
      const v = validateCircuit(JSON.parse(JSON.stringify(c)))!;
      expect(v.parts.length).toBe(c.parts.length);
      expect(v.wires.length).toBe(c.wires.length);
    }
  });

  it("every part type has sane ports and defaults", () => {
    for (const t of PART_TYPES) {
      const ids = t.ports.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      const cfg = t.defaults();
      for (const f of t.fields) expect(cfg).toHaveProperty(f.key);
      expect(() => t.init(cfg)).not.toThrow();
    }
  });

  it("round-trips a circuit through a share link", async () => {
    const c = EXAMPLES[0].build();
    const back = (await decodeCircuit(await encodeCircuit(c)))!;
    expect(back.name).toBe(c.name);
    expect(back.parts.map((p) => [p.type, p.x, p.y, p.rot, p.cfg])).toEqual(c.parts.map((p) => [p.type, p.x, p.y, p.rot, p.cfg]));
    expect(back.wires.length).toBe(c.wires.length);
    // Same behaviour after the trip.
    const a = new Sim(c);
    const b = new Sim(back);
    a.run(30);
    b.run(30);
    const totals = (s: Sim, cc: typeof c) => cc.parts.filter((p) => p.type === "storage").map((p) => s.storage(p.id)!.total);
    expect(totals(b, back)).toEqual(totals(a, c));
  });

  it("rejects bad share links", async () => {
    expect(await decodeCircuit("")).toBeNull();
    expect(await decodeCircuit("not base64!")).toBeNull();
    expect(await decodeCircuit("zAAAA")).toBeNull();
    const enc = (o: unknown) => `j${btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    expect(await decodeCircuit(enc({ v: 2, n: "x", p: [], w: [] }))).toBeNull();
    expect(await decodeCircuit(enc({ v: 1, n: "x", p: "nope", w: [] }))).toBeNull();
    expect(await decodeCircuit(enc([1, 2, 3]))).toBeNull();
  });

  it("drops unknown parts, bad wires and bad settings from a link", async () => {
    const enc = (o: unknown) => `j${btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    const c = (await decodeCircuit(
      enc({
        v: 1,
        n: "<b>x</b>",
        p: [
          ["lever", 0, 0, 0],
          ["nuke", 1, 1, 0],
          ["buffer", 2, 0, 7, { hold: 1e9, evil: "<script>" }],
          ["wireless-sender", 4, 0, 0, { channel: "not-an-item" }],
          ["storage", "x", 0, 0],
        ],
        w: [
          [0, "out", 2, "in"],
          [0, "out", 9, "in"],
          [0, "nope", 2, "in"],
          [2, "out", 3, "in"],
        ],
      }),
    ))!;
    expect(c.parts.map((p) => p.type)).toEqual(["lever", "buffer", "wireless-sender"]);
    expect(c.parts[1].cfg).toEqual({ hold: 10 });
    expect(c.parts[1].rot).toBe(0);
    expect(c.parts[2].cfg).toEqual({ channel: "" });
    // Wires refer to parts by their index in the link; ones touching dropped parts or ports go.
    // Old point-to-point logic wires are laid onto the grid as tiles.
    expect(c.wires).toEqual([]);
    expect(Object.keys(c.cells).length).toBeGreaterThan(0);
    const sim = new Sim(c);
    sim.run(0.5);
    expect(sim.portWired(c.parts[0].id, "out")).toBe(true);
    expect(sim.portWired(c.parts[2].id, "in")).toBe(true);
    expect(c.wires.every((w) => c.parts.some((p) => p.id === w.from.part) && c.parts.some((p) => p.id === w.to.part))).toBe(true);
  });

  it("refuses connections that make no sense", () => {
    const b = new CircuitBuilder("t");
    const src = b.add("source", 0, 0);
    const st = b.add("storage", 3, 0);
    const l = b.add("lever", 0, 3);
    const s = b.add("capacity-sensor", 3, 3);
    expect("error" in planWire(b.c, { part: l, port: "out" }, { part: st, port: "in" })).toBe(true);
    expect("error" in planWire(b.c, { part: st, port: "in" }, { part: st, port: "in" })).toBe(true);
    // Items go on path tiles now, not links.
    expect("error" in planWire(b.c, { part: src, port: "out" }, { part: st, port: "in" })).toBe(true);
    expect(connectPath(b.c, { part: src, port: "out" }, { part: st, port: "in" })).toBeNull();
    expect(connectPath(b.c, { part: l, port: "out" }, { part: st, port: "in" })).not.toBeNull();
    expect("wire" in planWire(b.c, { part: st, port: "sense" }, { part: s, port: "eye" })).toBe(true);
  });
});

describe("machine output slot", () => {
  /** Furnace making Quartz from plenty of Limestone, output not connected. */
  function furnace(cfg: Record<string, unknown> = {}, linked = false) {
    const c = new CircuitBuilder("t");
    const st = c.add("storage", 0, 0, { capacity: 9999, stock: [["limestone", 9999]] });
    const m = c.add("machine", 4, 0, { recipe: "quartz", speed: 8, ...cfg }); // 8 s / 8 = 1 s per Quartz
    haul(c, st, "out", m, "in", 1, 0);
    let out: string | undefined;
    if (linked) {
      out = c.add("storage", 9, 0, { capacity: 9999 });
      haul(c, m, "out", out, "in", 1, 0);
    }
    return { sim: new Sim(c.c), m, out };
  }

  it("uses the item's stack size from the game data (Quartz: 20)", () => {
    expect(stackSize("quartz")).toBe(20);
    expect(stackSize("limestone")).toBe(20);
  });

  it("stops when its output slot holds a full stack and nothing takes it", () => {
    const { sim, m } = furnace();
    sim.run(120);
    expect(sim.state(m).out).toEqual({ quartz: 20 });
    expect(sim.state(m).made).toBe(20);
    expect(sim.describe(m)[0]).toMatch(/output slot full \(20\/20 Quartz\)/);
    expect(sim.status(m).warn).toBe(true);
  });

  it("starts again once the output is taken", () => {
    const { sim, m } = furnace();
    sim.run(120);
    expect(sim.act(m)).toBe(true);
    sim.run(10.5);
    expect(sim.state(m).made).toBeGreaterThanOrEqual(29);
  });

  it("keeps going while a path carries the products away", () => {
    const { sim, m, out } = furnace({}, true);
    sim.run(120);
    expect(sim.state(m).made).toBeGreaterThan(100);
    expect(sim.storage(out!)!.count("quartz")).toBeGreaterThan(100);
  });

  it("can be set to hold a different amount", () => {
    const { sim, m } = furnace({ slot: 5 });
    sim.run(60);
    expect(sim.state(m).out).toEqual({ quartz: 5 });
  });
});

describe("saved circuits from before path tiles", () => {
  // A copy of the Filter split example as saved before items moved on path tiles.
  const oldFilterSplit = {"name": "Filter split", "parts": [{"id": "cmw4caaov3k", "type": "source", "x": 0, "y": 2, "rot": 0, "cfg": {"items": ["wooden-log", "stone"], "rate": 1, "stack": 1}}, {"id": "cmw4caaov3l", "type": "pressure-sensor", "x": 3, "y": 2, "rot": 0, "cfg": {"hold": 0.5}}, {"id": "cmw4caaov3m", "type": "pixel", "x": 3, "y": 4, "rot": 0, "cfg": {}}, {"id": "cmw4caaov3n", "type": "item-filter", "x": 6, "y": 2, "rot": 0, "cfg": {"item": "wooden-log", "invert": false, "overflow": true}}, {"id": "cmw4caaov3o", "type": "blocker", "x": 9, "y": 2, "rot": 0, "cfg": {"closed": false}}, {"id": "cmw4caaov3p", "type": "lever", "x": 9, "y": 0, "rot": 0, "cfg": {"on": false}}, {"id": "cmw4caaov3q", "type": "storage", "x": 12, "y": 1, "rot": 0, "cfg": {"label": "Logs", "capacity": 50, "take": "", "rate": 0, "stock": []}}, {"id": "cmw4caaov3r", "type": "storage", "x": 9, "y": 6, "rot": 0, "cfg": {"label": "Stone", "capacity": 50, "take": "", "rate": 0, "stock": []}}, {"id": "cmw4caaov3x", "type": "label", "x": 11, "y": -1, "rot": 0, "cfg": {"text": "Lever on = block logs"}}], "wires": [{"id": "wmw4caaov3s", "from": {"part": "cmw4caaov3k", "port": "out"}, "to": {"part": "cmw4caaov3l", "port": "in"}}, {"id": "wmw4caaov3t", "from": {"part": "cmw4caaov3l", "port": "out"}, "to": {"part": "cmw4caaov3n", "port": "in"}}, {"id": "wmw4caaov3u", "from": {"part": "cmw4caaov3n", "port": "pass"}, "to": {"part": "cmw4caaov3o", "port": "in"}}, {"id": "wmw4caaov3v", "from": {"part": "cmw4caaov3o", "port": "out"}, "to": {"part": "cmw4caaov3q", "port": "in"}}, {"id": "wmw4caaov3w", "from": {"part": "cmw4caaov3n", "port": "reject"}, "to": {"part": "cmw4caaov3r", "port": "in"}}], "cells": {"3,3": "w4", "2,3": "w3", "2,4": "w8", "10,0": "w2", "10,1": "w12", "9,1": "w1"}, "settings": {"walkSpeed": 2}};

  it("old copies of an example are rebuilt from the current example, keeping their name", () => {
    const c = legacyExample({ ...oldFilterSplit, name: "Filter split (2)" })!;
    expect(c).not.toBeNull();
    expect(c.name).toBe("Filter split (2)");
    expect(c.paths).toEqual(EXAMPLES.find((e) => e.id === "filter")!.build().paths);
  });

  it("leaves everything else alone", () => {
    expect(legacyExample({ ...oldFilterSplit, name: "My factory" })).toBeNull();
    expect(legacyExample(EXAMPLES[0].build())).toBeNull(); // already on paths
    expect(legacyExample(EXAMPLES[1].build())).toBeNull(); // logic only
    expect(legacyExample(null)).toBeNull();
  });
});

describe("drawing sparks", () => {
  const one = (path: [number, number][], rot: Rot) => {
    const c = new CircuitBuilder("t");
    c.path("s", ...path);
    c.sparks(path[0][0], path[0][1], 1, 1, rot);
    return new Sim(c.c);
  };

  it("keeps to the right-hand side of the path", () => {
    const sim = one([[0, 0], [6, 0]], 0);
    sim.run(0.5);
    const s = sim.sparks[0];
    expect(s.dir).toBe(0);
    expect(sim.sparkPosition(s).y).toBeCloseTo(0.5 + 0.18); // heading east, right is down the screen
  });

  it("swings round in a loop at a dead end instead of reversing on the spot", () => {
    const sim = one([[0, 0], [3, 0]], 0);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 200; i++) {
      sim.step();
      pts.push(sim.sparkPosition(sim.sparks[0]));
    }
    // It goes out on the lower lane and comes back on the upper one ...
    expect(pts.some((p) => p.y > 0.6)).toBe(true);
    expect(pts.some((p) => p.y < 0.4)).toBe(true);
    // ... and never jumps: consecutive ticks stay close (a step is 0.1 tiles; the swing round is a
    // little longer than the half tile it's drawn in, so it's a little quicker).
    let jump = 0;
    for (let i = 1; i < pts.length; i++) jump = Math.max(jump, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    expect(jump).toBeLessThan(0.25);
  });

  it("turns corners smoothly", () => {
    const sim = one([[0, 0], [3, 0], [3, 3]], 0);
    let prev = sim.sparkPosition(sim.sparks[0]);
    let jump = 0;
    for (let i = 0; i < 55; i++) {
      sim.step();
      const p = sim.sparkPosition(sim.sparks[0]);
      jump = Math.max(jump, Math.hypot(p.x - prev.x, p.y - prev.y));
      prev = p;
    }
    expect(jump).toBeLessThan(0.15);
  });
});

describe("compressor", () => {
  it("takes everything when it has no rate set", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone", "quartz"], rate: 5 });
    const comp = c.add("compressor", 5, 0);
    haul(c, src, "out", comp, "in", 3, 1);
    const sim = new Sim(c.c);
    sim.run(30);
    expect(sim.state(comp).sent).toBeGreaterThan(15);
    expect(sim.state(src).made - sim.state(comp).sent).toBeLessThanOrEqual(3); // only what's being carried
  });

  it("with a rate it holds up to 20 stacks, then refuses loads", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 10, stack: 20 });
    const comp = c.add("compressor", 4, 0, { rate: 1 });
    haul(c, src, "out", comp, "in", 4, 0);
    const sim = new Sim(c.c);
    sim.run(200);
    const held = sim.state(comp).held.stone;
    expect(held).toBeGreaterThan(19 * 20); // nearly 20 slots of Stone (stack 20), less what it's sending
    expect(held).toBeLessThanOrEqual(20 * 20);
    expect(sim.state(comp).sent).toBeGreaterThanOrEqual(150);
    expect(sim.state(comp).sent).toBeLessThanOrEqual(201);
  });

  it("accepts items on both entrances", () => {
    const c = new CircuitBuilder("t");
    const a = c.add("source", 0, -3, { items: ["stone"], rate: 2 });
    const b = c.add("source", 0, 4, { items: ["wooden-log"], rate: 2 });
    const comp = c.add("compressor", 5, 0);
    haul(c, a, "out", comp, "in", 1, 1);
    haul(c, b, "out", comp, "in2", 1, 1);
    const sim = new Sim(c.c);
    sim.run(30);
    expect(sim.state(comp).sent).toBeGreaterThan(6);
  });
});
