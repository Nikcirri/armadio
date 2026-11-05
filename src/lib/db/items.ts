import type { ArmadioDB } from './schema';
import type { ColorId, ItemRecord } from './types';
import { createItem } from '../logic/factories';
import { addPhotoId, removePhotoId, setCover } from '../logic/itemPhotos';
import { nowIso } from '../logic/util';

/** Crea un capo con le foto indicate (la prima è la copertina). */
export async function addItem(
  db: ArmadioDB,
  input: { name: string; categoryId: string; colors: ColorId[]; photoIds: string[] },
): Promise<ItemRecord> {
  return db.transaction('rw', db.items, db.categories, db.lists, async () => {
    const category = await db.categories.get(input.categoryId);
    if (!category) throw new Error('Categoria non trovata');
    const [owner, location] = await Promise.all([
      db.lists.where('kind').equals('owner').filter((l) => l.extra.key === 'mine').first(),
      db.lists.where('kind').equals('location').filter((l) => l.extra.key === 'main').first(),
    ]);
    const item = createItem(
      {
        name: input.name.trim() || category.name,
        colors: input.colors,
        photoIds: input.photoIds,
        ownerId: owner?.id ?? null,
        locationId: location?.id ?? null,
      },
      category,
    );
    await db.items.add(item);
    return item;
  });
}

export async function updateItemFields(
  db: ArmadioDB,
  id: string,
  patch: Partial<Pick<ItemRecord, 'name' | 'colors'>>,
): Promise<void> {
  const changes: Partial<ItemRecord> = { ...patch, updatedAt: nowIso() };
  if (patch.name !== undefined) changes.name = patch.name.trim() || 'Capo senza nome';
  await db.items.update(id, changes);
}

export async function addPhotoToItem(db: ArmadioDB, itemId: string, photoId: string): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    await db.items.update(itemId, { photoIds: addPhotoId(item.photoIds, photoId), updatedAt: nowIso() });
  });
}

export async function setItemCover(db: ArmadioDB, itemId: string, photoId: string): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    await db.items.update(itemId, { photoIds: setCover(item.photoIds, photoId), updatedAt: nowIso() });
  });
}

/** Toglie una foto dal capo e la cancella. */
export async function removeItemPhoto(db: ArmadioDB, itemId: string, photoId: string): Promise<void> {
  await db.transaction('rw', db.items, db.photos, async () => {
    const item = await db.items.get(itemId);
    if (!item) throw new Error('Capo non trovato');
    await db.items.update(itemId, { photoIds: removePhotoId(item.photoIds, photoId), updatedAt: nowIso() });
    await db.photos.delete(photoId);
  });
}

/** Elimina più capi appena creati (es. bozze scartate) insieme alle loro foto. */
export async function deleteItemsHard(db: ArmadioDB, ids: string[]): Promise<void> {
  await db.transaction('rw', db.items, db.photos, async () => {
    const items = (await db.items.bulkGet(ids)).filter((i): i is ItemRecord => !!i);
    await db.photos.bulkDelete(items.flatMap((i) => i.photoIds));
    await db.items.bulkDelete(ids);
  });
}
