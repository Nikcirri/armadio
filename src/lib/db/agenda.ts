import type { ArmadioDB } from './schema';
import type { EssentialTemplateEntry, ItemRecord, ListRecord, LuggageType, PlannerRecord, TripRecord } from './types';
import { isPlanEmpty, refreshEssentials } from '../logic/agenda';
import { createTrip } from '../logic/factories';
import { withStatus } from '../logic/items';
import { buildEssentials, tripDays } from '../logic/packing';
import { newId, nowIso } from '../logic/util';

// Agenda e valigia (SPEC.md, sezione 8.4).

// ---------- Giorni dell'agenda ----------

export interface PlanInput {
  outfitId: string | null;
  itemIds: string[];
  note: string;
}

/** Pianifica un giorno (outfit o capi e nota). Un giorno vuoto viene tolto. Restituisce com'era prima. */
export async function setPlan(db: ArmadioDB, date: string, input: PlanInput): Promise<PlannerRecord | null> {
  const now = nowIso();
  return db.transaction('rw', db.planner, async () => {
    const before = (await db.planner.get(date)) ?? null;
    const next: PlannerRecord = {
      date,
      outfitId: input.outfitId,
      itemIds: [...new Set(input.itemIds)],
      note: input.note.trim(),
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
    };
    if (isPlanEmpty(next)) await db.planner.delete(date);
    else await db.planner.put(next);
    return before;
  });
}

/** Annulla: rimette il giorno com'era (o lo toglie se prima era vuoto). */
export async function restorePlan(db: ArmadioDB, date: string, before: PlannerRecord | null): Promise<void> {
  if (before) await db.planner.put(before);
  else await db.planner.delete(date);
}

// ---------- Viaggi ----------

export interface TripInput {
  name: string;
  startDate: string;
  endDate: string;
  luggageType: LuggageType;
  templateId: string | null;
  weather: string;
}

async function templateEssentials(db: ArmadioDB, templateId: string | null): Promise<EssentialTemplateEntry[]> {
  if (!templateId) return [];
  const t = await db.lists.get(templateId);
  return t?.kind === 'packingTemplate' ? (t.extra.essentials ?? []) : [];
}

function cleanTrip(input: TripInput): TripInput {
  const name = input.name.trim() || 'Viaggio';
  const [startDate, endDate] = input.endDate < input.startDate ? [input.endDate, input.startDate] : [input.startDate, input.endDate];
  return { ...input, name, startDate, endDate, weather: input.weather.trim() };
}

/** Nuovo viaggio con il necessaire del template, già con le quantità per i giorni. */
export async function addTrip(db: ArmadioDB, input: TripInput): Promise<TripRecord> {
  const now = nowIso();
  return db.transaction('rw', db.trips, db.lists, async () => {
    const t = cleanTrip(input);
    const essentials = await templateEssentials(db, t.templateId);
    const trip = createTrip({ ...t, checklist: buildEssentials(essentials, tripDays(t.startDate, t.endDate)) }, now);
    await db.trips.add(trip);
    return trip;
  });
}

/**
 * Modifica i dati del viaggio. Con date diverse si ricalcolano le quantità del template;
 * con un template diverso il necessaire riparte da quello nuovo (le voci spuntate restano spuntate).
 */
export async function updateTrip(db: ArmadioDB, id: string, input: TripInput): Promise<TripRecord> {
  const now = nowIso();
  return db.transaction('rw', db.trips, db.lists, async () => {
    const trip = await db.trips.get(id);
    if (!trip) throw new Error('Viaggio non trovato');
    const t = cleanTrip(input);
    const days = tripDays(t.startDate, t.endDate);
    let checklist = trip.checklist;
    if (t.templateId !== trip.templateId) {
      const fresh = buildEssentials(await templateEssentials(db, t.templateId), days);
      checklist = fresh.map((e) => ({ ...e, checked: trip.checklist.some((c) => c.checked && c.label.toLowerCase() === e.label.toLowerCase()) }));
    } else if (days !== tripDays(trip.startDate, trip.endDate)) {
      checklist = refreshEssentials(trip.checklist, await templateEssentials(db, t.templateId), days);
    }
    const next: TripRecord = { ...trip, ...t, checklist, updatedAt: now };
    await db.trips.put(next);
    return next;
  });
}

export async function patchTrip(
  db: ArmadioDB,
  id: string,
  patch: Partial<Pick<TripRecord, 'outfitIds' | 'extraItemIds' | 'wearInTransitIds' | 'checklist' | 'status'>>,
): Promise<void> {
  const n = await db.trips.update(id, { ...patch, updatedAt: nowIso() });
  if (!n) throw new Error('Viaggio non trovato');
}

/** Spunta nella lista: il capo va "In valigia"; togliendo la spunta torna Pulito (gli utilizzi restano). */
export async function setPacked(db: ArmadioDB, tripId: string, itemId: string, packed: boolean): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.trips, db.items, async () => {
    const trip = await db.trips.get(tripId);
    const item = await db.items.get(itemId);
    if (!trip || !item) throw new Error('Capo o viaggio non trovato');
    const ids = trip.packedItemIds.filter((x) => x !== itemId);
    if (packed) {
      ids.push(itemId);
      await db.items.put(withStatus(item, 'packed', now));
    } else if (item.status === 'packed') {
      await db.items.put({ ...item, status: 'clean', updatedAt: now });
    }
    await db.trips.put({ ...trip, packedItemIds: ids, updatedAt: now });
  });
}

export async function setInTransit(db: ArmadioDB, tripId: string, itemId: string, on: boolean): Promise<void> {
  await db.transaction('rw', db.trips, async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error('Viaggio non trovato');
    const ids = trip.wearInTransitIds.filter((x) => x !== itemId);
    if (on) ids.push(itemId);
    await db.trips.put({ ...trip, wearInTransitIds: ids, updatedAt: nowIso() });
  });
}

export interface TripSnapshot {
  trip: TripRecord;
  items: ItemRecord[];
}

/** Elimina il viaggio: i giorni dell'agenda restano, i capi ancora in valigia tornano Puliti. */
export async function deleteTrip(db: ArmadioDB, id: string): Promise<TripSnapshot> {
  const now = nowIso();
  return db.transaction('rw', db.trips, db.items, async () => {
    const trip = await db.trips.get(id);
    if (!trip) throw new Error('Viaggio non trovato');
    const items = (await db.items.bulkGet(trip.packedItemIds)).filter((i): i is ItemRecord => !!i && i.status === 'packed');
    await db.items.bulkPut(items.map((i) => ({ ...i, status: 'clean' as const, updatedAt: now })));
    await db.trips.delete(id);
    return { trip, items };
  });
}

export async function restoreTrip(db: ArmadioDB, snap: TripSnapshot): Promise<void> {
  await db.transaction('rw', db.trips, db.items, async () => {
    await db.trips.put(snap.trip);
    await db.items.bulkPut(snap.items);
  });
}

/** "Disfa valigia": ogni capo va Da lavare o Pulito in un solo passaggio, e il viaggio si chiude. */
export async function unpackTrip(db: ArmadioDB, id: string, decisions: Record<string, 'toWash' | 'clean'>): Promise<TripSnapshot> {
  const now = nowIso();
  return db.transaction('rw', db.trips, db.items, async () => {
    const trip = await db.trips.get(id);
    if (!trip) throw new Error('Viaggio non trovato');
    const items = (await db.items.bulkGet(Object.keys(decisions))).filter((i): i is ItemRecord => !!i);
    await db.items.bulkPut(items.map((i) => withStatus(i, decisions[i.id] ?? 'clean', now)));
    await db.trips.put({ ...trip, status: 'done', updatedAt: now });
    return { trip, items };
  });
}

// ---------- Template della valigia ----------

export interface TemplateInput {
  name: string;
  essentials: EssentialTemplateEntry[];
}

export async function saveTemplate(db: ArmadioDB, input: TemplateInput, id: string | null = null): Promise<ListRecord> {
  const now = nowIso();
  const essentials = input.essentials
    .filter((e) => e.label.trim())
    .map((e) => ({ label: e.label.trim(), rule: e.rule, qty: Math.max(1, Math.round(e.qty)) }));
  const name = input.name.trim() || 'Template';
  return db.transaction('rw', db.lists, async () => {
    if (id) {
      const existing = await db.lists.get(id);
      if (!existing || existing.kind !== 'packingTemplate') throw new Error('Template non trovato');
      const updated: ListRecord = { ...existing, name, extra: { ...existing.extra, essentials }, updatedAt: now };
      await db.lists.put(updated);
      return updated;
    }
    const all = await db.lists.where('kind').equals('packingTemplate').toArray();
    const created: ListRecord = {
      id: newId(),
      kind: 'packingTemplate',
      name,
      order: all.reduce((m, l) => Math.max(m, l.order), -1) + 1,
      extra: { essentials },
      createdAt: now,
      updatedAt: now,
    };
    await db.lists.add(created);
    return created;
  });
}

export async function deleteTemplate(db: ArmadioDB, id: string): Promise<ListRecord> {
  return db.transaction('rw', db.lists, async () => {
    const t = await db.lists.get(id);
    if (!t || t.kind !== 'packingTemplate') throw new Error('Template non trovato');
    await db.lists.delete(id);
    return t;
  });
}

export async function restoreTemplate(db: ArmadioDB, t: ListRecord): Promise<void> {
  await db.lists.put(t);
}

