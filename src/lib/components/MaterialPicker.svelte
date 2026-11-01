<script lang="ts">
  import { GAME } from "../engine/data";

  let { value, onchange }: { value: string; onchange: (id: string) => void } = $props();
  const groups = GAME.categories
    .map((c) => ({ ...c, mats: [...GAME.materials.values()].filter((m) => m.category === c.id) }))
    .filter((g) => g.mats.length);
</script>

<select {value} aria-label="Material" onchange={(e) => onchange(e.currentTarget.value)}>
  {#each groups as g (g.id)}
    <optgroup label={g.name}>
      {#each g.mats as m (m.id)}
        <option value={m.id}>{m.name}</option>
      {/each}
    </optgroup>
  {/each}
</select>
