import { describe, expect, it } from 'vitest';
import type { ItemRecord, WearLogRecord } from '../db/types';
import { createItem } from './factories';
import {
  activeFilterCount,
  costPerWear,
  emptyFilters,
  filterItems,
  findDuplicates,
  isAvailable,
  needsWash,
  normalize,
  sortItems,
  withStatus,
} from './items';
import { euroInput, formatEuro, parseEuro } from './labels';
import { buildListing } from './listing';
import { countersFromLog, latestEntryFor, withoutItem } from './wears';

const NOW = '2026-11-05T10:00:00.000Z';
const cat = { id: 'c1', slotType: 'bottom' as const, defaultMaxWears: 4 };

function item(over: Partial<ItemRecord>): ItemRecord {
  return createItem({ name: 'Capo', ...over }, { ...cat, id: over.categoryId ?? cat.id }, over.createdAt ?? NOW);
}

describe('stati', () => {
  it('Pulito azzera utilizzi dal lavaggio e macchia', () => {
    const i = item({ status: 'toWash', wearsSinceWash: 4, hasStain: true });
    const c = withStatus(i, 'clean', NOW);
    expect(c.wearsSinceWash).toBe(0);
    expect(c.hasStain).toBe(false);
  });
  it('la macchia resta solo finché è da lavare', () => {
    const i = item({ status: 'toWash', hasStain: true });
    expect(withStatus(i, 'drying', NOW).hasStain).toBe(false);
  });
  it('uscendo dal prestito e dalla manutenzione pulisce i dati collegati', () => {
    const loan = item({ status: 'onLoan', loanTo: 'Sara', loanDate: '2026-11-01', statusNote: 'x' });
    const c = withStatus(loan, 'clean', NOW);
    expect([c.loanTo, c.loanDate, c.statusNote]).toEqual(['', null, '']);
    const m = withStatus(item({ status: 'maintenance', maintenanceTags: ['Tacco'] }), 'clean', NOW);
    expect(m.maintenanceTags).toEqual([]);
  });
  it('disponibile = pulito e non in scatola', () => {
    expect(isAvailable(item({ status: 'clean' }), 'box')).toBe(true);
    expect(isAvailable(item({ status: 'clean', locationId: 'box' }), 'box')).toBe(false);
    expect(isAvailable(item({ status: 'toIron' }), 'box')).toBe(false);
  });
  it('costo per utilizzo e soglia lavaggio', () => {
    expect(costPerWear({ price: 30, wearCount: 4 })).toBe(7.5);
    expect(costPerWear({ price: 30, wearCount: 0 })).toBeNull();
    expect(costPerWear({ price: null, wearCount: 3 })).toBeNull();
    expect(needsWash({ wearsSinceWash: 4, maxWearsBeforeWash: 4 })).toBe(true);
    expect(needsWash({ wearsSinceWash: 9, maxWearsBeforeWash: null })).toBe(false);
  });
});

describe('ricerca e filtri', () => {
  const items = [
    item({ name: 'Jeans blu', brand: "Levi's", colors: ['denim'], season: 'allSeasons', categoryId: 'jeans' }),
    item({ name: 'Maglione', fabrics: ['Lana'], colors: ['cream'], season: 'autumnWinter', favorite: true }),
    item({ name: 'Camicia di lino', fabrics: ['Lino'], colors: ['white', 'denim'], locationId: 'box' }),
  ];

  it('cerca su nome, brand e tessuto senza accenti né maiuscole', () => {
    expect(normalize('Perché')).toBe('perche');
    const f = { ...emptyFilters(), hideSeasonBox: false, query: 'levis' };
    expect(filterItems(items, { ...f, query: "LEVI'S" }, null).map((i) => i.name)).toEqual(['Jeans blu']);
    expect(filterItems(items, { ...f, query: 'lana' }, null).map((i) => i.name)).toEqual(['Maglione']);
  });

  it('nasconde la scatola cambio stagione, tranne se la si filtra', () => {
    expect(filterItems(items, emptyFilters(), 'box')).toHaveLength(2);
    expect(filterItems(items, { ...emptyFilters(), locationIds: ['box'] }, 'box').map((i) => i.name)).toEqual([
      'Camicia di lino',
    ]);
  });

  it('OR dentro un gruppo, AND tra gruppi', () => {
    const f = { ...emptyFilters(), hideSeasonBox: false, colors: ['denim', 'cream'] as const };
    expect(filterItems(items, { ...f, colors: [...f.colors] }, null)).toHaveLength(3);
    expect(
      filterItems(items, { ...f, colors: [...f.colors], seasons: ['autumnWinter'] }, null).map((i) => i.name),
    ).toEqual(['Maglione']);
    expect(filterItems(items, { ...emptyFilters(), favoritesOnly: true }, null)).toHaveLength(1);
    expect(activeFilterCount({ ...emptyFilters(), colors: ['red'], favoritesOnly: true, query: 'x' })).toBe(2);
  });
});

describe('ordinamento', () => {
  const a = item({ name: 'B', wearCount: 5, price: 50, lastWornDate: '2026-10-01', createdAt: '2026-01-01' });
  const b = item({ name: 'a', wearCount: 1, price: 10, lastWornDate: null, createdAt: '2026-03-01' });
  const c = item({ name: 'C', wearCount: 10, price: null, lastWornDate: '2026-11-01', createdAt: '2026-02-01' });
  const names = (list: ItemRecord[]) => list.map((i) => i.name);

  it('ordina in tutti i modi', () => {
    expect(names(sortItems([a, b, c], 'recent'))).toEqual(['a', 'C', 'B']);
    expect(names(sortItems([a, b, c], 'mostWorn'))).toEqual(['C', 'B', 'a']);
    expect(names(sortItems([a, b, c], 'leastWorn'))).toEqual(['a', 'B', 'C']);
    expect(names(sortItems([a, b, c], 'longestUnworn'))).toEqual(['a', 'B', 'C']);
    expect(names(sortItems([a, b, c], 'bestCpw'))).toEqual(['a', 'B', 'C']);
    expect(names(sortItems([a, b, c], 'name'))).toEqual(['a', 'B', 'C']);
    expect(names(sortItems([a, b, c], 'price'))).toEqual(['B', 'a', 'C']);
  });
});

describe('doppioni', () => {
  it('raggruppa stessa categoria e stesso colore principale', () => {
    const list = [
      item({ name: 'Jeans 1', colors: ['denim'] }),
      item({ name: 'Jeans 2', colors: ['denim', 'white'] }),
      item({ name: 'Jeans neri', colors: ['black'] }),
    ];
    const groups = findDuplicates(list);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.name)).toEqual(['Jeans 1', 'Jeans 2']);
  });
  it('tessuti diversi non sono doppioni', () => {
    const list = [item({ colors: ['black'], fabrics: ['Pelle'] }), item({ colors: ['black'], fabrics: ['Cotone'] })];
    expect(findDuplicates(list)).toHaveLength(0);
  });
  it('avvisa se un desiderio della wishlist somiglia a un capo', () => {
    const w = {
      id: 'w',
      name: 'Altri jeans',
      categoryId: 'c1',
      photoIds: [],
      price: null,
      storeOrLink: '',
      colors: ['denim' as const],
      season: null,
      occasions: [],
      priority: 'medium' as const,
      notes: '',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const groups = findDuplicates([item({ colors: ['denim'] })], [w]);
    expect(groups[0]?.wishlist).toHaveLength(1);
  });
});

describe('storico utilizzi', () => {
  const log: WearLogRecord[] = [
    { id: '1', date: '2026-10-01', itemIds: ['x', 'y'], itemNames: ['X', 'Y'], outfitId: null, diaryId: null, createdAt: '1', updatedAt: '1' },
    { id: '2', date: '2026-10-20', itemIds: ['x'], itemNames: ['X'], outfitId: null, diaryId: null, createdAt: '2', updatedAt: '2' },
  ];
  it('ricalcola i contatori', () => {
    expect(countersFromLog('x', log)).toEqual({ wearCount: 2, lastWornDate: '2026-10-20' });
    expect(countersFromLog('z', log)).toEqual({ wearCount: 0, lastWornDate: null });
  });
  it('trova e toglie la voce più recente', () => {
    expect(latestEntryFor('x', log)?.id).toBe('2');
    expect(latestEntryFor('y', log)?.id).toBe('1');
    expect(withoutItem(log[1]!, 'x', NOW)).toBeNull();
    expect(withoutItem(log[0]!, 'x', NOW)).toMatchObject({ itemIds: ['y'], itemNames: ['Y'] });
  });
});

describe('prezzi e annuncio', () => {
  it('legge i prezzi scritti all’italiana', () => {
    expect(parseEuro('12,50')).toBe(12.5);
    expect(parseEuro('€ 1.200')).toBe(1200);
    expect(parseEuro('9.99')).toBe(9.99);
    expect(parseEuro('')).toBeNull();
    expect(parseEuro('abc')).toBeNull();
    expect(euroInput(12.5)).toBe('12,5');
    expect(formatEuro(12.5)).toMatch(/12,50/);
  });
  it('crea il testo per Vinted', () => {
    const l = buildListing(
      {
        name: 'Felpa Paris',
        brand: 'Zara',
        size: 'M',
        colors: ['black', 'pattern'],
        fabrics: ['Cotone'],
        statusNote: 'Ottime condizioni',
        resalePrice: 15,
        notes: '',
        fitNote: 'Oversize',
      },
      'Felpe',
    );
    expect(l.title).toBe('Zara · Felpa Paris · taglia M');
    expect(l.description).toContain('Colore: nero, fantasia');
    expect(l.description).toContain('Condizioni: Ottime condizioni');
    expect(l.text.startsWith(l.title)).toBe(true);
  });
});
