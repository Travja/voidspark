import { describe, expect, it } from "vitest";
import { fmt, fmtLoad, fmtRate, fmtRateShort } from "./format";

describe("format", () => {
  it("never uses scientific notation", () => {
    for (const n of [3.7e-6, 0.00042, 0.0017, 0.03, 0.44, 1.5, 1234.5]) expect(fmt(n)).not.toMatch(/e/i);
    expect(fmt(0.0017)).toBe("0.0017");
    expect(fmt(0.00042)).toBe("<0.001");
    expect(fmt(12.345)).toBe("12.35");
  });

  it("moves trickles up to a larger unit", () => {
    expect(fmtRate(12, "min")).toBe("12/min");
    expect(fmtRate(0.0017, "min")).toBe("0.1/hr");
    expect(fmtRate(0.05, "min")).toBe("3/hr");
    expect(fmtRate(0.5, "sec")).toBe("0.5/min"); // 0.0083/sec -> 0.5/min
    expect(fmtRate(1e-6, "min")).toBe("<0.01/hr");
    expect(fmtRate(0, "min")).toBe("0/min");
  });

  it("only adds a unit in lists when it differs from the header's", () => {
    expect(fmtRateShort(12, "min")).toBe("12");
    expect(fmtRateShort(0.0017, "min")).toBe("0.1/hr");
  });

  it("shows how busy machines are", () => {
    expect(fmtLoad(0.44)).toBe("44%");
    expect(fmtLoad(3.7e-6)).toBe("<1%");
    expect(fmtLoad(2)).toBe("100%");
    expect(fmtLoad(1.5)).toBe("75%");
  });
});
