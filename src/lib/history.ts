/**
 * Undo/redo over serialised snapshots. Changes that land close together (typing a number, a
 * slider) are merged into one step, so undo takes back the whole edit rather than one keystroke.
 */
export class History {
  past: string[] = [];
  future: string[] = [];
  private lastChange = -Infinity;

  constructor(
    /** The snapshot the app is showing now. */
    public current: string,
    private readonly mergeWithinMs = 800,
    private readonly maxSteps = 100,
  ) {}

  /** Call with every new snapshot. Returns true if it added an undo step. */
  record(next: string, now = Date.now()): boolean {
    if (next === this.current) return false;
    const merge = now - this.lastChange < this.mergeWithinMs && this.past.length > 0;
    if (!merge) {
      this.past.push(this.current);
      if (this.past.length > this.maxSteps) this.past.shift();
    }
    this.future = [];
    this.current = next;
    this.lastChange = now;
    return !merge;
  }

  /** The snapshot to restore, or null if there's nothing to undo. */
  undo(): string | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    this.lastChange = -Infinity;
    return prev;
  }

  redo(): string | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    this.lastChange = -Infinity;
    return next;
  }
}
