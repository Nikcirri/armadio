<script lang="ts">
  import type { ItemRecord } from '../../lib/db/types';
  import { isAvailable, normalize } from '../../lib/logic/items';
  import { blockReason, type Piece } from '../../lib/logic/outfits';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';

  /**
   * Selettore a foglio dei capi (SPEC 8.2): ricerca, di default solo i capi disponibili
   * (con interruttore per vederli tutti) e, se richiesto, i desideri della wishlist.
   */
  let {
    title,
    items,
    wishlist = null,
    selected,
    multiple,
    seasonBoxId,
    onlyAvailableByDefault = true,
    includeWishlist = false,
    onwishlist,
    onpick,
    onclose,
  }: {
    title: string;
    items: readonly ItemRecord[];
    /** Desideri della wishlist per questo slot; null = niente interruttore wishlist. */
    wishlist?: readonly Piece[] | null;
    selected: readonly string[];
    multiple: boolean;
    seasonBoxId: string | null;
    onlyAvailableByDefault?: boolean;
    includeWishlist?: boolean;
    onwishlist?: (value: boolean) => void;
    onpick: (id: string) => void;
    onclose: () => void;
  } = $props();

  let query = $state('');
  // svelte-ignore state_referenced_locally
  let showAll = $state(!onlyAvailableByDefault);

  const q = $derived(normalize(query));
  const matches = (text: string) => !q || normalize(text).includes(q);
  const visible = $derived(
    items
      .filter((i) => showAll || isAvailable(i, seasonBoxId) || selected.includes(i.id))
      .filter((i) => matches(`${i.name} ${i.brand} ${i.fabrics.join(' ')}`))
      .sort((a, b) => a.name.localeCompare(b.name, 'it')),
  );
  const hidden = $derived(showAll ? 0 : items.filter((i) => !isAvailable(i, seasonBoxId) && !selected.includes(i.id)).length);
  const wishes = $derived(includeWishlist && wishlist ? wishlist.filter((w) => matches(w.name)) : []);
</script>

<Sheet {title} {onclose}>
  <input class="input" type="search" placeholder="Cerca un capo…" bind:value={query} />
  <div class="switches">
    {#if onlyAvailableByDefault}
      <Switch
        label="Mostra anche i capi non disponibili"
        description={hidden ? `${hidden === 1 ? '1 capo nascosto' : `${hidden} capi nascosti`} (da lavare, in prestito…)` : undefined}
        checked={showAll}
        onchange={(v) => (showAll = v)}
      />
    {/if}
    {#if wishlist}
      <Switch label="Includi wishlist" description="Prova come starebbe un capo che non hai ancora." checked={includeWishlist} onchange={(v) => onwishlist?.(v)} />
    {/if}
  </div>

  {#if visible.length || wishes.length}
    <ul class="grid">
      {#each visible as item (item.id)}
        {@const on = selected.includes(item.id)}
        {@const reason = blockReason(item, seasonBoxId)}
        <li>
          <button class="tile" class:on aria-pressed={on} onclick={() => onpick(item.id)}>
            <span class="pic">
              <PhotoThumb photoId={item.photoIds[0]} alt={item.name} />
              {#if on}<span class="check" aria-hidden="true"><Icon name="check" size={18} /></span>{/if}
            </span>
            <span class="name">{item.name}</span>
            {#if reason}<span class="why">{reason}</span>{/if}
          </button>
        </li>
      {/each}
      {#each wishes as w (w.id)}
        {@const on = selected.includes(w.id)}
        <li>
          <button class="tile" class:on aria-pressed={on} onclick={() => onpick(w.id)}>
            <span class="pic">
              <PhotoThumb photoId={w.photoId} alt={w.name} />
              {#if on}<span class="check" aria-hidden="true"><Icon name="check" size={18} /></span>{/if}
            </span>
            <span class="name">{w.name}</span>
            <span class="why wish">Wishlist</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="note">
      {#if query}Nessun capo trovato.{:else if items.length && !showAll}Nessun capo disponibile adesso: attiva “Mostra anche i capi non disponibili”.{:else}Non hai ancora capi di questo tipo: aggiungili dall’Armadio.{/if}
    </p>
    {#if includeWishlist && wishlist && !wishlist.length}<p class="note">La wishlist non ha desideri di questo tipo.</p>{/if}
  {/if}

  {#snippet footer()}
    {#if multiple}
      <button class="btn btn-primary btn-block" onclick={onclose}>Fatto{selected.length ? ` (${selected.length})` : ''}</button>
    {:else}
      <button class="btn btn-ghost btn-block" onclick={onclose}>Chiudi</button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .switches {
    margin: 8px 0 4px;
  }
  .grid {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .tile {
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pic {
    position: relative;
    display: block;
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid transparent;
  }
  .on .pic {
    border-color: var(--accent);
  }
  .check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .name {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .why {
    font-size: 0.75rem;
    color: var(--danger);
    line-height: 1.2;
  }
  .why.wish {
    color: var(--text-muted);
  }
</style>
