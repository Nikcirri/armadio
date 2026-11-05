import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmadioDB } from '../db/schema';
import { getCategories, getSetting, setupNewWardrobe, updateSetting } from '../db/repo';
import { createItem, createOutfit } from '../logic/factories';
import { BlobSink, applyBackup, exportBackup, readBackupData } from './zip';
import { BackupError } from '../logic/backupFormat';
import { Zip, ZipDeflate, strToU8 } from 'fflate';

let n = 0;
const dbs: ArmadioDB[] = [];
function freshDb(): ArmadioDB {
  n += 1;
  const db = new ArmadioDB(`zip-test-${n}`);
  dbs.push(db);
  return db;
}

afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await db.delete();
  }
});

async function seed(db: ArmadioDB) {
  await setupNewWardrobe(db, { preset: 'donna', userName: 'Ada', palette: 'cipria', mode: 'dark' });
  const [cat] = await getCategories(db);
  const photos = Array.from({ length: 25 }, (_, i) => ({
    id: `p${i}`,
    blob: new Blob([new Uint8Array(300 + i).fill(i)], { type: 'image/webp' }),
    thumb: new Blob([new Uint8Array(50).fill(i)], { type: 'image/webp' }),
    width: 600,
    height: 800,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  }));
  await db.photos.bulkAdd(photos);
  const item = createItem({ name: 'Abito rosso', photoIds: ['p0', 'p1'], colors: ['red'] }, cat!);
  await db.items.add(item);
  await db.outfits.add(createOutfit({ name: 'Cena', itemIds: [item.id] }));
  await updateSetting(db, 'backup', { changesSinceBackup: 7 });
  return { item };
}

async function makeZip(db: ArmadioDB): Promise<Blob> {
  const sink = new BlobSink();
  await exportBackup(db, sink, { appVersion: '0.1.0' });
  return sink.blob!;
}

describe('backup ZIP', () => {
  let source: ArmadioDB;
  beforeEach(() => {
    source = freshDb();
  });

  it('esporta e ripristina tutto (Sostituisci)', async () => {
    const { item } = await seed(source);
    const progress: number[] = [];
    const sink = new BlobSink();
    const res = await exportBackup(source, sink, { appVersion: '0.1.0', onProgress: (p) => progress.push(p.done) });
    expect(res).toEqual({ photos: 25, items: 1 });
    expect(progress[progress.length - 1]).toBe(25);
    const zip = sink.blob!;

    const data = await readBackupData(zip);
    expect(data.tables.items[0]?.name).toBe('Abito rosso');
    expect(data.photos).toHaveLength(25);
    // Le impostazioni del telefono non finiscono nel backup.
    expect(data.tables.settings.some((s) => s.key === 'backup')).toBe(false);

    const target = freshDb();
    await setupNewWardrobe(target, { preset: 'uomo', userName: 'Bruno', palette: 'sabbia', mode: 'light' });
    await updateSetting(target, 'backup', { changesSinceBackup: 3 });
    await applyBackup(target, zip, data, 'replace');

    expect((await target.items.get(item.id))?.name).toBe('Abito rosso');
    expect(await target.photos.count()).toBe(25);
    const p5 = await target.photos.get('p5');
    expect(new Uint8Array(await p5!.blob.arrayBuffer())).toEqual(new Uint8Array(305).fill(5));
    expect(p5!.blob.type).toBe('image/webp');
    expect((await getSetting(target, 'profile'))?.userName).toBe('Ada');
    expect((await getSetting(target, 'theme'))?.palette).toBe('cipria');
    // Le impostazioni del telefono di destinazione restano.
    expect((await getSetting(target, 'backup'))?.changesSinceBackup).toBe(3);
    expect(await target.categories.count()).toBe(await source.categories.count());
  });

  it('Unisci aggiunge senza cancellare e senza duplicare le foto', async () => {
    await seed(source);
    const zip = await makeZip(source);
    const data = await readBackupData(zip);

    const target = freshDb();
    await setupNewWardrobe(target, { preset: 'uomo', userName: 'Bruno', palette: 'sabbia', mode: 'light' });
    const [cat] = await getCategories(target);
    await target.items.add(createItem({ name: 'Già mio' }, cat!));
    const before = await target.categories.count();

    await applyBackup(target, zip, data, 'merge');
    expect(await target.items.count()).toBe(2);
    expect(await target.categories.count()).toBe(before + data.tables.categories.length);
    expect((await getSetting(target, 'profile'))?.userName).toBe('Bruno');
    expect(await target.photos.count()).toBe(25);

    const again = await applyBackup(target, zip, data, 'merge');
    expect(again.photos).toBe(0);
    expect(await target.photos.count()).toBe(25);
  });

  it('rifiuta un file che non è un backup', async () => {
    await expect(readBackupData(new Blob(['ciao']))).rejects.toThrow(BackupError);
    const chunks: Uint8Array[] = [];
    const zip = new Zip((_e, c) => chunks.push(c));
    const f = new ZipDeflate('altro.txt');
    zip.add(f);
    f.push(strToU8('x'), true);
    zip.end();
    await expect(readBackupData(new Blob(chunks as BlobPart[]))).rejects.toThrow(/manca data.json/);
  });
});
