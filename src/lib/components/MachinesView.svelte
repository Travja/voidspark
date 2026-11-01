<script lang="ts">
  import type { Flow, Plan, Solver } from "../engine/solver";
  import { fmt } from "../format";
  import { UNIT_FACTOR, type AppState } from "../state.svelte";
  import CrewPicker from "./CrewPicker.svelte";
  import FlowList from "./FlowList.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";
  import RecipePicker from "./RecipePicker.svelte";

  let { plan, solver, app }: { plan: Plan; solver: Solver; app: AppState } = $props();

  const unit = $derived(app.cfg.unit);
  const u = $derived(UNIT_FACTOR[unit]);
  const total = $derived(plan.stations.reduce((n, s) => n + s.machinesBuilt, 0));

  /** Where each output goes: consumer recipes (labelled by what they make), targets, surplus. */
  function feeds(outputs: Flow[], recipeId: string) {
    const rows: { material: string; to: string; rate: number; fuel: boolean; kind: "use" | "target" | "surplus" }[] = [];
    for (const o of outputs) {
      const mp = plan.materials.get(o.material);
      if (!mp || mp.produced <= 0) continue;
      // This recipe's share of the material's total production.
      const share = o.rate / mp.produced;
      for (const c of mp.consumers) {
        if (c.recipe === recipeId) continue;
        rows.push({ material: o.material, to: c.material, rate: c.rate * share, fuel: c.fuel, kind: "use" });
      }
      if (mp.targetRate > 0) rows.push({ material: o.material, to: "", rate: mp.targetRate * share, fuel: false, kind: "target" });
      if (mp.surplus > 0) rows.push({ material: o.material, to: "", rate: mp.surplus * share, fuel: false, kind: "surplus" });
    }
    return rows.filter((r) => r.rate > 1e-9);
  }
</script>

{#if plan.stations.length}
  <p class="muted small">
    {total} machines across {plan.stations.length} workstation types. Rates are per {unit}.
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
            <th>Recipe</th>
            <th class="num">Machines</th>
            <th class="num">Load</th>
            <th>Makes</th>
            <th>Consumes</th>
            <th>Feeds</th>
            <th>Choose</th>
          </tr>
        </thead>
        <tbody>
          {#each s.lines as l (l.recipe.id)}
            <tr>
              <td>
                <span class="cell-mat"><Icon id={l.primary} size={24} /> {l.recipe.name}</span>
                {#if l.recipe.to.some((t) => t.chance)}<div class="tag chance" title="Randomised outputs counted at their expected value">🎲 random</div>{/if}
                {#if l.recipe.cycles}<div class="tag approx" title="Growth recipe ({l.recipe.cycles} cycles); the wiki doesn't say exactly how cycles work, so this rate is approximate">≈ growth</div>{/if}
              </td>
              <td class="num"><strong>{l.machinesBuilt}</strong> <span class="muted small">({fmt(l.machines, 2)})</span></td>
              <td class="num">{l.machinesBuilt ? `${Math.round((l.machines / l.machinesBuilt) * 100)}%` : "–"}</td>
              <td><FlowList flows={l.outputs} {unit} /></td>
              <td><FlowList flows={l.inputs} {unit} /></td>
              <td>
                <ul class="flows">
                  {#each feeds(l.outputs, l.recipe.id) as f, i (i)}
                    <li>
                      {#if l.outputs.length > 1}<Icon id={f.material} size={16} />{/if}
                      {#if f.kind === "use"}
                        → <Icon id={f.to} size={18} /> {displayName(f.to)}
                      {:else if f.kind === "target"}
                        → <strong>target</strong>
                      {:else}
                        → <span class="tag surplus">surplus</span>
                      {/if}
                      <span class="rate">{fmt(f.rate * u)}</span>
                      {#if f.fuel}<span title="as fuel"> 🔥</span>{/if}
                    </li>
                  {:else}
                    <li class="muted">–</li>
                  {/each}
                </ul>
              </td>
              <td><RecipePicker material={l.primary} {solver} {app} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
{:else}
  <p class="muted">Nothing to build yet.</p>
{/if}
