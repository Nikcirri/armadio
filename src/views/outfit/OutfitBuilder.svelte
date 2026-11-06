<script lang="ts">
  import { db } from '../../lib/db';
  import { saveOutfit } from '../../lib/db/outfits';
  import type { CategoryRecord, ItemRecord, ListRecord, OutfitRecord, Season, WishlistRecord } from '../../lib/db/types';
  import { SEASONS } from '../../lib/logic/labels';
  import {
    MODES,
    MODE_SLOTS,
    WEATHER_TAGS,
    mergeLayout,
    missingSlots,
    modeOf,
    outfitPalette,
    outfitWarnings,
    pickedIds,
    pieceFromItem,
    pieceFromWishlist,
    picksFromPieces,
    semaphore,
    togglePick,
    type OutfitMode,
    type Picks,
    type Piece,
    type SlotRule,
    type WeatherTag,
  } from '../../lib/logic/outfits';
  import { joinNames, suggestUnderwear } from '../../lib/logic/underwear';
  import { tapFeedback } from '../../lib/platform';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import ChipGroup from '../../lib/ui/ChipGroup.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';
  import ItemPickerSheet from './ItemPickerSheet.svelte';
  import OutfitCollage from './OutfitCollage.svelte';
  import PaletteBar from './PaletteBar.svelte';
  import SemaphoreBox from './SemaphoreBox.svelte';

  /** Creatore di outfit (SPEC 8.2): Spezzato o Intero, un selettore per ogni slot. */
  let {
    outfitId = null,
    initialItemIds = [],
    onclose,
    onsaved,
  }: {
    outfitId?: string | null;
    initialItemIds?: string[];
    onclose: () => void;
    onsaved: (id: string, isNew: boolean) => void;
  } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);
  const existing = live(() => (outfitId ? db.outfits.get(outfitId) : Promise.resolve(undefined)), undefined as OutfitRecord | undefined);

  let ready = $state(false);
  let mode = $state<OutfitMode>('separates');
  let picks = $state<Picks>({});
  let name = $state('');
  let occasions = $state<string[]>([]);
  let season = $state<Season | null>(null);
  let weather = $state<WeatherTag[]>([]);
  let favorite = $state(false);
  let notes = $state('');
  let includeWishlist = $state(false);
  let picker = $state<SlotRule | null>(null);
  let saving = $state(false);
  let original = '';

  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const wishById = $derived(new Map(wishlist.value.map((w) => [w.id, w])));
  const seasonBoxId = $derived(lists.value.find((l) => l.kind === 'location' && l.extra.key === 'seasonBox')?.id ?? null);
  const occasionOptions = $derived(
    lists.value
      .filter((l) => l.kind === 'occasion')
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ id: l.id, label: l.name })),
  );

  function pieceOf(id: string): Piece | null {
    const item = itemsById.get(id);
    if (item) return pieceFromItem(item);
    const w = wishById.get(id);
    return w ? pieceFromWishlist(w, categories.value) : null;
  }

  // Avvio: dall'outfit esistente oppure dai capi passati ("Crea outfit con questo capo").
  $effect(() => {
    if (ready || !items.ready || !categories.ready || !wishlist.ready || (outfitId && !existing.ready)) return;
    const o = existing.value;
    const ids = o ? [...o.itemIds, ...o.wishlistIds] : initialItemIds;
    const pieces = ids.map(pieceOf).filter((p): p is Piece => !!p);
    picks = picksFromPieces(pieces);
    mode = modeOf(pieces.map((p) => p.slotType));
    if (o) {
      name = o.name;
      occasions = [...o.occasions];
      season = o.season;
      weather = WEATHER_TAGS.map((t) => t.id).filter((t) => o.weatherTags.includes(t));
      favorite = o.favorite;
      notes = o.notes;
      includeWishlist = o.wishlistIds.length > 0;
    }
    ready = true;
    original = snapshot();
  });

  function snapshot(): string {
    return JSON.stringify({ mode, picks: $state.snapshot(picks), name, occasions, season, weather, favorite, notes });
  }

  const ids = $derived(pickedIds(picks, mode));
  const pieces = $derived(ids.map(pieceOf).filter((p): p is Piece => !!p));
  const layout = $derived(mergeLayout(existing.value?.layout ?? [], pieces));
  const light = $derived(semaphore(pieces, itemsById, seasonBoxId));
  const palette = $derived(outfitPalette(pieces));
  const warnings = $derived(outfitWarnings(pieces.filter((p) => p.source === 'item').map((p) => itemsById.get(p.id)!)));
  const missing = $derived(missingSlots(picks, mode));
  // Intimo collegato ai capi scelti che non è ancora nell'outfit.
  const underSuggest = $derived(
    suggestUnderwear(
      pieces.filter((p) => p.source === 'item' && p.slotType !== 'underwear').map((p) => itemsById.get(p.id)!),
      itemsById,
      seasonBoxId,
      picks.underwear ?? [],
    ),
  );

  function addUnderwear(id: string) {
    picks = { ...picks, underwear: [...(picks.underwear ?? []), id] };
    void tapFeedback();
  }
  const dirty = $derived(ready && snapshot() !== original);

  function slotPieces(rule: SlotRule): Piece[] {
    return (picks[rule.slot] ?? []).map(pieceOf).filter((p): p is Piece => !!p);
  }

  function onPick(id: string) {
    if (!picker) return;
    picks = togglePick(picks, picker, id);
    void tapFeedback();
    if (!picker.multiple) picker = null;
  }

  function removePiece(rule: SlotRule, id: string) {
    picks = { ...picks, [rule.slot]: (picks[rule.slot] ?? []).filter((x) => x !== id) };
  }

  async function requestClose() {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Uscire senza salvare?',
        message: 'L’outfit non verrà salvato.',
        confirmLabel: 'Esci',
        danger: true,
      });
      if (!ok) return;
    }
    onclose();
  }

  async function save() {
    if (saving) return;
    if (!pieces.length) return showToast('Scegli almeno un capo');
    saving = true;
    try {
      const saved = await saveOutfit(
        db,
        {
          name,
          itemIds: pieces.filter((p) => p.source === 'item').map((p) => p.id),
          wishlistIds: pieces.filter((p) => p.source === 'wishlist').map((p) => p.id),
          season,
          occasions: [...occasions],
          weatherTags: [...weather],
          favorite,
          notes,
          layout: $state.snapshot(layout),
        },
        outfitId,
      );
      void tapFeedback();
      showToast(outfitId ? 'Outfit salvato' : `“${saved.name}” creato`);
      onsaved(saved.id, !outfitId);
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare l’outfit.');
    } finally {
      saving = false;
    }
  }

  const pickerItems = $derived(picker ? items.value.filter((i) => i.slotType === picker!.slot) : []);
  const pickerWishes = $derived(
    picker ? wishlist.value.map((w) => pieceFromWishlist(w, categories.value)).filter((w) => w.slotType === picker!.slot) : [],
  );
</script>

<Sheet title={outfitId ? 'Modifica outfit' : 'Nuovo outfit'} onclose={requestClose}>
  {#if ready}
    <div class="segmented" role="group" aria-label="Tipo di outfit">
      {#each MODES as m (m.id)}
        <button aria-pressed={mode === m.id} onclick={() => (mode = m.id)}>{m.label}</button>
      {/each}
    </div>
    <p class="note">{mode === 'separates' ? 'Sopra + strato facoltativo + sotto.' : 'Un abito o una tuta, con strato facoltativo.'}</p>

    <div class="slots">
      {#each MODE_SLOTS[mode] as rule (rule.slot)}
        {@const chosen = slotPieces(rule)}
        <section class="slot">
          <div class="slot-head">
            <h3>{rule.label}</h3>
            <span class="hint">{rule.multiple ? 'anche più di uno' : rule.optional ? 'facoltativo' : ''}</span>
          </div>
          <div class="chosen">
            {#each chosen as p (p.id)}
              <div class="piece" class:wish={p.source === 'wishlist'}>
                <span class="pic"><PhotoThumb photoId={p.photoId} alt={p.name} /></span>
                <span class="pname">{p.name}</span>
                <button class="remove" aria-label="Togli {p.name}" onclick={() => removePiece(rule, p.id)}><Icon name="close" size={16} /></button>
              </div>
            {/each}
            <button class="add" onclick={() => (picker = rule)}>
              <Icon name={chosen.length && !rule.multiple ? 'edit' : 'plus'} size={22} />
              <span>{chosen.length && !rule.multiple ? 'Cambia' : 'Scegli'}</span>
            </button>
          </div>
          {#if rule.slot === 'underwear' && underSuggest.length}
            <div class="suggested">
              <span class="hint">Consigliati per i capi scelti:</span>
              {#each underSuggest as sug (sug.item.id)}
                <button class="sugg" onclick={() => addUnderwear(sug.item.id)}>
                  <Icon name="plus" size={16} />
                  <span><strong>{sug.item.name}</strong> · sotto {joinNames(sug.forNames)}{sug.reason ? ` · ${sug.reason}` : ''}</span>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
    {#if missing.length && pieces.length}
      <p class="note">Manca: {missing.join(', ')}. Puoi salvare lo stesso.</p>
    {/if}

    {#if pieces.length}
      <h3 class="section-title">Anteprima</h3>
      <div class="preview">
        <div class="collage"><OutfitCollage {pieces} {layout} /></div>
        <div class="side">
          <SemaphoreBox state={light} />
          <PaletteBar colors={palette} />
        </div>
      </div>
      {#if warnings.length}
        <ul class="warnings">
          {#each warnings as w (w.text)}<li class="warning">{w.kind === 'intimate' ? '👙' : '📏'} {w.text}</li>{/each}
        </ul>
      {/if}
    {/if}

    <h3 class="section-title">Dettagli</h3>
    <div class="stack">
      <label class="field">
        <span>Nome</span>
        <input class="input" bind:value={name} maxlength="60" placeholder="Es. Ufficio del lunedì (facoltativo)" />
      </label>
      <ChipGroup label="Occasioni" options={occasionOptions} value={occasions} onchange={(v) => (occasions = v)} />
      <ChipGroup
        label="Stagione"
        single
        options={SEASONS}
        value={season ? [season] : []}
        onchange={(v) => (season = (v[0] as Season | undefined) ?? null)}
      />
      <ChipGroup label="Meteo" options={WEATHER_TAGS} value={weather} onchange={(v) => (weather = v)} />
      <div class="list"><Switch label="Preferito" checked={favorite} onchange={(v) => (favorite = v)} /></div>
      <label class="field">
        <span>Note</span>
        <textarea class="input" rows="2" bind:value={notes}></textarea>
      </label>
    </div>
  {:else}
    <p class="note">Carico i capi…</p>
  {/if}

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={requestClose}>Annulla</button>
    <button class="btn btn-primary" disabled={saving || !pieces.length} onclick={save}>Salva outfit</button>
  {/snippet}
</Sheet>

{#if picker}
  <ItemPickerSheet
    title={picker.label}
    items={pickerItems}
    wishlist={pickerWishes}
    selected={picks[picker.slot] ?? []}
    multiple={picker.multiple}
    {seasonBoxId}
    {includeWishlist}
    onwishlist={(v) => (includeWishlist = v)}
    onpick={onPick}
    onclose={() => (picker = null)}
  />
{/if}

<style>
  .suggested {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    margin-top: 8px;
  }
  .sugg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 6px 14px;
    border: 1px dashed var(--accent);
    border-radius: 999px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }
  .slots {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 14px;
  }
  .slot-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }
  h3 {
    margin: 0;
    font-size: 1.0625rem;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .chosen {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .piece,
  .add {
    position: relative;
    flex: none;
    width: 84px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pic {
    display: block;
    height: 108px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .piece.wish .pic {
    border-style: dashed;
  }
  .pname {
    font-size: 0.75rem;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .add {
    height: 108px;
    align-items: center;
    justify-content: center;
    border: 1.5px dashed var(--border);
    border-radius: 12px;
    background: transparent;
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
  .preview {
    display: grid;
    grid-template-columns: 44% 1fr;
    gap: 12px;
    align-items: start;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .warnings {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
