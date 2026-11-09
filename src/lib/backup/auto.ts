import { db } from '../db';
import { countData, getSetting } from '../db/repo';
import { shouldRunAutoBackup } from '../logic/backupFormat';
import { nowIso } from '../logic/util';
import { isNative } from '../platform';

/**
 * True se è il momento del backup automatico settimanale (solo app Android).
 * Sta fuori da service.ts così all'avvio non si carica la libreria ZIP (SPEC.md, sezione 7):
 * quella arriva solo nei giorni in cui il backup va fatto davvero.
 */
export async function isAutoBackupDue(): Promise<boolean> {
  if (!isNative()) return false;
  const backup = await getSetting(db, 'backup');
  if (!backup) return false;
  const counts = await countData(db);
  return shouldRunAutoBackup({
    enabled: backup.autoWeekly,
    hasData: counts.items + counts.outfits + counts.diary > 0,
    lastAutoBackupDate: backup.lastAutoBackupDate,
    now: nowIso(),
  });
}
