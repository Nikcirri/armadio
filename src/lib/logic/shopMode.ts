import type { ColorId, ItemRecord, SeasonId, SlotType, WishlistRecord } from '../db/types';
import { colorFit, seasonInfo, type Fit } from './armocromia';
import { colorInfo } from './colors';
import { accentColors, colorFamily } from './generator';
import { complementSlots, similarItems } from './wishlist';

// Modalità negozio (SPEC.md, sezione 8.5): un capo fotografato in negozio confrontato con l'armadio.

/** Il capo che si sta valutando. */
export interface ShopPiece {
  categoryId: string | null;
  slot: SlotType;
  colors: readonly ColorId[];
}

/** Utilizzi su cui si calcola il costo per utilizzo. */
export const SHOP_WEARS = 30;

/** Sotto questo numero di abbinamenti il riepilogo avvisa. */
export const FEW_MATCHES = 3;

/**
 * I colori di due capi stanno bene insieme se, messi insieme, non aggiungono un altro colore d'accento
 * (la regola "Contrasto bilanciato" del generatore): i neutri vanno con tutto; due colori forti diversi
 * vanno insieme solo se sono della stessa famiglia (tono su tono); due fantasie no.
 * Un capo senza colori indicati va con tutto.
 */
export function colorsGoTogether(a: readonly ColorId[], b: readonly ColorId[]): boolean {
  if (!a.length || !b.length) return true;
  if (a.includes('pattern') && b.includes('pattern')) return false;
  const accA = accentColors(a);
  const accB = accentColors(b);
  const all = [...new Set([...accA, ...accB])];
  if (all.length <= Math.max(1, accA.length, accB.length)) return true;
  return !all.includes('pattern') && new Set(all.map(colorFamily)).size === 1;
}

/** Capi dell'armadio (non da vendere) degli slot compatibili, con colori che stanno bene insieme. */
export function shopMatches(piece: ShopPiece, items: readonly ItemRecord[]): ItemRecord[] {
  const slots = complementSlots(piece.slot);
  return items.filter((i) => i.status !== 'forSale' && slots.includes(i.slotType) && colorsGoTogether(piece.colors, i.colors));
}

export type MatchGroupId = 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';

export const MATCH_GROUPS: readonly { id: MatchGroupId; label: string; slots: readonly SlotType[] }[] = [
  { id: 'tops', label: 'Sopra', slots: ['top_base', 'top_layer'] },
  { id: 'bottoms', label: 'Sotto', slots: ['bottom'] },
  { id: 'dresses', label: 'Abiti', slots: ['full_body'] },
  { id: 'outerwear', label: 'Capispalla', slots: ['outerwear'] },
  { id: 'shoes', label: 'Scarpe', slots: ['shoes'] },
  { id: 'accessories', label: 'Accessori', slots: ['accessory'] },
];

export interface MatchGroup {
  id: MatchGroupId;
  label: string;
  items: ItemRecord[];
}

/** Abbinamenti divisi per tipo (solo i gruppi non vuoti), dai preferiti e dai più indossati. */
export function groupMatches(items: readonly ItemRecord[]): MatchGroup[] {
  const order = (a: ItemRecord, b: ItemRecord) =>
    Number(b.favorite) - Number(a.favorite) || b.wearCount - a.wearCount || a.name.localeCompare(b.name, 'it');
  return MATCH_GROUPS.map((g) => ({ id: g.id, label: g.label, items: items.filter((i) => g.slots.includes(i.slotType)).sort(order) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Per completare un outfit con questo capo serve almeno uno di questi (null = non serve niente in particolare). */
const ESSENTIAL: Partial<Record<SlotType, { slots: readonly SlotType[]; missing: string }>> = {
  top_base: { slots: ['bottom'], missing: 'nessun capo di sotto' },
  top_layer: { slots: ['bottom', 'full_body'], missing: 'nessun capo di sotto o abito' },
  bottom: { slots: ['top_base', 'top_layer'], missing: 'nessun capo di sopra' },
};

/** Cosa manca tra gli abbinamenti per fare un outfit (null se non manca niente). */
export function missingPartner(slot: SlotType, matches: readonly ItemRecord[]): string | null {
  const need = ESSENTIAL[slot];
  if (!need) return null;
  return matches.some((i) => need.slots.includes(i.slotType)) ? null : need.missing;
}

export interface ShopSimilar {
  /** Capi dell'armadio della stessa categoria e dello stesso colore principale. */
  items: ItemRecord[];
  /** Desideri della wishlist della stessa categoria e dello stesso colore principale. */
  wishes: WishlistRecord[];
  /** Quanti capi hai già in quella categoria. */
  sameCategory: number;
}

export function shopSimilar(piece: ShopPiece, items: readonly ItemRecord[], wishes: readonly WishlistRecord[]): ShopSimilar {
  const owned = items.filter((i) => i.status !== 'forSale');
  const wish = { categoryId: piece.categoryId, colors: [...piece.colors] };
  const main = piece.colors[0];
  return {
    items: similarItems(wish, owned),
    wishes: !piece.categoryId || !main ? [] : wishes.filter((w) => w.categoryId === piece.categoryId && w.colors[0] === main),
    sameCategory: piece.categoryId ? owned.filter((i) => i.categoryId === piece.categoryId).length : 0,
  };
}

/** Questi capi si portano lontano dal viso: per l'armocromia il colore conta meno. */
const FAR_FROM_FACE: readonly SlotType[] = ['bottom', 'shoes', 'underwear'];

export type ShopFit =
  | { kind: 'noProfile' }
  /** Solo fantasia o nessun colore: non si può giudicare. */
  | { kind: 'unjudgeable' }
  | { kind: 'fit'; fit: Fit; color: ColorId; nearFace: boolean };

/** Come sta il colore principale (il primo giudicabile) alla stagione dell'armocromia. */
export function shopFit(season: SeasonId | null, piece: ShopPiece): ShopFit {
  if (!season) return { kind: 'noProfile' };
  for (const color of piece.colors) {
    const fit = colorFit(season, color);
    if (fit) return { kind: 'fit', fit, color, nearFace: !FAR_FROM_FACE.includes(piece.slot) };
  }
  return { kind: 'unjudgeable' };
}

/** Costo per utilizzo dopo SHOP_WEARS utilizzi, in euro arrotondati ai centesimi (null senza prezzo). */
export function costPerWearAt(price: number | null, wears: number = SHOP_WEARS): number | null {
  if (price === null || !Number.isFinite(price) || price <= 0 || wears <= 0) return null;
  return Math.round((price / wears) * 100) / 100;
}

export type Tone = 'good' | 'warn' | 'info';

export interface SummaryLine {
  id: 'matches' | 'similar' | 'season';
  tone: Tone;
  text: string;
}

const capi = (n: number) => (n === 1 ? 'un capo' : `${n} capi`);

/** Il riepilogo in tre righe: abbinamenti, simili, stagione. */
export function shopSummary(input: {
  piece: ShopPiece;
  matches: readonly ItemRecord[];
  similar: ShopSimilar;
  fit: ShopFit;
  season: SeasonId | null;
}): SummaryLine[] {
  const { piece, matches, similar, fit } = input;
  const n = matches.length;
  const missing = missingPartner(piece.slot, matches);

  let matchLine: SummaryLine;
  if (n === 0) matchLine = { id: 'matches', tone: 'warn', text: 'Non si abbina con nessun tuo capo' };
  else if (missing) matchLine = { id: 'matches', tone: 'warn', text: `Si abbina con ${capi(n)}, ma con ${missing}` };
  else if (n < FEW_MATCHES) matchLine = { id: 'matches', tone: 'warn', text: `Si abbina solo con ${capi(n)}` };
  else matchLine = { id: 'matches', tone: 'good', text: `Si abbina con ${n} capi` };

  let similarLine: SummaryLine;
  if (!piece.categoryId) similarLine = { id: 'similar', tone: 'info', text: 'Scegli la categoria per cercare i capi simili' };
  else if (!piece.colors.length) similarLine = { id: 'similar', tone: 'info', text: 'Scegli il colore per cercare i capi simili' };
  else if (similar.items.length === 1) similarLine = { id: 'similar', tone: 'warn', text: 'Hai già un capo simile' };
  else if (similar.items.length > 1) similarLine = { id: 'similar', tone: 'warn', text: `Hai già ${similar.items.length} capi simili` };
  else if (similar.wishes.length) similarLine = { id: 'similar', tone: 'info', text: 'Niente di simile nell’armadio, ma è già nella wishlist' };
  else similarLine = { id: 'similar', tone: 'good', text: 'Non hai niente di simile' };

  let seasonLine: SummaryLine;
  if (fit.kind === 'noProfile') seasonLine = { id: 'season', tone: 'info', text: 'Fai l’armocromia per sapere se il colore ti dona' };
  else if (fit.kind === 'unjudgeable') seasonLine = { id: 'season', tone: 'info', text: 'Fantasia: il colore non si può giudicare' };
  else {
    const name = input.season ? seasonInfo(input.season).name : '';
    const color = colorInfo(fit.color).label;
    if (fit.fit === 'avoid')
      seasonLine = fit.nearFace
        ? { id: 'season', tone: 'warn', text: `${color}: da evitare vicino al viso (${name})` }
        : { id: 'season', tone: 'info', text: `${color}: non è dei tuoi, ma lontano dal viso conta meno` };
    else if (fit.fit === 'good') seasonLine = { id: 'season', tone: 'good', text: `${color}: ti valorizza (${name})` };
    else seasonLine = { id: 'season', tone: 'good', text: `${color}: va bene per la tua stagione (${name})` };
  }

  return [matchLine, similarLine, seasonLine];
}
