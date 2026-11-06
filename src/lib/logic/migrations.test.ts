import { describe, expect, it } from 'vitest';
import { categoriesToAddV2, itemToV2 } from './migrations';
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
    ]);
    expect(categoriesToAddV2(undefined, cats, 'x').map((c) => c.name)).toEqual(['Intimo', 'Calze e calzini']);
    expect(categoriesToAddV2('donna', [], 'x')).toEqual([]);
  });
});
