import type { ItemRecord, WearLogRecord } from '../db/types';

/** Contatori del capo ricalcolati dallo storico (fonte di verità: wearLog). */
export function countersFromLog(itemId: string, log: readonly WearLogRecord[]): Pick<ItemRecord, 'wearCount' | 'lastWornDate'> {
  let wearCount = 0;
  let lastWornDate: string | null = null;
  for (const e of log) {
    if (!e.itemIds.includes(itemId)) continue;
    wearCount += 1;
    if (!lastWornDate || e.date > lastWornDate) lastWornDate = e.date;
  }
  return { wearCount, lastWornDate };
}

/** Voce dello storico da togliere con il tasto "−": la più recente che contiene il capo. */
export function latestEntryFor(itemId: string, log: readonly WearLogRecord[]): WearLogRecord | null {
  let best: WearLogRecord | null = null;
  for (const e of log) {
    if (!e.itemIds.includes(itemId)) continue;
    if (!best || e.date > best.date || (e.date === best.date && e.createdAt > best.createdAt)) best = e;
  }
  return best;
}

/** Toglie un capo da una voce dello storico (la voce sparisce se resta vuota). */
export function withoutItem(entry: WearLogRecord, itemId: string, now: string): WearLogRecord | null {
  const index = entry.itemIds.indexOf(itemId);
  if (index < 0) return entry;
  const itemIds = entry.itemIds.filter((_, i) => i !== index);
  if (itemIds.length === 0) return null;
  return { ...entry, itemIds, itemNames: entry.itemNames.filter((_, i) => i !== index), updatedAt: now };
}
