// Reactive editor state for the logic sandbox: saved circuits (localStorage), the open circuit,
// undo/redo, selection and share links.
import { decodeCircuit, encodeCircuit, newId, validateCircuit } from "./circuit";
import { EXAMPLES } from "./examples";
import type { Circuit } from "./types";

const STORAGE_KEY = "voidspark:logic:v1";
const HISTORY = 100;

export interface SavedCircuit {
  id: string;
  circuit: Circuit;
}

interface Stored {
  version: 1;
  circuits: SavedCircuit[];
  current: string;
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (raw?.version === 1 && Array.isArray(raw.circuits)) {
      const circuits: SavedCircuit[] = [];
      for (const s of raw.circuits) {
        const c = validateCircuit(s?.circuit);
        if (c) circuits.push({ id: typeof s.id === "string" ? s.id : newId("k"), circuit: c });
      }
      if (circuits.length) {
        return { version: 1, circuits, current: circuits.some((c) => c.id === raw.current) ? raw.current : circuits[0].id };
      }
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  const first = { id: newId("k"), circuit: EXAMPLES[0].build() };
  return { version: 1, circuits: [first], current: first.id };
}

/** Canvas tool: select/move, or paint wire, ribbon or bridge tiles, or erase them. */
export type Tool = "select" | "wire" | "ribbon" | "bridge" | "erase";

export type Selection = { kind: "part"; id: string } | { kind: "wire"; id: string } | { kind: "cell"; id: string } | null;

export class LogicStore {
  #store = $state<Stored>(load());
  /** Bumped on every structural change; the page rebuilds the simulation when it changes. */
  version = $state(0);
  selection = $state<Selection>(null);
  #past = $state<string[]>([]);
  #future = $state<string[]>([]);

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(this.#store);
        try {
          localStorage.setItem(STORAGE_KEY, json);
        } catch {
          /* storage full or unavailable */
        }
      });
    });
  }

  get saved(): SavedCircuit[] {
    return this.#store.circuits;
  }

  get currentId(): string {
    return this.#store.current;
  }

  get circuit(): Circuit {
    return (this.#store.circuits.find((c) => c.id === this.#store.current) ?? this.#store.circuits[0]).circuit;
  }

  // --- history ------------------------------------------------------------------------------

  get canUndo() {
    return this.#past.length > 0;
  }
  get canRedo() {
    return this.#future.length > 0;
  }

  /** Records the current circuit so the next change can be undone. Call before mutating. */
  checkpoint() {
    this.#past.push(JSON.stringify($state.snapshot(this.circuit)));
    if (this.#past.length > HISTORY) this.#past.shift();
    this.#future = [];
  }

  /** Records a checkpoint, applies a change, and rebuilds the simulation. */
  edit(fn: (c: Circuit) => void) {
    this.checkpoint();
    fn(this.circuit);
    this.version++;
  }

  /** Marks the circuit as changed without a new history entry (e.g. at the end of a drag). */
  touched() {
    this.version++;
  }

  private replace(json: string) {
    const c = validateCircuit(JSON.parse(json));
    if (!c) return;
    const entry = this.#store.circuits.find((x) => x.id === this.#store.current)!;
    entry.circuit = c;
    if (this.selection && !this.exists(this.selection)) this.selection = null;
    this.version++;
  }

  undo() {
    const prev = this.#past.pop();
    if (!prev) return;
    this.#future.push(JSON.stringify($state.snapshot(this.circuit)));
    this.replace(prev);
  }

  redo() {
    const next = this.#future.pop();
    if (!next) return;
    this.#past.push(JSON.stringify($state.snapshot(this.circuit)));
    this.replace(next);
  }

  private exists(sel: NonNullable<Selection>) {
    if (sel.kind === "cell") return !!this.circuit.cells[sel.id];
    return sel.kind === "part" ? this.circuit.parts.some((p) => p.id === sel.id) : this.circuit.wires.some((w) => w.id === sel.id);
  }

  // --- saved circuits -----------------------------------------------------------------------

  private switched() {
    this.#past = [];
    this.#future = [];
    this.selection = null;
    this.version++;
  }

  select(id: string) {
    if (id === this.#store.current || !this.#store.circuits.some((c) => c.id === id)) return;
    this.#store.current = id;
    this.switched();
  }

  add(circuit: Circuit) {
    circuit.name = this.uniqueName(circuit.name);
    const entry = { id: newId("k"), circuit };
    this.#store.circuits.push(entry);
    this.#store.current = entry.id;
    this.switched();
    return entry.id;
  }

  duplicate() {
    const c = $state.snapshot(this.circuit) as Circuit;
    return this.add({ ...c, name: `${c.name} copy` });
  }

  rename(name: string) {
    const clean = name.trim().slice(0, 60);
    if (clean) this.circuit.name = clean;
  }

  remove() {
    const list = this.#store.circuits;
    if (list.length <= 1) return;
    const i = list.findIndex((c) => c.id === this.#store.current);
    list.splice(i, 1);
    this.#store.current = list[Math.max(0, i - 1)].id;
    this.switched();
  }

  private uniqueName(name: string) {
    const taken = new Set(this.#store.circuits.map((c) => c.circuit.name));
    if (!taken.has(name)) return name;
    let n = 2;
    while (taken.has(`${name} (${n})`)) n++;
    return `${name} (${n})`;
  }

  // --- share links --------------------------------------------------------------------------

  async shareUrl(): Promise<string> {
    const url = new URL(location.href);
    url.hash = `circuit=${await encodeCircuit($state.snapshot(this.circuit) as Circuit)}`;
    return url.toString();
  }

  /** Opens a circuit from the page's share link, if any. Returns its name, null, or "invalid". */
  async openShared(): Promise<string | null> {
    const match = /(?:^#|&)circuit=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!match) return null;
    history.replaceState(null, "", location.pathname + location.search);
    const c = await decodeCircuit(match[1]);
    if (!c) return "invalid";
    const key = (x: Circuit) => JSON.stringify({ p: x.parts.map((p) => [p.type, p.x, p.y, p.rot, p.cfg]), w: x.wires.length });
    const same = this.#store.circuits.find((s) => s.circuit.name === c.name && key($state.snapshot(s.circuit) as Circuit) === key(c));
    if (same) {
      this.select(same.id);
      return same.circuit.name;
    }
    this.add(c);
    return this.circuit.name;
  }
}
