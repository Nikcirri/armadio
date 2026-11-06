import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmadioDB } from './schema';
import { getCategories, getSetting, setupNewWardrobe } from './repo';
import { addItem } from './items';
import { saveOutfit } from './outfits';
import {
  addListEntry,
  deleteListEntry,
  deleteWish,
  listEntryUsage,
  moveListEntry,
  purchaseWish,
  renameListEntry,
  restoreListDeletion,
  restoreWish,
  saveWish,
  undoPurchase,
  type WishInput,
} from './altro';

let db: ArmadioDB;
let n = 0;
const photo = (id: string) => ({ id, blob: new Blob(['x']), thumb: new Blob(['y']), width: 1, height: 1, createdAt: '', updatedAt: '' });
const wish = (over: Partial<WishInput> = {}): WishInput => ({
  name: ' Mocassini ',
  categoryId: null,
  photoIds: [],
  price: 120,
  storeOrLink: ' www.negozio.it ',
  colors: ['brown'],
  season: 'autumnWinter',
  occasions: [],
  priority: 'high',
  notes: '',
  ...over,
});

beforeEach(async () => {
  n += 1;
  db = new ArmadioDB(`altro-${n}`);
  await setupNewWardrobe(db, { preset: 'neutro', userName: '', palette: 'sabbia', mode: 'system' });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const listOf = (kind: string, key: string) => db.lists.where('kind').equals(kind).filter((l) => l.extra.key === key).first();

describe('wishlist', () => {
  it('salva, modifica (togliendo le foto non più usate) ed elimina con Annulla', async () => {
    await db.photos.bulkAdd([photo('a'), photo('b')]);
    const w = await saveWish(db, wish({ photoIds: ['a', 'b'] }));
    expect(w).toMatchObject({ name: 'Mocassini', storeOrLink: 'www.negozio.it' });
    await saveWish(db, wish({ photoIds: ['b'] }), w.id);
    expect(await db.photos.get('a')).toBeUndefined();
    const o = await saveOutfit(db, { name: 'X', itemIds: [], wishlistIds: [w.id], season: null, occasions: [], weatherTags: [], favorite: false, notes: '', layout: [{ itemId: w.id, x: 0.5, y: 0.5, scale: 0.3, z: 1 }] });
    const snap = await deleteWish(db, w.id);
    expect(await db.wishlist.count()).toBe(0);
    expect(await db.photos.get('b')).toBeUndefined();
    expect((await db.outfits.get(o.id))?.wishlistIds).toEqual([]);
    await restoreWish(db, snap);
    expect(await db.photos.get('b')).toBeDefined();
    expect((await db.outfits.get(o.id))?.wishlistIds).toEqual([w.id]);
  });

  it('Comprato! crea il capo e lo mette al posto del desiderio negli outfit', async () => {
    const shoes = (await getCategories(db)).find((c) => c.slotType === 'shoes')!;
    await db.photos.add(photo('p'));
    const w = await saveWish(db, wish({ photoIds: ['p'], occasions: ['occ'] }));
    const o = await saveOutfit(db, { name: 'X', itemIds: [], wishlistIds: [w.id], season: null, occasions: [], weatherTags: [], favorite: false, notes: '', layout: [{ itemId: w.id, x: 0.5, y: 0.5, scale: 0.3, z: 1 }] });
    const { item, snapshot } = await purchaseWish(db, w.id, { categoryId: shoes.id, price: 99, purchaseDate: '2026-11-06' });
    expect(item).toMatchObject({ name: 'Mocassini', slotType: 'shoes', price: 99, purchaseDate: '2026-11-06', photoIds: ['p'], season: 'autumnWinter', occasions: ['occ'] });
    expect(item.notes).toContain('www.negozio.it');
    expect(await db.wishlist.count()).toBe(0);
    const after = await db.outfits.get(o.id);
    expect(after).toMatchObject({ wishlistIds: [], itemIds: [item.id] });
    expect(after?.layout[0]?.itemId).toBe(item.id);
    await undoPurchase(db, snapshot);
    expect(await db.items.get(item.id)).toBeUndefined();
    expect(await db.wishlist.get(w.id)).toBeDefined();
    expect((await db.outfits.get(o.id))?.wishlistIds).toEqual([w.id]);
    expect(await db.photos.get('p')).toBeDefined();
  });
});

describe('liste', () => {
  it('aggiunge senza doppioni, riordina e rinomina anche nei capi e nel diario', async () => {
    const e = await addListEntry(db, 'fabric', ' Raso ');
    await expect(addListEntry(db, 'fabric', 'raso')).rejects.toThrow('C’è già');
    const cat = (await getCategories(db))[0]!;
    const it = await addItem(db, { name: 'Top', categoryId: cat.id, colors: [], photoIds: [] });
    await db.items.update(it.id, { fabrics: ['Raso', 'Cotone'] });
    await renameListEntry(db, e.id, 'Satin');
    expect((await db.items.get(it.id))?.fabrics).toEqual(['Satin', 'Cotone']);
    const p = await addListEntry(db, 'person', 'Giulia');
    await db.diary.add({ id: 'd', date: '2026-11-01', outfitId: null, itemIds: [], location: '', people: ['Giulia'], note: '', photoIds: [], createdAt: '', updatedAt: '' });
    await renameListEntry(db, p.id, 'Giulia R.');
    expect((await db.diary.get('d'))?.people).toEqual(['Giulia R.']);
    const before = (await db.lists.get(e.id))!.order;
    await moveListEntry(db, e.id, -1);
    expect((await db.lists.get(e.id))!.order).toBe(before - 1);
  });

  it('protegge le voci dell’app; eliminando un proprietario o una posizione i capi passano a Mio e Armadio principale', async () => {
    const mine = (await listOf('owner', 'mine'))!;
    const main = (await listOf('location', 'main'))!;
    await expect(deleteListEntry(db, mine.id)).rejects.toThrow('serve all’app');
    const sister = await addListEntry(db, 'owner', 'Mia sorella');
    const garage = await addListEntry(db, 'location', 'Garage');
    const cat = (await getCategories(db))[0]!;
    const it = await addItem(db, { name: 'Giacca', categoryId: cat.id, colors: [], photoIds: [] });
    await db.items.update(it.id, { ownerId: sister.id, locationId: garage.id });
    expect(await listEntryUsage(db, sister)).toBe(1);
    const s1 = await deleteListEntry(db, sister.id);
    await deleteListEntry(db, garage.id);
    expect(await db.items.get(it.id)).toMatchObject({ ownerId: mine.id, locationId: main.id });
    await restoreListDeletion(db, s1);
    expect((await db.items.get(it.id))?.ownerId).toBe(sister.id);
  });

  it('eliminando un’occasione la toglie da capi, outfit, wishlist e matrice', async () => {
    const sport = (await listOf('occasion', 'sport'))!;
    const cat = (await getCategories(db))[0]!;
    const it = await addItem(db, { name: 'Tuta', categoryId: cat.id, colors: [], photoIds: [] });
    await db.items.update(it.id, { occasions: [sport.id] });
    const w = await saveWish(db, wish({ occasions: [sport.id] }));
    const matrixBefore = (await getSetting(db, 'occasionMatrix'))!;
    expect(matrixBefore.some((p) => p.includes(sport.id))).toBe(true);
    const snap = await deleteListEntry(db, sport.id);
    expect((await db.items.get(it.id))?.occasions).toEqual([]);
    expect((await db.wishlist.get(w.id))?.occasions).toEqual([]);
    expect((await getSetting(db, 'occasionMatrix'))!.some((p) => p.includes(sport.id))).toBe(false);
    await restoreListDeletion(db, snap);
    expect((await db.items.get(it.id))?.occasions).toEqual([sport.id]);
    expect(await getSetting(db, 'occasionMatrix')).toEqual(matrixBefore);
  });
});
