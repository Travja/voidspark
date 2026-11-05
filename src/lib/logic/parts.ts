// The part registry: every component the sandbox can place, with its ports, settings and
// behaviour. Behaviour follows docs/logic-components.md (wiki facts plus listed assumptions).
import { GAME, type Recipe } from "../engine/data";
import type { Config, FieldDef, PartStatus, PartType, PortDef, StepCtx, StorageView, Token } from "./types";

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
  blurb: "On a path: signals while an item passes over it.",
  wiki: "Pressure Sensor",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicOut("sig", "b", 0.5)],
  fields: [seconds("hold", "On per item", 0.1, 5, "How long one passing item keeps it on (sandbox assumption).")],
  defaults: () => ({ hold: 0.5 }),
  init: () => ({ left: 0, passed: 0 }),
  accept: (ctx, _p, t) => {
    if (!ctx.emit("out", t)) return false;
    ctx.state.left = ticks(ctx.cfg.hold);
    ctx.state.passed += t.n;
    return true;
  },
  step: (ctx) => {
    ctx.set("sig", ctx.state.left > 0);
    if (ctx.state.left > 0) ctx.state.left--;
  },
  status: (_c, s) => ({ active: s.left > 0, badge: String(s.passed) }),
  describe: (_c, s) => [`${s.passed} item(s) passed so far.`],
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
    ports: [logicIn("a", "l", 0.25, "A"), logicIn("b", "l", 0.75, "B"), logicOut("out", "r", 0.5)],
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
  w: 1,
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
  w: 1,
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
  w: 1,
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
  w: 1,
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
  blurb: "Four lamps, one per input.",
  wiki: "Four Pixel Display",
  w: 1,
  h: 2,
  ports: [logicIn("p0", "l", 0.125, "1"), logicIn("p1", "l", 0.375, "2"), logicIn("p2", "l", 0.625, "3"), logicIn("p3", "l", 0.875, "4")],
  fields: [],
  defaults: () => ({}),
  init: () => ({ on: [false, false, false, false] }),
  step: (ctx) => void (ctx.state.on = [0, 1, 2, 3].map((i) => ctx.in(`p${i}`))),
  status: (_c, s) => ({ active: s.on.some(Boolean), badge: s.on.map((b) => (b ? "●" : "○")).join("") }),
};

// --- paths -------------------------------------------------------------------------------------

/** Pass-through path add-on with a pass exit and a "keep walking" exit. */
type FilterCfg = { item: string; invert: boolean };
const itemFilter: PartType<FilterCfg, { passed: number; rejected: number }> = {
  id: "item-filter",
  name: "Item Filter",
  category: "Paths",
  blurb: "Items matching its item take the pass exit; others keep walking (reject exit).",
  wiki: "Item Filter",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("pass", "r", 0.5, "pass"), itemOut("reject", "b", 0.5, "reject"), logicIn("en", "t", 0.5, "power")],
  fields: [
    { key: "item", label: "Item", type: "item", allowEmpty: true, emptyLabel: "Empty (only empty-handed sparks)" },
    { key: "invert", label: "Reverse (block this item)", type: "bool" },
  ],
  defaults: () => ({ item: "", invert: false }),
  init: () => ({ passed: 0, rejected: 0 }),
  accept: (ctx, _p, t) => {
    if (!powered(ctx)) return ctx.emit("pass", t) && !!++ctx.state.passed;
    const match = (t.item === ctx.cfg.item) !== ctx.cfg.invert;
    const ok = ctx.emit(match ? "pass" : "reject", t);
    if (ok) ctx.state[match ? "passed" : "rejected"] += t.n;
    return ok;
  },
  status: (c) => ({ warn: !c.item }),
  describe: (c, s) => [
    `${c.invert ? "Blocks" : "Passes"} ${c.item ? itemName(c.item) : "nothing (empty filter)"}.`,
    `${s.passed} passed, ${s.rejected} sent on.`,
    "Wired and unpowered: sparks ignore it (everything takes the pass exit).",
  ],
};

type AmountCfg = { cmp: "eq" | "ge" | "le"; amount: number };
const amountFilter: PartType<AmountCfg, { passed: number; rejected: number }> = {
  id: "amount-filter",
  name: "Amount Filter",
  category: "Paths",
  blurb: "Passes sparks carrying a matching amount; others keep walking.",
  wiki: "Amount Filter",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("pass", "r", 0.5, "pass"), itemOut("reject", "b", 0.5, "reject"), logicIn("en", "t", 0.5, "power")],
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
  init: () => ({ passed: 0, rejected: 0 }),
  accept: (ctx, _p, t) => {
    if (!powered(ctx)) return ctx.emit("pass", t);
    const { cmp, amount } = ctx.cfg;
    const match = cmp === "eq" ? t.n === amount : cmp === "ge" ? t.n >= amount : t.n <= amount;
    const ok = ctx.emit(match ? "pass" : "reject", t);
    if (ok) ctx.state[match ? "passed" : "rejected"]++;
    return ok;
  },
  describe: (c, s) => [`Passes stacks ${c.cmp === "eq" ? "of exactly" : c.cmp === "ge" ? "of at least" : "of at most"} ${c.amount}.`, `${s.passed} passed, ${s.rejected} sent on.`],
};

const blocker: PartType<{ closed: boolean }, { closed: boolean; shut: boolean }> = {
  id: "blocker",
  name: "Blocker",
  category: "Paths",
  blurb: "Blocks the path while its signal is on (or while switched closed when unwired).",
  wiki: "Blocker",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "block")],
  fields: [{ key: "closed", label: "Closed (when unwired)", type: "bool", help: "Tap it while running to toggle." }],
  defaults: () => ({ closed: false }),
  init: (cfg) => ({ closed: cfg.closed, shut: cfg.closed }),
  step: (ctx) => void (ctx.state.shut = ctx.wired("en") ? ctx.in("en") : ctx.state.closed),
  accept: (ctx, _p, t) => !ctx.state.shut && ctx.emit("out", t),
  tap: (_c, s) => void (s.closed = !s.closed),
  tappable: () => true,
  status: (_c, s) => ({ active: !s.shut, badge: s.shut ? "✕" : undefined }),
  describe: (_c, s) => [s.shut ? "Blocking the path." : "Open."],
};

const sparkGate: PartType<Config, { open: boolean }> = {
  id: "spark-gate",
  name: "Spark Gate",
  category: "Paths",
  blurb: "Sparks wait here until it gets a signal.",
  wiki: "Spark Gate",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "open")],
  fields: [],
  defaults: () => ({}),
  init: () => ({ open: true }),
  step: (ctx) => void (ctx.state.open = powered(ctx)),
  accept: (ctx, _p, t) => ctx.state.open && ctx.emit("out", t),
  status: (_c, s) => ({ active: s.open }),
  describe: (_c, s) => [s.open ? "Open: sparks pass." : "Closed: sparks wait for a signal.", "Unwired it stays open (assumption)."],
};

const splitter: PartType<Config, { next: number }> = {
  id: "splitter",
  name: "Splitter",
  category: "Paths",
  blurb: "Sends items to its exits in turn.",
  wiki: "Splitter",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("a", "t", 0.5, "1"), itemOut("b", "r", 0.5, "2"), itemOut("c", "b", 0.5, "3"), logicIn("en", "l", 0.15, "power")],
  fields: [],
  defaults: () => ({}),
  init: () => ({ next: 0 }),
  accept: (ctx, _p, t) => {
    const exits = ["a", "b", "c"].filter((p) => ctx.wired(p));
    if (!exits.length) return false;
    if (!powered(ctx)) return ctx.emit(exits[0], t);
    for (let k = 0; k < exits.length; k++) {
      const i = (ctx.state.next + k) % exits.length;
      if (ctx.emit(exits[i], t)) {
        ctx.state.next = (i + 1) % exits.length;
        return true;
      }
    }
    return false;
  },
  describe: () => ["Cycles through its connected exits, skipping full ones.", "Wired and unpowered: everything takes the first exit."],
};

const waitGate: PartType<{ wait: number }, { held: Token | null; left: number }> = {
  id: "wait-gate",
  name: "Wait Gate",
  category: "Paths",
  blurb: "Each spark waits a set time before passing.",
  wiki: "Wait Gate",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "power")],
  fields: [seconds("wait", "Wait", 0.5, 5)],
  defaults: () => ({ wait: 1 }),
  init: () => ({ held: null, left: 0 }),
  accept: (ctx, _p, t) => {
    if (!powered(ctx)) return !ctx.state.held && ctx.emit("out", t);
    if (ctx.state.held) return false;
    ctx.state.held = t;
    ctx.state.left = ticks(ctx.cfg.wait);
    return true;
  },
  step: (ctx) => {
    const s = ctx.state;
    if (!s.held) return;
    if (s.left > 0) s.left--;
    else if (ctx.emit("out", s.held)) s.held = null;
  },
  status: (_c, s) => ({ active: !!s.held, badge: s.held ? `${(s.left * TICK).toFixed(1)}s` : undefined }),
  describe: (c, s) => [s.held ? `Holding ${itemName(s.held.item)}.` : "Empty.", `Each spark waits ${c.wait} s.`],
};

const pathCounter: PartType<Config, { times: number[] }> = {
  id: "counter",
  name: "Counter",
  category: "Paths",
  blurb: "Counts items that passed in the last minute.",
  wiki: "Counter",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "power")],
  fields: [],
  defaults: () => ({}),
  init: () => ({ times: [] }),
  accept: (ctx, _p, t) => {
    if (!ctx.emit("out", t)) return false;
    if (powered(ctx)) for (let i = 0; i < t.n; i++) ctx.state.times.push(ctx.tick);
    return true;
  },
  step: (ctx) => {
    const cutoff = ctx.tick - ticks(60);
    const times = ctx.state.times;
    let drop = 0;
    while (drop < times.length && times[drop] <= cutoff) drop++;
    if (drop) times.splice(0, drop);
  },
  status: (_c, s) => ({ badge: String(s.times.length) }),
  describe: (_c, s) => [`${s.times.length} item(s) in the last minute.`],
};

const source: PartType<{ items: string[]; rate: number; stack: number }, { credit: number; next: number; made: number }> = {
  id: "source",
  name: "Item source",
  category: "Paths",
  blurb: "Sandbox helper: items arriving (a train unloading, a harvester…).",
  w: 1,
  h: 1,
  ports: [itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "enable")],
  fields: [
    { key: "items", label: "Items (sent in turn)", type: "items", max: 12 },
    { key: "rate", label: "Sparks per second", type: "number", min: 0.1, max: 10, step: 0.1, unit: "/s" },
    { key: "stack", label: "Items per spark", type: "number", min: 1, max: 100, step: 1 },
  ],
  defaults: () => ({ items: ["wooden-log"], rate: 1, stack: 1 }),
  init: () => ({ credit: 1, next: 0, made: 0 }),
  step: (ctx) => {
    const s = ctx.state;
    const { items, rate, stack } = ctx.cfg;
    if (!items.length || !powered(ctx)) return;
    s.credit = Math.min(1, s.credit + rate * ctx.dt);
    if (s.credit >= 1 - 1e-9 && ctx.emit("out", ctx.token(items[s.next % items.length], stack))) {
      s.credit -= 1;
      s.next = (s.next + 1) % items.length;
      s.made += stack;
    }
  },
  status: (c) => ({ warn: !c.items.length }),
  describe: (c, s) => [
    c.items.length ? `Sends ${c.items.map(itemName).join(", ")} in turn.` : "No items set.",
    `${s.made} item(s) sent.`,
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

type StorageCfg = { label: string; capacity: number; take: string; rate: number; stock: [string, number][] };
type StorageState = { counts: Record<string, number>; total: number; credit: number; rr: number };
const storage: PartType<StorageCfg, StorageState> = {
  id: "storage",
  name: "Storage",
  category: "Storage & machines",
  blurb: "Holds items up to a capacity. Sparks haul items out while the exit path has room.",
  w: 2,
  h: 2,
  ports: [
    itemIn("in", "l", 0.5),
    itemOut("out", "r", 0.5),
    { id: "sense", kind: "observe", dir: "in", side: "t", at: 0.5, label: "sensor" },
  ],
  fields: [
    { key: "label", label: "Label", type: "text", maxLength: 24 },
    { key: "capacity", label: "Capacity (items)", type: "number", min: 1, max: 9999, step: 1, help: "Presets assume 50 items per stack." },
    { key: "take", label: "Haul out", type: "item", allowEmpty: true, emptyLabel: "Any item" },
    { key: "rate", label: "Haul rate", type: "number", min: 0, max: 20, step: 0.1, unit: "/s", help: "0 stops hauling out." },
    { key: "stock", label: "Starts with", type: "stock", max: 12 },
  ],
  defaults: () => ({ label: "", capacity: 4 * STACK, take: "", rate: 1, stock: [] }),
  init: (cfg) => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const [item, n] of cfg.stock) {
      const add = Math.min(n, cfg.capacity - total);
      if (add <= 0) break;
      counts[item] = (counts[item] ?? 0) + add;
      total += add;
    }
    return { counts, total, credit: 1, rr: 0 };
  },
  accept: (ctx, _p, t) => {
    const s = ctx.state;
    if (s.total + t.n > ctx.cfg.capacity) return false;
    s.counts[t.item] = (s.counts[t.item] ?? 0) + t.n;
    s.total += t.n;
    return true;
  },
  step: (ctx) => {
    const { state: s, cfg } = ctx;
    if (!cfg.rate || !ctx.wired("out")) return;
    s.credit = Math.min(1, s.credit + cfg.rate * ctx.dt);
    if (s.credit < 1 - 1e-9 || !ctx.hasRoom("out")) return;
    let item = cfg.take && s.counts[cfg.take] ? cfg.take : "";
    if (!cfg.take) {
      const keys = Object.keys(s.counts).filter((k) => s.counts[k] > 0);
      if (keys.length) item = keys[s.rr++ % keys.length];
    }
    if (!item) return;
    if (ctx.emit("out", ctx.token(item, 1))) {
      s.credit -= 1;
      s.total -= 1;
      if (!--s.counts[item]) delete s.counts[item];
    }
  },
  view: (cfg, s) => ({ total: s.total, capacity: cfg.capacity, count: (item) => s.counts[item] ?? 0 }),
  status: (cfg, s) => ({ fill: cfg.capacity ? s.total / cfg.capacity : 0, badge: String(s.total) }),
  describe: (cfg, s) => {
    const items = Object.entries(s.counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${itemName(k)} × ${n}`);
    return [`${s.total} / ${cfg.capacity} items (${Math.round((100 * s.total) / (cfg.capacity || 1))} %).`, items.length ? items.join(", ") : "Empty."];
  },
};

const extractor: PartType<{ rate: number }, { credit: number; moved: number; on: boolean }> = {
  id: "extractor",
  name: "Extractor",
  category: "Storage & machines",
  blurb: "Sandbox stand-in for a hauling route: moves items while enabled.",
  w: 1,
  h: 1,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "enable")],
  fields: [{ key: "rate", label: "Items per second", type: "number", min: 0.1, max: 20, step: 0.1, unit: "/s" }],
  defaults: () => ({ rate: 1 }),
  init: () => ({ credit: 1, moved: 0, on: true }),
  step: (ctx) => {
    ctx.state.on = powered(ctx);
    if (ctx.state.on) ctx.state.credit = Math.min(1, ctx.state.credit + ctx.cfg.rate * ctx.dt);
  },
  accept: (ctx, _p, t) => {
    if (!ctx.state.on || ctx.state.credit < 1 - 1e-9 || !ctx.emit("out", t)) return false;
    ctx.state.credit -= 1;
    ctx.state.moved += t.n;
    return true;
  },
  status: (_c, s) => ({ active: s.on, badge: String(s.moved) }),
  describe: (c, s) => [s.on ? `Moving up to ${c.rate} item(s)/s.` : "Disabled: no enable signal.", `${s.moved} moved so far.`, ENABLE_HELP],
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
};
type MachineState = {
  buf: Record<string, number>;
  /** Seconds of work done on the current craft, or -1 when idle. */
  work: number;
  out: Token[];
  made: number;
  on: boolean;
  why: string;
};

export interface MachineRecipe {
  from: { material: string; amount: number }[];
  to: { material: string; amount: number }[];
  seconds: number;
}

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
  blurb: "Any workstation: crafts while its enable signal is on.",
  w: 2,
  h: 2,
  ports: [itemIn("in", "l", 0.5), itemOut("out", "r", 0.5), logicIn("en", "t", 0.5, "enable")],
  fields: [
    { key: "label", label: "Label", type: "text", maxLength: 24 },
    { key: "recipe", label: "Recipe", type: "recipe", help: "Pick a game recipe, or leave custom to set what it uses and makes." },
    { key: "speed", label: "Crew speed ×", type: "number", min: 0.1, max: 10, step: 0.1, help: "Sum of spark speeds (2 Crafty = 3)." },
    { key: "useItem", label: "Uses", type: "item", allowEmpty: true, emptyLabel: "Any item" },
    { key: "useAmount", label: "Uses per craft", type: "number", min: 0, max: 100, step: 1 },
    { key: "makeItem", label: "Makes", type: "item", allowEmpty: true, emptyLabel: "Nothing" },
    { key: "makeAmount", label: "Makes per craft", type: "number", min: 0, max: 100, step: 1 },
    seconds("seconds", "Seconds per craft", 0.1, 600),
  ],
  defaults: () => ({ label: "", recipe: "", speed: 3, useItem: "", useAmount: 1, makeItem: "", makeAmount: 0, seconds: 2 }),
  init: () => ({ buf: {}, work: -1, out: [], made: 0, on: false, why: "" }),
  accept: (ctx, _p, t) => {
    const r = machineRecipe(ctx.cfg);
    const need = r.from.find((f) => f.material === t.item || f.material === "");
    if (!need) return false;
    const key = need.material || "*";
    const have = ctx.state.buf[key] ?? 0;
    if (have >= Math.max(10, need.amount * 2)) return false;
    ctx.state.buf[key] = have + t.n;
    return true;
  },
  step: (ctx) => {
    const { state: s, cfg } = ctx;
    const r = machineRecipe(cfg);
    // Hand finished products to the exit path (discarded if nothing is linked).
    while (s.out.length && (!ctx.wired("out") || ctx.emit("out", s.out[0]))) s.out.shift();
    s.on = powered(ctx);
    if (!s.on) {
      s.why = "Disabled: no enable signal.";
      return;
    }
    if (s.work < 0) {
      if (s.out.length) {
        s.why = "Waiting: exit path is full.";
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
      for (const t of r.to) s.out.push(ctx.token(t.material, t.amount));
    }
  },
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
    return [
      s.why || "Idle.",
      `Uses ${fmt(r.from)} → makes ${fmt(r.to)} every ${+r.seconds.toFixed(2)} s.`,
      stock.length ? `Has ${stock.join(", ")}.` : "Input buffer empty.",
      `${s.made} craft(s) done.`,
    ];
  },
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
  source,
  itemFilter,
  amountFilter,
  blocker,
  sparkGate,
  splitter,
  waitGate,
  pathCounter,
  storage,
  extractor,
  machine,
  label,
];

export const PARTS: ReadonlyMap<string, PartType<any, any>> = new Map(PART_TYPES.map((t) => [t.id, t]));

export const CATEGORIES = [...new Set(PART_TYPES.map((t) => t.category))];

export type { StorageView, PartStatus };
