<script lang="ts">
  import type { Flow } from "../engine/solver";
  import { fmt } from "../format";
  import { UNIT_FACTOR, type RateUnit } from "../state.svelte";
  import Icon from "./Icon.svelte";
  import { displayName } from "./icons";

  let { flows, unit }: { flows: Flow[]; unit: RateUnit } = $props();
</script>

{#if flows.length}
  <ul class="flows">
    {#each flows as f, i (`${f.material}${f.fuel}${i}`)}
      <li>
        <Icon id={f.material} size={18} />
        {displayName(f.material)} <span class="rate">{fmt(f.rate * UNIT_FACTOR[unit])}</span>
        {#if f.fuel}<span title="as fuel"> 🔥</span>{/if}
      </li>
    {/each}
  </ul>
{:else}
  <span class="muted">–</span>
{/if}
