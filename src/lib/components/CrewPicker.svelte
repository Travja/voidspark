<script lang="ts">
  import { DEFAULT_SPARK_SLOTS, GAME } from "../engine/data";
  import type { AppState } from "../state.svelte";
  import { crewLabel, crewOptions, normalizeCrewKey } from "./crews";
  import { displayName } from "./icons";

  /**
   * Choose which sparks work a workstation type. Without `workstation`, edits the default crew.
   */
  let { workstation, app }: { workstation?: string; app: AppState } = $props();

  const ws = $derived(workstation ? GAME.workstations.get(workstation) : undefined);
  const options = $derived(crewOptions(ws?.sparkSlots ?? DEFAULT_SPARK_SLOTS));
  const override = $derived(workstation ? app.cfg.stationCrew[workstation] : undefined);
  const value = $derived(
    workstation ? (override ? normalizeCrewKey(override) : "") : normalizeCrewKey(app.cfg.defaultCrew),
  );
  const defaultLabel = $derived(
    crewLabel(app.cfg.defaultCrew.map((id) => GAME.sparks.find((s) => s.id === id)!).filter(Boolean)),
  );

  function onchange(key: string) {
    const ids = key ? key.split("+") : null;
    if (workstation) app.setStationCrew(workstation, ids);
    else if (ids) app.cfg.defaultCrew = ids;
  }
</script>

{#if ws && !ws.sparkPowered}
  <span class="muted small">no spark</span>
{:else}
  <select
    class="crew-picker"
    {value}
    title={workstation ? `Sparks working each ${displayName(workstation)}` : "Sparks working each workstation"}
    onchange={(e) => onchange(e.currentTarget.value)}
  >
    {#if workstation}<option value="">Default ({defaultLabel})</option>{/if}
    {#each options as o (o.key)}
      <option value={o.key}>{o.label}</option>
    {/each}
  </select>
{/if}
