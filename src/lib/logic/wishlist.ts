import type { CategoryRecord, ItemRecord, Season, SlotType, WishlistRecord } from '../db/types';
import { occasionsCompatible } from './generator';

// Wishlist (SPEC.md, sezione 8.5).

export type Priority = WishlistRecord['priority'];

export const PRIORITIES: readonly { id: Priority; label: string; emoji: string }[] = [
  { id: 'high', label: 'Alta', emoji: '🔥' },
  { id: 'medium', label: 'Media', emoji: '⭐' },
  { id: 'low', label: 'Bassa', emoji: '💭' },
];

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Dalla priorità più alta, poi i più recenti. */
export function sortWishlist(list: readonly WishlistRecord[]): WishlistRecord[] {
  return [...list].sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.createdAt.localeCompare(a.createdAt));
}

/** Con quali slot può stare un capo in un outfit. */
const COMPLEMENT: Record<SlotType, readonly SlotType[]> = {
  top_base: ['top_layer', 'bottom', 'outerwear', 'shoes', 'accessory'],
  top_layer: ['top_base', 'bottom', 'full_body', 'outerwear', 'shoes', 'accessory'],
  bottom: ['top_base', 'top_layer', 'outerwear', 'shoes', 'accessory'],
  full_body: ['top_layer', 'outerwear', 'shoes', 'accessory'],
  outerwear: ['top_base', 'top_layer', 'bottom', 'full_body', 'shoes', 'accessory'],
  shoes: ['top_base', 'top_layer', 'bottom', 'full_body', 'outerwear', 'accessory'],
  accessory: ['top_base', 'top_layer', 'bottom', 'full_body', 'outerwear', 'shoes'],
  // L'intimo va sotto i capi di sopra e gli abiti.
  underwear: ['top_base', 'top_layer', 'full_body'],
};

export function seasonsCompatible(a: Season | null, b: Season | null): boolean {
  if (!a || !b) return true;
  return !((a === 'springSummer' && b === 'autumnWinter') || (a === 'autumnWinter' && b === 'springSummer'));
}

/**
 * "Si abbina con N capi": capi dell'armadio (non da vendere) negli slot compatibili,
 * con occasioni compatibili secondo la matrice e stagione non opposta.
 */
export function matchingItems(
  wish: Pick<WishlistRecord, 'occasions' | 'season'> & { slot: SlotType },
  items: readonly ItemRecord[],
  matrix: readonly (readonly [string, string])[],
): ItemRecord[] {
  const slots = COMPLEMENT[wish.slot];
  return items.filter(
    (i) =>
      i.status !== 'forSale' &&
      slots.includes(i.slotType) &&
      occasionsCompatible(wish.occasions, i.occasions, matrix) &&
      seasonsCompatible(wish.season, i.season),
  );
}

/** Capi che hai già simili: stessa categoria e stesso colore principale. */
export function similarItems(wish: Pick<WishlistRecord, 'categoryId' | 'colors'>, items: readonly ItemRecord[]): ItemRecord[] {
  const main = wish.colors[0];
  if (!wish.categoryId || !main) return [];
  return items.filter((i) => i.categoryId === wish.categoryId && i.colors[0] === main);
}

export function slotOfWish(wish: Pick<WishlistRecord, 'categoryId'>, categories: readonly CategoryRecord[]): SlotType {
  return categories.find((c) => c.id === wish.categoryId)?.slotType ?? 'accessory';
}

export function wishlistTotal(list: readonly Pick<WishlistRecord, 'price'>[]): number {
  return Math.round(list.reduce((sum, w) => sum + (w.price ?? 0), 0) * 100) / 100;
}

/** Un link si apre, un nome di negozio no. */
export function isLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim()) || /^www\.\S+\.\S+$/i.test(text.trim());
}

export function linkUrl(text: string): string {
  const t = text.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
