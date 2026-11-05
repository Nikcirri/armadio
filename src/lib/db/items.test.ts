import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmadioDB } from './schema';
import { getCategories, setupNewWardrobe } from './repo';
import { addItem, addPhotoToItem, deleteItemsHard, removeItemPhoto, setItemCover, updateItemFields } from './items';

let db: ArmadioDB;
let n = 0;

const photo = (id: string) => ({
  id,
  blob: new Blob(['x'], { type: 'image/webp' }),
  thumb: new Blob(['y'], { type: 'image/webp' }),
  width: 1,
  height: 1,
  createdAt: '',
  updatedAt: '',
});

beforeEach(async () => {
  n += 1;
  db = new ArmadioDB(`items-${n}`);
  await setupNewWardrobe(db, { preset: 'neutro', userName: '', palette: 'sabbia', mode: 'system' });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('capi e foto', () => {
  it('crea un capo con proprietario "Mio", armadio principale e soglia della categoria', async () => {
    const cat = (await getCategories(db)).find((c) => c.slotType === 'bottom')!;
    await db.photos.add(photo('p1'));
    const item = await addItem(db, { name: '  ', categoryId: cat.id, colors: ['denim'], photoIds: ['p1'] });
    expect(item.name).toBe(cat.name);
    expect(item.slotType).toBe('bottom');
    expect(item.maxWearsBeforeWash).toBe(4);
    const mine = await db.lists.get(item.ownerId!);
    expect(mine?.extra.key).toBe('mine');
    expect((await db.lists.get(item.locationId!))?.extra.key).toBe('main');
  });

  it('aggiunge, sposta in copertina e rimuove le foto', async () => {
    const [cat] = await getCategories(db);
    await db.photos.bulkAdd([photo('a'), photo('b')]);
    const item = await addItem(db, { name: 'Felpa', categoryId: cat!.id, colors: [], photoIds: ['a'] });
    await addPhotoToItem(db, item.id, 'b');
    await setItemCover(db, item.id, 'b');
    expect((await db.items.get(item.id))?.photoIds).toEqual(['b', 'a']);
    await removeItemPhoto(db, item.id, 'b');
    expect((await db.items.get(item.id))?.photoIds).toEqual(['a']);
    expect(await db.photos.get('b')).toBeUndefined();
    await updateItemFields(db, item.id, { name: ' Felpa grigia ', colors: ['grey'] });
    expect((await db.items.get(item.id))?.name).toBe('Felpa grigia');
  });

  it('elimina in blocco le bozze con le loro foto', async () => {
    const [cat] = await getCategories(db);
    await db.photos.bulkAdd([photo('a'), photo('b')]);
    const i1 = await addItem(db, { name: '1', categoryId: cat!.id, colors: [], photoIds: ['a'] });
    const i2 = await addItem(db, { name: '2', categoryId: cat!.id, colors: [], photoIds: ['b'] });
    await deleteItemsHard(db, [i1.id, i2.id]);
    expect(await db.items.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });
});
