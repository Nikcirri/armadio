import type {
  CategoryRecord,
  DiaryRecord,
  ItemRecord,
  ListRecord,
  OutfitRecord,
  PlannerRecord,
  SettingKey,
  SettingRecord,
  TripRecord,
  WearLogRecord,
  WishlistRecord,
} from '../db/types';
import { categoriesToAddV2, categoriesToAddV3, categoriesToAddV4, itemToV2 } from './migrations';
import { daysBetween, fileStamp, nowIso } from './util';

// SPEC.md, sezione 10: file ZIP con data.json + cartella photos/.

export const BACKUP_FORMAT = 'armadio-backup';
export const DATA_FILE = 'data.json';

/** Impostazioni legate al singolo telefono: non vengono copiate da un backup. */
export const DEVICE_SETTINGS: readonly SettingKey[] = ['backup', 'errorLog', 'updates', 'lastVersion'];

export interface BackupPhotoEntry {
  id: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  demo?: boolean;
  main: string;
  thumb: string;
  mainType: string;
  thumbType: string;
}

export interface BackupTables {
  categories: CategoryRecord[];
  items: ItemRecord[];
  wearLog: WearLogRecord[];
  outfits: OutfitRecord[];
  diary: DiaryRecord[];
  planner: PlannerRecord[];
  trips: TripRecord[];
  wishlist: WishlistRecord[];
  lists: ListRecord[];
  settings: SettingRecord[];
}

export type BackupTableName = keyof BackupTables;

export const BACKUP_TABLES: readonly BackupTableName[] = [
  'categories',
  'items',
  'wearLog',
  'outfits',
  'diary',
  'planner',
  'trips',
  'wishlist',
  'lists',
  'settings',
];

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  tables: BackupTables;
  photos: BackupPhotoEntry[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

/** Migrazioni dei backup: la chiave è la versione DI PARTENZA (stesse regole del database). */
export const BACKUP_MIGRATIONS: Record<number, (data: BackupData) => BackupData> = {
  // Schema 2: intimo collegato ai capi e categorie di intimo del preset.
  1: (data) => {
    const preset = data.tables.settings.find((s) => s.key === 'preset')?.value;
    const add = categoriesToAddV2(preset, data.tables.categories, data.exportedAt || nowIso());
    return {
      ...data,
      schemaVersion: 2,
      tables: {
        ...data.tables,
        items: data.tables.items.map((i) => itemToV2(i)),
        categories: [...data.tables.categories, ...add],
      },
    };
  },
  // Schema 3: Reggiseni anche nel preset Neutro.
  2: (data) => {
    const preset = data.tables.settings.find((s) => s.key === 'preset')?.value;
    const add = categoriesToAddV3(preset, data.tables.categories, data.exportedAt || nowIso());
    return { ...data, schemaVersion: 3, tables: { ...data.tables, categories: [...data.tables.categories, ...add] } };
  },
  // Schema 4: Reggiseni in tutti i preset.
  3: (data) => {
    const add = categoriesToAddV4(data.tables.categories, data.exportedAt || nowIso());
    return { ...data, schemaVersion: 4, tables: { ...data.tables, categories: [...data.tables.categories, ...add] } };
  },
};

export function migrateBackup(data: BackupData, targetVersion: number): BackupData {
  if (data.schemaVersion > targetVersion) {
    throw new BackupError(
      'Questo backup arriva da una versione più nuova dell’app. Aggiorna l’app e poi riprova.',
    );
  }
  let current = data;
  while (current.schemaVersion < targetVersion) {
    const step = BACKUP_MIGRATIONS[current.schemaVersion];
    if (!step) {
      throw new BackupError(`Manca la migrazione dalla versione ${current.schemaVersion} del backup.`);
    }
    const next = step(current);
    if (next.schemaVersion <= current.schemaVersion) {
      throw new BackupError('Migrazione del backup non valida.');
    }
    current = next;
  }
  return current;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Controlla il contenuto di data.json e lo porta alla versione corrente dello schema. */
export function parseBackup(raw: unknown, targetVersion: number): BackupData {
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
    throw new BackupError('Questo file non è un backup di Armadio.');
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
    throw new BackupError('Il backup è danneggiato (versione mancante).');
  }
  if (!isRecord(raw.tables)) throw new BackupError('Il backup è danneggiato (dati mancanti).');
  const tables: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) {
    const value = raw.tables[name];
    if (value === undefined) {
      tables[name] = [];
    } else if (Array.isArray(value)) {
      tables[name] = value;
    } else {
      throw new BackupError(`Il backup è danneggiato (tabella ${name}).`);
    }
  }
  const photos = raw.photos === undefined ? [] : raw.photos;
  if (!Array.isArray(photos)) throw new BackupError('Il backup è danneggiato (foto).');
  for (const p of photos) {
    if (!isRecord(p) || typeof p.id !== 'string' || typeof p.main !== 'string' || typeof p.thumb !== 'string') {
      throw new BackupError('Il backup è danneggiato (elenco foto).');
    }
  }
  const data: BackupData = {
    format: BACKUP_FORMAT,
    schemaVersion: raw.schemaVersion,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : 'sconosciuta',
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    tables: tables as unknown as BackupTables,
    photos: photos as BackupPhotoEntry[],
  };
  return migrateBackup(data, targetVersion);
}

export interface BackupSummary {
  items: number;
  outfits: number;
  photos: number;
  trips: number;
  diary: number;
  wishlist: number;
  categories: number;
  exportedAt: string;
  appVersion: string;
}

export function summarizeBackup(data: BackupData): BackupSummary {
  return {
    items: data.tables.items.length,
    outfits: data.tables.outfits.length,
    photos: data.photos.length,
    trips: data.tables.trips.length,
    diary: data.tables.diary.length,
    wishlist: data.tables.wishlist.length,
    categories: data.tables.categories.length,
    exportedAt: data.exportedAt,
    appVersion: data.appVersion,
  };
}

/** Record da scrivere per unire: quelli nuovi e quelli più recenti (updatedAt) di quelli presenti. */
export function mergeRecords<T extends { updatedAt?: string }>(
  existing: readonly T[],
  incoming: readonly T[],
  keyOf: (r: T) => string,
): T[] {
  const current = new Map(existing.map((r) => [keyOf(r), r]));
  return incoming.filter((r) => {
    const mine = current.get(keyOf(r));
    if (!mine) return true;
    return (r.updatedAt ?? '') > (mine.updatedAt ?? '');
  });
}

/** Impostazioni da scrivere: nel modo "Unisci" si aggiungono solo quelle mancanti. */
export function mergeSettings(existing: readonly SettingRecord[], incoming: readonly SettingRecord[]): SettingRecord[] {
  const have = new Set(existing.map((s) => s.key));
  return incoming.filter((s) => !have.has(s.key) && !DEVICE_SETTINGS.includes(s.key));
}

/** Impostazioni da scrivere nel modo "Sostituisci tutto": tutte tranne quelle del telefono. */
export function replaceSettings(incoming: readonly SettingRecord[]): SettingRecord[] {
  return incoming.filter((s) => !DEVICE_SETTINGS.includes(s.key));
}

export function extensionFor(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return 'bin';
}

export function mimeForPath(path: string): string {
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export function photoPaths(id: string, mainType: string, thumbType: string): { main: string; thumb: string } {
  return {
    main: `photos/${id}.${extensionFor(mainType)}`,
    thumb: `photos/${id}-thumb.${extensionFor(thumbType)}`,
  };
}

export type BackupKind = 'manual' | 'auto' | 'preRestore';

export function backupFileName(kind: BackupKind, now: Date = new Date()): string {
  const stamp = fileStamp(now);
  if (kind === 'auto') return `Armadio-auto-${stamp}.zip`;
  if (kind === 'preRestore') return `Armadio-prima-del-ripristino-${stamp}.zip`;
  return `Armadio-backup-${stamp}.zip`;
}

export const REMINDER_CHANGES = 10;
export const REMINDER_DAYS = 14;

/** Mostrare il badge "Salva un backup"? Dopo 10 modifiche o 14 giorni con modifiche non salvate. */
export function needsBackupReminder(input: {
  enabled: boolean;
  changes: number;
  lastBackupDate: string | null;
  appCreatedAt: string;
  now: string;
}): boolean {
  if (!input.enabled || input.changes <= 0) return false;
  if (input.changes >= REMINDER_CHANGES) return true;
  const since = input.lastBackupDate ?? input.appCreatedAt;
  return daysBetween(since, input.now) >= REMINDER_DAYS;
}

export const AUTO_BACKUP_DAYS = 7;
export const AUTO_BACKUP_KEEP = 3;

export function shouldRunAutoBackup(input: {
  enabled: boolean;
  hasData: boolean;
  lastAutoBackupDate: string | null;
  now: string;
}): boolean {
  if (!input.enabled || !input.hasData) return false;
  if (!input.lastAutoBackupDate) return true;
  return daysBetween(input.lastAutoBackupDate, input.now) >= AUTO_BACKUP_DAYS;
}

/** Backup automatici da cancellare: tutti tranne gli ultimi `keep` (i nomi contengono la data). */
export function autoBackupsToDelete(names: readonly string[], keep = AUTO_BACKUP_KEEP): string[] {
  const autos = names.filter((n) => n.startsWith('Armadio-auto-') && n.endsWith('.zip')).sort();
  return autos.slice(0, Math.max(0, autos.length - keep));
}
