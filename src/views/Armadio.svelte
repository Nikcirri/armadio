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
  import { deleteItemCascade, getCategories, restoreItemDeletion, setSetting, type ItemDeletionSnapshot } from '../lib/db/repo';
  import type { CategoryRecord, ItemRecord, ItemStatus, ListRecord, OutfitRecord, TripRecord, WishlistRecord } from '../lib/db/types';
  import type { Img } from '../lib/logic/imageOps';
  import { draftNames } from '../lib/logic/itemPhotos';
  import {
    SLOT_GROUPS,
    SORTS,
    WARDROBE_LAYOUTS,
    layoutInfo,
    activeFilterCount,
    filterItems,
    findDuplicates,
    needsWash,
    slotGroupsPresent,
    sortItems,
    type ItemSort,
    type SlotGroupId,
  } from '../lib/logic/items';
  import { STATUSES, statusInfo } from '../lib/logic/labels';
  import { greeting } from '../lib/logic/theme';
  import { formatDateIt, formatDateShortIt } from '../lib/logic/util';
  import type { WardrobeLayout } from '../lib/db/types';
  import { settings } from '../lib/state/settings.svelte';
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
  import Lazy from '../lib/ui/Lazy.svelte';
  import { photoEditor } from '../lib/ui/photoEditor';
  import VirtualGrid from '../lib/ui/VirtualGrid.svelte';
  import PhotoThumb from '../lib/ui/PhotoThumb.svelte';
  import PickerSheet from '../lib/ui/PickerSheet.svelte';
  import TabIcon from '../lib/ui/TabIcon.svelte';
  import { longpress } from '../lib/ui/longpress';
  import BatchReviewSheet from './armadio/BatchReviewSheet.svelte';
  import CategoryPickerSheet from './armadio/CategoryPickerSheet.svelte';
  import DuplicatesSheet from './armadio/DuplicatesSheet.svelte';
  import FiltersSheet from './armadio/FiltersSheet.svelte';
  import ItemSheet from './armadio/ItemSheet.svelte';
  import QuickAddSheet from './armadio/QuickAddSheet.svelte';
  import LaundryPage from './armadio/LaundryPage.svelte';
  import SeasonChangeSheet from './armadio/SeasonChangeSheet.svelte';
  import { closeLaundry, nav, openLaundry, requestNewOutfit } from '../lib/state/nav.svelte';
  import { untrack } from 'svelte';

  type EditorState =
    | { kind: 'new'; img: Img }
    | { kind: 'existing'; img: Img; itemId: string; photoId: string }
    | { kind: 'addToItem'; img: Img; itemId: string };
  type BulkPicker = 'status' | 'location' | 'trip' | 'outfit' | null;
  const NEW_OUTFIT = '__new__';

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
  let fabOpen = $state(false);
  let lightbox = $state.raw<{ photoIds: string[]; index: number; name: string } | null>(null);
  let showFilters = $state(false);
  let showDuplicates = $state(false);
  let selecting = $state(false);
  let selected = $state<string[]>([]);
  let bulkPicker = $state<BulkPicker>(null);
  let seasonChange = $state(false);

  const seasonBoxId = $derived(lists.value.find((l) => l.kind === 'location' && l.extra.key === 'seasonBox')?.id ?? null);
  const filters = $derived(wardrobeView.filters);
  const visible = $derived(sortItems(filterItems(items.value, filters, seasonBoxId), wardrobeView.sort));
  const hiddenInBox = $derived(
    filters.hideSeasonBox && seasonBoxId && !filters.locationIds.includes(seasonBoxId)
      ? items.value.filter((i) => i.locationId === seasonBoxId).length
      : 0,
  );
  const filterCount = $derived(activeFilterCount(filters));
  // Saluto in alto: l'ora si legge quando si apre la sezione.
  const hello = $derived(greeting(new Date().getHours(), settings.value.profile?.userName ?? ''));
  const groups = $derived(slotGroupsPresent(items.value, filters.slotGroup));
  const anyFilter = $derived(filterCount > 0 || !!filters.query || filters.slotGroup !== null);

  // Vista dei capi (SPEC.md, sezione 8.1): si ricorda nelle impostazioni.
  const layout = $derived(layoutInfo(settings.value.wardrobeLayout));
  const LAYOUT_ICONS = { list: 'viewList', grid2: 'grid2', grid3: 'grid3', grid4: 'grid4' } as const;
  function pickLayout(id: WardrobeLayout) {
    if (id === layout.id) return;
    setSetting(db, 'wardrobeLayout', id).catch((e) => reportError(e));
  }

  function pickGroup(id: SlotGroupId | null) {
    wardrobeView.filters = { ...filters, slotGroup: id };
  }
  function clearAll() {
    resetWardrobeFilters();
    wardrobeView.filters = { ...wardrobeView.filters, query: '' };
  }
  const catById = $derived(new Map(categories.value.map((c) => [c.id, c])));
  const duplicates = $derived(findDuplicates(items.value, wishlist.value));
  const inLaundry = $derived(
    items.value.filter((i) => i.status === 'toWash' || i.status === 'drying' || i.status === 'toIron').length,
  );

  // Capo da aprire chiesto da un'altra sezione (es. toccato dentro un outfit).
  $effect(() => {
    const id = nav.itemRequest;
    if (!id) return;
    untrack(() => {
      nav.itemRequest = null;
      exitSelection();
      openItem = id;
    });
  });

  // "Aggiungi capo" da scorciatoia o widget: si apre il menu del + (Scatta foto, Galleria, Multi-foto).
  $effect(() => {
    if (!nav.addItemRequest) return;
    untrack(() => {
      nav.addItemRequest = false;
      exitSelection();
      openItem = null;
      fabOpen = true;
    });
  });

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

  /** Tenendo premuto un capo si entra nella selezione con quel capo già scelto. */
  function onLongPress(item: ItemRecord) {
    if (!selecting) {
      selecting = true;
      selected = [item.id];
    } else if (!selected.includes(item.id)) {
      selected = [...selected, item.id];
    }
    void tapFeedback('medium');
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
    const text = message.replace('{n}', n === 1 ? '1 capo' : `${n} capi`).replace(/\{s:([^|}]*)\|([^}]*)\}/g, (_, one, many) => (n === 1 ? one : many));
    showUndoToast(text, () => restoreBulk(db, snap));
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
      afterBulk(`{n} {s:spostato|spostati} in ${name}`, await bulkSetLocation(db, [...selected], id));
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
    if (id === NEW_OUTFIT) {
      const ids = [...selected];
      exitSelection();
      bulkPicker = null;
      requestNewOutfit(ids);
      return;
    }
    const name = outfits.value.find((o) => o.id === id)?.name ?? '';
    try {
      afterBulk(`{n} {s:aggiunto|aggiunti} a “${name}”`, await bulkAddToOutfit(db, [...selected], id));
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
      <header class="hello">
        <p class="eyebrow">{hello}</p>
        <h1>Il tuo <em>armadio</em></h1>
      </header>
      <div class="toolbar">
        <div class="searchrow">
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
          <button
            class="filterbtn"
            class:active={filterCount > 0}
            aria-label={filterCount ? `Filtri (${filterCount} attivi)` : 'Filtri'}
            onclick={() => (showFilters = true)}
          >
            <Icon name="sliders" size={22} />
            {#if filterCount}<span class="count" aria-hidden="true">{filterCount}</span>{/if}
          </button>
        </div>
        {#if groups.length > 1 || filters.slotGroup}
          <div class="chiprow" role="group" aria-label="Tipo di capo">
            <button class="chip" aria-pressed={filters.slotGroup === null} onclick={() => pickGroup(null)}>Tutti</button>
            {#each SLOT_GROUPS.filter((g) => groups.includes(g.id)) as g (g.id)}
              <button class="chip" aria-pressed={filters.slotGroup === g.id} onclick={() => pickGroup(filters.slotGroup === g.id ? null : g.id)}>
                {g.label}
              </button>
            {/each}
          </div>
        {/if}
        <div class="tools">
          <label class="tool sort">
            <span class="visually-hidden">Ordina</span>
            <select
              value={wardrobeView.sort}
              onchange={(e) => {
                wardrobeView.sort = e.currentTarget.value as ItemSort;
                // Dopo la scelta il menu non resta "attivo" (su Android disegnerebbe un rettangolo).
                e.currentTarget.blur();
              }}
            >
              {#each SORTS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
            </select>
            <span class="chev" aria-hidden="true"><Icon name="down" size={16} /></span>
          </label>
          <button class="tool" onclick={openLaundry}>Lavanderia{inLaundry ? ` (${inLaundry})` : ''}</button>
          <button class="tool" onclick={() => (selecting = true)}>Seleziona</button>
          <button class="tool" onclick={() => (showDuplicates = true)}>
            Doppioni{duplicates.length ? ` (${duplicates.length})` : ''}
          </button>
          <button class="tool" onclick={() => (seasonChange = true)}>Cambio stagione</button>
        </div>
      </div>
    {/if}

    <div class="summary">
      <span class="eyebrow">{visible.length === items.value.length ? `I tuoi capi · ${items.value.length}` : `${visible.length} di ${items.value.length} capi`}</span>
      <span class="sumright">
        {#if anyFilter}
          <button class="link" onclick={clearAll}>Azzera filtri</button>
        {/if}
        <span class="layouts" role="radiogroup" aria-label="Vista dei capi">
          {#each WARDROBE_LAYOUTS as l (l.id)}
            <button class="lay" role="radio" aria-checked={layout.id === l.id} aria-label={l.label} title={l.label} onclick={() => pickLayout(l.id)}>
              <Icon name={LAYOUT_ICONS[l.id]} size={18} />
            </button>
          {/each}
        </span>
      </span>
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
        <button class="btn" onclick={clearAll}>Azzera filtri</button>
      </div>
    {:else}
      <div class="grid-wrap" data-layout={layout.id}>
      <VirtualGrid items={visible} label="Capi" columns={layout.columns} gap={layout.gap}>
        {#snippet tile(item: ItemRecord)}
          {@const b = badge(item)}
          {@const isSel = selected.includes(item.id)}
          <button
            class="tile"
            class:sel={isSel}
            aria-pressed={selecting ? isSel : undefined}
            onclick={() => onTile(item)}
            use:longpress={{ onlong: () => onLongPress(item) }}
          >
            <span class="pic">
              <!-- Il nome è già il testo del pulsante: la foto è decorativa per i lettori di schermo. -->
              <PhotoThumb photoId={item.photoIds[0]} alt="" />
              {#if item.favorite}<span class="dotbadge fav" role="img" aria-label="Preferito"><Icon name="heartFilled" size={16} /></span>{/if}
              {#if item.hasStain}<span class="dotbadge stain" role="img" aria-label="Macchia da pre-trattare"><Icon name="droplet" size={16} /></span>{/if}
              {#if b && layout.id !== 'list'}<span class="state">{b}</span>{/if}
              {#if selecting}<span class="check" class:on={isSel} aria-hidden="true">{#if isSel}<Icon name="check" size={18} />{/if}</span>{/if}
            </span>
            <span class="txt">
              <span class="name">{item.name}</span>
              {#if layout.id !== 'grid4'}
                <span class="cat">
                  {catById.get(item.categoryId)?.name ?? ''}{item.lastWornDate ? ` · ${formatDateShortIt(item.lastWornDate)}` : ''}
                </span>
              {/if}
              {#if b && layout.id === 'list'}<span class="state-inline">{b}</span>{/if}
            </span>
          </button>
        {/snippet}
      </VirtualGrid>
      </div>
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
  <Fab {actions} label="Aggiungi capo" bind:open={fabOpen} />
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
    empty="Non hai viaggi in programma: crealo nell’Agenda, sezione Viaggi."
    onpick={applyTrip}
    onclose={() => (bulkPicker = null)}
  />
{:else if bulkPicker === 'outfit'}
  <PickerSheet
    title="Aggiungi all’outfit"
    options={[
      { id: NEW_OUTFIT, label: 'Nuovo outfit con questi capi', emoji: '➕' },
      ...[...outfits.value]
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
        .map((o) => ({ id: o.id, label: o.name, sub: o.itemIds.length === 1 ? '1 capo' : `${o.itemIds.length} capi` })),
    ]}
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

{#if nav.laundryOpen}
  <LaundryPage onclose={closeLaundry} onopenitem={(id) => (openItem = id)} />
{/if}

{#if seasonChange}
  <SeasonChangeSheet onclose={() => (seasonChange = false)} />
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
  <Lazy
    loader={photoEditor}
    variant="full"
    title={editor.kind === 'new' ? 'Nuovo capo' : 'Modifica foto'}
    onclose={() => (editor = null)}
    props={{
      img: editor.img,
      title: editor.kind === 'new' ? 'Nuovo capo' : 'Modifica foto',
      saveLabel: editor.kind === 'new' ? 'Avanti' : 'Salva',
      onsave: onEditorSave,
      oncancel: () => (editor = null),
    }}
  />
{/if}

{#if lightbox}
  <Lightbox photoIds={lightbox.photoIds} start={lightbox.index} alt={lightbox.name} onclose={() => (lightbox = null)} />
{/if}

<style>
  .armadio {
    padding: 8px 18px 120px;
  }
  .hello {
    padding: 6px 2px 14px;
  }
  .hello .eyebrow {
    margin: 0 0 2px;
  }
  .hello h1 {
    margin: 0;
    font-size: calc(2.125rem * var(--display-scale));
    line-height: 1.05;
  }
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .searchrow {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .search {
    flex: 1;
    min-width: 0;
  }
  .filterbtn {
    position: relative;
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 0;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .filterbtn.active {
    background: var(--primary);
    color: var(--on-primary);
  }
  .count {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 18px;
  }
  .chiprow {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin: 0 -18px;
    padding: 0 18px 2px;
    scrollbar-width: none;
  }
  .tools {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    margin: 0 -18px;
    padding: 0 18px 2px;
    scrollbar-width: none;
  }
  .tool {
    flex: none;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 0;
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.8125rem;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
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
    max-width: 150px;
    padding: 0;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .sort select:focus,
  .sort select:focus-visible {
    outline: none;
    box-shadow: none;
  }
  /* Bordo colorato solo con la tastiera, non dopo un tocco. */
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
    gap: 8px;
    min-height: 40px;
    margin: 14px 2px 6px;
  }
  .sumright {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .layouts {
    display: flex;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .lay {
    width: 36px;
    height: 34px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .lay[aria-checked='true'] {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  /* Lista: miniatura a sinistra, testo a destra, su una card. */
  .grid-wrap[data-layout='list'] .tile {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 8px 8px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--card-border);
    box-shadow: var(--shadow-soft);
  }
  .grid-wrap[data-layout='list'] .pic {
    flex: none;
    width: 60px;
    border-radius: 12px;
  }
  .grid-wrap[data-layout='list'] .dotbadge {
    top: 3px;
    width: 20px;
    height: 20px;
  }
  .grid-wrap[data-layout='list'] .dotbadge :global(svg) {
    width: 12px;
    height: 12px;
  }
  .grid-wrap[data-layout='list'] .fav {
    right: 3px;
  }
  .grid-wrap[data-layout='list'] .stain {
    left: 3px;
  }
  .grid-wrap[data-layout='list'] .check {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .grid-wrap[data-layout='list'] .cat {
    margin-top: 0;
  }
  .state-inline {
    align-self: flex-start;
    margin: 2px 4px 0;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.75rem;
  }
  /* 3 per riga: testi più piccoli. */
  .grid-wrap[data-layout='grid3'] .name {
    font-size: 0.8125rem;
  }
  .grid-wrap[data-layout='grid3'] .dotbadge,
  .grid-wrap[data-layout='grid4'] .dotbadge {
    top: 5px;
    width: 24px;
    height: 24px;
  }
  .grid-wrap[data-layout='grid3'] .fav,
  .grid-wrap[data-layout='grid4'] .fav {
    right: 5px;
  }
  .grid-wrap[data-layout='grid3'] .stain,
  .grid-wrap[data-layout='grid4'] .stain {
    left: 5px;
  }
  .grid-wrap[data-layout='grid3'] .dotbadge :global(svg),
  .grid-wrap[data-layout='grid4'] .dotbadge :global(svg) {
    width: 13px;
    height: 13px;
  }
  .grid-wrap[data-layout='grid3'] .state,
  .grid-wrap[data-layout='grid4'] .state {
    left: 4px;
    right: 4px;
    bottom: 4px;
    padding: 2px 6px;
    font-size: 0.625rem;
  }
  /* 4 per riga: solo foto e nome. */
  .grid-wrap[data-layout='grid4'] .pic {
    border-radius: 14px;
  }
  .grid-wrap[data-layout='grid4'] .name {
    font-size: 0.75rem;
    padding: 0 2px;
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
  .tile {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    /* Tenendo premuto: niente selezione del testo né menu dell'immagine. */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .pic {
    position: relative;
    display: block;
    aspect-ratio: 3 / 4;
    border-radius: var(--radius-tile);
    overflow: hidden;
    background: var(--surface-2);
  }
  .tile.sel .pic {
    outline: 3px solid var(--accent);
    outline-offset: -1px;
  }
  .dotbadge {
    position: absolute;
    top: 8px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--surface);
    display: grid;
    place-items: center;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
  }
  .fav {
    right: 8px;
    color: var(--accent);
  }
  .stain {
    left: 8px;
    color: var(--danger);
  }
  .state {
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 0.6875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .check {
    position: absolute;
    top: 8px;
    left: 8px;
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
    padding: 0 4px;
    font-size: 0.9375rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat {
    padding: 0 4px;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: -4px;
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
    border-radius: 22px;
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
  .empty h1 {
    margin: 0;
    font-size: calc(1.875rem * var(--display-scale));
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
