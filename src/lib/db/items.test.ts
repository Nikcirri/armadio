import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmadioDB } from './schema';
import { getCategories, setupNewWardrobe } from './repo';
import {
  addItem,
  addPhotoToItem,
  addWear,
  bulkAddToOutfit,
  bulkAddToTrip,
  bulkSetLocation,
  bulkSetStatus,
  clearStain,
  deleteItemsHard,
  ensureLocation,
  duplicateItem,
  getWearDates,
  pickEditable,
  removeItemPhoto,
  removeLastWear,
  restoreBulk,
  saveItem,
  setItemCover,
  updateItemFields,
} from './items';
import { createOutfit, createTrip } from '../logic/factories';

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

describe('scheda capo e azioni di massa', () => {
  async function oneItem(over: Partial<import('./types').ItemRecord> = {}) {
    const [cat] = await getCategories(db);
    const item = await addItem(db, { name: 'Jeans', categoryId: cat!.id, colors: ['denim'], photoIds: [] });
    if (Object.keys(over).length) await db.items.update(item.id, over);
    return (await db.items.get(item.id))!;
  }

  it('salva la scheda con le regole dello stato e cambia slot con la categoria', async () => {
    const it0 = await oneItem({ status: 'toWash', hasStain: true, wearsSinceWash: 3 });
    const cats = await getCategories(db);
    const shoes = cats.find((c) => c.slotType === 'shoes')!;
    await saveItem(db, it0.id, { ...pickEditable(it0), status: 'clean', categoryId: shoes.id, name: '  ' });
    const saved = (await db.items.get(it0.id))!;
    expect(saved.status).toBe('clean');
    expect(saved.wearsSinceWash).toBe(0);
    expect(saved.hasStain).toBe(false);
    expect(saved.slotType).toBe('shoes');
    expect(saved.name).toBe(shoes.name);

    await saveItem(db, it0.id, { ...pickEditable(saved), status: 'onLoan', loanTo: 'Sara', loanDate: '2026-11-01' });
    expect(await db.items.get(it0.id)).toMatchObject({ status: 'onLoan', loanTo: 'Sara', loanDate: '2026-11-01' });
  });

  it('collega il capo "In valigia" al viaggio scelto', async () => {
    const it0 = await oneItem();
    const trip = createTrip({ name: 'Roma', startDate: '2026-11-10', endDate: '2026-11-12' });
    await db.trips.add(trip);
    await saveItem(db, it0.id, { ...pickEditable(it0), status: 'packed' }, trip.id);
    expect((await db.trips.get(trip.id))?.packedItemIds).toEqual([it0.id]);
  });

  it('i tasti + e − aggiornano storico e contatori', async () => {
    const it0 = await oneItem();
    await addWear(db, it0.id, '2026-11-01');
    await addWear(db, it0.id, '2026-11-03');
    let cur = (await db.items.get(it0.id))!;
    expect([cur.wearCount, cur.lastWornDate, cur.wearsSinceWash]).toEqual([2, '2026-11-03', 2]);
    expect(await getWearDates(db, it0.id)).toEqual(['2026-11-03', '2026-11-01']);
    expect(await removeLastWear(db, it0.id)).toBe(true);
    cur = (await db.items.get(it0.id))!;
    expect([cur.wearCount, cur.lastWornDate, cur.wearsSinceWash]).toEqual([1, '2026-11-01', 1]);
    await removeLastWear(db, it0.id);
    expect(await removeLastWear(db, it0.id)).toBe(false);
  });

  it('con utilizzi contati prima dello storico, + e − spostano di uno', async () => {
    const it0 = await oneItem({ wearCount: 25, lastWornDate: '2026-10-01', wearsSinceWash: 1 });
    await addWear(db, it0.id, '2026-11-05');
    expect((await db.items.get(it0.id))).toMatchObject({ wearCount: 26, lastWornDate: '2026-11-05', wearsSinceWash: 2 });
    await removeLastWear(db, it0.id);
    expect((await db.items.get(it0.id))).toMatchObject({ wearCount: 25, lastWornDate: '2026-11-05', wearsSinceWash: 1 });
  });

  it('duplica il capo con foto nuove e utilizzi azzerati', async () => {
    await db.photos.add(photo('orig'));
    const it0 = await oneItem({ photoIds: ['orig'], wearCount: 9, favorite: true });
    const copy = await duplicateItem(db, it0.id);
    expect(copy.name).toBe('Jeans (copia)');
    expect(copy.wearCount).toBe(0);
    expect(copy.photoIds[0]).not.toBe('orig');
    expect(await db.photos.count()).toBe(2);
  });

  it('cambia stato in blocco e Annulla ripristina', async () => {
    const a = await oneItem({ wearsSinceWash: 2 });
    const b = await oneItem();
    const snap = await bulkSetStatus(db, [a.id, b.id], 'toWash');
    expect((await db.items.get(a.id))?.status).toBe('toWash');
    await restoreBulk(db, snap);
    expect((await db.items.get(a.id))?.status).toBe('clean');
    expect((await db.items.get(a.id))?.wearsSinceWash).toBe(2);
  });

  it('sposta, mette in valigia e aggiunge a un outfit in blocco', async () => {
    const a = await oneItem();
    const loc = (await db.lists.where('kind').equals('location').toArray())[1]!;
    await bulkSetLocation(db, [a.id], loc.id);
    expect((await db.items.get(a.id))?.locationId).toBe(loc.id);

    const trip = createTrip({ name: 'Mare', startDate: '2026-11-10', endDate: '2026-11-12' });
    await db.trips.add(trip);
    const snap = await bulkAddToTrip(db, [a.id], trip.id);
    expect((await db.items.get(a.id))?.status).toBe('packed');
    expect((await db.trips.get(trip.id))?.extraItemIds).toEqual([a.id]);
    await restoreBulk(db, snap);
    expect((await db.trips.get(trip.id))?.extraItemIds).toEqual([]);

    const outfit = createOutfit({ name: 'Look', itemIds: [] });
    await db.outfits.add(outfit);
    await bulkAddToOutfit(db, [a.id, a.id], outfit.id);
    expect((await db.outfits.get(outfit.id))?.itemIds).toEqual([a.id]);
  });
});

describe('lavanderia e cambio stagione', () => {
  it('toglie la macchia lasciando il capo da lavare', async () => {
    const [cat] = await getCategories(db);
    const it0 = await addItem(db, { name: 'Felpa', categoryId: cat!.id, colors: [], photoIds: [] });
    await db.items.update(it0.id, { status: 'toWash', hasStain: true });
    await clearStain(db, it0.id);
    expect(await db.items.get(it0.id)).toMatchObject({ status: 'toWash', hasStain: false });
  });

  it('trova la scatola cambio stagione e la ricrea se manca', async () => {
    const box = await ensureLocation(db, 'seasonBox', 'Scatola cambio stagione');
    expect((await db.lists.get(box))?.extra.key).toBe('seasonBox');
    await db.lists.delete(box);
    const again = await ensureLocation(db, 'seasonBox', 'Scatola cambio stagione');
    expect(again).not.toBe(box);
    expect(await ensureLocation(db, 'seasonBox', 'x')).toBe(again);
  });
});
