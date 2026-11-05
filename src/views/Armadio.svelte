<script lang="ts">
  import { db } from '../lib/db';
  import {
    addItem,
    addPhotoToItem,
    bulkAddToOutfit,
    bulkAddToTrip,
    bulkSetLocation,
    bulkSetStatus,
    restoreBulk,
    type BulkSnapshot,
  } from '../lib/db/items';
  import { deleteItemCascade, getCategories, restoreItemDeletion, type ItemDeletionSnapshot } from '../lib/db/repo';
  import type { CategoryRecord, ItemRecord, ItemStatus, ListRecord, OutfitRecord, TripRecord, WishlistRecord } from '../lib/db/types';
  import type { Img } from '../lib/logic/imageOps';
  import { draftNames } from '../lib/logic/itemPhotos';
  import { SORTS, activeFilterCount, filterItems, findDuplicates, needsWash, sortItems, type ItemSort } from '../lib/logic/items';
  import { STATUSES, statusInfo } from '../lib/logic/labels';
  import { formatDateIt } from '../lib/logic/util';
  import { MAX_BATCH, chooseFromGallery, takePhoto } from '../lib/media/acquire';
  import { bumpPhoto } from '../lib/media/photoCache.svelte';
  import { loadPhotoImg, replacePhoto, storePhoto } from '../lib/media/photos';
  import { colorsOf, decodeBlob } from '../lib/media/pipeline';
  import { tapFeedback } from '../lib/platform';
  import { live } from '../lib/state/live.svelte';
  import { registerOverlay, confirmDialog, showToast, showUndoToast, withBusy } from '../lib/state/ui.svelte';
  import { resetWardrobeFilters, wardrobeView } from '../lib/state/wardrobe.svelte';
  import { reportError } from '../lib/errors';
  import Fab, { type FabAction } from '../lib/ui/Fab.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import Lightbox from '../lib/ui/Lightbox.svelte';
  import PhotoEditor from '../lib/ui/PhotoEditor.svelte';
  import PhotoThumb from '../lib/ui/PhotoThumb.svelte';
  import PickerSheet from '../lib/ui/PickerSheet.svelte';
  import TabIcon from '../lib/ui/TabIcon.svelte';
  import BatchReviewSheet from './armadio/BatchReviewSheet.svelte';
  import CategoryPickerSheet from './armadio/CategoryPickerSheet.svelte';
  import DuplicatesSheet from './armadio/DuplicatesSheet.svelte';
  import FiltersSheet from './armadio/FiltersSheet.svelte';
  import ItemSheet from './armadio/ItemSheet.svelte';
  import QuickAddSheet from './armadio/QuickAddSheet.svelte';

  type EditorState =
    | { kind: 'new'; img: Img }
    | { kind: 'existing'; img: Img; itemId: string; photoId: string }
    | { kind: 'addToItem'; img: Img; itemId: string };
  type BulkPicker = 'status' | 'location' | 'trip' | 'outfit' | null;

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => getCategories(db), [] as CategoryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);
  const trips = live(() => db.trips.filter((t) => t.status !== 'done').toArray(), [] as TripRecord[]);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);

  let editor = $state.raw<EditorState | null>(null);
  let quickAdd = $state.raw<{ img: Img } | null>(null);
  let pickingBatch = $state(false);
  let review = $state.raw<string[] | null>(null);
  let openItem = $state<string | null>(null);
  let lightbox = $state.raw<{ photoIds: string[]; index: number; name: string } | null>(null);
  let showFilters = $state(false);
  let showDuplicates = $state(false);
  let selecting = $state(false);
  let selected = $state<string[]>([]);
  let bulkPicker = $state<BulkPicker>(null);

  const seasonBoxId = $derived(lists.value.find((l) => l.kind === 'location' && l.extra.key === 'seasonBox')?.id ?? null);
  const filters = $derived(wardrobeView.filters);
  const visible = $derived(sortItems(filterItems(items.value, filters, seasonBoxId), wardrobeView.sort));
  const hiddenInBox = $derived(
    filters.hideSeasonBox && seasonBoxId && !filters.locationIds.includes(seasonBoxId)
      ? items.value.filter((i) => i.locationId === seasonBoxId).length
      : 0,
  );
  const filterCount = $derived(activeFilterCount(filters));
  const catById = $derived(new Map(categories.value.map((c) => [c.id, c])));
  const duplicates = $derived(findDuplicates(items.value, wishlist.value));

  // Modalità selezione: il tasto Indietro la chiude.
  $effect(() => {
    if (!selecting) return;
    return registerOverlay(() => exitSelection());
  });

  function exitSelection() {
    selecting = false;
    selected = [];
  }

  function onTile(item: ItemRecord) {
    if (!selecting) {
      openItem = item.id;
      return;
    }
    selected = selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id];
    void tapFeedback();
  }

  function selectAllVisible() {
    selected = selected.length === visible.length ? [] : visible.map((i) => i.id);
  }

  // ---------- Foto e nuovi capi ----------

  async function acquireOne(source: 'camera' | 'gallery'): Promise<Img | null> {
    const blob = source === 'camera' ? await takePhoto() : (await chooseFromGallery(false))[0];
    if (!blob) return null;
    return withBusy('Apro la foto…', () => decodeBlob(blob));
  }

  async function newItem(source: 'camera' | 'gallery') {
    try {
      const img = await acquireOne(source);
      if (img) editor = { kind: 'new', img };
    } catch (e) {
      reportError(e, 'Non riesco ad aprire la foto.');
    }
  }

  async function addPhoto(itemId: string, source: 'camera' | 'gallery') {
    try {
      const img = await acquireOne(source);
      if (img) editor = { kind: 'addToItem', img, itemId };
    } catch (e) {
      reportError(e, 'Non riesco ad aprire la foto.');
    }
  }

  async function editPhoto(itemId: string, photoId: string) {
    try {
      const img = await withBusy('Apro la foto…', () => loadPhotoImg(photoId));
      editor = { kind: 'existing', img, itemId, photoId };
    } catch (e) {
      reportError(e);
    }
  }

  async function onEditorSave(img: Img) {
    const st = editor;
    if (!st) return;
    if (st.kind === 'new') {
      editor = null;
      quickAdd = { img };
      return;
    }
    await withBusy('Salvo la foto…', async () => {
      if (st.kind === 'existing') {
        await replacePhoto(st.photoId, img);
        bumpPhoto(st.photoId);
      } else {
        const photoId = await storePhoto(img);
        await addPhotoToItem(db, st.itemId, photoId);
      }
    });
    editor = null;
    showToast('Foto salvata');
  }

  async function runBatch(category: CategoryRecord) {
    pickingBatch = false;
    let blobs: Blob[];
    try {
      blobs = await chooseFromGallery(true);
    } catch (e) {
      reportError(e, 'Non riesco ad aprire la galleria.');
      return;
    }
    if (!blobs.length) return;
    const names = draftNames(category.name, blobs.length, items.value.map((i) => i.name));
    const created: string[] = [];
    let failed = 0;
    await withBusy(
      'Preparo le foto…',
      async (progress, isCancelled) => {
        progress(0, blobs.length);
        for (let i = 0; i < blobs.length; i++) {
          if (isCancelled()) break;
          try {
            const img = await decodeBlob(blobs[i]!);
            const colors = await colorsOf(img);
            const photoId = await storePhoto(img);
            const item = await addItem(db, { name: names[i]!, categoryId: category.id, colors, photoIds: [photoId] });
            created.push(item.id);
          } catch (e) {
            failed += 1;
            console.error(e);
          }
          progress(i + 1, blobs.length);
        }
      },
      { cancellable: true },
    );
    if (failed) showToast(failed === 1 ? '1 foto non si è potuta leggere' : `${failed} foto non si sono potute leggere`);
    if (created.length) review = created;
  }

  // ---------- Azioni di massa ----------

  function afterBulk(message: string, snap: BulkSnapshot) {
    const n = selected.length;
    exitSelection();
    bulkPicker = null;
    showUndoToast(message.replace('{n}', n === 1 ? '1 capo' : `${n} capi`), () => restoreBulk(db, snap));
  }

  async function applyStatus(id: string) {
    const status = id as ItemStatus;
    try {
      afterBulk(`{n} → ${statusInfo(status).label}`, await bulkSetStatus(db, [...selected], status));
    } catch (e) {
      reportError(e);
    }
  }

  async function applyLocation(id: string) {
    const name = lists.value.find((l) => l.id === id)?.name ?? '';
    try {
      afterBulk(`{n} spostati in ${name}`, await bulkSetLocation(db, [...selected], id));
    } catch (e) {
      reportError(e);
    }
  }

  async function applyTrip(id: string) {
    const name = trips.value.find((t) => t.id === id)?.name ?? '';
    try {
      afterBulk(`{n} in valigia per ${name}`, await bulkAddToTrip(db, [...selected], id));
    } catch (e) {
      reportError(e);
    }
  }

  async function applyOutfit(id: string) {
    const name = outfits.value.find((o) => o.id === id)?.name ?? '';
    try {
      afterBulk(`{n} aggiunti a “${name}”`, await bulkAddToOutfit(db, [...selected], id));
    } catch (e) {
      reportError(e);
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    const ok = await confirmDialog({
      title: ids.length === 1 ? 'Eliminare 1 capo?' : `Eliminare ${ids.length} capi?`,
      message: 'Vengono tolti anche da outfit, viaggi e agenda. Lo storico di quando li hai indossati resta.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      const snaps: ItemDeletionSnapshot[] = [];
      for (const id of ids) snaps.push(await deleteItemCascade(db, id));
      exitSelection();
      showUndoToast(ids.length === 1 ? '1 capo eliminato' : `${ids.length} capi eliminati`, async () => {
        for (const s of snaps.reverse()) await restoreItemDeletion(db, s);
      });
    } catch (e) {
      reportError(e);
    }
  }

  const actions: FabAction[] = [
    { label: 'Scatta foto', hint: 'Fotocamera posteriore', run: () => void newItem('camera') },
    { label: 'Dalla galleria', hint: 'Una foto o uno screenshot', run: () => void newItem('gallery') },
    { label: 'Multi-foto', hint: `Fino a ${MAX_BATCH} capi in una volta`, run: () => (pickingBatch = true) },
  ];

  function badge(item: ItemRecord): string | null {
    if (item.status !== 'clean') return `${statusInfo(item.status).emoji} ${statusInfo(item.status).short}`;
    if (needsWash(item)) return '🧺 Da lavare presto';
    return null;
  }
</script>

<div class="armadio">
  {#if items.ready && items.value.length === 0}
    <section class="empty">
      <div class="badge-big"><TabIcon tab="armadio" size={36} /></div>
      <h1>Il tuo armadio è vuoto</h1>
      <p>Aggiungi il primo capo con una foto. Puoi anche caricarne fino a {MAX_BATCH} in una volta.</p>
      <div class="cta">
        <button class="btn btn-primary" onclick={() => newItem('camera')}>Scatta foto</button>
        <button class="btn" onclick={() => newItem('gallery')}>Dalla galleria</button>
        <button class="btn btn-ghost" onclick={() => (pickingBatch = true)}>Multi-foto</button>
      </div>
    </section>
  {:else}
    {#if selecting}
      <div class="selbar">
        <button class="icon-btn" aria-label="Esci dalla selezione" onclick={exitSelection}><Icon name="close" /></button>
        <strong class="grow">{selected.length} {selected.length === 1 ? 'selezionato' : 'selezionati'}</strong>
        <button class="btn btn-ghost small" onclick={selectAllVisible}>
          {selected.length === visible.length && visible.length > 0 ? 'Nessuno' : 'Tutti'}
        </button>
      </div>
    {:else}
      <div class="toolbar">
        <label class="search">
          <span class="visually-hidden">Cerca</span>
          <input
            class="input"
            type="search"
            placeholder="Cerca per nome, brand, tessuto…"
            value={filters.query}
            oninput={(e) => (wardrobeView.filters = { ...filters, query: e.currentTarget.value })}
          />
        </label>
        <div class="tools">
          <button class="tool" class:active={filterCount > 0} onclick={() => (showFilters = true)}>
            Filtri{filterCount ? ` (${filterCount})` : ''}
          </button>
          <label class="tool sort">
            <span class="visually-hidden">Ordina</span>
            <select value={wardrobeView.sort} onchange={(e) => (wardrobeView.sort = e.currentTarget.value as ItemSort)}>
              {#each SORTS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
            </select>
          </label>
          <button class="tool" onclick={() => (selecting = true)}>Seleziona</button>
          <button class="tool" onclick={() => (showDuplicates = true)}>
            Doppioni{duplicates.length ? ` (${duplicates.length})` : ''}
          </button>
        </div>
      </div>
    {/if}

    <div class="summary">
      <span>{visible.length} di {items.value.length} {items.value.length === 1 ? 'capo' : 'capi'}</span>
      {#if filterCount > 0 || filters.query}
        <button class="link" onclick={() => { resetWardrobeFilters(); wardrobeView.filters = { ...wardrobeView.filters, query: '' }; }}>
          Azzera filtri
        </button>
      {/if}
    </div>
    {#if hiddenInBox > 0}
      <p class="note hint">
        {hiddenInBox === 1 ? '1 capo è nella scatola cambio stagione ed è nascosto.' : `${hiddenInBox} capi sono nella scatola cambio stagione e sono nascosti.`}
        <button class="link" onclick={() => (wardrobeView.filters = { ...filters, hideSeasonBox: false })}>Mostrali</button>
      </p>
    {/if}

    {#if visible.length === 0}
      <div class="nothing">
        <p>Nessun capo con questi filtri.</p>
        <button class="btn" onclick={() => { resetWardrobeFilters(); wardrobeView.filters = { ...wardrobeView.filters, query: '' }; }}>Azzera filtri</button>
      </div>
    {:else}
      <ul class="grid">
        {#each visible as item (item.id)}
          {@const b = badge(item)}
          {@const isSel = selected.includes(item.id)}
          <li>
            <button class="tile" class:sel={isSel} aria-pressed={selecting ? isSel : undefined} onclick={() => onTile(item)}>
              <span class="pic">
                <PhotoThumb photoId={item.photoIds[0]} alt={item.name} />
                {#if item.favorite}<span class="fav" aria-label="Preferito">❤️</span>{/if}
                {#if item.hasStain}<span class="stain" aria-label="Macchia">🧪</span>{/if}
                {#if b}<span class="state">{b}</span>{/if}
                {#if selecting}<span class="check" class:on={isSel} aria-hidden="true">{#if isSel}<Icon name="check" size={18} />{/if}</span>{/if}
              </span>
              <span class="name">{item.name}</span>
              <span class="cat">
                {catById.get(item.categoryId)?.name ?? ''}{item.lastWornDate ? ` · ${formatDateIt(item.lastWornDate).replace(/ \d{4}$/, '')}` : ''}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if selecting}
  <div class="bulkbar" role="toolbar" aria-label="Azioni sui capi selezionati">
    <button disabled={!selected.length} onclick={() => (bulkPicker = 'status')}>Stato</button>
    <button disabled={!selected.length} onclick={() => (bulkPicker = 'location')}>Sposta</button>
    <button disabled={!selected.length} onclick={() => (bulkPicker = 'trip')}>Valigia</button>
    <button disabled={!selected.length} onclick={() => (bulkPicker = 'outfit')}>Outfit</button>
    <button class="danger" disabled={!selected.length} onclick={bulkDelete}>Elimina</button>
  </div>
{:else}
  <Fab {actions} label="Aggiungi capo" />
{/if}

{#if bulkPicker === 'status'}
  <PickerSheet
    title="Cambia stato"
    options={STATUSES.map((s) => ({ id: s.id, label: s.label, emoji: s.emoji }))}
    note="“Pulito” azzera gli utilizzi dall’ultimo lavaggio."
    onpick={applyStatus}
    onclose={() => (bulkPicker = null)}
  />
{:else if bulkPicker === 'location'}
  <PickerSheet
    title="Sposta in"
    options={lists.value.filter((l) => l.kind === 'location').sort((a, b) => a.order - b.order).map((l) => ({ id: l.id, label: l.name }))}
    onpick={applyLocation}
    onclose={() => (bulkPicker = null)}
  />
{:else if bulkPicker === 'trip'}
  <PickerSheet
    title="Metti in valigia per"
    options={trips.value.map((t) => ({ id: t.id, label: t.name, sub: formatDateIt(t.startDate) }))}
    empty="Non hai viaggi in programma. Potrai crearli nell’Agenda (Fase 7)."
    onpick={applyTrip}
    onclose={() => (bulkPicker = null)}
  />
{:else if bulkPicker === 'outfit'}
  <PickerSheet
    title="Aggiungi all’outfit"
    options={outfits.value.map((o) => ({ id: o.id, label: o.name, sub: `${o.itemIds.length} capi` }))}
    empty="Non hai ancora outfit. Il creatore di outfit arriva con la Fase 5."
    onpick={applyOutfit}
    onclose={() => (bulkPicker = null)}
  />
{/if}

{#if showFilters}
  <FiltersSheet
    {filters}
    categories={categories.value}
    lists={lists.value}
    resultCount={visible.length}
    onchange={(f) => (wardrobeView.filters = f)}
    onclose={() => (showFilters = false)}
  />
{/if}

{#if showDuplicates}
  <DuplicatesSheet
    groups={duplicates}
    categories={categories.value}
    onopen={(id) => {
      showDuplicates = false;
      openItem = id;
    }}
    onclose={() => (showDuplicates = false)}
  />
{/if}

{#if openItem}
  {#key openItem}
    <ItemSheet
      itemId={openItem}
      onclose={() => (openItem = null)}
      onopenphoto={(photoIds, index, name) => (lightbox = { photoIds, index, name })}
      oneditphoto={editPhoto}
      onaddphoto={addPhoto}
      onopenitem={(id) => (openItem = id)}
    />
  {/key}
{/if}

{#if pickingBatch}
  <CategoryPickerSheet categories={categories.value} onpick={runBatch} onclose={() => (pickingBatch = false)} />
{/if}

{#if quickAdd}
  {@const qa = quickAdd}
  <QuickAddSheet
    img={qa.img}
    categories={categories.value}
    onclose={() => (quickAdd = null)}
    onedit={() => {
      const img = qa.img;
      quickAdd = null;
      editor = { kind: 'new', img };
    }}
  />
{/if}

{#if review}
  <BatchReviewSheet itemIds={review} onclose={() => (review = null)} />
{/if}

{#if editor}
  <PhotoEditor
    img={editor.img}
    title={editor.kind === 'new' ? 'Nuovo capo' : 'Modifica foto'}
    saveLabel={editor.kind === 'new' ? 'Avanti' : 'Salva'}
    onsave={onEditorSave}
    oncancel={() => (editor = null)}
  />
{/if}

{#if lightbox}
  <Lightbox photoIds={lightbox.photoIds} start={lightbox.index} alt={lightbox.name} onclose={() => (lightbox = null)} />
{/if}

<style>
  .armadio {
    padding: 12px 16px 120px;
  }
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .search .input {
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
    padding: 0 6px 0 12px;
  }
  .sort select {
    border: 0;
    background: transparent;
    font-size: 0.875rem;
    min-height: 36px;
    max-width: 140px;
  }
  .selbar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 52px;
  }
  .selbar .grow {
    flex: 1;
  }
  .small {
    min-height: 40px;
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
  .hint {
    margin: 2px 4px 0;
  }
  .grid {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 12px;
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
    aspect-ratio: 3 / 4;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .tile.sel .pic {
    outline: 3px solid var(--accent);
    outline-offset: -1px;
  }
  .fav,
  .stain {
    position: absolute;
    top: 4px;
    font-size: 0.9rem;
    line-height: 1;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.3));
  }
  .fav {
    right: 6px;
  }
  .stain {
    left: 6px;
  }
  .state {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 4px;
    padding: 3px 6px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 0.6875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .check {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: rgb(0 0 0 / 0.35);
    display: grid;
    place-items: center;
    color: #fff;
  }
  .check.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }
  .name {
    font-size: 0.875rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: -2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nothing {
    text-align: center;
    padding: 48px 12px;
    color: var(--text-muted);
  }
  .bulkbar {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(var(--navbar-h) + var(--safe-bottom) + 8px);
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    padding: 6px;
    border-radius: 18px;
    background: var(--text);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
    z-index: 21;
  }
  .bulkbar button {
    min-height: 48px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--bg);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
  .bulkbar button:disabled {
    opacity: 0.4;
  }
  .bulkbar .danger {
    color: #ff9a92;
  }
  .empty {
    min-height: 70vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 10px;
    padding: 24px 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.75rem;
  }
  .badge-big {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--accent);
  }
  .empty p {
    margin: 0;
    max-width: 32ch;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .cta {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    width: min(280px, 100%);
  }
</style>
