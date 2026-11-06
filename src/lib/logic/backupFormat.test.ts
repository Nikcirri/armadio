import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_MIGRATIONS,
  BackupError,
  autoBackupsToDelete,
  backupFileName,
  mergeRecords,
  mergeSettings,
  migrateBackup,
  needsBackupReminder,
  parseBackup,
  photoPaths,
  replaceSettings,
  shouldRunAutoBackup,
  summarizeBackup,
  type BackupData,
} from './backupFormat';

const base = {
  format: BACKUP_FORMAT,
  schemaVersion: 1,
  appVersion: '0.1.0',
  exportedAt: '2026-11-05T10:00:00.000Z',
  tables: { items: [{ id: 'a' }], categories: [] },
  photos: [{ id: 'p', main: 'photos/p.webp', thumb: 'photos/p-thumb.webp' }],
};

describe('lettura del backup', () => {
  it('accetta un backup valido e completa le tabelle mancanti', () => {
    const data = parseBackup(base, 1);
    expect(data.tables.items).toHaveLength(1);
    expect(data.tables.outfits).toEqual([]);
    expect(summarizeBackup(data)).toMatchObject({ items: 1, photos: 1, outfits: 0 });
  });

  it('rifiuta file che non sono backup', () => {
    expect(() => parseBackup({ hello: 1 }, 1)).toThrow(BackupError);
    expect(() => parseBackup(null, 1)).toThrow(/non è un backup/);
    expect(() => parseBackup({ ...base, tables: { items: 'x' } }, 1)).toThrow(/tabella items/);
    expect(() => parseBackup({ ...base, photos: [{ id: 1 }] }, 1)).toThrow(/foto/);
  });

  it('rifiuta backup di versioni più nuove', () => {
    expect(() => parseBackup({ ...base, schemaVersion: 9 }, 1)).toThrow(/più nuova/);
  });

  it('applica le migrazioni in ordine', () => {
    const data = parseBackup(base, 1);
    BACKUP_MIGRATIONS[2] = (d: BackupData) => ({ ...d, schemaVersion: 3, appVersion: 'migrato' });
    try {
      expect(migrateBackup(data, 3)).toMatchObject({ schemaVersion: 3, appVersion: 'migrato' });
    } finally {
      delete BACKUP_MIGRATIONS[2];
    }
    expect(() => migrateBackup(data, 3)).toThrow(/Manca la migrazione dalla versione 2/);
  });

  it('schema 2: intimo collegato ai capi e categorie di intimo del preset', () => {
    const v1 = {
      ...base,
      tables: {
        items: [{ id: 'a' }, { id: 'b', underwearIds: ['x', 3] }],
        categories: [{ id: 'c1', slotType: 'top_base', order: 0 }, { id: 'c2', slotType: 'shoes', order: 4 }],
        settings: [{ key: 'preset', value: 'donna' }],
      },
    };
    const data = parseBackup(v1, 2);
    expect(data.schemaVersion).toBe(2);
    expect(data.tables.items.map((i) => i.underwearIds)).toEqual([[], ['x']]);
    const added = data.tables.categories.slice(2);
    expect(added.map((c) => [c.name, c.slotType, c.order])).toEqual([
      ['Reggiseni', 'underwear', 5],
      ['Slip e culotte', 'underwear', 6],
      ['Calze e collant', 'underwear', 7],
    ]);
    // senza categorie (app mai configurata) non aggiunge niente
    expect(parseBackup(base, 2).tables.categories).toEqual([]);
  });
});

describe('unione', () => {
  it('aggiunge i nuovi e sostituisce solo i più recenti', () => {
    const mine = [
      { id: 'a', updatedAt: '2026-11-02' },
      { id: 'b', updatedAt: '2026-11-02' },
    ];
    const theirs = [
      { id: 'a', updatedAt: '2026-11-01' },
      { id: 'b', updatedAt: '2026-11-03' },
      { id: 'c', updatedAt: '2026-11-01' },
    ];
    expect(mergeRecords(mine, theirs, (r) => r.id).map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('non tocca le impostazioni esistenti né quelle del telefono', () => {
    const mine = [{ key: 'theme' as const, value: { palette: 'sabbia' as const, mode: 'system' as const } }];
    const theirs = [
      { key: 'theme' as const, value: { palette: 'cipria' as const, mode: 'dark' as const } },
      { key: 'antiRepeatDays' as const, value: 5 },
      { key: 'errorLog' as const, value: [] },
    ];
    expect(mergeSettings(mine, theirs).map((s) => s.key)).toEqual(['antiRepeatDays']);
    expect(replaceSettings(theirs).map((s) => s.key)).toEqual(['theme', 'antiRepeatDays']);
  });
});

describe('file e promemoria', () => {
  it('crea percorsi e nomi', () => {
    expect(photoPaths('x', 'image/webp', 'image/png')).toEqual({ main: 'photos/x.webp', thumb: 'photos/x-thumb.png' });
    const d = new Date(2026, 10, 5, 21, 58);
    expect(backupFileName('manual', d)).toBe('Armadio-backup-2026-11-05-2158.zip');
    expect(backupFileName('auto', d)).toBe('Armadio-auto-2026-11-05-2158.zip');
  });

  it('promemoria dopo 10 modifiche o 14 giorni', () => {
    const common = { enabled: true, appCreatedAt: '2026-10-01T00:00:00Z', now: '2026-11-05T10:00:00Z' };
    expect(needsBackupReminder({ ...common, changes: 0, lastBackupDate: null })).toBe(false);
    expect(needsBackupReminder({ ...common, changes: 10, lastBackupDate: '2026-11-05T09:00:00Z' })).toBe(true);
    expect(needsBackupReminder({ ...common, changes: 3, lastBackupDate: '2026-11-01T00:00:00Z' })).toBe(false);
    expect(needsBackupReminder({ ...common, changes: 3, lastBackupDate: '2026-10-20T00:00:00Z' })).toBe(true);
    expect(needsBackupReminder({ ...common, changes: 3, lastBackupDate: null })).toBe(true);
    expect(needsBackupReminder({ ...common, enabled: false, changes: 30, lastBackupDate: null })).toBe(false);
  });

  it('backup automatico settimanale', () => {
    const now = '2026-11-05T10:00:00Z';
    expect(shouldRunAutoBackup({ enabled: true, hasData: true, lastAutoBackupDate: null, now })).toBe(true);
    expect(shouldRunAutoBackup({ enabled: true, hasData: true, lastAutoBackupDate: '2026-11-01T10:00:00Z', now })).toBe(false);
    expect(shouldRunAutoBackup({ enabled: true, hasData: true, lastAutoBackupDate: '2026-10-29T10:00:00Z', now })).toBe(true);
    expect(shouldRunAutoBackup({ enabled: true, hasData: false, lastAutoBackupDate: null, now })).toBe(false);
  });

  it('tiene solo gli ultimi 3 backup automatici', () => {
    const names = [
      'Armadio-auto-2026-10-01-1000.zip',
      'Armadio-backup-2026-10-02-1000.zip',
      'Armadio-auto-2026-10-15-1000.zip',
      'Armadio-auto-2026-10-08-1000.zip',
      'Armadio-auto-2026-10-22-1000.zip',
    ];
    expect(autoBackupsToDelete(names)).toEqual(['Armadio-auto-2026-10-01-1000.zip']);
  });
});
