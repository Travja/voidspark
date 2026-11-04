<script lang="ts">
  import type { Plan } from "../engine/solver";
  import { fmtRate } from "../format";
  import type { AppState } from "../state.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";

  /** World sites the plan's buildings must be built on (Giant Trees, Noxious Coral, ...). */
  let { plan, app }: { plan: Plan; app: AppState } = $props();
</script>

{#if plan.sites.length}
  <div class="sites">
    <span class="muted small" title="Some buildings must be built on a site in the world, one site per machine.">
      Sites to claim:
    </span>
    {#each plan.sites as s (s.site)}
      <span
        class="site-chip"
        title={[
          ...s.workstations.map((w) => `${w.machines} × ${displayName(w.workstation)}`),
          ...s.resources.map(
            (r) => `${displayName(r.material)}: uses ${fmtRate(r.used, app.cfg.unit)} of ${fmtRate(r.perSite * s.count, app.cfg.unit)} (${fmtRate(r.perSite, app.cfg.unit)} per site)`,
          ),
        ].join("\n")}
      >
        {#each s.workstations.slice(0, 2) as w (w.workstation)}<Icon id={w.workstation} size={18} />{/each}
        <strong>{s.count} × {s.site}</strong>
        {#each s.resources as r (r.material)}
          <span class="muted small">· {displayName(r.material)} {fmtRate(r.perSite, app.cfg.unit)} each</span>
        {/each}
      </span>
    {/each}
  </div>
{/if}
