<script lang="ts">
  import { db } from '../../lib/db';
  import { addTrip, updateTrip } from '../../lib/db/agenda';
  import type { ListRecord, LuggageType, TripRecord } from '../../lib/db/types';
  import { defaultTripDates, LUGGAGE, rangeLabel } from '../../lib/logic/agenda';
  import { WEATHER_TAGS } from '../../lib/logic/outfits';
  import { tripDays } from '../../lib/logic/packing';
  import { todayKey } from '../../lib/logic/util';
  import { live } from '../../lib/state/live.svelte';
  import { showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import ChipGroup from '../../lib/ui/ChipGroup.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  /** Nuovo viaggio o modifica dei suoi dati (SPEC 8.4). */
  let { trip = null, onclose, onsaved }: { trip?: TripRecord | null; onclose: () => void; onsaved: (id: string) => void } = $props();

  const templates = live(
    () => db.lists.where('kind').equals('packingTemplate').sortBy('order'),
    [] as ListRecord[],
  );

  // svelte-ignore state_referenced_locally
  const start = trip ?? { name: '', ...defaultTripDates(todayKey()), luggageType: 'cabin' as LuggageType, templateId: null, weather: '' };
  let name = $state(start.name);
  let startDate = $state(start.startDate);
  let endDate = $state(start.endDate);
  let luggage = $state<LuggageType>(start.luggageType);
  let templateId = $state<string>(start.templateId ?? '');
  let weather = $state<string[]>(WEATHER_TAGS.filter((t) => start.weather.split(' · ').includes(t.label)).map((t) => t.id));
  let saving = $state(false);
  let templateChosen = false;

  // Per un viaggio nuovo propone il primo template ("Weekend in città").
  $effect(() => {
    if (trip || templateChosen || !templates.ready) return;
    templateChosen = true;
    templateId = templates.value.find((t) => t.extra.key === 'city')?.id ?? templates.value[0]?.id ?? '';
  });

  const valid = $derived(/^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate));
  const days = $derived(valid ? tripDays(startDate < endDate ? startDate : endDate, endDate > startDate ? endDate : startDate) : 0);

  async function save() {
    if (!valid || saving) return;
    saving = true;
    const input = {
      name,
      startDate,
      endDate,
      luggageType: luggage,
      templateId: templateId || null,
      weather: WEATHER_TAGS.filter((t) => weather.includes(t.id))
        .map((t) => t.label)
        .join(' · '),
    };
    try {
      const saved = trip ? await updateTrip(db, trip.id, input) : await addTrip(db, input);
      showToast(trip ? 'Viaggio aggiornato' : `“${saved.name}” creato`);
      onsaved(saved.id);
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare il viaggio.');
    } finally {
      saving = false;
    }
  }
</script>

<Sheet title={trip ? 'Modifica viaggio' : 'Nuovo viaggio'} {onclose}>
  <div class="stack">
    <label class="field">
      <span>Dove vai?</span>
      <input class="input" bind:value={name} maxlength="60" placeholder="Es. Weekend a Firenze" />
    </label>
    <div class="dates">
      <label class="field">
        <span>Partenza</span>
        <input class="input" type="date" bind:value={startDate} />
      </label>
      <label class="field">
        <span>Ritorno</span>
        <input class="input" type="date" bind:value={endDate} min={startDate} />
      </label>
    </div>
    {#if valid}<p class="note days">{rangeLabel(startDate <= endDate ? startDate : endDate, endDate >= startDate ? endDate : startDate)} · {days === 1 ? '1 giorno' : `${days} giorni`}</p>{/if}

    <div class="field">
      <span>Bagaglio</span>
      <div class="list">
        {#each LUGGAGE as l (l.id)}
          <button class="row" aria-pressed={luggage === l.id} onclick={() => (luggage = l.id)}>
            <span class="radio" class:on={luggage === l.id} aria-hidden="true"></span>
            <span class="emoji" aria-hidden="true">{l.emoji}</span>
            <span class="grow">{l.label}<span class="sub">{l.points} punti di spazio</span></span>
          </button>
        {/each}
      </div>
    </div>

    <ChipGroup label="Meteo previsto" options={WEATHER_TAGS} value={weather} onchange={(v) => (weather = v)} />

    <label class="field">
      <span>Template del necessaire</span>
      <select class="input" bind:value={templateId}>
        <option value="">Nessuno (lo compili tu)</option>
        {#each templates.value as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </label>
    {#if trip && templateId !== (trip.templateId ?? '')}
      <p class="note">Cambiando template il necessaire riparte da quello nuovo (le voci già spuntate restano spuntate).</p>
    {/if}
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={!valid || saving} onclick={save}>{trip ? 'Salva' : 'Crea viaggio'}</button>
  {/snippet}
</Sheet>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .days {
    margin-top: -8px;
  }
  .radio {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--border);
  }
  .radio.on {
    border: 7px solid var(--accent);
  }
  .emoji {
    font-size: 1.3rem;
  }
</style>
