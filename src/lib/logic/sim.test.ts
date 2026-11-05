import { describe, expect, it } from "vitest";
import { decodeCircuit, encodeCircuit, planWire, validateCircuit } from "./circuit";
import { CircuitBuilder, EXAMPLES } from "./examples";
import { PART_TYPES, TICK } from "./parts";
import { Sim } from "./sim";

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

describe("items", () => {
  function sorter(items: string[], filterCfg: Record<string, unknown>, power?: boolean) {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items, rate: 4 });
    const f = c.add("item-filter", 3, 0, filterCfg);
    const pass = c.add("storage", 6, 0, { rate: 0 });
    const rej = c.add("storage", 3, 4, { rate: 0 });
    c.wire(src, "out", f, "in").wire(f, "pass", pass, "in").wire(f, "reject", rej, "in");
    if (power !== undefined) {
      const l = c.add("lever", 3, -3, { on: power });
      c.wire(l, "out", f, "en");
    }
    const sim = new Sim(c.c);
    sim.run(10);
    const count = (id: string, item: string) => sim.storage(id)!.count(item);
    return { pass: (i: string) => count(pass, i), rej: (i: string) => count(rej, i) };
  }

  it("Item Filter routes matching items to pass and the rest to reject", () => {
    const r = sorter(["wooden-log", "stone"], { item: "wooden-log" });
    expect(r.pass("wooden-log")).toBeGreaterThan(5);
    expect(r.pass("stone")).toBe(0);
    expect(r.rej("stone")).toBeGreaterThan(5);
    expect(r.rej("wooden-log")).toBe(0);
  });

  it("a reversed Item Filter blocks its item instead", () => {
    const r = sorter(["wooden-log", "stone"], { item: "wooden-log", invert: true });
    expect(r.pass("wooden-log")).toBe(0);
    expect(r.pass("stone")).toBeGreaterThan(5);
    expect(r.rej("wooden-log")).toBeGreaterThan(5);
  });

  it("a wired, unpowered Item Filter is ignored (everything passes)", () => {
    const r = sorter(["wooden-log", "stone"], { item: "wooden-log" }, false);
    expect(r.pass("stone")).toBeGreaterThan(5);
    expect(r.rej("stone")).toBe(0);
    const on = sorter(["wooden-log", "stone"], { item: "wooden-log" }, true);
    expect(on.pass("stone")).toBe(0);
  });

  it("items queue behind a filter with no reject path", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 4 });
    const f = c.add("item-filter", 3, 0, { item: "wooden-log" });
    const pass = c.add("storage", 6, 0, { rate: 0 });
    c.wire(src, "out", f, "in").wire(f, "pass", pass, "in");
    const sim = new Sim(c.c);
    sim.run(10);
    expect(sim.storage(pass)!.total).toBe(0);
    const made = sim.state(src).made;
    sim.run(10);
    expect(sim.state(src).made).toBe(made); // path full, source stalled
  });

  it("Blocker and Spark Gate follow their signals", () => {
    const run = (type: string, on: boolean) => {
      const c = new CircuitBuilder("t");
      const src = c.add("source", 0, 0, { items: ["stone"], rate: 2 });
      const g = c.add(type, 3, 0);
      const l = c.add("lever", 3, -3, { on });
      const st = c.add("storage", 6, 0, { rate: 0 });
      c.wire(src, "out", g, "in").wire(g, "out", st, "in").wire(l, "out", g, "en");
      const sim = new Sim(c.c);
      sim.run(5);
      return sim.storage(st)!.total;
    };
    expect(run("blocker", true)).toBe(0);
    expect(run("blocker", false)).toBeGreaterThan(3);
    expect(run("spark-gate", false)).toBe(0);
    expect(run("spark-gate", true)).toBeGreaterThan(3);
  });

  it("Splitter alternates between its exits", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 2 });
    const sp = c.add("splitter", 3, 0);
    const a = c.add("storage", 6, -4, { rate: 0 });
    const b = c.add("storage", 6, 2, { rate: 0 });
    c.wire(src, "out", sp, "in").wire(sp, "a", a, "in").wire(sp, "b", b, "in");
    const sim = new Sim(c.c);
    sim.run(20);
    const na = sim.storage(a)!.total;
    const nb = sim.storage(b)!.total;
    expect(na + nb).toBeGreaterThan(30);
    expect(Math.abs(na - nb)).toBeLessThanOrEqual(1);
  });

  it("Amount Filter compares the stack size", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 2, stack: 5 });
    const f = c.add("amount-filter", 3, 0, { cmp: "ge", amount: 3 });
    const pass = c.add("storage", 6, 0, { rate: 0 });
    c.wire(src, "out", f, "in").wire(f, "pass", pass, "in");
    const sim = new Sim(c.c);
    sim.run(5);
    expect(sim.storage(pass)!.total % 5).toBe(0);
    expect(sim.storage(pass)!.total).toBeGreaterThan(10);
  });

  it("Wait Gate holds each item for its wait time", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 10 });
    const w = c.add("wait-gate", 3, 0, { wait: 2 });
    const st = c.add("storage", 6, 0, { rate: 0 });
    c.wire(src, "out", w, "in").wire(w, "out", st, "in");
    const sim = new Sim(c.c);
    sim.run(20.5);
    // One item per ~2 s regardless of the source rate.
    expect(sim.storage(st)!.total).toBeGreaterThanOrEqual(8);
    expect(sim.storage(st)!.total).toBeLessThanOrEqual(10);
  });

  it("storage respects capacity and stops accepting when full", () => {
    const c = new CircuitBuilder("t");
    const src = c.add("source", 0, 0, { items: ["stone"], rate: 5 });
    const st = c.add("storage", 3, 0, { capacity: 7, rate: 0 });
    c.wire(src, "out", st, "in");
    const sim = new Sim(c.c);
    sim.run(10);
    expect(sim.storage(st)!.total).toBe(7);
  });

  it("Extractor moves items only while enabled", () => {
    const c = new CircuitBuilder("t");
    const a = c.add("storage", 0, 0, { stock: [["stone", 50]], rate: 5 });
    const ex = c.add("extractor", 3, 0, { rate: 2 });
    const b = c.add("storage", 6, 0, { rate: 0 });
    const l = c.add("lever", 3, -3, { on: false });
    c.wire(a, "out", ex, "in").wire(ex, "out", b, "in").wire(l, "out", ex, "en");
    const sim = new Sim(c.c);
    sim.run(5);
    expect(sim.storage(b)!.total).toBe(0);
    sim.tap(l);
    sim.run(5);
    expect(sim.storage(b)!.total).toBeGreaterThanOrEqual(8);
    expect(sim.storage(b)!.total).toBeLessThanOrEqual(11);
    sim.tap(l);
    const before = sim.storage(b)!.total;
    sim.run(5);
    expect(sim.storage(b)!.total - before).toBeLessThanOrEqual(3); // only what was already on the path
  });

  it("Machine runs a game recipe only while enabled", () => {
    const c = new CircuitBuilder("t");
    const st = c.add("storage", 0, 0, { stock: [["wooden-log", 40]], rate: 4 });
    const m = c.add("machine", 3, 0, { recipe: "sawn-timber", speed: 4 }); // 16 s / 4 = 4 s per craft
    const out = c.add("storage", 7, 0, { rate: 0 });
    const l = c.add("lever", 3, -3, { on: true });
    c.wire(st, "out", m, "in").wire(m, "out", out, "in").wire(l, "out", m, "en");
    const sim = new Sim(c.c);
    sim.run(20);
    expect(sim.storage(out)!.count("sawn-timber")).toBeGreaterThanOrEqual(4);
    sim.tap(l);
    sim.run(1);
    const made = sim.storage(out)!.count("sawn-timber");
    sim.run(20);
    expect(sim.storage(out)!.count("sawn-timber")).toBe(made);
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
    // Destination storage drained by a machine, refilled by an extractor gated by the latch.
    const c = new CircuitBuilder("t");
    const hub = c.add("storage", 0, 0, { capacity: 999, stock: [["stone", 999]], rate: 10 });
    const ex = c.add("extractor", 3, 0, { rate: 4 });
    const dest = c.add("storage", 6, 0, { capacity: 40, stock: [["stone", 20]], rate: 2 });
    const use = c.add("machine", 9, 0, { useAmount: 1, seconds: 0.5 }); // 2 items/s
    const low = c.add("capacity-sensor", 6, -3, { cmp: "le", value: 25 });
    const high = c.add("capacity-sensor", 7, -3, { cmp: "ge", value: 90 });
    const latch = c.add("sr-latch", 9, -4);
    c.wire(hub, "out", ex, "in").wire(ex, "out", dest, "in").wire(dest, "out", use, "in");
    c.wire(low, "eye", dest, "sense").wire(high, "eye", dest, "sense");
    c.wire(low, "out", latch, "s").wire(high, "out", latch, "r").wire(latch, "q", ex, "en");
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
    expect(minFill).toBeGreaterThan(0.1);
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
    expect(sim.storage(byLabel("Overflow"))!.count("pebble")).toBeGreaterThan(0);
    // The furnace (fastest consumer) kept running: it was refilled from the hub.
    const furnace = c.parts.find((p) => p.cfg.label === "Furnace")!.id;
    expect(sim.state(furnace).made).toBeGreaterThan(30);
    // Requests went out over wireless at least once.
    const ex = c.parts.filter((p) => p.type === "extractor").map((p) => sim.state(p.id).moved);
    expect(Math.max(...ex)).toBeGreaterThan(10);
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
    // Path direction is fixed up when tapped in reverse.
    const p = planWire(b.c, { part: st, port: "in" }, { part: src, port: "out" });
    expect("wire" in p && p.wire.from).toEqual({ part: src, port: "out" });
    b.wire(src, "out", st, "in");
    expect("error" in planWire(b.c, { part: src, port: "out" }, { part: st, port: "in" })).toBe(true);
    expect("wire" in planWire(b.c, { part: st, port: "sense" }, { part: s, port: "eye" })).toBe(true);
  });
});
