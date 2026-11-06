// Example circuits that ship with the sandbox. Built in code so they always match the registry.
import { connectLogic, connectPath, emptyCircuit, makePart, onPath, planWire, newId } from "./circuit";
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
  /**
   * Connects two ports: logic by laying wire tiles, items by laying path tiles (to a building's
   * entrance or exit, or to a part on a path), sensors by a link.
   */
  wire(a: string, ap: string, b: string, bp: string): this {
    const typeOf = (id: string) => this.c.parts.find((p) => p.id === id)?.type ?? "";
    const kind = (id: string, port: string) => PARTS.get(typeOf(id))?.ports.find((p) => p.id === port)?.kind;
    const pathEnd = (id: string, port: string) => kind(id, port) === "item" || (onPath(typeOf(id)) && kind(id, port) !== "logic");
    if (pathEnd(a, ap) && pathEnd(b, bp)) {
      const err = connectPath(this.c, { part: a, port: ap }, { part: b, port: bp });
      if (err) throw new Error(`${typeOf(a)}.${ap} → ${typeOf(b)}.${bp}: ${err}`);
      return this;
    }
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
  /** Paints path tiles along a polyline (consecutive points joined). "s" Stone, "d" Dirt. */
  path(kind: "s" | "d", ...pts: [number, number][]): this {
    const tiles: [number, number][] = [];
    for (let i = 1; i < pts.length; i++) tiles.push(...cellLine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]).slice(i > 1 ? 1 : 0));
    paint(this.c.paths, kind, tiles);
    return this;
  }
  /** Puts `count` sparks on the path tile at (x, y), facing `rot` (0 right, 1 down, 2 left, 3 up). */
  sparks(x: number, y: number, count: number, carry = 1, rot: Rot = 0): string {
    return this.add("sparks", x, y, { count, carry }, rot);
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
 * The distribution center. Sparks always take the right turn when they can, then straight on,
 * then left, then back, so the layout does the sorting:
 *
 * - Hub: a loop runs east along the main row from the train. Each item has a branch on the right
 *   (south) guarded by an Item Filter, so only sparks carrying that item turn in. They drop it in
 *   the hub storage and the branch brings them back onto the main row further east; a One Way at
 *   the branch's exit stops eastbound sparks turning into it. Anything left (pebbles, or items
 *   whose storage is full) is dropped in a Compressor on the way back to the train.
 * - Workshops: each hub storage's exit feeds a small loop to its workshop. A Spark Gate holds the
 *   sparks until the workshop asks for more over wireless: its ≤ 25 % sensor sets a latch and
 *   its ≥ 90 % sensor resets it, so it refills in batches.
 */
function distribution(): Circuit {
  const b = new CircuitBuilder("Distribution center");
  b.c.settings.walkSpeed = 3;
  const lines = [
    { item: "wooden-log", name: "Logs", recipe: "sawn-timber", station: "Sawbench" },
    { item: "stone", name: "Stone", recipe: "stone-plate", station: "Stonecutter" },
    { item: "limestone", name: "Limestone", recipe: "quartz", station: "Furnace" },
  ];
  const SPACING = 14;
  const first = 4;
  const end = first + SPACING * (lines.length - 1) + 4;

  // --- hub loop ---
  b.add("label", 0, -7, { text: "HUB: sparks sort the train's cargo by turning right into filtered branches" });
  const train = b.add("source", -1, 0, { items: ["wooden-log", "stone", "limestone", "pebble"], rate: 2, stack: 20 });
  const unload = b.add("lever", -1, -3, { on: true }, 1);
  b.add("label", -4, -4, { text: "Train unloading" });
  b.wire(unload, "out", train, "en");
  // Main row east, up at the far end, back west along the top, and down to the train.
  b.path("s", [0, 0], [end, 0], [end, -2], [0, -2], [0, 0]);
  b.sparks(1, 0, 12, 0, 0);
  // Anything still carried on the way back goes to the Recycler.
  b.add("compressor", 20, -5, {}, 3);
  b.add("label", 23, -4, { text: "Overflow → Compressor" });

  lines.forEach((line, i) => {
    const bx = first + i * SPACING;
    // Branch: filter, down to the drop-off, across, and back up through a One Way.
    b.path("s", [bx, 0], [bx, 4], [bx + 1, 4], [bx + 1, 0]);
    b.add("item-filter", bx, 1, { item: line.item });
    b.add("one-way", bx + 1, 1, {}, 3);
    // Hub storage turned so its entrance faces up (the branch) and its exit down (the workshop).
    const hub = b.add("storage", bx, 5, { label: `Hub ${line.name}`, capacity: 200, stock: [[line.item, 60]] }, 1);
    const hubLow = b.add("capacity-sensor", bx + 3, 5, { mode: "percent", cmp: "le", value: 10 });
    b.wire(hubLow, "eye", hub, "sense");
    const lamp = b.add("pixel", bx + 5, 5);
    b.wire(hubLow, "out", lamp, "in");
    b.add("label", bx + 6, 5, { text: `Hub ${line.name.toLowerCase()} low` });

    // --- workshop loop: down from the hub storage's exit, past the workshop, back up. ---
    b.path("s", [bx, 7], [bx, 13], [bx - 1, 13], [bx - 1, 7], [bx, 7]);
    b.sparks(bx - 1, 10, 2, 10, 3);
    const gate = b.add("spark-gate", bx, 9, {}, 3);
    const rx = b.add("wireless-receiver", bx - 2, 9, { channel: line.item });
    b.wire(rx, "out", gate, "en");
    const dest = b.add("storage", bx + 1, 11, { label: `${line.station} ${line.name.toLowerCase()}`, capacity: 40, stock: [[line.item, 16]] });

    // Refill band: Set when ≤ 25 %, Reset when ≥ 90 %. The latch holds the request in between.
    const low = b.add("capacity-sensor", bx + 1, 10, { mode: "percent", cmp: "le", value: 25 }, 3);
    const high = b.add("capacity-sensor", bx + 2, 10, { mode: "percent", cmp: "ge", value: 90 }, 3);
    b.wire(low, "eye", dest, "sense");
    b.wire(high, "eye", dest, "sense");
    const latch = b.add("sr-latch", bx + 4, 8);
    const tx = b.add("wireless-sender", bx + 7, 8, { channel: line.item });
    b.wire(latch, "q", tx, "in");
    b.wire(low, "out", latch, "s");
    b.wire(high, "out", latch, "r");
    b.add("label", bx + 8, 8, { text: `requests ${line.name.toLowerCase()}` });

    // Workshop: a spark carries from the storage's exit to the machine, another carries the
    // products to a Compressor (stand-in for wherever they're used next).
    const machine = b.add("machine", bx + 5, 11, { label: line.station, recipe: line.recipe, speed: 3 });
    b.path("s", [bx + 3, 12], [bx + 4, 12]);
    b.sparks(bx + 3, 12, 1, 0, 0);
    b.add("compressor", bx + 8, 11);
    b.path("s", [bx + 7, 12], [bx + 7, 13]);
    b.sparks(bx + 7, 13, 1, 0, 3);
    void machine;
  });
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

/**
 * Sparks circle a loop clockwise. At the junction they'd turn right into the logs branch, but the
 * Item Filter only lets sparks carrying logs in, so stone goes on round to the stone storage. A
 * One Way at the bottom of the branch stops sparks coming back along the bottom from turning up
 * into it. A lever closes a Blocker on the branch, and a Pressure Sensor lights a lamp as sparks
 * walk over it.
 */
function filterSplit(): Circuit {
  const b = new CircuitBuilder("Filter split");
  const src = b.add("source", 0, 2, { items: ["wooden-log", "stone"], rate: 1 });
  void src;
  b.path("s", [1, 2], [9, 2], [9, 8], [1, 8], [1, 2]);
  b.path("s", [5, 2], [5, 8]);
  b.sparks(2, 2, 3, 1, 0);
  b.add("item-filter", 5, 3, { item: "wooden-log" });
  b.add("one-way", 5, 7, {}, 1);
  const block = b.add("blocker", 5, 4, {}, 3);
  const lever = b.add("lever", 2, 4);
  b.wire(lever, "out", block, "en");
  b.add("storage", 6, 4, { label: "Logs", capacity: 30 });
  b.add("storage", 10, 5, { label: "Stone", capacity: 30 });
  const pad = b.add("pressure-sensor", 3, 2);
  const lamp = b.add("pixel", 3, 0, {}, 3);
  b.wire(pad, "sig", lamp, "in");
  b.add("label", -1, 5, { text: "Lever: block the branch" });
  b.add("label", 4, 0, { text: "Pressure Sensor lamp" });
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
  { id: "filter", name: "Filter split", blurb: "Sparks on a loop: an Item Filter, a One Way, a Blocker and a Pressure Sensor.", build: filterSplit },
];

/**
 * A saved copy of an example from before items moved on path tiles (it still has item links).
 * Converting the links keeps it running but not well, so it's rebuilt from the current example,
 * keeping its name. Returns null for anything else.
 */
export function legacyExample(raw: any): Circuit | null {
  if (!raw || typeof raw !== "object" || raw.paths || !Array.isArray(raw.wires) || !Array.isArray(raw.parts)) return null;
  const types = new Map<string, string>(raw.parts.map((p: any) => [p?.id, p?.type]));
  const itemLink = raw.wires.some((w: any) => PARTS.get(types.get(w?.from?.part) ?? "")?.ports.find((p) => p.id === w?.from?.port)?.kind === "item");
  if (!itemLink) return null;
  const name = typeof raw.name === "string" ? raw.name : "";
  const ex = EXAMPLES.find((e) => e.name === name.replace(/ \(\d+\)$/, ""));
  if (!ex) return null;
  const c = ex.build();
  c.name = name;
  return c;
}
