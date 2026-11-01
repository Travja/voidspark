<script lang="ts">
  import type { Plan, Solver } from "../engine/solver";
  import { fmt } from "../format";
  import { UNIT_FACTOR, type AppState } from "../state.svelte";
  import FlowList from "./FlowList.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";
  import RecipePicker from "./RecipePicker.svelte";
  import CrewPicker from "./CrewPicker.svelte";

  let { plan, solver, app }: { plan: Plan; solver: Solver; app: AppState } = $props();

  const unit = $derived(app.cfg.unit);
  const u = $derived(UNIT_FACTOR[unit]);
  const total = $derived(plan.stations.reduce((n, s) => n + s.machinesBuilt, 0));
</script>

{#if plan.stations.length}
  <p class="muted small">
    {total} machines across {plan.stations.length} workstation types. Rates are per {unit}. A material with a target
    also shows its target rate.
  </p>
  {#each plan.stations as s (s.workstation)}
    <section class="station">
      <header>
        <Icon id={s.workstation} size={36} />
        <h3>{s.machinesBuilt} × {displayName(s.workstation)}</h3>
        <span class="muted small">{fmt(s.machinesExact, 2)} exact</span>
        <span class="spacer"></span>
        <label class="small">Sparks <CrewPicker workstation={s.workstation} {app} /></label>
      </header>
      <table>
        <thead>
          <tr>
            <th>Makes</th>
            <th class="num">Machines</th>
            <th class="num">Load</th>
            <th class="num">Output</th>
            <th>Consumes</th>
            <th>Feeds</th>
            <th>Recipe</th>
          </tr>
        </thead>
        <tbody>
          {#each s.lines as l (l.material)}
            <tr>
              <td><span class="cell-mat"><Icon id={l.material} size={24} /> {displayName(l.material)}</span></td>
              <td class="num"><strong>{l.machinesBuilt}</strong> <span class="muted small">({fmt(l.machines, 2)})</span></td>
              <td class="num">{l.machinesBuilt ? `${Math.round((l.machines / l.machinesBuilt) * 100)}%` : "–"}</td>
              <td class="num">
                {fmt(l.gross * u)}
                {#if l.targetRate > 0}<div class="muted small">target {fmt(l.targetRate * u)}</div>{/if}
              </td>
              <td><FlowList flows={l.inputs} {unit} /></td>
              <td><FlowList flows={l.consumers} {unit} /></td>
              <td><RecipePicker material={l.material} {solver} {app} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
{:else}
  <p class="muted">Nothing to build yet.</p>
{/if}
