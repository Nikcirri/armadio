import { describe, expect, it } from 'vitest';
import { WASH_TAGS } from './labels';
import { FABRIC_GUIDES, GOLDEN_RULES, LAUNDRY_TIPS, STAINS, SYMBOL_GROUPS, fabricGuidesFor, searchStains } from './careGuide';

describe('guida: contenuti', () => {
  it('ogni macchia ha nome, passi e cose da evitare, con id unici', () => {
    expect(STAINS).toHaveLength(20);
    expect(new Set(STAINS.map((s) => s.id)).size).toBe(STAINS.length);
    for (const s of STAINS) {
      expect(s.name.trim()).not.toBe('');
      expect(s.steps.length).toBeGreaterThanOrEqual(2);
      expect(s.avoid.length).toBeGreaterThanOrEqual(1);
      for (const line of [...s.steps, ...s.avoid]) expect(line.trim()).toBe(line);
    }
    expect(GOLDEN_RULES.length).toBeGreaterThan(5);
    expect(LAUNDRY_TIPS.length).toBeGreaterThan(5);
  });

  it('ogni tessuto ha tutte le voci; i simboli hanno etichette dell’app che esistono', () => {
    for (const g of FABRIC_GUIDES) for (const v of [g.wash, g.dry, g.iron, g.keep]) expect(v.length).toBeGreaterThan(10);
    const tags = new Set(WASH_TAGS.map((t) => t.id));
    const ids = SYMBOL_GROUPS.flatMap((g) => g.symbols.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SYMBOL_GROUPS.flatMap((g) => g.symbols)) if (s.tag) expect(tags.has(s.tag)).toBe(true);
    // Ogni etichetta di lavaggio dell'app (tranne la centrifuga, che non ha un simbolo) ha il suo simbolo.
    const shown = new Set(SYMBOL_GROUPS.flatMap((g) => g.symbols.map((s) => s.tag)));
    expect([...tags].filter((t) => !shown.has(t))).toEqual(['noSpin']);
  });
});

describe('searchStains', () => {
  it('trova per nome, per parole simili e senza accenti', () => {
    expect(searchStains('').length).toBe(STAINS.length);
    expect(searchStains('penna').map((s) => s.id)).toEqual(['inchiostro']);
    expect(searchStains('UNTO').map((s) => s.id)).toEqual(['olio']);
    expect(searchStains('pomodoro').map((s) => s.id)).toEqual(['pomodoro']);
    expect(searchStains('caffè').map((s) => s.id)).toEqual(['caffe']);
    expect(searchStains('trucco').map((s) => s.id)).toEqual(['fondotinta', 'rossetto', 'mascara']);
    expect(searchStains('vino rosso').map((s) => s.id)).toEqual(['vino']);
    expect(searchStains('zzz')).toEqual([]);
  });
});

describe('fabricGuidesFor', () => {
  it('riconosce tessuti e fibre, senza doppioni e nell’ordine del capo', () => {
    expect(fabricGuidesFor(['Lana merino', 'Poliestere', 'Sintetico', 'Elastan']).map((g) => g.id)).toEqual(['lana', 'sintetico', 'elastan']);
    expect(fabricGuidesFor(['Cotone', 'Denim']).map((g) => g.id)).toEqual(['cotone', 'denim']);
    expect(fabricGuidesFor(['Ecopelle']).map((g) => g.id)).toEqual(['sintetico']);
    expect(fabricGuidesFor(['Pelle', 'Camoscio', 'Viscosa', 'Seta', 'Lino', 'Cashmere']).map((g) => g.id)).toEqual([
      'pelle',
      'camoscio',
      'viscosa',
      'seta',
      'lino',
      'cashmere',
    ]);
    expect(fabricGuidesFor(['Paillettes', ''])).toEqual([]);
  });
});
