import { describe, expect, it } from 'vitest';
import {
  addBrandSize,
  filterBrandSizes,
  formatCm,
  MEASUREMENTS,
  parseCm,
  parseRingSize,
  RING_FINGERS,
  ringCircumferenceMm,
  sizeSuggestions,
  sortBrandSizes,
} from './sizes';

describe('taglie e misure', () => {
  it('legge le misure in cm anche con la virgola', () => {
    expect(parseCm('72,5')).toBe(72.5);
    expect(parseCm(' 168 cm')).toBe(168);
    expect(parseCm('')).toBeNull();
    expect(parseCm('abc')).toBeNull();
    expect(parseCm('0')).toBeNull();
    expect(formatCm(72.5)).toBe('72,5');
    expect(formatCm(null)).toBe('');
  });

  it('aggiunge taglie senza doppioni e in ordine', () => {
    let list = addBrandSize([], { brand: " Levi's ", size: '27' });
    list = addBrandSize(list, { brand: 'Zara', size: 'M' });
    list = addBrandSize(list, { brand: 'zara', size: ' m ' });
    list = addBrandSize(list, { brand: 'Nike', size: '' });
    expect(list).toEqual([
      { brand: "Levi's", size: '27' },
      { brand: 'Zara', size: 'M' },
    ]);
    expect(sortBrandSizes([{ brand: 'b', size: '1' }, { brand: 'a', size: '2' }])[0]!.brand).toBe('a');
    expect(filterBrandSizes(list, 'zar')).toEqual([{ brand: 'Zara', size: 'M' }]);
  });

  it('propone le taglie dei capi non ancora salvate', () => {
    const items = [
      { brand: 'Zara', size: 'M' },
      { brand: 'Nike', size: '38.5' },
      { brand: 'Nike', size: '38.5' },
      { brand: '', size: 'S' },
    ];
    expect(sizeSuggestions(items, [{ brand: 'zara', size: 'm' }])).toEqual([{ brand: 'Nike', size: '38.5' }]);
  });

  it('misure del corpo con la vita bassa e anelli per ogni dito, senza chiavi doppie', () => {
    expect(MEASUREMENTS.map((m) => m.key)).toContain('lowWaist');
    expect(MEASUREMENTS.findIndex((m) => m.key === 'lowWaist')).toBe(MEASUREMENTS.findIndex((m) => m.key === 'waist') + 1);
    expect(RING_FINGERS.map((f) => f.label)).toEqual(['Pollice', 'Indice', 'Medio', 'Anulare', 'Mignolo']);
    const keys = [...MEASUREMENTS, ...RING_FINGERS].map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('legge la misura italiana degli anelli e calcola la circonferenza', () => {
    expect(parseRingSize('14')).toBe(14);
    expect(parseRingSize(' 12,5 ')).toBe(12.5);
    expect(parseRingSize('IT 16')).toBe(16);
    expect(parseRingSize('n. 9')).toBe(9);
    expect(parseRingSize('13,3')).toBe(13.5);
    expect(parseRingSize('')).toBeNull();
    expect(parseRingSize('0')).toBeNull();
    expect(parseRingSize('54 mm')).toBeNull();
    expect(parseRingSize('45')).toBeNull();
    expect(ringCircumferenceMm(14)).toBe(54);
    expect(ringCircumferenceMm(4)).toBe(44);
  });
});
