<script lang="ts">
  import { db } from '../lib/db';
  import type { CategoryRecord, ItemRecord, OutfitRecord, PlannerRecord, TripRecord, WearLogRecord } from '../lib/db/types';
  import {
    bandPart,
    countdown,
    departureAlarms,
    luggageFill,
    luggageInfo,
    packingList,
    PHASE_LABELS,
    planItemIds,
    planWarnings,
    rangeLabel,
    sortTrips,
    tripLooks,
    tripPhase,
    tripsOn,
  } from '../lib/logic/agenda';
  import { tripDays } from '../lib/logic/packing';
  import { todayKey } from '../lib/logic/util';
  import { agendaView as view } from '../lib/state/agendaView.svelte';
  import { live } from '../lib/state/live.svelte';
  import { requestOpenItem, requestOpenOutfit } from '../lib/state/nav.svelte';
  import Fab from '../lib/ui/Fab.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import Calendar, { type DayMarks } from './agenda/Calendar.svelte';
  import DayPanel from './agenda/DayPanel.svelte';
  import PlanSheet from './agenda/PlanSheet.svelte';
  import TemplatesSheet from './agenda/TemplatesSheet.svelte';
  import TripFormSheet from './agenda/TripFormSheet.svelte';
  import TripPage from './agenda/TripPage.svelte';

  const trips = live(() => db.trips.toArray(), [] as TripRecord[]);
  const planner = live(() => db.planner.toArray(), [] as PlannerRecord[]);
  const wearLog = live(() => db.wearLog.toArray(), [] as WearLogRecord[]);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);

  let planning = $state<string | null>(null);
  let newTrip = $state(false);
  let showTemplates = $state(false);

  const today = todayKey();
  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const outfitsById = $derived(new Map(outfits.value.map((o) => [o.id, o])));
  const categoriesById = $derived(new Map(categories.value.map((c) => [c.id, c])));
  const plannerByDate = $derived(new Map(planner.value.map((p) => [p.date, p])));
  const wornDates = $derived(new Set(wearLog.value.map((w) => w.date)));
  const sorted = $derived(sortTrips(trips.value, today));

  function marks(date: string): DayMarks {
    const p = plannerByDate.get(date);
    const ids = planItemIds(p, outfitsById);
    const t = tripsOn(date, trips.value)[0];
    return {
      worn: wornDates.has(date),
      planned: !!p && (ids.length > 0 || !!p.note),
      warning: date >= today && planWarnings(ids, itemsById).length > 0,
      trip: t ? { name: t.name, part: bandPart(date, t) } : null,
    };
  }

  function tripCard(t: TripRecord) {
    const list = packingList(t, tripLooks(t, plannerByDate, outfitsById), itemsById);
    return {
      fill: luggageFill(list, itemsById, categoriesById, t.luggageType),
      alarms: departureAlarms(list, itemsById).length,
      phase: tripPhase(t, today),
      items: list.length,
    };
  }

  function select(date: string) {
    view.selected = date;
    view.anchor = date;
  }
</script>

<div class="agenda">
  <div class="segmented" role="group" aria-label="Sezione">
    <button aria-pressed={view.section === 'calendar'} onclick={() => (view.section = 'calendar')}>Calendario</button>
    <button aria-pressed={view.section === 'trips'} onclick={() => (view.section = 'trips')}>
      Viaggi{sorted.upcoming.length ? ` (${sorted.upcoming.length})` : ''}
    </button>
  </div>

  {#if view.section === 'calendar'}
    <div class="modes">
      <div class="segmented small" role="group" aria-label="Vista">
        <button aria-pressed={view.mode === 'week'} onclick={() => (view.mode = 'week')}>Settimana</button>
        <button aria-pressed={view.mode === 'month'} onclick={() => (view.mode = 'month')}>Mese</button>
      </div>
    </div>
    <div class="card cal">
      <Calendar
        mode={view.mode}
        selected={view.selected}
        anchor={view.anchor}
        {today}
        {marks}
        onselect={select}
        onanchor={(d) => (view.anchor = d)}
      />
    </div>
    {#key view.selected}
      <DayPanel
        date={view.selected}
        onplan={(d) => (planning = d)}
        onopentrip={(id) => (view.tripDetail = id)}
        onopenoutfit={requestOpenOutfit}
      />
    {/key}
  {:else}
    <button class="btn btn-block templates" onclick={() => (showTemplates = true)}><Icon name="tag" size={20} /> Template valigia</button>

    {#if trips.ready && !trips.value.length}
      <section class="empty">
        <p class="big" aria-hidden="true">🧳</p>
        <h2>Nessun viaggio, per ora</h2>
        <p>Crea un viaggio: scegli gli outfit dei giorni e l’app prepara la lista dei capi, controlla lo spazio in valigia e compila il necessaire.</p>
        <button class="btn btn-primary" onclick={() => (newTrip = true)}>Nuovo viaggio</button>
      </section>
    {/if}

    {#each [{ title: 'In programma', list: sorted.upcoming }, { title: 'Passati', list: sorted.past }] as group (group.title)}
      {#if group.list.length}
        <h2 class="section-title">{group.title}</h2>
        <div class="trips">
          {#each group.list as t (t.id)}
            {@const c = tripCard(t)}
            <button class="card trip" onclick={() => (view.tripDetail = t.id)}>
              <span class="top">
                <strong class="name">{t.name}</strong>
                <span class="phase {c.phase}">{PHASE_LABELS[c.phase]}</span>
              </span>
              <span class="sub">
                {rangeLabel(t.startDate, t.endDate)} · {tripDays(t.startDate, t.endDate) === 1 ? '1 giorno' : `${tripDays(t.startDate, t.endDate)} giorni`}
                {#if countdown(t, today)} · {countdown(t, today)}{/if}
              </span>
              <span class="bar" aria-hidden="true"><span class:over={c.fill.over} style:width="{c.fill.percent}%"></span></span>
              <span class="sub">
                {luggageInfo(t.luggageType).emoji} {c.items === 1 ? '1 capo' : `${c.items} capi`} · {c.fill.points}/{c.fill.capacity} punti
                {#if c.alarms && c.phase !== 'done'}<span class="alarm"> · ⚠️ {c.alarms} da sistemare</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}
  {/if}
</div>

<Fab actions={[{ label: 'Nuovo viaggio', run: () => (newTrip = true) }]} label="Nuovo viaggio" />

{#if view.tripDetail}
  {#key view.tripDetail}
    <TripPage
      tripId={view.tripDetail}
      onclose={() => (view.tripDetail = null)}
      onplan={(d) => (planning = d)}
      onopenitem={requestOpenItem}
      onopenoutfit={requestOpenOutfit}
    />
  {/key}
{/if}

{#if planning}
  {#key planning}
    <PlanSheet date={planning} onclose={() => (planning = null)} />
  {/key}
{/if}

{#if newTrip}
  <TripFormSheet
    onclose={() => (newTrip = false)}
    onsaved={(id) => {
      newTrip = false;
      view.section = 'trips';
      view.tripDetail = id;
    }}
  />
{/if}

{#if showTemplates}
  <TemplatesSheet onclose={() => (showTemplates = false)} />
{/if}

<style>
  .agenda {
    padding: 12px 16px 120px;
  }
  .modes {
    display: flex;
    justify-content: center;
    margin: 12px 0 8px;
  }
  .segmented.small {
    width: 240px;
  }
  .segmented.small button {
    min-height: 34px;
  }
  .cal {
    padding: 8px;
  }
  .templates {
    margin-top: 12px;
  }
  .trips {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .trip {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    cursor: pointer;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 1.125rem;
  }
  .phase {
    flex: none;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .phase.travelling,
  .phase.packed {
    background: color-mix(in srgb, #2e7d32 18%, transparent);
  }
  .phase.toUnpack {
    background: var(--warning-bg);
    color: var(--warning-text);
  }
  .sub {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .alarm {
    color: var(--danger);
  }
  .bar {
    display: block;
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .bar span.over {
    background: var(--danger);
  }
  .empty {
    text-align: center;
    padding: 32px 12px;
  }
  .big {
    font-size: 2.6rem;
    margin: 0;
  }
  .empty h2 {
    margin: 8px 0;
  }
  .empty p {
    color: var(--text-muted);
    line-height: 1.5;
  }
</style>
