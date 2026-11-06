import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmadioDB } from './schema';
import { ChangeTracker } from './changes';
import {
  addCategory,
  completeOnboarding,
  deleteCategory,
  deleteDemoData,
  deleteItemCascade,
  getCategories,
  getItemUsage,
  getSetting,
  hasDemoData,
  moveCategory,
  restoreItemDeletion,
  setupNewWardrobe,
  updateCategory,
  wipeEverything,
  appendErrorLog,
} from './repo';
import { createItem, createOutfit, createTrip } from '../logic/factories';

let db: ArmadioDB;
let n = 0;

beforeEach(async () => {
  n += 1;
  db = new ArmadioDB(`test-${n}`);
  await setupNewWardrobe(db, { preset: 'neutro', userName: ' Niccolò ', palette: 'salvia', mode: 'system' });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe('primo avvio', () => {
  it('crea categorie, liste e impostazioni', async () => {
    expect((await getCategories(db)).length).toBeGreaterThan(10);
    expect(await db.lists.where('kind').equals('owner').count()).toBe(3);
    expect((await getSetting(db, 'profile'))?.userName).toBe('Niccolò');
    expect((await getSetting(db, 'theme'))?.palette).toBe('salvia');
    expect((await getSetting(db, 'occasionMatrix'))?.length).toBe(3);
    expect((await getSetting(db, 'app'))?.onboarded).toBe(false);
    await completeOnboarding(db);
    expect((await getSetting(db, 'app'))?.onboarded).toBe(true);
  });
});

describe('categorie', () => {
  it('aggiunge in fondo e riordina', async () => {
    const cat = await addCategory(db, { name: '  Kimono ', slotType: 'top_layer', icon: '👘' });
    const all = await getCategories(db);
    expect(all[all.length - 1]?.id).toBe(cat.id);
    expect(cat.name).toBe('Kimono');
    expect(cat.defaultMaxWears).toBe(3);
    await moveCategory(db, cat.id, -1);
    const after = await getCategories(db);
    const layers = after.filter((c) => c.slotType === 'top_layer');
    expect(layers[layers.length - 2]?.id).toBe(cat.id);
    expect(after[after.length - 1]?.slotType).toBe('top_layer');
  });

  it('cambiando slot aggiorna anche i capi', async () => {
    const [cat] = await getCategories(db);
    await db.items.add(createItem({ name: 'Capo' }, cat!));
    await updateCategory(db, cat!.id, { slotType: 'bottom' });
    expect((await db.items.toArray())[0]?.slotType).toBe('bottom');
  });

  it('non elimina una categoria con capi senza destinazione', async () => {
    const [a, b] = await getCategories(db);
    await db.items.add(createItem({ name: 'Capo' }, a!));
    await expect(deleteCategory(db, a!.id, null)).rejects.toThrow(/Scegli/);
    expect(await deleteCategory(db, a!.id, b!.id)).toBe(1);
    const item = (await db.items.toArray())[0];
    expect(item?.categoryId).toBe(b!.id);
    expect(item?.slotType).toBe(b!.slotType);
    expect(await db.categories.get(a!.id)).toBeUndefined();
  });

  it('elimina una categoria vuota', async () => {
    const [a] = await getCategories(db);
    expect(await deleteCategory(db, a!.id, null)).toBe(0);
  });
});

describe('eliminazione capo con Annulla', () => {
  it('toglie il capo ovunque e Annulla ripristina tutto', async () => {
    const [cat] = await getCategories(db);
    const item = createItem({ name: 'Jeans', photoIds: ['p1'] }, cat!);
    const other = createItem({ name: 'T-shirt' }, cat!);
    await db.items.bulkAdd([item, other]);
    await db.photos.add({
      id: 'p1',
      blob: new Blob(['x']),
      thumb: new Blob(['y']),
      width: 10,
      height: 10,
      createdAt: '',
      updatedAt: '',
    });
    const outfit = createOutfit({ name: 'Look', itemIds: [item.id, other.id] });
    const trip = createTrip({ name: 'Roma', startDate: '2026-11-06', endDate: '2026-11-07', extraItemIds: [item.id] });
    await db.outfits.add(outfit);
    await db.trips.add(trip);
    await db.planner.add({ date: '2026-11-06', outfitId: null, itemIds: [item.id], note: '', createdAt: '', updatedAt: '' });
    await db.wearLog.add({
      id: 'w1',
      date: '2026-11-01',
      itemIds: [item.id],
      itemNames: ['Jeans'],
      outfitId: null,
      diaryId: null,
      createdAt: '',
      updatedAt: '',
    });

    expect(await getItemUsage(db, item.id)).toEqual({ outfits: 1, trips: 1, plannerDays: 1 });

    const snap = await deleteItemCascade(db, item.id);
    expect(await db.items.get(item.id)).toBeUndefined();
    expect(await db.photos.get('p1')).toBeUndefined();
    const o = await db.outfits.get(outfit.id);
    expect(o?.itemIds).toEqual([other.id]);
    expect(o?.incomplete).toBe(true);
    expect((await db.trips.get(trip.id))?.extraItemIds).toEqual([]);
    expect((await db.planner.get('2026-11-06'))?.itemIds).toEqual([]);
    expect(await db.wearLog.count()).toBe(1);

    await restoreItemDeletion(db, snap);
    expect((await db.items.get(item.id))?.name).toBe('Jeans');
    expect(await db.photos.get('p1')).toBeDefined();
    expect((await db.outfits.get(outfit.id))?.incomplete).toBe(false);
    expect((await db.trips.get(trip.id))?.extraItemIds).toEqual([item.id]);
    expect((await db.planner.get('2026-11-06'))?.itemIds).toEqual([item.id]);
  });

  it('eliminando un capo intimo lo toglie dai capi collegati, e Annulla lo rimette', async () => {
    const cats = await getCategories(db);
    const under = cats.find((c) => c.slotType === 'underwear')!;
    const top = cats.find((c) => c.slotType === 'top_base')!;
    const bra = createItem({ name: 'Reggiseno' }, under);
    const tee = createItem({ name: 'Maglietta', underwearIds: [bra.id, 'altro'] }, top);
    await db.items.bulkAdd([bra, tee]);
    const snap = await deleteItemCascade(db, bra.id);
    expect((await db.items.get(tee.id))?.underwearIds).toEqual(['altro']);
    await restoreItemDeletion(db, snap);
    expect((await db.items.get(tee.id))?.underwearIds).toEqual([bra.id, 'altro']);
    expect(await db.items.get(bra.id)).toBeDefined();
  });
});

describe('dati di esempio e svuota', () => {
  it('elimina solo i record demo', async () => {
    const [cat] = await getCategories(db);
    await db.items.bulkAdd([createItem({ name: 'Demo', demo: true }, cat!), createItem({ name: 'Mio' }, cat!)]);
    expect(await hasDemoData(db)).toBe(true);
    expect(await deleteDemoData(db)).toBe(1);
    expect(await hasDemoData(db)).toBe(false);
    expect(await db.items.count()).toBe(1);
  });

  it('svuota tutto', async () => {
    await wipeEverything(db);
    expect(await db.categories.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
  });
});

describe('contatore modifiche e registro errori', () => {
  it('conta le modifiche e ignora quelle in blocco', async () => {
    const tracker = new ChangeTracker(db, 5);
    const [cat] = await getCategories(db);
    await db.items.add(createItem({ name: 'A' }, cat!));
    await db.items.add(createItem({ name: 'B' }, cat!));
    await tracker.flush();
    expect((await getSetting(db, 'backup'))?.changesSinceBackup).toBe(2);
    await tracker.withoutTracking(() => db.items.add(createItem({ name: 'C' }, cat!)));
    await tracker.flush();
    expect((await getSetting(db, 'backup'))?.changesSinceBackup).toBe(2);
  });

  it('tiene al massimo 50 errori', async () => {
    for (let i = 0; i < 55; i++) await appendErrorLog(db, `errore ${i}`);
    const log = await getSetting(db, 'errorLog');
    expect(log).toHaveLength(50);
    expect(log?.[49]?.message).toBe('errore 54');
  });
});
