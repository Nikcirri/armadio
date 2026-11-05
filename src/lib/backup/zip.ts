import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8 } from 'fflate';
import type { ArmadioDB } from '../db/schema';
import { SCHEMA_VERSION } from '../db/schema';
import type { PhotoRecord } from '../db/types';
import {
  BACKUP_FORMAT,
  BackupError,
  DATA_FILE,
  mergeRecords,
  mergeSettings,
  mimeForPath,
  parseBackup,
  photoPaths,
  replaceSettings,
  type BackupData,
  type BackupPhotoEntry,
  type BackupTables,
} from '../logic/backupFormat';
import { DEVICE_SETTINGS } from '../logic/backupFormat';

/** Dove finiscono i byte del backup (file sul telefono o Blob nel browser). */
export interface BackupSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface ProgressInfo {
  done: number;
  total: number;
}

const PHOTO_BATCH = 20;

async function readTables(db: ArmadioDB): Promise<BackupTables> {
  return db.transaction('r', db.tables.filter((t) => t.name !== 'photos'), async () => {
    const [categories, items, wearLog, outfits, diary, planner, trips, wishlist, lists, settings] = await Promise.all([
      db.categories.toArray(),
      db.items.toArray(),
      db.wearLog.toArray(),
      db.outfits.toArray(),
      db.diary.toArray(),
      db.planner.toArray(),
      db.trips.toArray(),
      db.wishlist.toArray(),
      db.lists.toArray(),
      db.settings.toArray(),
    ]);
    return {
      categories,
      items,
      wearLog,
      outfits,
      diary,
      planner,
      trips,
      wishlist,
      lists,
      settings: settings.filter((s) => !DEVICE_SETTINGS.includes(s.key)),
    };
  });
}

async function forEachPhotoBatch(db: ArmadioDB, fn: (batch: PhotoRecord[]) => Promise<void>): Promise<void> {
  const keys = await db.photos.toCollection().primaryKeys();
  for (let i = 0; i < keys.length; i += PHOTO_BATCH) {
    const batch = (await db.photos.bulkGet(keys.slice(i, i + PHOTO_BATCH))).filter(
      (p): p is PhotoRecord => !!p,
    );
    await fn(batch);
  }
}

/**
 * Scrive il backup ZIP un pezzo alla volta: data.json per primo, poi le foto.
 * Le foto non vengono ricompresse (sono già WebP).
 */
export async function exportBackup(
  db: ArmadioDB,
  sink: BackupSink,
  opts: { appVersion: string; now?: Date; onProgress?: (p: ProgressInfo) => void },
): Promise<{ photos: number; items: number }> {
  const tables = await readTables(db);
  const photos: BackupPhotoEntry[] = [];
  await forEachPhotoBatch(db, async (batch) => {
    for (const p of batch) {
      const mainType = p.blob.type || 'image/webp';
      const thumbType = p.thumb.type || 'image/webp';
      photos.push({
        id: p.id,
        width: p.width,
        height: p.height,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        ...(p.demo ? { demo: true } : {}),
        ...photoPaths(p.id, mainType, thumbType),
        mainType,
        thumbType,
      });
    }
  });

  const data: BackupData = {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: opts.appVersion,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    tables,
    photos,
  };

  const queue: Uint8Array[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else queue.push(chunk);
  });
  const drain = async () => {
    if (zipError) throw zipError;
    while (queue.length) await sink.write(queue.shift()!);
  };

  const json = new ZipDeflate(DATA_FILE, { level: 6 });
  zip.add(json);
  json.push(strToU8(JSON.stringify(data)), true);
  await drain();

  const total = photos.length;
  let done = 0;
  opts.onProgress?.({ done, total });
  const byId = new Map(photos.map((p) => [p.id, p]));
  await forEachPhotoBatch(db, async (batch) => {
    for (const p of batch) {
      const entry = byId.get(p.id);
      if (!entry) continue;
      for (const [path, blob] of [
        [entry.main, p.blob],
        [entry.thumb, p.thumb],
      ] as const) {
        const file = new ZipPassThrough(path);
        zip.add(file);
        file.push(new Uint8Array(await blob.arrayBuffer()), true);
        await drain();
      }
      done += 1;
      opts.onProgress?.({ done, total });
    }
  });

  zip.end();
  await drain();
  await sink.close();
  return { photos: total, items: tables.items.length };
}

/** Sink in memoria (versione web e test): alla fine restituisce un Blob. */
export class BlobSink implements BackupSink {
  private parts: BlobPart[] = [];
  blob: Blob | null = null;
  async write(chunk: Uint8Array): Promise<void> {
    this.parts.push(chunk.slice());
  }
  async close(): Promise<void> {
    this.blob = new Blob(this.parts, { type: 'application/zip' });
    this.parts = [];
  }
}

type EntryHandler = (name: string) => ((chunk: Uint8Array, final: boolean) => void) | null;

/**
 * Legge lo ZIP a pezzi. Se `handler` restituisce null l'elemento viene saltato.
 * `afterChunk` viene atteso dopo ogni pezzo letto: serve a scrivere nel database senza accumulare memoria.
 */
async function streamZip(
  file: Blob,
  handler: EntryHandler,
  opts: { shouldStop?: () => boolean; afterChunk?: () => Promise<void> } = {},
): Promise<void> {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let entryError: unknown = null;
  unzip.onfile = (entry) => {
    const onChunk = handler(entry.name);
    if (!onChunk) return;
    entry.ondata = (err, chunk, final) => {
      if (err) {
        entryError = err;
        return;
      }
      try {
        onChunk(chunk, final);
      } catch (e) {
        entryError = e;
      }
    };
    entry.start();
  };
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        unzip.push(new Uint8Array(0), true);
        break;
      }
      unzip.push(value, false);
      if (entryError) throw entryError;
      if (opts.afterChunk) await opts.afterChunk();
      if (opts.shouldStop?.()) break;
    }
    if (entryError) throw entryError;
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError('Il file ZIP è danneggiato o incompleto.');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Primo passaggio: legge solo data.json (è all'inizio del file) e lo verifica. */
export async function readBackupData(file: Blob): Promise<BackupData> {
  const parts: Uint8Array[] = [];
  let finished = false;
  await streamZip(
    file,
    (name) =>
      name === DATA_FILE
        ? (chunk, final) => {
            parts.push(chunk);
            if (final) finished = true;
          }
        : null,
    { shouldStop: () => finished },
  );
  if (!finished) throw new BackupError('Nel file manca data.json: non è un backup di Armadio.');
  const size = parts.reduce((a, c) => a + c.length, 0);
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of parts) {
    all.set(c, offset);
    offset += c.length;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(all));
  } catch {
    throw new BackupError('data.json non è leggibile: il backup è danneggiato.');
  }
  return parseBackup(raw, SCHEMA_VERSION);
}

export type RestoreMode = 'replace' | 'merge';

/** Secondo passaggio: scrive dati e foto. Nel modo "replace" prima svuota tutto (tranne le impostazioni del telefono). */
export async function applyBackup(
  db: ArmadioDB,
  file: Blob,
  data: BackupData,
  mode: RestoreMode,
  onProgress?: (p: ProgressInfo) => void,
): Promise<{ photos: number }> {
  const t = data.tables;
  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      const keepSettings = await db.settings.bulkGet([...DEVICE_SETTINGS]);
      await Promise.all(db.tables.map((table) => table.clear()));
      await db.settings.bulkPut(keepSettings.filter((s): s is NonNullable<typeof s> => !!s));
      await db.categories.bulkPut(t.categories);
      await db.items.bulkPut(t.items);
      await db.wearLog.bulkPut(t.wearLog);
      await db.outfits.bulkPut(t.outfits);
      await db.diary.bulkPut(t.diary);
      await db.planner.bulkPut(t.planner);
      await db.trips.bulkPut(t.trips);
      await db.wishlist.bulkPut(t.wishlist);
      await db.lists.bulkPut(t.lists);
      await db.settings.bulkPut(replaceSettings(t.settings));
    } else {
      const byId = (r: { id: string }) => r.id;
      await db.categories.bulkPut(mergeRecords(await db.categories.toArray(), t.categories, byId));
      await db.items.bulkPut(mergeRecords(await db.items.toArray(), t.items, byId));
      await db.wearLog.bulkPut(mergeRecords(await db.wearLog.toArray(), t.wearLog, byId));
      await db.outfits.bulkPut(mergeRecords(await db.outfits.toArray(), t.outfits, byId));
      await db.diary.bulkPut(mergeRecords(await db.diary.toArray(), t.diary, byId));
      await db.planner.bulkPut(mergeRecords(await db.planner.toArray(), t.planner, (r) => r.date));
      await db.trips.bulkPut(mergeRecords(await db.trips.toArray(), t.trips, byId));
      await db.wishlist.bulkPut(mergeRecords(await db.wishlist.toArray(), t.wishlist, byId));
      await db.lists.bulkPut(mergeRecords(await db.lists.toArray(), t.lists, byId));
      await db.settings.bulkPut(mergeSettings(await db.settings.toArray(), t.settings));
    }
  });

  const existing = mode === 'merge' ? new Set(await db.photos.toCollection().primaryKeys()) : new Set<string>();
  const wanted = new Map<string, { entry: BackupPhotoEntry; kind: 'main' | 'thumb' }>();
  for (const entry of data.photos) {
    if (existing.has(entry.id)) continue;
    wanted.set(entry.main, { entry, kind: 'main' });
    wanted.set(entry.thumb, { entry, kind: 'thumb' });
  }
  const total = new Set([...wanted.values()].map((w) => w.entry.id)).size;
  const partial = new Map<string, { main?: Blob; thumb?: Blob }>();
  const ready: PhotoRecord[] = [];
  let written = 0;
  onProgress?.({ done: 0, total });

  const flush = async () => {
    if (!ready.length) return;
    const batch = ready.splice(0, ready.length);
    await db.photos.bulkPut(batch);
    written += batch.length;
    onProgress?.({ done: written, total });
  };

  const onEntry: EntryHandler = (name) => {
    const target = wanted.get(name);
    if (!target) return null;
    const chunks: Uint8Array[] = [];
    return (chunk, final) => {
      chunks.push(chunk.slice());
      if (!final) return;
      const e = target.entry;
      const type = (target.kind === 'main' ? e.mainType : e.thumbType) || mimeForPath(name);
      const slot = partial.get(e.id) ?? {};
      slot[target.kind] = new Blob(chunks as BlobPart[], { type });
      if (!slot.main || !slot.thumb) {
        partial.set(e.id, slot);
        return;
      }
      partial.delete(e.id);
      ready.push({
        id: e.id,
        blob: slot.main,
        thumb: slot.thumb,
        width: e.width,
        height: e.height,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        ...(e.demo ? { demo: true } : {}),
      });
    };
  };

  await streamZip(file, onEntry, {
    afterChunk: async () => {
      if (ready.length >= PHOTO_BATCH) await flush();
    },
  });
  await flush();
  return { photos: written };
}
