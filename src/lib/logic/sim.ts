// Deterministic, tick-based simulator for a circuit. Framework-free.
//
// Each tick (TICK seconds):
//   1. Every part steps once, reading logic networks and wireless channels as they were at the
//      end of the previous tick, and writing its outputs for the next one. So every gate adds one
//      tick of delay and feedback loops can't recurse.
//   2. Sparks walk the path tiles. At each tile a spark first lets the add-on there act (a Wait
//      Gate holds it, a Pressure Sensor fires), then drops its load at a building entrance facing
//      the tile (if the building takes it) or picks up at an exit (if empty-handed), then picks
//      its next tile: right if it can, else straight, else left, else back. Filters and
//      Blockers are walls to sparks that may not pass; Splitters, Crossings and One Ways choose
//      the exit; a closed Spark Gate makes sparks wait in front of it.
//   3. Outputs are combined into networks (any output on → network on) and channels. Networks
//      are the groups of touching wire tiles (see grid.ts); a ribbon tile carries four.
import { portPosition } from "./geometry";
import { buildNets, cellKey, DIRS, joined, kindOf, PATH_SPEED, portCell, type GridNets } from "./grid";
import { PARTS, stackSize, TICK } from "./parts";
import type { Circuit, Part, PartStatus, PartType, PortDef, SparkView, StepCtx, StorageView, Token } from "./types";

/** How far right of a path's middle sparks walk, in tiles. */
export const SPARK_LANE = 0.18;

/** Sparks heading the same way that fit on one path tile at once: they walk in single file. */
export const TILE_CAPACITY = 1;
const JAM_TICKS = 20;

interface RuntimePart {
  part: Part;
  type: PartType;
  state: any;
  /** Logic outputs as of the last tick. */
  outs: Record<string, boolean>;
  next: Record<string, boolean>;
  ctx: StepCtx;
}

export interface Spark {
  id: number;
  /** The Sparks part that placed it. */
  owner: string;
  /** Tile it's on (or leaving). */
  x: number;
  y: number;
  /** Direction it's moving, or last moved. */
  dir: number;
  /** Direction it walked onto its current tile (for drawing the turn it makes there). */
  from: number;
  /** Ticks it has waited for room on the next tile. */
  jam: number;
  /** The lane it's waiting for room in ("tile>heading"), or "". */
  want?: string;
  /** Heading for the next tile. */
  moving: boolean;
  /** Progress toward the next tile, 0..1. */
  p: number;
  load: Token | null;
  /** Items per trip; 0 = a whole stack. */
  carry: number;
  /** Ticks left to wait (Wait Gate). */
  wait: number;
  /** Why it isn't moving, for the inspector ("waiting at a Spark Gate"). */
  stuck: string;
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
 * The runtime state of a previous simulation, so a rebuilt one (after an edit) carries on where
 * it was. Parts are matched by id and type; sparks by the Sparks part that owns them.
 */
export interface SimSnapshot {
  time: number;
  tick: number;
  states: Map<string, { type: string; state: unknown; outs: Record<string, boolean> }>;
  sparks: Spark[];
  channels: Set<string>;
}

export class Sim {
  readonly parts: RuntimePart[] = [];
  readonly byId = new Map<string, number>();
  readonly sparks: Spark[] = [];
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
  private observed = new Map<string, number>();
  private channels = new Set<string>();
  private nextChannels = new Set<string>();
  private tokenId = 1;
  private sparkId = 1;

  private paths: Record<string, string>;
  /** Path tile -> the add-on part sitting on it. */
  private addOn = new Map<string, number>();
  /** Path tile -> building entrances and exits facing it. */
  /** Item ports facing each path tile, with the direction from the tile to the building. */
  private portsAt = new Map<string, { pi: number; port: PortDef; side: number }[]>();
  /** "part.port" for item ports that face a path tile. */
  private itemOnPath = new Set<string>();

  constructor(circuit: Circuit, prev?: SimSnapshot) {
    this.walkSpeed = circuit.settings.walkSpeed;
    this.paths = circuit.paths ?? {};
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
      rp.ctx = this.makeCtx(rp);
      this.parts.push(rp);
      if (type.path) this.addOn.set(cellKey(part.x, part.y), i);
      for (const port of type.ports) {
        if (port.kind !== "item") continue;
        const c = portCell(part, port);
        const k = cellKey(c.x, c.y);
        if (!this.paths[k]) continue;
        this.itemOnPath.add(`${part.id}.${port.id}`);
        const side = DIRS.findIndex((v) => v.x === -c.n.x && v.y === -c.n.y);
        this.portsAt.set(k, [...(this.portsAt.get(k) ?? []), { pi: i, port, side }]);
      }
    });

    // Sensor links (a Capacity Sensor's eye to a storage).
    for (const w of circuit.wires) {
      const a = this.byId.get(w.from.part);
      const b = this.byId.get(w.to.part);
      if (a === undefined || b === undefined) continue;
      const pa = findPort(this.parts[a].part.type, w.from.port);
      const pb = findPort(this.parts[b].part.type, w.to.port);
      if (pa?.kind === "observe" && pb?.kind === "observe" && pa.dir === "out") this.observed.set(`${w.from.part}.${w.from.port}`, b);
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
    if (prev) {
      this.time = prev.time;
      this.tick = prev.tick;
      this.channels = new Set(prev.channels);
    }
    this.placeSparks(prev?.sparks ?? []);
    this.computeNets();
  }

  /** Keeps sparks from before an edit where they still fit, and adds any the Sparks parts ask for. */
  private placeSparks(old: Spark[]) {
    for (const rp of this.parts) {
      if (rp.part.type !== "sparks") continue;
      const { id, x, y, rot } = rp.part;
      const count = Number(rp.part.cfg.count) || 0;
      const carry = Number(rp.part.cfg.carry) || 0;
      const home = cellKey(x, y);
      const mine = old.filter((s) => s.owner === id && this.paths[cellKey(s.x, s.y)]).slice(0, count);
      for (const s of mine) {
        const keep = { ...s, carry };
        // A spark whose next tile has gone stops where it is.
        if (keep.moving && !this.paths[cellKey(s.x + DIRS[s.dir].x, s.y + DIRS[s.dir].y)]) {
          keep.moving = false;
          keep.p = 0;
        }
        this.sparks.push(keep);
        this.sparkId = Math.max(this.sparkId, s.id + 1);
        if (s.load) this.tokenId = Math.max(this.tokenId, s.load.id + 1);
      }
      if (!this.paths[home]) continue;
      for (let k = mine.length; k < count; k++) {
        this.sparks.push({ id: this.sparkId++, owner: id, x, y, dir: rot, from: rot, jam: 0, moving: false, p: 0, load: null, carry, wait: 0, stuck: "" });
      }
    }
  }

  private makeCtx(rp: RuntimePart): StepCtx {
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
      wired: (port) => sim.netOf.has(`${id}.${port}`) || sim.itemOnPath.has(`${id}.${port}`) || sim.observed.has(`${id}.${port}`),
      set: (port, on) => void (rp.next[port] = on),
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

  // --- sparks ---------------------------------------------------------------------------------

  private view(s: Spark): SparkView {
    return { item: s.load?.item ?? null, n: s.load?.n ?? 0 };
  }

  private addOnAt(k: string) {
    const i = this.addOn.get(k);
    return i === undefined ? undefined : this.parts[i];
  }

  /** The tile a spark counts as occupying: the one it's mostly on. */
  private tileOf(s: Spark) {
    return s.moving && s.p >= 0.5 ? cellKey(s.x + DIRS[s.dir].x, s.y + DIRS[s.dir].y) : cellKey(s.x, s.y);
  }

  /**
   * The direction a spark on its tile takes next, or -1 to stay put. Right, straight, left,
   * back, skipping tiles it can't step onto, unless the add-on here chooses the exit.
   */
  private choose(s: Spark): number {
    const here = cellKey(s.x, s.y);
    const sv = this.view(s);
    const open: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nk = cellKey(s.x + DIRS[d].x, s.y + DIRS[d].y);
      if (!joined(this.paths, here, nk, d)) continue;
      const a = this.addOnAt(nk);
      if (a?.type.path?.passable && !a.type.path.passable(a.ctx, sv, d, a.part.rot)) continue;
      open.push(d);
    }
    const d = s.dir;
    const own = this.addOnAt(here);
    const order = own?.type.path?.exits?.(own.ctx, sv, d, own.part.rot, open) ?? [(d + 1) % 4, d, (d + 3) % 4, (d + 2) % 4];
    const pick = order.find((x) => open.includes(x));
    if (pick === undefined) {
      s.stuck = open.length ? "" : "No path it may take from here.";
      return -1;
    }
    const nk = cellKey(s.x + DIRS[pick].x, s.y + DIRS[pick].y);
    const next = this.addOnAt(nk);
    if (next?.type.path?.holds?.(next.ctx, sv, pick, next.part.rot)) {
      s.stuck = `Waiting at a ${next.type.name}.`;
      return -1;
    }
    return pick;
  }

  /** A spark has reached the middle of its tile. */
  private arrive(s: Spark) {
    const k = cellKey(s.x, s.y);
    const sv = this.view(s);
    const a = this.addOnAt(k);
    const wait = a?.type.path?.arrive?.(a.ctx, sv, s.dir, a.part.rot);
    if (wait) s.wait = Math.round(wait / TICK);
    // Sparks only deal with buildings on their right-hand side, as in the game. A building at the
    // end of the path, straight ahead, counts too when the spark has to turn back or turn left
    // there: it passes on the spark's right as it swings round.
    const right = (s.dir + 1) % 4;
    const canTurnRight = joined(this.paths, k, cellKey(s.x + DIRS[right].x, s.y + DIRS[right].y), right);
    const ports = this.portsAt.get(k)?.filter((p) => p.side === right || (p.side === s.dir && !canTurnRight));
    if (!ports?.length) return;
    // Drop off first (it may free the spark to pick something up at the next exit).
    for (const { pi, port } of ports) {
      if (port.dir !== "in" || !s.load) continue;
      const b = this.parts[pi];
      if (b.type.accept?.(b.ctx, port.id, s.load)) s.load = null;
    }
    for (const { pi, port } of ports) {
      if (port.dir !== "out") continue;
      const b = this.parts[pi];
      if (!b.type.give) continue;
      if (!s.load) {
        const t = b.type.give(b.ctx, port.id, s.carry, null);
        if (t) s.load = t;
      } else {
        const room = (s.carry || stackSize(s.load.item)) - s.load.n;
        if (room <= 0) continue;
        const t = b.type.give(b.ctx, port.id, room, s.load.item);
        if (t) s.load = { ...s.load, n: s.load.n + t.n };
      }
    }
  }

  private moveSparks() {
    const occupied = new Map<string, number>();
    // A walking spark has already claimed the tile it's walking to and given up the one it left.
    // Room is counted per heading, so sparks going opposite ways pass each other instead of
    // locking up head to head.
    const claim = (s: Spark) =>
      (s.moving ? cellKey(s.x + DIRS[s.dir].x, s.y + DIRS[s.dir].y) : cellKey(s.x, s.y)) + ">" + s.dir;
    const holder = new Map<string, Spark>();
    for (const s of this.sparks) {
      const k = claim(s);
      occupied.set(k, (occupied.get(k) ?? 0) + 1);
      holder.set(k, s);
    }
    // Whether the sparks blocking s, each waiting on the next, lead back round to s: a deadlock
    // no one can break by waiting. A queue behind a closed gate ends at the gate instead.
    const deadlocked = (s: Spark, target: string) => {
      let b = holder.get(target);
      for (let n = 0; b && b.want && n < this.sparks.length; n++) {
        if (b === s) return true;
        b = holder.get(b.want);
      }
      return b === s;
    };
    for (const s of this.sparks) {
      if (s.wait > 0) {
        s.wait--;
        s.stuck = s.wait > 0 ? "Waiting at a Wait Gate." : "";
        continue;
      }
      let budget = 1;
      // A spark can arrive and set off again within one tick, so it never pauses on a tile.
      for (let guard = 0; guard < 3 && budget > 1e-9; guard++) {
        if (!s.moving) {
          const d = this.choose(s);
          if (d < 0) break;
          const target = cellKey(s.x + DIRS[d].x, s.y + DIRS[d].y) + ">" + d;
          // If the sparks in the way are themselves waiting, round in a circle back to this one,
          // it squeezes past after a second, so a path crowded with more sparks than fit in
          // single file never locks up for good.
          if ((occupied.get(target) ?? 0) >= TILE_CAPACITY && !(s.jam >= JAM_TICKS && deadlocked(s, target))) {
            s.jam++;
            s.want = target;
            // It can't go yet, but it can already turn to face the new way on its own tile (a
            // tile has a lane for each heading), freeing the lane it came in on. Without this,
            // sparks turning back at both ends of a short, busy path can block each other for good.
            const lane = cellKey(s.x, s.y) + ">" + d;
            if (d !== s.dir && (occupied.get(lane) ?? 0) < TILE_CAPACITY) {
              const was = cellKey(s.x, s.y) + ">" + s.dir;
              occupied.set(was, Math.max(0, (occupied.get(was) ?? 1) - 1));
              occupied.set(lane, (occupied.get(lane) ?? 0) + 1);
              s.from = s.dir;
              s.dir = d;
            }
            s.stuck = "Waiting: the next tile is full of sparks.";
            break;
          }
          const own = this.addOnAt(cellKey(s.x, s.y));
          s.jam = 0;
          s.want = "";
          own?.type.path?.leave?.(own.ctx, this.view(s), s.dir, own.part.rot, d);
          const here = cellKey(s.x, s.y) + ">" + s.dir;
          s.from = s.dir;
          s.dir = d;
          s.moving = true;
          s.p = 0;
          s.stuck = "";
          occupied.set(here, Math.max(0, (occupied.get(here) ?? 1) - 1));
          occupied.set(target, (occupied.get(target) ?? 0) + 1);
        }
        const nx = s.x + DIRS[s.dir].x;
        const ny = s.y + DIRS[s.dir].y;
        const speed = (PATH_SPEED[kindOf(this.paths[cellKey(s.x, s.y)]) ?? "s"] + PATH_SPEED[kindOf(this.paths[cellKey(nx, ny)]) ?? "s"]) / 2;
        const step = this.walkSpeed * speed * TICK * budget;
        if (s.p + step < 1) {
          s.p += step;
          budget = 0;
          break;
        }
        budget *= 1 - (1 - s.p) / step;
        s.x = nx;
        s.y = ny;
        s.moving = false;
        s.p = 0;
        this.arrive(s);
        if (s.wait > 0) break;
      }
    }
  }

  /** Advances one tick. */
  step() {
    this.nextChannels = new Set();
    for (const rp of this.parts) rp.type.step?.(rp.ctx);
    this.moveSparks();
    for (const rp of this.parts) {
      rp.outs = rp.next;
      rp.next = { ...rp.outs };
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
    return { time: this.time, tick: this.tick, states, sparks: this.sparks.map((s) => ({ ...s })), channels: this.channels };
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

  /** Whether an item entrance or exit faces a path tile. */
  portOnPath(partId: string, port: string): boolean {
    return this.itemOnPath.has(`${partId}.${port}`);
  }

  netOn(n: number): boolean {
    return n >= 0 && this.netValue[n] === 1;
  }

  /** Signal on each network a tile carries (one, or four for a ribbon). */
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

  /**
   * Where a spark is drawn. Sparks keep to the right-hand side of a path, as in the game, so ones
   * going opposite ways pass side by side, and a spark turning back at a dead end swings round in
   * a loop rather than reversing on the spot. Turns are drawn as curves in the first half of the
   * step off a tile (the half still on that tile); the second half runs straight into the next.
   */
  sparkPosition(s: Spark): { x: number; y: number } {
    const L = SPARK_LANE;
    const cx = s.x + 0.5;
    const cy = s.y + 0.5;
    const d = DIRS[s.dir];
    const right = (v: { x: number; y: number }) => ({ x: -v.y, y: v.x });
    const rd = right(d);
    if (!s.moving || s.p >= 0.5 || s.from === s.dir) {
      const k = s.moving ? s.p : 0;
      return { x: cx + d.x * k + rd.x * L, y: cy + d.y * k + rd.y * L };
    }
    // Turning on this tile: a cubic from the lane at the middle of the tile (heading the way it
    // came in) to the lane at the edge it leaves by (heading the new way).
    const e = DIRS[s.from];
    const re = right(e);
    const p0 = { x: cx + re.x * L, y: cy + re.y * L };
    const p3 = { x: cx + d.x * 0.5 + rd.x * L, y: cy + d.y * 0.5 + rd.y * L };
    // Turning back swings wide; turning left (the outer lane) sweeps round; turning right (the
    // inner lane, whose corner is behind the tile's middle) cuts straight across.
    const back = s.from === (s.dir + 2) % 4;
    const rightTurn = s.dir === (s.from + 1) % 4;
    const a = back ? 0.26 : rightTurn ? 0 : 0.22;
    const p1 = { x: p0.x + e.x * a, y: p0.y + e.y * a };
    const p2 = { x: p3.x - d.x * (rightTurn ? 0.12 : a), y: p3.y - d.y * (rightTurn ? 0.12 : a) };
    const t = s.p / 0.5;
    const u = 1 - t;
    const b = (k0: number, k1: number, k2: number, k3: number) => u * u * u * k0 + 3 * u * u * t * k1 + 3 * u * t * t * k2 + t * t * t * k3;
    return { x: b(p0.x, p1.x, p2.x, p3.x), y: b(p0.y, p1.y, p2.y, p3.y) };
  }

  state<S = any>(partId: string): S | undefined {
    return this.rp(partId)?.state as S | undefined;
  }

  status(partId: string): PartStatus {
    const rp = this.rp(partId);
    const st = rp?.type.status?.(rp.part.cfg, rp.state) ?? {};
    // Sparks on a tile with no path can't go anywhere.
    if (rp?.part.type === "sparks" && !this.paths[cellKey(rp.part.x, rp.part.y)]) return { ...st, warn: true };
    return st;
  }

  describe(partId: string): string[] {
    const rp = this.rp(partId);
    const lines = rp?.type.describe?.(rp.part.cfg, rp.state) ?? [];
    if (rp?.part.type === "sparks") {
      const mine = this.sparks.filter((s) => s.owner === partId);
      if (!this.paths[cellKey(rp.part.x, rp.part.y)]) return ["Not on a path tile, so no sparks are placed. Move it onto a path.", ...lines];
      const loaded = mine.filter((s) => s.load);
      const stuck = mine.filter((s) => s.stuck).map((s) => s.stuck);
      return [
        `${mine.length} spark(s) walking; ${loaded.length} carrying ${loaded.map((s) => `${s.load!.n} ${s.load!.item}`).join(", ") || "nothing"}.`,
        ...(stuck.length ? [`Waiting: ${[...new Set(stuck)].join(" ")}`] : []),
        ...lines,
      ];
    }
    return lines;
  }

  storage(partId: string): StorageView | null {
    const rp = this.rp(partId);
    return rp?.type.view ? rp.type.view(rp.part.cfg, rp.state) : null;
  }

  channelOn(ch: string): boolean {
    return this.channels.has(ch);
  }

  /** Sparks on a path tile right now. */
  sparksOn(key: string): Spark[] {
    return this.sparks.filter((s) => this.tileOf(s) === key);
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
}
