<script lang="ts">
  import { db } from '../../lib/db';
  import { setPlan } from '../../lib/db/agenda';
  import type { CategoryRecord, ItemRecord, OutfitRecord, PlannerRecord, WishlistRecord } from '../../lib/db/types';
  import { dayTitle, planWarnings } from '../../lib/logic/agenda';
  import { mergeLayout, outfitPieces } from '../../lib/logic/outfits';
  import { todayKey } from '../../lib/logic/util';
  import { live } from '../../lib/state/live.svelte';
  import { showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import PickerSheet from '../../lib/ui/PickerSheet.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import ItemPickerSheet from '../outfit/ItemPickerSheet.svelte';
  import OutfitCollage from '../outfit/OutfitCollage.svelte';

  /** Pianifica un giorno dell'agenda: un outfit oppure dei capi, e una nota (SPEC 8.4). */
  let { date, onclose }: { date: string; onclose: () => void } = $props();

  const existing = live(() => db.planner.get(date), undefined as PlannerRecord | undefined);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);

  let ready = $state(false);
  let mode = $state<'outfit' | 'items'>('outfit');
  let outfitId = $state<string | null>(null);
  let itemIds = $state<string[]>([]);
  let note = $state('');
  let picking = $state<'outfit' | 'items' | null>(null);
  let saving = $state(false);

  $effect(() => {
    if (ready || !existing.ready) return;
    const p = existing.value;
    if (p) {
      outfitId = p.outfitId;
      itemIds = [...p.itemIds];
      note = p.note;
      mode = p.outfitId || !p.itemIds.length ? 'outfit' : 'items';
    }
    ready = true;
  });

  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const outfit = $derived(outfitId ? outfits.value.find((o) => o.id === outfitId) : undefined);
  const view = $derived.by(() => {
    if (!outfit) return null;
    const pieces = outfitPieces(outfit, itemsById, new Map(wishlist.value.map((w) => [w.id, w])), categories.value);
    return { pieces, layout: mergeLayout(outfit.layout, pieces) };
  });
  const chosen = $derived(itemIds.map((id) => itemsById.get(id)).filter((i): i is ItemRecord => !!i));
  const ids = $derived(mode === 'outfit' ? (outfit?.itemIds ?? []) : itemIds);
  const warnings = $derived(date >= todayKey() ? planWarnings(ids, itemsById) : []);

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await setPlan(db, date, {
        outfitId: mode === 'outfit' ? outfitId : null,
        itemIds: mode === 'items' ? [...itemIds] : [],
        note,
      });
      showToast('Giorno salvato in agenda');
      onclose();
    } catch (e) {
      reportError(e);
    } finally {
      saving = false;
    }
  }

  function toggle(id: string) {
    itemIds = itemIds.includes(id) ? itemIds.filter((x) => x !== id) : [...itemIds, id];
  }
</script>

<Sheet title="Pianifica {dayTitle(date, todayKey())}" {onclose}>
  {#if ready}
    <div class="segmented" role="group" aria-label="Cosa pianificare">
      <button aria-pressed={mode === 'outfit'} onclick={() => (mode = 'outfit')}>Un outfit</button>
      <button aria-pressed={mode === 'items'} onclick={() => (mode = 'items')}>Dei capi</button>
    </div>

    <div class="what">
      {#if mode === 'outfit'}
        {#if view && outfit}
          <div class="chosen">
            <div class="mini"><OutfitCollage pieces={view.pieces} layout={view.layout} /></div>
            <div class="grow">
              <strong>{outfit.name}</strong>
              <div class="links">
                <button class="link" onclick={() => (picking = 'outfit')}>Cambia</button>
                <button class="link" onclick={() => (outfitId = null)}>Togli</button>
              </div>
            </div>
          </div>
        {:else}
          <button class="btn btn-block" onclick={() => (picking = 'outfit')}><Icon name="plus" size={20} /> Scegli un outfit</button>
        {/if}
      {:else}
        {#if chosen.length}
          <div class="thumbs">
            {#each chosen as it (it.id)}<span class="thumb"><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></span>{/each}
          </div>
        {/if}
        <button class="btn btn-block" onclick={() => (picking = 'items')}>
          <Icon name={chosen.length ? 'edit' : 'plus'} size={20} />
          {chosen.length ? `Capi scelti: ${chosen.length}` : 'Scegli i capi'}
        </button>
      {/if}
    </div>

    {#if warnings.length}
      <div class="warning">
        <strong>Da preparare:</strong>
        {warnings.map((w) => `${w.name} (${w.reason})`).join(', ')}.
      </div>
    {/if}

    <label class="field">
      <span>Nota</span>
      <textarea class="input" rows="2" bind:value={note} placeholder="Es. riunione importante, cena fuori"></textarea>
    </label>
  {:else}
    <p class="note">Carico…</p>
  {/if}

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={saving} onclick={save}>Salva</button>
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
    title="Capi del giorno"
    items={items.value}
    selected={itemIds}
    multiple
    seasonBoxId={null}
    onlyAvailableByDefault={false}
    onpick={toggle}
    onclose={() => (picking = null)}
  />
{/if}

<style>
  .what {
    margin: 14px 0;
  }
  .chosen {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .mini {
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
    margin-bottom: 10px;
  }
  .thumb {
    flex: none;
    width: 56px;
    height: 72px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .warning {
    margin-bottom: 14px;
  }
</style>
