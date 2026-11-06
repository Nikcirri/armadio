import type { ItemRecord } from '../db/types';
import { costPerWear } from './items';
import { daysBetween } from './util';

// Decluttering (SPEC.md, sezione 8.5).

export const UNWORN_DAYS = 365;
export const HIGH_CPW_MIN = 15;
export const RESALE_ESTIMATE = 0.3;

/** Da quando non lo usi: l'ultima volta indossato, o la data di acquisto o di inserimento. */
export function lastUseDate(item: Pick<ItemRecord, 'lastWornDate' | 'purchaseDate' | 'createdAt'>): string {
  return item.lastWornDate ?? item.purchaseDate ?? item.createdAt.slice(0, 10);
}

/** Non indossati da 12 mesi (i più vecchi prima). */
export function unwornForAYear(items: readonly ItemRecord[], today: string): ItemRecord[] {
  return items
    .filter((i) => i.status !== 'forSale' && daysBetween(lastUseDate(i), today) >= UNWORN_DAYS)
    .sort((a, b) => lastUseDate(a).localeCompare(lastUseDate(b)));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Costo per utilizzo alto: almeno 15 € e almeno il triplo della mediana dei capi indossati. */
export function highCostPerWear(items: readonly ItemRecord[]): { item: ItemRecord; cpw: number }[] {
  const worn = items
    .map((item) => ({ item, cpw: costPerWear(item) }))
    .filter((x): x is { item: ItemRecord; cpw: number } => x.cpw !== null);
  const limit = Math.max(HIGH_CPW_MIN, 3 * median(worn.map((x) => x.cpw)));
  return worn.filter((x) => x.item.status !== 'forSale' && x.cpw >= limit).sort((a, b) => b.cpw - a.cpw);
}

export interface Resale {
  value: number | null;
  /** Il valore è una stima (30% del prezzo pagato), non un prezzo deciso. */
  estimated: boolean;
}

export function resaleOf(item: Pick<ItemRecord, 'resalePrice' | 'price'>): Resale {
  if (item.resalePrice !== null) return { value: item.resalePrice, estimated: false };
  if (item.price !== null) return { value: Math.round(item.price * RESALE_ESTIMATE), estimated: true };
  return { value: null, estimated: false };
}

/** Ricavo stimato dei capi da vendere. */
export function estimatedRevenue(items: readonly ItemRecord[]): { total: number; estimated: number; missing: number } {
  let total = 0;
  let estimated = 0;
  let missing = 0;
  for (const i of items) {
    if (i.status !== 'forSale') continue;
    const r = resaleOf(i);
    if (r.value === null) missing += 1;
    else {
      total += r.value;
      if (r.estimated) estimated += 1;
    }
  }
  return { total: Math.round(total * 100) / 100, estimated, missing };
}

/** "da 14 mesi", "da più di 2 anni". */
export function unusedFor(item: Pick<ItemRecord, 'lastWornDate' | 'purchaseDate' | 'createdAt'>, today: string): string {
  const days = daysBetween(lastUseDate(item), today);
  const months = Math.floor(days / 30.4);
  if (months >= 24) return `da più di ${Math.floor(months / 12)} anni`;
  return `da ${months} mesi`;
}
