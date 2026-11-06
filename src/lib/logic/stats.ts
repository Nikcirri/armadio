import type { ItemRecord } from '../db/types';
import { costPerWear } from './items';
import { lastUseDate } from './declutter';
import { occasionsCompatible } from './generator';
import { daysBetween } from './util';

// Statistiche (SPEC.md, sezione 8.5).

export const RECENT_WEAR_DAYS = 90;
export const FORGOTTEN_STATS_DAYS = 30;
export const CAPSULE_LIMIT = 10_000;

/** I capi senza proprietario contano come "Mio". */
export function isMine(item: Pick<ItemRecord, 'ownerId'>, mineId: string | null): boolean {
  return item.ownerId === null || item.ownerId === mineId;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function wardrobeValue(items: readonly ItemRecord[], mineId: string | null): number {
  return round2(items.filter((i) => isMine(i, mineId)).reduce((s, i) => s + (i.price ?? 0), 0));
}

/** Spesa per anno di acquisto (dal più recente); i capi senza data non contano. */
export function spendByYear(items: readonly ItemRecord[], mineId: string | null): { year: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const i of items) {
    if (!isMine(i, mineId) || i.price === null || !i.purchaseDate) continue;
    const year = i.purchaseDate.slice(0, 4);
    const cur = map.get(year) ?? { total: 0, count: 0 };
    cur.total += i.price;
    cur.count += 1;
    map.set(year, cur);
  }
  return [...map.entries()].map(([year, v]) => ({ year, total: round2(v.total), count: v.count })).sort((a, b) => b.year.localeCompare(a.year));
}

/** Media del costo per utilizzo dei capi "Mio" con prezzo e almeno un utilizzo. */
export function averageCostPerWear(items: readonly ItemRecord[], mineId: string | null): number | null {
  const values = items.filter((i) => isMine(i, mineId)).map(costPerWear).filter((v): v is number => v !== null);
  return values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Percentuale di capi (non da vendere) indossati negli ultimi 90 giorni. */
export function wornRecentlyShare(items: readonly ItemRecord[], today: string): number | null {
  const pool = items.filter((i) => i.status !== 'forSale');
  if (!pool.length) return null;
  const worn = pool.filter((i) => i.lastWornDate && daysBetween(i.lastWornDate, today) < RECENT_WEAR_DAYS).length;
  return Math.round((worn / pool.length) * 100);
}

export function topWorn(items: readonly ItemRecord[], n = 5): ItemRecord[] {
  return items
    .filter((i) => i.wearCount > 0)
    .sort((a, b) => b.wearCount - a.wearCount || a.name.localeCompare(b.name, 'it'))
    .slice(0, n);
}

/** Migliori investimenti: costo per utilizzo più basso. */
export function bestInvestments(items: readonly ItemRecord[], mineId: string | null, n = 5): { item: ItemRecord; cpw: number }[] {
  return items
    .filter((i) => isMine(i, mineId))
    .map((item) => ({ item, cpw: costPerWear(item) }))
    .filter((x): x is { item: ItemRecord; cpw: number } => x.cpw !== null)
    .sort((a, b) => a.cpw - b.cpw || b.item.wearCount - a.item.wearCount)
    .slice(0, n);
}

/** Dimenticati: non indossati da almeno 30 giorni (i più vecchi prima). */
export function forgottenItems(items: readonly ItemRecord[], today: string, n = 10): ItemRecord[] {
  return items
    .filter((i) => i.status !== 'forSale' && daysBetween(lastUseDate(i), today) >= FORGOTTEN_STATS_DAYS)
    .sort((a, b) => lastUseDate(a).localeCompare(lastUseDate(b)))
    .slice(0, n);
}

export interface Share {
  key: string;
  label: string;
  count: number;
  /** 0-100 */
  percent: number;
}

/** Distribuzione dei capi per una chiave (colore, categoria, stato, posizione), dalla più frequente. */
export function distribution<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  labelOf: (key: string) => string,
): Share[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(keyOf(i), (counts.get(keyOf(i)) ?? 0) + 1);
  const total = items.length || 1;
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: labelOf(key), count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'it'));
}

// ---------- Capsule score ----------

export type CapsuleItem = Pick<ItemRecord, 'id' | 'slotType' | 'occasions' | 'status'>;

export interface CapsuleResult {
  count: number;
  /** Ha superato il limite: si mostra "oltre 10.000". */
  capped: boolean;
}

/**
 * Quanti outfit validi si possono fare (regole del generatore senza meteo): Spezzato
 * (sopra + sotto, strato e capospalla facoltativi) o Intero, sempre con le scarpe;
 * vale la regola delle occasioni incompatibili. Si ferma oltre il limite.
 */
export function capsuleScore(
  items: readonly CapsuleItem[],
  matrix: readonly (readonly [string, string])[],
  limit = CAPSULE_LIMIT,
): CapsuleResult {
  const pool = items.filter((i) => i.status !== 'forSale');
  const of = (slot: CapsuleItem['slotType']) => pool.filter((i) => i.slotType === slot);
  const tops = of('top_base');
  const bottoms = of('bottom');
  const fulls = of('full_body');
  const layers: (CapsuleItem | null)[] = [null, ...of('top_layer')];
  const outers: (CapsuleItem | null)[] = [null, ...of('outerwear')];
  const shoes = of('shoes');
  const ok = (a: CapsuleItem | null, b: CapsuleItem | null) => !a || !b || occasionsCompatible(a.occasions, b.occasions, matrix);
  const okAll = (x: CapsuleItem | null, list: readonly (CapsuleItem | null)[]) => list.every((y) => ok(x, y));

  let count = 0;
  const bases: (readonly CapsuleItem[])[] = [];
  for (const t of tops) for (const b of bottoms) if (ok(t, b)) bases.push([t, b]);
  for (const f of fulls) bases.push([f]);
  for (const base of bases) {
    for (const l of layers) {
      if (!okAll(l, base)) continue;
      const withLayer = l ? [...base, l] : base;
      for (const o of outers) {
        if (!okAll(o, withLayer)) continue;
        const withOuter = o ? [...withLayer, o] : withLayer;
        for (const s of shoes) {
          if (!okAll(s, withOuter)) continue;
          count += 1;
          if (count > limit) return { count: limit, capped: true };
        }
      }
    }
  }
  return { count, capped: false };
}

export function formatCapsule(r: CapsuleResult): string {
  return r.capped ? `oltre ${r.count.toLocaleString('it-IT')}` : r.count.toLocaleString('it-IT');
}
