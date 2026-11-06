import { describe, expect, it } from 'vitest';
import type { CategoryRecord, DiaryRecord, ItemRecord, SlotType, WishlistRecord } from '../db/types';
import { createItem, createOutfit, createTrip } from './factories';
import {
  addPerson,
  addToEndOfDay,
  autoLayout,
  blockReason,
  bringToFront,
  clampEntry,
  defaultOutfitName,
  describeWears,
  detachOutfitFromDiary,
  detachOutfitFromPlanner,
  detachOutfitFromTrip,
  diaryPieceIds,
  drawOrder,
  emptyOutfitFilters,
  endOfDayChoices,
  filterOutfits,
  groupDiaryByMonth,
  knownPeople,
  mergeLayout,
  missingSlots,
  modeOf,
  MODE_SLOTS,
  moveEntry,
  outfitPalette,
  outfitPieces,
  outfitsWornWith,
  outfitWarnings,
  outfitWearStats,
  pickedIds,
  picksFromPieces,
  reminderTime,
  scaleEntry,
  semaphore,
  sortOutfits,
  suggestPeople,
  togglePick,
  activeOutfitFilterCount,
  weekdayShort,
  monthLabel,
} from './outfits';

const NOW = '2026-11-06T10:00:00.000Z';
const cat = (slotType: SlotType, maxWears: number | null = 2) => ({ id: `c-${slotType}`, slotType, defaultMaxWears: maxWears });
const item = (slot: SlotType, over: Partial<ItemRecord> = {}) =>
  createItem({ name: over.name ?? slot, ...over }, cat(slot, slot === 'shoes' || slot === 'accessory' ? null : 2), NOW);
const diary = (over: Partial<DiaryRecord>): DiaryRecord => ({
  id: over.id ?? crypto.randomUUID(),
  date: '2026-11-01',
  outfitId: null,
  itemIds: [],
  location: '',
  people: [],
  note: '',
  photoIds: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('struttura dell’outfit', () => {
  const top = item('top_base', { name: 'T-shirt' });
  const jeans = item('bottom', { name: 'Jeans' });
  const dress = item('full_body', { name: 'Abito' });
  const bag = item('accessory', { name: 'Borsa' });

  it('riconosce Spezzato e Intero', () => {
    expect(modeOf(['top_base', 'bottom'])).toBe('separates');
    expect(modeOf(['full_body', 'shoes'])).toBe('onePiece');
    expect(MODE_SLOTS.onePiece.map((r) => r.slot)).not.toContain('bottom');
  });

  it('negli slot singoli sostituisce, negli altri aggiunge e toglie', () => {
    const rules = Object.fromEntries(MODE_SLOTS.separates.map((r) => [r.slot, r]));
    let picks = togglePick({}, rules.top_base!, 'a');
    picks = togglePick(picks, rules.top_base!, 'b');
    expect(picks.top_base).toEqual(['b']);
    picks = togglePick(picks, rules.accessory!, 'x');
    picks = togglePick(picks, rules.accessory!, 'y');
    expect(picks.accessory).toEqual(['x', 'y']);
    picks = togglePick(picks, rules.accessory!, 'x');
    expect(picks.accessory).toEqual(['y']);
  });

  it('salva solo gli slot della modalità e suggerisce quelli mancanti', () => {
    const picks = picksFromPieces([top, jeans, dress, bag].map((i) => ({ id: i.id, slotType: i.slotType })));
    expect(pickedIds(picks, 'separates')).toEqual([top.id, jeans.id, bag.id]);
    expect(pickedIds(picks, 'onePiece')).toEqual([dress.id, bag.id]);
    expect(missingSlots({ top_base: [top.id] }, 'separates')).toEqual(['Sotto']);
    expect(missingSlots({}, 'onePiece')).toEqual(['Intero (abito, tuta)']);
  });

  it('propone un nome libero', () => {
    expect(defaultOutfitName([])).toBe('Outfit 1');
    expect(defaultOutfitName(['Ufficio', 'Outfit 3'])).toBe('Outfit 4');
    expect(defaultOutfitName(['Outfit 2', 'x'])).toBe('Outfit 3');
  });

  it('mette insieme capi e desideri della wishlist, saltando quelli eliminati', () => {
    const categories = [{ id: 'cat-shoes', slotType: 'shoes' }] as CategoryRecord[];
    const wish = { id: 'w1', name: 'Mocassini', categoryId: 'cat-shoes', photoIds: [], colors: ['brown'] } as unknown as WishlistRecord;
    const outfit = createOutfit({ name: 'X', itemIds: [top.id, 'eliminato'], wishlistIds: ['w1'] }, NOW);
    const pieces = outfitPieces(outfit, new Map([[top.id, top]]), new Map([['w1', wish]]), categories);
    expect(pieces.map((p) => [p.name, p.slotType, p.source])).toEqual([
      ['T-shirt', 'top_base', 'item'],
      ['Mocassini', 'shoes', 'wishlist'],
    ]);
  });
});

describe('semaforo', () => {
  it('è verde solo se tutti i capi sono disponibili', () => {
    const a = item('top_base', { name: 'A' });
    const b = item('bottom', { name: 'B', status: 'toWash', hasStain: true });
    const c = item('shoes', { name: 'C', status: 'onLoan', loanTo: 'Giulia' });
    const d = item('bottom', { name: 'D', locationId: 'box' });
    const byId = new Map([a, b, c, d].map((i) => [i.id, i]));
    const pieces = [a, b, c, d].map((i) => ({ id: i.id, name: i.name, slotType: i.slotType, photoId: undefined, colors: [], source: 'item' as const }));
    expect(semaphore(pieces.slice(0, 1), byId, 'box').ok).toBe(true);
    const s = semaphore(pieces, byId, 'box');
    expect(s.ok).toBe(false);
    expect(s.blockers.map((x) => x.reason)).toEqual(['da lavare (con macchia)', 'in prestito a Giulia', 'nella scatola cambio stagione']);
    const wish = { ...pieces[0]!, id: 'w', name: 'Desiderio', source: 'wishlist' as const };
    expect(semaphore([wish], byId, 'box').blockers[0]?.reason).toBe('da comprare (wishlist)');
  });

  it('spiega ogni stato', () => {
    const reasons = (['drying', 'toIron', 'packed', 'maintenance', 'forSale'] as const).map((status) =>
      blockReason(item('top_base', { status }), null),
    );
    expect(reasons).toEqual(['steso ad asciugare', 'da stirare', 'in valigia', 'in manutenzione', 'da vendere']);
  });
});

describe('collage', () => {
  const p = (id: string, slotType: SlotType) => ({ id, slotType });

  it('mette sopra in alto, sotto al centro, scarpe in basso e accessori di lato', () => {
    const layout = autoLayout([p('coat', 'outerwear'), p('tee', 'top_base'), p('jeans', 'bottom'), p('shoes', 'shoes'), p('bag', 'accessory')]);
    const at = (id: string) => layout.find((e) => e.itemId === id)!;
    expect(at('tee').y).toBeLessThan(at('jeans').y);
    expect(at('jeans').y).toBeLessThan(at('shoes').y);
    expect(at('bag').x).toBeGreaterThan(at('jeans').x);
    expect(at('coat').x).toBeLessThan(at('tee').x);
    expect(at('coat').z).toBeLessThan(at('tee').z);
    expect(layout.every((e) => e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1)).toBe(true);
  });

  it('con un abito lo mette al centro e ordina dal fondo al davanti', () => {
    const layout = autoLayout([p('dress', 'full_body'), p('cardigan', 'top_layer'), p('a1', 'accessory'), p('a2', 'accessory')]);
    expect(layout).toHaveLength(4);
    expect(layout.find((e) => e.itemId === 'dress')!.scale).toBeGreaterThan(0.4);
    const acc = layout.filter((e) => e.itemId.startsWith('a'));
    expect(acc[0]!.y).toBeLessThan(acc[1]!.y);
    expect(drawOrder(layout).at(-1)!.itemId.startsWith('a')).toBe(true);
  });

  it('tiene le posizioni salvate e piazza solo i pezzi nuovi', () => {
    const saved = [{ itemId: 'tee', x: 0.1, y: 0.1, scale: 0.3, z: 7 }];
    const merged = mergeLayout(saved, [p('tee', 'top_base'), p('jeans', 'bottom')]);
    expect(merged[0]).toEqual(saved[0]);
    expect(merged[1]!.itemId).toBe('jeans');
    expect(merged[1]!.z).toBeGreaterThan(7);
    expect(mergeLayout(saved, [p('tee', 'top_base')])).toEqual(saved);
    expect(mergeLayout([...saved, { itemId: 'old', x: 0, y: 0, scale: 0.2, z: 1 }], [p('tee', 'top_base')])).toEqual(saved);
  });

  it('sposta, ridimensiona e porta davanti restando nei limiti', () => {
    let layout = autoLayout([p('a', 'top_base'), p('b', 'bottom')]);
    layout = moveEntry(layout, 'a', 1.4, -0.2);
    expect(layout[0]).toMatchObject({ x: 1, y: 0 });
    layout = scaleEntry(layout, 'b', 5);
    expect(layout.find((e) => e.itemId === 'b')!.scale).toBe(0.9);
    layout = bringToFront(layout, 'b');
    expect(drawOrder(layout).at(-1)!.itemId).toBe('b');
    expect(clampEntry({ itemId: 'x', x: 0.5, y: 0.5, scale: 0.01, z: 0 }).scale).toBe(0.08);
  });
});

describe('palette e avvisi', () => {
  it('ordina i colori dal più presente', () => {
    expect(outfitPalette([{ colors: ['white'] }, { colors: ['denim', 'white'] }, { colors: ['denim'] }])).toEqual(['denim', 'white']);
    expect(outfitPalette([])).toEqual([]);
  });

  it('raccoglie le note di intimo e vestibilità', () => {
    const warnings = outfitWarnings([
      { name: 'Abito rosso', intimateNote: 'Reggiseno senza spalline', fitNote: 'Perfetto' },
      { name: 'Jeans', intimateNote: '', fitNote: 'Da accorciare' },
    ]);
    expect(warnings).toEqual([
      { kind: 'intimate', text: 'Abito rosso: Reggiseno senza spalline' },
      { kind: 'fit', text: 'Jeans: Da accorciare' },
    ]);
  });
});

describe('libreria degli outfit', () => {
  const casual = createOutfit({ name: 'Casual', itemIds: [], occasions: ['occ-casual'], season: 'springSummer', weatherTags: ['hot'], favorite: true }, '2026-10-01T00:00:00.000Z');
  const work = createOutfit({ name: 'Ufficio', itemIds: [], occasions: ['occ-work'], season: 'allSeasons', weatherTags: ['mild'], incomplete: true }, '2026-11-01T00:00:00.000Z');
  const winter = createOutfit({ name: 'Neve', itemIds: [], season: 'autumnWinter', weatherTags: ['cold'], notes: 'Montagna' }, '2026-09-01T00:00:00.000Z');
  const all = [casual, work, winter];
  const log = [
    { outfitId: casual.id, date: '2026-11-04' },
    { outfitId: casual.id, date: '2026-10-01' },
    { outfitId: work.id, date: '2026-09-15' },
    { outfitId: null, date: '2026-11-05' },
  ];
  const stats = outfitWearStats(log);
  const ctx = { stats, diary: [diary({ outfitId: casual.id, people: ['Giulia'] })], today: '2026-11-06' };
  const names = (f: Partial<ReturnType<typeof emptyOutfitFilters>>) =>
    filterOutfits(all, { ...emptyOutfitFilters(), ...f }, ctx).map((o) => o.name);

  it('conta quante volte e quando è stato indossato', () => {
    expect(stats.get(casual.id)).toEqual({ count: 2, last: '2026-11-04' });
    expect(describeWears(stats.get(casual.id), (d) => d.slice(5))).toBe('Indossato 2 volte · 11-04');
    expect(describeWears(undefined, (d) => d)).toBe('Mai indossato');
  });

  it('filtra per occasione, stagione, meteo, preferiti, incompleti e ricerca', () => {
    expect(names({ occasionIds: ['occ-work'] })).toEqual(['Ufficio']);
    expect(names({ seasons: ['autumnWinter'] })).toEqual(['Ufficio', 'Neve']);
    expect(names({ weather: ['hot', 'cold'] })).toEqual(['Casual', 'Neve']);
    expect(names({ favorites: true })).toEqual(['Casual']);
    expect(names({ incomplete: true })).toEqual(['Ufficio']);
    expect(names({ query: 'montagna' })).toEqual(['Neve']);
  });

  it('trova i mai indossati e quelli non indossati da 30 giorni', () => {
    expect(names({ neverWorn: true })).toEqual(['Neve']);
    expect(names({ notWornRecently: true })).toEqual(['Ufficio', 'Neve']);
  });

  it('"Mai indossato con…" usa le persone del diario', () => {
    expect([...outfitsWornWith('giulia', ctx.diary)]).toEqual([casual.id]);
    expect(names({ neverWith: 'Giulia' })).toEqual(['Ufficio', 'Neve']);
    expect(activeOutfitFilterCount({ ...emptyOutfitFilters(), neverWith: 'Giulia', favorites: true })).toBe(2);
  });

  it('ordina per data, utilizzi, ultima volta e nome', () => {
    expect(sortOutfits(all, 'recent', stats).map((o) => o.name)).toEqual(['Ufficio', 'Casual', 'Neve']);
    expect(sortOutfits(all, 'mostWorn', stats).map((o) => o.name)).toEqual(['Casual', 'Ufficio', 'Neve']);
    expect(sortOutfits(all, 'longestUnworn', stats).map((o) => o.name)).toEqual(['Neve', 'Ufficio', 'Casual']);
    expect(sortOutfits(all, 'name', stats).map((o) => o.name)).toEqual(['Casual', 'Neve', 'Ufficio']);
  });
});

describe('persone del diario', () => {
  const entries = [diary({ people: ['Giulia', 'Marco'] }), diary({ people: ['giulia ', 'Àlex'] })];

  it('elenca i nomi dal più usato senza doppioni', () => {
    expect(knownPeople(entries, [{ kind: 'person', name: 'Zoe' }, { kind: 'owner', name: 'Mio' }])).toEqual(['Giulia', 'Àlex', 'Marco', 'Zoe']);
  });

  it('suggerisce mentre scrivi, senza chi è già scelto', () => {
    const known = knownPeople(entries);
    expect(suggestPeople(known, 'a', [])).toEqual(['Àlex', 'Giulia', 'Marco']);
    expect(suggestPeople(known, 'mar', [])).toEqual(['Marco']);
    expect(suggestPeople(known, '', ['GIULIA'])).toEqual(['Àlex', 'Marco']);
  });

  it('aggiunge un nome una volta sola', () => {
    expect(addPerson(['Giulia'], '  giulia ')).toEqual(['Giulia']);
    expect(addPerson(['Giulia'], ' Anna  Maria ')).toEqual(['Giulia', 'Anna Maria']);
    expect(addPerson([], '   ')).toEqual([]);
  });
});

describe('Fine giornata', () => {
  it('unisce i capi indossati e tiene il giorno più recente', () => {
    const a = addToEndOfDay(null, '2026-11-05', ['x', 'y']);
    expect(addToEndOfDay(a, '2026-11-06', ['y', 'z'])).toEqual({ date: '2026-11-06', itemIds: ['x', 'y', 'z'] });
    expect(addToEndOfDay(a, '2026-11-01', ['w']).date).toBe('2026-11-05');
  });

  it('propone solo i capi puliti che si lavano a utilizzi, con quelli alla soglia già da lavare', () => {
    const tee = item('top_base', { wearsSinceWash: 2, maxWearsBeforeWash: 2 });
    const jeans = item('bottom', { wearsSinceWash: 1, maxWearsBeforeWash: 4 });
    const shoes = item('shoes');
    const dirty = item('top_layer', { status: 'toWash' });
    const byId = new Map([tee, jeans, shoes, dirty].map((i) => [i.id, i]));
    const choices = endOfDayChoices({ date: '2026-11-06', itemIds: [tee.id, jeans.id, shoes.id, dirty.id, 'eliminato'] }, byId);
    expect(choices.map((c) => [c.item.id, c.reachedLimit])).toEqual([
      [tee.id, true],
      [jeans.id, false],
    ]);
    expect(endOfDayChoices(null, byId)).toEqual([]);
  });

  it('il promemoria suona oggi all’orario scelto, solo se non è passato', () => {
    const now = new Date(2026, 10, 6, 18, 0);
    expect(reminderTime('2026-11-06', '21:00', now)?.getHours()).toBe(21);
    expect(reminderTime('2026-11-06', '17:30', now)).toBeNull();
    expect(reminderTime('2026-11-06', 'boh', now)).toBeNull();
  });
});

describe('eliminare un outfit', () => {
  const outfit = createOutfit({ name: 'X', itemIds: ['a', 'b'] }, NOW);

  it('lo toglie dai viaggi, lascia i capi in agenda e nel diario', () => {
    const trip = createTrip({ name: 'T', startDate: '2026-11-10', endDate: '2026-11-12', outfitIds: [outfit.id, 'altro'] }, NOW);
    expect(detachOutfitFromTrip(trip, outfit.id, NOW)?.outfitIds).toEqual(['altro']);
    expect(detachOutfitFromTrip(trip, 'nessuno', NOW)).toBeNull();
    const day = { date: '2026-11-10', outfitId: outfit.id, itemIds: ['c'], note: '', createdAt: NOW, updatedAt: NOW };
    expect(detachOutfitFromPlanner(day, outfit, NOW)).toMatchObject({ outfitId: null, itemIds: ['c', 'a', 'b'] });
    const entry = diary({ outfitId: outfit.id, itemIds: ['a'] });
    expect(detachOutfitFromDiary(entry, outfit, NOW)).toMatchObject({ outfitId: null, itemIds: ['a', 'b'] });
    expect(detachOutfitFromDiary(diary({}), outfit, NOW)).toBeNull();
  });
});

describe('diario', () => {
  it('raggruppa per mese dal più recente', () => {
    const months = groupDiaryByMonth([
      diary({ id: '1', date: '2026-10-03' }),
      diary({ id: '2', date: '2026-11-02' }),
      diary({ id: '3', date: '2026-11-05' }),
    ]);
    expect(months.map((m) => [m.label, m.entries.map((e) => e.id)])).toEqual([
      ['Novembre 2026', ['3', '2']],
      ['Ottobre 2026', ['1']],
    ]);
    expect(monthLabel('2026-01')).toBe('Gennaio 2026');
    expect(weekdayShort('2026-11-06')).toBe('ven');
  });

  it('mostra i capi dell’outfit del ricordo', () => {
    const outfit = createOutfit({ name: 'X', itemIds: ['a', 'b'] }, NOW);
    expect(diaryPieceIds({ outfitId: outfit.id, itemIds: ['c'] }, new Map([[outfit.id, outfit]]))).toEqual(['a', 'b', 'c']);
    expect(diaryPieceIds({ outfitId: 'eliminato', itemIds: ['c'] }, new Map())).toEqual(['c']);
  });
});
