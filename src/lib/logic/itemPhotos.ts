/** Massimo di foto per capo: fronte, retro, etichetta, indossato (SPEC.md, sezione 3). */
export const MAX_ITEM_PHOTOS = 4;

export function canAddPhoto(photoIds: readonly string[]): boolean {
  return photoIds.length < MAX_ITEM_PHOTOS;
}

export function addPhotoId(photoIds: readonly string[], id: string): string[] {
  if (!canAddPhoto(photoIds)) throw new Error(`Al massimo ${MAX_ITEM_PHOTOS} foto per capo`);
  if (photoIds.includes(id)) return [...photoIds];
  return [...photoIds, id];
}

/** Mette la foto al primo posto: diventa la copertina. */
export function setCover(photoIds: readonly string[], id: string): string[] {
  if (!photoIds.includes(id)) return [...photoIds];
  return [id, ...photoIds.filter((p) => p !== id)];
}

export function removePhotoId(photoIds: readonly string[], id: string): string[] {
  return photoIds.filter((p) => p !== id);
}

/**
 * Nomi per le bozze del caricamento in blocco: "<categoria> N", continuando la numerazione
 * se esistono già capi con lo stesso schema.
 */
export function draftNames(categoryName: string, count: number, existingNames: readonly string[]): string[] {
  const base = categoryName.trim() || 'Capo';
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`, 'i');
  let max = 0;
  for (const name of existingNames) {
    const m = re.exec(name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Array.from({ length: count }, (_, i) => `${base} ${max + i + 1}`);
}
