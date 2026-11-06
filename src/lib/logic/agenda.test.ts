import { describe, expect, it } from 'vitest';
import type { ItemRecord, PlannerRecord, SlotType } from '../db/types';
import {
  addMonths,
  bandPart,
  countdown,
  dayTitle,
  defaultTripDates,
  departureAlarms,
  intimateReminders,
  isPlanEmpty,
  looksLabel,
  luggageFill,
  luggageInfo,
  monthGrid,
  monthTitle,
  newChecklistEntry,
  packingList,
  planItemIds,
  planWarnings,
  rangeLabel,
  refreshEssentials,
  relativeDay,
  ruleText,
  sortTrips,
  templateFromChecklist,
  tripDateList,
  tripLooks,
  tripPhase,
  tripsOn,
  unpackCandidates,
  unpackDefaults,
  weekDays,
  weekStart,
  wearsOn,
} from './agenda';
import { createItem, createOutfit, createTrip } from './factories';

const NOW = '2026-11-06T10:00:00.000Z';
const item = (slot: SlotType, name: string, over: Partial<ItemRecord> = {}) =>
  createItem({ name, ...over }, { id: `c-${slot}`, slotType: slot, defaultMaxWears: 2 }, NOW);
const plan = (date: string, over: Partial<PlannerRecord> = {}): PlannerRecord => ({
  date,
  outfitId: null,
  itemIds: [],
  note: '',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('calendario', () => {
  it('le settimane partono dal lunedì', () => {
    expect(weekStart('2026-11-06')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekDays('2026-11-06')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });

  it('la griglia del mese copre tutte le settimane', () => {
    const grid = monthGrid('2026-11');
    expect(grid[0]![0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(grid.at(-1)!.at(-1)).toEqual({ date: '2026-12-06', inMonth: false });
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(30);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthTitle('2026-11')).toBe('Novembre 2026');
  });

  it('scrive le date in italiano', () => {
    expect(dayTitle('2026-11-06', '2026-11-06')).toBe('venerdì 6 novembre');
    expect(dayTitle('2027-01-01', '2026-11-06')).toBe('venerdì 1 gennaio 2027');
    expect([relativeDay('2026-11-06', '2026-11-06'), relativeDay('2026-11-05', '2026-11-06'), relativeDay('2026-11-07', '2026-11-06'), relativeDay('2026-11-10', '2026-11-06')]).toEqual([
      'Oggi',
      'Ieri',
      'Domani',
      null,
    ]);
    expect(rangeLabel('2026-11-13', '2026-11-15')).toBe('13–15 nov');
    expect(rangeLabel('2026-11-30', '2026-12-02')).toBe('30 nov – 2 dic');
  });
});

describe('giorni', () => {
  const jeans = item('bottom', 'Jeans', { status: 'toWash' });
  const tee = item('top_base', 'T-shirt', { hasStain: true });
  const shoes = item('shoes', 'Scarpe');
  const outfit = createOutfit({ name: 'Look', itemIds: [jeans.id, shoes.id] }, NOW);
  const byId = new Map([jeans, tee, shoes].map((i) => [i.id, i]));

  it('unisce i capi dell’outfit e quelli scelti a parte', () => {
    expect(planItemIds(plan('2026-11-10', { outfitId: outfit.id, itemIds: [tee.id, shoes.id] }), new Map([[outfit.id, outfit]]))).toEqual([jeans.id, shoes.id, tee.id]);
    expect(planItemIds(undefined, new Map())).toEqual([]);
    expect(isPlanEmpty(plan('x', { note: '  ' }))).toBe(true);
  });

  it('badge giallo per capi non puliti o macchiati', () => {
    expect(planWarnings([jeans.id, tee.id, shoes.id], byId)).toEqual([
      { id: jeans.id, name: 'Jeans', reason: 'da lavare' },
      { id: tee.id, name: 'T-shirt', reason: 'macchiato' },
    ]);
  });

  it('trova lo storico del giorno e i viaggi che lo comprendono', () => {
    const log = [
      { id: '2', date: '2026-11-05', itemIds: [], itemNames: [], outfitId: null, diaryId: null, createdAt: 'b', updatedAt: '' },
      { id: '1', date: '2026-11-05', itemIds: [], itemNames: [], outfitId: null, diaryId: null, createdAt: 'a', updatedAt: '' },
      { id: '3', date: '2026-11-04', itemIds: [], itemNames: [], outfitId: null, diaryId: null, createdAt: 'a', updatedAt: '' },
    ];
    expect(wearsOn('2026-11-05', log).map((e) => e.id)).toEqual(['1', '2']);
    const trip = createTrip({ name: 'T', startDate: '2026-11-13', endDate: '2026-11-15' }, NOW);
    expect(tripsOn('2026-11-14', [trip])).toHaveLength(1);
    expect(tripsOn('2026-11-16', [trip])).toHaveLength(0);
    expect(['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => bandPart(d, trip))).toEqual(['start', 'middle', 'end']);
    expect(bandPart('2026-11-13', { startDate: '2026-11-13', endDate: '2026-11-13' })).toBe('single');
  });
});

describe('valigia', () => {
  const jeans = item('bottom', 'Jeans blu', { categoryId: 'c-bottom' });
  const tee = item('top_base', 'T-shirt', { intimateNote: 'Reggiseno color carne' });
  const coat = item('outerwear', 'Cappotto', { categoryId: 'c-outer', status: 'toWash' });
  const shoes = item('shoes', 'Sneakers', { categoryId: 'c-shoes' });
  const byId = new Map([jeans, tee, coat, shoes].map((i) => [i.id, i]));
  const office = createOutfit({ name: 'Ufficio', itemIds: [jeans.id, coat.id] }, NOW);
  const casual = createOutfit({ name: 'Casual', itemIds: [jeans.id, tee.id] }, NOW);
  const outfits = new Map([office, casual].map((o) => [o.id, o]));
  const trip = createTrip(
    {
      name: 'Firenze',
      startDate: '2026-11-13',
      endDate: '2026-11-15',
      outfitIds: [office.id],
      extraItemIds: [shoes.id],
      wearInTransitIds: [coat.id],
      packedItemIds: [jeans.id],
    },
    NOW,
  );
  const planner = new Map([
    ['2026-11-13', plan('2026-11-13', { outfitId: casual.id })],
    ['2026-11-14', plan('2026-11-14', { itemIds: [jeans.id, shoes.id] })],
    ['2026-11-20', plan('2026-11-20', { itemIds: [tee.id] })],
  ]);
  const looks = tripLooks(trip, planner, outfits);
  const list = packingList(trip, looks, byId);

  it('un look per ogni giorno pianificato più gli outfit senza giorno', () => {
    expect(tripDateList(trip)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
    expect(looks.map((l) => [l.date, l.itemIds.length])).toEqual([
      ['2026-11-13', 2],
      ['2026-11-14', 2],
      [null, 2],
    ]);
  });

  it('lista unica con il numero di look, extra, in viaggio e spuntati', () => {
    const view = list.map((e) => [byId.get(e.itemId)!.name, looksLabel(e), e.extra, e.inTransit, e.packed]);
    expect(view).toEqual([
      ['Cappotto', '1 look', false, true, false],
      ['T-shirt', '1 look', false, false, false],
      ['Jeans blu', '3 look', false, false, true],
      ['Sneakers', '1 look', true, false, false],
    ]);
    expect(looksLabel({ looks: 0, extra: true })).toBe('extra');
  });

  it('i punti contano i capi unici senza quelli indossati in viaggio', () => {
    const categories = new Map([
      ['c-bottom', { bulkWeight: 2 }],
      ['c-top_base', { bulkWeight: 1 }],
      ['c-outer', { bulkWeight: 4 }],
      ['c-shoes', { bulkWeight: 3 }],
    ]);
    expect(luggageFill(list, byId, categories, 'underseat')).toEqual({ points: 6, capacity: 12, percent: 50, over: false });
    expect(luggageFill(list, byId, categories, 'underseat').points).toBe(6);
    const all = list.map((e) => ({ ...e, inTransit: false }));
    expect(luggageFill(all, byId, new Map([['c-outer', { bulkWeight: 20 }]]), 'underseat')).toMatchObject({ over: true, percent: 100 });
    expect(luggageInfo('checked').points).toBe(50);
  });

  it('allarme pre-partenza e note intimo', () => {
    expect(departureAlarms(list, byId)).toEqual([{ id: coat.id, name: 'Cappotto', reason: 'da lavare' }]);
    expect(intimateReminders(list, byId)).toEqual(['T-shirt: Reggiseno color carne']);
  });

  it('Disfa valigia propone Da lavare per i capi indossati durante il viaggio', () => {
    const log = [{ date: '2026-11-15', itemIds: [shoes.id] }, { date: '2026-11-20', itemIds: [coat.id] }];
    const d = unpackDefaults(trip, [jeans.id, tee.id, coat.id, shoes.id], log, planner, outfits, '2026-11-13');
    expect(d).toEqual({ [jeans.id]: 'toWash', [tee.id]: 'toWash', [coat.id]: 'clean', [shoes.id]: 'toWash' });
    const dirty = unpackDefaults(trip, [coat.id], [], new Map(), outfits, '2026-11-13', byId);
    expect(dirty).toEqual({ [coat.id]: 'toWash' });
  });

  it('in Disfa valigia non compaiono i capi in prestito o in manutenzione', () => {
    const loan = { ...shoes, status: 'onLoan' as const };
    const map = new Map([...byId, [shoes.id, loan]]);
    expect(unpackCandidates(list, map)).toEqual([coat.id, tee.id, jeans.id]);
  });
});

describe('necessaire e template', () => {
  const template = [
    { label: 'Intimo', rule: 'perDayPlusOne' as const, qty: 1 },
    { label: 'Calzini', rule: 'perDay' as const, qty: 1 },
    { label: 'Pigiama', rule: 'fixed' as const, qty: 1 },
  ];

  it('ricalcola solo le voci del template, tenendo le spunte', () => {
    const list = [
      { id: '1', label: 'Intimo', qty: 4, checked: true },
      { id: '2', label: 'Ombrello', qty: 1, checked: false },
      { id: '3', label: 'calzini', qty: 3, checked: false },
    ];
    expect(refreshEssentials(list, template, 5)).toEqual([
      { id: '1', label: 'Intimo', qty: 6, checked: true },
      { id: '2', label: 'Ombrello', qty: 1, checked: false },
      { id: '3', label: 'calzini', qty: 5, checked: false },
    ]);
  });

  it('crea un template dal necessaire tenendo le regole note', () => {
    const list = [
      { id: '1', label: 'Intimo', qty: 6, checked: true },
      { id: '2', label: ' Ombrello ', qty: 2, checked: false },
      { id: '3', label: ' ', qty: 1, checked: false },
    ];
    expect(templateFromChecklist(list, template)).toEqual([
      { label: 'Intimo', rule: 'perDayPlusOne', qty: 1 },
      { label: 'Ombrello', rule: 'fixed', qty: 2 },
    ]);
    expect(newChecklistEntry('  Crema ', 0)).toMatchObject({ label: 'Crema', qty: 1, checked: false });
    expect(template.map(ruleText)).toEqual(['giorni + 1', 'uno al giorno', '1']);
  });
});

describe('stato dei viaggi', () => {
  const t = (over: Partial<ReturnType<typeof createTrip>>) => createTrip({ name: 'T', startDate: '2026-11-13', endDate: '2026-11-15', ...over }, NOW);

  it('da preparare, pronto, in viaggio, da disfare, concluso', () => {
    expect(tripPhase(t({}), '2026-11-06')).toBe('planning');
    expect(tripPhase(t({ status: 'packed' }), '2026-11-06')).toBe('packed');
    expect(tripPhase(t({}), '2026-11-14')).toBe('travelling');
    expect(tripPhase(t({ status: 'packed' }), '2026-11-16')).toBe('toUnpack');
    expect(tripPhase(t({ status: 'done' }), '2026-11-14')).toBe('done');
  });

  it('ordina i viaggi e conta i giorni alla partenza', () => {
    const a = t({ name: 'A', startDate: '2026-12-01', endDate: '2026-12-03' });
    const b = t({ name: 'B' });
    const c = t({ name: 'C', startDate: '2026-10-01', endDate: '2026-10-02', status: 'done' });
    const s = sortTrips([a, b, c], '2026-11-06');
    expect(s.upcoming.map((x) => x.name)).toEqual(['B', 'A']);
    expect(s.past.map((x) => x.name)).toEqual(['C']);
    expect([countdown(b, '2026-11-06'), countdown(b, '2026-11-12'), countdown(b, '2026-11-13'), countdown(b, '2026-11-14')]).toEqual([
      'tra 7 giorni',
      'si parte domani',
      'si parte oggi',
      null,
    ]);
    expect(defaultTripDates('2026-11-06')).toEqual({ startDate: '2026-11-07', endDate: '2026-11-09' });
  });
});
