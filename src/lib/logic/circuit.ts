// Circuit model helpers: ids, config sanitising, validation, connections and share links.
// Everything that comes from storage or a link goes through `validateCircuit`.
import { base64UrlToBytes, bytesToBase64Url } from "../base64url";
import { GAME } from "../engine/data";
import { footprint } from "./geometry";
import { applyRoute, buildNets, cellKey, routeWire, VALID_TILE } from "./grid";
import { PARTS } from "./parts";
import { findPort } from "./sim";
import type { Circuit, Config, FieldDef, Part, PortRef, Rot, Wire } from "./types";

export const LIMITS = { parts: 2000, wires: 4000, cells: 40000, coord: 5000 };

let seq = 1;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyCircuit = (name = "New circuit"): Circuit => ({ name, parts: [], wires: [], cells: {}, settings: { walkSpeed: 2 } });

const isItem = (v: unknown): v is string => typeof v === "string" && GAME.materials.has(v);

function sanitizeField(f: FieldDef, v: unknown, fallback: unknown): unknown {
  switch (f.type) {
    case "number": {
      const n = typeof v === "number" ? v : Number.NaN;
      if (!Number.isFinite(n)) return fallback;
      const clamped = Math.min(f.max, Math.max(f.min, n));
      return +(Math.round(clamped / f.step) * f.step).toFixed(4);
    }
    case "bool":
      return typeof v === "boolean" ? v : fallback;
    case "select":
      return f.options.some((o) => o.value === v) ? v : fallback;
    case "item":
      return v === "" && f.allowEmpty ? "" : isItem(v) ? v : fallback;
    case "items":
      return Array.isArray(v) ? v.filter(isItem).slice(0, f.max) : fallback;
    case "stock":
      return Array.isArray(v)
        ? v
            .filter((e): e is [string, number] => Array.isArray(e) && isItem(e[0]) && Number.isFinite(e[1]) && e[1] > 0)
            .slice(0, f.max)
            .map(([i, n]) => [i, Math.min(9999, Math.round(n))])
        : fallback;
    case "recipe":
      return v === "" || (typeof v === "string" && GAME.recipesById.has(v)) ? v : fallback;
    case "text":
      return typeof v === "string" ? v.slice(0, f.maxLength) : fallback;
  }
}

/** A complete, valid config for a part type: known keys only, every value checked. */
export function sanitizeConfig(type: string, raw: unknown): Config {
  const t = PARTS.get(type);
  if (!t) return {};
  const defaults = t.defaults();
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Config = {};
  for (const f of t.fields) out[f.key] = sanitizeField(f, src[f.key], defaults[f.key]);
  return out;
}

/** Only the settings that differ from the type's defaults (for compact share links). */
export function configDiff(type: string, cfg: Config): Config | undefined {
  const t = PARTS.get(type);
  if (!t) return undefined;
  const d = t.defaults();
  const diff: Config = {};
  for (const f of t.fields) if (JSON.stringify(cfg[f.key]) !== JSON.stringify(d[f.key])) diff[f.key] = cfg[f.key];
  return Object.keys(diff).length ? diff : undefined;
}

export function makePart(type: string, x: number, y: number, rot: Rot = 0, cfg?: Config): Part {
  return { id: newId("c"), type, x, y, rot, cfg: sanitizeConfig(type, cfg ?? PARTS.get(type)?.defaults()) };
}

export function partSize(p: Pick<Part, "type" | "rot">) {
  const t = PARTS.get(p.type)!;
  return footprint(t.w, t.h, p.rot);
}

/** Whether a part of `type` at (x, y) would overlap another part (ignoring `except`). */
export function overlaps(c: Circuit, type: string, x: number, y: number, rot: Rot, except?: Set<string>): boolean {
  const s = partSize({ type, rot });
  return c.parts.some((p) => {
    if (except?.has(p.id)) return false;
    const o = partSize(p);
    return x < p.x + o.w && p.x < x + s.w && y < p.y + o.h && p.y < y + s.h;
  });
}

/** Nearest free spot to (x, y) for a new part, searching outward in rings. */
export function freeSpot(c: Circuit, type: string, x: number, y: number, rot: Rot = 0): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!overlaps(c, type, x + dx, y + dy, rot)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return { x, y };
}

// --- connections -------------------------------------------------------------------------------

const portOf = (c: Pick<Circuit, "parts">, r: PortRef) => {
  const part = c.parts.find((p) => p.id === r.part);
  return part ? findPort(part.type, r.port) : undefined;
};

/**
 * Turns two tapped ports into a wire, oriented the right way round, or explains why they can't be
 * connected.
 */
export function planWire(c: Circuit, a: PortRef, b: PortRef): { wire: Omit<Wire, "id"> } | { error: string } {
  const pa = portOf(c, a);
  const pb = portOf(c, b);
  if (!pa || !pb) return { error: "Port not found." };
  if (a.part === b.part && a.port === b.port) return { error: "That's the same port." };
  if (pa.kind !== pb.kind) {
    const name = { logic: "a logic port", item: "a path port", observe: "a sensor/storage link" };
    return { error: `Can't connect ${name[pa.kind]} to ${name[pb.kind]}.` };
  }
  if (pa.kind === "logic") return { error: "Logic runs on wire tiles: use connectLogic." };
  let from = a;
  let to = b;
  if (pa.dir === pb.dir) {
    return { error: pa.kind === "item" ? "Paths run from an exit (out) to an entrance (in)." : "Link a Capacity Sensor's eye to a storage." };
  }
  if (pa.dir === "in") [from, to] = [b, a];
  const taken = c.wires.find((w) => w.from.part === from.part && w.from.port === from.port);
  if (taken) return { error: pa.kind === "item" ? "That exit already has a path. Use a Splitter to branch." : "That sensor already watches a storage." };
  const dup = c.wires.some(
    (w) =>
      (w.from.part === from.part && w.from.port === from.port && w.to.part === to.part && w.to.port === to.port) ||
      (w.from.part === to.part && w.from.port === to.port && w.to.part === from.part && w.to.port === from.port),
  );
  if (dup) return { error: "Already connected." };
  return { wire: { from: { ...from }, to: { ...to } } };
}

/**
 * Connects two logic ports by laying wire tiles on the grid (with bridges where it must cross
 * another wire). Returns an error message, or null when connected.
 */
export function connectLogic(c: Pick<Circuit, "parts" | "cells">, a: PortRef, b: PortRef): string | null {
  const pa = portOf(c, a);
  const pb = portOf(c, b);
  if (!pa || !pb) return "Port not found.";
  if (pa.kind !== "logic" || pb.kind !== "logic") return "Only logic ports connect with wire tiles.";
  if (a.part === b.part && a.port === b.port) return "That's the same port.";
  const route = routeWire(c, a, b);
  if (!route) return "No room to run a wire there. Move the parts apart, or draw it with the Wire tool.";
  if (!route.path.length && !route.bridges.length) return "Already connected.";
  applyRoute(c.cells, route);
  return null;
}

export function wireKind(c: Circuit, w: Wire) {
  return portOf(c, w.from)?.kind ?? "logic";
}

// --- validation --------------------------------------------------------------------------------

const ROT = new Set([0, 1, 2, 3]);
const int = (v: unknown) => typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= LIMITS.coord;

/** Checks and cleans a circuit from storage or a share link. Returns null if it isn't one. */
export function validateCircuit(raw: unknown): Circuit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.parts) || !Array.isArray(r.wires)) return null;
  const parts: Part[] = [];
  const ids = new Set<string>();
  for (const p of r.parts.slice(0, LIMITS.parts)) {
    if (!p || typeof p !== "object") continue;
    const q = p as Record<string, unknown>;
    if (typeof q.type !== "string" || !PARTS.has(q.type) || !int(q.x) || !int(q.y)) continue;
    let id = typeof q.id === "string" && /^[\w-]{1,40}$/.test(q.id) ? q.id : newId("c");
    if (ids.has(id)) id = newId("c");
    ids.add(id);
    const rot = (ROT.has(q.rot as number) ? q.rot : 0) as Rot;
    parts.push({ id, type: q.type, x: q.x as number, y: q.y as number, rot, cfg: sanitizeConfig(q.type, q.cfg) });
  }
  const c: Circuit = {
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 60) : "Circuit",
    parts,
    wires: [],
    cells: {},
    settings: { walkSpeed: 2 },
  };
  if (r.cells && typeof r.cells === "object" && !Array.isArray(r.cells)) {
    let n = 0;
    for (const [k, v] of Object.entries(r.cells as Record<string, unknown>)) {
      const m = /^(-?\d+),(-?\d+)$/.exec(k);
      if (!m || typeof v !== "string" || !VALID_TILE.test(v) || !int(+m[1]) || !int(+m[2])) continue;
      if (++n > LIMITS.cells) break;
      c.cells[cellKey(+m[1], +m[2])] = v;
    }
  }
  /** Logic wires from before tiles existed: laid onto the grid below. */
  const legacy: [PortRef, PortRef][] = [];
  const s = r.settings as Record<string, unknown> | undefined;
  if (s && typeof s.walkSpeed === "number" && Number.isFinite(s.walkSpeed)) c.settings.walkSpeed = Math.min(10, Math.max(0.2, s.walkSpeed));
  const wireIds = new Set<string>();
  for (const w of r.wires.slice(0, LIMITS.wires)) {
    if (!w || typeof w !== "object") continue;
    const q = w as Record<string, unknown>;
    const ref = (v: unknown): PortRef | null => {
      const o = v as Record<string, unknown> | null;
      return o && typeof o.part === "string" && typeof o.port === "string" ? { part: o.part, port: o.port } : null;
    };
    const from = ref(q.from);
    const to = ref(q.to);
    if (!from || !to) continue;
    if (portOf(c, from)?.kind === "logic" && portOf(c, to)?.kind === "logic") {
      legacy.push([from, to]);
      continue;
    }
    const plan = planWire(c, from, to);
    if ("error" in plan) continue;
    let id = typeof q.id === "string" && /^[\w-]{1,40}$/.test(q.id) ? q.id : newId("w");
    if (wireIds.has(id)) id = newId("w");
    wireIds.add(id);
    c.wires.push({ id, ...plan.wire });
  }
  for (const [a, b] of legacy.slice(0, 500)) {
    const route = routeWire(c, a, b, buildNets(c));
    if (route) applyRoute(c.cells, route);
  }
  return c;
}

// --- share links -------------------------------------------------------------------------------
// #circuit=<z|j><base64url>: "z" is deflate-raw compressed JSON, "j" plain JSON (when the browser
// has no CompressionStream). Parts are positional arrays and wires refer to parts by index.

interface SharePayload {
  v: 1;
  n: string;
  s?: number;
  /** [type, x, y, rot, changed settings?] */
  p: [string, number, number, number, Config?][];
  /** [from part index, from port, to part index, to port] */
  w: [number, string, number, string][];
  /** Logic tiles: [x, y, kind] */
  c?: [number, number, string][];
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export function toPayload(c: Circuit): SharePayload {
  const index = new Map(c.parts.map((p, i) => [p.id, i]));
  return {
    v: 1,
    n: c.name,
    ...(c.settings.walkSpeed !== 2 ? { s: c.settings.walkSpeed } : {}),
    p: c.parts.map((p) => {
      const d = configDiff(p.type, p.cfg);
      return d ? [p.type, p.x, p.y, p.rot, d] : [p.type, p.x, p.y, p.rot];
    }),
    w: c.wires.map((w) => [index.get(w.from.part)!, w.from.port, index.get(w.to.part)!, w.to.port]),
    c: Object.entries(c.cells).map(([k, v]) => {
      const [x, y] = k.split(",").map(Number);
      return [x, y, v];
    }),
  };
}

export function fromPayload(raw: unknown): Circuit | null {
  const p = raw as SharePayload;
  if (!p || typeof p !== "object" || p.v !== 1 || !Array.isArray(p.p) || !Array.isArray(p.w)) return null;
  const parts = p.p.slice(0, LIMITS.parts).map((e, i) =>
    Array.isArray(e) ? { id: `s${i}`, type: e[0], x: e[1], y: e[2], rot: e[3], cfg: { ...PARTS.get(String(e[0]))?.defaults(), ...(e[4] ?? {}) } } : null,
  );
  const wires = p.w.slice(0, LIMITS.wires).map((e, i) =>
    Array.isArray(e) ? { id: `w${i}`, from: { part: `s${e[0]}`, port: e[1] }, to: { part: `s${e[2]}`, port: e[3] } } : null,
  );
  const cells: Record<string, unknown> = {};
  if (Array.isArray(p.c)) for (const e of p.c.slice(0, LIMITS.cells)) if (Array.isArray(e)) cells[`${e[0]},${e[1]}`] = e[2];
  const c = validateCircuit({ name: p.n, parts, wires, cells, settings: { walkSpeed: p.s ?? 2 } });
  if (!c) return null;
  // Fresh ids so a shared circuit never collides with a saved one.
  const ren = new Map(c.parts.map((x) => [x.id, newId("c")]));
  for (const x of c.parts) x.id = ren.get(x.id)!;
  for (const w of c.wires) {
    w.id = newId("w");
    w.from.part = ren.get(w.from.part)!;
    w.to.part = ren.get(w.to.part)!;
  }
  return c;
}

export async function encodeCircuit(c: Circuit): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toPayload(c)));
  if (typeof CompressionStream !== "undefined") {
    try {
      return `z${bytesToBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
    } catch {
      /* fall through */
    }
  }
  return `j${bytesToBase64Url(json)}`;
}

/** Decodes a share link payload. Returns null for anything that isn't a valid circuit. */
export async function decodeCircuit(data: string): Promise<Circuit | null> {
  if (!/^[zj][A-Za-z0-9_-]+$/.test(data) || data.length > 400_000) return null;
  try {
    let bytes = base64UrlToBytes(data.slice(1));
    if (data[0] === "z") {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
      if (bytes.length > 4_000_000) return null;
    }
    return fromPayload(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
