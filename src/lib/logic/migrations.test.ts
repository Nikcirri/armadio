import { describe, expect, it } from 'vitest';
import { categoriesToAddV2, categoriesToAddV3, categoriesToAddV4, itemToV2 } from './migrations';
import { UNDERWEAR_CATEGORY_IDS } from './presets';

describe('migrazione allo schema 2', () => {
  it('ogni capo ha underwearIds, tenendo solo gli id validi', () => {
    expect(itemToV2({ id: 'a' })).toEqual({ id: 'a', underwearIds: [] });
    expect(itemToV2({ id: 'b', underwearIds: ['x', 2, null, 'y'] })).toEqual({ id: 'b', underwearIds: ['x', 'y'] });
    expect(itemToV2({ id: 'c', underwearIds: 'rotto' })).toEqual({ id: 'c', underwearIds: [] });
  });

  it('aggiunge le categorie di intimo del preset (neutro se il preset manca)', () => {
    const cats = [{ id: 'c1', slotType: 'top_base' as const, order: 0 }];
    expect(categoriesToAddV2('uomo', cats, 'x').map((c) => c.id)).toEqual([
      UNDERWEAR_CATEGORY_IDS.briefs,
      UNDERWEAR_CATEGORY_IDS.undershirt,
      UNDERWEAR_CATEGORY_IDS.socks,
      UNDERWEAR_CATEGORY_IDS.bra,
    ]);
    expect(categoriesToAddV2(undefined, cats, 'x').map((c) => c.name)).toEqual(['Intimo', 'Reggiseni', 'Calze e calzini']);
    expect(categoriesToAddV2('donna', [], 'x')).toEqual([]);
  });

  it('schema 3: Reggiseni nel Neutro, solo se manca', () => {
    const cats = [{ id: 'c1', order: 4 }];
    expect(categoriesToAddV3('neutro', cats, 'x').map((c) => [c.id, c.name, c.order, c.slotType])).toEqual([
      [UNDERWEAR_CATEGORY_IDS.bra, 'Reggiseni', 5, 'underwear'],
    ]);
    expect(categoriesToAddV3(null, cats, 'x')).toHaveLength(1);
    expect(categoriesToAddV3('neutro', [...cats, { id: UNDERWEAR_CATEGORY_IDS.bra, order: 2 }], 'x')).toEqual([]);
    expect(categoriesToAddV3('uomo', cats, 'x')).toEqual([]);
    expect(categoriesToAddV3('neutro', [], 'x')).toEqual([]);
  });

  it('schema 4: Reggiseni con qualsiasi preset, solo se manca', () => {
    const cats = [{ id: 'c1', order: 7 }];
    expect(categoriesToAddV4(cats, 'x').map((c) => [c.id, c.name, c.order, c.defaultMaxWears])).toEqual([
      [UNDERWEAR_CATEGORY_IDS.bra, 'Reggiseni', 8, 3],
    ]);
    expect(categoriesToAddV4([...cats, { id: UNDERWEAR_CATEGORY_IDS.bra, order: 1 }], 'x')).toEqual([]);
    expect(categoriesToAddV4([], 'x')).toEqual([]);
  });
});
