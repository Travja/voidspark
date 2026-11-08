<script lang="ts">
  import { GAME } from "../engine/data";
  import { allSites, floorSig, limitName, type Limit, type LimitReport } from "../engine/limits";
  import type { Plan } from "../engine/solver";
  import { fmtRate } from "../format";
  import { UNIT_FACTOR, type AppState } from "../state.svelte";
  import Icon from "./Icon.svelte";

  /**
   * "What I have": sites claimed, items coming in, machines built. Shows the most the targets
   * can make with them and which one runs out first.
   */
  let { plan, report, app }: { plan: Plan; report: LimitReport; app: AppState } = $props();

  const u = $derived(UNIT_FACTOR[app.cfg.unit]);
  const has = (kind: Limit["kind"], key: string) => app.cfg.limits.some((l) => l.kind === kind && l.key === key);

  /** One-tap suggestions from the plan itself: its sites and raw inputs. */
  const suggestions = $derived(
    [
      ...plan.sites.map((s) => ({ kind: "site" as const, key: s.site, amount: s.count })),
      ...plan.rawInputs.map((m) => ({ kind: "item" as const, key: m.material, amount: floorSig(m.supplied, 3) })),
    ]
      .filter((s) => !has(s.kind, s.key))
      .slice(0, 8),
  );

  const sites = allSites();
  const workstations = [...GAME.workstations.values()].sort((a, b) => a.name.localeCompare(b.name));
  const items = $derived(
    plan.order.filter((m) => !has("item", m)).map((m) => ({ id: m, name: GAME.materials.get(m)?.name ?? m })),
  );

  function addOther(value: string) {
    const [kind, key] = value.split(":", 2) as [Limit["kind"], string];
    if (!key) return;
    const use = plan.stations.find((s) => s.workstation === key)?.machinesBuilt;
    const amount =
      kind === "site"
        ? (plan.sites.find((s) => s.site === key)?.count ?? 1)
        : kind === "workstation"
          ? (use ?? 1)
          : floorSig((plan.materials.get(key)?.consumed ?? 0) + (plan.materials.get(key)?.targetRate ?? 0) || 1, 3);
    app.addLimit(kind, key, amount);
  }

  const icon = (l: Pick<Limit, "kind" | "key">) =>
    l.kind === "site"
      ? ([...GAME.workstations.values()].find((w) => w.site === l.key)?.id ?? "")
      : l.key;

  /** Amount shown in the input: items in the chosen unit, sites and machines as counts. */
  const shown = (l: Limit) => (l.kind === "item" ? +(l.amount * u).toPrecision(6) : l.amount);
  /** Items as a rate; sites and machines as whole ones to build (they can't be fractional). */
  const usedText = (kind: Limit["kind"], used: number) =>
    kind === "item" ? fmtRate(used, app.cfg.unit) : String(Math.ceil(used - 1e-9));

  function makeTheMost() {
    if (report.scale === null) return;
    app.scaleTargets(report.scale, (x) => floorSig(x, 3));
  }
</script>

<section class="card limits">
  <h2>What I have</h2>
  {#if !app.cfg.limits.length}
    <p class="muted small">
      Add the sites you've claimed, items you have coming in, or machines you've built, and VoidSpark works out the
      most your targets can make.
    </p>
  {/if}

  {#each report.uses as use (use.limit.id)}
    {@const l = use.limit}
    {@const short = use.used > use.limit.amount + 1e-9}
    <div class="limit-row" class:short>
      <Icon id={icon(l)} size={22} />
      <span class="limit-name">
        {limitName(l)}
        <span class="muted small">
          {#if l.kind === "site"}sites{:else if l.kind === "workstation"}machines{:else}/ {app.cfg.unit}{/if}
          · {l.kind === "item" ? "uses" : "needs"} {usedText(l.kind, use.used)}
        </span>
      </span>
      <input
        type="number"
        min="0"
        step="any"
        aria-label={`${limitName(l)} available`}
        value={shown(l)}
        oninput={(e) => {
          const v = parseFloat(e.currentTarget.value) || 0;
          app.updateLimit(l.id, l.kind === "item" ? v / u : v);
        }}
      />
      <button class="icon-btn" aria-label={`Remove ${limitName(l)}`} onclick={() => app.removeLimit(l.id)}>✕</button>
    </div>
  {/each}

  {#if report.scale !== null && report.bottleneck}
    {@const b = report.bottleneck}
    <div class="limit-result" class:short={report.scale < 1 - 1e-9}>
      <p>
        {#if report.scale < 1 - 1e-9}
          Not enough <strong>{limitName(b.limit)}</strong>: this plan needs {usedText(b.limit.kind, b.used)}, you have
          {usedText(b.limit.kind, b.limit.amount)}. With what you have, you can make:
        {:else}
          With what you have, you can make up to:
        {/if}
      </p>
      <ul>
        {#each report.maxRates as m (m.target.id)}
          <li>
            <Icon id={m.target.material} size={18} />
            <strong>{fmtRate(m.rate, app.cfg.unit)}</strong>
            {GAME.materials.get(m.target.material)?.name}
          </li>
        {/each}
      </ul>
      <p class="muted small">Limited by {limitName(b.limit)}.</p>
      {#if Math.abs(report.scale - 1) > 1e-3}
        <button class="make-most" onclick={makeTheMost}>
          {report.scale < 1 ? "Scale targets down to fit" : "Make the most"}
        </button>
      {/if}
    </div>
  {:else if app.cfg.limits.length}
    <p class="muted small">None of these are used by your targets.</p>
  {/if}

  <div class="limit-add">
    {#each suggestions as s (s.kind + s.key)}
      <button class="chip" onclick={() => app.addLimit(s.kind, s.key, s.amount)}>
        <Icon id={icon(s)} size={16} /> + {limitName(s)}
      </button>
    {/each}
    <select
      aria-label="Add something you have"
      value=""
      onchange={(e) => {
        addOther(e.currentTarget.value);
        e.currentTarget.value = "";
      }}
    >
      <option value="" disabled>+ Something else…</option>
      <optgroup label="Sites claimed">
        {#each sites.filter((s) => !has("site", s)) as s (s)}<option value={`site:${s}`}>{s}</option>{/each}
      </optgroup>
      <optgroup label="Items coming in (per min)">
        {#each items as m (m.id)}<option value={`item:${m.id}`}>{m.name}</option>{/each}
      </optgroup>
      <optgroup label="Machines built">
        {#each workstations.filter((w) => !has("workstation", w.id)) as w (w.id)}
          <option value={`workstation:${w.id}`}>{w.name}</option>
        {/each}
      </optgroup>
    </select>
  </div>
</section>

<style>
  .limit-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .limit-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .limit-row input {
    width: 5.5em;
  }

  .limit-row.short input {
    border-color: var(--danger);
  }

  .limit-result {
    border-radius: 8px;
    padding: 8px 10px;
    margin: 4px 0 10px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .limit-result.short {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  .limit-result p {
    margin: 0 0 4px;
  }

  .limit-result ul {
    list-style: none;
    margin: 0 0 4px;
    padding: 0;
  }

  .limit-result li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .limit-add {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .limit-add select {
    max-width: 100%;
  }

  .make-most {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
    padding: 3px 8px;
    border-radius: 999px;
  }
</style>
