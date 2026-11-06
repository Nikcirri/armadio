import Dexie, { type Table } from 'dexie';
import { categoriesToAddV2, categoriesToAddV3, categoriesToAddV4, itemToV2 } from '../logic/migrations';
import { nowIso } from '../logic/util';
import type {
  CategoryRecord,
  DiaryRecord,
  ItemRecord,
  ListRecord,
  OutfitRecord,
  PhotoRecord,
  PlannerRecord,
  SettingKey,
  SettingRecord,
  TripRecord,
  WearLogRecord,
  WishlistRecord,
} from './types';

/**
 * Versione corrente dello schema. Ogni cambio di schema:
 * 1. aggiunge qui sotto un nuovo `this.version(N).stores(...).upgrade(...)` non distruttivo;
 * 2. aggiunge in `src/lib/logic/backupFormat.ts` la migrazione equivalente per i backup;
 * 3. aggiunge un test per entrambe.
 */
export const SCHEMA_VERSION = 4;

export const DB_NAME = 'ArmadioDB';

export class ArmadioDB extends Dexie {
  photos!: Table<PhotoRecord, string>;
  categories!: Table<CategoryRecord, string>;
  items!: Table<ItemRecord, string>;
  wearLog!: Table<WearLogRecord, string>;
  outfits!: Table<OutfitRecord, string>;
  diary!: Table<DiaryRecord, string>;
  planner!: Table<PlannerRecord, string>;
  trips!: Table<TripRecord, string>;
  wishlist!: Table<WishlistRecord, string>;
  lists!: Table<ListRecord, string>;
  settings!: Table<SettingRecord, SettingKey>;

  constructor(name: string = DB_NAME) {
    super(name);
    // Solo i campi indicizzati: gli altri campi dei record vengono salvati comunque.
    // I booleani non sono indicizzabili in IndexedDB: si filtrano in memoria.
    this.version(1).stores({
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
    // Schema 2 (versione 1.1): intimo collegato ai capi e categorie di intimo del preset.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table('items').toCollection().modify((item: ItemRecord) => {
          Object.assign(item, itemToV2(item));
        });
        const preset = (await tx.table('settings').get('preset')) as SettingRecord | undefined;
        const categories = (await tx.table('categories').toArray()) as CategoryRecord[];
        const add = categoriesToAddV2(preset?.value, categories, nowIso());
        if (add.length) await tx.table('categories').bulkAdd(add);
      });
    // Schema 3 (versione 1.2): Reggiseni anche nel preset Neutro.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        const preset = (await tx.table('settings').get('preset')) as SettingRecord | undefined;
        const categories = (await tx.table('categories').toArray()) as CategoryRecord[];
        const add = categoriesToAddV3(preset?.value, categories, nowIso());
        if (add.length) await tx.table('categories').bulkAdd(add);
      });
    // Schema 4 (versione 1.2.1): Reggiseni predefinita in tutti i preset.
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        const categories = (await tx.table('categories').toArray()) as CategoryRecord[];
        const add = categoriesToAddV4(categories, nowIso());
        if (add.length) await tx.table('categories').bulkAdd(add);
      });
  }
}

/** Tabelle che contano come "modifiche" per il promemoria backup. */
export const TRACKED_TABLES = [
  'photos',
  'categories',
  'items',
  'wearLog',
  'outfits',
  'diary',
  'planner',
  'trips',
  'wishlist',
  'lists',
] as const;
