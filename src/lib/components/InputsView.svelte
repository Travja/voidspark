<script lang="ts">
  import type { Plan, Solver } from "../engine/solver";
  import { fmt, fmtRate } from "../format";
  import type { AppState } from "../state.svelte";
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
            <td>
              <span class="cell-mat"><Icon id={r.material} size={24} /> {displayName(r.material)}</span>
              {#if r.loopSupplied > 1e-7}
                <div
                  class="tag loop"
                  title="Also made in this plan, but this much is needed further down its own chain. Bring it in separately so the line doesn't loop."
                >
                  ↻ {fmtRate(r.loopSupplied, unit)} to avoid a loop
                </div>
              {/if}
            </td>
            <td class="num">{fmtRate(r.supplied, unit)}</td>
            <td><RecipePicker material={r.material} {solver} {app} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
  <section class="card">
    <h3>Surplus</h3>
    <p class="muted small">Byproducts. They are never fed back into the lines, so store them, burn them, or use them elsewhere.</p>
    {#if !plan.surplus.length}<p class="muted">None.</p>{/if}
    <table>
      <tbody>
        {#each plan.surplus as r (r.material)}
          <tr>
            <td><span class="cell-mat"><Icon id={r.material} size={24} /> {displayName(r.material)}</span></td>
            <td class="num">{fmtRate(r.surplus, unit)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
  <section class="card">
    <h3>Build cost</h3>
    <p class="muted small">To place every machine in the Machines tab (rounded up).</p>
    {#if !plan.buildCost.length}<p class="muted">No build costs listed on the wiki for these machines.</p>{/if}
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
