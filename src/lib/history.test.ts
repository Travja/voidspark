import { describe, expect, it } from "vitest";
import { History } from "./history";

describe("undo history", () => {
  it("undoes and redoes", () => {
    const h = new History("a");
    h.record("b", 0);
    h.record("c", 5000);
    expect(h.undo()).toBe("b");
    expect(h.undo()).toBe("a");
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe("b");
    expect(h.redo()).toBe("c");
    expect(h.redo()).toBeNull();
  });

  it("merges quick successive changes (typing) into one step", () => {
    const h = new History("1");
    h.record("12", 0);
    h.record("125", 300);
    h.record("1250", 600);
    expect(h.past).toEqual(["1"]);
    expect(h.undo()).toBe("1");
  });

  it("a new change clears redo, and restoring doesn't count as a change", () => {
    const h = new History("a");
    h.record("b", 0);
    h.undo();
    expect(h.record("a", 10)).toBe(false); // the app re-renders the restored state
    h.record("x", 20);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(["a"]);
  });

  it("keeps a bounded number of steps", () => {
    const h = new History("0", 0, 3);
    for (let i = 1; i <= 5; i++) h.record(String(i), i);
    expect(h.past).toEqual(["2", "3", "4"]);
  });
});
