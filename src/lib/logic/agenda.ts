import type {
  CategoryRecord,
  ChecklistEntry,
  EssentialTemplateEntry,
  ItemRecord,
  LuggageType,
  OutfitRecord,
  PlannerRecord,
  SlotType,
  TripRecord,
  WearLogRecord,
} from '../db/types';
import { blockReason } from './outfits';
import { essentialQty, tripDays } from './packing';
import { isUnderwear, joinNames, linkedUnderwear, suggestUnderwear } from './underwear';
import { addDays, daysBetween, fromDateKey, newId, toDateKey } from './util';

// Agenda e valigia (SPEC.md, sezione 8.4).

// ---------- Calendario ----------

const WEEKDAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Lunedì della settimana che contiene la data. */
export function weekStart(date: string): string {
  const day = fromDateKey(date).getDay();
  return addDays(date, -((day + 6) % 7));
}

/** I 7 giorni (da lunedì a domenica) della settimana che contiene la data. */
export function weekDays(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y ?? 1970, (m ?? 1) - 1 + n, 1, 12);
  return toDateKey(d).slice(0, 7);
}

export interface MonthCell {
  date: string;
  inMonth: boolean;
}

/** Settimane (da lunedì) che coprono il mese, comprese le code dei mesi vicini. */
export function monthGrid(monthKey: string): MonthCell[][] {
  const first = `${monthKey}-01`;
  const last = addDays(`${addMonths(monthKey, 1)}-01`, -1);
  const rows: MonthCell[][] = [];
  let cursor = weekStart(first);
  while (cursor <= last) {
    rows.push(weekDays(cursor).map((date) => ({ date, inMonth: date.startsWith(monthKey) })));
    cursor = addDays(cursor, 7);
  }
  return rows;
}

export function monthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const name = MONTHS[(m ?? 1) - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** "venerdì 6 novembre" (con l'anno se diverso da quello di oggi). */
export function dayTitle(date: string, today: string): string {
  const d = fromDateKey(date);
  const base = `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}

/** "Oggi", "Ieri", "Domani" o null. */
export function relativeDay(date: string, today: string): string | null {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Oggi';
  if (diff === -1) return 'Ieri';
  if (diff === 1) return 'Domani';
  return null;
}

/** "13–15 nov" oppure "30 nov – 2 dic". */
export function rangeLabel(start: string, end: string): string {
  const a = fromDateKey(start);
  const b = fromDateKey(end);
  const short = (d: Date) => (MONTHS[d.getMonth()] ?? '').slice(0, 3);
  if (start === end) return `${a.getDate()} ${short(a)}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${short(a)}`;
  return `${a.getDate()} ${short(a)} – ${b.getDate()} ${short(b)}`;
}

// ---------- Giorni: indossato e pianificato ----------

/** Capi pianificati per un giorno: quelli dell'outfit più quelli scelti a parte. */
export function planItemIds(plan: Pick<PlannerRecord, 'outfitId' | 'itemIds'> | undefined, outfitsById: ReadonlyMap<string, OutfitRecord>): string[] {
  if (!plan) return [];
  const outfit = plan.outfitId ? outfitsById.get(plan.outfitId) : undefined;
  const ids = [...(outfit?.itemIds ?? [])];
  for (const id of plan.itemIds) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function isPlanEmpty(plan: Pick<PlannerRecord, 'outfitId' | 'itemIds' | 'note'>): boolean {
  return !plan.outfitId && plan.itemIds.length === 0 && !plan.note.trim();
}

export interface PlanWarning {
  id: string;
  name: string;
  reason: string;
}

/** Badge giallo: capi pianificati che non sono puliti o sono macchiati. */
export function planWarnings(itemIds: readonly string[], itemsById: ReadonlyMap<string, ItemRecord>): PlanWarning[] {
  const out: PlanWarning[] = [];
  for (const id of itemIds) {
    const item = itemsById.get(id);
    if (!item) continue;
    const reason = item.status === 'clean' ? (item.hasStain ? 'macchiato' : null) : blockReason(item, null);
    if (reason) out.push({ id, name: item.name, reason });
  }
  return out;
}

export function wearsOn(date: string, log: readonly WearLogRecord[]): WearLogRecord[] {
  return log.filter((e) => e.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function tripsOn(date: string, trips: readonly TripRecord[]): TripRecord[] {
  return trips.filter((t) => t.startDate <= date && date <= t.endDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Pezzo di fascia del viaggio in quel giorno, per disegnarla nel calendario. */
export function bandPart(date: string, trip: Pick<TripRecord, 'startDate' | 'endDate'>): 'single' | 'start' | 'middle' | 'end' {
  if (trip.startDate === trip.endDate) return 'single';
  if (date === trip.startDate) return 'start';
  if (date === trip.endDate) return 'end';
  return 'middle';
}

// ---------- Viaggi ----------

export const LUGGAGE: readonly { id: LuggageType; label: string; points: number; emoji: string }[] = [
  { id: 'underseat', label: 'Zaino sotto il sedile', points: 12, emoji: '🎒' },
  { id: 'cabin', label: 'Trolley cabina', points: 25, emoji: '🧳' },
  { id: 'checked', label: 'Valigia grande', points: 50, emoji: '🛄' },
];

export function luggageInfo(type: LuggageType) {
  return LUGGAGE.find((l) => l.id === type) ?? LUGGAGE[1]!;
}

export function tripDateList(trip: Pick<TripRecord, 'startDate' | 'endDate'>): string[] {
  const n = tripDays(trip.startDate, trip.endDate);
  return Array.from({ length: n }, (_, i) => addDays(trip.startDate, i));
}

export interface Look {
  /** Il giorno (se viene dall'agenda) o null per un outfit da portare senza giorno. */
  date: string | null;
  outfitId: string | null;
  itemIds: string[];
}

/** Un look per ogni giorno pianificato del viaggio, più gli outfit da portare senza un giorno. */
export function tripLooks(
  trip: Pick<TripRecord, 'startDate' | 'endDate' | 'outfitIds'>,
  plannerByDate: ReadonlyMap<string, PlannerRecord>,
  outfitsById: ReadonlyMap<string, OutfitRecord>,
): Look[] {
  const looks: Look[] = [];
  for (const date of tripDateList(trip)) {
    const plan = plannerByDate.get(date);
    const itemIds = planItemIds(plan, outfitsById);
    if (plan && itemIds.length) looks.push({ date, outfitId: plan.outfitId, itemIds });
  }
  for (const id of trip.outfitIds) {
    const outfit = outfitsById.get(id);
    if (outfit) looks.push({ date: null, outfitId: id, itemIds: [...outfit.itemIds] });
  }
  return looks;
}

export interface PackingEntry {
  itemId: string;
  /** In quanti look serve. */
  looks: number;
  /** Aggiunto a mano come capo extra. */
  extra: boolean;
  inTransit: boolean;
  packed: boolean;
  /** Per l'intimo: i capi del viaggio sotto cui va. */
  under: string[];
}

const SLOT_ORDER: readonly SlotType[] = ['outerwear', 'top_layer', 'top_base', 'full_body', 'bottom', 'shoes', 'accessory', 'underwear'];

/**
 * Lista unica dei capi del viaggio, senza doppioni ("Jeans blu — 3 look"). L'intimo collegato ai
 * capi entra da solo: il primo di ogni capo, se nella lista non ce n'è già uno (SPEC 8.4).
 */
export function packingList(
  trip: Pick<TripRecord, 'extraItemIds' | 'wearInTransitIds' | 'packedItemIds'>,
  looks: readonly Look[],
  itemsById: ReadonlyMap<string, ItemRecord>,
): PackingEntry[] {
  const map = new Map<string, PackingEntry>();
  const entry = (itemId: string) => {
    let e = map.get(itemId);
    if (!e) {
      e = {
        itemId,
        looks: 0,
        extra: false,
        inTransit: trip.wearInTransitIds.includes(itemId),
        packed: trip.packedItemIds.includes(itemId),
        under: [],
      };
      map.set(itemId, e);
    }
    return e;
  };
  for (const look of looks) for (const id of new Set(look.itemIds)) if (itemsById.has(id)) entry(id).looks += 1;
  for (const id of trip.extraItemIds) if (itemsById.has(id)) entry(id).extra = true;
  for (const id of trip.packedItemIds) if (itemsById.has(id)) entry(id);
  const garments = [...map.keys()].map((id) => itemsById.get(id)!).filter((i) => !isUnderwear(i));
  for (const s of suggestUnderwear(garments, itemsById, null, [...map.keys()], false)) entry(s.item.id);
  for (const e of map.values()) {
    const item = itemsById.get(e.itemId)!;
    if (isUnderwear(item)) e.under = garments.filter((g) => linkedUnderwear(g, itemsById).includes(item)).map((g) => g.name);
  }
  const rank = (id: string) => SLOT_ORDER.indexOf(itemsById.get(id)!.slotType);
  return [...map.values()].sort(
    (a, b) => rank(a.itemId) - rank(b.itemId) || itemsById.get(a.itemId)!.name.localeCompare(itemsById.get(b.itemId)!.name, 'it'),
  );
}

export function looksLabel(e: Pick<PackingEntry, 'looks' | 'extra'> & { under?: readonly string[] }): string {
  if (e.looks === 0) return !e.extra && e.under?.length ? `sotto ${joinNames(e.under)}` : 'extra';
  return e.looks === 1 ? '1 look' : `${e.looks} look`;
}

export interface Fill {
  points: number;
  capacity: number;
  /** 0-100 (oltre 100 la barra resta piena). */
  percent: number;
  over: boolean;
}

/** Riempimento del bagaglio: punti dei capi unici, senza quelli indossati in viaggio. */
export function luggageFill(
  list: readonly PackingEntry[],
  itemsById: ReadonlyMap<string, ItemRecord>,
  categoriesById: ReadonlyMap<string, Pick<CategoryRecord, 'bulkWeight'>>,
  type: LuggageType,
): Fill {
  let points = 0;
  for (const e of list) {
    if (e.inTransit) continue;
    const item = itemsById.get(e.itemId);
    if (item) points += categoriesById.get(item.categoryId)?.bulkWeight ?? 1;
  }
  const capacity = luggageInfo(type).points;
  return { points, capacity, percent: Math.min(100, Math.round((points / capacity) * 100)), over: points > capacity };
}

/** Allarme pre-partenza: capi del viaggio non ancora pronti (da lavare, in prestito…). */
export function departureAlarms(list: readonly PackingEntry[], itemsById: ReadonlyMap<string, ItemRecord>): PlanWarning[] {
  const out: PlanWarning[] = [];
  for (const e of list) {
    const item = itemsById.get(e.itemId);
    if (!item || item.status === 'clean' || item.status === 'packed') continue;
    out.push({ id: item.id, name: item.name, reason: blockReason(item, null) ?? '' });
  }
  return out;
}

/** Note intimo dei capi scelti, da mettere in evidenza nella checklist. */
export function intimateReminders(list: readonly PackingEntry[], itemsById: ReadonlyMap<string, ItemRecord>): string[] {
  const out: string[] = [];
  for (const e of list) {
    const item = itemsById.get(e.itemId);
    const note = item?.intimateNote.trim();
    if (item && note) out.push(`${item.name}: ${note}`);
  }
  return out;
}

// ---------- Necessaire e template ----------

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Cambiate le date: ricalcola le quantità delle voci che vengono dal template (le altre restano). */
export function refreshEssentials(
  checklist: readonly ChecklistEntry[],
  template: readonly EssentialTemplateEntry[],
  days: number,
): ChecklistEntry[] {
  return checklist.map((c) => {
    const t = template.find((x) => sameLabel(x.label, c.label));
    return t ? { ...c, qty: essentialQty(t, days) } : { ...c };
  });
}

/** Template dal necessaire di un viaggio: le voci note tengono la regola, le nuove hanno quantità fissa. */
export function templateFromChecklist(
  checklist: readonly ChecklistEntry[],
  base: readonly EssentialTemplateEntry[],
): EssentialTemplateEntry[] {
  return checklist
    .filter((c) => c.label.trim())
    .map((c) => {
      const known = base.find((x) => sameLabel(x.label, c.label));
      return known ? { ...known, label: c.label.trim() } : { label: c.label.trim(), rule: 'fixed' as const, qty: Math.max(1, c.qty) };
    });
}

export function newChecklistEntry(label: string, qty = 1): ChecklistEntry {
  return { id: newId(), label: label.trim(), qty: Math.max(1, Math.round(qty)), checked: false };
}

export const ESSENTIAL_RULES: readonly { id: EssentialTemplateEntry['rule']; label: string }[] = [
  { id: 'perDayPlusOne', label: 'Giorni + 1' },
  { id: 'perDay', label: 'Uno al giorno' },
  { id: 'fixed', label: 'Quantità fissa' },
];

export function ruleText(e: EssentialTemplateEntry): string {
  switch (e.rule) {
    case 'perDayPlusOne':
      return e.qty === 1 ? 'giorni + 1' : `${e.qty} al giorno + 1`;
    case 'perDay':
      return e.qty === 1 ? 'uno al giorno' : `${e.qty} al giorno`;
    case 'fixed':
      return e.qty === 1 ? '1' : `${e.qty}`;
  }
}

// ---------- Stato del viaggio ----------

export type TripPhase = 'planning' | 'packed' | 'travelling' | 'toUnpack' | 'done';

export function tripPhase(trip: Pick<TripRecord, 'status' | 'startDate' | 'endDate'>, today: string): TripPhase {
  if (trip.status === 'done') return 'done';
  if (today > trip.endDate) return 'toUnpack';
  if (today >= trip.startDate) return 'travelling';
  return trip.status === 'packed' || trip.status === 'travelling' ? 'packed' : 'planning';
}

export const PHASE_LABELS: Record<TripPhase, string> = {
  planning: 'Da preparare',
  packed: 'Valigia pronta',
  travelling: 'In viaggio',
  toUnpack: 'Da disfare',
  done: 'Concluso',
};

/** In programma (dal più vicino) e poi passati (dal più recente). */
export function sortTrips(trips: readonly TripRecord[], today: string): { upcoming: TripRecord[]; past: TripRecord[] } {
  const isPast = (t: TripRecord) => tripPhase(t, today) === 'done';
  return {
    upcoming: trips.filter((t) => !isPast(t)).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    past: trips.filter(isPast).sort((a, b) => b.startDate.localeCompare(a.startDate)),
  };
}

/** Giorni che mancano alla partenza ("tra 3 giorni"), null se è già partito. */
export function countdown(trip: Pick<TripRecord, 'startDate'>, today: string): string | null {
  const d = daysBetween(today, trip.startDate);
  if (d < 0) return null;
  if (d === 0) return 'si parte oggi';
  if (d === 1) return 'si parte domani';
  return `tra ${d} giorni`;
}

// ---------- Disfa valigia ----------

/** Capi da mostrare in "Disfa valigia": in valigia, puliti o da lavare (non quelli in prestito o in manutenzione). */
export function unpackCandidates(list: readonly PackingEntry[], itemsById: ReadonlyMap<string, ItemRecord>): string[] {
  return list
    .map((e) => e.itemId)
    .filter((id) => {
      const s = itemsById.get(id)?.status;
      return s === 'packed' || s === 'clean' || s === 'toWash';
    });
}

/**
 * Proposta per ogni capo in valigia: Da lavare se risulta indossato (storico durante il viaggio
 * o pianificato per un giorno del viaggio già passato) o se era già da lavare, altrimenti Pulito.
 */
export function unpackDefaults(
  trip: Pick<TripRecord, 'startDate' | 'endDate'>,
  itemIds: readonly string[],
  log: readonly Pick<WearLogRecord, 'date' | 'itemIds'>[],
  plannerByDate: ReadonlyMap<string, PlannerRecord>,
  outfitsById: ReadonlyMap<string, OutfitRecord>,
  today: string,
  itemsById: ReadonlyMap<string, Pick<ItemRecord, 'status'>> = new Map(),
): Record<string, 'toWash' | 'clean'> {
  const worn = new Set<string>();
  for (const e of log) if (e.date >= trip.startDate && e.date <= trip.endDate) for (const id of e.itemIds) worn.add(id);
  for (const date of tripDateList(trip)) {
    if (date > today) continue;
    for (const id of planItemIds(plannerByDate.get(date), outfitsById)) worn.add(id);
  }
  return Object.fromEntries(itemIds.map((id) => [id, worn.has(id) || itemsById.get(id)?.status === 'toWash' ? 'toWash' : 'clean']));
}

/** Date proposte per un nuovo viaggio: da domani, per 3 giorni. */
export function defaultTripDates(today: string): { startDate: string; endDate: string } {
  const startDate = addDays(today, 1);
  return { startDate, endDate: addDays(startDate, 2) };
}
