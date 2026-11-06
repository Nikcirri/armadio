import type { SlotType } from '../db/types';

export interface SlotInfo {
  id: SlotType;
  label: string;
  /** Utilizzi prima del lavaggio; null = non si lava a utilizzi. */
  defaultMaxWears: number | null;
  bulkWeight: number;
}

// SPEC.md, sezione 4.
export const SLOTS: readonly SlotInfo[] = [
  { id: 'top_base', label: 'Sopra (base)', defaultMaxWears: 1, bulkWeight: 1 },
  { id: 'top_layer', label: 'Strato (maglioni, felpe)', defaultMaxWears: 3, bulkWeight: 2 },
  { id: 'bottom', label: 'Sotto', defaultMaxWears: 4, bulkWeight: 2 },
  { id: 'full_body', label: 'Intero (abiti, tute)', defaultMaxWears: 2, bulkWeight: 2 },
  { id: 'outerwear', label: 'Capospalla', defaultMaxWears: 10, bulkWeight: 4 },
  { id: 'shoes', label: 'Scarpe', defaultMaxWears: null, bulkWeight: 3 },
  { id: 'accessory', label: 'Accessori', defaultMaxWears: null, bulkWeight: 1 },
  { id: 'underwear', label: 'Intimo (reggiseni, slip, calze)', defaultMaxWears: 1, bulkWeight: 1 },
];

export function slotInfo(slot: SlotType): SlotInfo {
  const info = SLOTS.find((s) => s.id === slot);
  if (!info) throw new Error(`Slot sconosciuto: ${slot}`);
  return info;
}

export function isSlotType(value: string): value is SlotType {
  return SLOTS.some((s) => s.id === value);
}
