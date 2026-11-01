<script lang="ts">
  import { GAME } from "../engine/data";
  import { EXTERNAL, type Solver } from "../engine/solver";
  import type { AppState } from "../state.svelte";
  import { displayName } from "./icons";

  /** Choose which recipe makes a material, or mark it as supplied externally. */
  let { material, solver, app }: { material: string; solver: Solver; app: AppState } = $props();

  const options = $derived(GAME.recipesFor.get(material) ?? []);
  const craftable = $derived(GAME.materials.get(material)?.craftable !== false);
  const current = $derived(solver.recipeFor(material)?.id ?? EXTERNAL);

  const label = (r: (typeof options)[number]) =>
    `${displayName(r.workstation)}: ${
      r.from.length ? r.from.map((f) => `${f.amount} ${displayName(f.material)}`).join(" + ") : "harvest"
    }`;
</script>

{#if options.length && craftable}
  <select
    class="recipe-picker"
    value={current}
    title="Recipe used for this material"
    onchange={(e) => app.chooseRecipe(material, e.currentTarget.value)}
  >
    {#each options as r (r.id)}
      <option value={r.id}>{label(r)}</option>
    {/each}
    <option value={EXTERNAL}>Supply externally (raw input)</option>
  </select>
{/if}
