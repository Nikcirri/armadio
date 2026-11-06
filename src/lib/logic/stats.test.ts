import { describe, expect, it } from 'vitest';
import type { ItemRecord, SlotType } from '../db/types';
import { createItem } from './factories';
import {
  averageCostPerWear,
  bestInvestments,
  capsuleScore,
  distribution,
  forgottenItems,
  formatCapsule,
  isMine,
  spendByYear,
  topWorn,
  wardrobeValue,
  wornRecentlyShare,
} from './stats';

const item = (slot: SlotType, over: Partial<ItemRecord> = {}) =>
  createItem({ name: over.name ?? slot, ownerId: 'mine', ...over }, { id: `c-${slot}`, slotType: slot, defaultMaxWears: 1 }, '2026-01-01T10:00:00.000Z');

describe('statistiche', () => {
  const a = item('top_base', { name: 'A', price: 30, purchaseDate: '2026-03-01', wearCount: 10, lastWornDate: '2026-11-01', colors: ['white'] });
  const b = item('bottom', { name: 'B', price: 80, purchaseDate: '2025-05-01', wearCount: 2, lastWornDate: '2026-05-01', colors: ['denim'] });
  const c = item('shoes', { name: 'C', price: 100, ownerId: 'sister', wearCount: 50, colors: ['white'] });
  const d = item('accessory', { name: 'D', ownerId: null, price: 20, purchaseDate: '2026-02-01' });
  const items = [a, b, c, d];

  it('valore, spesa per anno e costo medio solo sui capi "Mio"', () => {
    expect(isMine(d, 'mine')).toBe(true);
    expect(wardrobeValue(items, 'mine')).toBe(130);
    expect(spendByYear(items, 'mine')).toEqual([
      { year: '2026', total: 50, count: 2 },
      { year: '2025', total: 80, count: 1 },
    ]);
    expect(averageCostPerWear(items, 'mine')).toBe(21.5);
    expect(averageCostPerWear([], 'mine')).toBeNull();
  });

  it('indossati di recente, più usati, migliori investimenti e dimenticati', () => {
    expect(wornRecentlyShare(items, '2026-11-06')).toBe(25);
    expect(topWorn(items).map((i) => i.name)).toEqual(['C', 'A', 'B']);
    expect(bestInvestments(items, 'mine').map((x) => [x.item.name, x.cpw])).toEqual([
      ['A', 3],
      ['B', 40],
    ]);
    expect(forgottenItems(items, '2026-11-06').map((i) => i.name)).toEqual(['C', 'D', 'B']);
  });

  it('l’intimo resta fuori da più indossati, investimenti e dimenticati, ma conta nel valore', () => {
    const bra = item('underwear', { name: 'Reggiseno', price: 40, purchaseDate: '2026-01-10', wearCount: 99 });
    const all = [...items, bra];
    expect(topWorn(all).map((i) => i.name)).toEqual(['C', 'A', 'B']);
    expect(bestInvestments(all, 'mine').some((x) => x.item.name === 'Reggiseno')).toBe(false);
    expect(forgottenItems(all, '2026-11-06').some((i) => i.name === 'Reggiseno')).toBe(false);
    expect(wardrobeValue(all, 'mine')).toBe(170);
  });

  it('distribuzione con percentuali', () => {
    const byColor = distribution(items, (i) => i.colors[0] ?? 'none', (k) => k);
    expect(byColor.map((s) => [s.key, s.count, s.percent])).toEqual([
      ['white', 2, 50],
      ['denim', 1, 25],
      ['none', 1, 25],
    ]);
  });

  it('capsule score: spezzato o intero con scarpe, occasioni compatibili, si ferma al limite', () => {
    const tops = [item('top_base'), item('top_base', { occasions: ['sport'] })];
    const bottoms = [item('bottom', { occasions: ['formal'] })];
    const layers = [item('top_layer')];
    const shoes = [item('shoes'), item('shoes')];
    const dress = item('full_body');
    const matrix = [['sport', 'formal']] as const;
    // top normale: 1 base × (1 + 1 strato) × 1 (nessun capospalla) × 2 scarpe = 4; abito: (1+1) × 2 = 4
    expect(capsuleScore([...tops, ...bottoms, ...layers, ...shoes, dress], matrix)).toEqual({ count: 8, capped: false });
    expect(capsuleScore([...tops, ...bottoms], matrix)).toEqual({ count: 0, capped: false });
    const many = [
      ...Array.from({ length: 30 }, () => item('top_base')),
      ...Array.from({ length: 30 }, () => item('bottom')),
      ...Array.from({ length: 20 }, () => item('shoes')),
    ];
    const r = capsuleScore(many, [], 10_000);
    expect(r).toEqual({ count: 10_000, capped: true });
    expect(formatCapsule(r)).toBe('oltre 10.000');
    expect(formatCapsule({ count: 12345, capped: false })).toBe('12.345');
  });
});
