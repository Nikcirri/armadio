import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { UNDERWEAR_CATEGORY_IDS } from '../logic/presets';
import { ArmadioDB, SCHEMA_VERSION } from './schema';

// Database com'era con lo schema 1 (versione 1.0 dell'app).
async function createV1(name: string, seed: (db: Dexie) => Promise<void>): Promise<void> {
  const old = new Dexie(name);
  old.version(1).stores({
    photos: 'id',
    categories: 'id, slotType, order',
    items: 'id, categoryId, slotType, status, locationId, ownerId, lastWornDate, createdAt',
    wearLog: 'id, date, *itemIds, outfitId',
    outfits: 'id, createdAt',
    diary: 'id, date, outfitId',
    planner: 'date',
    trips: 'id, startDate, status',
    wishlist: 'id, createdAt',
    lists: 'id, kind, [kind+order]',
    settings: 'key',
  });
  await old.open();
  await seed(old);
  old.close();
}

describe('migrazione allo schema 2', () => {
  it('aggiunge underwearIds ai capi e le categorie di intimo del preset, senza toccare il resto', async () => {
    const name = `migr-${Math.random()}`;
    await createV1(name, async (db) => {
      await db.table('categories').bulkAdd([
        { id: 'tee', name: 'T-shirt', slotType: 'top_base', order: 0 },
        { id: 'shoes', name: 'Sneakers', slotType: 'shoes', order: 1 },
      ]);
      await db.table('items').add({ id: 'i1', name: 'Maglietta bianca', categoryId: 'tee', slotType: 'top_base', status: 'clean', intimateNote: 'nude' });
      await db.table('settings').add({ key: 'preset', value: 'donna' });
    });
    const db = new ArmadioDB(name);
    await db.open();
    expect(SCHEMA_VERSION).toBe(4);
    const item = await db.items.get('i1');
    expect(item).toMatchObject({ name: 'Maglietta bianca', intimateNote: 'nude', underwearIds: [] });
    const cats = await db.categories.orderBy('order').toArray();
    expect(cats.map((c) => [c.name, c.slotType])).toEqual([
      ['T-shirt', 'top_base'],
      ['Sneakers', 'shoes'],
      ['Reggiseni', 'underwear'],
      ['Slip e culotte', 'underwear'],
      ['Calze e collant', 'underwear'],
    ]);
    expect(cats[2]!.id).toBe(UNDERWEAR_CATEGORY_IDS.bra);
    db.close();
    // riaprendo non succede niente di nuovo
    const again = new ArmadioDB(name);
    expect(await again.categories.count()).toBe(5);
    again.close();
  });

  it('schema 3: un armadio Neutro della versione 1.1 riceve Reggiseni', async () => {
    const name = `migr-${Math.random()}`;
    const v2 = new Dexie(name);
    // stesso schema della versione 1.1 (lo schema 2 non cambia gli indici)
    v2.version(2).stores({
      photos: 'id',
      categories: 'id, slotType, order',
      items: 'id, categoryId, slotType, status, locationId, ownerId, lastWornDate, createdAt',
      wearLog: 'id, date, *itemIds, outfitId',
      outfits: 'id, createdAt',
      diary: 'id, date, outfitId',
      planner: 'date',
      trips: 'id, startDate, status',
      wishlist: 'id, createdAt',
      lists: 'id, kind, [kind+order]',
      settings: 'key',
    });
    await v2.open();
    await v2.table('categories').bulkAdd([
      { id: 'tee', name: 'T-shirt', slotType: 'top_base', order: 0 },
      { id: UNDERWEAR_CATEGORY_IDS.briefs, name: 'Intimo', slotType: 'underwear', order: 1 },
    ]);
    await v2.table('settings').add({ key: 'preset', value: 'neutro' });
    v2.close();
    const db = new ArmadioDB(name);
    const cats = await db.categories.orderBy('order').toArray();
    expect(cats.map((c) => c.name)).toEqual(['T-shirt', 'Intimo', 'Reggiseni']);
    db.close();
  });

  it('schema 4: un armadio Uomo della versione 1.2 riceve Reggiseni', async () => {
    const name = `migr-${Math.random()}`;
    const v3 = new Dexie(name);
    v3.version(3).stores({
      photos: 'id',
      categories: 'id, slotType, order',
      items: 'id, categoryId, slotType, status, locationId, ownerId, lastWornDate, createdAt',
      wearLog: 'id, date, *itemIds, outfitId',
      outfits: 'id, createdAt',
      diary: 'id, date, outfitId',
      planner: 'date',
      trips: 'id, startDate, status',
      wishlist: 'id, createdAt',
      lists: 'id, kind, [kind+order]',
      settings: 'key',
    });
    await v3.open();
    await v3.table('categories').bulkAdd([
      { id: 'tee', name: 'T-shirt', slotType: 'top_base', order: 0 },
      { id: UNDERWEAR_CATEGORY_IDS.briefs, name: 'Boxer e slip', slotType: 'underwear', order: 1 },
      { id: UNDERWEAR_CATEGORY_IDS.socks, name: 'Calzini', slotType: 'underwear', order: 2 },
    ]);
    await v3.table('settings').add({ key: 'preset', value: 'uomo' });
    v3.close();
    const db = new ArmadioDB(name);
    const cats = await db.categories.orderBy('order').toArray();
    expect(cats.map((c) => [c.name, c.slotType, c.defaultMaxWears ?? null])).toEqual([
      ['T-shirt', 'top_base', null],
      ['Boxer e slip', 'underwear', null],
      ['Calzini', 'underwear', null],
      ['Reggiseni', 'underwear', 3],
    ]);
    db.close();
  });

  it('non aggiunge categorie se l’app non era ancora configurata', async () => {
    const name = `migr-${Math.random()}`;
    await createV1(name, async () => {});
    const db = new ArmadioDB(name);
    expect(await db.categories.count()).toBe(0);
    db.close();
  });
});
