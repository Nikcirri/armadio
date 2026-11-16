import { describe, expect, it } from 'vitest';
import type { ItemRecord, SlotType, WishlistRecord } from '../db/types';
import { seasonInfo } from './armocromia';
import { createItem } from './factories';
import {
  colorsGoTogether,
  costPerWearAt,
  groupMatches,
  missingPartner,
  shopFit,
  shopMatches,
  shopSimilar,
  shopSummary,
  type ShopPiece,
  type ShopSimilar,
} from './shopMode';

const NOW = '2026-11-16T10:00:00.000Z';
const item = (slot: SlotType, over: Partial<ItemRecord> = {}) =>
  createItem({ name: over.name ?? slot, ...over }, { id: over.categoryId ?? `c-${slot}`, slotType: slot, defaultMaxWears: 1 }, NOW);
const wish = (over: Partial<WishlistRecord>): WishlistRecord => ({
  id: 'w',
  name: 'Desiderio',
  categoryId: null,
  photoIds: [],
  price: null,
  storeOrLink: '',
  colors: [],
  season: null,
  occasions: [],
  priority: 'medium',
  notes: '',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const piece = (slot: SlotType, over: Partial<ShopPiece> = {}): ShopPiece => ({ categoryId: `c-${slot}`, slot, colors: [], ...over });

describe('colorsGoTogether', () => {
  it('i neutri vanno con tutto e un capo senza colori pure', () => {
    expect(colorsGoTogether(['black'], ['red'])).toBe(true);
    expect(colorsGoTogether(['red'], ['navy', 'white'])).toBe(true);
    expect(colorsGoTogether(['denim'], ['pattern'])).toBe(true);
    expect(colorsGoTogether([], ['red', 'blue'])).toBe(true);
  });

  it('un solo colore d’accento: uguale o tono su tono sì, due diversi no', () => {
    expect(colorsGoTogether(['red'], ['red', 'black'])).toBe(true);
    expect(colorsGoTogether(['blue'], ['lightBlue'])).toBe(true);
    expect(colorsGoTogether(['red'], ['blue'])).toBe(false);
    expect(colorsGoTogether(['red'], ['pattern'])).toBe(false);
  });

  it('due fantasie no', () => {
    expect(colorsGoTogether(['pattern'], ['pattern', 'black'])).toBe(false);
  });

  it('un capo già con più colori forti accetta uno dei suoi, non un terzo', () => {
    expect(colorsGoTogether(['grey'], ['red', 'blue'])).toBe(true);
    expect(colorsGoTogether(['red'], ['red', 'blue'])).toBe(true);
    expect(colorsGoTogether(['green'], ['red', 'blue'])).toBe(false);
  });
});

describe('shopMatches e groupMatches', () => {
  it('conta i capi degli slot compatibili con colori che stanno bene, senza quelli da vendere e l’intimo', () => {
    const jeans = item('bottom', { colors: ['denim'] });
    const redSkirt = item('bottom', { colors: ['blue'] });
    const sold = item('bottom', { colors: ['black'], status: 'forSale' });
    const otherTop = item('top_base', { colors: ['white'] });
    const bra = item('underwear', { colors: ['cream'] });
    const shoes = item('shoes', { colors: ['brown'] });
    const all = [jeans, redSkirt, sold, otherTop, bra, shoes];
    expect(shopMatches(piece('top_base', { colors: ['red'] }), all)).toEqual([jeans, shoes]);
    // Senza colori indicati conta solo lo slot.
    expect(shopMatches(piece('top_base'), all)).toEqual([jeans, redSkirt, shoes]);
  });

  it('divide per tipo nell’ordine fisso, dai preferiti e dai più indossati', () => {
    const a = item('bottom', { name: 'A', wearCount: 2 });
    const b = item('bottom', { name: 'B', wearCount: 9 });
    const c = item('bottom', { name: 'C', favorite: true });
    const cardigan = item('top_layer', { name: 'Cardigan' });
    const tee = item('top_base', { name: 'Tee' });
    const bag = item('accessory', { name: 'Borsa' });
    const groups = groupMatches([bag, a, b, cardigan, c, tee]);
    expect(groups.map((g) => g.id)).toEqual(['tops', 'bottoms', 'accessories']);
    expect(groups[0]!.items.map((i) => i.name)).toEqual(['Cardigan', 'Tee']);
    expect(groups[1]!.items.map((i) => i.name)).toEqual(['C', 'B', 'A']);
    expect(groups[1]!.label).toBe('Sotto');
  });

  it('dice cosa manca per fare un outfit', () => {
    const shoes = item('shoes');
    const dress = item('full_body');
    const jeans = item('bottom');
    expect(missingPartner('top_base', [shoes])).toBe('nessun capo di sotto');
    expect(missingPartner('top_base', [shoes, jeans])).toBeNull();
    expect(missingPartner('top_layer', [dress])).toBeNull();
    expect(missingPartner('bottom', [shoes])).toBe('nessun capo di sopra');
    expect(missingPartner('shoes', [])).toBeNull();
  });
});

describe('shopSimilar', () => {
  it('trova i simili nell’armadio e nella wishlist e conta i capi della categoria', () => {
    const black = item('bottom', { categoryId: 'jeans', colors: ['black', 'grey'] });
    const blue = item('bottom', { categoryId: 'jeans', colors: ['denim'] });
    const sold = item('bottom', { categoryId: 'jeans', colors: ['black'], status: 'forSale' });
    const w1 = wish({ id: 'w1', categoryId: 'jeans', colors: ['black'] });
    const w2 = wish({ id: 'w2', categoryId: 'jeans', colors: ['white'] });
    const res = shopSimilar({ categoryId: 'jeans', slot: 'bottom', colors: ['black'] }, [black, blue, sold], [w1, w2]);
    expect(res.items).toEqual([black]);
    expect(res.wishes).toEqual([w1]);
    expect(res.sameCategory).toBe(2);
  });

  it('senza categoria o colore non cerca', () => {
    const black = item('bottom', { categoryId: 'jeans', colors: ['black'] });
    const w = wish({ categoryId: 'jeans', colors: ['black'] });
    expect(shopSimilar({ categoryId: null, slot: 'bottom', colors: ['black'] }, [black], [w])).toEqual({ items: [], wishes: [], sameCategory: 0 });
    expect(shopSimilar({ categoryId: 'jeans', slot: 'bottom', colors: [] }, [black], [w])).toEqual({ items: [], wishes: [], sameCategory: 1 });
  });
});

describe('shopFit', () => {
  it('senza profilo, con la sola fantasia e col primo colore giudicabile', () => {
    expect(shopFit(null, piece('top_base', { colors: ['black'] }))).toEqual({ kind: 'noProfile' });
    expect(shopFit('lightSpring', piece('top_base', { colors: ['pattern'] }))).toEqual({ kind: 'unjudgeable' });
    expect(shopFit('lightSpring', piece('top_base', { colors: [] }))).toEqual({ kind: 'unjudgeable' });
    expect(shopFit('lightSpring', piece('top_base', { colors: ['pattern', 'black'] }))).toEqual({ kind: 'fit', fit: 'avoid', color: 'black', nearFace: true });
    expect(shopFit('lightSpring', piece('shoes', { colors: ['cream'] }))).toEqual({ kind: 'fit', fit: 'good', color: 'cream', nearFace: false });
  });
});

describe('costPerWearAt', () => {
  it('divide per 30 utilizzi e arrotonda ai centesimi', () => {
    expect(costPerWearAt(59.9)).toBe(2);
    expect(costPerWearAt(10)).toBe(0.33);
    expect(costPerWearAt(45, 10)).toBe(4.5);
    expect(costPerWearAt(null)).toBeNull();
    expect(costPerWearAt(0)).toBeNull();
    expect(costPerWearAt(Number.NaN)).toBeNull();
  });
});

describe('shopSummary', () => {
  const none: ShopSimilar = { items: [], wishes: [], sameCategory: 0 };
  const top = piece('top_base', { colors: ['black'] });
  const name = seasonInfo('lightSpring').name;

  it('abbinamenti: nessuno, manca il sotto, pochi, tanti', () => {
    const line = (matches: ItemRecord[]) => shopSummary({ piece: top, matches, similar: none, fit: { kind: 'noProfile' }, season: null })[0]!;
    expect(line([])).toEqual({ id: 'matches', tone: 'warn', text: 'Non si abbina con nessun tuo capo' });
    expect(line([item('shoes')])).toEqual({ id: 'matches', tone: 'warn', text: 'Si abbina con un capo, ma con nessun capo di sotto' });
    expect(line([item('bottom'), item('shoes')]).text).toBe('Si abbina solo con 2 capi');
    expect(line([item('bottom'), item('shoes'), item('accessory')])).toEqual({ id: 'matches', tone: 'good', text: 'Si abbina con 3 capi' });
  });

  it('simili: categoria e colore mancanti, uno, tanti, in wishlist, nessuno', () => {
    const line = (p: ShopPiece, similar = none) => shopSummary({ piece: p, matches: [], similar, fit: { kind: 'noProfile' }, season: null })[1]!;
    expect(line({ ...top, categoryId: null }).tone).toBe('info');
    expect(line({ ...top, colors: [] }).text).toBe('Scegli il colore per cercare i capi simili');
    expect(line(top, { ...none, items: [item('top_base')] }).text).toBe('Hai già un capo simile');
    expect(line(top, { ...none, items: [item('top_base'), item('top_base')] })).toEqual({ id: 'similar', tone: 'warn', text: 'Hai già 2 capi simili' });
    expect(line(top, { ...none, wishes: [wish({})] }).tone).toBe('info');
    expect(line(top)).toEqual({ id: 'similar', tone: 'good', text: 'Non hai niente di simile' });
  });

  it('stagione: senza profilo, fantasia, ti valorizza, va bene, da evitare vicino o lontano dal viso', () => {
    const line = (p: ShopPiece) => shopSummary({ piece: p, matches: [], similar: none, fit: shopFit(p.colors.length ? 'lightSpring' : null, p), season: 'lightSpring' })[2]!;
    expect(line({ ...top, colors: [] }).tone).toBe('info');
    expect(line({ ...top, colors: ['pattern'] }).text).toBe('Fantasia: il colore non si può giudicare');
    expect(line({ ...top, colors: ['cream'] })).toEqual({ id: 'season', tone: 'good', text: `Panna/Beige: ti valorizza (${name})` });
    expect(line({ ...top, colors: ['white'] })).toEqual({ id: 'season', tone: 'good', text: `Bianco: va bene per la tua stagione (${name})` });
    expect(line(top)).toEqual({ id: 'season', tone: 'warn', text: `Nero: da evitare vicino al viso (${name})` });
    expect(line(piece('shoes', { colors: ['black'] })).tone).toBe('info');
  });
});
