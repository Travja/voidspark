<script lang="ts">
  // A flat symbol for each part, drawn in the part's own unrotated w×h box so it turns with the
  // part (arrows and long parts point the way their ports do). Square parts are drawn in a unit
  // box and scaled to fit. Gates and the Wire Bridge are drawn by PartView itself.
  import type { PartStatus } from "../types";

  let {
    type,
    w,
    h,
    cfg,
    status,
    compact = false,
    rot = 0,
  }: { type: string; w: number; h: number; cfg: Record<string, any>; status: PartStatus; compact?: boolean; rot?: number } = $props();

  /** Unit-box glyphs: scaled to the smaller side, centred; a little smaller when a caption sits under them. */
  const small = $derived(compact && Math.min(w, h) < 2);
  const k = $derived(Math.min(w, h) * (small ? 0.64 : compact ? 0.8 : 1));
  // With a caption under it, a one-tile symbol moves up the screen, clear of the caption. This
  // box is turned with the part, so "up the screen" depends on the rotation.
  const up = $derived([[0, -1], [-1, 0], [0, 1], [1, 0]][rot % 4]);
  const nudge = $derived(small ? 0.13 : 0);
  const unit = $derived(`translate(${(w - k) / 2 + up[0] * nudge} ${(h - k) / 2 + up[1] * nudge}) scale(${k})`);
  const S = $derived(0.06 / Math.max(1, k));
  const on = $derived(!!status.active);
</script>

{#if type === "counter-gate"}
  <!-- Three tiles: input, tally, output. -->
  <path class="g" stroke-width="0.06" d="M0 .5H.7M2.3 .5H3M2.3 .5l-.16-.12M2.3 .5l-.16 .12" />
  <path class="g" stroke-width="0.07" d="M1.05 .26V.74M1.25 .26V.74M1.45 .26V.74M1.65 .26V.74M.95 .7L1.78 .3" />
{:else if type === "ribbon-writer" || type === "ribbon-reader"}
  {@const writer = type === "ribbon-writer"}
  {@const bit = Number(cfg.bit) || 1}
  <!-- Two tiles: a plain wire on one, the ribbon (bits 0–3) on the other. -->
  {#if writer}
    <path class="g" class:g-on={on} stroke-width="0.07" d="M0 .5H.72M.72 .5l-.16-.13M.72 .5l-.16 .13" />
  {:else}
    <path class="g" class:g-on={on} stroke-width="0.07" d="M1.22 .5H2M1.4 .5l-.16-.13M1.4 .5l-.16 .13" />
  {/if}
  {#each [0, 1, 2, 3] as b (b)}
    {@const y = 0.29 + b * 0.14}
    <path
      class="g lane"
      class:picked={b === bit}
      class:g-on={b === bit && on}
      stroke-width={b === bit ? 0.07 : 0.035}
      d={writer ? `M.86 ${y}H2` : `M0 ${y}H1.14`}
    />
  {/each}
  <rect class="g-band" x={writer ? 0.82 : 0} y=".2" width="1.18" height=".6" rx=".06" />
{:else}
  <g transform={unit}>
    {#if type === "lever"}
      <path class="g" stroke-width={S} d="M.24 .8H.76" />
      <path class="g" class:g-on={on} stroke-width={S * 1.2} d="M.5 .76L{on ? 0.7 : 0.3} .3" />
      <circle class="g-fill" class:g-on-fill={on} cx={on ? 0.7 : 0.3} cy=".28" r=".1" />
      <circle class="g-fill" cx=".5" cy=".76" r=".06" />
    {:else if type === "button"}
      <circle class="btn" cx=".5" cy=".5" r=".26" />
    {:else if type === "timer"}
      <circle class="g" class:g-on={on} stroke-width={S} cx=".5" cy=".52" r=".3" />
      <path class="g" stroke-width={S} d="M.5 .52V.32M.5 .52L.64 .6M.42 .14H.58M.5 .14V.22" />
    {:else if type === "capacity-sensor"}
      <path class="g" class:g-on={on} stroke-width={S} d="M.14 .5Q.5 .16 .86 .5Q.5 .84 .14 .5Z" />
      <circle class="g-fill" class:g-on-fill={on} cx=".5" cy=".5" r=".11" />
    {:else if type === "pressure-sensor"}
      <rect class="g" class:g-on={on} stroke-width={S} x=".18" y=".62" width=".64" height=".14" rx=".04" />
      <path class="g" stroke-width={S} d="M.5 .14V.5M.38 .38L.5 .5L.62 .38" />
    {:else if type === "item-filter" || type === "amount-filter"}
      <path class="g" stroke-width={S} d="M.16 .2H.84L.58 .52V.82L.42 .74V.52Z" />
      {#if type === "amount-filter"}
        <circle class="g-fill" cx=".36" cy=".32" r=".05" /><circle class="g-fill" cx=".5" cy=".32" r=".05" /><circle class="g-fill" cx=".64" cy=".32" r=".05" />
      {/if}
    {:else if type === "blocker"}
      <path class="g" stroke-width={S} d="M.22 .62V.86M.78 .62V.86" />
      <rect class="g barrier" class:shut={!on} stroke-width={S} x=".12" y=".36" width=".76" height=".26" rx=".04" />
      <path class="g" stroke-width={S * 0.8} d="M.26 .62L.42 .36M.46 .62L.62 .36M.66 .62L.8 .4" />
    {:else if type === "spark-gate"}
      <path class="g" stroke-width={S * 1.2} d="M.2 .3V.84M.8 .3V.84" />
      <path class="g" class:g-on={on} stroke-width={S * 1.4} d={on ? "M.22 .4L.66 .1" : "M.2 .46H.8"} />
    {:else if type === "splitter"}
      <path class="g" stroke-width={S} d="M.08 .5H.5M.5 .5V.14M.5 .5H.9M.5 .5V.86M.4 .24L.5 .12L.6 .24M.78 .4L.9 .5L.78 .6M.4 .76L.5 .88L.6 .76" />
    {:else if type === "wait-gate"}
      <path class="g" class:g-on={on} stroke-width={S} d="M.3 .16H.7L.5 .5L.7 .84H.3L.5 .5Z" />
      <path class="g-fill" d="M.38 .78H.62L.5 .62Z" />
    {:else if type === "counter"}
      <path class="g" stroke-width={S} d="M.28 .22V.7M.42 .22V.7M.56 .22V.7M.7 .22V.7M.2 .64L.8 .28" />
    {:else if type === "source"}
      <path class="g" stroke-width={S} d="M.14 .28H.78M.14 .5H.84M.14 .72H.78M.66 .18L.8 .28L.66 .38M.72 .4L.86 .5L.72 .6M.66 .62L.8 .72L.66 .82" />
    {:else if type === "extractor"}
      <rect class="g" stroke-width={S} x=".12" y=".28" width=".34" height=".44" rx=".04" />
      <path class="g" class:g-on={on} stroke-width={S} d="M.3 .5H.88M.74 .38L.88 .5L.74 .62" />
    {:else if type === "storage"}
      <rect class="g" stroke-width={S} x=".18" y=".22" width=".64" height=".5" rx=".04" />
      <path class="g" stroke-width={S * 0.8} d="M.18 .38H.82M.18 .55H.82M.3 .22V.72M.7 .22V.72" />
    {:else if type === "machine"}
      {@const teeth = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)}
      <g class:spin={on}>
        <circle class="g" class:g-on={on} stroke-width={S} cx=".5" cy=".48" r=".2" />
        <circle class="g" stroke-width={S} cx=".5" cy=".48" r=".07" />
        <path class="g" class:g-on={on} stroke-width={S * 1.6} d={teeth.map((a) => `M${0.5 + Math.cos(a) * 0.2} ${0.48 + Math.sin(a) * 0.2}L${0.5 + Math.cos(a) * 0.29} ${0.48 + Math.sin(a) * 0.29}`).join("")} />
      </g>
    {:else if type === "wireless-sender" || type === "wireless-receiver"}
      <path class="g" stroke-width={S} d="M.5 .84V.42M.38 .84H.62" />
      <circle class="g-fill" class:g-on-fill={on} cx=".5" cy=".38" r=".06" />
      {#if type === "wireless-sender"}
        <path class="g" class:g-on={on} stroke-width={S} d="M.34 .22A.22 .22 0 0 0 .34 .54M.66 .22A.22 .22 0 0 1 .66 .54M.24 .14A.34 .34 0 0 0 .24 .62M.76 .14A.34 .34 0 0 1 .76 .62" />
      {:else}
        <path class="g" class:g-on={on} stroke-width={S} d="M.3 .2Q.5 .32 .7 .2M.22 .1Q.5 .26 .78 .1" />
      {/if}
    {:else if type === "compressor"}
      <!-- A press squashing items into a cube, bound for the Recycler. -->
      <rect class="g" stroke-width={S} x=".16" y=".14" width=".68" height=".72" rx=".05" />
      <path class="g" stroke-width={S * 1.3} d="M.24 .44H.76M.5 .2V.38M.42 .3L.5 .38L.58 .3" />
      <rect class="g-fill" x=".4" y=".58" width=".2" height=".18" rx=".02" />
    {:else if type === "sr-latch" || type === "d-flipflop"}
      <!-- A memory cell: two cross-coupled halves. Port letters are drawn upright by PartView. -->
      <path class="g" stroke-width={S} d="M.36 .3H.64V.46H.36ZM.36 .54H.64V.7H.36Z" />
      <path class="g" stroke-width={S * 0.8} d="M.64 .38Q.76 .5 .64 .62M.36 .62Q.24 .5 .36 .38" />
    {/if}
  </g>
{/if}
