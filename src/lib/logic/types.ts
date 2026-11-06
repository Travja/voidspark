// Core types for the logic sandbox. Framework-free: the engine, its tests and the editor all use
// these. See docs/logic-components.md for what each part models and why.

/** Quarter turns clockwise. */
export type Rot = 0 | 1 | 2 | 3;

/** Logic carries on/off signals, item ports carry items along paths, observe links a sensor to a storage. */
export type PortKind = "logic" | "item" | "observe";
export type Side = "l" | "r" | "t" | "b";

export interface PortDef {
  id: string;
  kind: PortKind;
  dir: "in" | "out";
  /** Side of the unrotated part the port sits on, and how far along it (0..1). */
  side: Side;
  at: number;
  /** Short label shown in the inspector ("Set", "Clock", "reject"). */
  label?: string;
  /**
   * Logic ports only. "bit": on a ribbon tile, uses the bit in the part's `bit` setting (Ribbon
   * Writer/Reader). "all": reads all four bits of a ribbon (Four Pixel Display). Otherwise a port
   * on a ribbon uses bit 0, as a plain wire does.
   */
  bus?: "bit" | "all";
}

export type FieldDef =
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; unit?: string; help?: string }
  | { key: string; label: string; type: "bool"; help?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; help?: string }
  /** A game item id, or "" when `allowEmpty`. */
  | { key: string; label: string; type: "item"; allowEmpty: boolean; emptyLabel?: string; help?: string }
  /** A list of game item ids. */
  | { key: string; label: string; type: "items"; max: number; help?: string }
  /** Item counts: [item id, count][]. */
  | { key: string; label: string; type: "stock"; max: number; help?: string }
  /** A recipe id from the game data, or "" for a custom recipe. */
  | { key: string; label: string; type: "recipe"; help?: string }
  | { key: string; label: string; type: "text"; maxLength: number; help?: string };

export type Config = Record<string, unknown>;

export interface Part {
  id: string;
  type: string;
  /** Top-left grid cell of the (rotated) part. */
  x: number;
  y: number;
  rot: Rot;
  cfg: Config;
}

export interface PortRef {
  part: string;
  port: string;
}

/**
 * A path or sensor link between two ports. Item paths always run from an item output (`from`) to
 * an item input (`to`). Observe links run from a sensor's eye (`from`) to a storage (`to`). Logic
 * signals don't use these: they run on wire tiles (`Circuit.cells`).
 */
export interface Wire {
  id: string;
  from: PortRef;
  to: PortRef;
}

export interface CircuitSettings {
  /** Walking speed of item-carrying sparks, in tiles per second. */
  walkSpeed: number;
}

/** A logic tile: plain wire, ribbon (bits 0–3) or bridge (a crossing). */
export type CellKind = "w" | "r" | "b";

export interface Circuit {
  name: string;
  parts: Part[];
  wires: Wire[];
  /**
   * Logic tiles by "x,y": the kind and which neighbours it joins, e.g. "w5" (see grid.ts). A
   * bridge is just "b".
   */
  cells: Record<string, string>;
  /**
   * Path tiles by "x,y": "s" (Stone Path, full speed) or "d" (Dirt Path, 60 %) plus the join
   * mask, e.g. "s5". Sparks walk these, carrying items between buildings.
   */
  paths: Record<string, string>;
  settings: CircuitSettings;
}

/** An item stack carried along a path (one spark's load). */
export interface Token {
  id: number;
  item: string;
  n: number;
}

/** What a path add-on can see of the spark it's dealing with. */
export interface SparkView {
  /** Item carried, or null when empty-handed. */
  item: string | null;
  n: number;
}

/**
 * How an add-on that sits on a path tile treats sparks. Directions are 0 right, 1 down, 2 left,
 * 3 up, in world terms; `facing` is the add-on's own direction (its rotation).
 */
export interface PathRule<C = Config, S = any> {
  /** Whether a spark moving in direction `d` may step onto this tile. False makes it a wall. */
  passable?(ctx: StepCtx<C, S>, spark: SparkView, d: number, facing: number): boolean;
  /** Whether a spark that wants to step onto this tile must wait first (a closed Spark Gate). */
  holds?(ctx: StepCtx<C, S>, spark: SparkView, d: number, facing: number): boolean;
  /** A spark has arrived on the tile moving in direction `d`. Returns seconds it must wait. */
  arrive?(ctx: StepCtx<C, S>, spark: SparkView, d: number, facing: number): number | void;
  /**
   * Exits to try, best first, for a spark on this tile that arrived moving in `d`. Return
   * undefined to use the normal rule (right, straight, left, back).
   */
  exits?(ctx: StepCtx<C, S>, spark: SparkView, d: number, facing: number, open: number[]): number[] | undefined;
  /** The spark actually left in direction `out` (lets a Splitter advance its arrow). */
  leave?(ctx: StepCtx<C, S>, spark: SparkView, d: number, facing: number, out: number): void;
}

/** What a capacity sensor sees of a storage. */
export interface StorageView {
  total: number;
  capacity: number;
  count(item: string): number;
}

/** The view of the simulation a part gets while it steps. */
export interface StepCtx<C = Config, S = Record<string, unknown>> {
  cfg: C;
  state: S;
  /** Seconds per tick. */
  dt: number;
  /** Ticks since the simulation started. */
  tick: number;
  /** Value of the logic network on an input (as of the previous tick). False when unwired. */
  in(port: string): boolean;
  /** The four ribbon bits on a port that reads a whole ribbon (`bus: "all"`). */
  bits(port: string): boolean[];
  /** Whether a logic port touches a wire tile, or an item port faces a path tile. */
  wired(port: string): boolean;
  /** Sets a logic output for the next tick. */
  set(port: string, on: boolean): void;
  /** The storage an observe port is linked to. */
  observe(port: string): StorageView | null;
  /** Wireless channel value as of the previous tick. */
  channel(id: string): boolean;
  /** Turns a wireless channel on for the next tick. */
  send(id: string): void;
  /** A fresh token id. */
  token(item: string, n?: number): Token;
}

/** What the editor draws for a part's live state. */
export interface PartStatus {
  /** Lit / running / passing. */
  active?: boolean;
  /** 0..1 fill bar (storage, machine progress). */
  fill?: number;
  /** Short text on the part (count, timer). */
  badge?: string;
  /** Problem worth flagging (no channel, blocked). */
  warn?: boolean;
}

export type Category = "Inputs" | "Gates" | "Memory" | "Wiring" | "Wireless & display" | "Paths" | "Storage & machines" | "Notes";

export interface PartType<C extends Config = Config, S = any> {
  id: string;
  name: string;
  category: Category;
  /** One-line description for the palette and inspector. */
  blurb: string;
  /** Wiki page title, if the part is a real building. */
  wiki?: string;
  /** Size in grid cells before rotation. */
  w: number;
  h: number;
  ports: PortDef[];
  /** Pairs of logic ports wired straight through the building (a Wire Bridge's two ends). */
  joins?: [string, string][];
  fields: FieldDef[];
  defaults(): C;
  init(cfg: C): S;
  /** Runs once per tick. */
  step?(ctx: StepCtx<C, S>): void;
  /** Offered a token arriving on an item input. Return true to take it. */
  accept?(ctx: StepCtx<C, S>, port: string, token: Token): boolean;
  /**
   * A spark passing an item output asks for up to `max` items (of `item`, if it already carries
   * some); `max` 0 means a whole stack. Return what it gets, or null.
   */
  give?(ctx: StepCtx<C, S>, port: string, max: number, item: string | null): Token | null;
  /** Add-ons placed on a path tile: how they treat sparks. */
  path?: PathRule<C, S>;
  /** Kept for old circuits but not offered in the palette. */
  hidden?: boolean;
  /** A one-off action offered in the inspector (e.g. a player emptying a machine's output). */
  action?: { label: string; run(cfg: C, state: S): void };
  /** Tapped while the simulation runs (levers, buttons, blockers). */
  tap?(cfg: C, state: S): void;
  /** Whether tapping does something right now (so taps don't toggle a lever while editing). */
  tappable?(cfg: C): boolean;
  /** For storage: what observers see. */
  view?(cfg: C, state: S): StorageView;
  status?(cfg: C, state: S): PartStatus;
  /** Inspector lines explaining the current state. */
  describe?(cfg: C, state: S): string[];
}
