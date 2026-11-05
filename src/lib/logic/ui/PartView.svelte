<script lang="ts">
  // One part on the canvas, in grid units. The body is drawn unrotated in its own w×h box and
  // turned into place; text and icons sit in an upright layer on top so they stay readable.
  import { footprint, portPosition } from "../geometry";
  import Glyph from "./Glyph.svelte";
  import { itemName, PARTS } from "../parts";
  import type { Part, PartStatus } from "../types";
  import { iconUrl } from "$lib/components/icons";
  import { GAME } from "$lib/engine/data";

  let { part, status, selected = false, ghost = false }: { part: Part; status: PartStatus; selected?: boolean; ghost?: boolean } =
    $props();

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

  /** Port letters for the memory parts, drawn upright just inside each port. */
  const LETTER: Record<string, string> = { Set: "S", Reset: "R", Data: "D", Clock: "⏵", Q: "Q", "Q̄": "Q̄" };
  const letters = $derived(
    part.type === "sr-latch" || part.type === "d-flipflop"
      ? type.ports.map((port) => {
          const { p, n } = portPosition({ x: 0, y: 0, rot: part.rot }, type.w, type.h, port);
          return { id: port.id, text: LETTER[port.label ?? ""] ?? "", x: p.x - n.x * 0.3, y: p.y - n.y * 0.3 };
        })
      : [],
  );
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
          <!-- Output leaves from the lower tile, in line with input B, as in the game's footprint. -->
          <path class="sym" stroke-width={S} d="M0 .5H.4M0 1.5H.4M.4 .2H1A.8 .8 0 0 1 1 1.8H.4Z" />
          <path class="sym open" stroke-width={S} d="M1.62 1.5H2" />
        {:else if part.type === "or" || part.type === "xor"}
          {@const dx = part.type === "xor" ? 0.12 : 0}
          <!-- Leans toward the output tile (lower right), in line with input B. -->
          <path
            class="sym"
            stroke-width={S}
            d="M0 .5H{0.46 + dx}M0 1.5H{0.46 + dx}M{0.3 + dx} .2Q{0.8 + dx} 1 {0.3 + dx} 1.8Q{1.2 + dx} 1.86 1.86 1.5Q{1.45 + dx} .26 {0.3 + dx} .2Z"
          />
          <path class="sym open" stroke-width={S} d="M1.86 1.5H2" />
          {#if dx}<path class="sym open" stroke-width={S} d="M.18 .2Q.68 1 .18 1.8" />{/if}
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
        <Glyph type={part.type} w={type.w} h={type.h} {cfg} {status} compact={!!caption} />
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
    {:else if centerIcon || recipeIcon}
      <!-- The item it's set to (filter item, channel, product), small in a corner. -->
      {@const icon = (centerIcon ?? recipeIcon)!}
      {@const s = part.type === "machine" ? 0.62 : 0.4}
      {@const corner = part.type === "item-filter" ? [(size.w - s) / 2, 0.05] : [size.w - s - 0.04, size.h - s - (caption ? 0.3 : 0.04)]}
      <circle class="icon-bg" cx={corner[0] + s / 2} cy={corner[1] + s / 2} r={s / 2} />
      <image href={icon} x={corner[0]} y={corner[1]} width={s} height={s} />
    {/if}
    {#each letters as l (l.id)}
      <text class="port-letter" x={l.x} y={l.y} text-anchor="middle" dominant-baseline="central">{l.text}</text>
    {/each}
    {#if caption}
      {#if gate}
        <!-- Gates: the setting sits beside the symbol, clear of it. -->
        <text class="caption" x={size.w - 0.06} y={size.h + 0.22} text-anchor="end">{caption}</text>
      {:else}
        <text class="caption" class:long={caption.length > 5 && Math.min(size.w, size.h) < 2} x={size.w / 2} y={size.h - 0.13} text-anchor="middle">{caption}</text>
      {/if}
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
