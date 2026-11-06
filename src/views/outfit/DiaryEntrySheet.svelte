<script lang="ts">
  import { db } from '../../lib/db';
  import { deleteDiaryEntry, discardPhotos, restoreDiaryEntry, saveDiaryEntry } from '../../lib/db/outfits';
  import type { CategoryRecord, DiaryRecord, ItemRecord, ListRecord, OutfitRecord, WishlistRecord } from '../../lib/db/types';
  import { knownPeople, mergeLayout, outfitPieces } from '../../lib/logic/outfits';
  import { todayKey } from '../../lib/logic/util';
  import { chooseFromGallery, takePhoto } from '../../lib/media/acquire';
  import { storePhoto } from '../../lib/media/photos';
  import { decodeBlob } from '../../lib/media/pipeline';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast, showUndoToast, withBusy } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import PickerSheet from '../../lib/ui/PickerSheet.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import ItemPickerSheet from './ItemPickerSheet.svelte';
  import OutfitCollage from './OutfitCollage.svelte';
  import PeopleInput from './PeopleInput.svelte';
  import Polaroid from './Polaroid.svelte';

  /** Nuovo ricordo o modifica (SPEC 8.2): data, luogo, persone, nota, foto polaroid e outfit. */
  let {
    entryId = null,
    presetOutfitId = null,
    onclose,
    onphoto,
  }: {
    entryId?: string | null;
    presetOutfitId?: string | null;
    onclose: () => void;
    onphoto: (photoIds: string[], index: number) => void;
  } = $props();

  const MAX_PHOTOS = 6;

  const entry = live(() => (entryId ? db.diary.get(entryId) : Promise.resolve(undefined)), undefined as DiaryRecord | undefined);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);
  const diary = live(() => db.diary.toArray(), [] as DiaryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);

  let ready = $state(false);
  let date = $state(todayKey());
  let wearMode = $state<'outfit' | 'items'>('outfit');
  let outfitId = $state<string | null>(null);
  let itemIds = $state<string[]>([]);
  let location = $state('');
  let people = $state<string[]>([]);
  let note = $state('');
  let photoIds = $state<string[]>([]);
  let added: string[] = [];
  let original = '';
  let picking = $state<'outfit' | 'items' | null>(null);
  let saving = $state(false);

  $effect(() => {
    if (ready || (entryId && !entry.ready)) return;
    const e = entry.value;
    if (e) {
      date = e.date;
      outfitId = e.outfitId;
      itemIds = [...e.itemIds];
      wearMode = e.outfitId || !e.itemIds.length ? 'outfit' : 'items';
      location = e.location;
      people = [...e.people];
      note = e.note;
      photoIds = [...e.photoIds];
    } else if (presetOutfitId) {
      outfitId = presetOutfitId;
    }
    ready = true;
    original = snapshot();
  });

  function snapshot(): string {
    return JSON.stringify({ date, outfitId, itemIds: [...itemIds], location, people: [...people], note, photoIds: [...photoIds] });
  }

  const dirty = $derived(ready && snapshot() !== original);
  const known = $derived(knownPeople(diary.value, lists.value));
  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const chosenOutfit = $derived(outfitId ? outfits.value.find((o) => o.id === outfitId) : undefined);
  const outfitView = $derived.by(() => {
    if (!chosenOutfit) return null;
    const pieces = outfitPieces(chosenOutfit, itemsById, new Map(wishlist.value.map((w) => [w.id, w])), categories.value);
    return { pieces, layout: mergeLayout(chosenOutfit.layout, pieces) };
  });
  const chosenItems = $derived(itemIds.map((id) => itemsById.get(id)).filter((i): i is ItemRecord => !!i));
  const validDate = $derived(/^\d{4}-\d{2}-\d{2}$/.test(date));

  async function addPhotos(source: 'camera' | 'gallery') {
    const room = MAX_PHOTOS - photoIds.length;
    if (room <= 0) return showToast(`Al massimo ${MAX_PHOTOS} foto per ricordo`);
    try {
      const blobs = source === 'camera' ? [await takePhoto()].filter((b): b is Blob => !!b) : await chooseFromGallery(true);
      if (!blobs.length) return;
      if (blobs.length > room) showToast(`Aggiungo solo le prime ${room} foto (massimo ${MAX_PHOTOS})`);
      await withBusy('Salvo le foto…', async () => {
        for (const blob of blobs.slice(0, room)) {
          const id = await storePhoto(await decodeBlob(blob));
          added.push(id);
          photoIds = [...photoIds, id];
        }
      });
    } catch (e) {
      reportError(e, 'Non riesco ad aggiungere la foto.');
    }
  }

  async function removePhoto(id: string) {
    photoIds = photoIds.filter((p) => p !== id);
    if (added.includes(id)) {
      added = added.filter((p) => p !== id);
      await discardPhotos(db, [id]).catch(reportError);
    }
  }

  async function requestClose() {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Uscire senza salvare?',
        message: 'Il ricordo e le foto nuove andranno persi.',
        confirmLabel: 'Esci',
        danger: true,
      });
      if (!ok) return;
    }
    await discardPhotos(db, added).catch(reportError);
    added = [];
    onclose();
  }

  async function save() {
    if (saving || !validDate) return;
    saving = true;
    try {
      await saveDiaryEntry(
        db,
        {
          date,
          outfitId: wearMode === 'outfit' ? outfitId : null,
          itemIds: wearMode === 'items' ? [...itemIds] : [],
          location,
          people: [...people],
          note,
          photoIds: [...photoIds],
        },
        entryId,
      );
      added = [];
      showToast(entryId ? 'Ricordo salvato' : 'Ricordo aggiunto al diario');
      onclose();
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare il ricordo.');
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!entryId) return;
    const ok = await confirmDialog({
      title: 'Eliminare il ricordo?',
      message: 'Vengono eliminate anche le sue foto. Gli outfit e lo storico restano.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await discardPhotos(db, added);
      added = [];
      const snap = await deleteDiaryEntry(db, entryId);
      onclose();
      showUndoToast('Ricordo eliminato', () => restoreDiaryEntry(db, snap));
    } catch (e) {
      reportError(e);
    }
  }

  function toggleItem(id: string) {
    itemIds = itemIds.includes(id) ? itemIds.filter((x) => x !== id) : [...itemIds, id];
  }
</script>

<Sheet title={entryId ? 'Ricordo' : 'Nuovo ricordo'} onclose={requestClose}>
  {#if ready}
    <div class="stack">
      <label class="field">
        <span>Data</span>
        <input class="input" type="date" bind:value={date} />
      </label>

      <div class="field">
        <span>Cosa indossavi</span>
        <div class="segmented" role="group" aria-label="Cosa indossavi">
          <button aria-pressed={wearMode === 'outfit'} onclick={() => (wearMode = 'outfit')}>Un outfit</button>
          <button aria-pressed={wearMode === 'items'} onclick={() => (wearMode = 'items')}>Dei capi</button>
        </div>
        {#if wearMode === 'outfit'}
          {#if outfitView && chosenOutfit}
            <div class="chosen-outfit">
              <div class="mini-collage"><OutfitCollage pieces={outfitView.pieces} layout={outfitView.layout} /></div>
              <div class="grow">
                <strong>{chosenOutfit.name}</strong>
                <div class="links">
                  <button class="link" onclick={() => (picking = 'outfit')}>Cambia</button>
                  <button class="link" onclick={() => (outfitId = null)}>Togli</button>
                </div>
              </div>
            </div>
          {:else}
            <button class="btn" onclick={() => (picking = 'outfit')}><Icon name="plus" size={20} /> Scegli un outfit</button>
          {/if}
        {:else}
          {#if chosenItems.length}
            <div class="thumbs">
              {#each chosenItems as it (it.id)}
                <span class="thumb"><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></span>
              {/each}
            </div>
          {/if}
          <button class="btn" onclick={() => (picking = 'items')}>
            <Icon name={chosenItems.length ? 'edit' : 'plus'} size={20} />
            {chosenItems.length ? `Capi scelti: ${chosenItems.length}` : 'Scegli i capi'}
          </button>
        {/if}
      </div>

      <label class="field">
        <span>Luogo</span>
        <input class="input" bind:value={location} placeholder="Es. Cena da Marco, Firenze" maxlength="80" />
      </label>

      <div class="field">
        <span>Con chi</span>
        <PeopleInput value={people} {known} onchange={(p) => (people = p)} />
      </div>

      <label class="field">
        <span>Nota</span>
        <textarea class="input" rows="3" bind:value={note} placeholder="Com’è andata?"></textarea>
      </label>

      <div class="field">
        <span>Foto ({photoIds.length}/{MAX_PHOTOS})</span>
        {#if photoIds.length}
          <div class="polaroids">
            {#each photoIds as pid, i (pid)}
              <div class="pol">
                <button class="open" aria-label="Apri la foto {i + 1}" onclick={() => onphoto([...photoIds], i)}>
                  <Polaroid photoId={pid} index={i} />
                </button>
                <button class="remove" aria-label="Togli la foto {i + 1}" onclick={() => removePhoto(pid)}><Icon name="close" size={16} /></button>
              </div>
            {/each}
          </div>
        {/if}
        {#if photoIds.length < MAX_PHOTOS}
          <div class="row-btns">
            <button class="btn" onclick={() => addPhotos('camera')}><Icon name="camera" size={20} /> Scatta</button>
            <button class="btn" onclick={() => addPhotos('gallery')}><Icon name="image" size={20} /> Galleria</button>
          </div>
        {/if}
      </div>

      {#if entryId}
        <button class="btn btn-danger" onclick={remove}><Icon name="trash" size={20} /> Elimina ricordo</button>
      {/if}
    </div>
  {:else}
    <p class="note">Carico…</p>
  {/if}

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={requestClose}>Annulla</button>
    <button class="btn btn-primary" disabled={saving || !validDate} onclick={save}>Salva</button>
  {/snippet}
</Sheet>

{#if picking === 'outfit'}
  <PickerSheet
    title="Quale outfit?"
    options={[...outfits.value]
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .map((o) => ({ id: o.id, label: o.name, sub: o.itemIds.length === 1 ? '1 capo' : `${o.itemIds.length} capi` }))}
    empty="Non hai ancora outfit: puoi scegliere i singoli capi."
    onpick={(id) => {
      outfitId = id;
      picking = null;
    }}
    onclose={() => (picking = null)}
  />
{:else if picking === 'items'}
  <ItemPickerSheet
    title="Cosa indossavi"
    items={items.value}
    selected={itemIds}
    multiple
    seasonBoxId={null}
    onlyAvailableByDefault={false}
    onpick={toggleItem}
    onclose={() => (picking = null)}
  />
{/if}

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .chosen-outfit {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .mini-collage {
    width: 96px;
    flex: none;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .links {
    display: flex;
    gap: 4px;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
    min-height: 40px;
    padding: 0 6px;
    cursor: pointer;
  }
  .thumbs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
  }
  .thumb {
    flex: none;
    width: 56px;
    height: 72px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .polaroids {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px 12px;
    padding: 6px 4px 2px;
  }
  .pol {
    position: relative;
  }
  .open {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .remove {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.65);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .row-btns {
    display: flex;
    gap: 8px;
  }
  .row-btns .btn {
    flex: 1;
  }
</style>
