<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ItemRecord } from '../../lib/db/types';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';

  let {
    item,
    sub,
    onopen,
    actions,
  }: { item: ItemRecord; sub?: string; onopen: (id: string) => void; actions?: Snippet } = $props();
</script>

<div class="lrow">
  <button class="main" onclick={() => onopen(item.id)}>
    <span class="pic"><PhotoThumb photoId={item.photoIds[0]} alt={item.name} /></span>
    <span class="text">
      <span class="name">{item.name}</span>
      {#if sub}<span class="sub">{sub}</span>{/if}
    </span>
  </button>
  {#if actions}<div class="acts">{@render actions()}</div>{/if}
</div>

<style>
  .lrow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 6px;
    border-bottom: 1px solid var(--border);
  }
  .lrow:last-child {
    border-bottom: 0;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    min-height: 56px;
    cursor: pointer;
  }
  .pic {
    flex: none;
    width: 44px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 0.8125rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acts {
    flex: none;
    display: flex;
    gap: 6px;
  }
  .acts :global(.mini-btn) {
    min-height: 40px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
