<script lang="ts">
  import { db } from '../../lib/db';
  import type { CategoryRecord, DiaryRecord, ItemRecord, OutfitRecord, WishlistRecord } from '../../lib/db/types';
  import { autoLayout, diaryPieceIds, groupDiaryByMonth, mergeLayout, outfitPieces, pieceFromItem, weekdayShort, type Piece } from '../../lib/logic/outfits';
  import { live } from '../../lib/state/live.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import OutfitCollage from './OutfitCollage.svelte';
  import Polaroid from './Polaroid.svelte';

  /** Diario dei ricordi (SPEC 8.2): timeline per mese. */
  let {
    onopen,
    onnew,
    onphoto,
  }: {
    onopen: (entryId: string) => void;
    onnew: () => void;
    onphoto: (photoIds: string[], index: number) => void;
  } = $props();

  const entries = live(() => db.diary.toArray(), [] as DiaryRecord[]);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);

  const months = $derived(groupDiaryByMonth(entries.value));
  const outfitsById = $derived(new Map(outfits.value.map((o) => [o.id, o])));
  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const wishById = $derived(new Map(wishlist.value.map((w) => [w.id, w])));

  function view(e: DiaryRecord): { pieces: Piece[]; layout: ReturnType<typeof autoLayout> } | null {
    const outfit = e.outfitId ? outfitsById.get(e.outfitId) : undefined;
    if (outfit && !e.itemIds.length) {
      const pieces = outfitPieces(outfit, itemsById, wishById, categories.value);
      return pieces.length ? { pieces, layout: mergeLayout(outfit.layout, pieces) } : null;
    }
    const pieces = diaryPieceIds(e, outfitsById)
      .map((id) => itemsById.get(id))
      .filter((i): i is ItemRecord => !!i)
      .map(pieceFromItem);
    return pieces.length ? { pieces, layout: autoLayout(pieces) } : null;
  }
</script>

{#if entries.ready && !entries.value.length}
  <section class="empty">
    <p class="big" aria-hidden="true">📖</p>
    <h2>Il diario è vuoto</h2>
    <p>Salva un ricordo: dove eri, con chi, cosa indossavi e qualche foto. Puoi aggiungerli anche a posteriori.</p>
    <button class="btn btn-primary" onclick={onnew}><Icon name="plus" size={20} /> Nuovo ricordo</button>
  </section>
{:else}
  {#each months as m (m.key)}
    <h2 class="section-title">{m.label}</h2>
    <ol class="timeline">
      {#each m.entries as e (e.id)}
        {@const v = view(e)}
        {@const outfit = e.outfitId ? outfitsById.get(e.outfitId) : undefined}
        <li>
          <div class="day" aria-hidden="true">
            <strong>{Number(e.date.slice(8, 10))}</strong>
            <span>{weekdayShort(e.date)}</span>
          </div>
          <div class="card entry">
            <button class="open" onclick={() => onopen(e.id)} aria-label="Apri il ricordo del {e.date}">
              <span class="text">
                {#if e.location}<span class="place"><Icon name="pin" size={16} /> {e.location}</span>{/if}
                {#if outfit}
                  <span class="outfit">{outfit.name}</span>
                {:else if e.itemIds.length}
                  <span class="outfit">{e.itemIds.map((id) => itemsById.get(id)?.name).filter(Boolean).join(', ')}</span>
                {/if}
                {#if e.people.length}<span class="people">con {e.people.join(', ')}</span>{/if}
                {#if e.note}<span class="note-text">{e.note}</span>{/if}
                {#if !e.location && !outfit && !e.itemIds.length && !e.people.length && !e.note}<span class="muted">Ricordo senza note</span>{/if}
              </span>
              {#if v}<span class="mini"><OutfitCollage pieces={v.pieces} layout={v.layout} /></span>{/if}
            </button>
            {#if e.photoIds.length}
              <div class="polaroids">
                {#each e.photoIds as pid, i (pid)}
                  <button class="pol" aria-label="Apri la foto {i + 1}" onclick={() => onphoto([...e.photoIds], i)}>
                    <Polaroid photoId={pid} index={i} />
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/each}
{/if}

<style>
  .empty {
    text-align: center;
    padding: 40px 16px;
  }
  .big {
    font-size: 2.6rem;
    margin: 0;
  }
  .empty h2 {
    margin: 8px 0;
  }
  .empty p {
    color: var(--text-muted);
    line-height: 1.5;
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  li {
    display: flex;
    gap: 10px;
  }
  .day {
    flex: none;
    width: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 10px;
  }
  .day strong {
    font-family: var(--font-serif);
    font-size: 1.375rem;
    font-weight: 500;
    line-height: 1;
  }
  .day span {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .entry {
    flex: 1;
    min-width: 0;
    padding: 0;
    overflow: hidden;
  }
  .open {
    width: 100%;
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .place {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
  }
  .outfit {
    font-family: var(--font-serif);
  }
  .people,
  .muted {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .note-text {
    font-size: 0.875rem;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .mini {
    flex: none;
    width: 72px;
  }
  .polaroids {
    display: flex;
    gap: 10px;
    padding: 4px 14px 16px;
    overflow-x: auto;
  }
  .pol {
    flex: none;
    width: 76px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
</style>
