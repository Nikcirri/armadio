import type { ArmadioDB } from './schema';
import type { ColorId, ItemRecord, ItemStatus, OutfitRecord, PhotoRecord, TripRecord } from './types';
import { createItem } from '../logic/factories';
import { addPhotoId, removePhotoId, setCover } from '../logic/itemPhotos';
import { withStatus } from '../logic/items';
import { relinkUnderwear } from '../logic/underwear';
import { newId, nowIso } from '../logic/util';
import { countersFromLog, latestEntryFor, withoutItem } from '../logic/wears';

/** Crea un capo con le foto indicate (la prima è la copertina). */
export async function addItem(
  db: ArmadioDB,
  input: { name: string; categoryId: string; colors: ColorId[]; photoIds: string[] },
): Promise<ItemRecord> {
  return db.transaction('rw', db.items, db.categories, db.lists, async () => {
    const category = await db.categories.get(input.categoryId);
    if (!category) throw new Error('Categoria non trovata');
    const [owner, location] = await Promise.all([
      db.lists.where('kind').equals('owner').filter((l) => l.extra.key === 'mine').first(),
      db.lists.where('kind').equals('location').filter((l) => l.extra.key === 'main').first(),
    ]);
    const item = createItem(
      {
        name: input.name.trim() || category.name,
        colors: input.colors,
        photoIds: input.photoIds,
        ownerId: owner?.id ?? null,
        locationId: location?.id ?? null,
      },
      category,
    );
    await db.items.add(item);
    return item;
  });
}

export async function updateItemFields(
  db: ArmadioDB,
  id: string,
  patch: Partial<Pick<ItemRecord, 'name' | 'colors'>>,
): Promise<void> {
  const changes: Partial<ItemRecord> = { ...patch, updatedAt: nowIso() };
  if (patch.name !== undefined) changes.name = patch.name.trim() || 'Capo senza nome';
  await db.items.update(id, changes);
}

export async function addPhotoToItem(db: ArmadioDB, itemId: string, photoId: string): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    await db.items.update(itemId, { photoIds: addPhotoId(item.photoIds, photoId), updatedAt: nowIso() });
  });
}

export async function setItemCover(db: ArmadioDB, itemId: string, photoId: string): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    await db.items.update(itemId, { photoIds: setCover(item.photoIds, photoId), updatedAt: nowIso() });
  });
}

/** Toglie una foto dal capo e la cancella. */
export async function removeItemPhoto(db: ArmadioDB, itemId: string, photoId: string): Promise<void> {
  await db.transaction('rw', db.items, db.photos, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    await db.items.update(itemId, { photoIds: removePhotoId(item.photoIds, photoId), updatedAt: nowIso() });
    await db.photos.delete(photoId);
  });
}

/** Elimina più capi appena creati (es. bozze scartate) insieme alle loro foto. */
export async function deleteItemsHard(db: ArmadioDB, ids: string[]): Promise<void> {
  await db.transaction('rw', db.items, db.photos, async () => {
    const items = (await db.items.bulkGet(ids)).filter((i): i is ItemRecord => !!i);
    await db.photos.bulkDelete(items.flatMap((i) => i.photoIds));
    await db.items.bulkDelete(ids);
  });
}

// ---------- Scheda capo (Fase 3) ----------

/** Campi che la scheda capo modifica (foto e contatori hanno funzioni a parte). */
export type EditableItemFields = Pick<
  ItemRecord,
  | 'name'
  | 'categoryId'
  | 'status'
  | 'statusNote'
  | 'hasStain'
  | 'maintenanceTags'
  | 'loanTo'
  | 'loanDate'
  | 'ownerId'
  | 'locationId'
  | 'favorite'
  | 'colors'
  | 'fabrics'
  | 'season'
  | 'warmth'
  | 'cutStyle'
  | 'intimateNote'
  | 'underwearIds'
  | 'waterproof'
  | 'walkability'
  | 'bagSize'
  | 'occasions'
  | 'washTags'
  | 'fitNote'
  | 'brand'
  | 'size'
  | 'price'
  | 'purchaseDate'
  | 'resalePrice'
  | 'maxWearsBeforeWash'
  | 'notes'
>;

export const EDITABLE_KEYS: readonly (keyof EditableItemFields)[] = [
  'name',
  'categoryId',
  'status',
  'statusNote',
  'hasStain',
  'maintenanceTags',
  'loanTo',
  'loanDate',
  'ownerId',
  'locationId',
  'favorite',
  'colors',
  'fabrics',
  'season',
  'warmth',
  'cutStyle',
  'intimateNote',
  'underwearIds',
  'waterproof',
  'walkability',
  'bagSize',
  'occasions',
  'washTags',
  'fitNote',
  'brand',
  'size',
  'price',
  'purchaseDate',
  'resalePrice',
  'maxWearsBeforeWash',
  'notes',
];

export function pickEditable(item: ItemRecord): EditableItemFields {
  const out = {} as Record<string, unknown>;
  for (const k of EDITABLE_KEYS) {
    const v = item[k];
    out[k] = Array.isArray(v) ? [...v] : v;
  }
  return out as EditableItemFields;
}

/**
 * Salva la scheda: applica le regole dello stato (sezione 5), aggiorna lo slot se cambia categoria
 * e, per "In valigia", collega il capo al viaggio scelto. Per un capo Intimo, `underFor` sono i capi
 * sotto cui va ("Va sotto a"; null = non cambiano).
 */
export async function saveItem(
  db: ArmadioDB,
  id: string,
  fields: EditableItemFields,
  tripId: string | null = null,
  underFor: readonly string[] | null = null,
): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.items, db.categories, db.trips, async () => {
    const current = await db.items.get(id);
    if (!current) throw new Error('Capo non trovato');
    const category = await db.categories.get(fields.categoryId);
    if (!category) throw new Error('Categoria non trovata');
    let next: ItemRecord = { ...current, ...fields, slotType: category.slotType, updatedAt: now };
    if (fields.status !== current.status) {
      // Le regole dello stato partono dal capo com'era, poi si rimettono i campi scelti nella scheda.
      const ruled = withStatus({ ...current, ...fields, status: current.status }, fields.status, now);
      next = { ...ruled, slotType: category.slotType };
      if (fields.status === 'onLoan') Object.assign(next, { loanTo: fields.loanTo, loanDate: fields.loanDate });
      if (fields.status === 'maintenance') Object.assign(next, { maintenanceTags: fields.maintenanceTags, statusNote: fields.statusNote });
      if (fields.status === 'forSale') Object.assign(next, { statusNote: fields.statusNote });
      if (fields.status === 'toWash') next.hasStain = fields.hasStain;
    }
    next.name = next.name.trim() || category.name;
    next.underwearIds = category.slotType === 'underwear' ? [] : next.underwearIds.filter((x) => x !== id);
    await db.items.put(next);
    // Intimo: "Va sotto a" si salva sugli altri capi; se smette di essere intimo, il collegamento sparisce.
    const wasUnderwear = current.slotType === 'underwear';
    if (category.slotType === 'underwear' ? underFor !== null : wasUnderwear) {
      const all = await db.items.toArray();
      const changes = relinkUnderwear(id, category.slotType === 'underwear' ? (underFor ?? []) : [], all);
      const byId = new Map(all.map((i) => [i.id, i]));
      await db.items.bulkPut(changes.map((c) => ({ ...byId.get(c.id)!, underwearIds: c.underwearIds, updatedAt: now })));
    }
    if (next.status === 'packed' && tripId) {
      const trip = await db.trips.get(tripId);
      if (trip && !trip.extraItemIds.includes(id)) {
        await db.trips.put({
          ...trip,
          extraItemIds: [...trip.extraItemIds, id],
          packedItemIds: trip.packedItemIds.includes(id) ? trip.packedItemIds : [...trip.packedItemIds, id],
          updatedAt: now,
        });
      }
    }
  });
}

export async function toggleFavorite(db: ArmadioDB, id: string): Promise<boolean> {
  return db.transaction('rw', db.items, async () => {
    const item = await db.items.get(id);
    if (!item) throw new Error('Capo non trovato');
    await db.items.update(id, { favorite: !item.favorite, updatedAt: nowIso() });
    return !item.favorite;
  });
}

/** Tasto "+": aggiunge un utilizzo allo storico (oggi o nella data scelta). */
export async function addWear(db: ArmadioDB, itemId: string, date: string): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.items, db.wearLog, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    await db.wearLog.add({
      id: newId(),
      date,
      itemIds: [itemId],
      itemNames: [item.name],
      outfitId: null,
      diaryId: null,
      createdAt: now,
      updatedAt: now,
    });
    // Si somma 1 (non si ricalcola dallo storico): i capi importati o d'esempio possono avere
    // utilizzi contati prima che esistesse lo storico.
    await db.items.update(itemId, {
      wearCount: item.wearCount + 1,
      lastWornDate: !item.lastWornDate || date > item.lastWornDate ? date : item.lastWornDate,
      wearsSinceWash: item.wearsSinceWash + 1,
      updatedAt: now,
    });
  });
}

/** Tasto "−": toglie l'utilizzo più recente dallo storico. Restituisce false se non ce n'erano. */
export async function removeLastWear(db: ArmadioDB, itemId: string): Promise<boolean> {
  const now = nowIso();
  return db.transaction('rw', db.items, db.wearLog, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    const log = await db.wearLog.where('itemIds').equals(itemId).toArray();
    const entry = latestEntryFor(itemId, log);
    if (!entry) return false;
    const updated = withoutItem(entry, itemId, now);
    if (updated) await db.wearLog.put(updated);
    else await db.wearLog.delete(entry.id);
    const rest = await db.wearLog.where('itemIds').equals(itemId).toArray();
    const wearCount = Math.max(0, item.wearCount - 1);
    await db.items.update(itemId, {
      wearCount,
      lastWornDate: countersFromLog(itemId, rest).lastWornDate ?? (wearCount > 0 ? item.lastWornDate : null),
      wearsSinceWash: Math.max(0, item.wearsSinceWash - 1),
      updatedAt: now,
    });
    return true;
  });
}

export async function getWearDates(db: ArmadioDB, itemId: string): Promise<string[]> {
  const log = await db.wearLog.where('itemIds').equals(itemId).toArray();
  return log.map((e) => e.date).sort((a, b) => b.localeCompare(a));
}

/** Copia il capo (foto comprese) con utilizzi azzerati. */
export async function duplicateItem(db: ArmadioDB, id: string): Promise<ItemRecord> {
  const now = nowIso();
  return db.transaction('rw', db.items, db.photos, async () => {
    const item = await db.items.get(id);
    if (!item) throw new Error('Capo non trovato');
    const photos = (await db.photos.bulkGet(item.photoIds)).filter((p): p is PhotoRecord => !!p);
    const copies = photos.map((p) => ({ ...p, id: newId(), demo: undefined, createdAt: now, updatedAt: now }));
    await db.photos.bulkAdd(copies);
    const copy: ItemRecord = {
      ...item,
      id: newId(),
      name: `${item.name} (copia)`,
      photoIds: copies.map((c) => c.id),
      status: 'clean',
      hasStain: false,
      wearCount: 0,
      lastWornDate: null,
      wearsSinceWash: 0,
      favorite: false,
      demo: undefined,
      createdAt: now,
      updatedAt: now,
    };
    await db.items.add(copy);
    return copy;
  });
}

// ---------- Azioni di massa con Annulla ----------

export interface BulkSnapshot {
  items: ItemRecord[];
  trips: TripRecord[];
  outfits: OutfitRecord[];
}

export async function restoreBulk(db: ArmadioDB, snap: BulkSnapshot): Promise<void> {
  await db.transaction('rw', db.items, db.trips, db.outfits, async () => {
    await db.items.bulkPut(snap.items);
    await db.trips.bulkPut(snap.trips);
    await db.outfits.bulkPut(snap.outfits);
  });
}

async function loadItems(db: ArmadioDB, ids: string[]): Promise<ItemRecord[]> {
  return (await db.items.bulkGet(ids)).filter((i): i is ItemRecord => !!i);
}

export async function bulkSetStatus(db: ArmadioDB, ids: string[], status: ItemStatus): Promise<BulkSnapshot> {
  const now = nowIso();
  return db.transaction('rw', db.items, async () => {
    const items = await loadItems(db, ids);
    await db.items.bulkPut(items.map((i) => withStatus(i, status, now)));
    return { items, trips: [], outfits: [] };
  });
}

export async function bulkSetLocation(db: ArmadioDB, ids: string[], locationId: string): Promise<BulkSnapshot> {
  const now = nowIso();
  return db.transaction('rw', db.items, async () => {
    const items = await loadItems(db, ids);
    await db.items.bulkPut(items.map((i) => ({ ...i, locationId, updatedAt: now })));
    return { items, trips: [], outfits: [] };
  });
}

export async function bulkAddToTrip(db: ArmadioDB, ids: string[], tripId: string): Promise<BulkSnapshot> {
  const now = nowIso();
  return db.transaction('rw', db.items, db.trips, async () => {
    const items = await loadItems(db, ids);
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error('Viaggio non trovato');
    const add = (list: string[]) => [...list, ...[...new Set(ids)].filter((id) => !list.includes(id))];
    await db.items.bulkPut(items.map((i) => withStatus(i, 'packed', now)));
    await db.trips.put({ ...trip, extraItemIds: add(trip.extraItemIds), packedItemIds: add(trip.packedItemIds), updatedAt: now });
    return { items, trips: [trip], outfits: [] };
  });
}

export async function bulkAddToOutfit(db: ArmadioDB, ids: string[], outfitId: string): Promise<BulkSnapshot> {
  const now = nowIso();
  return db.transaction('rw', db.outfits, async () => {
    const outfit = await db.outfits.get(outfitId);
    if (!outfit) throw new Error('Outfit non trovato');
    const itemIds = [...outfit.itemIds, ...[...new Set(ids)].filter((id) => !outfit.itemIds.includes(id))];
    await db.outfits.put({ ...outfit, itemIds, updatedAt: now });
    return { items: [], trips: [], outfits: [outfit] };
  });
}

// ---------- Lavanderia e cambio stagione (Fase 4) ----------

/** Macchia pre-trattata: il capo resta "Da lavare" ma senza l'avviso. */
export async function clearStain(db: ArmadioDB, id: string): Promise<void> {
  await db.items.update(id, { hasStain: false, updatedAt: nowIso() });
}

/**
 * Id della posizione con questa chiave (es. "seasonBox", "main").
 * Se l'utente l'ha eliminata, la ricrea con il nome indicato.
 */
export async function ensureLocation(db: ArmadioDB, key: 'seasonBox' | 'main', name: string): Promise<string> {
  return db.transaction('rw', db.lists, async () => {
    const found = await db.lists
      .where('kind')
      .equals('location')
      .filter((l) => l.extra.key === key)
      .first();
    if (found) return found.id;
    const all = await db.lists.where('kind').equals('location').toArray();
    const now = nowIso();
    const id = newId();
    await db.lists.add({
      id,
      kind: 'location',
      name,
      order: all.reduce((m, l) => Math.max(m, l.order), -1) + 1,
      extra: { key },
      createdAt: now,
      updatedAt: now,
    });
    return id;
  });
}
