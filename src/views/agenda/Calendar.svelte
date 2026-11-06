<script lang="ts" module>
  /** Un giorno nel calendario: cosa mostrare sotto il numero. */
  export interface DayMarks {
    worn: boolean;
    planned: boolean;
    warning: boolean;
    trip: { name: string; part: 'single' | 'start' | 'middle' | 'end' } | null;
  }
</script>

<script lang="ts">
  import { addMonths, dayTitle, monthGrid, monthOf, monthTitle, rangeLabel, weekDays, WEEKDAY_INITIALS } from '../../lib/logic/agenda';
  import { addDays, fromDateKey } from '../../lib/logic/util';
  import Icon from '../../lib/ui/Icon.svelte';

  /**
   * Calendario dell'Agenda (SPEC 8.4): settimana scorrevole o mese intero.
   * Si cambia settimana/mese con le frecce o scorrendo con il dito.
   */
  let {
    mode,
    selected,
    anchor,
    today,
    marks,
    onselect,
    onanchor,
  }: {
    mode: 'week' | 'month';
    selected: string;
    anchor: string;
    today: string;
    marks: (date: string) => DayMarks;
    onselect: (date: string) => void;
    onanchor: (date: string) => void;
  } = $props();

  const days = $derived(weekDays(anchor));
  const grid = $derived(monthGrid(monthOf(anchor)));
  const title = $derived(mode === 'week' ? rangeLabel(days[0]!, days[6]!) : monthTitle(monthOf(anchor)));
  const showsToday = $derived(mode === 'week' ? days.includes(today) : monthOf(anchor) === monthOf(today));

  function shift(step: 1 | -1) {
    onanchor(mode === 'week' ? addDays(anchor, 7 * step) : `${addMonths(monthOf(anchor), step)}-01`);
  }

  let startX: number | null = null;
  function down(e: PointerEvent) {
    startX = e.clientX;
  }
  function up(e: PointerEvent) {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60) shift(dx < 0 ? 1 : -1);
  }

  const dayNumber = (d: string) => fromDateKey(d).getDate();
</script>

<div class="calendar" onpointerdown={down} onpointerup={up} onpointercancel={() => (startX = null)} role="group" aria-label="Calendario">
  <div class="head">
    <button class="icon-btn" aria-label={mode === 'week' ? 'Settimana precedente' : 'Mese precedente'} onclick={() => shift(-1)}><Icon name="back" /></button>
    <strong class="title">{title}</strong>
    <button class="icon-btn" aria-label={mode === 'week' ? 'Settimana successiva' : 'Mese successivo'} onclick={() => shift(1)}><Icon name="chevron" /></button>
    {#if !showsToday || selected !== today}
      <button class="today-btn" onclick={() => (onselect(today), onanchor(today))}>Oggi</button>
    {/if}
  </div>

  {#snippet cell(date: string, inMonth: boolean, initial: string | null)}
    {@const m = marks(date)}
    <button
      class="day"
      class:sel={date === selected}
      class:today={date === today}
      class:out={!inMonth}
      class:past={date < today}
      aria-pressed={date === selected}
      aria-label="{dayTitle(date, today)}{m.worn ? ', indossato' : ''}{m.planned ? ', pianificato' : ''}{m.warning ? ', un capo non sarà pronto' : ''}{m.trip ? `, viaggio ${m.trip.name}` : ''}"
      onclick={() => onselect(date)}
    >
      {#if initial}<span class="wd">{initial}</span>{/if}
      <span class="num">{dayNumber(date)}</span>
      <span class="dots" aria-hidden="true">
        {#if m.worn}<span class="dot worn"></span>{/if}
        {#if m.planned}<span class="dot plan" class:warn={m.warning}></span>{/if}
      </span>
      {#if m.trip}<span class="band {m.trip.part}" aria-hidden="true"></span>{/if}
    </button>
  {/snippet}

  {#if mode === 'week'}
    <div class="cal-row week">
      {#each days as d, i (d)}{@render cell(d, true, WEEKDAY_INITIALS[i] ?? '')}{/each}
    </div>
  {:else}
    <div class="cal-row initials" aria-hidden="true">
      {#each WEEKDAY_INITIALS as w, i (i)}<span>{w}</span>{/each}
    </div>
    {#each grid as week (week[0]!.date)}
      <div class="cal-row">
        {#each week as c (c.date)}{@render cell(c.date, c.inMonth, null)}{/each}
      </div>
    {/each}
  {/if}

  <p class="legend" aria-hidden="true">
    <span><span class="dot worn"></span> indossato</span>
    <span><span class="dot plan"></span> pianificato</span>
    <span><span class="dot plan warn"></span> capo da preparare</span>
    <span><span class="band-sample"></span> viaggio</span>
  </p>
</div>

<style>
  .calendar {
    touch-action: pan-y;
    user-select: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 4px;
  }
  .title {
    flex: 1;
    text-align: center;
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 1.125rem;
  }
  .today-btn {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    font-weight: 600;
    font-size: 0.8125rem;
    cursor: pointer;
  }
  .cal-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .initials span {
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 4px 0;
  }
  .day {
    position: relative;
    min-height: 52px;
    padding: 4px 0 10px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
  }
  .week .day {
    min-height: 72px;
    padding-top: 6px;
  }
  .wd {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .num {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 600;
  }
  .past .num {
    font-weight: 400;
  }
  .out {
    opacity: 0.4;
  }
  .today .num {
    border: 2px solid var(--accent);
    color: var(--accent);
  }
  .sel .num {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
  }
  .dots {
    display: flex;
    gap: 3px;
    height: 7px;
  }
  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .dot.worn {
    background: var(--accent);
  }
  .dot.plan {
    border: 1.5px solid var(--accent);
  }
  .dot.plan.warn {
    background: #e2a400;
    border-color: #e2a400;
  }
  .band {
    position: absolute;
    left: -1px;
    right: -1px;
    bottom: 2px;
    height: 5px;
    background: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .band.start {
    left: 30%;
    border-radius: 3px 0 0 3px;
  }
  .band.end {
    right: 30%;
    border-radius: 0 3px 3px 0;
  }
  .band.single {
    left: 30%;
    right: 30%;
    border-radius: 3px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 6px 4px 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .band-sample {
    display: inline-block;
    width: 16px;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--accent) 55%, transparent);
  }
</style>
