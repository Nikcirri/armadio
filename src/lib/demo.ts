import { db, tracker } from './db';
import { getCategories, hasDemoData } from './db/repo';
import type { PhotoRecord } from './db/types';
import { DEMO_GARMENTS, buildDemoBundle } from './logic/demo';
import { newId, nowIso } from './logic/util';
import { drawDemoGarment } from './media/demoPhotos';
import { canvasToPhotoBlobs } from './media/image';
import { UserError } from './errors';

/** Carica 8 capi disegnati, 2 outfit e 1 viaggio di esempio. */
export async function loadDemoData(): Promise<void> {
  if (await hasDemoData(db)) throw new UserError('L’esempio è già caricato.');
  const now = nowIso();
  const photos: PhotoRecord[] = [];
  const photoIds: Record<string, string> = {};
  for (const g of DEMO_GARMENTS) {
    const canvas = drawDemoGarment(g.shape, g.hex);
    const { blob, thumb, width, height } = await canvasToPhotoBlobs(canvas);
    const id = newId();
    photoIds[g.key] = id;
    photos.push({ id, blob, thumb, width, height, demo: true, createdAt: now, updatedAt: now });
  }
  const [categories, lists] = await Promise.all([getCategories(db), db.lists.toArray()]);
  const bundle = buildDemoBundle({ categories, lists, photoIds, now });
  await tracker.withoutTracking(() =>
    db.transaction('rw', [db.photos, db.items, db.outfits, db.trips, db.wearLog], async () => {
      await db.photos.bulkAdd(photos);
      await db.items.bulkAdd(bundle.items);
      await db.outfits.bulkAdd(bundle.outfits);
      await db.trips.bulkAdd(bundle.trips);
      await db.wearLog.bulkAdd(bundle.wearLog);
    }),
  );
}
