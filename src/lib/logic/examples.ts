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
  b.add("label", 0, -8, { text: "HUB: sparks sort the train's cargo by turning right" });
  b.add("label", 0, -7, { text: "into filtered branches." });
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

    // --- workshop loop, walked anticlockwise so both storages are on the sparks' right: they
    // pick up at the hub storage's exit (straight ahead at the top, as they swing round), go down
    // the far side, and come up past the workshop storage's entrance. ---
    b.path("s", [bx, 7], [bx, 13], [bx - 1, 13], [bx - 1, 7], [bx, 7]);
    b.sparks(bx - 1, 10, 2, 10, 1);
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
    // Products: heading down past the machine's exit (on their right) they pick up; heading back
    // up past the Compressor's entrances (now on their right) they drop off.
    b.add("compressor", bx + 8, 11);
    b.path("s", [bx + 7, 11], [bx + 7, 13]);
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
  b.add("label", 0, 12, { text: "It flickers until the first tap: a latch made from gates" });
  b.add("label", 0, 13, { text: "powers up undecided." });
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
  // A loop walked clockwise, so everything sparks deal with sits on their right: inside the loop.
  b.path("s", [1, 2], [9, 2], [9, 8], [1, 8], [1, 2]);
  b.sparks(2, 2, 3, 1, 0);
  // Up the left side they pass the Stone storage's entrance, then the train's exit.
  b.add("source", 2, 3, { items: ["wooden-log", "stone"], rate: 1 }, 2); // exit faces (1, 3)
  b.add("storage", 2, 5, { label: "Stone", capacity: 30 }); // entrance faces (1, 6)
  // Heading west along the bottom, the first right turn is the branch up the middle. Only logs
  // may take it; they're dropped at the Logs storage and leave at the top through a One Way.
  b.path("s", [5, 8], [5, 2]);
  b.add("item-filter", 5, 7, { item: "wooden-log" });
  const block = b.add("blocker", 5, 6, {}, 3);
  b.add("storage", 6, 4, { label: "Logs", capacity: 30 }); // entrance faces (5, 5)
  b.add("one-way", 5, 3, {}, 3);
  const lever = b.add("lever", 8, 6, {}, 2);
  b.wire(lever, "out", block, "en");
  const pad = b.add("pressure-sensor", 7, 8);
  const lamp = b.add("pixel", 7, 10);
  b.wire(pad, "sig", lamp, "in");
  b.add("label", 10, 6, { text: "Lever: block the branch" });
  b.add("label", 8, 10, { text: "Pressure Sensor lamp" });
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

/**
 * Adds two 2-bit numbers, A (A1 A0) and B (B1 B0), into a 3-bit sum. Bit 0 is a half adder (XOR
 * for the sum, AND for the carry); bit 1 is a full adder that also takes bit 0's carry. The same
 * full adder, copied once per bit, adds numbers of any width.
 */
function adder(): Circuit {
  const b = new CircuitBuilder("Binary adder");
  b.add("label", 0, -3, { text: "Flip the levers: A + B, in binary (1s, 2s, 4s)" });
  const a0 = b.add("lever", 0, 0);
  const b0 = b.add("lever", 0, 3);
  const a1 = b.add("lever", 0, 8);
  const b1 = b.add("lever", 0, 11);
  b.add("label", -3, 0, { text: "A 1s" });
  b.add("label", -3, 3, { text: "B 1s" });
  b.add("label", -3, 8, { text: "A 2s" });
  b.add("label", -3, 11, { text: "B 2s" });

  // Bit 0: half adder.
  const x0 = b.add("xor", 5, 0);
  const c0 = b.add("and", 5, 4);
  b.wire(a0, "out", x0, "a").wire(b0, "out", x0, "b").wire(a0, "out", c0, "a").wire(b0, "out", c0, "b");

  // Bit 1: full adder. X1 = A1 xor B1; sum = X1 xor carry-in; carry-out = (A1 and B1) or (X1 and carry-in).
  const x1 = b.add("xor", 5, 8);
  const c1 = b.add("and", 5, 12);
  b.wire(a1, "out", x1, "a").wire(b1, "out", x1, "b").wire(a1, "out", c1, "a").wire(b1, "out", c1, "b");
  const s1 = b.add("xor", 12, 6);
  const c2 = b.add("and", 12, 10);
  const carry = b.add("or", 18, 14);
  const l0 = b.add("pixel", 22, 1);
  const l1 = b.add("pixel", 22, 7);
  const l2 = b.add("pixel", 23, 15);
  // Outputs first, so the inputs' wires are routed around them rather than across them.
  b.wire(c2, "out", carry, "a").wire(c1, "out", carry, "b");
  b.wire(x0, "out", l0, "in").wire(s1, "out", l1, "in").wire(carry, "out", l2, "in");
  b.wire(x1, "out", s1, "a").wire(c0, "out", s1, "b").wire(x1, "out", c2, "a").wire(c0, "out", c2, "b");
  b.add("label", 23, 1, { text: "Sum 1s" });
  b.add("label", 23, 7, { text: "Sum 2s" });
  b.add("label", 24, 15, { text: "Sum 4s (carry)" });
  b.add("label", 7, 3, { text: "half adder" });
  b.add("label", 14, 4, { text: "full adder" });
  return b.c;
}

/**
 * Seven switches, valued 1 to 7, encoded as a 3-bit number on a ribbon (bits 0–2). The ribbon is
 * the bus: each switch has a row of its own, with a Ribbon Writer for each bit in its value.
 * Writers on the same bit combine (either one turns it on), and the switch's own wire never
 * touches the ribbon, so switches stay apart. At the far end, a cell recognises code 5 (bits 0 and 2 on, bit 1
 * off) and latches it until reset.
 */
function encoder(): Circuit {
  const b = new CircuitBuilder("Switch encoder");
  b.add("label", 0, -4, { text: "Each switch sends its number in binary." });
  b.add("label", 0, -3, { text: "Turn on 1 and 4 together: the cell for 5 fires too." });
  b.add("label", 9, -1, { text: "one Ribbon Writer per bit" });
  for (let k = 1; k <= 7; k++) {
    const y = (k - 1) * 3;
    const lever = b.add("lever", 0, y);
    b.add("label", -3, y, { text: String(k) });
    [0, 1, 2]
      .filter((i) => k & (1 << i))
      .forEach((bit, j) => {
        const feed = b.add("ribbon-writer", 10, y + j, { bit: String(bit) });
        b.wire(lever, "out", feed, "in");
      });
  }
  // The ribbon: down past every feed, then along to the far end.
  draw(b, "r", [12, 0], [12, 22], [34, 22]);
  b.add("pixel4", 35, 22);
  b.add("label", 36, 22, { text: "bits 0–3" });

  // Read the three bits back off the ribbon.
  draw(b, "r", [20, 22], [20, 23]);
  const r0 = b.add("ribbon-reader", 20, 24, { bit: "0" }, 1);
  draw(b, "r", [24, 22], [24, 23]);
  const r1 = b.add("ribbon-reader", 24, 24, { bit: "1" }, 1);
  draw(b, "r", [28, 22], [28, 23]);
  const r2 = b.add("ribbon-reader", 28, 24, { bit: "2" }, 1);

  // The cell for item 5: bit 0 AND bit 2 AND NOT bit 1, held by a latch.
  const both = b.add("and", 21, 30);
  const not1 = b.add("not", 25, 29);
  const five = b.add("and", 27, 33);
  const latch = b.add("sr-latch", 32, 33);
  const now = b.add("pixel", 32, 37);
  const held = b.add("pixel", 37, 33);
  const done = b.add("button", 28, 38);
  b.wire(five, "out", latch, "s").wire(five, "out", now, "in").wire(latch, "q", held, "in").wire(done, "out", latch, "r");
  b.wire(r0, "out", both, "a").wire(r2, "out", both, "b").wire(r1, "out", not1, "in");
  b.wire(both, "out", five, "a").wire(not1, "out", five, "b");
  b.add("label", 33, 37, { text: "code 5 on the ribbon" });
  b.add("label", 38, 33, { text: "item 5 requested (latched)" });
  b.add("label", 30, 38, { text: "fulfilled: reset" });
  return b.c;
}

/**
 * Taps bits 0–2 (and optionally 3) off a horizontal ribbon at row `y` with Ribbon Readers at x,
 * x+2, x+4 (x+6), hanging down. Returns the output ports to read each bit from.
 */
function tapBits(b: CircuitBuilder, x: number, y: number, bits: number): { part: string; port: string }[] {
  const out: { part: string; port: string }[] = [];
  for (let i = 0; i < bits; i++) {
    const tx = x + i * 2;
    draw(b, "r", [tx, y], [tx, y + 1]);
    out.push({ part: b.add("ribbon-reader", tx, y + 2, { bit: String(i) }, 1), port: "out" });
  }
  return out;
}

/**
 * Recognises slot number `k` (bits 0–2) from tapped bits, AND-ed with one more signal. Places its
 * gates in the column band starting at x, below row y. Returns the final AND gate.
 */
function slotMatch(b: CircuitBuilder, x: number, y: number, k: number, bits: { part: string; port: string }[], extra: { part: string; port: string }) {
  // Each bit as it should read for k: the bit itself, or through a NOT gate when k has a 0 there.
  const lit = bits.slice(0, 3).map((bt, i) => {
    if (k & (1 << i)) return bt;
    const n = b.add("not", x + i * 2, y + 6, {}, 1);
    b.wire(bt.part, bt.port, n, "in");
    return { part: n, port: "out" };
  });
  const a1 = b.add("and", x, y + 10);
  const a2 = b.add("and", x + 3, y + 13);
  const a3 = b.add("and", x + 6, y + 16);
  b.wire(a1, "out", a2, "a").wire(a2, "out", a3, "a");
  b.wire(lit[0].part, lit[0].port, a1, "a").wire(lit[1].part, lit[1].port, a1, "b");
  b.wire(lit[2].part, lit[2].port, a2, "b");
  b.wire(extra.part, extra.port, a3, "b");
  return a3;
}

/**
 * Persistent requests over one ribbon, without codes colliding: the hub's counter steps through
 * slots 1–7 on bits 0–2 while the train is in, and a requester whose request is on answers on
 * bit 3 during its own slot. The hub's cell for that item sees its slot number and the answer
 * together and sets a latch: the queued request, held until it's fulfilled. Seven items per ribbon,
 * any number of them requested at once, all queued within one sweep.
 */
function scanner(): Circuit {
  const b = new CircuitBuilder("Request scanner");
  const Y = 14; // the ribbon's row
  b.add("label", 0, -4, { text: "Turn on \"train in\", then any requests (bottom right)." });
  b.add("label", 0, -3, { text: "The hub queues each one when its slot comes round." });

  // --- Slot counter: three Counter Gates set to 2, with the turn-off signal counting. Each one
  // flips its output on every pulse it gets, so each runs at half the speed of the one before:
  // together they step through all eight 3-bit numbers (counting down, which is fine for taking
  // turns), one step per clock pulse. ---
  const timer = b.add("timer", 0, 0, { on: 0.5, off: 0.5 });
  const station = b.add("lever", 0, 4);
  b.add("label", -5, 4, { text: "train in" });
  const clock = b.add("and", 3, 0);
  b.wire(timer, "out", clock, "a").wire(station, "out", clock, "b");
  const cg = [b.add("counter-gate", 7, 1, { count: 2, edgeCounts: true }), b.add("counter-gate", 7, 6, { count: 2, edgeCounts: true }), b.add("counter-gate", 7, 11, { count: 2, edgeCounts: true })];
  // Each bit goes onto the ribbon only while the train is in: otherwise the ribbon reads slot 0,
  // which is nobody's, so no one answers and nothing is queued.
  const gate = [b.add("and", 15, 0), b.add("and", 15, 5), b.add("and", 15, 10)];
  const feeds = [0, 1, 2].map((bit) => b.add("ribbon-writer", 19, 1 + bit * 5, { bit: String(bit) }));
  // The ribbon goes down first, so wires are routed around it.
  draw(b, "r", [21, 1], [21, Y], [104, Y]);
  b.wire(clock, "out", cg[0], "in").wire(cg[0], "out", cg[1], "in").wire(cg[1], "out", cg[2], "in");
  cg.forEach((g, i) => b.wire(g, "out", gate[i], "a").wire(gate[i], "out", feeds[i], "in"));
  gate.forEach((g) => b.wire(station, "out", g, "b"));
  b.add("label", 7, -1, { text: "slot counter" });
  b.add("pixel4", 105, Y);
  b.add("label", 106, Y, { text: "slot (bits 0–2), answer (bit 3)" });

  const items = [
    { k: 2, name: "Logs" },
    { k: 5, name: "Stone" },
    { k: 7, name: "Limestone" },
  ];
  // --- Hub cells: slot k AND an answer on bit 3, held for 0.4 s (the Filter Gate), sets the
  // item's latch. The wait matters: while the counter's bits ripple from one number to the next,
  // gates can see a wrong number for a tick, and an answer trails a few ticks into the next slot.
  // Both are far shorter than 0.4 s; a real answer lasts most of its 1 s slot. ---
  b.add("label", 24, Y + 30, { text: "HUB: one cell per item" });
  items.forEach(({ k, name }, n) => {
    const x = 24 + n * 13;
    const bits = tapBits(b, x, Y, 4);
    const hit = slotMatch(b, x, Y, k, bits, bits[3]);
    const settle = b.add("filter", x + 6, Y + 21, { time: 0.4 }, 1);
    const latch = b.add("sr-latch", x + 5, Y + 25);
    const lamp = b.add("pixel", x + 9, Y + 25);
    const done = b.add("button", x + 1, Y + 26);
    b.wire(hit, "out", settle, "in").wire(settle, "out", latch, "s").wire(latch, "q", lamp, "in").wire(done, "out", latch, "r");
    b.add("label", x + 10, Y + 25, { text: `${name} (${k}) queued` });
    b.add("label", x - 2, Y + 26, { text: "done" });
  });
  // --- Requesters: in their own slot, a request that's on answers on bit 3. ---
  b.add("label", 66, Y + 30, { text: "REQUESTERS: one per workshop" });
  items.forEach(({ k, name }, n) => {
    const x = 66 + n * 13;
    const bits = tapBits(b, x, Y, 3);
    const want = b.add("lever", x + 1, Y + 24);
    b.add("label", x - 3, Y + 24, { text: `${name} (${k})` });
    const hit = slotMatch(b, x, Y, k, bits, { part: want, port: "out" });
    draw(b, "r", [x + 6, Y], [x + 6, Y + 1]);
    const answer = b.add("ribbon-writer", x + 6, Y + 2, { bit: "3" }, 3);
    b.wire(hit, "out", answer, "in");
  });
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
  { id: "adder", name: "Binary adder", blurb: "Add two 2-bit numbers with XOR, AND and OR gates: a half adder and a full adder.", build: adder },
  { id: "encoder", name: "Switch encoder", blurb: "Switches valued 1–7 sent as a binary number on a ribbon, and a cell that recognises its code.", build: encoder },
  { id: "scanner", name: "Request scanner", blurb: "Persistent requests on one ribbon: a slot counter polls each item in turn and the hub latches what's asked for.", build: scanner },
  { id: "filter", name: "Filter split", blurb: "Sparks on a loop: an Item Filter, a One Way, a Blocker and a Pressure Sensor. Buildings sit on the sparks' right.", build: filterSplit },
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
