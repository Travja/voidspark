export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.01) return n.toExponential(1);
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
