// The part registry: every component the sandbox can place, with its ports, settings and
// behaviour. Behaviour follows docs/logic-components.md (wiki facts plus listed assumptions).
import { GAME, type Recipe } from "../engine/data";
import type { Config, FieldDef, PartStatus, PartType, PortDef, StepCtx, StorageView } from "./types";

/** Simulation tick, in seconds. Game settings come in 0.1 s steps, so they land on whole ticks. */
export const TICK = 0.05;
export const ticks = (seconds: number) => Math.max(0, Math.round(seconds / TICK));

/** Items per storage stack, for the storage presets (the wiki doesn't give stack sizes). */
export const STACK = 50;

const logicIn = (id: string, side: PortDef["side"], at: number, label?: string): PortDef => ({ id, kind: "logic", dir: "in", side, at, label });
const logicOut = (id: string, side: PortDef["side"], at: number, label?: string): PortDef => ({ id, kind: "logic", dir: "out", side, at, label });
const itemIn = (id: string, side: PortDef["side"], at: number, label?: string): PortDef => ({ id, kind: "item", dir: "in", side, at, label });
const itemOut = (id: string, side: PortDef["side"], at: number, label?: string): PortDef => ({ id, kind: "item", dir: "out", side, at, label });

/** Wired and unpowered means off. Unwired means on (the wiki's rule for logic-enabled buildings). */
const powered = (ctx: StepCtx<any, any>, port = "en") => !ctx.wired(port) || ctx.in(port);

const seconds = (key: string, label: string, min: number, max: number, help?: string): FieldDef => ({
  key,
  label,
  type: "number",
  min,
  max,
  step: 0.1,
  unit: "s",
  help,
});

const ENABLE_HELP = "Wired: runs only while the signal is on. Unwired: always on.";

export const itemName = (id: string) => GAME.materials.get(id)?.name ?? id;

// --- signal sources ----------------------------------------------------------------------------

const lever: PartType<{ on: boolean }, { on: boolean }> = {
  id: "lever",
  name: "Lever",
  category: "Inputs",
  blurb: "Sends a signal while switched on. Tap it while running.",
  wiki: "Lever",
  w: 1,
  h: 1,
  ports: [logicOut("out", "r", 0.5)],
  fields: [{ key: "on", label: "Starts on", type: "bool" }],
  defaults: () => ({ on: false }),
  init: (cfg) => ({ on: cfg.on }),
  step: (ctx) => ctx.set("out", ctx.state.on),
  tap: (_cfg, s) => void (s.on = !s.on),
  tappable: () => true,
  status: (_c, s) => ({ active: s.on }),
  describe: (_c, s) => [s.on ? "Switched on." : "Switched off."],
};

const button: PartType<{ pulse: number }, { left: number }> = {
  id: "button",
  name: "Push button",
  category: "Inputs",
  blurb: "Sandbox helper (not in the game): tap for a short pulse.",
  w: 1,
  h: 1,
  ports: [logicOut("out", "r", 0.5)],
  fields: [seconds("pulse", "Pulse length", 0.1, 10)],
  defaults: () => ({ pulse: 0.5 }),
  init: () => ({ left: 0 }),
  step: (ctx) => {
    ctx.set("out", ctx.state.left > 0);
    if (ctx.state.left > 0) ctx.state.left--;
  },
  tap: (cfg, s) => void (s.left = ticks(cfg.pulse)),
  tappable: () => true,
  status: (_c, s) => ({ active: s.left > 0 }),
  describe: (c, s) => [s.left > 0 ? `Pulsing (${(s.left * TICK).toFixed(1)} s left).` : `Tap for a ${c.pulse} s pulse.`],
};

const timer: PartType<{ on: number; off: number; startOn: boolean }, { k: number; on: boolean }> = {
  id: "timer",
  name: "Signal Timer",
  category: "Inputs",
  blurb: "Repeatedly sends a signal for some time, then waits.",
  wiki: "Signal Timer",
  w: 1,
  h: 1,
  ports: [logicOut("out", "r", 0.5)],
  fields: [
    seconds("on", "Send for", 0, 10),
    seconds("off", "Wait for", 0, 10),
    { key: "startOn", label: "Starts by sending", type: "bool" },
  ],
  defaults: () => ({ on: 1, off: 1, startOn: true }),
  init: () => ({ k: 0, on: false }),
  step: (ctx) => {
    const on = ticks(ctx.cfg.on);
    const off = ticks(ctx.cfg.off);
    const period = on + off;
    const phase = period ? ctx.state.k % period : 0;
    ctx.state.on = period > 0 && (ctx.cfg.startOn ? phase < on : phase >= off);
    ctx.set("out", ctx.state.on);
    ctx.state.k++;
  },
  status: (_c, s) => ({ active: s.on }),
  describe: (c) => [`On for ${c.on} s, off for ${c.off} s, repeating.`],
};

type CapCfg = { mode: "percent" | "absolute"; cmp: "le" | "ge"; value: number; item: string };
const capacitySensor: PartType<CapCfg, { on: boolean; seen: string }> = {
  id: "capacity-sensor",
  name: "Capacity Sensor",
  category: "Inputs",
  blurb: "Watches a storage: on when its fill is ≤ or ≥ a threshold.",
  wiki: "Capacity Sensor",
  w: 1,
  h: 1,
  ports: [{ id: "eye", kind: "observe", dir: "out", side: "l", at: 0.5, label: "watches" }, logicOut("out", "r", 0.5)],
  fields: [
    {
      key: "mode",
      label: "Mode",
      type: "select",
      options: [
        { value: "percent", label: "Percent (0–100 %)" },
        { value: "absolute", label: "Absolute (0–9999)" },
      ],
    },
    {
      key: "cmp",
      label: "Signal when",
      type: "select",
      options: [
        { value: "le", label: "≤ (at or below)" },
        { value: "ge", label: "≥ (at or above)" },
      ],
    },
    { key: "value", label: "Threshold", type: "number", min: 0, max: 9999, step: 1 },
    {
      key: "item",
      label: "Count only",
      type: "item",
      allowEmpty: true,
      emptyLabel: "All items (game behaviour)",
      help: "Sandbox extra: count a single item in a mixed storage.",
    },
  ],
  defaults: () => ({ mode: "percent", cmp: "le", value: 25, item: "" }),
  init: () => ({ on: false, seen: "" }),
  step: (ctx) => {
    const v = ctx.observe("eye");
    if (!v) {
      ctx.state.on = false;
      ctx.state.seen = "Not watching a storage.";
    } else {
      const n = ctx.cfg.item ? v.count(ctx.cfg.item) : v.total;
      const pct = ctx.cfg.mode === "percent";
      const level = pct ? (v.capacity ? Math.floor((100 * n) / v.capacity) : 0) : n;
      const threshold = pct ? Math.min(100, ctx.cfg.value) : ctx.cfg.value;
      ctx.state.on = ctx.cfg.cmp === "le" ? level <= threshold : level >= threshold;
      ctx.state.seen = `Sees ${pct ? `${level} %` : n} (${n}/${v.capacity}), ${ctx.cfg.cmp === "le" ? "≤" : "≥"} ${threshold}${pct ? " %" : ""}.`;
    }
    ctx.set("out", ctx.state.on);
  },
  status: (_c, s) => ({ active: s.on }),
  describe: (_c, s) => [s.seen || "Waiting for the first tick."],
};

const pressureSensor: PartType<{ hold: number }, { left: number; passed: number }> = {
  id: "pressure-sensor",
  name: "Pressure Sensor",
  category: "Inputs",
  blurb: "Place on a path: signals when a spark steps on it.",
  wiki: "Pressure Sensor",
  w: 1,
  h: 1,
  ports: [logicOut("sig", "b", 0.5)],
  fields: [seconds("hold", "On per spark", 0.1, 5, "How long one spark keeps it on (sandbox assumption).")],
  defaults: () => ({ hold: 0.5 }),
  init: () => ({ left: 0, passed: 0 }),
  path: {
    arrive: (ctx) => {
      ctx.state.left = ticks(ctx.cfg.hold);
      ctx.state.passed++;
    },
  },
  step: (ctx) => {
    ctx.set("sig", ctx.state.left > 0);
    if (ctx.state.left > 0) ctx.state.left--;
  },
  status: (_c, s) => ({ active: s.left > 0, badge: String(s.passed) }),
  describe: (_c, s) => [`${s.passed} spark(s) have stepped on it.`, "Place it on a path tile."],
};

// --- gates -------------------------------------------------------------------------------------

function gate2(id: string, name: string, blurb: string, fn: (a: boolean, b: boolean) => boolean): PartType<Config, { on: boolean }> {
  return {
    id,
    name,
    category: "Gates",
    blurb,
    wiki: name,
    w: 2,
    h: 2,
    // Wiki footprint: two input tiles side by side and the output on the tile in line with one
    // of them, not between the two.
    ports: [logicIn("a", "l", 0.25, "A"), logicIn("b", "l", 0.75, "B"), logicOut("out", "r", 0.75)],
    fields: [],
    defaults: () => ({}),
    init: () => ({ on: false }),
    step: (ctx) => {
      ctx.state.on = fn(ctx.in("a"), ctx.in("b"));
      ctx.set("out", ctx.state.on);
    },
    status: (_c, s) => ({ active: s.on }),
  };
}

const not: PartType<Config, { on: boolean }> = {
  id: "not",
  name: "NOT Gate",
  category: "Gates",
  blurb: "On while its input is off.",
  wiki: "NOT Gate",
  w: 2,
  h: 1,
  ports: [logicIn("in", "l", 0.5), logicOut("out", "r", 0.5)],
  fields: [],
  defaults: () => ({}),
  init: () => ({ on: true }),
  step: (ctx) => {
    ctx.state.on = !ctx.in("in");
    ctx.set("out", ctx.state.on);
  },
  status: (_c, s) => ({ active: s.on }),
};

const buffer: PartType<{ hold: number }, { left: number; on: boolean }> = {
  id: "buffer",
  name: "Buffer Gate",
  category: "Gates",
  blurb: "Passes a signal and keeps it on for a set time after the input stops.",
  wiki: "Buffer Gate",
  w: 2,
  h: 1,
  ports: [logicIn("in", "l", 0.5), logicOut("out", "r", 0.5)],
  fields: [seconds("hold", "Keep on for", 0, 10)],
  defaults: () => ({ hold: 1 }),
  init: () => ({ left: 0, on: false }),
  step: (ctx) => {
    const s = ctx.state;
    if (ctx.in("in")) {
      s.left = ticks(ctx.cfg.hold);
      s.on = true;
    } else if (s.left > 0) {
      s.left--;
      s.on = true;
    } else s.on = false;
    ctx.set("out", s.on);
  },
  status: (_c, s) => ({ active: s.on, badge: s.left > 0 && s.on ? `${(s.left * TICK).toFixed(1)}s` : undefined }),
  describe: (c, s) => [
    s.on ? (s.left > 0 ? `Holding: ${(s.left * TICK).toFixed(1)} s left after the input drops.` : "On.") : "Off.",
    `Holds for ${c.hold} s after the input turns off.`,
  ],
};

const filter: PartType<{ time: number }, { held: number; on: boolean }> = {
  id: "filter",
  name: "Filter Gate",
  category: "Gates",
  blurb: "On only once its input has been on for a set time. Swallows short pulses.",
  wiki: "Filter Gate",
  w: 2,
  h: 1,
  ports: [logicIn("in", "l", 0.5), logicOut("out", "r", 0.5)],
  fields: [seconds("time", "Input on for at least", 0, 10)],
  defaults: () => ({ time: 1 }),
  init: () => ({ held: 0, on: false }),
  step: (ctx) => {
    const s = ctx.state;
    if (ctx.in("in")) s.held++;
    else s.held = 0;
    s.on = s.held > 0 && s.held >= ticks(ctx.cfg.time);
    ctx.set("out", s.on);
  },
  status: (c, s) => ({ active: s.on, badge: s.held > 0 && !s.on ? `${(s.held * TICK).toFixed(1)}/${c.time}` : undefined }),
  describe: (c, s) => [
    s.held > 0 ? `Input on for ${(s.held * TICK).toFixed(2)} s.` : "Input off.",
    `Needs ${c.time} s of continuous input.`,
  ],
};

const counterGate: PartType<{ count: number; edgeCounts: boolean }, { prev: boolean; n: number; on: boolean }> = {
  id: "counter-gate",
  name: "Counter Gate",
  category: "Memory",
  blurb: "After N signals, turns on until the next signal arrives.",
  wiki: "Counter Gate",
  w: 3,
  h: 1,
  ports: [logicIn("in", "l", 0.5), logicOut("out", "r", 0.5)],
  fields: [
    { key: "count", label: "Signals needed", type: "number", min: 2, max: 10, step: 1 },
    {
      key: "edgeCounts",
      label: "Turn-off signal counts as 1",
      type: "bool",
      help: "The wiki doesn't say whether the signal that stops the output also starts the next count.",
    },
  ],
  defaults: () => ({ count: 3, edgeCounts: false }),
  init: () => ({ prev: false, n: 0, on: false }),
  step: (ctx) => {
    const s = ctx.state;
    const now = ctx.in("in");
    if (now && !s.prev) {
      if (s.on) {
        s.on = false;
        s.n = ctx.cfg.edgeCounts ? 1 : 0;
      } else if (++s.n >= ctx.cfg.count) {
        s.on = true;
        s.n = 0;
      }
    }
    s.prev = now;
    ctx.set("out", s.on);
  },
  status: (c, s) => ({ active: s.on, badge: s.on ? "✓" : `${s.n}/${c.count}` }),
  describe: (c, s) => [s.on ? "Output on; the next signal turns it off." : `Counted ${s.n} of ${c.count} signals.`],
};

const srLatch: PartType<{ priority: "reset" | "set" }, { q: boolean }> = {
  id: "sr-latch",
  name: "Set-Reset Latch",
  category: "Memory",
  blurb: "Set turns Q on and it stays on; Reset turns it off. Q̄ is the opposite.",
  wiki: "Set-Reset Latch",
  w: 2,
  h: 2,
  ports: [logicIn("s", "l", 0.25, "Set"), logicIn("r", "l", 0.75, "Reset"), logicOut("q", "r", 0.25, "Q"), logicOut("nq", "r", 0.75, "Q̄")],
  fields: [
    {
      key: "priority",
      label: "Both inputs on",
      type: "select",
      options: [
        { value: "reset", label: "Reset wins" },
        { value: "set", label: "Set wins" },
      ],
      help: "The wiki says Set and Reset aren't meant to be on together.",
    },
  ],
  defaults: () => ({ priority: "reset" }),
  init: () => ({ q: false }),
  step: (ctx) => {
    const s = ctx.in("s");
    const r = ctx.in("r");
    if (s && r) ctx.state.q = ctx.cfg.priority === "set";
    else if (s) ctx.state.q = true;
    else if (r) ctx.state.q = false;
    ctx.set("q", ctx.state.q);
    ctx.set("nq", !ctx.state.q);
  },
  status: (_c, s) => ({ active: s.q, badge: s.q ? "SET" : "RESET" }),
  describe: (_c, s) => [s.q ? "Set: Q on, Q̄ off." : "Reset: Q off, Q̄ on."],
};

const dFlipFlop: PartType<Config, { q: boolean; prev: boolean }> = {
  id: "d-flipflop",
  name: "Data Flip-Flop",
  category: "Memory",
  blurb: "When Clock turns on, Q copies Data. Q̄ is the opposite.",
  wiki: "Data Flip-Flop",
  w: 2,
  h: 2,
  ports: [logicIn("d", "l", 0.25, "Data"), logicIn("clk", "l", 0.75, "Clock"), logicOut("q", "r", 0.25, "Q"), logicOut("nq", "r", 0.75, "Q̄")],
  fields: [],
  defaults: () => ({}),
  init: () => ({ q: false, prev: false }),
  step: (ctx) => {
    const clk = ctx.in("clk");
    if (clk && !ctx.state.prev) ctx.state.q = ctx.in("d");
    ctx.state.prev = clk;
    ctx.set("q", ctx.state.q);
    ctx.set("nq", !ctx.state.q);
  },
  status: (_c, s) => ({ active: s.q }),
  describe: (_c, s) => [s.q ? "Holding 1 (Q on)." : "Holding 0 (Q̄ on)."],
};

// --- wireless and displays ---------------------------------------------------------------------

const channelField: FieldDef = {
  key: "channel",
  label: "Channel item",
  type: "item",
  allowEmpty: true,
  emptyLabel: "None (no signal)",
  help: "In the game the channel is the item in the filter slot. An empty slot sends nothing.",
};

const wirelessSender: PartType<{ channel: string }, { on: boolean }> = {
  id: "wireless-sender",
  name: "Wireless Signal Sender",
  category: "Wireless & display",
  blurb: "Sends its input on a channel (picked by item).",
  wiki: "Wireless Signal Sender",
  w: 1,
  h: 1,
  ports: [logicIn("in", "l", 0.5)],
  fields: [channelField],
  defaults: () => ({ channel: "" }),
  init: () => ({ on: false }),
  step: (ctx) => {
    ctx.state.on = !!ctx.cfg.channel && ctx.in("in");
    if (ctx.state.on) ctx.send(ctx.cfg.channel);
  },
  status: (c, s) => ({ active: s.on, warn: !c.channel }),
  describe: (c, s) => [c.channel ? `Channel: ${itemName(c.channel)}. ${s.on ? "Sending." : "Idle."}` : "No channel item set, so nothing is sent."],
};

const wirelessReceiver: PartType<{ channel: string }, { on: boolean }> = {
  id: "wireless-receiver",
  name: "Wireless Signal Receiver",
  category: "Wireless & display",
  blurb: "Outputs whatever any sender on its channel sends.",
  wiki: "Wireless Signal Receiver",
  w: 1,
  h: 1,
  ports: [logicOut("out", "r", 0.5)],
  fields: [channelField],
  defaults: () => ({ channel: "" }),
  init: () => ({ on: false }),
  step: (ctx) => {
    ctx.state.on = !!ctx.cfg.channel && ctx.channel(ctx.cfg.channel);
    ctx.set("out", ctx.state.on);
  },
  status: (c, s) => ({ active: s.on, warn: !c.channel }),
  describe: (c, s) => [c.channel ? `Channel: ${itemName(c.channel)}. ${s.on ? "Receiving." : "Nothing on the channel."}` : "No channel item set."],
};

const pixel: PartType<Config, { on: boolean }> = {
  id: "pixel",
  name: "Pixel Display",
  category: "Wireless & display",
  blurb: "Lights up while it receives a signal.",
  wiki: "Pixel Display",
  w: 1,
  h: 1,
  ports: [logicIn("in", "l", 0.5)],
  fields: [],
  defaults: () => ({}),
  init: () => ({ on: false }),
  step: (ctx) => void (ctx.state.on = ctx.in("in")),
  status: (_c, s) => ({ active: s.on }),
};

const pixel4: PartType<Config, { on: boolean[] }> = {
  id: "pixel4",
  name: "Four Pixel Display",
  category: "Wireless & display",
  blurb: "Four lamps showing the four bits of a ribbon.",
  wiki: "Four Pixel Display",
  w: 1,
  h: 1,
  ports: [{ ...logicIn("in", "l", 0.5, "ribbon"), bus: "all" }],
  fields: [],
  defaults: () => ({}),
  init: () => ({ on: [false, false, false, false] }),
  step: (ctx) => void (ctx.state.on = ctx.bits("in")),
  status: (_c, s) => ({ active: s.on.some(Boolean), badge: s.on.map((b) => (b ? "●" : "○")).join("") }),
  describe: (_c, s) => [
    `Bits 0–3: ${s.on.map((b) => (b ? "1" : "0")).join(" ")}.`,
    "Lamps: bit 0 top left, bit 1 top right, bit 2 bottom left, bit 3 bottom right.",
    "On a plain wire only bit 0 (the first lamp) can light.",
  ],
};

/** Which ribbon bit a Ribbon Writer writes or a Ribbon Reader reads: any of 0–3. */
const bitField: FieldDef = {
  key: "bit",
  label: "Ribbon bit",
  type: "select",
  options: [
    { value: "0", label: "Bit 0" },
    { value: "1", label: "Bit 1" },
    { value: "2", label: "Bit 2" },
    { value: "3", label: "Bit 3" },
  ],
  help: "A plain wire meeting a ribbon also uses bit 0.",
};

const wireBridge: PartType<Config, { on: boolean }> = {
  id: "wire-bridge",
  name: "Wire Bridge",
  category: "Wiring",
  blurb: "Carries a wire over another: two end tiles joined over a gap tile.",
  wiki: "Wire Bridge",
  w: 3,
  h: 1,
  ports: [logicIn("a", "l", 0.5, "end"), logicIn("b", "r", 0.5, "end")],
  joins: [["a", "b"]],
  fields: [],
  defaults: () => ({}),
  init: () => ({ on: false }),
  step: (ctx) => void (ctx.state.on = ctx.in("a") || ctx.in("b")),
  status: (_c, s) => ({ active: s.on }),
  describe: (_c, s) => [
    s.on ? "Carrying a signal." : "No signal.",
    "Its two ends are one wire. Whatever runs through the middle tile stays separate.",
  ],
};

const ribbonWriter: PartType<{ bit: string }, { on: boolean }> = {
  id: "ribbon-writer",
  name: "Ribbon Writer",
  category: "Wiring",
  blurb: "Puts a wire's signal onto bit 0–3 of the ribbon at its output.",
  wiki: "Ribbon Writer",
  w: 2,
  h: 1,
  ports: [logicIn("in", "l", 0.5, "wire"), { ...logicOut("out", "r", 0.5, "ribbon"), bus: "bit" }],
  fields: [bitField],
  defaults: () => ({ bit: "1" }),
  init: () => ({ on: false }),
  step: (ctx) => {
    ctx.state.on = ctx.in("in");
    ctx.set("out", ctx.state.on);
  },
  status: (c, s) => ({ active: s.on, badge: `b${c.bit}` }),
  describe: (c, s) => [`Writes ${s.on ? "1" : "0"} to bit ${c.bit}.`],
};

const ribbonReader: PartType<{ bit: string }, { on: boolean }> = {
  id: "ribbon-reader",
  name: "Ribbon Reader",
  category: "Wiring",
  blurb: "Reads bit 0–3 of the ribbon at its input onto a plain wire.",
  wiki: "Ribbon Reader",
  w: 2,
  h: 1,
  ports: [{ ...logicIn("in", "l", 0.5, "ribbon"), bus: "bit" }, logicOut("out", "r", 0.5, "wire")],
  fields: [bitField],
  defaults: () => ({ bit: "1" }),
  init: () => ({ on: false }),
  step: (ctx) => {
    ctx.state.on = ctx.in("in");
    ctx.set("out", ctx.state.on);
  },
  status: (c, s) => ({ active: s.on, badge: `b${c.bit}` }),
  describe: (c, s) => [`Bit ${c.bit} is ${s.on ? "on" : "off"}.`],
};

// --- paths ---------------------------------------------------------------------------------------
// Path add-ons sit on a path tile and change how sparks walk (see sim.ts for the walking rule:
// right, straight, left, back). Wired and unpowered, sparks ignore them, except the Spark Gate.

const POWER = (label = "power") => logicIn("en", "t", 0.5, label);
const ON_PATH = "Place it on a path tile.";
const IGNORED = "Wired and unpowered: sparks ignore it.";

type FilterState = { passed: number; turned: number };

type FilterCfg = { item: string; invert: boolean };
const itemFilter: PartType<FilterCfg, FilterState> = {
  id: "item-filter",
  name: "Item Filter",
  category: "Paths",
  blurb: "Only sparks carrying its item may pass; the rest keep walking another way.",
  wiki: "Item Filter",
  w: 1,
  h: 1,
  ports: [POWER()],
  fields: [
    { key: "item", label: "Item", type: "item", allowEmpty: true, emptyLabel: "Empty (only empty-handed sparks)" },
    { key: "invert", label: "Reverse (block this item)", type: "bool" },
  ],
  defaults: () => ({ item: "", invert: false }),
  init: () => ({ passed: 0, turned: 0 }),
  path: {
    passable: (ctx, sp) => {
      if (!powered(ctx)) return true;
      const ok = ((sp.item ?? "") === ctx.cfg.item) !== ctx.cfg.invert;
      if (!ok) ctx.state.turned++;
      return ok;
    },
    arrive: (ctx) => void ctx.state.passed++,
  },
  status: (c) => ({ warn: !c.item }),
  describe: (c, s) => [
    `${c.invert ? "Blocks" : "Passes"} sparks carrying ${c.item ? itemName(c.item) : "nothing (empty filter)"}.`,
    `${s.passed} spark(s) passed; others turned away ${s.turned} time(s).`,
    ON_PATH,
    IGNORED,
  ],
};

type AmountCfg = { cmp: "eq" | "ge" | "le"; amount: number };
const amountFilter: PartType<AmountCfg, FilterState> = {
  id: "amount-filter",
  name: "Amount Filter",
  category: "Paths",
  blurb: "Only sparks carrying a matching amount may pass; the rest keep walking.",
  wiki: "Amount Filter",
  w: 1,
  h: 1,
  ports: [POWER()],
  fields: [
    {
      key: "cmp",
      label: "Carrying",
      type: "select",
      options: [
        { value: "eq", label: "exactly" },
        { value: "ge", label: "at least (≥)" },
        { value: "le", label: "at most (≤)" },
      ],
    },
    { key: "amount", label: "Amount", type: "number", min: 0, max: 999, step: 1 },
  ],
  defaults: () => ({ cmp: "eq", amount: 1 }),
  init: () => ({ passed: 0, turned: 0 }),
  path: {
    passable: (ctx, sp) => {
      if (!powered(ctx)) return true;
      const { cmp, amount } = ctx.cfg;
      const n = sp.item ? sp.n : 0; // empty-handed counts as carrying 0
      const ok = cmp === "eq" ? n === amount : cmp === "ge" ? n >= amount : n <= amount;
      if (!ok) ctx.state.turned++;
      return ok;
    },
    arrive: (ctx) => void ctx.state.passed++,
  },
  describe: (c, s) => [
    `Passes sparks carrying ${c.cmp === "eq" ? "exactly" : c.cmp === "ge" ? "at least" : "at most"} ${c.amount}.`,
    `${s.passed} spark(s) passed; others turned away ${s.turned} time(s).`,
    ON_PATH,
    IGNORED,
  ],
};

const blocker: PartType<{ closed: boolean }, { closed: boolean; shut: boolean }> = {
  id: "blocker",
  name: "Blocker",
  category: "Paths",
  blurb: "Blocks the path while its signal is on (or while switched closed when unwired).",
  wiki: "Blocker",
  w: 1,
  h: 1,
  ports: [POWER("block")],
  fields: [{ key: "closed", label: "Closed (when unwired)", type: "bool", help: "Tap it while running to toggle." }],
  defaults: () => ({ closed: false }),
  init: (cfg) => ({ closed: cfg.closed, shut: cfg.closed }),
  step: (ctx) => void (ctx.state.shut = ctx.wired("en") ? ctx.in("en") : ctx.state.closed),
  path: { passable: (ctx) => !ctx.state.shut },
  tap: (_c, s) => void (s.closed = !s.closed),
  tappable: () => true,
  status: (_c, s) => ({ active: !s.shut, badge: s.shut ? "✕" : undefined }),
  describe: (_c, s) => [s.shut ? "Blocking: sparks turn back or take another way." : "Open.", ON_PATH],
};

const sparkGate: PartType<Config, { open: boolean; waiting: number }> = {
  id: "spark-gate",
  name: "Spark Gate",
  category: "Paths",
  blurb: "Sparks wait at it until it gets a signal.",
  wiki: "Spark Gate",
  w: 1,
  h: 1,
  ports: [POWER("open")],
  fields: [],
  defaults: () => ({}),
  init: () => ({ open: true, waiting: 0 }),
  step: (ctx) => {
    ctx.state.open = powered(ctx);
    ctx.state.waiting = 0;
  },
  path: {
    holds: (ctx) => {
      if (ctx.state.open) return false;
      ctx.state.waiting++;
      return true;
    },
  },
  status: (_c, s) => ({ active: s.open }),
  describe: (_c, s) => [
    s.open ? "Open: sparks pass." : "Closed: sparks wait in front of it for a signal.",
    "Unwired it stays open (assumption).",
    ON_PATH,
  ],
};

const splitter: PartType<Config, { next: number; sent: number }> = {
  id: "splitter",
  name: "Splitter",
  category: "Paths",
  blurb: "On a junction: sparks entering from the back take its exits in turn.",
  wiki: "Splitter",
  w: 1,
  h: 1,
  ports: [POWER()],
  fields: [],
  defaults: () => ({}),
  init: () => ({ next: 0, sent: 0 }),
  path: {
    exits: (ctx, _sp, d, facing, open) => {
      if (!powered(ctx)) return undefined;
      // From the back (moving the way it faces): right, straight, left in turn.
      if (d === facing) {
        const order = [(d + 1) % 4, d, (d + 3) % 4].filter((x) => open.includes(x));
        if (!order.length) return undefined;
        const k = ctx.state.next % order.length;
        return [...order.slice(k), ...order.slice(0, k)];
      }
      // From any other side: out through the back.
      return [(facing + 2) % 4];
    },
    leave: (ctx, _sp, d, facing) => {
      if (powered(ctx) && d === facing) {
        ctx.state.next++;
        ctx.state.sent++;
      }
    },
  },
  describe: (_c, s) => [
    "Sparks entering from its back are sent right, straight and left in turn (skipping exits with no path).",
    "Sparks from the other sides leave through the back.",
    `${s.sent} spark(s) split so far.`,
    ON_PATH,
    "Wired and unpowered: sparks ignore it.",
  ],
};

const waitGate: PartType<{ wait: number }, { held: number }> = {
  id: "wait-gate",
  name: "Wait Gate",
  category: "Paths",
  blurb: "Each spark waits a set time before passing.",
  wiki: "Wait Gate",
  w: 1,
  h: 1,
  ports: [POWER()],
  fields: [seconds("wait", "Wait", 0.5, 5)],
  defaults: () => ({ wait: 1 }),
  init: () => ({ held: 0 }),
  path: {
    arrive: (ctx) => {
      if (!powered(ctx)) return 0;
      ctx.state.held++;
      return ctx.cfg.wait;
    },
  },
  describe: (c, s) => [`Each spark waits ${c.wait} s.`, `${s.held} spark(s) held so far.`, ON_PATH, IGNORED],
};

const pathCounter: PartType<Config, { times: number[] }> = {
  id: "counter",
  name: "Counter",
  category: "Paths",
  blurb: "Counts items carried past it (from its gate side) in the last minute.",
  wiki: "Counter",
  w: 1,
  h: 1,
  ports: [POWER()],
  fields: [],
  defaults: () => ({}),
  init: () => ({ times: [] }),
  path: {
    arrive: (ctx, sp, d, facing) => {
      if (!powered(ctx) || !sp.item || d !== facing) return;
      for (let i = 0; i < sp.n; i++) ctx.state.times.push(ctx.tick);
    },
  },
  step: (ctx) => {
    const cutoff = ctx.tick - ticks(60);
    const times = ctx.state.times;
    let drop = 0;
    while (drop < times.length && times[drop] <= cutoff) drop++;
    if (drop) times.splice(0, drop);
  },
  status: (_c, s) => ({ badge: String(s.times.length) }),
  describe: (_c, s) => [`${s.times.length} item(s) in the last minute.`, "Counts sparks walking the way it faces.", ON_PATH],
};

const crossing: PartType<Config, Record<string, never>> = {
  id: "crossing",
  name: "Crossing",
  category: "Paths",
  blurb: "On a junction: sparks go straight across instead of turning.",
  wiki: "Crossing",
  w: 1,
  h: 1,
  ports: [POWER()],
  fields: [],
  defaults: () => ({}),
  init: () => ({}),
  path: {
    // Wiki: forward only; a U-turn if there's no path ahead.
    exits: (ctx, _sp, d) => (powered(ctx) ? [d, (d + 2) % 4] : undefined),
  },
  describe: () => ["Sparks go straight on, or turn back if there's no path ahead.", ON_PATH, IGNORED],
};

const oneWay: PartType<Config, { turned: number }> = {
  id: "one-way",
  name: "One Way",
  category: "Paths",
  blurb: "Sparks may only pass in the arrow's direction.",
  wiki: "One Way",
  w: 1,
  h: 1,
  ports: [POWER()],
  fields: [],
  defaults: () => ({}),
  init: () => ({ turned: 0 }),
  path: {
    // Wiki: blocks sparks coming from the side the arrow points to, and sends the others out
    // that way.
    passable: (ctx, _sp, d, facing) => {
      if (!powered(ctx) || d !== (facing + 2) % 4) return true;
      ctx.state.turned++;
      return false;
    },
    exits: (ctx, _sp, _d, facing) => (powered(ctx) ? [facing] : undefined),
  },
  describe: (_c, s) => [`Arrow direction only. ${s.turned} spark(s) turned away.`, "Rotate it to point the arrow.", ON_PATH, IGNORED],
};

const sparks: PartType<{ count: number; carry: number }, Record<string, never>> = {
  id: "sparks",
  name: "Sparks",
  category: "Paths",
  blurb: "Puts hauling sparks on the path tile it sits on. They walk the path carrying items.",
  w: 1,
  h: 1,
  ports: [],
  fields: [
    { key: "count", label: "How many", type: "number", min: 1, max: 50, step: 1 },
    {
      key: "carry",
      label: "Items per trip",
      type: "number",
      min: 0,
      max: 100,
      step: 1,
      help: "0 = a whole stack, like a Hauling Spark. Other carry amounts aren't on the wiki.",
    },
  ],
  defaults: () => ({ count: 2, carry: 1 }),
  init: () => ({}),
  status: (c) => ({ badge: `×${c.count}` }),
  describe: (c) => [
    `${c.count} spark(s), each carrying ${c.carry ? `up to ${c.carry}` : "a whole stack"}.`,
    "They start facing the way this part faces. At each tile they turn right if they can, else go straight, else left, else back.",
    "They pick up at building exits they pass (when empty-handed) and drop off at entrances that will take their load.",
    "In the game you drop sparks onto a path; this part stands in for that. Place it on a path tile.",
  ],
};

const source: PartType<{ items: string[]; rate: number; stack: number }, { credit: number; next: number; made: number }> = {
  id: "source",
  name: "Item source",
  category: "Storage & machines",
  blurb: "Sandbox helper: items arriving (a train unloading, a harvester…). Sparks pick them up at its exit.",
  w: 1,
  h: 1,
  ports: [itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "enable")],
  fields: [
    { key: "items", label: "Items (handed out in turn)", type: "items", max: 12 },
    { key: "rate", label: "Loads per second", type: "number", min: 0.1, max: 10, step: 0.1, unit: "/s" },
    { key: "stack", label: "Items per load", type: "number", min: 1, max: 100, step: 1 },
  ],
  defaults: () => ({ items: ["wooden-log"], rate: 1, stack: 1 }),
  init: () => ({ credit: 1, next: 0, made: 0 }),
  step: (ctx) => {
    const s = ctx.state;
    const { items, rate } = ctx.cfg;
    if (!items.length || !powered(ctx)) return;
    // A few loads can wait at the exit for the next spark.
    s.credit = Math.min(3, s.credit + rate * ctx.dt);
  },
  give: (ctx, _p, max, item) => {
    const s = ctx.state;
    const { items, stack } = ctx.cfg;
    if (!items.length || !powered(ctx) || s.credit < 1 - 1e-9) return null;
    const next = items[s.next % items.length];
    if (item && item !== next) return null;
    s.credit -= 1;
    s.next = (s.next + 1) % items.length;
    const n = Math.min(stack, max > 0 ? max : stackSize(next));
    s.made += n;
    return ctx.token(next, n);
  },
  status: (c) => ({ warn: !c.items.length }),
  describe: (c, s) => [
    c.items.length ? `Hands out ${c.items.map(itemName).join(", ")} in turn, ${c.rate} load(s)/s.` : "No items set.",
    `${s.made} item(s) handed out.`,
    "Sparks passing its exit empty-handed pick up a load.",
  ],
};

// --- storage and machines ----------------------------------------------------------------------

export const STORAGE_PRESETS: { id: string; label: string; capacity: number }[] = [
  { id: "crate", label: "Crate (4 stacks)", capacity: 4 * STACK },
  { id: "barrel", label: "Barrel (8 stacks)", capacity: 8 * STACK },
  { id: "big-crate", label: "Big Crate (20 stacks)", capacity: 20 * STACK },
  { id: "shed", label: "Shed (24 stacks)", capacity: 24 * STACK },
  { id: "big-barrel", label: "Big Barrel (40 stacks)", capacity: 40 * STACK },
];

type StorageCfg = { label: string; capacity: number; take: string; stock: [string, number][] };
type StorageState = { counts: Record<string, number>; total: number; rr: number };
const storage: PartType<StorageCfg, StorageState> = {
  id: "storage",
  name: "Storage",
  category: "Storage & machines",
  blurb: "Holds items up to a capacity. Sparks drop items at its entrance and pick them up at its exit.",
  w: 2,
  h: 2,
  // Entrance and exit on the lower row's tiles, so each faces exactly one path tile.
  ports: [
    itemIn("in", "l", 0.75),
    itemOut("out", "r", 0.75),
    { id: "sense", kind: "observe", dir: "in", side: "t", at: 0.5, label: "sensor" },
  ],
  fields: [
    { key: "label", label: "Label", type: "text", maxLength: 24 },
    { key: "capacity", label: "Capacity (items)", type: "number", min: 1, max: 9999, step: 1, help: "Presets assume 50 items per stack." },
    { key: "take", label: "Sparks take out", type: "item", allowEmpty: true, emptyLabel: "Any item" },
    { key: "stock", label: "Starts with", type: "stock", max: 12 },
  ],
  defaults: () => ({ label: "", capacity: 4 * STACK, take: "", stock: [] }),
  init: (cfg) => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [item, n] of cfg.stock) {
      const add = Math.min(n, cfg.capacity - total);
      if (add <= 0) break;
      counts[item] = (counts[item] ?? 0) + add;
      total += add;
    }
    return { counts, total, rr: 0 };
  },
  accept: (ctx, _p, t) => {
    const s = ctx.state;
    if (s.total + t.n > ctx.cfg.capacity) return false;
    s.counts[t.item] = (s.counts[t.item] ?? 0) + t.n;
    s.total += t.n;
    return true;
  },
  give: (ctx, _p, max, want) => {
    const { state: s, cfg } = ctx;
    let item = want ?? (cfg.take || "");
    if (want && cfg.take && want !== cfg.take) return null;
    if (!item) {
      const keys = Object.keys(s.counts).filter((k) => s.counts[k] > 0);
      if (!keys.length) return null;
      item = keys[s.rr++ % keys.length];
    }
    const n = Math.min(max > 0 ? max : stackSize(item), s.counts[item] ?? 0);
    if (n <= 0) return null;
    s.counts[item] -= n;
    if (!s.counts[item]) delete s.counts[item];
    s.total -= n;
    return ctx.token(item, n);
  },
  view: (cfg, s) => ({ total: s.total, capacity: cfg.capacity, count: (item) => s.counts[item] ?? 0 }),
  status: (cfg, s) => {
    // What it holds, most first; empty, the item it's meant for (its "take" setting).
    const held = Object.entries(s.counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([item]) => item);
    const items = held.length ? held.slice(0, 3) : cfg.take ? [cfg.take] : [];
    return { fill: cfg.capacity ? s.total / cfg.capacity : 0, badge: String(s.total), items };
  },
  describe: (cfg, s) => {
    const items = Object.entries(s.counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${itemName(k)} × ${n}`);
    return [`${s.total} / ${cfg.capacity} items (${Math.round((100 * s.total) / (cfg.capacity || 1))} %).`, items.length ? items.join(", ") : "Empty."];
  },
};

const extractor: PartType<{ rate: number }, { credit: number; moved: number; on: boolean; held: { item: string; n: number } | null }> = {
  id: "extractor",
  name: "Extractor",
  category: "Storage & machines",
  blurb: "Old sandbox stand-in for a hauling route; use a Spark Gate on a path instead.",
  hidden: true,
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "enable")],
  fields: [{ key: "rate", label: "Items per second", type: "number", min: 0.1, max: 20, step: 0.1, unit: "/s" }],
  defaults: () => ({ rate: 1 }),
  init: () => ({ credit: 1, moved: 0, on: true, held: null }),
  step: (ctx) => {
    ctx.state.on = powered(ctx);
    if (ctx.state.on) ctx.state.credit = Math.min(1, ctx.state.credit + ctx.cfg.rate * ctx.dt);
  },
  accept: (ctx, _p, t) => {
    const s = ctx.state;
    if (!s.on || s.held || s.credit < 1 - 1e-9) return false;
    s.credit -= 1;
    s.held = { item: t.item, n: t.n };
    return true;
  },
  give: (ctx, _p, max, want) => {
    const s = ctx.state;
    if (!s.held || (want && want !== s.held.item)) return null;
    const n = Math.min(max > 0 ? max : stackSize(s.held.item), s.held.n);
    const t = ctx.token(s.held.item, n);
    s.held.n -= n;
    s.moved += n;
    if (!s.held.n) s.held = null;
    return t;
  },
  status: (_c, s) => ({ active: s.on, badge: String(s.moved) }),
  describe: (c, s) => [s.on ? `Passing up to ${c.rate} load(s)/s.` : "Disabled: no enable signal.", `${s.moved} moved so far.`, ENABLE_HELP],
};

type MachineCfg = {
  label: string;
  recipe: string;
  speed: number;
  useItem: string;
  useAmount: number;
  makeItem: string;
  makeAmount: number;
  seconds: number;
  /** Items each output slot holds; 0 means one stack of that product. */
  slot: number;
};
type MachineState = {
  buf: Record<string, number>;
  /** Seconds of work done on the current craft, or -1 when idle. */
  work: number;
  /** Output slots: finished products waiting to be taken, by item. */
  out: Record<string, number>;
  made: number;
  on: boolean;
  why: string;
};

export interface MachineRecipe {
  from: { material: string; amount: number }[];
  to: { material: string; amount: number }[];
  seconds: number;
}

/** Stack size used when the wiki has none for an item. */
export const DEFAULT_STACK = 20;

/** One stack of an item, per the game data (wiki, with overrides). */
export const stackSize = (item: string) => GAME.materials.get(item)?.stack ?? DEFAULT_STACK;

/** How many of an item a machine's output slot holds. */
export const slotSize = (cfg: { slot: number }, item: string) => (cfg.slot > 0 ? cfg.slot : stackSize(item));

/** The recipe a machine runs: a game recipe, or the custom consume/produce settings. */
export function machineRecipe(cfg: MachineCfg): MachineRecipe {
  const r: Recipe | undefined = cfg.recipe ? GAME.recipesById.get(cfg.recipe) : undefined;
  if (r) {
    return {
      from: r.from.map((f) => ({ material: f.material, amount: f.amount })),
      to: r.to.filter((t) => (t.chance ?? 1) >= 1).map((t) => ({ material: t.material, amount: t.amount })),
      seconds: r.buildTime / (cfg.speed || 1),
    };
  }
  return {
    from: cfg.useAmount > 0 ? [{ material: cfg.useItem, amount: cfg.useAmount }] : [],
    to: cfg.makeItem && cfg.makeAmount > 0 ? [{ material: cfg.makeItem, amount: cfg.makeAmount }] : [],
    seconds: cfg.seconds,
  };
}

const machine: PartType<MachineCfg, MachineState> = {
  id: "machine",
  name: "Machine",
  category: "Storage & machines",
  blurb: "Any workstation: crafts while its enable signal is on, until its output slot is full.",
  w: 2,
  h: 2,
  ports: [itemIn("in", "l", 0.75), itemOut("out", "r", 0.75), logicIn("en", "t", 0.5, "enable")],
  fields: [
    { key: "label", label: "Label", type: "text", maxLength: 24 },
    { key: "recipe", label: "Recipe", type: "recipe", help: "Pick a game recipe, or leave custom to set what it uses and makes." },
    { key: "speed", label: "Crew speed ×", type: "number", min: 0.1, max: 10, step: 0.1, help: "Sum of spark speeds (2 Crafty = 3)." },
    { key: "useItem", label: "Uses", type: "item", allowEmpty: true, emptyLabel: "Any item" },
    { key: "useAmount", label: "Uses per craft", type: "number", min: 0, max: 100, step: 1 },
    { key: "makeItem", label: "Makes", type: "item", allowEmpty: true, emptyLabel: "Nothing" },
    { key: "makeAmount", label: "Makes per craft", type: "number", min: 0, max: 100, step: 1 },
    seconds("seconds", "Seconds per craft", 0.1, 600),
    {
      key: "slot",
      label: "Output slot holds",
      type: "number",
      min: 0,
      max: 999,
      step: 1,
      help: "0 = one stack of the product, from the wiki (Quartz 20). The machine stops when the slot is full and nothing takes the items.",
    },
  ],
  defaults: () => ({ label: "", recipe: "", speed: 3, useItem: "", useAmount: 1, makeItem: "", makeAmount: 0, seconds: 2, slot: 0 }),
  init: () => ({ buf: {}, work: -1, out: {}, made: 0, on: false, why: "" }),
  accept: (ctx, _p, t) => {
    const r = machineRecipe(ctx.cfg);
    const need = r.from.find((f) => f.material === t.item || f.material === "");
    if (!need) return false;
    const key = need.material || "*";
    const have = ctx.state.buf[key] ?? 0;
    // Its input holds about a stack (or two crafts' worth, if more). A spark tops it up while it
    // isn't full, even past that, so a leftover that's too small for a craft can't jam it.
    const room = Math.max(need.material ? stackSize(need.material) : DEFAULT_STACK, need.amount * 2);
    if (have >= room) return false;
    ctx.state.buf[key] = have + t.n;
    return true;
  },
  step: (ctx) => {
    const { state: s, cfg } = ctx;
    const r = machineRecipe(cfg);
    if (Array.isArray(s.out)) s.out = {}; // state from before output slots existed
    s.on = powered(ctx);
    if (!s.on) {
      s.why = "Disabled: no enable signal.";
      return;
    }
    if (s.work < 0) {
      // Like the game: a craft only starts if its products will fit in the output slots.
      const full = r.to.find((t) => (s.out[t.material] ?? 0) + t.amount > slotSize(cfg, t.material));
      if (full) {
        const n = s.out[full.material] ?? 0;
        s.why = `Waiting: output slot full (${n}/${slotSize(cfg, full.material)} ${itemName(full.material)}).`;
        return;
      }
      const missing = r.from.find((f) => (s.buf[f.material || "*"] ?? 0) < f.amount);
      if (missing) {
        s.why = `Waiting for ${missing.material ? itemName(missing.material) : "items"}.`;
        return;
      }
      if (!r.from.length && !r.to.length) {
        s.why = "Nothing to do: set a recipe.";
        return;
      }
      for (const f of r.from) s.buf[f.material || "*"] -= f.amount;
      s.work = 0;
    }
    s.work += ctx.dt;
    s.why = "Working.";
    if (s.work >= r.seconds - 1e-9) {
      s.work = -1;
      s.made++;
      for (const t of r.to) s.out[t.material] = (s.out[t.material] ?? 0) + t.amount;
    }
  },
  // Sparks passing the exit empty-handed take products from the output slot.
  give: (ctx, _p, max, want) => {
    const s = ctx.state;
    const item = want ?? Object.keys(s.out).find((k) => s.out[k] > 0);
    const n = item ? Math.min(max > 0 ? max : stackSize(item), s.out[item] ?? 0) : 0;
    if (!item || n <= 0) return null;
    s.out[item] -= n;
    if (!s.out[item]) delete s.out[item];
    return ctx.token(item, n);
  },
  action: { label: "Take output", run: (_cfg, s) => void (s.out = {}) },
  status: (cfg, s) => {
    const r = machineRecipe(cfg);
    return { active: s.on && s.work >= 0, fill: s.work >= 0 ? s.work / r.seconds : 0, badge: String(s.made), warn: s.on && s.why.startsWith("Waiting") };
  },
  describe: (cfg, s) => {
    const r = machineRecipe(cfg);
    const fmt = (l: { material: string; amount: number }[]) => l.map((x) => `${x.amount} ${x.material ? itemName(x.material) : "any item"}`).join(" + ") || "nothing";
    const stock = Object.entries(s.buf)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k === "*" ? "items" : itemName(k)} × ${n}`);
    const out = Array.isArray(s.out) ? {} : s.out;
    const slots = r.to.map((t) => `${itemName(t.material)} ${out[t.material] ?? 0}/${slotSize(cfg, t.material)}`);
    return [
      s.why || "Idle.",
      `Uses ${fmt(r.from)} → makes ${fmt(r.to)} every ${+r.seconds.toFixed(2)} s.`,
      stock.length ? `Has ${stock.join(", ")}.` : "Input buffer empty.",
      slots.length ? `Output slot: ${slots.join(", ")}.` : "Makes nothing (a consumer).",
      `${s.made} craft(s) done.`,
    ];
  },
};

/** Item slots a Compressor holds while it works through them (wiki: 20 storage slots). */
const COMPRESSOR_SLOTS = 20;

type CompressorState = { held: Record<string, number>; credit: number; sent: number };
const slotsUsed = (held: Record<string, number>) => Object.entries(held).reduce((n, [item, c]) => n + Math.ceil(c / stackSize(item)), 0);

const compressor: PartType<{ rate: number }, CompressorState> = {
  id: "compressor",
  name: "Compressor",
  category: "Storage & machines",
  blurb: "Compresses items and sends them to the Recycler. Takes anything, so lines don't back up.",
  wiki: "Compressor",
  // Wiki footprint: 2 × 3 with two input tiles on one short side; here inputs face left.
  w: 3,
  h: 2,
  ports: [itemIn("in", "l", 0.25), itemIn("in2", "l", 0.75)],
  fields: [
    {
      key: "rate",
      label: "Sends per second",
      type: "number",
      min: 0,
      max: 100,
      step: 0.5,
      unit: "/s",
      help: "0 = as fast as items arrive (the wiki gives no rate). With a rate, it holds up to 20 stacks and then backs up.",
    },
  ],
  defaults: () => ({ rate: 0 }),
  init: () => ({ held: {}, credit: 0, sent: 0 }),
  accept: (ctx, _p, t) => {
    const s = ctx.state;
    if (!ctx.cfg.rate) {
      s.sent += t.n;
      return true;
    }
    const next = { ...s.held, [t.item]: (s.held[t.item] ?? 0) + t.n };
    if (slotsUsed(next) > COMPRESSOR_SLOTS) return false;
    s.held = next;
    return true;
  },
  step: (ctx) => {
    const s = ctx.state;
    if (!ctx.cfg.rate) return;
    s.credit = Math.min(s.credit + ctx.cfg.rate * ctx.dt, Math.max(1, ctx.cfg.rate));
    for (const item of Object.keys(s.held)) {
      while (s.credit >= 1 - 1e-9 && s.held[item] > 0) {
        s.held[item]--;
        s.sent++;
        s.credit -= 1;
      }
      if (!s.held[item]) delete s.held[item];
    }
  },
  status: (c, s) => ({ active: true, badge: String(s.sent), fill: c.rate ? slotsUsed(s.held) / COMPRESSOR_SLOTS : undefined }),
  describe: (c, s) => [
    `${s.sent} item(s) sent to the Recycler.`,
    c.rate ? `Holding ${slotsUsed(s.held)} of ${COMPRESSOR_SLOTS} slots; sends ${c.rate}/s.` : "Sends items as fast as they arrive.",
  ],
};

const label: PartType<{ text: string }, Record<string, never>> = {
  id: "label",
  name: "Label",
  category: "Notes",
  blurb: "A text note on the grid.",
  w: 3,
  h: 1,
  ports: [],
  fields: [{ key: "text", label: "Text", type: "text", maxLength: 60 }],
  defaults: () => ({ text: "Note" }),
  init: () => ({}),
};

// --- registry ----------------------------------------------------------------------------------

export const PART_TYPES: PartType<any, any>[] = [
  lever,
  button,
  timer,
  capacitySensor,
  pressureSensor,
  not,
  gate2("and", "AND Gate", "On while both inputs are on.", (a, b) => a && b),
  gate2("or", "OR Gate", "On while at least one input is on.", (a, b) => a || b),
  gate2("xor", "XOR Gate", "On while exactly one input is on.", (a, b) => a !== b),
  buffer,
  filter,
  counterGate,
  srLatch,
  dFlipFlop,
  wirelessSender,
  wirelessReceiver,
  pixel,
  pixel4,
  wireBridge,
  ribbonWriter,
  ribbonReader,
  sparks,
  itemFilter,
  amountFilter,
  blocker,
  sparkGate,
  splitter,
  crossing,
  oneWay,
  waitGate,
  pathCounter,
  source,
  storage,
  extractor,
  machine,
  compressor,
  label,
];

export const PARTS: ReadonlyMap<string, PartType<any, any>> = new Map(PART_TYPES.map((t) => [t.id, t]));

export const CATEGORIES = [...new Set(PART_TYPES.map((t) => t.category))];

export type { StorageView, PartStatus };
