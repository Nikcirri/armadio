<script lang="ts">
  import { db } from '../../lib/db';
  import { restoreTrip, unpackTrip } from '../../lib/db/agenda';
  import type { ItemRecord, OutfitRecord, PlannerRecord, TripRecord, WearLogRecord } from '../../lib/db/types';
  import { packingList, tripLooks, unpackCandidates, unpackDefaults } from '../../lib/logic/agenda';
  import { todayKey } from '../../lib/logic/util';
  import { tapFeedback } from '../../lib/platform';
  import { live } from '../../lib/state/live.svelte';
  import { showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  /** "Disfa valigia" (SPEC 8.4): per ogni capo Da lavare o Pulito, tutto in un passaggio. */
  let { trip, onclose }: { trip: TripRecord; onclose: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const planner = live(() => db.planner.where('date').between(trip.startDate, trip.endDate, true, true).toArray(), [] as PlannerRecord[]);
  const log = live(() => db.wearLog.where('date').between(trip.startDate, trip.endDate, true, true).toArray(), [] as WearLogRecord[]);

  let choice = $state<Record<string, 'toWash' | 'clean'>>({});
  let initialized = false;
  let busy = $state(false);

  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const outfitsById = $derived(new Map(outfits.value.map((o) => [o.id, o])));
  const plannerByDate = $derived(new Map(planner.value.map((p) => [p.date, p])));
  const list = $derived(unpackCandidates(packingList(trip, tripLooks(trip, plannerByDate, outfitsById), itemsById), itemsById));
  const ready = $derived(items.ready && outfits.ready && planner.ready && log.ready);

  $effect(() => {
    if (initialized || !ready) return;
    initialized = true;
    choice = unpackDefaults(trip, list, log.value, plannerByDate, outfitsById, todayKey(), itemsById);
  });

  const washCount = $derived(Object.values(choice).filter((c) => c === 'toWash').length);

  async function confirm() {
    if (busy) return;
    busy = true;
    try {
      const snap = await unpackTrip(db, trip.id, $state.snapshot(choice));
      void tapFeedback();
      onclose();
      showUndoToast(washCount ? `Valigia disfatta: ${washCount === 1 ? '1 capo' : `${washCount} capi`} da lavare` : 'Valigia disfatta: tutto pulito', () =>
        restoreTrip(db, snap),
      );
    } catch (e) {
      reportError(e);
    } finally {
      busy = false;
    }
  }
</script>

<Sheet title="Disfa valigia" {onclose}>
  {#if !ready}
    <p class="note">Carico…</p>
  {:else if !list.length}
    <p class="note first">Non ci sono capi in questo viaggio. Confermando il viaggio risulta concluso.</p>
  {:else}
    <p class="note first">Per ogni capo scegli dove va. Quelli che risultano indossati durante il viaggio sono già su “Da lavare”.</p>
    <div class="list">
      {#each list as id (id)}
        {@const it = itemsById.get(id)!}
        <div class="choice">
          <span class="mini"><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></span>
          <span class="grow">{it.name}</span>
          <div class="segmented" role="group" aria-label="Dove va {it.name}">
            <button aria-pressed={choice[id] === 'clean'} onclick={() => (choice = { ...choice, [id]: 'clean' })}>Pulito</button>
            <button aria-pressed={choice[id] === 'toWash'} onclick={() => (choice = { ...choice, [id]: 'toWash' })}>Da lavare</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={busy || !ready} onclick={confirm}>
      {washCount ? `Conferma (${washCount} da lavare)` : 'Conferma'}
    </button>
  {/snippet}
</Sheet>

<style>
  .first {
    margin: 0 4px 12px;
  }
  .choice {
    display: grid;
    grid-template-columns: 40px 1fr;
    align-items: center;
    gap: 8px 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  .choice:last-child {
    border-bottom: 0;
  }
  .grow {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini {
    flex: none;
    width: 40px;
    height: 52px;
    border-radius: 8px;
    overflow: hidden;
  }
  .segmented {
    grid-column: 1 / -1;
  }
  .segmented button {
    min-height: 36px;
    font-size: 0.8125rem;
  }
</style>
