<script lang="ts">
  import type { Plan } from "../engine/solver";
  import type { AppState } from "../state.svelte";
  import Icon from "./Icon.svelte";

  /** Sparks needed to staff every machine in the plan, with a shortcut to plan crafting them. */
  let { plan, app }: { plan: Plan; app: AppState } = $props();

  const total = $derived(plan.staffing.reduce((n, s) => n + s.count, 0));

  function planThem(block: string, count: number) {
    const existing = app.cfg.targets.find((t) => t.material === block && t.mode === "rate");
    // Targets are rates: craft the crew within an hour.
    if (existing) existing.value += count / 60;
    else app.addTarget(block, count / 60);
  }
</script>

{#if plan.staffing.length}
  <div class="staffing">
    <span class="muted small" title="Every machine needs its full crew. Sparks are crafted, so you need these before the plan runs.">
      Staffing ({total} sparks):
    </span>
    {#each plan.staffing as s (s.spark.id)}
      <span class="staff-chip">
        <Icon id={s.spark.block} size={20} />
        <strong>{s.count} × {s.spark.name}</strong>
        <button
          class="small"
          title="Add a target that crafts these {s.count} sparks over an hour ({s.count}/hr)"
          onclick={() => planThem(s.spark.block, s.count)}
        >
          + plan them
        </button>
      </span>
    {/each}
  </div>
{/if}
