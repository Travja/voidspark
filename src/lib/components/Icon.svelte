<script lang="ts">
  import { displayName, iconUrl } from "./icons";

  let { id, size = 28, title }: { id: string; size?: number; title?: string } = $props();
  const url = $derived(iconUrl(id));
  const label = $derived(title ?? displayName(id));
</script>

{#if url}
  <img class="icon" src={url} width={size} height={size} alt={label} title={label} />
{:else}
  <span class="icon icon-missing" style:width="{size}px" style:height="{size}px" title={label}></span>
{/if}
