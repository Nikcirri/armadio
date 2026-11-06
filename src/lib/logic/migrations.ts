import type { CategoryRecord, Preset } from '../db/types';
import { braCategoryToAdd, isPreset, underwearCategoriesToAdd } from './presets';

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
  return underwearCategoriesToAdd(presetOf(presetValue), categories, now);
}

/** Schema 3: la categoria Reggiseni nel preset Neutro. */
export function categoriesToAddV3(
  presetValue: unknown,
  categories: readonly Pick<CategoryRecord, 'id' | 'order'>[],
  now: string,
): CategoryRecord[] {
  return presetOf(presetValue) === 'neutro' ? braCategoryToAdd(categories, now) : [];
}

/** Schema 4: la categoria Reggiseni in tutti i preset. */
export function categoriesToAddV4(categories: readonly Pick<CategoryRecord, 'id' | 'order'>[], now: string): CategoryRecord[] {
  return braCategoryToAdd(categories, now);
}

function presetOf(value: unknown): Preset {
  return isPreset(value) ? value : 'neutro';
}
