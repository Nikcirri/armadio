import type { ColorId, ItemRecord, ItemStatus, WishlistRecord } from '../db/types';

// Regole sui capi: stati, disponibilità, costo per utilizzo, ricerca, filtri, ordinamento, doppioni.

/** Cambia stato applicando le regole della sezione 5 (es. Pulito azzera lavaggi e macchia). */
export function withStatus(item: ItemRecord, status: ItemStatus, now: string): ItemRecord {
  const next: ItemRecord = { ...item, status, updatedAt: now };
  if (status === 'clean') next.wearsSinceWash = 0;
  // La macchia da pre-trattare ha senso solo finché il capo è da lavare.
  if (status !== 'toWash') next.hasStain = false;
  if (status !== 'onLoan') {
    next.loanTo = '';
    next.loanDate = null;
  }
  if (status !== 'maintenance') next.maintenanceTags = [];
  if (status !== item.status && (item.status === 'onLoan' || item.status === 'maintenance' || item.status === 'forSale')) {
    next.statusNote = '';
  }
  return next;
}

/** Disponibile = pulito e non nella scatola del cambio stagione. */
export function isAvailable(item: ItemRecord, seasonBoxId: string | null): boolean {
  return item.status === 'clean' && (!seasonBoxId || item.locationId !== seasonBoxId);
}

/** Costo per utilizzo: prezzo ÷ utilizzi; null se manca il prezzo o non è mai stato indossato. */
export function costPerWear(item: Pick<ItemRecord, 'price' | 'wearCount'>): number | null {
  if (item.price === null || item.wearCount <= 0) return null;
  return Math.round((item.price / item.wearCount) * 100) / 100;
}

/** Il capo va lavato? (ha raggiunto gli utilizzi della soglia) */
export function needsWash(item: Pick<ItemRecord, 'wearsSinceWash' | 'maxWearsBeforeWash'>): boolean {
  return item.maxWearsBeforeWash !== null && item.wearsSinceWash >= item.maxWearsBeforeWash;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// ---------- Filtri ----------

export interface ItemFilters {
  query: string;
  categoryIds: string[];
  statuses: ItemStatus[];
  locationIds: string[];
  hideSeasonBox: boolean;
  ownerIds: string[];
  colors: ColorId[];
  seasons: ItemRecord['season'][];
  warmths: ItemRecord['warmth'][];
  cuts: ItemRecord['cutStyle'][];
  occasionIds: string[];
  favoritesOnly: boolean;
}

export function emptyFilters(): ItemFilters {
  return {
    query: '',
    categoryIds: [],
    statuses: [],
    locationIds: [],
    hideSeasonBox: true,
    ownerIds: [],
    colors: [],
    seasons: [],
    warmths: [],
    cuts: [],
    occasionIds: [],
    favoritesOnly: false,
  };
}

/** Quanti filtri sono attivi (la ricerca e "nascondi scatola" non contano). */
export function activeFilterCount(f: ItemFilters): number {
  return (
    f.categoryIds.length +
    f.statuses.length +
    f.locationIds.length +
    f.ownerIds.length +
    f.colors.length +
    f.seasons.length +
    f.warmths.length +
    f.cuts.length +
    f.occasionIds.length +
    (f.favoritesOnly ? 1 : 0)
  );
}

function matchesQuery(item: ItemRecord, q: string): boolean {
  if (!q) return true;
  const hay = normalize([item.name, item.brand, item.notes, item.size, ...item.fabrics].join(' '));
  return normalize(q)
    .split(/\s+/)
    .every((word) => hay.includes(word));
}

const anyOf = <T>(selected: readonly T[], value: T) => selected.length === 0 || selected.includes(value);
const intersects = <T>(selected: readonly T[], values: readonly T[]) =>
  selected.length === 0 || values.some((v) => selected.includes(v));

/**
 * Filtri combinabili: dentro lo stesso gruppo basta uno dei valori (es. rosso O blu),
 * tra gruppi diversi servono tutti (es. rosso E Autunno/Inverno).
 */
export function filterItems(items: readonly ItemRecord[], f: ItemFilters, seasonBoxId: string | null): ItemRecord[] {
  // Se l'utente filtra proprio per la scatola, non la si nasconde.
  const hideBox = f.hideSeasonBox && !!seasonBoxId && !f.locationIds.includes(seasonBoxId);
  return items.filter(
    (i) =>
      matchesQuery(i, f.query) &&
      anyOf(f.categoryIds, i.categoryId) &&
      anyOf(f.statuses, i.status) &&
      (f.locationIds.length === 0 || (i.locationId !== null && f.locationIds.includes(i.locationId))) &&
      (!hideBox || i.locationId !== seasonBoxId) &&
      (f.ownerIds.length === 0 || (i.ownerId !== null && f.ownerIds.includes(i.ownerId))) &&
      intersects(f.colors, i.colors) &&
      anyOf(f.seasons, i.season) &&
      anyOf(f.warmths, i.warmth) &&
      anyOf(f.cuts, i.cutStyle) &&
      intersects(f.occasionIds, i.occasions) &&
      (!f.favoritesOnly || i.favorite),
  );
}

// ---------- Ordinamento ----------

export type ItemSort = 'recent' | 'mostWorn' | 'leastWorn' | 'longestUnworn' | 'bestCpw' | 'name' | 'price';

export const SORTS: readonly { id: ItemSort; label: string }[] = [
  { id: 'recent', label: 'Più recenti' },
  { id: 'mostWorn', label: 'Più indossati' },
  { id: 'leastWorn', label: 'Meno indossati' },
  { id: 'longestUnworn', label: 'Non indossati da più tempo' },
  { id: 'bestCpw', label: 'Miglior costo per utilizzo' },
  { id: 'name', label: 'Nome A-Z' },
  { id: 'price', label: 'Prezzo (dal più alto)' },
];

export function sortItems(items: readonly ItemRecord[], sort: ItemSort): ItemRecord[] {
  const list = [...items];
  const byName = (a: ItemRecord, b: ItemRecord) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
  switch (sort) {
    case 'recent':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
    case 'mostWorn':
      return list.sort((a, b) => b.wearCount - a.wearCount || byName(a, b));
    case 'leastWorn':
      return list.sort((a, b) => a.wearCount - b.wearCount || byName(a, b));
    case 'longestUnworn':
      // Mai indossati per primi, poi dal più vecchio.
      return list.sort((a, b) => (a.lastWornDate ?? '').localeCompare(b.lastWornDate ?? '') || byName(a, b));
    case 'bestCpw':
      return list.sort((a, b) => {
        const ca = costPerWear(a);
        const cb = costPerWear(b);
        if (ca === null && cb === null) return byName(a, b);
        if (ca === null) return 1;
        if (cb === null) return -1;
        return ca - cb || byName(a, b);
      });
    case 'name':
      return list.sort(byName);
    case 'price':
      return list.sort((a, b) => (b.price ?? -1) - (a.price ?? -1) || byName(a, b));
  }
}

// ---------- Doppioni ----------

export interface DuplicateGroup {
  key: string;
  categoryId: string;
  color: ColorId;
  items: ItemRecord[];
  wishlist: WishlistRecord[];
}

/**
 * Capi quasi uguali: stessa categoria e stesso colore principale; se entrambi hanno un tessuto
 * indicato, serve almeno un tessuto in comune. Si confrontano anche i desideri della wishlist.
 */
export function findDuplicates(items: readonly ItemRecord[], wishlist: readonly WishlistRecord[] = []): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();
  for (const item of items) {
    const color = item.colors[0];
    if (!color) continue;
    const key = `${item.categoryId}|${color}`;
    const g = groups.get(key) ?? { key, categoryId: item.categoryId, color, items: [], wishlist: [] };
    g.items.push(item);
    groups.set(key, g);
  }
  for (const w of wishlist) {
    const color = w.colors[0];
    if (!color || !w.categoryId) continue;
    groups.get(`${w.categoryId}|${color}`)?.wishlist.push(w);
  }
  const fabricOk = (list: ItemRecord[]) => {
    const withFabric = list.filter((i) => i.fabrics.length > 0);
    if (withFabric.length < 2) return true;
    const sets = withFabric.map((i) => new Set(i.fabrics.map(normalize)));
    return sets.some((s, idx) => sets.some((t, jdx) => idx !== jdx && [...s].some((f) => t.has(f))));
  };
  return [...groups.values()]
    .filter((g) => (g.items.length >= 2 && fabricOk(g.items)) || (g.items.length >= 1 && g.wishlist.length >= 1))
    .sort((a, b) => b.items.length - a.items.length);
}
