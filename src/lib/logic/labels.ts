import type { BagSize, CutStyle, ItemStatus, Season, Walkability, Warmth, WashTag } from '../db/types';

// Etichette italiane dei valori dei capi (SPEC.md, sezioni 5 e 8.1).

export interface StatusInfo {
  id: ItemStatus;
  label: string;
  short: string;
  emoji: string;
}

export const STATUSES: readonly StatusInfo[] = [
  { id: 'clean', label: 'Pulito', short: 'Pulito', emoji: '🟢' },
  { id: 'toWash', label: 'Da lavare', short: 'Da lavare', emoji: '🧺' },
  { id: 'drying', label: 'Steso ad asciugare', short: 'Steso', emoji: '🌬️' },
  { id: 'toIron', label: 'Da stirare', short: 'Da stirare', emoji: '💨' },
  { id: 'packed', label: 'In valigia', short: 'In valigia', emoji: '🧳' },
  { id: 'onLoan', label: 'In prestito', short: 'Prestato', emoji: '🤝' },
  { id: 'maintenance', label: 'In manutenzione', short: 'Da sistemare', emoji: '🧵' },
  { id: 'forSale', label: 'Da vendere', short: 'Da vendere', emoji: '📦' },
];

export function statusInfo(id: ItemStatus): StatusInfo {
  return STATUSES.find((s) => s.id === id) ?? STATUSES[0]!;
}

export const SEASONS: readonly { id: Season; label: string }[] = [
  { id: 'springSummer', label: 'Primavera/Estate' },
  { id: 'autumnWinter', label: 'Autunno/Inverno' },
  { id: 'allSeasons', label: '4 stagioni' },
];

export const WARMTHS: readonly { id: Warmth; label: string }[] = [
  { id: 'light', label: 'Leggero' },
  { id: 'medium', label: 'Medio' },
  { id: 'heavy', label: 'Pesante' },
];

export const CUTS: readonly { id: CutStyle; label: string }[] = [
  { id: 'regular', label: 'Regolare' },
  { id: 'highWaist', label: 'Vita alta' },
  { id: 'lowWaist', label: 'Vita bassa' },
  { id: 'crop', label: 'Corto/Crop' },
  { id: 'oversize', label: 'Oversize' },
  { id: 'fitted', label: 'Aderente' },
  { id: 'slim', label: 'Slim' },
];

export const WALKABILITY: readonly { id: Walkability; label: string }[] = [
  { id: 'allDay', label: 'Tutto il giorno' },
  { id: 'medium', label: 'Media' },
  { id: 'eveningOnly', label: 'Solo serata' },
];

export const BAG_SIZES: readonly { id: BagSize; label: string }[] = [
  { id: 'mini', label: 'Mini/Sera' },
  { id: 'medium', label: 'Media/Quotidiana' },
  { id: 'large', label: 'Grande/Lavoro' },
];

export const WASH_TAGS: readonly { id: WashTag; label: string; icon: string }[] = [
  { id: 'handWash', label: 'A mano', icon: '🖐️' },
  { id: 'max30', label: 'Max 30°', icon: '30°' },
  { id: 'max40', label: 'Max 40°', icon: '40°' },
  { id: 'delicate', label: 'Delicati', icon: '🪶' },
  { id: 'noSpin', label: 'No centrifuga', icon: '🌀' },
  { id: 'noDryer', label: 'No asciugatrice', icon: '⛔' },
  { id: 'ironLow', label: 'Stiro delicato', icon: '♨️' },
  { id: 'dryClean', label: 'Lavaggio a secco', icon: 'Ⓟ' },
];

export const SALE_CONDITIONS: readonly string[] = [
  'Nuovo con cartellino',
  'Nuovo senza cartellino',
  'Ottime condizioni',
  'Buone condizioni',
  'Discrete condizioni',
];

export function labelOf<T extends string>(list: readonly { id: T; label: string }[], id: T | null | undefined): string {
  return list.find((x) => x.id === id)?.label ?? '';
}

/** "12,50" o "12.5" → 12.5; testo vuoto o non valido → null. */
export function parseEuro(text: string): number | null {
  const cleaned = text.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

/** Valore da mettere in un campo di testo ("12,5"). */
export function euroInput(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}
