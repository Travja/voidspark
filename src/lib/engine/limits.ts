/**
 * "What I have": sites claimed, items coming in, machines built. Production scales linearly with
 * the target rates, so a plan's use of each limited thing scales too, and the most the targets
 * can make is the plan scaled by the tightest limit.
 */
import { GAME, type GameData } from "./data";
import type { Plan, Solver, Target } from "./solver";

export interface Limit {
  id: string;
  /** site: world sites claimed. item: items/min available. workstation: machines available. */
  kind: "site" | "item" | "workstation";
  /** Site name, material id or workstation id. */
  key: string;
  amount: number;
}

export interface LimitUse {
  limit: Limit;
  /** How much the plan uses now: sites or machines (exact, fractional), or items/min. */
  used: number;
  /** amount / used: how far the targets can scale before this limit runs out. */
  headroom: number;
}

export interface LimitReport {
  uses: LimitUse[];
  /** Factor the targets can be scaled by. null when no limit touches the plan. */
  scale: number | null;
  /** The limit that runs out first. */
  bottleneck: LimitUse | null;
  /** Each target's rate (items/min) at `scale`. */
  maxRates: { target: Target; rate: number }[];
}

const EPS = 1e-9;

/** Every distinct world site a building can need, for the limit picker. */
export function allSites(data: GameData = GAME): string[] {
  const sites = new Set<string>();
  for (const ws of data.workstations.values()) if (ws.site) sites.add(ws.site);
  for (const m of data.materials.values()) if (m.siteResource) sites.add(m.siteResource.site);
  return [...sites].sort();
}

/** How much of a limited thing the plan uses. */
export function usage(plan: Plan, limit: Pick<Limit, "kind" | "key">, data: GameData = GAME): number {
  if (limit.kind === "item") {
    // Everything the plan needs of it, whether it is crafted in the plan or brought in.
    const mp = plan.materials.get(limit.key);
    return mp ? mp.consumed + mp.targetRate : 0;
  }
  if (limit.kind === "workstation") {
    return plan.stations.find((s) => s.workstation === limit.key)?.machinesExact ?? 0;
  }
  // A site: one per machine built on it, and enough of them to supply any resource they make.
  let machines = 0;
  for (const s of plan.stations) {
    if (data.workstations.get(s.workstation)?.site === limit.key) machines += s.machinesExact;
  }
  let supply = 0;
  for (const mp of plan.materials.values()) {
    const res = data.materials.get(mp.material)?.siteResource;
    if (res?.site === limit.key) supply = Math.max(supply, mp.supplied / res.perMinute);
  }
  return Math.max(machines, supply);
}

export function checkLimits(plan: Plan, solver: Solver, limits: Limit[], data: GameData = GAME): LimitReport {
  const uses: LimitUse[] = limits.map((limit) => {
    const used = usage(plan, limit, data);
    return { limit, used, headroom: used > EPS ? Math.max(0, limit.amount) / used : Infinity };
  });
  let bottleneck: LimitUse | null = null;
  for (const u of uses) if (u.used > EPS && (!bottleneck || u.headroom < bottleneck.headroom)) bottleneck = u;
  const scale = bottleneck ? bottleneck.headroom : null;
  return {
    uses,
    scale,
    bottleneck,
    maxRates: solver.cfg.targets.map((target) => ({ target, rate: solver.targetRate(target) * (scale ?? 1) })),
  };
}

/** Round down to `digits` significant figures, so a scaled-up target never tips over a limit. */
export function floorSig(x: number, digits = 3): number {
  if (!(x > 0)) return 0;
  const step = 10 ** (Math.floor(Math.log10(x)) - digits + 1);
  return +(Math.floor((x * (1 + 1e-9)) / step) * step).toPrecision(digits + 1);
}

/** Display name of what a limit counts. */
export function limitName(limit: Pick<Limit, "kind" | "key">, data: GameData = GAME): string {
  if (limit.kind === "site") return limit.key;
  if (limit.kind === "workstation") return data.workstations.get(limit.key)?.name ?? limit.key;
  return data.materials.get(limit.key)?.name ?? limit.key;
}
