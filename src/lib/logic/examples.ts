// Example circuits that ship with the sandbox. Built in code so they always match the registry.
import { connectLogic, emptyCircuit, makePart, planWire, newId } from "./circuit";
import { cellLine, paint } from "./grid";
import { PARTS } from "./parts";
import type { Circuit, Config, Rot } from "./types";

/** Small helper for building circuits in code (examples and tests). */
export class CircuitBuilder {
  readonly c: Circuit;
  constructor(name: string) {
    this.c = emptyCircuit(name);
  }
  add(type: string, x: number, y: number, cfg: Config = {}, rot: Rot = 0): string {
    const p = makePart(type, x, y, rot, cfg);
    this.c.parts.push(p);
    return p.id;
  }
  /** Connects two ports: logic by laying wire tiles on the grid, items and sensors by a link. */
  wire(a: string, ap: string, b: string, bp: string): this {
    const kind = (id: string, port: string) => PARTS.get(this.c.parts.find((p) => p.id === id)?.type ?? "")?.ports.find((p) => p.id === port)?.kind;
    if (kind(a, ap) === "logic") {
      const err = connectLogic(this.c, { part: a, port: ap }, { part: b, port: bp });
      if (err && err !== "Already connected.") throw new Error(`${this.c.parts.find((p) => p.id === a)?.type}.${ap} → ${this.c.parts.find((p) => p.id === b)?.type}.${bp}: ${err}`);
      return this;
    }
    const plan = planWire(this.c, { part: a, port: ap }, { part: b, port: bp });
    if ("error" in plan) throw new Error(`${a}.${ap} → ${b}.${bp}: ${plan.error}`);
    this.c.wires.push({ id: newId("w"), ...plan.wire });
    return this;
  }
}

/** Paints tiles along a polyline of grid points. */
function draw(b: CircuitBuilder, kind: "w" | "r", ...pts: [number, number][]) {
  const path: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) path.push(...cellLine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]).slice(i > 1 ? 1 : 0));
  paint(b.c.cells, kind, path);
}

export interface Example {
  id: string;
  name: string;
  blurb: string;
  build(): Circuit;
}

/**
 * The distribution center: a train unloads mixed items at a hub, item filters sort them into
 * per-item storage, and each destination workshop asks for more over wireless when it runs low.
 * Low/high capacity sensors and a Set-Reset Latch give each workshop a refill band, so the hub
 * sends a batch instead of trickling one item at a time.
 */
function distribution(): Circuit {
  const b = new CircuitBuilder("Distribution center");
  const lines = [
    { item: "wooden-log", name: "Logs", recipe: "sawn-timber", station: "Sawbench" },
    { item: "stone", name: "Stone", recipe: "stone-plate", station: "Stonecutter" },
    { item: "limestone", name: "Limestone", recipe: "quartz", station: "Furnace" },
  ];
  b.add("label", 0, -3, { text: "HUB: the train unloads here" });
  b.add("label", 16, -3, { text: "WORKSHOPS (far away)" });
  const train = b.add("source", 0, 4, { items: ["wooden-log", "stone", "limestone", "pebble"], rate: 2, stack: 1 });
  const unload = b.add("lever", 0, 1, { on: true });
  b.add("label", -1, 0, { text: "Train unloading" });
  b.wire(unload, "out", train, "en");

  let feed = { part: train, port: "out" };
  lines.forEach((line, i) => {
    const y = i * 8;
    const filter = b.add("item-filter", 3, y + 4, { item: line.item });
    b.wire(feed.part, feed.port, filter, "in");
    feed = { part: filter, port: "reject" };

    // Hub storage for this item, with a "running out" lamp so you know to call the train.
    const hub = b.add("storage", 6, y + 3, { label: `Hub ${line.name}`, capacity: 200, stock: [[line.item, 60]], rate: 2 });
    b.wire(filter, "pass", hub, "in");
    const hubLow = b.add("capacity-sensor", 6, y + 1, { mode: "percent", cmp: "le", value: 10 }, 3);
    b.wire(hubLow, "eye", hub, "sense");
    const lamp = b.add("pixel", 8, y + 1);
    b.wire(hubLow, "out", lamp, "in");
    b.add("label", 9, y + 1, { text: `Hub ${line.name.toLowerCase()} low` });

    // Extraction: runs only while the destination's request arrives over wireless.
    const rx = b.add("wireless-receiver", 9, y + 2, { channel: line.item }, 1);
    const ex = b.add("extractor", 10, y + 4, { rate: 2 });
    b.wire(hub, "out", ex, "in");
    b.wire(rx, "out", ex, "en");

    // Destination workshop: its own small storage feeding the machine.
    const dest = b.add("storage", 22, y + 3, { label: `${line.station} ${line.name.toLowerCase()}`, capacity: 40, stock: [[line.item, 16]], rate: 2 });
    b.wire(ex, "out", dest, "in");
    const machine = b.add("machine", 26, y + 3, { label: line.station, recipe: line.recipe, speed: 3 });
    b.wire(dest, "out", machine, "in");

    // Refill band: Set when ≤ 25 %, Reset when ≥ 90 %. The latch holds the request in between.
    // Sensors face down (eyes on the storage), outputs up into the latch's inputs.
    const low = b.add("capacity-sensor", 16, y + 1, { mode: "percent", cmp: "le", value: 25 }, 3);
    const high = b.add("capacity-sensor", 17, y + 1, { mode: "percent", cmp: "ge", value: 90 }, 3);
    b.wire(low, "eye", dest, "sense");
    b.wire(high, "eye", dest, "sense");
    const latch = b.add("sr-latch", 19, y - 1);
    const tx = b.add("wireless-sender", 22, y - 1, { channel: line.item });
    b.wire(latch, "q", tx, "in");
    b.wire(low, "out", latch, "s");
    b.wire(high, "out", latch, "r");
    b.add("label", 23, y - 1, { text: `requests ${line.name.toLowerCase()}` });
  });
  // Anything that matched no filter.
  const overflow = b.add("storage", 6, 3 * 8 + 3, { label: "Overflow", capacity: 200, rate: 0 });
  b.wire(feed.part, feed.port, overflow, "in");
  return b.c;
}

function latchDemo(): Circuit {
  const b = new CircuitBuilder("Latch (SR memory)");
  b.add("label", 0, -2, { text: "Tap Set / Reset while running" });
  const set = b.add("button", 0, 0);
  const reset = b.add("button", 0, 2);
  b.add("label", -3, 0, { text: "Set" });
  b.add("label", -3, 2, { text: "Reset" });
  const latch = b.add("sr-latch", 3, 0);
  const q = b.add("pixel", 7, 0);
  const nq = b.add("pixel", 7, 1);
  b.wire(set, "out", latch, "s").wire(reset, "out", latch, "r").wire(latch, "q", q, "in").wire(latch, "nq", nq, "in");

  // The same memory from two NOT gates and two OR gates (cross-coupled NOR latch).
  b.add("label", 0, 5, { text: "Same memory from gates (NOR latch)." });
  b.add("label", 0, 12, { text: "It flickers until the first tap: a latch from gates powers up undecided." });
  const or1 = b.add("or", 3, 6);
  const or2 = b.add("or", 3, 9);
  const not1 = b.add("not", 7, 6);
  const not2 = b.add("not", 7, 9);
  const lamp = b.add("pixel", 12, 6);
  b.wire(set, "out", or1, "a");
  b.wire(reset, "out", or2, "b");
  b.wire(or1, "out", not1, "in").wire(or2, "out", not2, "in");
  b.wire(not1, "out", or2, "a").wire(not2, "out", or1, "b");
  b.wire(not2, "out", lamp, "in");
  return b.c;
}

function timerDemo(): Circuit {
  const b = new CircuitBuilder("Timer pulses");
  const t = b.add("timer", 0, 2, { on: 0.5, off: 1.5 });
  b.add("label", 0, 0, { text: "Timer: 0.5 s on, 1.5 s off" });
  const direct = b.add("pixel", 7, 0);
  const buf = b.add("buffer", 3, 2, { hold: 1 });
  const bufLamp = b.add("pixel", 7, 2);
  const filt = b.add("filter", 3, 4, { time: 1 });
  const filtLamp = b.add("pixel", 7, 4);
  const count = b.add("counter-gate", 3, 6, { count: 3 });
  const countLamp = b.add("pixel", 7, 6);
  b.wire(t, "out", direct, "in");
  b.wire(t, "out", buf, "in").wire(buf, "out", bufLamp, "in");
  b.wire(t, "out", filt, "in").wire(filt, "out", filtLamp, "in");
  b.wire(t, "out", count, "in").wire(count, "out", countLamp, "in");
  b.add("label", 8, 0, { text: "Raw pulse" });
  b.add("label", 8, 2, { text: "Buffer: held 1 s longer" });
  b.add("label", 8, 4, { text: "Filter 1 s: never (pulses too short)" });
  b.add("label", 8, 6, { text: "Counter: on after 3 pulses" });
  return b.c;
}

function filterSplit(): Circuit {
  const b = new CircuitBuilder("Filter split");
  const src = b.add("source", 0, 2, { items: ["wooden-log", "stone"], rate: 1 });
  const pad = b.add("pressure-sensor", 3, 2);
  const lamp = b.add("pixel", 3, 4);
  const f = b.add("item-filter", 6, 2, { item: "wooden-log" });
  const block = b.add("blocker", 9, 2);
  const lever = b.add("lever", 9, 0);
  const logs = b.add("storage", 12, 1, { label: "Logs", capacity: 50, rate: 0 });
  const stone = b.add("storage", 9, 6, { label: "Stone", capacity: 50, rate: 0 });
  b.wire(src, "out", pad, "in").wire(pad, "out", f, "in").wire(pad, "sig", lamp, "in");
  b.wire(f, "pass", block, "in").wire(block, "out", logs, "in").wire(f, "reject", stone, "in");
  b.wire(lever, "out", block, "en");
  b.add("label", 11, -1, { text: "Lever on = block logs" });
  return b.c;
}

/** Four signals on one ribbon tile: plain wire on bit 0, Ribbon Writers on bits 1–3. */
function ribbonBus(): Circuit {
  const b = new CircuitBuilder("Ribbon bus");
  b.add("label", 0, -3, { text: "Four levers share one ribbon" });
  // Levers along the top, outputs facing down (rotated a quarter turn).
  for (let i = 0; i < 4; i++) {
    b.add("lever", 1 + i * 3, -1, { on: i % 2 === 0 }, 1);
    b.add("label", i * 3, -2, { text: `bit ${i}` });
  }
  // Bit 0: a plain wire straight onto the ribbon.
  draw(b, "w", [1, 0], [1, 3]);
  // Bits 1–3: lever → Ribbon Writer (turned to face down) → ribbon.
  for (let i = 1; i < 4; i++) {
    const x = 1 + i * 3;
    b.add("ribbon-writer", x, 1, { bit: String(i) }, 1);
    draw(b, "w", [x, 0], [x, 0]);
    draw(b, "r", [x, 2], [x, 4]);
  }
  // The ribbon itself, along row 4, joined to each feed.
  draw(b, "r", [1, 4], [12, 4], [14, 4]);
  for (let i = 0; i < 4; i++) draw(b, "r", [1 + i * 3, 3], [1 + i * 3, 4]);
  draw(b, "w", [1, 0], [1, 3]);
  // Read everything at the far end, and pick out bit 2 with a reader.
  b.add("pixel4", 15, 4);
  b.add("label", 16, 4, { text: "Four Pixel Display" });
  draw(b, "r", [14, 4], [14, 7]);
  b.add("ribbon-reader", 14, 8, { bit: "2" }, 1);
  b.add("pixel", 14, 11, {}, 1);
  draw(b, "w", [14, 9], [14, 10]);
  b.add("label", 15, 9, { text: "Reader: bit 2" });
  return b.c;
}

export const EXAMPLES: Example[] = [
  {
    id: "distribution",
    name: "Distribution center",
    blurb: "Sort a train's cargo into storage; ship to workshops when they run low (wireless).",
    build: distribution,
  },
  { id: "latch", name: "Latch (SR memory)", blurb: "Set/Reset buttons, plus the same latch built from gates.", build: latchDemo },
  { id: "timer", name: "Timer pulses", blurb: "A timer feeding buffer, filter and counter gates.", build: timerDemo },
  { id: "ribbon", name: "Ribbon bus", blurb: "Four signals on one ribbon: writers, a reader and a Four Pixel Display.", build: ribbonBus },
  { id: "filter", name: "Filter split", blurb: "Mixed items split by an Item Filter, with a pressure pad and blocker.", build: filterSplit },
];
