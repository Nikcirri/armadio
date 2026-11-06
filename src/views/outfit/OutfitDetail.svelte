<script lang="ts">
  import { db } from '../../lib/db';
  import {
    addItemsToOutfit,
    deleteOutfitCascade,
    duplicateOutfit,
    restoreOutfitDeletion,
    saveOutfitLayout,
    toggleOutfitFavorite,
  } from '../../lib/db/outfits';
  import type {
    CategoryRecord,
    DiaryRecord,
    ItemRecord,
    ListRecord,
    OutfitLayoutEntry,
    OutfitRecord,
    WearLogRecord,
    WishlistRecord,
  } from '../../lib/db/types';
  import { labelOf, SEASONS } from '../../lib/logic/labels';
  import {
    autoLayout,
    describeWears,
    MAX_SCALE,
    mergeLayout,
    MIN_SCALE,
    outfitPalette,
    outfitPieces,
    outfitWarnings,
    outfitWearStats,
    scaleEntry,
    bringToFront,
    semaphore,
    WEATHER_TAGS,
  } from '../../lib/logic/outfits';
  import { joinNames, suggestUnderwear } from '../../lib/logic/underwear';
  import { fileStamp, formatDateIt, todayKey } from '../../lib/logic/util';
  import { renderCollageImage } from '../../lib/media/collage';
  import { isShareCancel, saveImageToGallery, shareImage } from '../../lib/media/gallery';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast, showUndoToast, withBusy } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import { wearWithUndo } from './actions';
  import OutfitCollage from './OutfitCollage.svelte';
  import PaletteBar from './PaletteBar.svelte';
  import SemaphoreBox from './SemaphoreBox.svelte';
  import WearDateSheet from './WearDateSheet.svelte';

  let {
    outfitId,
    onclose,
    onedit,
    onopenoutfit,
    onopenitem,
    onnewmemory,
    onopenmemory,
  }: {
    outfitId: string;
    onclose: () => void;
    onedit: (id: string) => void;
    onopenoutfit: (id: string) => void;
    onopenitem: (id: string) => void;
    onnewmemory: (outfitId: string) => void;
    onopenmemory: (entryId: string) => void;
  } = $props();

  const outfit = live(() => db.outfits.get(outfitId), undefined as OutfitRecord | undefined);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);
  const wears = live(() => db.wearLog.where('outfitId').equals(outfitId).toArray(), [] as WearLogRecord[]);
  const memories = live(() => db.diary.where('outfitId').equals(outfitId).toArray(), [] as DiaryRecord[]);

  let editing = $state(false);
  let work = $state<OutfitLayoutEntry[]>([]);
  let selected = $state<string | null>(null);
  let pickingDate = $state(false);

  const o = $derived(outfit.value);
  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const wishById = $derived(new Map(wishlist.value.map((w) => [w.id, w])));
  const seasonBoxId = $derived(lists.value.find((l) => l.kind === 'location' && l.extra.key === 'seasonBox')?.id ?? null);
  const pieces = $derived(o ? outfitPieces(o, itemsById, wishById, categories.value) : []);
  const layout = $derived(o ? mergeLayout(o.layout, pieces) : []);
  const light = $derived(semaphore(pieces, itemsById, seasonBoxId));
  const palette = $derived(outfitPalette(pieces));
  const ownItems = $derived(pieces.filter((p) => p.source === 'item').map((p) => itemsById.get(p.id)!));
  const warnings = $derived(outfitWarnings(ownItems));
  // Intimo collegato ai capi ma non nell'outfit (SPEC 8.2).
  const underSuggest = $derived(
    suggestUnderwear(
      ownItems.filter((i) => i.slotType !== 'underwear'),
      itemsById,
      seasonBoxId,
      ownItems.map((i) => i.id),
    ),
  );

  async function addUnderwear(id: string, name: string) {
    if (!o) return;
    try {
      await addItemsToOutfit(db, o.id, [id]);
      showToast(`${name} aggiunto all’outfit`);
    } catch (e) {
      reportError(e);
    }
  }
  const stats = $derived(outfitWearStats(wears.value).get(outfitId));
  const occasionNames = $derived(
    (o?.occasions ?? []).map((id) => lists.value.find((l) => l.id === id)?.name).filter((n): n is string => !!n),
  );
  const weatherLabels = $derived(WEATHER_TAGS.filter((t) => o?.weatherTags.includes(t.id)));
  const sortedMemories = $derived([...memories.value].sort((a, b) => b.date.localeCompare(a.date)));

  // Se l'outfit sparisce (eliminato da un'altra parte), la pagina si chiude.
  $effect(() => {
    if (outfit.ready && !outfit.value) onclose();
  });

  async function wear(date: string) {
    if (!o) return;
    pickingDate = false;
    const blocked = light.blockers.filter((b) => itemsById.has(b.id));
    if (!ownItems.length) return showToast('L’outfit non ha capi del tuo armadio da segnare.');
    if (blocked.length) {
      const ok = await confirmDialog({
        title: 'Alcuni capi non sono disponibili',
        message: `${blocked.map((b) => `${b.name}: ${b.reason}`).join('\n')}\n\nVuoi segnarlo come indossato lo stesso?`,
        confirmLabel: 'Sì, indossato',
      });
      if (!ok) return;
    }
    await wearWithUndo(
      ownItems.map((i) => i.id),
      date,
      o.id,
    );
  }

  function startEditing() {
    work = $state.snapshot(layout) as OutfitLayoutEntry[];
    selected = null;
    editing = true;
  }

  async function finishEditing() {
    try {
      await saveOutfitLayout(db, outfitId, $state.snapshot(work) as OutfitLayoutEntry[]);
      editing = false;
      selected = null;
      showToast('Disposizione salvata');
    } catch (e) {
      reportError(e);
    }
  }

  function resize(factor: number) {
    if (!selected) return;
    const e = work.find((x) => x.itemId === selected);
    if (e) work = scaleEntry(work, selected, Math.min(MAX_SCALE, Math.max(MIN_SCALE, e.scale * factor)));
  }

  async function makeImage(): Promise<Blob> {
    return renderCollageImage({
      title: o?.name ?? 'Outfit',
      subtitle: occasionNames.join(' · ') || undefined,
      layout,
      photoOf: new Map(pieces.map((p) => [p.id, p.photoId])),
      nameOf: new Map(pieces.map((p) => [p.id, p.name])),
      palette,
    });
  }

  const fileName = () => `Outfit-${(o?.name ?? 'outfit').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}-${fileStamp()}.jpg`;

  async function share() {
    try {
      const blob = await withBusy('Preparo l’immagine…', makeImage);
      await shareImage(blob, fileName(), o?.name ?? 'Outfit');
    } catch (e) {
      if (!isShareCancel(e)) reportError(e, 'Non sono riuscito a condividere l’immagine.');
    }
  }

  async function saveToGallery() {
    try {
      const where = await withBusy('Salvo l’immagine…', async () => saveImageToGallery(await makeImage(), fileName()));
      showToast(where === 'gallery' ? 'Immagine salvata in galleria (Immagini/Armadio)' : 'Immagine scaricata');
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare l’immagine.');
    }
  }

  async function favorite() {
    try {
      const on = await toggleOutfitFavorite(db, outfitId);
      showToast(on ? 'Aggiunto ai preferiti' : 'Tolto dai preferiti');
    } catch (e) {
      reportError(e);
    }
  }

  async function duplicate() {
    try {
      const copy = await duplicateOutfit(db, outfitId);
      showToast('Copia creata');
      onopenoutfit(copy.id);
    } catch (e) {
      reportError(e);
    }
  }

  async function remove() {
    if (!o) return;
    const ok = await confirmDialog({
      title: `Eliminare “${o.name}”?`,
      message: 'Viene tolto da viaggi e agenda. I ricordi del diario e lo storico di quando l’hai indossato restano.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      const snap = await deleteOutfitCascade(db, outfitId);
      onclose();
      showUndoToast('Outfit eliminato', () => restoreOutfitDeletion(db, snap));
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Page title={o?.name ?? 'Outfit'} {onclose}>
  {#snippet actions()}
    {#if o}
      <button class="icon-btn fav" aria-label={o.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'} aria-pressed={o.favorite} onclick={favorite}>
        <Icon name={o.favorite ? 'heartFilled' : 'heart'} />
      </button>
    {/if}
  {/snippet}

  {#if o}
    {#if o.incomplete}
      <p class="warning top">Un capo di questo outfit è stato eliminato. Modificalo per completarlo.</p>
    {/if}

    <div class="collage">
      <OutfitCollage
        {pieces}
        layout={editing ? work : layout}
        kind="main"
        editable={editing}
        {selected}
        onselect={(id) => (selected = id)}
        onchange={(l) => (work = l)}
        label="Collage di {o.name}"
      />
    </div>

    {#if editing}
      <p class="note center">Trascina un pezzo per spostarlo. Con due dita lo ingrandisci o rimpicciolisci.</p>
      <div class="edit-bar">
        <button class="btn" disabled={!selected} aria-label="Rimpicciolisci" onclick={() => resize(0.9)}>−</button>
        <button class="btn" disabled={!selected} aria-label="Ingrandisci" onclick={() => resize(1.1)}>+</button>
        <button class="btn" disabled={!selected} onclick={() => selected && (work = bringToFront(work, selected))}>Davanti</button>
        <button class="btn" onclick={() => (work = autoLayout(pieces))}>Ripristina</button>
      </div>
      <div class="edit-bar">
        <button class="btn btn-ghost" onclick={() => ((editing = false), (selected = null))}>Annulla</button>
        <button class="btn btn-primary grow" onclick={finishEditing}>Salva disposizione</button>
      </div>
    {:else}
      <button class="link move" onclick={startEditing}><Icon name="move" size={18} /> Sposta i pezzi</button>

      <SemaphoreBox state={light} />

      <div class="primary">
        <button class="btn btn-primary grow" onclick={() => wear(todayKey())}>Indossa oggi</button>
        <button class="btn" onclick={() => (pickingDate = true)}><Icon name="calendar" size={20} /> Altra data</button>
      </div>
      <p class="note">{describeWears(stats, formatDateIt)}</p>

      {#if palette.length}
        <h2 class="section-title">Palette</h2>
        <PaletteBar colors={palette} />
      {/if}

      {#if warnings.length || underSuggest.length}
        <h2 class="section-title">Da ricordare</h2>
        <ul class="warnings">
          {#each underSuggest as sug (sug.item.id)}
            <li class="warning under">
              <span><span aria-hidden="true">👙</span> Sotto {joinNames(sug.forNames)}: <strong>{sug.item.name}</strong>{sug.reason ? ` (${sug.reason})` : ''}</span>
              <button class="btn" onclick={() => addUnderwear(sug.item.id, sug.item.name)}>Aggiungi</button>
            </li>
          {/each}
          {#each warnings as w (w.text)}<li class="warning"><span aria-hidden="true">{w.kind === 'intimate' ? '👙' : '📏'}</span> {w.text}</li>{/each}
        </ul>
      {/if}

      <h2 class="section-title">Capi</h2>
      <div class="list">
        {#each pieces as p (p.id)}
          {@const blocker = light.blockers.find((b) => b.id === p.id)}
          {#if p.source === 'item'}
            <button class="row" onclick={() => onopenitem(p.id)}>
              <span class="mini"><PhotoThumb photoId={p.photoId} alt={p.name} /></span>
              <span class="grow">{p.name}<span class="sub" class:bad={!!blocker}>{blocker ? blocker.reason : 'disponibile'}</span></span>
              <Icon name="chevron" size={18} />
            </button>
          {:else}
            <div class="row static">
              <span class="mini"><PhotoThumb photoId={p.photoId} alt={p.name} /></span>
              <span class="grow">{p.name}<span class="sub">dalla wishlist, da comprare</span></span>
            </div>
          {/if}
        {/each}
      </div>

      {#if occasionNames.length || o.season || weatherLabels.length || o.notes}
        <h2 class="section-title">Dettagli</h2>
        <div class="card details">
          {#if occasionNames.length}<p><span>Occasioni</span>{occasionNames.join(', ')}</p>{/if}
          {#if o.season}<p><span>Stagione</span>{labelOf(SEASONS, o.season)}</p>{/if}
          {#if weatherLabels.length}<p><span>Meteo</span>{weatherLabels.map((t) => `${t.emoji} ${t.label}`).join('  ')}</p>{/if}
          {#if o.notes}<p><span>Note</span>{o.notes}</p>{/if}
        </div>
      {/if}

      <h2 class="section-title">Ricordi</h2>
      {#if sortedMemories.length}
        <div class="list">
          {#each sortedMemories as m (m.id)}
            <button class="row" onclick={() => onopenmemory(m.id)}>
              <span class="grow">
                {formatDateIt(m.date)}{m.location ? ` · ${m.location}` : ''}
                <span class="sub">{[m.people.join(', '), m.note].filter(Boolean).join(' — ') || 'Nessuna nota'}</span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          {/each}
        </div>
      {/if}
      <button class="btn btn-block memory" onclick={() => onnewmemory(o.id)}><Icon name="plus" size={20} /> Aggiungi un ricordo</button>

      <div class="actions">
        <button class="btn" onclick={() => onedit(o.id)}><Icon name="edit" size={20} /> Modifica</button>
        <button class="btn" onclick={share}><Icon name="share" size={20} /> Condividi</button>
        <button class="btn" onclick={saveToGallery}><Icon name="image" size={20} /> Salva in galleria</button>
        <button class="btn" onclick={duplicate}><Icon name="copy" size={20} /> Duplica</button>
        <button class="btn btn-danger" onclick={remove}><Icon name="trash" size={20} /> Elimina</button>
      </div>
    {/if}
  {/if}
</Page>

{#if pickingDate}
  <WearDateSheet onpick={wear} onclose={() => (pickingDate = false)} />
{/if}

<style>
  .top {
    margin: 4px 0 12px;
  }
  .collage {
    width: min(100%, 420px);
    margin: 4px auto 0;
  }
  .center {
    text-align: center;
  }
  .move {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px auto 12px;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
    min-height: 44px;
    padding: 0 8px;
    cursor: pointer;
  }
  .edit-bar {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .edit-bar .btn {
    flex: 1;
    padding: 0 10px;
  }
  .edit-bar .grow {
    flex: 2;
  }
  .primary {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .primary .grow {
    flex: 1;
  }
  .under {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .under > span {
    flex: 1;
  }
  .under .btn {
    min-height: 40px;
    padding: 0 14px;
    font-size: 0.8125rem;
    flex-shrink: 0;
  }
  .warnings {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mini {
    flex: none;
    width: 44px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
  }
  .row.static {
    cursor: default;
  }
  .sub.bad {
    color: var(--danger);
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .details p {
    margin: 0;
    line-height: 1.45;
  }
  .details span {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .memory {
    margin-top: 10px;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 24px;
  }
  .actions .btn {
    padding: 0 12px;
  }
  .actions .btn-danger {
    grid-column: 1 / -1;
  }
  .fav {
    color: var(--accent);
  }
</style>
