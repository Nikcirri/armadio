import type { ItemRecord, OutfitRecord, PlannerRecord, SlotType, WearLogRecord } from '../db/types';
import { addDays } from './util';

// Scorciatoie sull'icona e widget della schermata Home (SPEC.md, sezione 8.7). Funzioni pure.

export type ShortcutAction = 'cosa-metto' | 'add-item' | 'end-of-day' | 'agenda';

/** Gli indirizzi che scorciatoie e widget mandano all'app (gli stessi di shortcuts.xml e OutfitWidget.java). */
export const SHORTCUT_URLS: Readonly<Record<ShortcutAction, string>> = {
  'cosa-metto': 'armadio://cosa-metto',
  'add-item': 'armadio://aggiungi-capo',
  'end-of-day': 'armadio://fine-giornata',
  agenda: 'armadio://agenda',
};

/** L'azione di una scorciatoia o di un pulsante del widget; null per qualsiasi altro indirizzo. */
export function parseShortcutUrl(url: string): ShortcutAction | null {
  const clean = url.trim().toLowerCase().replace(/\/+$/, '');
  for (const [action, target] of Object.entries(SHORTCUT_URLS) as [ShortcutAction, string][]) {
    if (clean === target) return action;
  }
  return null;
}

/** Oggi più i 7 giorni seguenti: il widget passa da solo al giorno nuovo anche ad app chiusa. */
export const WIDGET_DAYS = 8;
/** Miniature mostrate dal widget. */
export const WIDGET_THUMBS = 4;

export interface WidgetDay {
  date: string;
  /** Indossato (solo oggi) o in agenda. */
  kind: 'worn' | 'planned';
  /** Riga sotto la data, es. "In agenda: Ufficio". */
  label: string;
  /** I capi da mostrare (al massimo 4), nell'ordine del collage. */
  itemIds: string[];
  /** Nomi dei capi mostrati, per i lettori di schermo. */
  names: string[];
  /** Quanti capi non ci stanno. */
  more: number;
}

export interface WidgetInput {
  today: string;
  /** Lo storico (servono solo le voci di oggi). */
  wear: readonly WearLogRecord[];
  /** L'agenda (servono solo oggi e i 7 giorni seguenti). */
  planner: readonly PlannerRecord[];
  outfits: ReadonlyMap<string, OutfitRecord>;
  items: ReadonlyMap<string, ItemRecord>;
}

// Ordine del collage: dall'alto in basso, accessori in fondo. L'intimo non si mostra.
const SLOT_ORDER: readonly SlotType[] = ['outerwear', 'top_layer', 'top_base', 'full_body', 'bottom', 'shoes', 'accessory'];

const outfitName = (o: OutfitRecord) => o.name.trim() || 'Outfit';

function shown(ids: readonly string[], items: ReadonlyMap<string, ItemRecord>): ItemRecord[] {
  const seen = new Set<string>();
  const list: ItemRecord[] = [];
  for (const id of ids) {
    const item = items.get(id);
    if (!item || seen.has(id) || !SLOT_ORDER.includes(item.slotType)) continue;
    seen.add(id);
    list.push(item);
  }
  // sort è stabile: a parità di slot resta l'ordine dell'outfit.
  return list.sort((a, b) => SLOT_ORDER.indexOf(a.slotType) - SLOT_ORDER.indexOf(b.slotType));
}

function day(date: string, kind: WidgetDay['kind'], label: string, list: readonly ItemRecord[]): WidgetDay {
  const visible = list.slice(0, WIDGET_THUMBS);
  return { date, kind, label, itemIds: visible.map((i) => i.id), names: visible.map((i) => i.name), more: list.length - visible.length };
}

/**
 * I giorni per il widget, da oggi ai 7 seguenti: per oggi prima quello che hai indossato, poi
 * l'agenda; per gli altri giorni l'agenda. I giorni senza niente non ci sono.
 */
export function widgetDays(input: WidgetInput): WidgetDay[] {
  const { today, outfits, items } = input;
  const days: WidgetDay[] = [];
  const worn = input.wear.filter((w) => w.date === today);
  const plannerByDate = new Map(input.planner.map((p) => [p.date, p]));
  for (let i = 0; i < WIDGET_DAYS; i++) {
    const date = addDays(today, i);
    if (i === 0 && worn.length) {
      const outfitIds = new Set(worn.map((w) => w.outfitId));
      const only = outfitIds.size === 1 ? outfits.get([...outfitIds][0] ?? '') : undefined;
      days.push(day(date, 'worn', only ? `Indossato oggi: ${outfitName(only)}` : 'Indossato oggi', shown(worn.flatMap((w) => w.itemIds), items)));
      continue;
    }
    const plan = plannerByDate.get(date);
    if (!plan) continue;
    const outfit = plan.outfitId ? outfits.get(plan.outfitId) : undefined;
    const list = shown([...(outfit?.itemIds ?? []), ...plan.itemIds], items);
    const note = plan.note.trim();
    if (!outfit && !list.length && !note) continue;
    const label = outfit ? `In agenda: ${outfitName(outfit)}` : list.length ? 'In agenda: capi scelti' : `In agenda: ${note}`;
    days.push(day(date, 'planned', label, list));
  }
  return days;
}

/**
 * Impronta dei dati del widget: se non cambia, non serve mandarli di nuovo.
 * Comprende la foto di copertina di ogni capo e quando è stata cambiata.
 */
export function widgetSignature(days: readonly WidgetDay[], photoStamps: ReadonlyMap<string, string>): string {
  const ids = [...new Set(days.flatMap((d) => d.itemIds))].sort();
  return JSON.stringify({ days, photos: ids.map((id) => [id, photoStamps.get(id) ?? '']) });
}
