<script lang="ts">
  import { db } from '../../lib/db';
  import { deleteTrip, patchTrip, restoreTrip, saveTemplate, setInTransit, setPacked } from '../../lib/db/agenda';
  import type { CategoryRecord, ChecklistEntry, ItemRecord, ListRecord, OutfitRecord, PlannerRecord, TripRecord } from '../../lib/db/types';
  import {
    countdown,
    dayTitle,
    departureAlarms,
    intimateReminders,
    looksLabel,
    luggageFill,
    luggageInfo,
    newChecklistEntry,
    packingList,
    PHASE_LABELS,
    planItemIds,
    rangeLabel,
    templateFromChecklist,
    tripDateList,
    tripLooks,
    tripPhase,
  } from '../../lib/logic/agenda';
  import { blockReason } from '../../lib/logic/outfits';
  import { tripDays } from '../../lib/logic/packing';
  import { todayKey } from '../../lib/logic/util';
  import { tapFeedback } from '../../lib/platform';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import PickerSheet from '../../lib/ui/PickerSheet.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import ItemPickerSheet from '../outfit/ItemPickerSheet.svelte';
  import TripFormSheet from './TripFormSheet.svelte';
  import UnpackSheet from './UnpackSheet.svelte';

  /** Pagina del viaggio (SPEC 8.4): giorni, outfit, capi, valigia, necessaire. */
  let {
    tripId,
    onclose,
    onplan,
    onopenitem,
    onopenoutfit,
  }: {
    tripId: string;
    onclose: () => void;
    onplan: (date: string) => void;
    onopenitem: (id: string) => void;
    onopenoutfit: (id: string) => void;
  } = $props();

  const trip = live(() => db.trips.get(tripId), undefined as TripRecord | undefined);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const outfits = live(() => db.outfits.toArray(), [] as OutfitRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const planner = live(() => db.planner.toArray(), [] as PlannerRecord[]);
  const templates = live(() => db.lists.where('kind').equals('packingTemplate').toArray(), [] as ListRecord[]);

  let editing = $state(false);
  let picking = $state<'outfit' | 'items' | null>(null);
  let unpacking = $state(false);
  let naming = $state(false);
  let templateName = $state('');
  let newEntry = $state('');

  const today = todayKey();
  const t = $derived(trip.value);
  const itemsById = $derived(new Map(items.value.map((i) => [i.id, i])));
  const outfitsById = $derived(new Map(outfits.value.map((o) => [o.id, o])));
  const categoriesById = $derived(new Map(categories.value.map((c) => [c.id, c])));
  const plannerByDate = $derived(new Map(planner.value.map((p) => [p.date, p])));
  const looks = $derived(t ? tripLooks(t, plannerByDate, outfitsById) : []);
  const list = $derived(t ? packingList(t, looks, itemsById) : []);
  const fill = $derived(t ? luggageFill(list, itemsById, categoriesById, t.luggageType) : null);
  const alarms = $derived(departureAlarms(list, itemsById));
  const reminders = $derived(intimateReminders(list, itemsById));
  const phase = $derived(t ? tripPhase(t, today) : 'planning');
  const dates = $derived(t ? tripDateList(t) : []);
  const template = $derived(templates.value.find((x) => x.id === t?.templateId));
  const packedCount = $derived(list.filter((e) => e.packed).length);
  const checkedCount = $derived(t?.checklist.filter((c) => c.checked).length ?? 0);
  const countdownText = $derived(t ? countdown(t, today) : null);

  $effect(() => {
    if (trip.ready && !trip.value) onclose();
  });

  async function run(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      reportError(e);
    }
  }

  async function togglePacked(itemId: string, packed: boolean) {
    const item = itemsById.get(itemId);
    if (packed && item && item.status !== 'clean' && item.status !== 'packed') {
      const ok = await confirmDialog({
        title: `“${item.name}” non è pronto`,
        message: `Risulta ${blockReason(item, null)}. Lo metti in valigia lo stesso?`,
        confirmLabel: 'Sì, in valigia',
      });
      if (!ok) return;
    }
    void tapFeedback();
    await run(() => setPacked(db, tripId, itemId, packed));
  }

  function saveChecklist(next: ChecklistEntry[]) {
    void run(() => patchTrip(db, tripId, { checklist: next }));
  }

  function checklist(): ChecklistEntry[] {
    return (t?.checklist ?? []).map((c) => ({ ...c }));
  }

  function addEntry() {
    const label = newEntry.trim();
    if (!label) return;
    saveChecklist([...checklist(), newChecklistEntry(label)]);
    newEntry = '';
  }

  function changeQty(id: string, delta: number) {
    saveChecklist(checklist().map((c) => (c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c)));
  }

  function removeEntry(id: string) {
    const before = checklist();
    saveChecklist(before.filter((c) => c.id !== id));
    showUndoToast('Voce tolta', () => patchTrip(db, tripId, { checklist: before }));
  }

  function toggleEntry(id: string) {
    void tapFeedback();
    saveChecklist(checklist().map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)));
  }

  function removeOutfit(id: string) {
    if (!t) return;
    const before = [...t.outfitIds];
    void run(() => patchTrip(db, tripId, { outfitIds: before.filter((x) => x !== id) }));
    showUndoToast('Outfit tolto dal viaggio', () => patchTrip(db, tripId, { outfitIds: before }));
  }

  function toggleExtra(id: string) {
    if (!t) return;
    const ids = t.extraItemIds.includes(id) ? t.extraItemIds.filter((x) => x !== id) : [...t.extraItemIds, id];
    void run(() => patchTrip(db, tripId, { extraItemIds: ids }));
  }

  async function markReady() {
    if (alarms.length) {
      const ok = await confirmDialog({
        title: 'Qualche capo non è pronto',
        message: `${alarms.map((a) => `${a.name}: ${a.reason}`).join('\n')}\n\nSegnare comunque la valigia come pronta?`,
        confirmLabel: 'Sì, è pronta',
      });
      if (!ok) return;
    }
    await run(() => patchTrip(db, tripId, { status: 'packed' }));
    showToast('Valigia pronta. Buon viaggio!');
  }

  async function saveAsTemplate() {
    if (!t) return;
    try {
      const created = await saveTemplate(db, { name: templateName || t.name, essentials: templateFromChecklist(t.checklist, template?.extra.essentials ?? []) });
      naming = false;
      showToast(`Template “${created.name}” salvato`);
    } catch (e) {
      reportError(e);
    }
  }

  async function remove() {
    if (!t) return;
    const ok = await confirmDialog({
      title: `Eliminare “${t.name}”?`,
      message: 'I giorni dell’agenda restano. I capi ancora in valigia tornano puliti.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      const snap = await deleteTrip(db, tripId);
      onclose();
      showUndoToast('Viaggio eliminato', () => restoreTrip(db, snap));
    } catch (e) {
      reportError(e);
    }
  }

  function dayPlanText(date: string): string {
    const p = plannerByDate.get(date);
    if (!p) return 'Niente in programma';
    const o = p.outfitId ? outfitsById.get(p.outfitId) : undefined;
    const n = planItemIds(p, outfitsById).length;
    if (o) return p.itemIds.length ? `${o.name} + ${p.itemIds.length} capi` : o.name;
    if (n) return n === 1 ? '1 capo' : `${n} capi`;
    return p.note || 'Niente in programma';
  }
</script>

<Page title={t?.name ?? 'Viaggio'} {onclose}>
  {#snippet actions()}
    {#if t}<button class="icon-btn" aria-label="Modifica il viaggio" onclick={() => (editing = true)}><Icon name="edit" /></button>{/if}
  {/snippet}

  {#if t && fill}
    <div class="summary card">
      <p class="when">
        <strong>{rangeLabel(t.startDate, t.endDate)}</strong> · {tripDays(t.startDate, t.endDate) === 1 ? '1 giorno' : `${tripDays(t.startDate, t.endDate)} giorni`}
        {#if countdownText}<span class="muted"> · {countdownText}</span>{/if}
      </p>
      <p class="meta">
        <span class="phase {phase}">{PHASE_LABELS[phase]}</span>
        <span>{luggageInfo(t.luggageType).emoji} {luggageInfo(t.luggageType).label}</span>
        {#if t.weather}<span>🌤 {t.weather}</span>{/if}
      </p>
      <div class="fill" aria-label="Valigia: {fill.points} punti su {fill.capacity}">
        <div class="bar"><span class:over={fill.over} style:width="{fill.percent}%"></span></div>
        <p class:bad={fill.over}>
          {fill.points} di {fill.capacity} punti{fill.over ? ' · troppo piena: togli qualcosa o scegli un bagaglio più grande' : ''}
        </p>
      </div>
    </div>

    {#if alarms.length && phase !== 'done'}
      <div class="warning alarm">
        <strong>Da sistemare prima di partire:</strong>
        <ul>
          {#each alarms as a (a.id)}<li>{a.name} — {a.reason}</li>{/each}
        </ul>
      </div>
    {/if}

    <h2 class="section-title">Giorni</h2>
    <div class="list">
      {#each dates as d (d)}
        <button class="row" onclick={() => onplan(d)}>
          <span class="grow">
            <span class="dayname">{dayTitle(d, today)}</span>
            <span class="sub">{dayPlanText(d)}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      {/each}
    </div>
    <p class="note">Tocca un giorno per scegliere l’outfit: lo trovi anche nell’agenda.</p>

    <h2 class="section-title">Outfit da portare</h2>
    {#if t.outfitIds.length}
      <div class="list">
        {#each t.outfitIds as id (id)}
          {@const o = outfitsById.get(id)}
          {#if o}
            <div class="row">
              <button class="grow plain" onclick={() => onopenoutfit(id)}>{o.name}<span class="sub">{o.itemIds.length === 1 ? '1 capo' : `${o.itemIds.length} capi`}, senza un giorno preciso</span></button>
              <button class="icon-btn" aria-label="Togli {o.name}" onclick={() => removeOutfit(id)}><Icon name="close" size={20} /></button>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
    <button class="btn btn-block add" onclick={() => (picking = 'outfit')}><Icon name="plus" size={20} /> Aggiungi un outfit</button>

    <h2 class="section-title">Capi in valigia ({packedCount}/{list.length})</h2>
    {#if reminders.length}
      <div class="remind">
        <strong>👙 Da ricordare</strong>
        <ul>{#each reminders as r (r)}<li>{r}</li>{/each}</ul>
      </div>
    {/if}
    {#if list.length}
      <div class="list">
        {#each list as e (e.itemId)}
          {@const it = itemsById.get(e.itemId)!}
          {@const alarm = alarms.find((a) => a.id === e.itemId)}
          <div class="row item" class:done={e.packed}>
            <button class="check" class:on={e.packed} aria-pressed={e.packed} aria-label="{it.name} in valigia" onclick={() => togglePacked(e.itemId, !e.packed)}>
              {#if e.packed}<Icon name="check" size={18} />{/if}
            </button>
            <button class="pic" onclick={() => onopenitem(e.itemId)} aria-label="Apri {it.name}"><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></button>
            <span class="grow">
              {it.name}
              <span class="sub" class:bad={!!alarm}>
                {looksLabel(e)}{e.extra && e.looks ? ' · extra' : ''}{alarm ? ` · ${alarm.reason}` : ''}{e.inTransit ? ' · lo indossi in viaggio' : ''}
              </span>
            </span>
            <button
              class="icon-btn transit"
              class:on={e.inTransit}
              aria-pressed={e.inTransit}
              aria-label="{it.name}: lo indosso in viaggio"
              title="Lo indosso in viaggio"
              onclick={() => run(() => setInTransit(db, tripId, e.itemId, !e.inTransit))}
            >
              <span aria-hidden="true">🚶</span>
            </button>
          </div>
        {/each}
      </div>
      <p class="note">✓ = in valigia (il capo passa a “In valigia”). 🚶 = lo indossi durante il viaggio e non occupa spazio.</p>
    {:else}
      <p class="note">Scegli gli outfit dei giorni o aggiungi dei capi: qui compare la lista unica, senza doppioni.</p>
    {/if}
    <button class="btn btn-block add" onclick={() => (picking = 'items')}><Icon name="plus" size={20} /> Capi extra</button>

    <h2 class="section-title">Necessaire ({checkedCount}/{t.checklist.length})</h2>
    {#if t.checklist.length}
      <div class="list">
        {#each t.checklist as c (c.id)}
          <div class="row entry" class:done={c.checked}>
            <button class="check" class:on={c.checked} aria-pressed={c.checked} aria-label="{c.label} preso" onclick={() => toggleEntry(c.id)}>
              {#if c.checked}<Icon name="check" size={18} />{/if}
            </button>
            <span class="grow label">{c.label}</span>
            <span class="qty">
              <button class="mini" aria-label="Meno {c.label}" disabled={c.qty <= 1} onclick={() => changeQty(c.id, -1)}>−</button>
              <span>{c.qty}</span>
              <button class="mini" aria-label="Più {c.label}" onclick={() => changeQty(c.id, 1)}>+</button>
            </span>
            <button class="icon-btn" aria-label="Togli {c.label}" onclick={() => removeEntry(c.id)}><Icon name="close" size={18} /></button>
          </div>
        {/each}
      </div>
    {/if}
    <form class="new-entry" onsubmit={(e) => (e.preventDefault(), addEntry())}>
      <input class="input" bind:value={newEntry} placeholder="Aggiungi una voce (es. ombrello)" enterkeyhint="done" />
      <button class="btn" type="submit" disabled={!newEntry.trim()}>Aggiungi</button>
    </form>
    <p class="note">
      {template ? `Dal template “${template.name}”: intimo e calzini si adattano ai giorni.` : 'Nessun template: puoi sceglierne uno modificando il viaggio.'}
      <button class="link" onclick={() => ((templateName = t.name), (naming = true))}>Salva come template</button>
    </p>

    <div class="final">
      {#if phase === 'planning'}
        <button class="btn btn-primary btn-block" onclick={markReady}>Valigia pronta</button>
      {/if}
      {#if phase !== 'done' && phase !== 'planning'}
        <button class="btn btn-primary btn-block" onclick={() => (unpacking = true)}>Disfa valigia</button>
      {:else if phase === 'planning' && packedCount}
        <button class="btn btn-block" onclick={() => (unpacking = true)}>Disfa valigia</button>
      {/if}
      <button class="btn btn-danger btn-block" onclick={remove}><Icon name="trash" size={20} /> Elimina viaggio</button>
    </div>
  {/if}
</Page>

{#if editing && t}
  <TripFormSheet trip={t} onclose={() => (editing = false)} onsaved={() => (editing = false)} />
{/if}

{#if picking === 'outfit' && t}
  <PickerSheet
    title="Outfit da portare"
    options={[...outfits.value]
      .filter((o) => !t.outfitIds.includes(o.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .map((o) => ({ id: o.id, label: o.name, sub: o.itemIds.length === 1 ? '1 capo' : `${o.itemIds.length} capi` }))}
    note="Per un giorno preciso, tocca il giorno nell’elenco qui sopra."
    empty="Non ci sono altri outfit: creali nella sezione Outfit."
    onpick={(id) => {
      picking = null;
      void run(() => patchTrip(db, tripId, { outfitIds: [...t.outfitIds, id] }));
    }}
    onclose={() => (picking = null)}
  />
{:else if picking === 'items' && t}
  <ItemPickerSheet
    title="Capi extra"
    items={items.value}
    selected={t.extraItemIds}
    multiple
    seasonBoxId={null}
    onlyAvailableByDefault={false}
    onpick={toggleExtra}
    onclose={() => (picking = null)}
  />
{/if}

{#if unpacking && t}
  <UnpackSheet trip={t} onclose={() => (unpacking = false)} />
{/if}

{#if naming}
  <Sheet title="Salva come template" onclose={() => (naming = false)}>
    <label class="field">
      <span>Nome del template</span>
      <input class="input" bind:value={templateName} maxlength="40" />
    </label>
    <p class="note">Il necessaire di questo viaggio diventa un template per i prossimi. Le voci del template di partenza continuano ad adattarsi ai giorni.</p>
    {#snippet footer()}
      <button class="btn btn-ghost" onclick={() => (naming = false)}>Annulla</button>
      <button class="btn btn-primary" onclick={saveAsTemplate}>Salva</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .summary {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .when,
  .meta {
    margin: 0;
  }
  .muted {
    color: var(--text-muted);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    font-size: 0.875rem;
    align-items: center;
  }
  .phase {
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--surface-2);
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
  .fill p {
    margin: 4px 0 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .fill p.bad,
  .sub.bad {
    color: var(--danger);
  }
  .bar {
    height: 10px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    transition: width 200ms ease;
  }
  .bar span.over {
    background: var(--danger);
  }
  .alarm {
    margin-top: 12px;
  }
  .alarm ul,
  .remind ul {
    margin: 4px 0 0;
    padding-left: 20px;
  }
  .remind {
    margin-bottom: 10px;
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .dayname {
    display: block;
  }
  .dayname::first-letter {
    text-transform: uppercase;
  }
  .plain {
    border: 0;
    background: none;
    text-align: left;
    padding: 0;
    cursor: pointer;
  }
  .add {
    margin-top: 8px;
  }
  .row.item,
  .row.entry {
    gap: 8px;
    padding-right: 4px;
    cursor: default;
  }
  .check {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 2px solid var(--border);
    background: transparent;
    display: grid;
    place-items: center;
    color: var(--accent-contrast);
    cursor: pointer;
  }
  .check.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .done .grow {
    color: var(--text-muted);
  }
  .entry.done .label {
    text-decoration: line-through;
  }
  .pic {
    flex: none;
    width: 40px;
    height: 52px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
  }
  .transit {
    opacity: 0.35;
    font-size: 1.2rem;
  }
  .transit.on {
    opacity: 1;
  }
  .qty {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .qty span {
    min-width: 22px;
    text-align: center;
    font-weight: 600;
  }
  .mini {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .mini:disabled {
    opacity: 0.4;
  }
  .new-entry {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .new-entry .btn {
    flex: none;
    padding: 0 16px;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
    padding: 0;
    cursor: pointer;
    min-height: 36px;
  }
  .final {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 24px;
  }
</style>
