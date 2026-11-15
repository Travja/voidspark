<script lang="ts">
  import type { Plan } from "../engine/solver";
  import { fmtRate } from "../format";
  import type { AppState } from "../state.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";

  /**
   * Loops the plan could close: byproducts that could feed an input, and inputs needed further
   * down their own chain. Each one is fed back or supplied separately, with a switch.
   */
  let { plan, app }: { plan: Plan; app: AppState } = $props();

  const unit = $derived(app.cfg.unit);
  const recipeName = (id: string) => plan.recipes.get(id)?.recipe.name ?? id;
  const anyOn = $derived(plan.loops.some((l) => l.loopBack));
</script>

{#if plan.loops.length}
  <details class="loops" open={anyOn}>
    <summary>
      <strong>Loop-backs</strong>
      <span class="muted small">
        {plan.loops.filter((l) => l.loopBack).length} of {plan.loops.length} fed back
      </span>
    </summary>
    <ul>
      {#each plan.loops as l (l.material)}
        <li class:on={l.loopBack}>
          <Icon id={l.material} size={22} />
          <div class="loop-text">
            <strong>{displayName(l.material)}</strong>
            {#if l.loopBack}
              <span class="small">
                {#if l.fedBack > 1e-9}
                  ↻ {fmtRate(l.fedBack, unit)} fed back from {l.byproducts.map((b) => recipeName(b.recipe)).join(", ")}.
                {/if}
                {#if l.selfUse > 1e-9}↻ Made in-line for its own chain ({fmtRate(l.selfUse, unit)} before feedback).{/if}
                {#if l.excess > 1e-9}
                  <span class="excess">Excess: {fmtRate(l.excess, unit)} more than the plan uses (surplus).</span>
                {:else if l.byproducts.length}
                  <span class="muted">All of it is used.</span>
                {/if}
              </span>
            {:else}
              <span class="small muted">
                {#if l.failed}Can't loop back: it would never settle (each one needs one or more back).{/if}
                {#if l.selfUse > 1e-9}Supplied separately: {fmtRate(l.selfUse, unit)} needed further down its own chain.{/if}
                {#if l.byproducts.length}
                  {fmtRate(l.byproducts.reduce((n, b) => n + b.rate, 0), unit)} made by
                  {l.byproducts.map((b) => recipeName(b.recipe)).join(", ")} goes to surplus.
                {/if}
              </span>
            {/if}
          </div>
          {#if !l.failed}
            <button
              class="small"
              title={l.isDefault ? "Default for this plan's loop setting" : "Your choice; ⟲ goes back to the default"}
              onclick={() => app.setLoopChoice(l.material, l.loopBack ? "supply" : "loop")}
            >
              {l.loopBack ? "Supply separately" : "Loop back"}
            </button>
            {#if !l.isDefault}
              <button class="icon-btn small" title="Back to the default" aria-label="Back to the default" onclick={() => app.setLoopChoice(l.material, null)}>⟲</button>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
    <p class="muted small">
      Looping back feeds byproducts into the machines that use them, and makes inputs needed further down their own
      chain in-line, so the plan needs less from outside. It also means belts run back up the line. Greenhouse and
      arboretum chains loop back by default; change that in Settings.
    </p>
  </details>
{/if}

<style>
  .loops {
    margin: 0 0 12px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .loops summary {
    cursor: pointer;
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 8px 0;
  }

  li {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 0;
    border-top: 1px solid var(--border);
  }

  .loop-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  li.on strong {
    color: var(--loop);
  }

  .excess {
    font-weight: 600;
  }
</style>
