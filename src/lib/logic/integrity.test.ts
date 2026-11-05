import { describe, expect, it } from 'vitest';
import { createOutfit, createTrip } from './factories';
import { describeUsage, moveInOrder, swapWithinGroup, removeItemFromOutfit, removeItemFromPlanner, removeItemFromTrip } from './integrity';
import { buildEssentials, essentialQty, tripDays } from './packing';

const NOW = '2026-11-05T10:00:00.000Z';

describe('rimozione di un capo', () => {
  it('lo toglie dall’outfit e lo segna incompleto', () => {
    const o = createOutfit({ name: 'Look', itemIds: ['a', 'b'], layout: [{ itemId: 'a', x: 0, y: 0, scale: 1, z: 0 }] });
    const r = removeItemFromOutfit(o, 'a', NOW);
    expect(r?.itemIds).toEqual(['b']);
    expect(r?.layout).toEqual([]);
    expect(r?.incomplete).toBe(true);
    expect(removeItemFromOutfit(o, 'zzz', NOW)).toBeNull();
  });

  it('lo toglie da tutte le liste del viaggio', () => {
    const t = createTrip({
      name: 'Viaggio',
      startDate: '2026-11-06',
      endDate: '2026-11-08',
      extraItemIds: ['a'],
      wearInTransitIds: ['a', 'c'],
      packedItemIds: ['a'],
    });
    const r = removeItemFromTrip(t, 'a', NOW);
    expect(r?.extraItemIds).toEqual([]);
    expect(r?.wearInTransitIds).toEqual(['c']);
    expect(r?.packedItemIds).toEqual([]);
    expect(removeItemFromTrip(t, 'nope', NOW)).toBeNull();
  });

  it('lo toglie dall’agenda', () => {
    const day = { date: '2026-11-06', outfitId: null, itemIds: ['a'], note: '', createdAt: NOW, updatedAt: NOW };
    expect(removeItemFromPlanner(day, 'a', NOW)?.itemIds).toEqual([]);
  });

  it('descrive dove è usato', () => {
    expect(describeUsage({ outfits: 0, trips: 0, plannerDays: 0 })).toMatch(/Non è usato/);
    expect(describeUsage({ outfits: 2, trips: 1, plannerDays: 0 })).toContain('2 outfit e 1 viaggio');
  });
});

describe('ordinamento', () => {
  const recs = [
    { id: 'a', order: 0 },
    { id: 'b', order: 1 },
    { id: 'c', order: 2 },
  ];
  it('sposta su e giù', () => {
    expect(moveInOrder(recs, 'b', -1).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(recs, 'b', 1).map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });
  it('non esce dai bordi', () => {
    expect(moveInOrder(recs, 'a', -1).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(recs, 'c', 1).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('rinumera gli ordini', () => {
    expect(moveInOrder(recs, 'c', -1).map((r) => r.order)).toEqual([0, 1, 2]);
  });
});

describe('necessaire', () => {
  it('conta i giorni con partenza e ritorno', () => {
    expect(tripDays('2026-11-06', '2026-11-08')).toBe(3);
    expect(tripDays('2026-11-06', '2026-11-06')).toBe(1);
  });
  it('calcola le quantità', () => {
    expect(essentialQty({ label: 'Intimo', rule: 'perDayPlusOne', qty: 1 }, 3)).toBe(4);
    expect(essentialQty({ label: 'Calze', rule: 'perDay', qty: 1 }, 3)).toBe(3);
    expect(essentialQty({ label: 'Pigiama', rule: 'fixed', qty: 1 }, 3)).toBe(1);
    const list = buildEssentials([{ label: 'Intimo', rule: 'perDayPlusOne', qty: 1 }], 2);
    expect(list[0]).toMatchObject({ label: 'Intimo', qty: 3, checked: false });
  });
});

describe('ordinamento dentro un gruppo', () => {
  const recs = [
    { id: 'a', order: 0, g: 1 },
    { id: 'x', order: 1, g: 2 },
    { id: 'b', order: 2, g: 1 },
    { id: 'c', order: 3, g: 1 },
  ];
  const same = (p: { g: number }, q: { g: number }) => p.g === q.g;
  it('scambia con il vicino dello stesso gruppo, saltando gli altri', () => {
    const changed = swapWithinGroup(recs, 'b', -1, same);
    expect(changed.map((r) => [r.id, r.order])).toEqual([
      ['b', 0],
      ['a', 2],
    ]);
  });
  it('non fa nulla ai bordi del gruppo', () => {
    expect(swapWithinGroup(recs, 'a', -1, same)).toEqual([]);
    expect(swapWithinGroup(recs, 'c', 1, same)).toEqual([]);
  });
});
