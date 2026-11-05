import type { ChecklistEntry, EssentialTemplateEntry } from '../db/types';
import { daysBetween, newId } from './util';

/** Giorni di viaggio, partenza e ritorno compresi (minimo 1). */
export function tripDays(startDate: string, endDate: string): number {
  return Math.max(1, daysBetween(startDate, endDate) + 1);
}

/** Quantità di un elemento del necessaire in base ai giorni. */
export function essentialQty(entry: EssentialTemplateEntry, days: number): number {
  switch (entry.rule) {
    case 'perDayPlusOne':
      return entry.qty * days + 1;
    case 'perDay':
      return entry.qty * days;
    case 'fixed':
      return entry.qty;
  }
}

/** Checklist del necessaire da un template. */
export function buildEssentials(template: readonly EssentialTemplateEntry[], days: number): ChecklistEntry[] {
  return template.map((entry) => ({
    id: newId(),
    label: entry.label,
    qty: essentialQty(entry, days),
    checked: false,
  }));
}
