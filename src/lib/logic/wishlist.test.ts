import { describe, expect, it } from 'vitest';
import type { ItemRecord, SlotType, WishlistRecord } from '../db/types';
import { createItem } from './factories';
import { isLink, linkUrl, matchingItems, seasonsCompatible, similarItems, slotOfWish, sortWishlist, wishlistTotal } from './wishlist';

const NOW = '2026-11-06T10:00:00.000Z';
const item = (slot: SlotType, over: Partial<ItemRecord> = {}) => createItem({ name: slot, ...over }, { id: `c-${slot}`, slotType: slot, defaultMaxWears: 1 }, NOW);
const wish = (over: Partial<WishlistRecord>): WishlistRecord => ({
  id: over.id ?? 'w',
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

describe('wishlist', () => {
  it('ordina per priorità e poi dal più recente', () => {
    const list = [wish({ id: 'a', priority: 'low' }), wish({ id: 'b', priority: 'high', createdAt: '1' }), wish({ id: 'c', priority: 'high', createdAt: '2' })];
    expect(sortWishlist(list).map((w) => w.id)).toEqual(['c', 'b', 'a']);
    expect(wishlistTotal([{ price: 10.5 }, { price: null }, { price: 4 }])).toBe(14.5);
  });

  it('conta i capi con cui si abbina secondo slot, occasioni e stagione', () => {
    const jeans = item('bottom', { occasions: ['casual'] });
    const gym = item('bottom', { occasions: ['sport'] });
    const shorts = item('bottom', { season: 'springSummer' });
    const other = item('top_base');
    const sold = item('shoes', { status: 'forSale' });
    const shoes = item('shoes');
    const matches = matchingItems({ slot: 'top_base', occasions: ['formal'], season: 'autumnWinter' }, [jeans, gym, shorts, other, sold, shoes], [['sport', 'formal']]);
    expect(matches).toEqual([jeans, shoes]);
    expect(seasonsCompatible('allSeasons', 'springSummer')).toBe(true);
    expect(seasonsCompatible(null, 'autumnWinter')).toBe(true);
  });

  it('trova i capi simili e lo slot dalla categoria', () => {
    const a = item('top_base', { colors: ['white'] });
    const b = item('top_base', { colors: ['black'] });
    expect(similarItems({ categoryId: 'c-top_base', colors: ['white'] }, [a, b])).toEqual([a]);
    expect(similarItems({ categoryId: null, colors: ['white'] }, [a])).toEqual([]);
    expect(slotOfWish({ categoryId: 'x' }, [{ id: 'x', slotType: 'shoes' } as never])).toBe('shoes');
    expect(slotOfWish({ categoryId: null }, [])).toBe('accessory');
  });

  it('riconosce i link', () => {
    expect(isLink('https://zara.com/it/abc')).toBe(true);
    expect(isLink('www.zalando.it')).toBe(true);
    expect(isLink('Negozio in centro')).toBe(false);
    expect(linkUrl('www.zalando.it')).toBe('https://www.zalando.it');
  });
});
