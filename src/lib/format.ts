import type { RateUnit } from "./state.svelte";

const PER_MINUTE: Record<RateUnit, number> = { sec: 1 / 60, min: 1, hr: 60 };
const LARGER: Record<RateUnit, RateUnit | null> = { sec: "min", min: "hr", hr: null };

/** Plain number, never scientific notation. Small values keep two significant digits. */
export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs < 0.001) return n < 0 ? "-<0.001" : "<0.001";
  if (abs < 1) return n.toLocaleString(undefined, { maximumSignificantDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/**
 * A rate (given per minute) in the chosen unit. Trickles below 0.1 move up to a larger unit
 * (per minute to per hour) so they stay readable.
 */
export function rate(perMinute: number, unit: RateUnit): { text: string; unit: RateUnit } {
  let u = unit;
  let v = perMinute * PER_MINUTE[u];
  while (v > 0 && v < 0.1 && LARGER[u]) {
    u = LARGER[u]!;
    v = perMinute * PER_MINUTE[u];
  }
  if (v > 0 && v < 0.01) return { text: "<0.01", unit: u };
  return { text: fmt(v), unit: u };
}

/** "12/min", "0.3/hr". */
export function fmtRate(perMinute: number, unit: RateUnit): string {
  const r = rate(perMinute, unit);
  return `${r.text}/${r.unit}`;
}

/** How busy the machines are: exact machines over machines built. */
export function fmtLoad(machines: number): string {
  const built = Math.ceil(machines - 1e-9);
  if (!built) return "–";
  const pct = (machines / built) * 100;
  if (pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/** For lists whose header names the unit: bare number, with a unit only if it was scaled up. */
export function fmtRateShort(perMinute: number, unit: RateUnit): string {
  const r = rate(perMinute, unit);
  return r.unit === unit ? r.text : `${r.text}/${r.unit}`;
}
