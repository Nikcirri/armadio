import { describe, expect, it } from 'vitest';
import { allPairs, hasPair, isProtected, nameTaken, renameIn, togglePair, withoutOccasion } from './lists';

describe('liste', () => {
  it('protegge Mio, Armadio principale e Scatola cambio stagione', () => {
    expect(isProtected({ kind: 'owner', extra: { key: 'mine' } })).toBe(true);
    expect(isProtected({ kind: 'location', extra: { key: 'seasonBox' } })).toBe(true);
    expect(isProtected({ kind: 'occasion', extra: { key: 'casual' } })).toBe(false);
    expect(isProtected({ kind: 'location', extra: {} })).toBe(false);
  });

  it('controlla i nomi doppi e rinomina nelle liste di nomi', () => {
    const lists = [{ id: '1', kind: 'fabric' as const, name: 'Lino' }];
    expect(nameTaken(lists, 'fabric', ' lino ')).toBe(true);
    expect(nameTaken(lists, 'fabric', 'lino', '1')).toBe(false);
    expect(nameTaken(lists, 'occasion', 'lino')).toBe(false);
    expect(renameIn(['Lino', 'Cotone', 'Lino misto'], 'Lino', 'Cotone')).toEqual(['Cotone', 'Lino misto']);
  });

  it('matrice delle occasioni', () => {
    let m = togglePair([], 'a', 'b');
    expect(hasPair(m, 'b', 'a')).toBe(true);
    m = togglePair(m, 'c', 'a');
    m = togglePair(m, 'b', 'a');
    expect(m).toEqual([['c', 'a']]);
    expect(withoutOccasion([['a', 'b'], ['c', 'd']], 'a')).toEqual([['c', 'd']]);
    expect(allPairs([{ id: '1' }, { id: '2' }, { id: '3' }]).map(([x, y]) => x.id + y.id)).toEqual(['12', '13', '23']);
  });
});
