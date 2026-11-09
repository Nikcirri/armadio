import type { ItemRecord } from '../db/types';
import { normalize } from './items';

// Taglie e misure (SPEC.md, sezione 8.5): da consultare in negozio anche senza internet.

export const MEASUREMENTS: readonly { key: string; label: string; hint: string }[] = [
  { key: 'height', label: 'Altezza', hint: 'Senza scarpe' },
  { key: 'chest', label: 'Petto / seno', hint: 'Nel punto più largo' },
  { key: 'underbust', label: 'Sottoseno', hint: 'Subito sotto il seno' },
  { key: 'waist', label: 'Vita', hint: 'Nel punto più stretto' },
  { key: 'lowWaist', label: 'Vita bassa / cintura', hint: 'Dove porti cintura e pantaloni a vita bassa' },
  { key: 'hips', label: 'Fianchi', hint: 'Nel punto più largo' },
  { key: 'shoulders', label: 'Spalle', hint: 'Da una spalla all’altra' },
  { key: 'inseam', label: 'Interno gamba', hint: 'Dal cavallo alla caviglia' },
  { key: 'neck', label: 'Collo', hint: 'Alla base' },
  { key: 'foot', label: 'Lunghezza piede', hint: 'Dal tallone all’alluce' },
];

/** "72,5" → 72.5. Null se vuoto o non è una misura sensata (0-300 cm). */
export function parseCm(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/\s*cm$/i, '');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n >= 300) return null;
  return Math.round(n * 10) / 10;
}

export function formatCm(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

/** Anelli: una misura italiana per dito (stesso record delle misure del corpo, SPEC.md 8.5). */
export const RING_FINGERS: readonly { key: string; label: string }[] = [
  { key: 'ringThumb', label: 'Pollice' },
  { key: 'ringIndex', label: 'Indice' },
  { key: 'ringMiddle', label: 'Medio' },
  { key: 'ringRingFinger', label: 'Anulare' },
  { key: 'ringLittle', label: 'Mignolo' },
];

/** "14", "14,5", "IT 14" → misura italiana (1-40, a mezze misure). Null se vuoto o non sensata. */
export function parseRingSize(text: string): number | null {
  const t = text
    .trim()
    .replace(',', '.')
    .replace(/^(it|ita|n\.?)\s*/i, '');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1 || n > 40) return null;
  return Math.round(n * 2) / 2;
}

/** Circonferenza interna in mm: misura italiana + 40 (è anche la misura europea). */
export function ringCircumferenceMm(size: number): number {
  return size + 40;
}

export interface BrandSize {
  brand: string;
  size: string;
}

const key = (b: BrandSize) => `${normalize(b.brand)}|${normalize(b.size)}`;

/** Aggiunge una taglia (senza doppioni, maiuscole ignorate). */
export function addBrandSize(list: readonly BrandSize[], entry: BrandSize): BrandSize[] {
  const clean = { brand: entry.brand.trim().replace(/\s+/g, ' '), size: entry.size.trim().replace(/\s+/g, ' ') };
  if (!clean.brand || !clean.size || list.some((b) => key(b) === key(clean))) return [...list];
  return sortBrandSizes([...list, clean]);
}

export function sortBrandSizes(list: readonly BrandSize[]): BrandSize[] {
  return [...list].sort((a, b) => a.brand.localeCompare(b.brand, 'it') || a.size.localeCompare(b.size, 'it'));
}

export function filterBrandSizes(list: readonly BrandSize[], query: string): BrandSize[] {
  const q = normalize(query);
  return q ? list.filter((b) => normalize(`${b.brand} ${b.size}`).includes(q)) : [...list];
}

/** Brand e taglie dei tuoi capi che non hai ancora salvato, dai più frequenti. */
export function sizeSuggestions(items: readonly Pick<ItemRecord, 'brand' | 'size'>[], list: readonly BrandSize[], max = 8): BrandSize[] {
  const saved = new Set(list.map(key));
  const counts = new Map<string, { entry: BrandSize; n: number }>();
  for (const i of items) {
    const entry = { brand: i.brand.trim(), size: i.size.trim() };
    if (!entry.brand || !entry.size || saved.has(key(entry))) continue;
    const k = key(entry);
    const cur = counts.get(k);
    if (cur) cur.n += 1;
    else counts.set(k, { entry, n: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.entry.brand.localeCompare(b.entry.brand, 'it'))
    .slice(0, max)
    .map((x) => x.entry);
}
