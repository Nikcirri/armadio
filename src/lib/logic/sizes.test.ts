import { describe, expect, it } from 'vitest';
import { addBrandSize, filterBrandSizes, formatCm, parseCm, sizeSuggestions, sortBrandSizes } from './sizes';

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
});
