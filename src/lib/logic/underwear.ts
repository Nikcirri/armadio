import type { ItemRecord } from '../db/types';
import { blockReason } from './outfits';

// Intimo (SPEC 4 e 8): si collega ai capi con cui va e l'app lo propone quando servono quei capi.

export function isUnderwear(item: Pick<ItemRecord, 'slotType'>): boolean {
  return item.slotType === 'underwear';
}

/** L'intimo collegato a un capo, nell'ordine scelto: solo capi che esistono e sono ancora Intimo. */
export function linkedUnderwear(
  item: Pick<ItemRecord, 'underwearIds' | 'slotType'>,
  itemsById: ReadonlyMap<string, ItemRecord>,
): ItemRecord[] {
  if (isUnderwear(item)) return [];
  const out: ItemRecord[] = [];
  for (const id of item.underwearIds ?? []) {
    const u = itemsById.get(id);
    if (u && isUnderwear(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

/** I capi sotto cui va un capo Intimo ("Va sotto a"). */
export function garmentsFor(underwearId: string, items: readonly ItemRecord[]): ItemRecord[] {
  return items
    .filter((i) => !isUnderwear(i) && (i.underwearIds ?? []).includes(underwearId))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export interface UnderwearSuggestion {
  item: ItemRecord;
  /** I capi sotto cui va. */
  forIds: string[];
  forNames: string[];
  /** Perché non si può mettere adesso (null = disponibile). */
  reason: string | null;
}

/**
 * Intimo da proporre per dei capi (es. il reggiseno sotto la maglietta bianca). Si salta un capo se
 * uno dei suoi è già scelto (`chosen`). Tra i collegati si preferisce quello disponibile, poi quello
 * che va bene per più capi insieme (un solo reggiseno per tutto l'outfit), poi quello messo prima
 * nella scheda. Con `preferAvailable = false` la disponibilità non conta: serve alla valigia, dove la
 * scelta non deve cambiare mentre i capi passano "In valigia".
 */
export function suggestUnderwear(
  garments: readonly ItemRecord[],
  itemsById: ReadonlyMap<string, ItemRecord>,
  seasonBoxId: string | null,
  chosen: readonly string[] = [],
  preferAvailable = true,
): UnderwearSuggestion[] {
  let remaining = garments
    .map((g, order) => ({ g, order, linked: linkedUnderwear(g, itemsById) }))
    .filter((x) => x.linked.length > 0 && !x.linked.some((u) => chosen.includes(u.id)));
  const out: UnderwearSuggestion[] = [];
  while (remaining.length) {
    const candidates = [...new Set(remaining.flatMap((x) => x.linked))].map((u) => {
      const covers = remaining.filter((x) => x.linked.includes(u));
      return {
        u,
        covers,
        available: !blockReason(u, seasonBoxId),
        rank: Math.min(...covers.map((x) => x.linked.indexOf(u))),
        first: Math.min(...covers.map((x) => x.order)),
      };
    });
    candidates.sort(
      (a, b) =>
        (preferAvailable ? Number(b.available) - Number(a.available) : 0) ||
        b.covers.length - a.covers.length ||
        a.rank - b.rank ||
        a.first - b.first,
    );
    const best = candidates[0]!;
    out.push({
      item: best.u,
      forIds: best.covers.map((x) => x.g.id),
      forNames: best.covers.map((x) => x.g.name),
      reason: blockReason(best.u, seasonBoxId),
    });
    remaining = remaining.filter((x) => !best.covers.includes(x));
  }
  // Nell'ordine dei capi.
  const firstOrder = (s: UnderwearSuggestion) => garments.findIndex((g) => s.forIds.includes(g.id));
  return out.sort((a, b) => firstOrder(a) - firstOrder(b));
}

/** "Maglietta bianca", "Maglietta bianca e Camicia", "A, B e C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** Nuovi collegamenti quando cambia "Va sotto a" di un capo Intimo: solo i capi che cambiano. */
export function relinkUnderwear(
  underwearId: string,
  garmentIds: readonly string[],
  items: readonly ItemRecord[],
): { id: string; underwearIds: string[] }[] {
  const want = new Set(garmentIds);
  const changes: { id: string; underwearIds: string[] }[] = [];
  for (const i of items) {
    if (i.id === underwearId || isUnderwear(i)) continue;
    const ids = i.underwearIds ?? [];
    const has = ids.includes(underwearId);
    if (want.has(i.id) && !has) changes.push({ id: i.id, underwearIds: [...ids, underwearId] });
    else if (!want.has(i.id) && has) changes.push({ id: i.id, underwearIds: ids.filter((x) => x !== underwearId) });
  }
  return changes;
}
