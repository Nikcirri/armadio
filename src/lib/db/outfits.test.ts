import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmadioDB } from './schema';
import { getCategories, getSetting, setupNewWardrobe } from './repo';
import { addItem } from './items';
import {
  applyEndOfDay,
  deleteDiaryEntry,
  deleteOutfitCascade,
  discardPhotos,
  duplicateOutfit,
  restoreDiaryEntry,
  restoreOutfitDeletion,
  saveDiaryEntry,
  saveOutfit,
  saveOutfitLayout,
  addItemsToOutfit,
  toggleOutfitFavorite,
  undoEndOfDay,
  undoWear,
  wearItems,
  type OutfitInput,
} from './outfits';
import { createTrip } from '../logic/factories';

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

const input = (over: Partial<OutfitInput> = {}): OutfitInput => ({
  name: '',
  itemIds: [],
  wishlistIds: [],
  season: null,
  occasions: [],
  weatherTags: [],
  favorite: false,
  notes: '',
  layout: [],
  ...over,
});

async function twoItems() {
  const cats = await getCategories(db);
  const top = cats.find((c) => c.slotType === 'top_base')!;
  const shoes = cats.find((c) => c.slotType === 'shoes')!;
  const tee = await addItem(db, { name: 'T-shirt', categoryId: top.id, colors: ['white'], photoIds: [] });
  const sneakers = await addItem(db, { name: 'Sneakers', categoryId: shoes.id, colors: ['white'], photoIds: [] });
  return { tee, sneakers };
}

beforeEach(async () => {
  n += 1;
  db = new ArmadioDB(`outfits-${n}`);
  await setupNewWardrobe(db, { preset: 'neutro', userName: '', palette: 'sabbia', mode: 'system' });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('outfit', () => {
  it('crea con un nome automatico, aggiorna e toglie "incompleto"', async () => {
    const { tee } = await twoItems();
    const first = await saveOutfit(db, input({ itemIds: [tee.id], notes: '  nota  ' }));
    expect(first.name).toBe('Outfit 1');
    expect(first.notes).toBe('nota');
    await db.outfits.update(first.id, { incomplete: true });
    const updated = await saveOutfit(db, input({ name: ' Ufficio ', itemIds: [tee.id], favorite: true }), first.id);
    expect(updated).toMatchObject({ id: first.id, name: 'Ufficio', favorite: true, incomplete: false, createdAt: first.createdAt });
    expect((await saveOutfit(db, input())).name).toBe('Outfit 2');
  });

  it('salva la disposizione, il preferito e duplica', async () => {
    const o = await saveOutfit(db, input({ name: 'A' }));
    await addItemsToOutfit(db, o.id, ['bra']);
    await addItemsToOutfit(db, o.id, ['bra', 'calze']);
    expect((await db.outfits.get(o.id))?.itemIds).toEqual([...o.itemIds, 'bra', 'calze']);
    await saveOutfitLayout(db, o.id, [{ itemId: 'x', x: 0.2, y: 0.3, scale: 0.4, z: 1 }]);
    expect((await db.outfits.get(o.id))?.layout).toHaveLength(1);
    expect(await toggleOutfitFavorite(db, o.id)).toBe(true);
    const copy = await duplicateOutfit(db, o.id);
    expect(copy).toMatchObject({ name: 'A (copia)', favorite: true });
    expect(copy.id).not.toBe(o.id);
    await expect(saveOutfitLayout(db, 'nessuno', [])).rejects.toThrow();
  });

  it('eliminando esce da viaggi e agenda, il diario tiene i capi; Annulla rimette tutto', async () => {
    const { tee, sneakers } = await twoItems();
    const o = await saveOutfit(db, input({ name: 'A', itemIds: [tee.id, sneakers.id] }));
    const trip = createTrip({ name: 'T', startDate: '2026-11-10', endDate: '2026-11-11', outfitIds: [o.id] });
    await db.trips.add(trip);
    await db.planner.add({ date: '2026-11-10', outfitId: o.id, itemIds: [], note: '', createdAt: '', updatedAt: '' });
    const entry = await saveDiaryEntry(db, { date: '2026-11-01', outfitId: o.id, itemIds: [], location: '', people: [], note: '', photoIds: [] });

    const snap = await deleteOutfitCascade(db, o.id);
    expect(await db.outfits.get(o.id)).toBeUndefined();
    expect((await db.trips.get(trip.id))?.outfitIds).toEqual([]);
    expect(await db.planner.get('2026-11-10')).toMatchObject({ outfitId: null, itemIds: [tee.id, sneakers.id] });
    expect(await db.diary.get(entry.id)).toMatchObject({ outfitId: null, itemIds: [tee.id, sneakers.id] });

    await restoreOutfitDeletion(db, snap);
    expect(await db.outfits.get(o.id)).toBeDefined();
    expect((await db.trips.get(trip.id))?.outfitIds).toEqual([o.id]);
    expect((await db.diary.get(entry.id))?.outfitId).toBe(o.id);
  });
});

describe('Indossa e Fine giornata', () => {
  it('scrive lo storico, aggiorna i contatori e mette i capi in attesa', async () => {
    const { tee, sneakers } = await twoItems();
    const o = await saveOutfit(db, input({ name: 'A', itemIds: [tee.id, sneakers.id] }));
    const snap = await wearItems(db, { itemIds: [tee.id, sneakers.id, tee.id], date: '2026-11-06', outfitId: o.id });
    const log = await db.wearLog.toArray();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ outfitId: o.id, itemNames: ['T-shirt', 'Sneakers'], date: '2026-11-06' });
    expect(await db.items.get(tee.id)).toMatchObject({ wearCount: 1, wearsSinceWash: 1, lastWornDate: '2026-11-06' });
    expect(await getSetting(db, 'endOfDay')).toEqual({ date: '2026-11-06', itemIds: [tee.id, sneakers.id] });

    await undoWear(db, snap);
    expect(await db.wearLog.count()).toBe(0);
    expect(await db.items.get(tee.id)).toMatchObject({ wearCount: 0, wearsSinceWash: 0, lastWornDate: null });
    expect(await getSetting(db, 'endOfDay')).toBeNull();
  });

  it('toglie dall’attesa i capi eliminati nel frattempo', async () => {
    const { tee, sneakers } = await twoItems();
    await wearItems(db, { itemIds: [tee.id], date: '2026-11-05', outfitId: null });
    await db.items.delete(tee.id);
    await wearItems(db, { itemIds: [sneakers.id], date: '2026-11-06', outfitId: null });
    expect(await getSetting(db, 'endOfDay')).toEqual({ date: '2026-11-06', itemIds: [sneakers.id] });
  });

  it('una data passata non sposta indietro l’ultima volta', async () => {
    const { tee } = await twoItems();
    await wearItems(db, { itemIds: [tee.id], date: '2026-11-06', outfitId: null });
    await wearItems(db, { itemIds: [tee.id], date: '2026-10-01', outfitId: null });
    expect(await db.items.get(tee.id)).toMatchObject({ wearCount: 2, lastWornDate: '2026-11-06' });
    expect((await getSetting(db, 'endOfDay'))?.date).toBe('2026-11-06');
  });

  it('Fine giornata mette da lavare i capi scelti, con la macchia, e si può annullare', async () => {
    const { tee, sneakers } = await twoItems();
    await wearItems(db, { itemIds: [tee.id, sneakers.id], date: '2026-11-06', outfitId: null });
    const snap = await applyEndOfDay(db, [tee.id], [tee.id]);
    expect(await db.items.get(tee.id)).toMatchObject({ status: 'toWash', hasStain: true });
    expect((await db.items.get(sneakers.id))?.status).toBe('clean');
    expect(await getSetting(db, 'endOfDay')).toBeNull();
    await undoEndOfDay(db, snap);
    expect(await db.items.get(tee.id)).toMatchObject({ status: 'clean', hasStain: false });
    expect((await getSetting(db, 'endOfDay'))?.itemIds).toHaveLength(2);
  });
});

describe('diario', () => {
  it('collega il ricordo alla voce dello storico dello stesso outfit e giorno', async () => {
    const { tee } = await twoItems();
    const o = await saveOutfit(db, input({ name: 'A', itemIds: [tee.id] }));
    await wearItems(db, { itemIds: [tee.id], date: '2026-11-06', outfitId: o.id });
    const entry = await saveDiaryEntry(db, {
      date: '2026-11-06',
      outfitId: o.id,
      itemIds: [],
      location: ' Firenze ',
      people: [' Giulia ', ''],
      note: '',
      photoIds: [],
    });
    expect(entry).toMatchObject({ location: 'Firenze', people: ['Giulia'] });
    expect((await db.wearLog.toArray())[0]?.diaryId).toBe(entry.id);
    await saveDiaryEntry(db, { ...entry, date: '2026-11-05' }, entry.id);
    expect((await db.wearLog.toArray())[0]?.diaryId).toBeNull();
  });

  it('elimina le foto tolte e, eliminando il ricordo, Annulla rimette foto e collegamento', async () => {
    const { tee } = await twoItems();
    await db.photos.bulkAdd([photo('p1'), photo('p2')]);
    const o = await saveOutfit(db, input({ name: 'A', itemIds: [tee.id] }));
    await wearItems(db, { itemIds: [tee.id], date: '2026-11-06', outfitId: o.id });
    const entry = await saveDiaryEntry(db, { date: '2026-11-06', outfitId: o.id, itemIds: [], location: '', people: [], note: 'Cena', photoIds: ['p1', 'p2'] });
    await saveDiaryEntry(db, { ...entry, photoIds: ['p2'] }, entry.id);
    expect(await db.photos.get('p1')).toBeUndefined();

    const snap = await deleteDiaryEntry(db, entry.id);
    expect(await db.diary.count()).toBe(0);
    expect(await db.photos.get('p2')).toBeUndefined();
    expect((await db.wearLog.toArray())[0]?.diaryId).toBeNull();
    await restoreDiaryEntry(db, snap);
    expect(await db.diary.get(entry.id)).toMatchObject({ note: 'Cena', photoIds: ['p2'] });
    expect(await db.photos.get('p2')).toBeDefined();
    expect((await db.wearLog.toArray())[0]?.diaryId).toBe(entry.id);
  });

  it('scarta le foto di un ricordo non salvato', async () => {
    await db.photos.bulkAdd([photo('a'), photo('b')]);
    await discardPhotos(db, ['a']);
    expect(await db.photos.count()).toBe(1);
    await discardPhotos(db, []);
    expect(await db.photos.count()).toBe(1);
  });
});
