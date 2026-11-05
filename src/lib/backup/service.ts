import { db, tracker } from '../db';
import { countData, getSetting, updateSetting } from '../db/repo';
import { shouldRunAutoBackup, summarizeBackup, type BackupData, type BackupSummary } from '../logic/backupFormat';
import { nowIso } from '../logic/util';
import { isNative } from '../platform';
import { cleanupAutoBackups, saveBackupFile, shareBackupFile, type SavedBackup } from './device';
import { applyBackup, readBackupData, type ProgressInfo, type RestoreMode } from './zip';

export type { SavedBackup, RestoreMode };

async function markBackupDone(): Promise<void> {
  await tracker.flush();
  tracker.discardPending();
  await updateSetting(db, 'backup', { lastBackupDate: nowIso(), changesSinceBackup: 0 });
}

/** Backup manuale: crea il file, segna la data e apre il menu Condividi. */
export async function exportAndShare(onProgress?: (p: ProgressInfo) => void): Promise<SavedBackup> {
  await tracker.flush();
  const saved = await saveBackupFile(db, 'manual', onProgress);
  await markBackupDone();
  await shareBackupFile(saved);
  return saved;
}

/** Backup automatico settimanale (solo app Android, in silenzio). */
export async function runAutoBackupIfDue(): Promise<boolean> {
  if (!isNative()) return false;
  const backup = await getSetting(db, 'backup');
  if (!backup) return false;
  const counts = await countData(db);
  const due = shouldRunAutoBackup({
    enabled: backup.autoWeekly,
    hasData: counts.items + counts.outfits + counts.diary > 0,
    lastAutoBackupDate: backup.lastAutoBackupDate,
    now: nowIso(),
  });
  if (!due) return false;
  await saveBackupFile(db, 'auto');
  await updateSetting(db, 'backup', { lastAutoBackupDate: nowIso() });
  await cleanupAutoBackups();
  return true;
}

export interface PreparedRestore {
  file: Blob;
  data: BackupData;
  summary: BackupSummary;
}

/** Primo passo del ripristino: legge e controlla il file scelto. */
export async function prepareRestore(file: Blob): Promise<PreparedRestore> {
  const data = await readBackupData(file);
  return { file, data, summary: summarizeBackup(data) };
}

/**
 * Secondo passo: scrive i dati. Con "Sostituisci tutto" prima salva in automatico
 * una copia dei dati attuali (se ce ne sono).
 */
export async function runRestore(
  prepared: PreparedRestore,
  mode: RestoreMode,
  onProgress?: (p: ProgressInfo) => void,
): Promise<{ photos: number; safetyCopy: SavedBackup | null }> {
  let safetyCopy: SavedBackup | null = null;
  if (mode === 'replace') {
    const counts = await countData(db);
    if (counts.items + counts.outfits + counts.diary + counts.photos > 0) {
      safetyCopy = await saveBackupFile(db, 'preRestore');
    }
  }
  await tracker.flush();
  const result = await tracker.withoutTracking(() => applyBackup(db, prepared.file, prepared.data, mode, onProgress));
  if (mode === 'replace') {
    tracker.discardPending();
    await updateSetting(db, 'backup', { changesSinceBackup: 0 });
    await updateSetting(db, 'app', { onboarded: true });
  }
  return { photos: result.photos, safetyCopy };
}
