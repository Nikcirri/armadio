<script lang="ts">
  import { untrack } from 'svelte';
  import { db } from '../lib/db';
  import type { CategoryRecord, DiaryRecord, ItemRecord, ListRecord, OutfitRecord, WearLogRecord, WishlistRecord } from '../lib/db/types';
  import {
    activeOutfitFilterCount,
    describeWears,
    filterOutfits,
    knownPeople,
    mergeLayout,
    OUTFIT_SORTS,
    outfitPieces,
    outfitWearStats,
    semaphore,
    sortOutfits,
    type OutfitSort,
  } from '../lib/logic/outfits';
  import { formatDateIt, todayKey } from '../lib/logic/util';
  import { live } from '../lib/state/live.svelte';
  import { nav, requestOpenItem } from '../lib/state/nav.svelte';
  import { outfitsView, resetOutfitFilters } from '../lib/state/outfitsView.svelte';
  import { settings } from '../lib/state/settings.svelte';
  import Fab from '../lib/ui/Fab.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import Lightbox from '../lib/ui/Lightbox.svelte';
  import TabIcon from '../lib/ui/TabIcon.svelte';
  import DiaryEntrySheet from './outfit/DiaryEntrySheet.svelte';
  import DiaryList from './outfit/DiaryList.svelte';
  import EndOfDaySheet from './outfit/EndOfDaySheet.svelte';
  import OutfitBuilder from './outfit/OutfitBuilder.svelte';
  import OutfitCollage from './outfit/OutfitCollage.svelte';
  import OutfitDetail from './outfit/OutfitDetail.svelte';
  import OutfitFiltersSheet from './outfit/OutfitFiltersSheet.svelte';

  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);
  const wearLog = live(() => db.wearLog.toArray(), [] as WearLogRecord[]);
  const diary = live(() => db.diary.toArray(), [] as DiaryRecord[]);

  let builder = $state.raw<{ outfitId: string | null; itemIds: string[] } | null>(null);
  let showFilters = $state(false);
  let endOfDay = $state(false);
  let memory = $state.raw<{ entryId: string | null; outfitId: string | null } | null>(null);
  let lightbox = $state.raw<{ photoIds: string[]; index: number } | null>(null);

  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const wishById = $derived(new Map(wishlist.value.map((w) => [w.id, w])));
  const seasonBoxId = $derived(lists.value.find((l) => l.kind === 'location' && l.extra.key === 'seasonBox')?.id ?? null);
  const stats = $derived(outfitWearStats(wearLog.value));
  const filters = $derived(outfitsView.filters);
  const visible = $derived(
    sortOutfits(filterOutfits(outfits.value, filters, { stats, diary: diary.value, today: todayKey() }), outfitsView.sort, stats),
  );
  const filterCount = $derived(activeOutfitFilterCount(filters));
  const people = $derived(knownPeople(diary.value, lists.value));
  const pending = $derived(settings.value.endOfDay ?? null);
  const pendingCount = $derived(pending ? pending.itemIds.filter((id) => itemsById.has(id)).length : 0);
  const section = $derived(nav.outfitSection);

  // Richieste da altre parti dell'app: "Crea outfit con questo capo", notifica di Fine giornata.
  $effect(() => {
    const r = nav.outfitRequest;
    if (!r) return;
    untrack(() => {
      nav.outfitRequest = null;
      if (r.kind === 'new') {
        nav.outfitDetail = null;
        builder = { outfitId: null, itemIds: r.itemIds };
      } else {
        endOfDay = true;
      }
    });
  });

  function card(o: OutfitRecord) {
    const pieces = outfitPieces(o, itemsById, wishById, categories.value);
    return { pieces, layout: mergeLayout(o.layout, pieces), light: semaphore(pieces, itemsById, seasonBoxId) };
  }

  function onSaved(id: string, isNew: boolean) {
    builder = null;
    if (isNew) nav.outfitDetail = id;
  }

  const clearFilters = () => {
    resetOutfitFilters();
  };
</script>

<div class="outfit">
  <div class="segmented" role="group" aria-label="Sezione">
    <button aria-pressed={section === 'outfits'} onclick={() => (nav.outfitSection = 'outfits')}>Outfit</button>
    <button aria-pressed={section === 'diary'} onclick={() => (nav.outfitSection = 'diary')}>Diario dei ricordi</button>
  </div>

  {#if pending && pendingCount > 0}
    <button class="eod" onclick={() => (endOfDay = true)}>
      <span class="moon" aria-hidden="true">🌙</span>
      <span class="grow">
        <strong>Fine giornata</strong>
        <span class="sub">
          {pendingCount === 1 ? '1 capo indossato' : `${pendingCount} capi indossati`}
          {pending.date === todayKey() ? 'oggi' : `il ${formatDateIt(pending.date)}`}: decidi cosa va a lavare.
        </span>
      </span>
      <Icon name="chevron" size={20} />
    </button>
  {/if}

  {#if section === 'diary'}
    <DiaryList
      onopen={(id) => (memory = { entryId: id, outfitId: null })}
      onnew={() => (memory = { entryId: null, outfitId: null })}
      onphoto={(photoIds, index) => (lightbox = { photoIds, index })}
    />
  {:else if outfits.ready && outfits.value.length === 0}
    <section class="empty">
      <div class="badge-big"><TabIcon tab="outfit" size={36} /></div>
      <h1>Nessun outfit, per ora</h1>
      <p>Crea un look scegliendo sopra, sotto, scarpe e accessori: il collage si compone da solo.</p>
      <button class="btn btn-primary" onclick={() => (builder = { outfitId: null, itemIds: [] })}>Crea il primo outfit</button>
    </section>
  {:else}
    <div class="toolbar">
      <input
        class="input"
        type="search"
        placeholder="Cerca un outfit…"
        value={filters.query}
        oninput={(e) => (outfitsView.filters = { ...filters, query: e.currentTarget.value })}
      />
      <div class="tools">
        <button class="tool" class:active={filterCount > 0} onclick={() => (showFilters = true)}>
          Filtri{filterCount ? ` (${filterCount})` : ''}
        </button>
        <label class="tool sort">
          <span class="visually-hidden">Ordina</span>
          <select
            value={outfitsView.sort}
            onchange={(e) => {
              outfitsView.sort = e.currentTarget.value as OutfitSort;
              e.currentTarget.blur();
            }}
          >
            {#each OUTFIT_SORTS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
          </select>
          <span class="chev" aria-hidden="true"><Icon name="down" size={16} /></span>
        </label>
        <button
          class="tool"
          class:active={filters.favorites}
          aria-pressed={filters.favorites}
          onclick={() => (outfitsView.filters = { ...filters, favorites: !filters.favorites })}
        >
          Preferiti
        </button>
        <button
          class="tool"
          class:active={filters.neverWorn}
          aria-pressed={filters.neverWorn}
          onclick={() => (outfitsView.filters = { ...filters, neverWorn: !filters.neverWorn })}
        >
          Mai indossati
        </button>
      </div>
    </div>
    <div class="summary">
      <span>{visible.length} di {outfits.value.length} outfit</span>
      {#if filterCount > 0 || filters.query}
        <button class="link" onclick={() => { clearFilters(); outfitsView.filters = { ...outfitsView.filters, query: '' }; }}>Azzera filtri</button>
      {/if}
    </div>

    {#if visible.length === 0}
      <div class="nothing">
        <p>Nessun outfit con questi filtri.</p>
        <button class="btn" onclick={() => { clearFilters(); outfitsView.filters = { ...outfitsView.filters, query: '' }; }}>Azzera filtri</button>
      </div>
    {:else}
      <ul class="grid">
        {#each visible as o (o.id)}
          {@const c = card(o)}
          <li>
            <button class="tile" onclick={() => (nav.outfitDetail = o.id)}>
              <span class="pic">
                <OutfitCollage pieces={c.pieces} layout={c.layout} label="Collage di {o.name}" />
                {#if o.favorite}<span class="fav" role="img" aria-label="Preferito">❤️</span>{/if}
                <span class="light" class:ok={c.light.ok} title={c.light.ok ? 'Tutto disponibile' : 'Qualche capo non è disponibile'}>
                  <span class="visually-hidden">{c.light.ok ? 'Tutto disponibile' : 'Qualche capo non è disponibile'}</span>
                </span>
              </span>
              <span class="name">{o.name}</span>
              <span class="sub">{o.incomplete ? '⚠️ Incompleto · ' : ''}{describeWears(stats.get(o.id), (d) => formatDateIt(d).replace(/ \d{4}$/, ''))}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if section === 'diary'}
  <Fab actions={[{ label: 'Nuovo ricordo', run: () => (memory = { entryId: null, outfitId: null }) }]} label="Nuovo ricordo" />
{:else}
  <Fab actions={[{ label: 'Nuovo outfit', run: () => (builder = { outfitId: null, itemIds: [] }) }]} label="Nuovo outfit" />
{/if}

{#if showFilters}
  <OutfitFiltersSheet
    {filters}
    lists={lists.value}
    {people}
    resultCount={visible.length}
    onchange={(f) => (outfitsView.filters = f)}
    onclose={() => (showFilters = false)}
  />
{/if}

{#if nav.outfitDetail}
  {#key nav.outfitDetail}
    <OutfitDetail
      outfitId={nav.outfitDetail}
      onclose={() => (nav.outfitDetail = null)}
      onedit={(id) => (builder = { outfitId: id, itemIds: [] })}
      onopenoutfit={(id) => (nav.outfitDetail = id)}
      onopenitem={requestOpenItem}
      onnewmemory={(outfitId) => (memory = { entryId: null, outfitId })}
      onopenmemory={(entryId) => (memory = { entryId, outfitId: null })}
    />
  {/key}
{/if}

{#if builder}
  <OutfitBuilder outfitId={builder.outfitId} initialItemIds={builder.itemIds} onclose={() => (builder = null)} onsaved={onSaved} />
{/if}

{#if memory}
  <DiaryEntrySheet
    entryId={memory.entryId}
    presetOutfitId={memory.outfitId}
    onclose={() => (memory = null)}
    onphoto={(photoIds, index) => (lightbox = { photoIds, index })}
  />
{/if}

{#if endOfDay}
  <EndOfDaySheet onclose={() => (endOfDay = false)} />
{/if}

{#if lightbox}
  <Lightbox photoIds={lightbox.photoIds} start={lightbox.index} alt="Foto del ricordo" onclose={() => (lightbox = null)} />
{/if}

<style>
  .outfit {
    padding: 12px 16px 120px;
  }
  .eod {
    width: 100%;
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface-2);
    text-align: left;
    cursor: pointer;
  }
  .moon {
    font-size: 1.5rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .eod .sub {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .empty {
    text-align: center;
    padding: 40px 16px;
  }
  .badge-big {
    width: 72px;
    height: 72px;
    margin: 0 auto 8px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--accent);
  }
  .empty h1 {
    font-size: 1.5rem;
    margin: 8px 0;
  }
  .empty p {
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0 0 20px;
  }
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }
  .toolbar .input {
    min-height: 44px;
  }
  .tools {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .tool {
    flex: none;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.875rem;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }
  .tool.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .sort {
    position: relative;
    padding: 0 30px 0 14px;
  }
  .sort select {
    appearance: none;
    -webkit-appearance: none;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font-size: 0.875rem;
    min-height: 36px;
    max-width: 170px;
    padding: 0;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .sort select:focus,
  .sort select:focus-visible {
    outline: none;
    box-shadow: none;
  }
  .sort:has(select:focus-visible) {
    border-color: var(--accent);
  }
  .chev {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    pointer-events: none;
    color: var(--text-muted);
  }
  .summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 10px 4px 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
    min-height: 36px;
    padding: 0 4px;
    cursor: pointer;
  }
  .grid {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 14px;
  }
  .tile {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }
  .pic {
    position: relative;
    display: block;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    overflow: hidden;
    /* I segni sopra il collage restano dentro la scheda (non sopra le pagine aperte). */
    isolation: isolate;
  }
  .fav {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 0.95rem;
    z-index: 1;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.3));
  }
  .light {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--danger);
    border: 2px solid #fff;
    z-index: 1;
  }
  .light.ok {
    background: #2e7d32;
  }
  .name {
    font-size: 0.9375rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: -2px;
  }
  .nothing {
    text-align: center;
    padding: 48px 12px;
    color: var(--text-muted);
  }
</style>
