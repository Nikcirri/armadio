import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  buildDefaultLists,
  buildOccasionMatrix,
  buildPresetCategories,
  INTIMATE_SUGGESTIONS,
} from './presets';
import { SLOTS } from './slots';

describe('preset', () => {
  it('ogni preset copre tutti e 7 gli slot', () => {
    for (const p of PRESETS) {
      const cats = buildPresetCategories(p.id);
      for (const slot of SLOTS) {
        expect(cats.some((c) => c.slotType === slot.id), `${p.id} ${slot.id}`).toBe(true);
      }
    }
  });

  it('le categorie hanno ordine progressivo, nomi unici e soglie dello slot', () => {
    const cats = buildPresetCategories('donna');
    expect(cats.map((c) => c.order)).toEqual(cats.map((_, i) => i));
    expect(new Set(cats.map((c) => c.name)).size).toBe(cats.length);
    const shoes = cats.find((c) => c.slotType === 'shoes');
    expect(shoes?.defaultMaxWears).toBeNull();
    const tee = cats.find((c) => c.name === 'T-shirt');
    expect(tee?.defaultMaxWears).toBe(1);
  });

  it('solo il preset Donna ha gonne e tacchi', () => {
    const names = (p: 'donna' | 'uomo' | 'neutro') => buildPresetCategories(p).map((c) => c.name);
    expect(names('donna')).toContain('Gonne');
    expect(names('uomo')).not.toContain('Gonne');
    expect(names('uomo')).toContain('Cravatte e papillon');
  });

  it('ha suggerimenti intimo per ogni preset', () => {
    for (const p of PRESETS) expect(INTIMATE_SUGGESTIONS[p.id].length).toBeGreaterThan(2);
  });
});

describe('liste predefinite', () => {
  const lists = buildDefaultLists();

  it('contiene proprietario "Mio" e la scatola cambio stagione', () => {
    expect(lists.find((l) => l.kind === 'owner' && l.extra.key === 'mine')?.name).toBe('Mio');
    expect(lists.some((l) => l.kind === 'location' && l.extra.key === 'seasonBox')).toBe(true);
  });

  it('i template valigia hanno il necessaire', () => {
    const templates = lists.filter((l) => l.kind === 'packingTemplate');
    expect(templates).toHaveLength(4);
    for (const t of templates) expect(t.extra.essentials?.length).toBeGreaterThan(5);
  });

  it('crea la matrice delle occasioni incompatibili con gli id veri', () => {
    const matrix = buildOccasionMatrix(lists);
    expect(matrix).toHaveLength(3);
    const ids = new Set(lists.map((l) => l.id));
    for (const [a, b] of matrix) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
});
