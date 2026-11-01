<script lang="ts">
  import type { Plan, Solver } from "../engine/solver";
  import { fmt } from "../format";
  import { UNIT_FACTOR, type AppState } from "../state.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";
  import RecipePicker from "./RecipePicker.svelte";

  let { plan, solver, app }: { plan: Plan; solver: Solver; app: AppState } = $props();
  const unit = $derived(app.cfg.unit);
</script>

<div class="two-col">
  <section class="card">
    <h3>Raw inputs</h3>
    <p class="muted small">Things you must harvest, supply, or deliver from elsewhere.</p>
    {#if !plan.rawInputs.length}<p class="muted">None. Everything is crafted in the plan.</p>{/if}
    <table>
      <tbody>
        {#each plan.rawInputs as r (r.material)}
          <tr>
            <td><span class="cell-mat"><Icon id={r.material} size={24} /> {displayName(r.material)}</span></td>
            <td class="num">{fmt(r.gross * UNIT_FACTOR[unit])}/{unit}</td>
            <td><RecipePicker material={r.material} {solver} {app} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
  <section class="card">
    <h3>Build cost</h3>
    <p class="muted small">To place every machine in the Machines tab (rounded up).</p>
    <table>
      <tbody>
        {#each plan.buildCost as c (c.material)}
          <tr>
            <td><span class="cell-mat"><Icon id={c.material} size={24} /> {displayName(c.material)}</span></td>
            <td class="num">{fmt(c.amount, 0)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</div>
