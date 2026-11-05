import type { OutfitRecord, PlannerRecord, TripRecord } from '../db/types';

/** Toglie un capo da un outfit e lo segna come incompleto. Restituisce null se il capo non c'era. */
export function removeItemFromOutfit(outfit: OutfitRecord, itemId: string, now: string): OutfitRecord | null {
  if (!outfit.itemIds.includes(itemId)) return null;
  return {
    ...outfit,
    itemIds: outfit.itemIds.filter((id) => id !== itemId),
    layout: outfit.layout.filter((l) => l.itemId !== itemId),
    incomplete: true,
    updatedAt: now,
  };
}

/** Toglie un capo da tutte le liste di un viaggio. Restituisce null se il capo non c'era. */
export function removeItemFromTrip(trip: TripRecord, itemId: string, now: string): TripRecord | null {
  const used =
    trip.extraItemIds.includes(itemId) ||
    trip.wearInTransitIds.includes(itemId) ||
    trip.packedItemIds.includes(itemId);
  if (!used) return null;
  const without = (ids: string[]) => ids.filter((id) => id !== itemId);
  return {
    ...trip,
    extraItemIds: without(trip.extraItemIds),
    wearInTransitIds: without(trip.wearInTransitIds),
    packedItemIds: without(trip.packedItemIds),
    updatedAt: now,
  };
}

/** Toglie un capo da un giorno dell'agenda. Restituisce null se il capo non c'era. */
export function removeItemFromPlanner(day: PlannerRecord, itemId: string, now: string): PlannerRecord | null {
  if (!day.itemIds.includes(itemId)) return null;
  return { ...day, itemIds: day.itemIds.filter((id) => id !== itemId), updatedAt: now };
}

/** Riepilogo leggibile di dove è usato un capo, per il dialogo di conferma. */
export function describeUsage(usage: { outfits: number; trips: number; plannerDays: number }): string {
  const parts: string[] = [];
  if (usage.outfits) parts.push(usage.outfits === 1 ? '1 outfit' : `${usage.outfits} outfit`);
  if (usage.trips) parts.push(usage.trips === 1 ? '1 viaggio' : `${usage.trips} viaggi`);
  if (usage.plannerDays) parts.push(usage.plannerDays === 1 ? '1 giorno in agenda' : `${usage.plannerDays} giorni in agenda`);
  if (!parts.length) return 'Non è usato in outfit, viaggi o agenda.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
  return `È usato in ${list}: verrà tolto da lì. Lo storico di quando l’hai indossato resta.`;
}

/** Nuovo ordine dopo aver spostato un elemento su o giù di una posizione. */
export function moveInOrder<T extends { id: string; order: number }>(
  records: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const sorted = [...records].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((r) => r.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return sorted;
  const a = sorted[index]!;
  const b = sorted[target]!;
  sorted[index] = b;
  sorted[target] = a;
  return sorted.map((r, i) => (r.order === i ? r : { ...r, order: i }));
}

/**
 * Sposta un elemento su o giù tra quelli dello stesso gruppo (es. stesso slot),
 * scambiando i due valori di `order`. Restituisce solo i record cambiati.
 */
export function swapWithinGroup<T extends { id: string; order: number }>(
  records: readonly T[],
  id: string,
  direction: -1 | 1,
  sameGroup: (a: T, b: T) => boolean,
): T[] {
  const target = records.find((r) => r.id === id);
  if (!target) return [];
  const group = records.filter((r) => sameGroup(r, target)).sort((a, b) => a.order - b.order);
  const index = group.findIndex((r) => r.id === id);
  const other = group[index + direction];
  if (!other) return [];
  return [
    { ...target, order: other.order },
    { ...other, order: target.order },
  ];
}
