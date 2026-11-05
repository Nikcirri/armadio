import { describe, expect, it } from 'vitest';
import { MAX_ITEM_PHOTOS, addPhotoId, canAddPhoto, draftNames, removePhotoId, setCover } from './itemPhotos';

describe('foto del capo', () => {
  it('ne accetta al massimo 4', () => {
    let ids: string[] = [];
    for (let i = 0; i < MAX_ITEM_PHOTOS; i++) ids = addPhotoId(ids, `p${i}`);
    expect(canAddPhoto(ids)).toBe(false);
    expect(() => addPhotoId(ids, 'p9')).toThrow(/massimo 4/);
  });
  it('sposta la copertina e rimuove', () => {
    expect(setCover(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(setCover(['a'], 'x')).toEqual(['a']);
    expect(removePhotoId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('nomi delle bozze', () => {
  it('continua la numerazione esistente', () => {
    expect(draftNames('Jeans', 3, ['Jeans 1', 'jeans 4', 'Jeans blu'])).toEqual(['Jeans 5', 'Jeans 6', 'Jeans 7']);
  });
  it('funziona con caratteri speciali e nome vuoto', () => {
    expect(draftNames('Top (estate)', 1, ['Top (estate) 2'])).toEqual(['Top (estate) 3']);
    expect(draftNames('  ', 2, [])).toEqual(['Capo 1', 'Capo 2']);
  });
});
