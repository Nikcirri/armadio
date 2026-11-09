<script lang="ts">
  import { db } from '../../lib/db';
  import { deleteWish, restoreWish, saveWish } from '../../lib/db/altro';
  import { discardPhotos } from '../../lib/db/outfits';
  import type { CategoryRecord, ColorId, ListRecord, Season, WishlistRecord } from '../../lib/db/types';
  import type { Img } from '../../lib/logic/imageOps';
  import { SEASONS, euroInput, parseEuro } from '../../lib/logic/labels';
  import { PRIORITIES, type Priority } from '../../lib/logic/wishlist';
  import { chooseFromGallery, takePhoto } from '../../lib/media/acquire';
  import { storePhoto } from '../../lib/media/photos';
  import { colorsOf, decodeBlob } from '../../lib/media/pipeline';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast, showUndoToast, withBusy } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import ChipGroup from '../../lib/ui/ChipGroup.svelte';
  import ColorChips from '../../lib/ui/ColorChips.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import Lazy from '../../lib/ui/Lazy.svelte';
  import { photoEditor } from '../../lib/ui/photoEditor';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  /** Nuovo desiderio o modifica (SPEC 8.5): foto, prezzo, link o negozio, priorità. */
  let { wish = null, onclose }: { wish?: WishlistRecord | null; onclose: () => void } = $props();

  const categories = live(() => db.categories.orderBy('order').toArray(), [] as CategoryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);

  // svelte-ignore state_referenced_locally
  const start = wish;
  let name = $state(start?.name ?? '');
  let categoryId = $state(start?.categoryId ?? '');
  let photoIds = $state<string[]>([...(start?.photoIds ?? [])]);
  let priceText = $state(euroInput(start?.price ?? null));
  let store = $state(start?.storeOrLink ?? '');
  let colors = $state<ColorId[]>([...(start?.colors ?? [])]);
  let detected = $state<ColorId[]>([]);
  let season = $state<Season | null>(start?.season ?? null);
  let occasions = $state<string[]>([...(start?.occasions ?? [])]);
  let priority = $state<Priority>(start?.priority ?? 'medium');
  let notes = $state(start?.notes ?? '');
  let editor = $state.raw<Img | null>(null);
  let added: string[] = [];
  let saving = $state(false);

  const occasionOptions = $derived(
    lists.value
      .filter((l) => l.kind === 'occasion')
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ id: l.id, label: l.name })),
  );

  async function acquire(source: 'camera' | 'gallery') {
    try {
      const blob = source === 'camera' ? await takePhoto() : (await chooseFromGallery(false))[0];
      if (!blob) return;
      editor = await withBusy('Apro la foto…', () => decodeBlob(blob));
    } catch (e) {
      reportError(e, 'Non riesco ad aprire la foto.');
    }
  }

  async function onEdited(img: Img) {
    editor = null;
    try {
      await withBusy('Salvo la foto…', async () => {
        const id = await storePhoto(img);
        added.push(id);
        photoIds = [...photoIds, id];
        if (!colors.length) {
          detected = await colorsOf(img);
          colors = [...detected];
        }
      });
    } catch (e) {
      reportError(e);
    }
  }

  async function removePhoto(id: string) {
    photoIds = photoIds.filter((p) => p !== id);
    if (added.includes(id)) {
      added = added.filter((p) => p !== id);
      await discardPhotos(db, [id]).catch(reportError);
    }
  }

  async function cancel() {
    await discardPhotos(db, added).catch(reportError);
    added = [];
    onclose();
  }

  async function save() {
    const price = parseEuro(priceText);
    if (priceText.trim() && price === null) return showToast('Il prezzo non è un numero valido');
    if (!name.trim()) return showToast('Dai un nome al desiderio');
    saving = true;
    try {
      await saveWish(
        db,
        {
          name,
          categoryId: categoryId || null,
          photoIds: [...photoIds],
          price,
          storeOrLink: store,
          colors: [...colors],
          season,
          occasions: [...occasions],
          priority,
          notes,
        },
        wish?.id ?? null,
      );
      added = [];
      showToast(wish ? 'Desiderio salvato' : 'Aggiunto alla wishlist');
      onclose();
    } catch (e) {
      reportError(e);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!wish) return;
    const ok = await confirmDialog({ title: `Eliminare “${wish.name}”?`, message: 'Viene tolto anche dagli outfit in cui lo provavi.', confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    try {
      await discardPhotos(db, added);
      const snap = await deleteWish(db, wish.id);
      onclose();
      showUndoToast('Desiderio eliminato', () => restoreWish(db, snap));
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Sheet title={wish ? 'Desiderio' : 'Nuovo desiderio'} onclose={cancel}>
  <div class="stack">
    <div class="photos">
      {#each photoIds as pid (pid)}
        <div class="photo">
          <PhotoThumb photoId={pid} alt={name || 'Foto'} />
          <button class="remove" aria-label="Togli la foto" onclick={() => removePhoto(pid)}><Icon name="close" size={16} /></button>
        </div>
      {/each}
      {#if photoIds.length < 4}
        <button class="add" onclick={() => acquire('camera')}><Icon name="camera" size={22} /><span>Scatta</span></button>
        <button class="add" onclick={() => acquire('gallery')}><Icon name="image" size={22} /><span>Galleria</span></button>
      {/if}
    </div>

    <label class="field">
      <span>Nome</span>
      <input class="input" bind:value={name} maxlength="60" placeholder="Es. Mocassini in pelle" />
    </label>
    {#if categories.value.length}
      <label class="field">
        <span>Categoria</span>
        <select class="input" bind:value={categoryId}>
          <option value="">Da decidere</option>
          {#each categories.value as c (c.id)}<option value={c.id}>{c.icon} {c.name}</option>{/each}
        </select>
      </label>
    {/if}
    <div class="two">
      <label class="field">
        <span>Prezzo (€)</span>
        <input class="input" inputmode="decimal" bind:value={priceText} placeholder="Es. 89,90" />
      </label>
      <div class="field">
        <span>Priorità</span>
        <div class="segmented" role="group" aria-label="Priorità">
          {#each PRIORITIES as p (p.id)}
            <button aria-pressed={priority === p.id} onclick={() => (priority = p.id)} title={p.label} aria-label="Priorità {p.label.toLowerCase()}"><span aria-hidden="true">{p.emoji}</span></button>
          {/each}
        </div>
        <span class="hint" aria-hidden="true">{PRIORITIES.find((p) => p.id === priority)?.label}</span>
      </div>
    </div>
    <label class="field">
      <span>Link o negozio</span>
      <input class="input" bind:value={store} placeholder="Es. www.negozio.it oppure Negozio in centro" />
    </label>
    <div class="field">
      <span>Colori</span>
      <ColorChips value={colors} {detected} onchange={(c) => (colors = c)} />
    </div>
    <ChipGroup label="Stagione" single options={SEASONS} value={season ? [season] : []} onchange={(v) => (season = (v[0] as Season | undefined) ?? null)} />
    <ChipGroup label="Occasioni" options={occasionOptions} value={occasions} onchange={(v) => (occasions = v)} />
    <label class="field">
      <span>Note</span>
      <textarea class="input" rows="2" bind:value={notes} placeholder="Es. taglia da provare, aspetto i saldi"></textarea>
    </label>
    {#if wish}
      <button class="btn btn-danger" onclick={remove}><Icon name="trash" size={20} /> Elimina desiderio</button>
    {/if}
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={cancel}>Annulla</button>
    <button class="btn btn-primary" disabled={saving} onclick={save}>Salva</button>
  {/snippet}
</Sheet>

{#if editor}
  <Lazy
    loader={photoEditor}
    variant="full"
    title="Foto del desiderio"
    onclose={() => (editor = null)}
    props={{ img: editor, title: 'Foto del desiderio', saveLabel: 'Usa', onsave: onEdited, oncancel: () => (editor = null) }}
  />
{/if}

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .photos {
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }
  .photo,
  .add {
    position: relative;
    flex: none;
    width: 84px;
    height: 108px;
    border-radius: 12px;
    overflow: hidden;
  }
  .photo {
    border: 1px solid var(--border);
  }
  .add {
    border: 1.5px dashed var(--border);
    background: transparent;
    color: var(--accent);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
  .remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.55);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
  }
</style>
