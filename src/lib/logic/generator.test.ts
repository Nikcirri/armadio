import { describe, expect, it } from 'vitest';
import type { ItemRecord, SlotType } from '../db/types';
import { createItem } from './factories';
import {
  accentColors,
  candidates,
  cycle,
  defaultGeneratorOptions,
  exclusionReason,
  explainFailure,
  explainSlot,
  generateLook,
  harmonyOk,
  lookItemIds,
  lookViolation,
  modesFor,
  occasionsCompatible,
  outfitTagsFor,
  pickAmongBest,
  scoreLook,
  seededRandom,
  slotAlternatives,
  slotNeeds,
  withPick,
  workingFixes,
  type GeneratorContext,
  type GeneratorOptions,
  type Look,
} from './generator';

const NOW = '2026-11-06T10:00:00.000Z';
const TODAY = '2026-11-06';
const max: Record<SlotType, number | null> = {
  top_base: 1,
  top_layer: 3,
  bottom: 4,
  full_body: 2,
  outerwear: 10,
  shoes: null,
  accessory: null,
};
const item = (slot: SlotType, name: string, over: Partial<ItemRecord> = {}) =>
  createItem({ name, ...over }, { id: `c-${slot}`, slotType: slot, defaultMaxWears: max[slot] }, NOW);

function wardrobe() {
  return {
    tee: item('top_base', 'T-shirt', { colors: ['white'], warmth: 'light' }),
    shirt: item('top_base', 'Camicia', { colors: ['denim'], warmth: 'medium', occasions: ['work'] }),
    sweater: item('top_layer', 'Maglione', { colors: ['cream'], warmth: 'heavy', season: 'autumnWinter' }),
    jeans: item('bottom', 'Jeans', { colors: ['denim'] }),
    shorts: item('bottom', 'Shorts', { colors: ['cream'], warmth: 'light', season: 'springSummer' }),
    coat: item('outerwear', 'Cappotto', { colors: ['black'], warmth: 'heavy' }),
    trench: item('outerwear', 'Trench', { colors: ['cream'], warmth: 'medium' }),
    sneakers: item('shoes', 'Sneakers', { colors: ['white'] }),
    boots: item('shoes', 'Stivali', { colors: ['brown'], waterproof: true }),
    bag: item('accessory', 'Borsa', { colors: ['brown'], bagSize: 'medium' }),
  };
}

function context(items: ItemRecord[], over: Partial<GeneratorContext> = {}): GeneratorContext {
  return {
    items,
    seasonBoxId: 'box',
    occasionMatrix: [['sport', 'formal']],
    eveningOccasionIds: ['evening'],
    occasionLabel: (id) => ({ work: 'Studio/Lavoro', evening: 'Serata', sport: 'Sport/Relax' })[id] ?? id,
    rainBannedFabrics: ['seta', 'lino', 'camoscio'],
    coordinatingIds: new Set(items.filter((i) => i.bagSize).map((i) => i.id)),
    today: TODAY,
    antiRepeatDays: 3,
    recentLooks: [],
    ...over,
  };
}

const opts = (over: Partial<GeneratorOptions> = {}): GeneratorOptions => ({ ...defaultGeneratorOptions(), ...over });

describe('struttura del look', () => {
  it('chiede sopra e sotto, oppure un intero, e le scarpe sempre', () => {
    const ctx = context([]);
    expect(slotNeeds('separates', opts(), ctx)).toMatchObject({ top_base: 'required', bottom: 'required', full_body: 'never', shoes: 'required' });
    expect(slotNeeds('onePiece', opts(), ctx)).toMatchObject({ full_body: 'required', top_base: 'never' });
  });

  it('il capospalla dipende dal clima e dalla sera', () => {
    const ctx = context([]);
    expect(slotNeeds('separates', opts({ temperature: 'cold' }), ctx).outerwear).toBe('required');
    expect(slotNeeds('separates', opts({ temperature: 'mild' }), ctx).outerwear).toBe('optional');
    expect(slotNeeds('separates', opts({ temperature: 'hot' }), ctx).outerwear).toBe('never');
    expect(slotNeeds('separates', opts({ temperature: 'hot', occasionId: 'evening' }), ctx).outerwear).toBe('optional');
  });

  it('a cipolla vuole base, strato e capospalla, solo spezzato', () => {
    const needs = slotNeeds('separates', opts({ layers: true, temperature: 'hot' }), context([]));
    expect(needs).toMatchObject({ top_layer: 'required', outerwear: 'required' });
    expect(modesFor(opts({ layers: true }))).toEqual(['separates']);
  });
});

describe('regole sui capi', () => {
  const w = wardrobe();
  const ctx = context(Object.values(w));

  it('col caldo niente pesante e niente autunno/inverno', () => {
    expect(exclusionReason(w.coat, 'outerwear', opts({ temperature: 'hot' }), ctx)).toBe('temperature');
    expect(exclusionReason(w.sweater, 'top_layer', opts({ temperature: 'hot' }), ctx)).toBe('temperature');
    expect(exclusionReason(w.shorts, 'bottom', opts({ temperature: 'hot' }), ctx)).toBeNull();
  });

  it('col freddo niente capi leggeri, tranne la base', () => {
    expect(exclusionReason(w.shorts, 'bottom', opts({ temperature: 'cold' }), ctx)).toBe('temperature');
    expect(exclusionReason(w.tee, 'top_base', opts({ temperature: 'cold' }), ctx)).toBeNull();
    expect(exclusionReason(w.sweater, 'top_layer', opts({ temperature: 'mild' }), ctx)).toBe('temperature');
  });

  it('con la pioggia solo scarpe impermeabili e niente seta, lino, camoscio', () => {
    expect(exclusionReason(w.sneakers, 'shoes', opts({ rain: true }), ctx)).toBe('rain');
    expect(exclusionReason(w.boots, 'shoes', opts({ rain: true }), ctx)).toBeNull();
    const linen = item('top_base', 'Camicia di lino', { fabrics: ['Lino'] });
    expect(exclusionReason(linen, 'top_base', opts({ rain: true }), ctx)).toBe('rain');
  });

  it('occasione, disponibilità, cipolla e capi indossati di recente', () => {
    expect(exclusionReason(w.shirt, 'top_base', opts({ occasionId: 'evening' }), ctx)).toBe('occasion');
    expect(exclusionReason(w.tee, 'top_base', opts({ occasionId: 'evening' }), ctx)).toBeNull();
    const dirty = { ...w.jeans, status: 'toWash' as const };
    expect(exclusionReason(dirty, 'bottom', opts(), ctx)).toBe('unavailable');
    expect(exclusionReason(dirty, 'bottom', opts({ onlyAvailable: false }), ctx)).toBeNull();
    expect(exclusionReason({ ...w.jeans, locationId: 'box' }, 'bottom', opts(), ctx)).toBe('unavailable');
    expect(exclusionReason(w.shirt, 'top_base', opts({ layers: true }), ctx)).toBe('layers');
    const worn = { ...w.jeans, lastWornDate: '2026-11-05' };
    expect(exclusionReason(worn, 'bottom', opts(), ctx)).toBe('recent');
    expect(exclusionReason(worn, 'bottom', opts(), ctx, true)).toBeNull();
    expect(exclusionReason({ ...w.sneakers, lastWornDate: TODAY }, 'shoes', opts(), ctx)).toBeNull();
    expect(exclusionReason({ ...w.jeans, lastWornDate: '2026-11-03' }, 'bottom', opts(), ctx)).toBeNull();
  });
});

describe('colori e occasioni', () => {
  it('armonia neutra, tono su tono e contrasto bilanciato', () => {
    expect(harmonyOk(['black', 'white', 'denim'], 'neutral')).toBe(true);
    expect(harmonyOk(['red', 'pink', 'burgundy'], 'neutral')).toBe(true);
    expect(harmonyOk(['red', 'white'], 'neutral')).toBe(false);
    expect(harmonyOk(['white', 'black', 'red'], 'balanced')).toBe(true);
    expect(harmonyOk(['white', 'red', 'green'], 'balanced')).toBe(false);
    expect(harmonyOk(['white', 'pattern', 'yellow'], 'balanced')).toBe(false);
    expect(accentColors(['white', 'red', 'red', 'pattern'])).toEqual(['red', 'pattern']);
  });

  it('due capi sono incompatibili solo se nessuna loro occasione sta insieme', () => {
    const m = [['sport', 'formal']] as const;
    expect(occasionsCompatible(['sport'], ['formal'], m)).toBe(false);
    expect(occasionsCompatible(['sport', 'casual'], ['formal'], m)).toBe(true);
    expect(occasionsCompatible([], ['formal'], m)).toBe(true);
  });
});

describe('look validi e punteggio', () => {
  it('rifiuta occasioni incompatibili, base leggera al freddo e outfit appena indossati', () => {
    const w = wardrobe();
    const gym = item('bottom', 'Tuta', { occasions: ['sport'] });
    const silk = item('top_base', 'Top di seta', { occasions: ['formal'] });
    const ctx = context([...Object.values(w), gym, silk], { recentLooks: [[w.tee.id, w.jeans.id, w.sneakers.id]] });
    const byId = new Map(ctx.items.map((i) => [i.id, i]));
    const look = (picks: Look['picks']): Look => ({ mode: 'separates', picks });
    expect(lookViolation(look({ top_base: silk.id, bottom: gym.id, shoes: w.sneakers.id }), byId, opts(), ctx)).toBe('occasions');
    expect(lookViolation(look({ top_base: w.tee.id, bottom: w.jeans.id, shoes: w.boots.id, outerwear: w.coat.id }), byId, opts({ temperature: 'cold' }), ctx)).toBe('coldBase');
    expect(lookViolation(look({ top_base: w.tee.id, bottom: w.jeans.id, shoes: w.sneakers.id }), byId, opts(), ctx)).toBe('repeat');
    expect(lookViolation(look({ top_base: w.tee.id, bottom: w.jeans.id, shoes: w.sneakers.id }), byId, opts(), ctx, true)).toBeNull();
    expect(lookViolation(look({ top_base: w.tee.id, shoes: w.sneakers.id }), byId, opts(), ctx)).toBe('structure');
  });

  it('premia crop con vita alta, scarpe e borsa coordinate e i dimenticati', () => {
    const crop = item('top_base', 'Top crop', { cutStyle: 'crop', colors: ['black'] });
    const hw = item('bottom', 'Pantalone vita alta', { cutStyle: 'highWaist', colors: ['black'], lastWornDate: '2026-01-01' });
    const boots = item('shoes', 'Stivaletti', { colors: ['brown'], waterproof: true });
    const bag = item('accessory', 'Borsa', { colors: ['brown'], bagSize: 'medium' });
    const ctx = context([crop, hw, boots, bag]);
    const byId = new Map(ctx.items.map((i) => [i.id, i]));
    const look: Look = { mode: 'separates', picks: { top_base: crop.id, bottom: hw.id, shoes: boots.id, accessory: bag.id } };
    const s = scoreLook(look, byId, opts({ forgotten: true, rain: true }), ctx);
    expect(s.reasons).toEqual(expect.arrayContaining(['Crop + vita alta', 'Scarpe e borsa coordinate', 'Rispolvera: Top crop', 'Scarpe impermeabili']));
    const plain = scoreLook(withPick(look, 'accessory', null), byId, opts(), ctx);
    expect(s.score).toBeGreaterThan(plain.score);
  });

  it('penalizza oversize sopra e sotto insieme', () => {
    const top = item('top_base', 'Felpa', { cutStyle: 'oversize' });
    const wide = item('bottom', 'Palazzo', { cutStyle: 'oversize' });
    const slim = item('bottom', 'Skinny', { cutStyle: 'slim' });
    const shoes = item('shoes', 'Scarpe');
    const ctx = context([top, wide, slim, shoes]);
    const byId = new Map(ctx.items.map((i) => [i.id, i]));
    const a = scoreLook({ mode: 'separates', picks: { top_base: top.id, bottom: wide.id, shoes: shoes.id } }, byId, opts(), ctx);
    const b = scoreLook({ mode: 'separates', picks: { top_base: top.id, bottom: slim.id, shoes: shoes.id } }, byId, opts(), ctx);
    expect(b.reasons).toContain('Oversize + aderente');
    expect(b.score - a.score).toBeGreaterThanOrEqual(9);
  });
});

describe('generazione', () => {
  it('trova solo look validi per il clima e la pioggia', () => {
    const w = wardrobe();
    const ctx = context(Object.values(w));
    const list = candidates(opts({ temperature: 'cold', rain: true }), ctx, {}, seededRandom(3));
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(c.look.picks.shoes).toBe(w.boots.id);
      expect([w.coat.id, w.trench.id]).toContain(c.look.picks.outerwear);
      expect(c.look.picks.bottom).toBe(w.jeans.id);
    }
  });

  it('rispetta i lucchetti e cambia look a ogni giro', () => {
    const w = wardrobe();
    const ctx = context(Object.values(w));
    const r = generateLook(opts(), ctx, { bottom: w.shorts.id, accessory: null }, seededRandom(7));
    expect(r.candidate?.look.picks.bottom).toBe(w.shorts.id);
    expect(r.candidate?.look.picks.accessory).toBeUndefined();
    const first = r.candidate!.look;
    const again = generateLook(opts(), ctx, {}, seededRandom(8), first);
    expect(lookItemIds(again.candidate!.look).sort()).not.toEqual(lookItemIds(first).sort());
  });

  it('allenta la regola dei capi indossati di recente se non resta altro', () => {
    const w = wardrobe();
    const items = [{ ...w.tee, lastWornDate: TODAY }, w.jeans, w.sneakers];
    const r = generateLook(opts(), context(items), {}, seededRandom(1));
    expect(r.relaxed).toBe(true);
    expect(r.candidate?.look.picks.top_base).toBe(w.tee.id);
  });

  it('sceglie tra i migliori, evitando se possibile il look attuale', () => {
    const list = [
      { score: 10, reasons: [], id: 'a' },
      { score: 9, reasons: [], id: 'b' },
      { score: 2, reasons: [], id: 'c' },
    ];
    const picks = new Set([0.1, 0.6, 0.99].map((x) => pickAmongBest(list, () => x)!.id));
    expect([...picks].sort()).toEqual(['a', 'b']);
    expect(pickAmongBest(list, () => 0, (c) => c.id === 'a')!.id).toBe('b');
    expect(pickAmongBest([], () => 0)).toBeNull();
  });
});

describe('rulli', () => {
  it('le alternative di uno slot sono valide e includono "nessuno" se facoltativo', () => {
    const w = wardrobe();
    const ctx = context(Object.values(w));
    const look: Look = { mode: 'separates', picks: { top_base: w.tee.id, bottom: w.jeans.id, shoes: w.sneakers.id } };
    const outer = slotAlternatives(look, 'outerwear', opts(), ctx);
    expect(outer).toContain(null);
    expect(outer).toContain(w.trench.id);
    expect(outer).not.toContain(w.coat.id);
    const shoes = slotAlternatives(look, 'shoes', opts(), ctx);
    expect(shoes).not.toContain(null);
    expect(slotAlternatives(look, 'full_body', opts(), ctx)).toEqual([]);
  });

  it('le frecce girano in tondo', () => {
    expect(cycle(['a', 'b', null], 'a', 1)).toBe('b');
    expect(cycle(['a', 'b', null], null, 1)).toBe('a');
    expect(cycle(['a', 'b', null], 'a', -1)).toBeNull();
    expect(cycle([], 'x', 1)).toBe('x');
  });
});

describe('spiegazioni', () => {
  it('"Nessuna scarpa impermeabile pulita"', () => {
    const w = wardrobe();
    const items = [w.tee, w.jeans, w.sneakers, { ...w.boots, status: 'toWash' as const }];
    const ctx = context(items);
    expect(explainSlot('shoes', opts({ rain: true }), ctx)).toBe(
      'Nessuna scarpa impermeabile pulita. Se ne hai, attiva “Impermeabili” nella loro scheda.',
    );
    const r = generateLook(opts({ rain: true }), ctx, {}, seededRandom(1));
    expect(r.candidate).toBeNull();
    expect(r.problems[0]).toMatch(/^Nessuna scarpa impermeabile pulita\./);
  });

  it('propone solo le correzioni che funzionano', () => {
    const w = wardrobe();
    const items = [w.tee, w.jeans, w.sneakers, { ...w.boots, status: 'toWash' as const }];
    const fixes = workingFixes(opts({ rain: true, harmony: 'neutral' }), context(items));
    expect(fixes.map((f) => f.label)).toEqual(['Usa anche i capi non disponibili', 'Senza pioggia']);
  });

  it('dice cosa manca nell’armadio e quando la colpa è dell’armonia', () => {
    const w = wardrobe();
    expect(explainFailure(opts(), context([w.tee, w.sneakers]))[0]).toBe('Nessun capo sotto nell’armadio: aggiungine uno dall’Armadio.');
    const red = item('top_base', 'Rosso', { colors: ['red'] });
    const green = item('bottom', 'Verde', { colors: ['green'] });
    const ctx = context([red, green, w.sneakers]);
    expect(explainFailure(opts({ harmony: 'neutral' }), ctx)[0]).toContain('prova “Libera”');
    expect(explainSlot('outerwear', opts({ temperature: 'cold' }), context([item('outerwear', 'Giacchino', { warmth: 'light' })]))).toBe(
      'Nessun capospalla abbastanza caldo per il freddo.',
    );
  });

  it('salva stagione e meteo dell’outfit', () => {
    expect(outfitTagsFor(opts({ temperature: 'hot', rain: true }))).toEqual({ season: 'springSummer', weatherTags: ['hot', 'rain'] });
    expect(outfitTagsFor(opts())).toEqual({ season: null, weatherTags: ['mild'] });
  });
});
