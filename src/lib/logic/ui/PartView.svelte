<script lang="ts">
  // One part on the canvas, in grid units. The body is drawn unrotated in its own w×h box and
  // turned into place; text and icons sit in an upright layer on top so they stay readable.
  import { footprint } from "../geometry";
  import { itemName, PARTS } from "../parts";
  import type { Part, PartStatus } from "../types";
  import { iconUrl } from "$lib/components/icons";
  import { GAME } from "$lib/engine/data";

  let { part, status, selected = false, ghost = false }: { part: Part; status: PartStatus; selected?: boolean; ghost?: boolean } =
    $props();

  const icons = import.meta.glob<string>("../../assets/logic/*.png", { eager: true, import: "default" });
  const wikiIcon = (type: string) => icons[`../../assets/logic/${type}.png`];

  const type = $derived(PARTS.get(part.type)!);
  const size = $derived(footprint(type.w, type.h, part.rot));
  const turn = $derived(
    [
      "",
      `translate(${type.h} 0) rotate(90)`,
      `translate(${type.w} ${type.h}) rotate(180)`,
      `translate(0 ${type.w}) rotate(270)`,
    ][part.rot],
  );
  const GATES = new Set(["and", "or", "xor", "not", "buffer", "filter"]);
  const gate = $derived(GATES.has(part.type));
  const cfg = $derived(part.cfg as Record<string, any>);

  /** What the upright layer shows in the middle of the part. */
  const centerIcon = $derived.by((): string | undefined => {
    if (part.type === "wireless-sender" || part.type === "wireless-receiver") return cfg.channel ? iconUrl(cfg.channel) : undefined;
    if (part.type === "item-filter") return cfg.item ? iconUrl(cfg.item) : undefined;
    if (part.type === "machine") {
      const out = cfg.recipe ? undefined : cfg.makeItem || cfg.useItem;
      return out ? iconUrl(out) : undefined;
    }
    return undefined;
  });
  const recipe = $derived(part.type === "machine" && cfg.recipe ? GAME.recipesById.get(cfg.recipe) : undefined);
  const recipeIcon = $derived(recipe ? iconUrl(recipe.to[0]?.material ?? "") : undefined);
  const caption = $derived.by(() => {
    switch (part.type) {
      case "buffer":
        return `${cfg.hold}s`;
      case "filter":
        return `${cfg.time}s`;
      case "timer":
        return `${cfg.on}/${cfg.off}s`;
      case "capacity-sensor":
        return `${cfg.cmp === "le" ? "≤" : "≥"}${cfg.value}${cfg.mode === "percent" ? "%" : ""}`;
      case "wait-gate":
        return `${cfg.wait}s`;
      case "amount-filter":
        return `${cfg.cmp === "eq" ? "=" : cfg.cmp === "ge" ? "≥" : "≤"}${cfg.amount}`;
      case "sr-latch":
        return "S R";
      case "d-flipflop":
        return "D ⏱";
      case "extractor":
        return `${cfg.rate}/s`;
      default:
        return "";
    }
  });
  const title = $derived(
    part.type === "storage" || part.type === "machine"
      ? cfg.label || (recipe ? recipe.name : "")
      : part.type === "wireless-sender" || part.type === "wireless-receiver"
        ? cfg.channel
          ? itemName(cfg.channel)
          : "no channel"
        : "",
  );
  const S = 0.06;
</script>

<g class="part" class:active={status.active} class:warn={status.warn} class:selected class:ghost transform="translate({part.x} {part.y})">
  {#if part.type === "label"}
    <rect class="hit" x="0" y="0" width={size.w} height={size.h} rx="0.15" />
    <text class="label-text" x="0.1" y={size.h / 2} dominant-baseline="central">{cfg.text}</text>
  {:else}
    <g transform={turn}>
      {#if part.type === "wire-bridge"}
        <!-- End tile, gap, end tile: whatever runs through the middle tile stays visible. -->
        <rect class="body" x=".1" y=".18" width=".8" height=".64" rx=".14" stroke-width={S} />
        <rect class="body" x="2.1" y=".18" width=".8" height=".64" rx=".14" stroke-width={S} />
        <path class="hit" d="M.5 .5C.9 -.35 2.1 -.35 2.5 .5" stroke-width=".3" stroke="transparent" fill="none" />
        <path class="sym open arch" stroke-width={S * 1.6} d="M.6 .4C1 -.25 2 -.25 2.4 .4" />
      {:else if gate}
        <rect class="hit" x="0" y="0" width={type.w} height={type.h} rx="0.2" />
        {#if part.type === "and"}
          <path class="sym" stroke-width={S} d="M0 .5H.4M0 1.5H.4M1.75 1H2M.4 .3H1A.7 .7 0 0 1 1 1.7H.4Z" />
        {:else if part.type === "or" || part.type === "xor"}
          {@const dx = part.type === "xor" ? 0.12 : 0}
          <path
            class="sym"
            stroke-width={S}
            d="M0 .5H{0.52 + dx}M0 1.5H{0.52 + dx}M1.8 1H2M{0.3 + dx} .3Q{0.8 + dx} 1 {0.3 + dx} 1.7Q{1.3 + dx} 1.7 1.8 1Q{1.3 + dx} .3 {0.3 + dx} .3Z"
          />
          {#if dx}<path class="sym open" stroke-width={S} d="M.18 .3Q.68 1 .18 1.7" />{/if}
        {:else}
          <!-- Two tiles long, as in the game: input on the left tile, output on the right. -->
          <path class="sym" stroke-width={S} d="M0 .5H.5M.5 .14L1.42 .5L.5 .86Z{part.type === 'not' ? '' : 'M1.42 .5H2'}" />
          {#if part.type === "not"}
            <circle class="sym" stroke-width={S} cx="1.53" cy=".5" r=".1" /><path class="sym" stroke-width={S} d="M1.63 .5H2" />
          {:else if part.type === "filter"}
            <path class="sym open" stroke-width={S * 0.8} d="M.64 .62H.78V.38H.96" />
          {:else}
            <path class="sym open" stroke-width={S * 0.8} d="M.64 .38H.82V.62H.96" />
          {/if}
        {/if}
      {:else}
        <rect class="body" x=".06" y=".06" width={type.w - 0.12} height={type.h - 0.12} rx=".18" stroke-width={S} />
      {/if}
    </g>

    <!-- Upright layer -->
    {#if part.type === "pixel"}
      <circle class="lamp" cx={size.w / 2} cy={size.h / 2} r=".3" />
    {:else if part.type === "pixel4"}
      {#each [0, 1, 2, 3] as i (i)}
        <circle
          class="lamp"
          class:on={status.badge?.[i] === "●"}
          cx={size.w / 2 + (i % 2 ? 0.2 : -0.2)}
          cy={size.h / 2 + (i < 2 ? -0.2 : 0.2)}
          r=".15"
        />
      {/each}
    {:else if !gate && part.type !== "wire-bridge"}
      {@const img = centerIcon ?? recipeIcon ?? wikiIcon(part.type)}
      {@const s = Math.min(size.w, size.h) * (part.type === "storage" || part.type === "machine" ? 0.62 : caption ? 0.56 : 0.72)}
      {#if img}
        <image href={img} x={(size.w - s) / 2} y={(size.h - s) / 2 - (caption ? 0.1 : 0)} width={s} height={s} />
      {:else if part.type === "button"}
        <circle class="btn" cx={size.w / 2} cy={size.h / 2} r=".26" />
      {:else if part.type === "source"}
        <text class="glyph" x={size.w / 2} y={size.h / 2} text-anchor="middle" dominant-baseline="central">⇶</text>
      {:else if part.type === "wireless-sender" || part.type === "wireless-receiver"}
        <text class="glyph" x={size.w / 2} y={size.h / 2} text-anchor="middle" dominant-baseline="central">?</text>
      {:else if part.type === "machine"}
        <text class="glyph" x={size.w / 2} y={size.h / 2} text-anchor="middle" dominant-baseline="central">⚙</text>
      {/if}
      {#if part.type === "wireless-sender" || part.type === "wireless-receiver"}
        <text class="tiny" x={size.w - 0.1} y=".28" text-anchor="end">{part.type === "wireless-sender" ? "TX" : "RX"}</text>
      {/if}
    {/if}
    {#if part.type === "lever"}
      <circle class="lamp small" class:on={status.active} cx={size.w - 0.18} cy=".18" r=".1" />
    {/if}
    {#if caption}
      <text class="caption" class:long={caption.length > 5 && Math.min(size.w, size.h) < 2} x={size.w / 2} y={size.h - 0.13} text-anchor="middle">{caption}</text>
    {/if}
    {#if status.fill !== undefined && (part.type === "storage" || part.type === "machine")}
      <rect class="fill-bg" x=".2" y={size.h - 0.3} width={size.w - 0.4} height=".14" rx=".05" />
      <rect class="fill" x=".2" y={size.h - 0.3} width={Math.max(0, Math.min(1, status.fill)) * (size.w - 0.4)} height=".14" rx=".05" />
    {/if}
    {#if status.badge && part.type !== "pixel4"}
      <text class="badge" x={size.w - 0.08} y="-0.08" text-anchor="end">{status.badge}</text>
    {/if}
    {#if title}
      <text class="title" x={size.w / 2} y={size.h + 0.32} text-anchor="middle">{title}</text>
    {/if}
  {/if}
</g>
