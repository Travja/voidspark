<script lang="ts">
  // Native <select> of game items grouped by category: quick to use on a phone.
  import { GAME } from "$lib/engine/data";

  let {
    value,
    onchange,
    emptyLabel,
    label,
  }: { value: string; onchange: (v: string) => void; emptyLabel?: string; label?: string } = $props();

  const groups = (() => {
    const names = new Map(GAME.categories.map((c) => [c.id, c.name]));
    const by = new Map<string, { id: string; name: string }[]>();
    for (const m of GAME.materials.values()) {
      const g = names.get(m.category) ?? "Other";
      if (!by.has(g)) by.set(g, []);
      by.get(g)!.push({ id: m.id, name: m.name });
    }
    return [...by.entries()].map(([g, items]) => ({ g, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  })();
</script>

<select aria-label={label} {value} onchange={(e) => onchange(e.currentTarget.value)}>
  {#if emptyLabel !== undefined}<option value="">{emptyLabel}</option>{/if}
  {#each groups as { g, items } (g)}
    <optgroup label={g}>
      {#each items as it (it.id)}<option value={it.id}>{it.name}</option>{/each}
    </optgroup>
  {/each}
</select>
