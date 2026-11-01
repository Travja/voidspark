<script lang="ts">
  import { GAME } from "../engine/data";
  import type { AppState } from "../state.svelte";
  import { displayName } from "./icons";

  let { workstation, app }: { workstation: string; app: AppState } = $props();

  const powered = $derived(GAME.workstations.get(workstation)?.sparkPowered !== false);
  const override = $derived(app.cfg.stationSpark[workstation] ?? "");
  const def = $derived(GAME.sparks.find((s) => s.id === app.cfg.defaultSpark));
</script>

{#if powered}
  <select
    class="spark-picker"
    value={override}
    title="Spark working each {displayName(workstation)}"
    onchange={(e) => app.setStationSpark(workstation, e.currentTarget.value || null)}
  >
    <option value="">Default ({def?.name ?? "?"})</option>
    {#each GAME.sparks as s (s.id)}
      <option value={s.id}>{s.name} ({s.speed}%)</option>
    {/each}
  </select>
{:else}
  <span class="muted small">no spark</span>
{/if}
