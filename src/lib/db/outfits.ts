import type { ArmadioDB } from './schema';
import type {
  DiaryRecord,
  EndOfDayPending,
  ItemRecord,
  OutfitLayoutEntry,
  OutfitRecord,
  PhotoRecord,
  PlannerRecord,
  Season,
  TripRecord,
  WearLogRecord,
} from './types';
import { withStatus } from '../logic/items';
import {
  addToEndOfDay,
  defaultOutfitName,
  detachOutfitFromDiary,
  detachOutfitFromPlanner,
  detachOutfitFromTrip,
} from '../logic/outfits';
import { createOutfit } from '../logic/factories';
import { newId, nowIso } from '../logic/util';

// Outfit, "Indossa", "Fine giornata" e diario dei ricordi (SPEC.md, sezione 8.2).

export interface OutfitInput {
  name: string;
  itemIds: string[];
  wishlistIds: string[];
  season: Season | null;
  occasions: string[];
  weatherTags: string[];
  favorite: boolean;
  notes: string;
  layout: OutfitLayoutEntry[];
}

/** Crea o aggiorna un outfit. Salvandolo, un outfit "incompleto" torna normale. */
export async function saveOutfit(db: ArmadioDB, input: OutfitInput, id: string | null = null): Promise<OutfitRecord> {
  const now = nowIso();
  return db.transaction('rw', db.outfits, async () => {
    let name = input.name.trim();
    if (!name) {
      const all = await db.outfits.toArray();
      name = defaultOutfitName(all.filter((o) => o.id !== id).map((o) => o.name));
    }
    const fields = { ...input, name, notes: input.notes.trim(), incomplete: false };
    if (id) {
      const existing = await db.outfits.get(id);
      if (!existing) throw new Error('Outfit non trovato');
      const updated: OutfitRecord = { ...existing, ...fields, updatedAt: now };
      await db.outfits.put(updated);
      return updated;
    }
    const created = createOutfit(fields, now);
    await db.outfits.add(created);
    return created;
  });
}

export async function saveOutfitLayout(db: ArmadioDB, id: string, layout: OutfitLayoutEntry[]): Promise<void> {
  const n = await db.outfits.update(id, { layout, updatedAt: nowIso() });
  if (!n) throw new Error('Outfit non trovato');
}

/** Aggiunge dei capi a un outfit (es. l'intimo consigliato). Il collage non cambia: l'intimo non c'è. */
export async function addItemsToOutfit(db: ArmadioDB, id: string, itemIds: readonly string[]): Promise<void> {
  await db.transaction('rw', db.outfits, async () => {
    const outfit = await db.outfits.get(id);
    if (!outfit) throw new Error('Outfit non trovato');
    const next = [...outfit.itemIds, ...itemIds.filter((x) => !outfit.itemIds.includes(x))];
    await db.outfits.update(id, { itemIds: next, updatedAt: nowIso() });
  });
}

export async function toggleOutfitFavorite(db: ArmadioDB, id: string): Promise<boolean> {
  return db.transaction('rw', db.outfits, async () => {
    const outfit = await db.outfits.get(id);
    if (!outfit) throw new Error('Outfit non trovato');
    await db.outfits.update(id, { favorite: !outfit.favorite, updatedAt: nowIso() });
    return !outfit.favorite;
  });
}

export async function duplicateOutfit(db: ArmadioDB, id: string): Promise<OutfitRecord> {
  const now = nowIso();
  return db.transaction('rw', db.outfits, async () => {
    const outfit = await db.outfits.get(id);
    if (!outfit) throw new Error('Outfit non trovato');
    const copy: OutfitRecord = { ...outfit, id: newId(), name: `${outfit.name} (copia)`, demo: undefined, createdAt: now, updatedAt: now };
    await db.outfits.add(copy);
    return copy;
  });
}

// ---------- Eliminazione con Annulla ----------

export interface OutfitDeletionSnapshot {
  outfit: OutfitRecord;
  trips: TripRecord[];
  planner: PlannerRecord[];
  diary: DiaryRecord[];
}

/** Elimina l'outfit: esce da viaggi e agenda, i ricordi tengono i suoi capi, lo storico resta. */
export async function deleteOutfitCascade(db: ArmadioDB, id: string): Promise<OutfitDeletionSnapshot> {
  const now = nowIso();
  return db.transaction('rw', [db.outfits, db.trips, db.planner, db.diary], async () => {
    const outfit = await db.outfits.get(id);
    if (!outfit) throw new Error('Outfit non trovato');
    const trips = await db.trips.filter((t) => t.outfitIds.includes(id)).toArray();
    const planner = await db.planner.filter((p) => p.outfitId === id).toArray();
    const diary = await db.diary.where('outfitId').equals(id).toArray();
    await db.trips.bulkPut(trips.map((t) => detachOutfitFromTrip(t, id, now)!));
    await db.planner.bulkPut(planner.map((p) => detachOutfitFromPlanner(p, outfit, now)!));
    await db.diary.bulkPut(diary.map((d) => detachOutfitFromDiary(d, outfit, now)!));
    await db.outfits.delete(id);
    return { outfit, trips, planner, diary };
  });
}

export async function restoreOutfitDeletion(db: ArmadioDB, snap: OutfitDeletionSnapshot): Promise<void> {
  await db.transaction('rw', [db.outfits, db.trips, db.planner, db.diary], async () => {
    await db.outfits.put(snap.outfit);
    await db.trips.bulkPut(snap.trips);
    await db.planner.bulkPut(snap.planner);
    await db.diary.bulkPut(snap.diary);
  });
}

// ---------- Indossa ----------

export interface WearSnapshot {
  entryId: string;
  items: ItemRecord[];
  endOfDay: EndOfDayPending | null;
}

async function getEndOfDay(db: ArmadioDB): Promise<EndOfDayPending | null> {
  const rec = await db.settings.get('endOfDay');
  return (rec?.value as EndOfDayPending | null | undefined) ?? null;
}

/**
 * "Indossa oggi" (o in un'altra data): una voce nello storico, contatori dei capi aggiornati
 * e capi messi in attesa di "Fine giornata", tutto in una transazione.
 */
export async function wearItems(
  db: ArmadioDB,
  input: { itemIds: string[]; date: string; outfitId: string | null },
): Promise<WearSnapshot> {
  const now = nowIso();
  return db.transaction('rw', [db.items, db.wearLog, db.settings], async () => {
    const ids = [...new Set(input.itemIds)];
    const items = (await db.items.bulkGet(ids)).filter((i): i is ItemRecord => !!i);
    if (!items.length) throw new Error('Nessun capo da segnare come indossato');
    const entry: WearLogRecord = {
      id: newId(),
      date: input.date,
      itemIds: items.map((i) => i.id),
      itemNames: items.map((i) => i.name),
      outfitId: input.outfitId,
      diaryId: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.wearLog.add(entry);
    await db.items.bulkPut(
      items.map((i) => ({
        ...i,
        wearCount: i.wearCount + 1,
        lastWornDate: !i.lastWornDate || input.date > i.lastWornDate ? input.date : i.lastWornDate,
        wearsSinceWash: i.wearsSinceWash + 1,
        updatedAt: now,
      })),
    );
    const before = await getEndOfDay(db);
    // I capi eliminati nel frattempo escono dall'elenco in attesa.
    const stillThere = before
      ? (await db.items.bulkGet(before.itemIds)).filter((i): i is ItemRecord => !!i).map((i) => i.id)
      : [];
    const base = before && stillThere.length ? { ...before, itemIds: stillThere } : null;
    await db.settings.put({ key: 'endOfDay', value: addToEndOfDay(base, input.date, entry.itemIds) });
    return { entryId: entry.id, items, endOfDay: before };
  });
}

export async function undoWear(db: ArmadioDB, snap: WearSnapshot): Promise<void> {
  await db.transaction('rw', [db.items, db.wearLog, db.settings], async () => {
    await db.wearLog.delete(snap.entryId);
    await db.items.bulkPut(snap.items);
    await db.settings.put({ key: 'endOfDay', value: snap.endOfDay });
  });
}

// ---------- Fine giornata ----------

export interface EndOfDaySnapshot {
  items: ItemRecord[];
  endOfDay: EndOfDayPending | null;
}

/** Chiude la giornata: i capi scelti vanno "Da lavare" (con macchia se indicato), gli altri restano puliti. */
export async function applyEndOfDay(db: ArmadioDB, washIds: string[], stainIds: string[]): Promise<EndOfDaySnapshot> {
  const now = nowIso();
  return db.transaction('rw', [db.items, db.settings], async () => {
    const items = (await db.items.bulkGet([...new Set(washIds)])).filter((i): i is ItemRecord => !!i);
    await db.items.bulkPut(items.map((i) => ({ ...withStatus(i, 'toWash', now), hasStain: stainIds.includes(i.id) })));
    const before = await getEndOfDay(db);
    await db.settings.put({ key: 'endOfDay', value: null });
    return { items, endOfDay: before };
  });
}

export async function undoEndOfDay(db: ArmadioDB, snap: EndOfDaySnapshot): Promise<void> {
  await db.transaction('rw', [db.items, db.settings], async () => {
    await db.items.bulkPut(snap.items);
    await db.settings.put({ key: 'endOfDay', value: snap.endOfDay });
  });
}

// ---------- Diario dei ricordi ----------

export interface DiaryInput {
  date: string;
  outfitId: string | null;
  itemIds: string[];
  location: string;
  people: string[];
  note: string;
  photoIds: string[];
}

/** Collega il ricordo alla voce dello storico dello stesso giorno e dello stesso outfit. */
async function linkWearLog(db: ArmadioDB, diaryId: string, input: DiaryInput, now: string): Promise<void> {
  const linked = await db.wearLog.filter((w) => w.diaryId === diaryId).toArray();
  await db.wearLog.bulkPut(linked.map((w) => ({ ...w, diaryId: null, updatedAt: now })));
  if (!input.outfitId) return;
  const match = await db.wearLog
    .where('date')
    .equals(input.date)
    .filter((w) => w.outfitId === input.outfitId && (w.diaryId === null || w.diaryId === diaryId))
    .first();
  if (match) await db.wearLog.put({ ...match, diaryId, updatedAt: now });
}

/** Crea o aggiorna un ricordo. Le foto tolte dalla voce vengono eliminate. */
export async function saveDiaryEntry(db: ArmadioDB, input: DiaryInput, id: string | null = null): Promise<DiaryRecord> {
  const now = nowIso();
  return db.transaction('rw', [db.diary, db.photos, db.wearLog], async () => {
    const clean: DiaryInput = {
      ...input,
      location: input.location.trim(),
      note: input.note.trim(),
      people: input.people.map((p) => p.trim()).filter(Boolean),
      itemIds: [...new Set(input.itemIds)],
    };
    let entry: DiaryRecord;
    if (id) {
      const existing = await db.diary.get(id);
      if (!existing) throw new Error('Ricordo non trovato');
      const removed = existing.photoIds.filter((p) => !clean.photoIds.includes(p));
      if (removed.length) await db.photos.bulkDelete(removed);
      entry = { ...existing, ...clean, updatedAt: now };
      await db.diary.put(entry);
    } else {
      entry = { id: newId(), ...clean, createdAt: now, updatedAt: now };
      await db.diary.add(entry);
    }
    await linkWearLog(db, entry.id, clean, now);
    return entry;
  });
}

export interface DiaryDeletionSnapshot {
  entry: DiaryRecord;
  photos: PhotoRecord[];
  wearLog: WearLogRecord[];
}

export async function deleteDiaryEntry(db: ArmadioDB, id: string): Promise<DiaryDeletionSnapshot> {
  const now = nowIso();
  return db.transaction('rw', [db.diary, db.photos, db.wearLog], async () => {
    const entry = await db.diary.get(id);
    if (!entry) throw new Error('Ricordo non trovato');
    const photos = (await db.photos.bulkGet(entry.photoIds)).filter((p): p is PhotoRecord => !!p);
    const wearLog = await db.wearLog.filter((w) => w.diaryId === id).toArray();
    await db.wearLog.bulkPut(wearLog.map((w) => ({ ...w, diaryId: null, updatedAt: now })));
    await db.photos.bulkDelete(entry.photoIds);
    await db.diary.delete(id);
    return { entry, photos, wearLog };
  });
}

export async function restoreDiaryEntry(db: ArmadioDB, snap: DiaryDeletionSnapshot): Promise<void> {
  await db.transaction('rw', [db.diary, db.photos, db.wearLog], async () => {
    await db.photos.bulkPut(snap.photos);
    await db.diary.put(snap.entry);
    await db.wearLog.bulkPut(snap.wearLog);
  });
}

/** Foto aggiunte a un ricordo che poi non è stato salvato. */
export async function discardPhotos(db: ArmadioDB, photoIds: string[]): Promise<void> {
  if (photoIds.length) await db.photos.bulkDelete(photoIds);
}
