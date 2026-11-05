<script lang="ts">
  import { db } from '../lib/db';
  import { addItem, addPhotoToItem } from '../lib/db/items';
  import { getCategories } from '../lib/db/repo';
  import type { CategoryRecord, ItemRecord } from '../lib/db/types';
  import type { Img } from '../lib/logic/imageOps';
  import { draftNames } from '../lib/logic/itemPhotos';
  import { MAX_BATCH, chooseFromGallery, takePhoto } from '../lib/media/acquire';
  import { bumpPhoto } from '../lib/media/photoCache.svelte';
  import { loadPhotoImg, replacePhoto, storePhoto } from '../lib/media/photos';
  import { colorsOf, decodeBlob } from '../lib/media/pipeline';
  import { live } from '../lib/state/live.svelte';
  import { showToast, withBusy } from '../lib/state/ui.svelte';
  import { reportError } from '../lib/errors';
  import Fab, { type FabAction } from '../lib/ui/Fab.svelte';
  import Lightbox from '../lib/ui/Lightbox.svelte';
  import PhotoEditor from '../lib/ui/PhotoEditor.svelte';
  import PhotoThumb from '../lib/ui/PhotoThumb.svelte';
  import TabIcon from '../lib/ui/TabIcon.svelte';
  import BatchReviewSheet from './armadio/BatchReviewSheet.svelte';
  import CategoryPickerSheet from './armadio/CategoryPickerSheet.svelte';
  import ItemPhotosSheet from './armadio/ItemPhotosSheet.svelte';
  import QuickAddSheet from './armadio/QuickAddSheet.svelte';

  type EditorState =
    | { kind: 'new'; img: Img }
    | { kind: 'existing'; img: Img; itemId: string; photoId: string }
    | { kind: 'addToItem'; img: Img; itemId: string };

  const items = live(() => db.items.orderBy('createdAt').reverse().toArray(), [] as ItemRecord[]);
  const categories = live(() => getCategories(db), [] as CategoryRecord[]);

  // $state.raw: le immagini sono grandi array di pixel, non servono proxy reattivi.
  let editor = $state.raw<EditorState | null>(null);
  let quickAdd = $state.raw<{ img: Img } | null>(null);
  let pickingBatch = $state(false);
  let review = $state.raw<string[] | null>(null);
  let openItem = $state<string | null>(null);
  let lightbox = $state.raw<{ photoIds: string[]; index: number; name: string } | null>(null);

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
    const existing = (await db.items.toArray()).map((i) => i.name);
    const names = draftNames(category.name, blobs.length, existing);
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

  const actions: FabAction[] = [
    { label: 'Scatta foto', hint: 'Fotocamera posteriore', run: () => void newItem('camera') },
    { label: 'Dalla galleria', hint: 'Una foto o uno screenshot', run: () => void newItem('gallery') },
    { label: 'Multi-foto', hint: `Fino a ${MAX_BATCH} capi in una volta`, run: () => (pickingBatch = true) },
  ];

  const catById = $derived(new Map(categories.value.map((c) => [c.id, c])));
</script>

<div class="armadio">
  {#if items.ready && items.value.length === 0}
    <section class="empty">
      <div class="badge"><TabIcon tab="armadio" size={36} /></div>
      <h1>Il tuo armadio è vuoto</h1>
      <p>Aggiungi il primo capo con una foto. Puoi anche caricarne fino a {MAX_BATCH} in una volta.</p>
      <div class="cta">
        <button class="btn btn-primary" onclick={() => newItem('camera')}>Scatta foto</button>
        <button class="btn" onclick={() => newItem('gallery')}>Dalla galleria</button>
        <button class="btn btn-ghost" onclick={() => (pickingBatch = true)}>Multi-foto</button>
      </div>
    </section>
  {:else}
    <div class="head">
      <h1>Armadio</h1>
      <span class="count">{items.value.length} {items.value.length === 1 ? 'capo' : 'capi'}</span>
    </div>
    <p class="note">Ricerca, filtri e scheda completa arrivano con la Fase 3.</p>
    <ul class="grid">
      {#each items.value as item (item.id)}
        <li>
          <button class="tile" onclick={() => (openItem = item.id)}>
            <span class="pic"><PhotoThumb photoId={item.photoIds[0]} alt={item.name} /></span>
            <span class="name">{item.name}</span>
            <span class="cat">{catById.get(item.categoryId)?.name ?? ''}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Fab {actions} label="Aggiungi capo" />

{#if openItem}
  <ItemPhotosSheet
    itemId={openItem}
    onclose={() => (openItem = null)}
    onopenphoto={(photoIds, index, name) => (lightbox = { photoIds, index, name })}
    oneditphoto={editPhoto}
    onaddphoto={addPhoto}
  />
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
    padding: 16px 16px 110px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 4px 4px 0;
  }
  h1 {
    margin: 0;
    font-size: 1.75rem;
  }
  .count {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .grid {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
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
    display: block;
    aspect-ratio: 3 / 4;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--border);
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
  .empty .badge {
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
