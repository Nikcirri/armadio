import { describe, expect, it } from 'vitest';
import type { CategoryRecord } from '../db/types';
import { MIN_CONFIDENCE, guessCategory } from './categoryGuess';
import { buildPresetCategories } from './presets';

const NOW = '2026-11-16T10:00:00.000Z';
const donna = buildPresetCategories('donna', NOW);
const uomo = buildPresetCategories('uomo', NOW);
const name = (cats: CategoryRecord[], id: string | undefined) => cats.find((c) => c.id === id)?.name;

describe('guessCategory', () => {
  it('trova la categoria per nome', () => {
    const g = guessCategory([{ text: 'Jacket', confidence: 0.82 }], donna);
    expect(g?.phrase).toBe('una giacca');
    expect(name(donna, g?.categoryId)).toBe('Giacche');
    expect(name(donna, guessCategory([{ text: 'Jeans', confidence: 0.7 }], donna)?.categoryId)).toBe('Jeans');
    expect(name(donna, guessCategory([{ text: 'Dress', confidence: 0.7 }], donna)?.categoryId)).toBe('Abiti');
    expect(name(donna, guessCategory([{ text: 'Tights', confidence: 0.7 }], donna)?.categoryId)).toBe('Calze e collant');
    expect(name(donna, guessCategory([{ text: 'Necklace', confidence: 0.7 }], donna)?.categoryId)).toBe('Gioielli');
    expect(name(uomo, guessCategory([{ text: 'Tie', confidence: 0.9 }], uomo)?.categoryId)).toBe('Cravatte e papillon');
  });

  it('l’etichetta più precisa vince a parità quasi di sicurezza', () => {
    const g = guessCategory(
      [
        { text: 'Jacket', confidence: 0.8 },
        { text: 'Blazer', confidence: 0.75 },
        { text: 'Outerwear', confidence: 0.85 },
      ],
      donna,
    );
    expect(g?.phrase).toBe('un blazer');
    expect(name(donna, g?.categoryId)).toBe('Blazer');
    expect(guessCategory([{ text: 'Shoe', confidence: 0.9 }, { text: 'Sneakers', confidence: 0.84 }], donna)?.phrase).toBe('delle sneakers');
  });

  it('senza nome che corrisponde usa la prima categoria di quel tipo', () => {
    const cats = donna.filter((c) => c.name !== 'Occhiali');
    expect(name(cats, guessCategory([{ text: 'Sunglasses', confidence: 0.9 }], cats)?.categoryId)).toBe('Borse e zaini');
    // Il costume non ha un tipo: solo se c'è una categoria con quel nome.
    expect(guessCategory([{ text: 'Swimwear', confidence: 0.9 }], donna)).toBeNull();
    const withSwim = [...donna, { ...donna[0]!, id: 'swim', name: 'Costumi', slotType: 'full_body' as const }];
    expect(guessCategory([{ text: 'Swimwear', confidence: 0.9 }], withSwim)?.categoryId).toBe('swim');
  });

  it('niente suggerimento se non è sicuro, se l’etichetta non è un capo o se non ci sono categorie', () => {
    expect(guessCategory([{ text: 'Jacket', confidence: MIN_CONFIDENCE - 0.01 }], donna)).toBeNull();
    expect(guessCategory([{ text: 'Sleeve', confidence: 0.95 }, { text: 'Textile', confidence: 0.9 }], donna)).toBeNull();
    expect(guessCategory([{ text: 'Jacket', confidence: 0.9 }], [])).toBeNull();
    expect(guessCategory([], donna)).toBeNull();
  });
});
