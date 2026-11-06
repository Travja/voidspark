// Deterministic, tick-based simulator for a circuit. Framework-free.
//
// Each tick (TICK seconds):
//   1. Every part steps once, reading logic networks and wireless channels as they were at the
//      end of the previous tick, and writing its outputs for the next one. So every gate adds one
//      tick of delay and feedback loops can't recurse.
//   2. Items move along paths. A token that reaches the end of a path is offered to the part at
//      the other end, and waits there until that part takes it.
//   3. Outputs are combined into networks (any output on → network on) and channels. Networks
//      are the groups of touching wire tiles (see grid.ts); a ribbon tile carries four.
import { curveLength, portPosition, wireCurve, type Point } from "./geometry";
import { buildNets, type GridNets } from "./grid";
import { PARTS, TICK } from "./parts";
import type { Circuit, Part, PartStatus, PartType, PortDef, StepCtx, StorageView, Token } from "./types";

/** Minimum gap between sparks on a path, in tiles. */
export const SPACING = 0.5;

export interface PathToken {
  token: Token;
  /** Distance travelled along the path, in tiles. */
  pos: number;
}

export interface PathLink {
  wireId: string;
  from: number;
  fromPort: string;
  to: number;
  toPort: string;
  length: number;
  curve: [Point, Point, Point, Point];
  tokens: PathToken[];
}

interface RuntimePart {
  part: Part;
  type: PartType;
  state: any;
  /** Logic outputs as of the last tick. */
  outs: Record<string, boolean>;
  next: Record<string, boolean>;
  ctx: StepCtx;
}

export function portDefs(type: string): PortDef[] {
  return PARTS.get(type)?.ports ?? [];
}

export function findPort(type: string, port: string): PortDef | undefined {
  return portDefs(type).find((p) => p.id === port);
}

/** Port position and direction for a part in the circuit. */
export function placedPort(part: Part, port: string) {
  const type = PARTS.get(part.type)!;
  return portPosition(part, type.w, type.h, findPort(part.type, port)!);
}

/**
 * Pulls the runtime state out of a previous simulation so a rebuilt one (after an edit) carries
 * on where it was. Parts are matched by id and type.
 */
export interface SimSnapshot {
  time: number;
  tick: number;
  states: Map<string, { type: string; state: unknown; outs: Record<string, boolean> }>;
  tokens: Map<string, PathToken[]>;
  channels: Set<string>;
}

export class Sim {
  readonly parts: RuntimePart[] = [];
  readonly paths: PathLink[] = [];
  readonly byId = new Map<string, number>();
  tick = 0;
  time = 0;
  walkSpeed: number;

  /** Logic networks formed by the wire tiles. */
  readonly grid: GridNets;
  /** port key ("part.port") -> logic network indexes (one per ribbon bit for bus ports) */
  private netOf = new Map<string, number[]>();
  /** Per network: the output ports driving it, as [part index, port id]. */
  private drivers: [number, string][][] = [];
  private netValue: Uint8Array = new Uint8Array(0);
  private pathOut = new Map<string, PathLink>();
  private itemLinked = new Set<string>();
  private observed = new Map<string, number>();
  private channels = new Set<string>();
  private nextChannels = new Set<string>();
  private tokenId = 1;

  constructor(circuit: Circuit, prev?: SimSnapshot) {
    this.walkSpeed = circuit.settings.walkSpeed;
    circuit.parts.forEach((part) => {
      const type = PARTS.get(part.type);
      if (!type) return;
      const i = this.parts.length;
      this.byId.set(part.id, i);
      const old = prev?.states.get(part.id);
      const keep = old && old.type === part.type;
      const outs: Record<string, boolean> = {};
      for (const p of type.ports) if (p.kind === "logic" && p.dir === "out") outs[p.id] = keep ? !!old.outs[p.id] : false;
      const rp: RuntimePart = {
        part,
        type,
        state: keep ? old.state : type.init(part.cfg),
        outs,
        next: { ...outs },
        ctx: undefined as unknown as StepCtx,
      };
      rp.ctx = this.makeCtx(i, rp);
      this.parts.push(rp);
    });

    for (const w of circuit.wires) {
      const a = this.byId.get(w.from.part);
      const b = this.byId.get(w.to.part);
      if (a === undefined || b === undefined) continue;
      const pa = findPort(this.parts[a].part.type, w.from.port);
      const pb = findPort(this.parts[b].part.type, w.to.port);
      if (!pa || !pb || pa.kind !== pb.kind) continue;
      const ka = `${w.from.part}.${w.from.port}`;
      const kb = `${w.to.part}.${w.to.port}`;
      if (pa.kind === "item") {
        if (pa.dir !== "out" || pb.dir !== "in" || this.pathOut.has(ka)) continue;
        const ca = placedPort(this.parts[a].part, pa.id);
        const cb = placedPort(this.parts[b].part, pb.id);
        const curve = wireCurve(ca, cb);
        const link: PathLink = {
          wireId: w.id,
          from: a,
          fromPort: pa.id,
          to: b,
          toPort: pb.id,
          length: Math.max(SPACING, curveLength(curve)),
          curve,
          tokens: [],
        };
        const kept = prev?.tokens.get(w.id);
        if (kept) link.tokens = kept.map((t) => ({ token: t.token, pos: Math.min(t.pos, link.length) }));
        this.paths.push(link);
        this.pathOut.set(ka, link);
        this.itemLinked.add(ka).add(kb);
      } else if (pa.dir === "out" && pb.dir === "in") {
        this.observed.set(ka, b);
      }
    }
    this.grid = buildNets(circuit);
    this.drivers = Array.from({ length: this.grid.count }, () => []);
    for (const att of this.grid.ports) {
      this.netOf.set(`${att.part}.${att.port}`, att.nets);
      if (att.dir !== "out") continue;
      const pi = this.byId.get(att.part);
      if (pi === undefined) continue;
      for (const n of att.nets) if (n >= 0) this.drivers[n].push([pi, att.port]);
    }
    this.netValue = new Uint8Array(this.drivers.length);
    for (const link of this.paths) for (const t of link.tokens) this.tokenId = Math.max(this.tokenId, t.token.id + 1);
    if (prev) {
      this.time = prev.time;
      this.tick = prev.tick;
      this.channels = new Set(prev.channels);
    }
    this.computeNets();
  }

  private makeCtx(i: number, rp: RuntimePart): StepCtx {
    const id = rp.part.id;
    const sim = this;
    return {
      cfg: rp.part.cfg,
      get state() {
        return rp.state;
      },
      set state(v) {
        rp.state = v;
      },
      dt: TICK,
      get tick() {
        return sim.tick;
      },
      in: (port) => {
        const n = sim.netOf.get(`${id}.${port}`)?.[0];
        return n !== undefined && n >= 0 && sim.netValue[n] === 1;
      },
      bits: (port) => {
        const nets = sim.netOf.get(`${id}.${port}`) ?? [];
        return [0, 1, 2, 3].map((b) => (nets[b] ?? -1) >= 0 && sim.netValue[nets[b]] === 1);
      },
      wired: (port) => sim.netOf.has(`${id}.${port}`) || sim.itemLinked.has(`${id}.${port}`) || sim.observed.has(`${id}.${port}`),
      set: (port, on) => void (rp.next[port] = on),
      emit: (port, token) => {
        const link = sim.pathOut.get(`${id}.${port}`);
        if (!link || !sim.room(link)) return false;
        link.tokens.push({ token, pos: 0 });
        return true;
      },
      hasRoom: (port) => {
        const link = sim.pathOut.get(`${id}.${port}`);
        return !!link && sim.room(link);
      },
      backedUp: (port) => {
        const link = sim.pathOut.get(`${id}.${port}`);
        if (!link) return true;
        const front = link.tokens[0];
        return !!front && front.pos >= link.length - 1e-9 && !sim.room(link);
      },
      observe: (port) => {
        const j = sim.observed.get(`${id}.${port}`);
        if (j === undefined) return null;
        const target = sim.parts[j];
        return target.type.view ? target.type.view(target.part.cfg, target.state) : null;
      },
      channel: (ch) => sim.channels.has(ch),
      send: (ch) => void sim.nextChannels.add(ch),
      token: (item, n = 1) => ({ id: sim.tokenId++, item, n }),
    } as StepCtx;
    void i;
  }

  private room(link: PathLink): boolean {
    const last = link.tokens[link.tokens.length - 1];
    return !last || last.pos >= Math.min(SPACING, link.length) - 1e-9;
  }

  private computeNets() {
    for (let n = 0; n < this.drivers.length; n++) {
      let on = 0;
      for (const [pi, port] of this.drivers[n]) {
        if (this.parts[pi].outs[port]) {
          on = 1;
          break;
        }
      }
      this.netValue[n] = on;
    }
  }

  /** Advances one tick. */
  step() {
    this.nextChannels = new Set();
    for (const rp of this.parts) rp.type.step?.(rp.ctx);

    const move = this.walkSpeed * TICK;
    for (const link of this.paths) {
      const toks = link.tokens;
      for (let k = 0; k < toks.length; k++) {
        const limit = k === 0 ? link.length : toks[k - 1].pos - SPACING;
        toks[k].pos = Math.max(toks[k].pos, Math.min(toks[k].pos + move, limit));
      }
      if (toks.length && toks[0].pos >= link.length - 1e-9) {
        const dest = this.parts[link.to];
        if (dest.type.accept?.(dest.ctx, link.toPort, toks[0].token)) toks.shift();
      }
    }

    for (const rp of this.parts) {
      const o = rp.outs;
      rp.outs = rp.next;
      rp.next = { ...rp.outs };
      void o;
    }
    this.channels = this.nextChannels;
    this.computeNets();
    this.tick++;
    this.time = this.tick * TICK;
  }

  run(seconds: number) {
    const n = Math.round(seconds / TICK);
    for (let i = 0; i < n; i++) this.step();
  }

  snapshot(): SimSnapshot {
    const states = new Map<string, { type: string; state: unknown; outs: Record<string, boolean> }>();
    for (const rp of this.parts) states.set(rp.part.id, { type: rp.part.type, state: rp.state, outs: rp.outs });
    const tokens = new Map<string, PathToken[]>();
    for (const l of this.paths) tokens.set(l.wireId, l.tokens);
    return { time: this.time, tick: this.tick, states, tokens, channels: this.channels };
  }

  // --- queries for the editor and tests ---------------------------------------------------------

  private rp(id: string): RuntimePart | undefined {
    const i = this.byId.get(id);
    return i === undefined ? undefined : this.parts[i];
  }

  /** Value of a logic port: an output's own value, or the network an input sits on. */
  port(partId: string, port: string): boolean {
    const rp = this.rp(partId);
    if (!rp) return false;
    const nets = this.netOf.get(`${partId}.${port}`);
    if (nets?.length) return nets.some((n) => n >= 0 && this.netValue[n] === 1);
    return !!rp.outs[port];
  }

  /** Whether a logic port touches a wire tile. */
  portWired(partId: string, port: string): boolean {
    return this.netOf.has(`${partId}.${port}`);
  }

  netOn(n: number): boolean {
    return n >= 0 && this.netValue[n] === 1;
  }

  /** Signal on each network a tile carries (one, four for a ribbon, two for a bridge). */
  cellOn(key: string): boolean[] {
    return (this.grid.cellNets.get(key) ?? []).map((n) => this.netValue[n] === 1);
  }

  /** The ports on a network: who drives it and who listens. */
  netPorts(n: number): { part: string; port: string; dir: "in" | "out"; bit: number }[] {
    const out: { part: string; port: string; dir: "in" | "out"; bit: number }[] = [];
    for (const a of this.grid.ports) {
      const bit = a.nets.indexOf(n);
      if (bit >= 0) out.push({ part: a.part, port: a.port, dir: a.dir, bit });
    }
    return out;
  }

  state<S = any>(partId: string): S | undefined {
    return this.rp(partId)?.state as S | undefined;
  }

  status(partId: string): PartStatus {
    const rp = this.rp(partId);
    return rp?.type.status?.(rp.part.cfg, rp.state) ?? {};
  }

  describe(partId: string): string[] {
    const rp = this.rp(partId);
    return rp?.type.describe?.(rp.part.cfg, rp.state) ?? [];
  }

  storage(partId: string): StorageView | null {
    const rp = this.rp(partId);
    return rp?.type.view ? rp.type.view(rp.part.cfg, rp.state) : null;
  }

  channelOn(ch: string): boolean {
    return this.channels.has(ch);
  }

  /** Taps an interactive part (lever, button, blocker). Returns true if it reacted. */
  tap(partId: string): boolean {
    const rp = this.rp(partId);
    if (!rp?.type.tap || rp.type.tappable?.(rp.part.cfg) === false) return false;
    rp.type.tap(rp.part.cfg, rp.state);
    return true;
  }

  /** Runs a part's inspector action (e.g. "Take output"). Returns true if it has one. */
  act(partId: string): boolean {
    const rp = this.rp(partId);
    if (!rp?.type.action) return false;
    rp.type.action.run(rp.part.cfg, rp.state);
    return true;
  }

  /** Items currently on paths. */
  tokenCount(): number {
    return this.paths.reduce((n, l) => n + l.tokens.length, 0);
  }
}
