import type { CategoryRecord, Preset } from '../db/types';
import { isPreset, underwearCategoriesToAdd } from './presets';

// Migrazioni dei dati (SPEC 3), condivise tra il database (Dexie) e i backup vecchi.

/** Schema 2: ogni capo ha la lista dell'intimo da mettere sotto. */
export function itemToV2<T extends object>(item: T): T & { underwearIds: string[] } {
  const ids = (item as { underwearIds?: unknown }).underwearIds;
  return { ...item, underwearIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [] };
}

/** Schema 2: le categorie di intimo del preset, se l'armadio è già configurato e non ne ha. */
export function categoriesToAddV2(
  presetValue: unknown,
  categories: readonly Pick<CategoryRecord, 'id' | 'slotType' | 'order'>[],
  now: string,
): CategoryRecord[] {
  const preset: Preset = isPreset(presetValue) ? presetValue : 'neutro';
  return underwearCategoriesToAdd(preset, categories, now);
}
