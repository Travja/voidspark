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
 * A connection between two ports. Logic wires are undirected (everything joined forms one
 * network). Item paths always run from an item output (`from`) to an item input (`to`). Observe
 * links run from a sensor's eye (`from`) to a storage (`to`).
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

export interface Circuit {
  name: string;
  parts: Part[];
  wires: Wire[];
  settings: CircuitSettings;
}

/** An item stack carried along a path (one spark's load). */
export interface Token {
  id: number;
  item: string;
  n: number;
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
  /** Whether a logic port is wired to anything (or an item port linked to a path). */
  wired(port: string): boolean;
  /** Sets a logic output for the next tick. */
  set(port: string, on: boolean): void;
  /** Pushes a token onto the path leaving an item output. False if there is no path or no room. */
  emit(port: string, token: Token): boolean;
  /** Whether the path leaving an item output could take a token now. */
  hasRoom(port: string): boolean;
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

export type Category = "Inputs" | "Gates" | "Memory" | "Wireless & display" | "Paths" | "Storage & machines" | "Notes";

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
  fields: FieldDef[];
  defaults(): C;
  init(cfg: C): S;
  /** Runs once per tick. */
  step?(ctx: StepCtx<C, S>): void;
  /** Offered a token arriving on an item input. Return true to take it. */
  accept?(ctx: StepCtx<C, S>, port: string, token: Token): boolean;
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
