import { describe, expect, it } from "vitest";
import { connectLogic } from "./circuit";
import { CircuitBuilder } from "./examples";
import { buildNets, cellKey, cellLine, erase, kindOf, paint, portCell, routeWire, toggleBridge } from "./grid";
import { PARTS } from "./parts";
import { Sim } from "./sim";
import type { Circuit } from "./types";

/** Paints a straight stroke of tiles. */
const stroke = (c: Circuit, kind: "w" | "r", x0: number, y0: number, x1: number, y1: number) => paint(c.cells, kind, cellLine(x0, y0, x1, y1));
const settle = (c: Circuit) => {
  const sim = new Sim(c);
  sim.run(0.5);
  return sim;
};

describe("wire tiles", () => {
  it("a painted wire carries a lever to a lamp", () => {
    const b = new CircuitBuilder("t");
    b.add("lever", 0, 0, { on: true });
    const p = b.add("pixel", 6, 0);
    stroke(b.c, "w", 1, 0, 5, 0);
    expect(settle(b.c).state(p).on).toBe(true);
  });

  it("wires side by side stay separate (they only join where drawn)", () => {
    const b = new CircuitBuilder("t");
    b.add("lever", 0, 0, { on: true });
    b.add("lever", 0, 1, { on: false });
    const p1 = b.add("pixel", 6, 0);
    const p2 = b.add("pixel", 6, 1);
    stroke(b.c, "w", 1, 0, 5, 0);
    stroke(b.c, "w", 1, 1, 5, 1);
    const sim = settle(b.c);
    expect(sim.state(p1).on).toBe(true);
    expect(sim.state(p2).on).toBe(false);
    expect(buildNets(b.c).count).toBe(2);
  });

  it("a gap breaks the wire, and joining it reconnects", () => {
    const b = new CircuitBuilder("t");
    b.add("lever", 0, 0, { on: true });
    const p = b.add("pixel", 6, 0);
    stroke(b.c, "w", 1, 0, 2, 0);
    stroke(b.c, "w", 4, 0, 5, 0);
    expect(settle(b.c).state(p).on).toBe(false);
    stroke(b.c, "w", 2, 0, 4, 0);
    expect(settle(b.c).state(p).on).toBe(true);
    erase(b.c.cells, cellKey(3, 0));
    expect(settle(b.c).state(p).on).toBe(false);
  });

  it("a bridge lets two wires cross without connecting", () => {
    const b = new CircuitBuilder("t");
    b.add("lever", 0, 2, { on: true }); // horizontal, on
    const pH = b.add("pixel", 6, 2);
    b.add("lever", 3, -2, { on: false }, 1); // vertical, off; rotated so its output faces down
    const pV = b.add("pixel", 3, 6, {}, 1); // input faces up
    stroke(b.c, "w", 1, 2, 5, 2);
    stroke(b.c, "w", 3, -1, 3, 5);
    // A plain crossing joins them…
    let sim = settle(b.c);
    expect(sim.state(pV).on).toBe(true);
    // …a bridge keeps them apart.
    toggleBridge(b.c.cells, cellKey(3, 2));
    sim = settle(b.c);
    expect(sim.state(pH).on).toBe(true);
    expect(sim.state(pV).on).toBe(false);
  });

  it("ports plug into the tile just outside them, whichever way the part is turned", () => {
    for (const rot of [0, 1, 2, 3] as const) {
      const b = new CircuitBuilder("t");
      const n = b.add("not", 5, 5, {}, rot);
      const part = b.c.parts.find((p) => p.id === n)!;
      const out = portCell(part, PARTS.get("not")!.ports.find((p) => p.id === "out")!);
      const expected = [
        [6, 5],
        [5, 6],
        [4, 5],
        [5, 4],
      ][rot];
      expect([out.x, out.y]).toEqual(expected);
    }
  });
});

describe("ribbons", () => {
  it("writers put signals on bits 1–3, a plain wire lands on bit 0, readers and the four pixel display read them", () => {
    const b = new CircuitBuilder("t");
    // Ribbon running along row 10 from x=2 to x=12; inputs come down from above.
    const levers = [0, 1, 2, 3].map((i) => b.add("lever", 2 + i * 2, 0, { on: i !== 2 }, 1)); // bit 2 off
    const writers = [1, 2, 3].map((bit) => b.add("ribbon-writer", 4 + (bit - 1) * 2, 4, { bit: String(bit) }, 1));
    // lever 0 -> straight down to the ribbon (bit 0); levers 1-3 -> writers
    stroke(b.c, "w", 2, 1, 2, 9);
    for (let i = 1; i < 4; i++) stroke(b.c, "w", 2 + i * 2, 1, 2 + i * 2, 3);
    for (let i = 1; i < 4; i++) stroke(b.c, "r", 2 + i * 2, 5, 2 + i * 2, 9);
    stroke(b.c, "r", 2, 10, 12, 10);
    for (let i = 0; i < 4; i++) paint(b.c.cells, "r", [[2 + i * 2, 9], [2 + i * 2, 10]]);
    const show = b.add("pixel4", 13, 10, {}, 0);
    void levers;
    void writers;
    // Four pixel display's input faces left, onto (12, 10).
    let sim = settle(b.c);
    expect(sim.state(show).on).toEqual([true, true, false, true]);
    // A reader on bit 3 below the ribbon.
    paint(b.c.cells, "r", [[12, 10], [12, 11], [12, 12]]);
    const reader = b.add("ribbon-reader", 12, 13, { bit: "3" }, 1);
    const lamp = b.add("pixel", 12, 16, {}, 1);
    stroke(b.c, "w", 12, 14, 12, 15);
    sim = settle(b.c);
    expect(sim.port(reader, "out")).toBe(true);
    expect(sim.state(lamp).on).toBe(true);
    // The ribbon tiles each carry four networks.
    expect(buildNets(b.c).cellNets.get(cellKey(5, 10))!.length).toBe(4);
  });
});

describe("routing", () => {
  it("connects two ports with tiles and works out the wiring", () => {
    const b = new CircuitBuilder("t");
    const l = b.add("lever", 0, 0, { on: true });
    const p = b.add("pixel", 8, 5);
    expect(connectLogic(b.c, { part: l, port: "out" }, { part: p, port: "in" })).toBeNull();
    expect(Object.keys(b.c.cells).length).toBeGreaterThan(5);
    expect(settle(b.c).state(p).on).toBe(true);
    expect(connectLogic(b.c, { part: l, port: "out" }, { part: p, port: "in" })).toBe("Already connected.");
  });

  it("goes around parts", () => {
    const b = new CircuitBuilder("t");
    const l = b.add("lever", 0, 2, { on: true });
    b.add("storage", 3, 1); // in the way
    const p = b.add("pixel", 7, 2);
    const r = routeWire(b.c, { part: l, port: "out" }, { part: p, port: "in" })!;
    expect(r.path.some((k) => k === cellKey(3, 2) || k === cellKey(4, 2))).toBe(false);
    expect(connectLogic(b.c, { part: l, port: "out" }, { part: p, port: "in" })).toBeNull();
    expect(settle(b.c).state(p).on).toBe(true);
  });

  it("bridges over a wire it has to cross, keeping both signals", () => {
    const b = new CircuitBuilder("t");
    // A long vertical wall of wire with no way around inside the search area.
    const top = b.add("lever", 5, -6, { on: false }, 1);
    const bottom = b.add("pixel", 5, 10, {}, 1);
    stroke(b.c, "w", 5, -5, 5, 9);
    const l = b.add("lever", 0, 2, { on: true });
    const p = b.add("pixel", 10, 2);
    // Block the ends so the only way is across.
    for (let y = -12; y <= 16; y++) if (y < -6 || y > 10) b.add("label", 4, y, { text: "" });
    expect(connectLogic(b.c, { part: l, port: "out" }, { part: p, port: "in" })).toBeNull();
    expect(Object.values(b.c.cells).filter((v) => kindOf(v) === "b").length).toBe(1);
    const sim = settle(b.c);
    expect(sim.state(p).on).toBe(true);
    expect(sim.state(bottom).on).toBe(false);
    void top;
  });

  it("feeds both inputs of a gate from different sources", () => {
    const b = new CircuitBuilder("t");
    const x = b.add("lever", 0, 0, { on: true });
    const y = b.add("lever", 0, 4, { on: false });
    const g = b.add("and", 4, 1);
    const p = b.add("pixel", 9, 1);
    for (const [s, port] of [
      [x, "a"],
      [y, "b"],
    ] as const)
      expect(connectLogic(b.c, { part: s, port: "out" }, { part: g, port })).toBeNull();
    expect(connectLogic(b.c, { part: g, port: "out" }, { part: p, port: "in" })).toBeNull();
    let sim = settle(b.c);
    expect([sim.port(g, "a"), sim.port(g, "b"), sim.state(p).on]).toEqual([true, false, false]);
    sim.tap(y);
    sim.run(0.5);
    expect(sim.state(p).on).toBe(true);
  });
});

describe("ribbon bus example", () => {
  it("carries all four levers and reads bit 2 back out", async () => {
    const { EXAMPLES } = await import("./examples");
    const c = EXAMPLES.find((e) => e.id === "ribbon")!.build();
    const sim = new Sim(c);
    sim.run(0.5);
    const show = c.parts.find((p) => p.type === "pixel4")!.id;
    const lamp = c.parts.find((p) => p.type === "pixel")!.id;
    expect(sim.state(show).on).toEqual([true, false, true, false]);
    expect(sim.state(lamp).on).toBe(true);
    const levers = c.parts.filter((p) => p.type === "lever");
    sim.tap(levers[2].id);
    sim.tap(levers[3].id);
    sim.run(0.5);
    expect(sim.state(show).on).toEqual([true, false, false, true]);
    expect(sim.state(lamp).on).toBe(false);
  });
});
