<script lang="ts">
  import { db } from '../../lib/db';
  import { removeItemPhoto, setItemCover, updateItemFields } from '../../lib/db/items';
  import { deleteItemCascade, getItemUsage, restoreItemDeletion } from '../../lib/db/repo';
  import type { ColorId, ItemRecord } from '../../lib/db/types';
  import { describeUsage } from '../../lib/logic/integrity';
  import { MAX_ITEM_PHOTOS } from '../../lib/logic/itemPhotos';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import ColorChips from '../../lib/ui/ColorChips.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let {
    itemId,
    onclose,
    onopenphoto,
    oneditphoto,
    onaddphoto,
  }: {
    itemId: string;
    onclose: () => void;
    onopenphoto: (photoIds: string[], index: number, name: string) => void;
    oneditphoto: (itemId: string, photoId: string) => void;
    onaddphoto: (itemId: string, source: 'camera' | 'gallery') => void;
  } = $props();

  const item = live(() => db.items.get(itemId), undefined as ItemRecord | undefined);
  const category = live(async () => {
    const it = await db.items.get(itemId);
    return it ? db.categories.get(it.categoryId) : undefined;
  }, undefined);

  let menuFor = $state<string | null>(null);

  /** Chiude il menu della foto e poi esegue l'azione (l'id va letto prima di chiudere). */
  function fromMenu(fn: (photoId: string) => void) {
    const pid = menuFor;
    menuFor = null;
    if (pid) fn(pid);
  }
  const LABELS = ['Fronte', 'Retro', 'Etichetta', 'Indossato'];

  function rename(value: string) {
    updateItemFields(db, itemId, { name: value }).catch(reportError);
  }
  function setColors(colors: ColorId[]) {
    updateItemFields(db, itemId, { colors }).catch(reportError);
  }

  async function cover(photoId: string) {
    await setItemCover(db, itemId, photoId).catch(reportError);
    showToast('Copertina cambiata');
  }

  async function removePhoto(photoId: string) {
    const ok = await confirmDialog({ title: 'Eliminare questa foto?', confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    await removeItemPhoto(db, itemId, photoId).catch(reportError);
  }

  async function deleteItem() {
    const it = item.value;
    if (!it) return;
    try {
      const usage = await getItemUsage(db, it.id);
      const ok = await confirmDialog({
        title: `Eliminare “${it.name}”?`,
        message: describeUsage(usage),
        confirmLabel: 'Elimina',
        danger: true,
      });
      if (!ok) return;
      const snap = await deleteItemCascade(db, it.id);
      onclose();
      showUndoToast(`“${it.name}” eliminato`, () => restoreItemDeletion(db, snap));
    } catch (e) {
      reportError(e);
    }
  }
</script>

{#if item.value}
  {@const it = item.value}
  <Sheet title={it.name} {onclose}>
    <div class="layout">
      <label class="field">
        <span>Nome</span>
        <input class="input" value={it.name} maxlength="60" onchange={(e) => rename(e.currentTarget.value)} />
      </label>
      {#if category.value}
        <p class="cat">{category.value.icon} {category.value.name}</p>
      {/if}

      <div class="field">
        <span>Foto ({it.photoIds.length} di {MAX_ITEM_PHOTOS})</span>
        <div class="photos">
          {#each it.photoIds as pid, i (pid)}
            <div class="slot">
              <button class="pic" aria-label="Apri foto {i + 1}" onclick={() => onopenphoto(it.photoIds, i, it.name)}>
                <PhotoThumb photoId={pid} alt="{it.name}, foto {i + 1}" />
              </button>
              <span class="tag">{i === 0 ? 'Copertina' : (LABELS[i] ?? `Foto ${i + 1}`)}</span>
              <button class="more" aria-label="Azioni foto {i + 1}" onclick={() => (menuFor = pid)}>
                <Icon name="more" size={18} />
              </button>
            </div>
          {/each}
          {#if it.photoIds.length < MAX_ITEM_PHOTOS}
            <div class="slot add">
              <button class="addbtn" onclick={() => onaddphoto(it.id, 'camera')}>Scatta</button>
              <button class="addbtn" onclick={() => onaddphoto(it.id, 'gallery')}>Galleria</button>
            </div>
          {/if}
        </div>
      </div>

      <div class="field">
        <span>Colori</span>
        <ColorChips value={it.colors} onchange={setColors} />
      </div>

      <p class="note">La scheda completa del capo (stato, tessuto, stagione, prezzo, lavaggi…) arriva con la Fase 3.</p>

      <button class="btn btn-danger" onclick={deleteItem}><Icon name="trash" size={20} /> Elimina capo</button>
    </div>
  </Sheet>

  {#if menuFor}
    {@const pid = menuFor}
    <Sheet title="Foto" onclose={() => (menuFor = null)}>
      <div class="list">
        <button class="row" onclick={() => fromMenu((id) => onopenphoto(it.photoIds, it.photoIds.indexOf(id), it.name))}>
          <span class="grow">Apri a schermo intero</span>
        </button>
        <button class="row" onclick={() => fromMenu((id) => oneditphoto(it.id, id))}>
          <span class="grow">Modifica (ruota, ritaglia, luce, scontorna)</span>
        </button>
        {#if it.photoIds[0] !== pid}
          <button class="row" onclick={() => fromMenu(cover)}><span class="grow">Usa come copertina</span></button>
        {/if}
        <button class="row danger" onclick={() => fromMenu(removePhoto)}><span class="grow">Elimina foto</span></button>
      </div>
    </Sheet>
  {/if}
{/if}

<style>
  .layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .cat {
    margin: -6px 0 0;
    color: var(--text-muted);
  }
  .photos {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pic {
    aspect-ratio: 3 / 4;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
  }
  .tag {
    font-size: 0.6875rem;
    color: var(--text-muted);
    text-align: center;
  }
  .more {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 0;
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .add {
    aspect-ratio: 3 / 4;
    border: 2px dashed var(--border);
    border-radius: 12px;
    justify-content: center;
    padding: 4px;
  }
  .addbtn {
    min-height: 40px;
    border: 0;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .danger {
    color: var(--danger);
  }
</style>
