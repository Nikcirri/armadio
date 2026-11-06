<script lang="ts">
  import { db } from '../../lib/db';
  import { restorePlan, setPlan } from '../../lib/db/agenda';
  import type { CategoryRecord, ItemRecord, OutfitRecord, PlannerRecord, TripRecord, WearLogRecord, WishlistRecord } from '../../lib/db/types';
  import { dayTitle, planItemIds, planWarnings, relativeDay, tripDateList, tripsOn } from '../../lib/logic/agenda';
  import { mergeLayout, outfitPieces, pieceFromItem, autoLayout, type Piece } from '../../lib/logic/outfits';
  import { todayKey } from '../../lib/logic/util';
  import { live } from '../../lib/state/live.svelte';
  import { showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import { wearWithUndo } from '../outfit/actions';
  import OutfitCollage from '../outfit/OutfitCollage.svelte';

  /** Il giorno scelto: cosa hai indossato (passato), cosa hai pianificato e il viaggio (SPEC 8.4). */
  let {
    date,
    onplan,
    onopentrip,
    onopenoutfit,
  }: {
    date: string;
    onplan: (date: string) => void;
    onopentrip: (id: string) => void;
    onopenoutfit: (id: string) => void;
  } = $props();

  const plan = live(() => db.planner.get(date), undefined as PlannerRecord | undefined);
  const wears = live(() => db.wearLog.where('date').equals(date).sortBy('createdAt'), [] as WearLogRecord[]);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);
  const trips = live(() => db.trips.toArray(), [] as TripRecord[]);

  const today = todayKey();
  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const outfitsById = $derived(new Map(outfits.value.map((o) => [o.id, o])));
  const p = $derived(plan.value);
  const planOutfit = $derived(p?.outfitId ? outfitsById.get(p.outfitId) : undefined);
  const planIds = $derived(planItemIds(p, outfitsById));
  const warnings = $derived(date >= today ? planWarnings(planIds, itemsById) : []);
  const dayTrips = $derived(tripsOn(date, trips.value));
  const rel = $derived(relativeDay(date, today));
  const isPast = $derived(date < today);
  const isToday = $derived(date === today);
  const wornToday = $derived(wears.value.some((w) => planIds.length && planIds.every((id) => w.itemIds.includes(id))));

  function collage(outfitId: string | null, ids: readonly string[]): { pieces: Piece[]; layout: ReturnType<typeof autoLayout> } | null {
    const outfit = outfitId ? outfitsById.get(outfitId) : undefined;
    if (outfit) {
      const pieces = outfitPieces(outfit, itemsById, new Map(wishlist.value.map((w) => [w.id, w])), categories.value);
      const extra = ids.filter((id) => !outfit.itemIds.includes(id)).map((id) => itemsById.get(id)).filter((i): i is ItemRecord => !!i).map(pieceFromItem);
      const all = [...pieces, ...extra];
      return all.length ? { pieces: all, layout: mergeLayout(outfit.layout, all) } : null;
    }
    const pieces = ids.map((id) => itemsById.get(id)).filter((i): i is ItemRecord => !!i).map(pieceFromItem);
    return pieces.length ? { pieces, layout: autoLayout(pieces) } : null;
  }

  const planView = $derived(collage(p?.outfitId ?? null, planIds));

  async function clearPlan() {
    try {
      const before = await setPlan(db, date, { outfitId: null, itemIds: [], note: '' });
      showUndoToast('Giorno svuotato', () => restorePlan(db, date, before));
    } catch (e) {
      reportError(e);
    }
  }

  function dayIndex(t: TripRecord): string {
    const list = tripDateList(t);
    return `giorno ${list.indexOf(date) + 1} di ${list.length}`;
  }
</script>

<section class="panel">
  <header>
    <h2>{rel ? `${rel}, ` : ''}{dayTitle(date, today)}</h2>
  </header>

  {#each dayTrips as t (t.id)}
    <button class="trip" onclick={() => onopentrip(t.id)}>
      <span aria-hidden="true">✈️</span>
      <span class="grow"><strong>{t.name}</strong><span class="sub">{dayIndex(t)}</span></span>
      <Icon name="chevron" size={18} />
    </button>
  {/each}

  {#if isPast || isToday}
    <h3 class="section-title">Indossato</h3>
    {#if wears.value.length}
      <div class="list">
        {#each wears.value as w (w.id)}
          {@const o = w.outfitId ? outfitsById.get(w.outfitId) : undefined}
          <div class="row static">
            <span class="thumbs">
              {#each w.itemIds.slice(0, 4) as id (id)}
                <span class="thumb"><PhotoThumb photoId={itemsById.get(id)?.photoIds[0]} alt={itemsById.get(id)?.name ?? ''} /></span>
              {/each}
            </span>
            <span class="grow">
              {o ? o.name : w.itemIds.length === 1 ? '1 capo' : `${w.itemIds.length} capi`}
              <span class="sub">{w.itemNames.join(', ')}</span>
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="note">{isToday ? 'Ancora niente: quando indossi un outfit lo trovi qui.' : 'Niente segnato in questo giorno.'}</p>
    {/if}
  {/if}

  <h3 class="section-title">{isPast ? 'Avevi pianificato' : 'Pianificato'}</h3>
  {#if p && (planIds.length || p.note)}
    <div class="card plan">
      {#if planView}
        <div class="plan-row">
          <div class="mini"><OutfitCollage pieces={planView.pieces} layout={planView.layout} /></div>
          <div class="grow">
            {#if planOutfit}
              <button class="link title" onclick={() => onopenoutfit(planOutfit.id)}>{planOutfit.name}</button>
            {:else}
              <strong>{planIds.length === 1 ? '1 capo' : `${planIds.length} capi`}</strong>
            {/if}
            <span class="sub">{planIds.map((id) => itemsById.get(id)?.name).filter(Boolean).join(', ')}</span>
          </div>
        </div>
      {/if}
      {#if p.note}<p class="plan-note">📝 {p.note}</p>{/if}
      {#if warnings.length}
        <p class="warning">
          ⚠️ {warnings.length === 1 ? 'Un capo non sarà pronto' : `${warnings.length} capi non saranno pronti`}:
          {warnings.map((w) => `${w.name} (${w.reason})`).join(', ')}.
        </p>
      {/if}
      <div class="buttons">
        {#if isToday && planIds.length && !wornToday}
          <button class="btn btn-primary" onclick={() => wearWithUndo(planIds, today, p.outfitId)}>Indossa oggi</button>
        {/if}
        <button class="btn" onclick={() => onplan(date)}><Icon name="edit" size={18} /> Cambia</button>
        <button class="btn btn-ghost" onclick={clearPlan}>Togli</button>
      </div>
    </div>
  {:else}
    <p class="note">{isPast ? 'Nessun piano per questo giorno.' : 'Niente in programma.'}</p>
    <button class="btn btn-block plan-btn" onclick={() => onplan(date)}><Icon name="plus" size={20} /> {isPast ? 'Aggiungi a posteriori' : 'Pianifica questo giorno'}</button>
  {/if}
</section>

<style>
  .panel {
    margin-top: 14px;
  }
  header h2 {
    margin: 0 4px;
    font-size: 1.25rem;
  }
  header h2::first-letter {
    text-transform: uppercase;
  }
  .trip {
    width: 100%;
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 0;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    text-align: left;
    cursor: pointer;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .sub {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .row.static {
    cursor: default;
  }
  .thumbs {
    display: flex;
    gap: 3px;
  }
  .thumb {
    width: 30px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    display: block;
  }
  .plan {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .plan-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .mini {
    flex: none;
    width: 84px;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .title {
    font-family: var(--font-serif);
    font-size: 1.125rem;
  }
  .plan-note {
    margin: 0;
    line-height: 1.45;
  }
  .warning {
    margin: 0;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .buttons .btn {
    flex: 1 1 auto;
    padding: 0 14px;
  }
  .plan-btn {
    margin-top: 10px;
  }
</style>
