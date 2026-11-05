<script lang="ts">
  import type { CategoryRecord } from '../../lib/db/types';
  import { colorInfo } from '../../lib/logic/colors';
  import type { DuplicateGroup } from '../../lib/logic/items';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let {
    groups,
    categories,
    onopen,
    onclose,
  }: {
    groups: DuplicateGroup[];
    categories: CategoryRecord[];
    onopen: (itemId: string) => void;
    onclose: () => void;
  } = $props();

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';
</script>

<Sheet title="Controlla doppioni" {onclose}>
  <p class="note first">
    Capi della stessa categoria e dello stesso colore principale (e di tessuto simile). Utile prima di comprarne un altro.
  </p>
  {#each groups as g (g.key)}
    <section class="group">
      <h3>
        <span class="dot" style:background={colorInfo(g.color).hex}></span>
        {catName(g.categoryId)} · {colorInfo(g.color).label}
        <span class="count">{g.items.length} {g.items.length === 1 ? 'capo' : 'capi'}{g.wishlist.length ? ` + ${g.wishlist.length} in wishlist` : ''}</span>
      </h3>
      <div class="row-items">
        {#each g.items as item (item.id)}
          <button class="tile" onclick={() => onopen(item.id)}>
            <span class="pic"><PhotoThumb photoId={item.photoIds[0]} alt={item.name} /></span>
            <span class="name">{item.name}</span>
          </button>
        {/each}
      </div>
      {#if g.wishlist.length}
        <p class="note">Nella wishlist: {g.wishlist.map((w) => w.name).join(', ')}. Ce l’hai già quasi uguale!</p>
      {/if}
    </section>
  {:else}
    <p class="ok">Nessun doppione: ogni capo è diverso dagli altri. 👏</p>
  {/each}
</Sheet>

<style>
  .first {
    margin-top: 0;
  }
  .group {
    margin-top: 16px;
  }
  h3 {
    font-family: var(--font-sans);
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 8px;
  }
  .count {
    font-weight: 400;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.15);
  }
  .row-items {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .tile {
    flex: none;
    width: 96px;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .pic {
    display: block;
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .name {
    display: block;
    font-size: 0.8125rem;
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ok {
    text-align: center;
    padding: 24px 0;
  }
</style>
