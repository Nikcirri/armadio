import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  buildDefaultLists,
  buildOccasionMatrix,
  buildPresetCategories,
  INTIMATE_SUGGESTIONS,
  UNDERWEAR_CATEGORY_IDS,
  isPreset,
  underwearCategoriesToAdd,
} from './presets';
import { SLOTS } from './slots';

describe('preset', () => {
  it('ogni preset copre tutti e 8 gli slot', () => {
    for (const p of PRESETS) {
      const cats = buildPresetCategories(p.id);
      for (const slot of SLOTS) {
        expect(cats.some((c) => c.slotType === slot.id), `${p.id} ${slot.id}`).toBe(true);
      }
    }
  });

  it('l’intimo ha id fissi e va in fondo; si aggiunge una volta sola agli armadi già configurati', () => {
    const donna = buildPresetCategories('donna');
    const under = donna.filter((c) => c.slotType === 'underwear');
    expect(under.map((c) => [c.id, c.name, c.defaultMaxWears])).toEqual([
      [UNDERWEAR_CATEGORY_IDS.bra, 'Reggiseni', 3],
      [UNDERWEAR_CATEGORY_IDS.briefs, 'Slip e culotte', 1],
      [UNDERWEAR_CATEGORY_IDS.socks, 'Calze e collant', 1],
    ]);
    expect(donna.slice(-3)).toEqual(under);
    expect(buildPresetCategories('uomo').filter((c) => c.slotType === 'underwear').map((c) => c.name)).toEqual(['Boxer e slip', 'Canottiere', 'Calzini', 'Reggiseni']);
    expect(buildPresetCategories('neutro').filter((c) => c.slotType === 'underwear').map((c) => c.name)).toEqual(['Intimo', 'Reggiseni', 'Calze e calzini']);

    const old = donna.filter((c) => c.slotType !== 'underwear');
    const add = underwearCategoriesToAdd('uomo', old, '2026-11-06T10:00:00.000Z');
    expect(add.map((c) => [c.name, c.order])).toEqual([
      ['Boxer e slip', old.length],
      ['Canottiere', old.length + 1],
      ['Calzini', old.length + 2],
      ['Reggiseni', old.length + 3],
    ]);
    // Reggiseni c'è in tutti i profili
    for (const p of PRESETS) expect(buildPresetCategories(p.id).some((c) => c.id === UNDERWEAR_CATEGORY_IDS.bra), p.id).toBe(true);
    expect(underwearCategoriesToAdd('uomo', donna)).toEqual([]);
    expect(underwearCategoriesToAdd('donna', [])).toEqual([]);
    expect(isPreset('donna')).toBe(true);
    expect(isPreset('altro')).toBe(false);
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
