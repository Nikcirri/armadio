import { describe, expect, it } from 'vitest';
import type { ItemRecord } from '../db/types';
import { createItem } from './factories';
import { estimatedRevenue, highCostPerWear, lastUseDate, resaleOf, unusedFor, unwornForAYear } from './declutter';

const item = (over: Partial<ItemRecord>) => createItem({ name: 'Capo', ...over }, { id: 'c', slotType: 'top_base', defaultMaxWears: 1 }, '2026-01-01T10:00:00.000Z');

describe('decluttering', () => {
  it('trova i capi non indossati da 12 mesi', () => {
    const old = item({ name: 'Vecchio', lastWornDate: '2025-06-01' });
    const neverOld = item({ name: 'Mai', purchaseDate: '2025-01-10' });
    const recent = item({ name: 'Recente', lastWornDate: '2026-10-01' });
    const fresh = item({ name: 'Nuovo' });
    const selling = item({ name: 'In vendita', lastWornDate: '2024-01-01', status: 'forSale' });
    expect(unwornForAYear([old, neverOld, recent, fresh, selling], '2026-11-06').map((i) => i.name)).toEqual(['Mai', 'Vecchio']);
    expect(lastUseDate(fresh)).toBe('2026-01-01');
    expect(unusedFor(old, '2026-11-06')).toBe('da 17 mesi');
    expect(unusedFor(item({ lastWornDate: '2023-01-01' }), '2026-11-06')).toBe('da più di 3 anni');
  });

  it('costo per utilizzo alto: almeno 15 € e il triplo della mediana', () => {
    const cheap = [1, 2, 3].map((n) => item({ name: `c${n}`, price: 10, wearCount: 5 }));
    const pricey = item({ name: 'Cappotto', price: 300, wearCount: 2 });
    const midPrice = item({ name: 'Medio', price: 20, wearCount: 2 });
    const result = highCostPerWear([...cheap, pricey, midPrice]);
    expect(result.map((x) => [x.item.name, x.cpw])).toEqual([['Cappotto', 150]]);
  });

  it('ricavo: prezzo di vendita oppure stima del 30%', () => {
    expect(resaleOf({ resalePrice: 25, price: 100 })).toEqual({ value: 25, estimated: false });
    expect(resaleOf({ resalePrice: null, price: 59 })).toEqual({ value: 18, estimated: true });
    expect(resaleOf({ resalePrice: null, price: null })).toEqual({ value: null, estimated: false });
    const r = estimatedRevenue([
      item({ status: 'forSale', resalePrice: 25 }),
      item({ status: 'forSale', price: 100 }),
      item({ status: 'forSale' }),
      item({ price: 500 }),
    ]);
    expect(r).toEqual({ total: 55, estimated: 1, missing: 1 });
  });
});
