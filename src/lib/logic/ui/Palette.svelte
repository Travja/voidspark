<script lang="ts">
  // Parts grouped by category. Tapping one arms it; the next tap on the grid places it.
  import { CATEGORIES, PART_TYPES } from "../parts";

  let { placing, onpick }: { placing: string | null; onpick: (type: string | null) => void } = $props();

  const icons = import.meta.glob<string>("../../assets/logic/*.png", { eager: true, import: "default" });
  const icon = (type: string) => icons[`../../assets/logic/${type}.png`];
  const GLYPH: Record<string, string> = { button: "◉", source: "⇶", machine: "⚙", extractor: "⇥", label: "T", storage: "▦" };
</script>

<div class="palette">
  {#each CATEGORIES as cat (cat)}
    <h3>{cat}</h3>
    <div class="palette-grid">
      {#each PART_TYPES.filter((t) => t.category === cat) as t (t.id)}
        <button
          class="palette-item"
          class:armed={placing === t.id}
          title={t.blurb}
          aria-pressed={placing === t.id}
          onclick={() => onpick(placing === t.id ? null : t.id)}
        >
          {#if icon(t.id)}
            <img src={icon(t.id)} alt="" width="32" height="32" />
          {:else}
            <span class="palette-glyph" aria-hidden="true">{GLYPH[t.id] ?? "□"}</span>
          {/if}
          <span>{t.name.replace("Wireless Signal ", "Wireless ")}</span>
        </button>
      {/each}
    </div>
  {/each}
</div>
