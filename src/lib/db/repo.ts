import type { ArmadioDB } from './schema';
import type {
  CategoryRecord,
  ErrorLogEntry,
  ItemRecord,
  OutfitRecord,
  PaletteId,
  PhotoRecord,
  PlannerRecord,
  Preset,
  SettingKey,
  SettingsMap,
  SlotType,
  ThemeMode,
  TripRecord,
} from './types';
import { buildDefaultLists, buildOccasionMatrix, buildPresetCategories, defaultSettings } from '../logic/presets';
import { removeItemFromOutfit, swapWithinGroup, removeItemFromPlanner, removeItemFromTrip } from '../logic/integrity';
import { slotInfo } from '../logic/slots';
import { newId, nowIso } from '../logic/util';

// ---------- Impostazioni ----------

export async function getSetting<K extends SettingKey>(db: ArmadioDB, key: K): Promise<SettingsMap[K] | undefined> {
  const rec = await db.settings.get(key);
  return rec?.value as SettingsMap[K] | undefined;
}

export async function setSetting<K extends SettingKey>(db: ArmadioDB, key: K, value: SettingsMap[K]): Promise<void> {
  await db.settings.put({ key, value });
}

export async function updateSetting<K extends SettingKey>(
  db: ArmadioDB,
  key: K,
  patch: SettingsMap[K] extends object ? Partial<SettingsMap[K]> : SettingsMap[K],
): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await getSetting(db, key);
    const next =
      current !== undefined && typeof current === 'object' && !Array.isArray(current)
        ? { ...current, ...(patch as object) }
        : patch;
    await db.settings.put({ key, value: next as SettingsMap[K] });
  });
}

export async function getAllSettings(db: ArmadioDB): Promise<Partial<SettingsMap>> {
  const all = await db.settings.toArray();
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const rec of all) out[rec.key] = rec.value;
  return out as Partial<SettingsMap>;
}

const ERROR_LOG_MAX = 50;

export async function appendErrorLog(db: ArmadioDB, message: string, at: string = nowIso()): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const log = (await getSetting(db, 'errorLog')) ?? [];
    const next: ErrorLogEntry[] = [...log, { at, message: message.slice(0, 2000) }].slice(-ERROR_LOG_MAX);
    await db.settings.put({ key: 'errorLog', value: next });
  });
}

// ---------- Primo avvio ----------

export interface SetupInput {
  preset: Preset;
  userName: string;
  palette: PaletteId;
  mode: ThemeMode;
}

/** Crea categorie, liste e impostazioni iniziali. Sostituisce eventuali dati precedenti. */
export async function setupNewWardrobe(db: ArmadioDB, input: SetupInput): Promise<void> {
  const now = nowIso();
  const categories = buildPresetCategories(input.preset, now);
  const lists = buildDefaultLists(now);
  const settings = {
    ...defaultSettings({ preset: input.preset, userName: input.userName.trim(), now }),
    theme: { palette: input.palette, mode: input.mode },
    occasionMatrix: buildOccasionMatrix(lists),
  } satisfies SettingsMap;
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.categories.bulkAdd(categories);
    await db.lists.bulkAdd(lists);
    await db.settings.bulkPut(
      (Object.keys(settings) as SettingKey[]).map((key) => ({ key, value: settings[key] })),
    );
  });
}

export async function completeOnboarding(db: ArmadioDB): Promise<void> {
  await updateSetting(db, 'app', { onboarded: true });
}

// ---------- Categorie ----------

export async function getCategories(db: ArmadioDB): Promise<CategoryRecord[]> {
  return db.categories.orderBy('order').toArray();
}

export async function addCategory(
  db: ArmadioDB,
  input: {
    name: string;
    slotType: SlotType;
    icon: string;
    defaultMaxWears?: number | null;
    bulkWeight?: number;
  },
): Promise<CategoryRecord> {
  const now = nowIso();
  const info = slotInfo(input.slotType);
  return db.transaction('rw', db.categories, async () => {
    const last = await db.categories.orderBy('order').last();
    const rec: CategoryRecord = {
      id: newId(),
      name: input.name.trim(),
      slotType: input.slotType,
      icon: input.icon,
      defaultMaxWears: input.defaultMaxWears === undefined ? info.defaultMaxWears : input.defaultMaxWears,
      bulkWeight: input.bulkWeight ?? info.bulkWeight,
      order: (last?.order ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.categories.add(rec);
    return rec;
  });
}

/** Modifica una categoria. Se cambia lo slot, aggiorna anche lo slot dei suoi capi. */
export async function updateCategory(
  db: ArmadioDB,
  id: string,
  patch: Partial<Pick<CategoryRecord, 'name' | 'slotType' | 'icon' | 'defaultMaxWears' | 'bulkWeight'>>,
): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.categories, db.items, async () => {
    const current = await db.categories.get(id);
    if (!current) throw new Error('Categoria non trovata');
    const next: CategoryRecord = {
      ...current,
      ...patch,
      name: (patch.name ?? current.name).trim(),
      updatedAt: now,
    };
    await db.categories.put(next);
    if (patch.slotType && patch.slotType !== current.slotType) {
      await db.items.where('categoryId').equals(id).modify({ slotType: patch.slotType, updatedAt: now });
    }
  });
}

export async function moveCategory(db: ArmadioDB, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const all = await db.categories.toArray();
    // Si sposta solo tra le categorie dello stesso tipo, come vengono mostrate.
    const changed = swapWithinGroup(all, id, direction, (a, b) => a.slotType === b.slotType);
    await db.categories.bulkPut(changed.map((c) => ({ ...c, updatedAt: nowIso() })));
  });
}

/**
 * Elimina una categoria. Se contiene capi, `reassignTo` è obbligatorio:
 * i capi passano alla nuova categoria (e al suo slot).
 */
export async function deleteCategory(db: ArmadioDB, id: string, reassignTo: string | null): Promise<number> {
  return db.transaction('rw', db.categories, db.items, async () => {
    const count = await db.items.where('categoryId').equals(id).count();
    if (count > 0) {
      if (!reassignTo || reassignTo === id) throw new Error('Scegli dove spostare i capi di questa categoria');
      const target = await db.categories.get(reassignTo);
      if (!target) throw new Error('Categoria di destinazione non trovata');
      await db.items
        .where('categoryId')
        .equals(id)
        .modify({ categoryId: target.id, slotType: target.slotType, updatedAt: nowIso() });
    }
    await db.categories.delete(id);
    return count;
  });
}

// ---------- Capi: eliminazione con Annulla ----------

export interface ItemUsage {
  outfits: number;
  trips: number;
  plannerDays: number;
}

export async function getItemUsage(db: ArmadioDB, itemId: string): Promise<ItemUsage> {
  const [outfits, trips, planner] = await Promise.all([
    db.outfits.filter((o) => o.itemIds.includes(itemId)).count(),
    db.trips
      .filter((t) => [...t.extraItemIds, ...t.wearInTransitIds, ...t.packedItemIds].includes(itemId))
      .count(),
    db.planner.filter((p) => p.itemIds.includes(itemId)).count(),
  ]);
  return { outfits, trips, plannerDays: planner };
}

export interface ItemDeletionSnapshot {
  item: ItemRecord;
  /** Capi che avevano questo capo come intimo da mettere sotto, com'erano. */
  linked: ItemRecord[];
  photos: PhotoRecord[];
  outfits: OutfitRecord[];
  trips: TripRecord[];
  planner: PlannerRecord[];
}

/** Elimina un capo e lo toglie da outfit, viaggi, agenda e dall'intimo degli altri capi. Lo storico resta. */
export async function deleteItemCascade(db: ArmadioDB, itemId: string): Promise<ItemDeletionSnapshot> {
  const now = nowIso();
  return db.transaction('rw', [db.items, db.photos, db.outfits, db.trips, db.planner], async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    const photos = (await db.photos.bulkGet(item.photoIds)).filter((p): p is PhotoRecord => !!p);
    const outfits = await db.outfits.filter((o) => o.itemIds.includes(itemId)).toArray();
    const trips = await db.trips.toArray();
    const planner = await db.planner.filter((p) => p.itemIds.includes(itemId)).toArray();
    const linked = await db.items.filter((i) => i.id !== itemId && (i.underwearIds ?? []).includes(itemId)).toArray();

    const changedTrips = trips
      .map((t) => ({ before: t, after: removeItemFromTrip(t, itemId, now) }))
      .filter((x): x is { before: TripRecord; after: TripRecord } => x.after !== null);

    await db.outfits.bulkPut(outfits.map((o) => removeItemFromOutfit(o, itemId, now)!));
    await db.trips.bulkPut(changedTrips.map((x) => x.after));
    await db.planner.bulkPut(planner.map((p) => removeItemFromPlanner(p, itemId, now)!));
    await db.items.bulkPut(linked.map((i) => ({ ...i, underwearIds: i.underwearIds.filter((x) => x !== itemId), updatedAt: now })));
    await db.photos.bulkDelete(item.photoIds);
    await db.items.delete(itemId);

    return { item, linked, photos, outfits, trips: changedTrips.map((x) => x.before), planner };
  });
}

/** Annulla l'eliminazione: rimette il capo e ripristina outfit, viaggi e agenda com'erano. */
export async function restoreItemDeletion(db: ArmadioDB, snap: ItemDeletionSnapshot): Promise<void> {
  await db.transaction('rw', [db.items, db.photos, db.outfits, db.trips, db.planner], async () => {
    await db.photos.bulkPut(snap.photos);
    await db.items.put(snap.item);
    await db.items.bulkPut(snap.linked);
    await db.outfits.bulkPut(snap.outfits);
    await db.trips.bulkPut(snap.trips);
    await db.planner.bulkPut(snap.planner);
  });
}

// ---------- Dati in blocco ----------

export interface DataCounts {
  items: number;
  outfits: number;
  photos: number;
  trips: number;
  wishlist: number;
  diary: number;
}

export async function countData(db: ArmadioDB): Promise<DataCounts> {
  const [items, outfits, photos, trips, wishlist, diary] = await Promise.all([
    db.items.count(),
    db.outfits.count(),
    db.photos.count(),
    db.trips.count(),
    db.wishlist.count(),
    db.diary.count(),
  ]);
  return { items, outfits, photos, trips, wishlist, diary };
}

export async function hasDemoData(db: ArmadioDB): Promise<boolean> {
  const item = await db.items.filter((i) => i.demo === true).first();
  return !!item;
}

/** Elimina tutti i record creati da "Carica esempio". */
export async function deleteDemoData(db: ArmadioDB): Promise<number> {
  const isDemo = (r: { demo?: boolean }) => r.demo === true;
  const tables = [db.items, db.photos, db.outfits, db.trips, db.wearLog, db.diary, db.planner, db.wishlist];
  return db.transaction('rw', tables, async () => {
    const counts = await Promise.all([
      db.items.filter(isDemo).delete(),
      db.photos.filter(isDemo).delete(),
      db.outfits.filter(isDemo).delete(),
      db.trips.filter(isDemo).delete(),
      db.wearLog.filter(isDemo).delete(),
      db.diary.filter(isDemo).delete(),
      db.planner.filter(isDemo).delete(),
      db.wishlist.filter(isDemo).delete(),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  });
}

/** Cancella tutto, impostazioni comprese: l'app riparte dal primo avvio. */
export async function wipeEverything(db: ArmadioDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
