import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ArmadioDB } from '../db/schema';
import { autoBackupsToDelete, backupFileName, type BackupKind } from '../logic/backupFormat';
import { APP_VERSION, isNative } from '../platform';
import { BlobSink, exportBackup, type BackupSink, type ProgressInfo } from './zip';

const FOLDER = 'Armadio';
const AUTO_FOLDER = 'Armadio/auto';
const FLUSH_BYTES = 512 * 1024;

export function u8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** Scrive il backup in un file del telefono a blocchi di 512 KB (poca memoria anche con tante foto). */
class NativeFileSink implements BackupSink {
  private buffer: Uint8Array[] = [];
  private buffered = 0;
  private started = false;

  constructor(
    private readonly path: string,
    private readonly directory: Directory,
  ) {}

  async write(chunk: Uint8Array): Promise<void> {
    this.buffer.push(chunk.slice());
    this.buffered += chunk.length;
    if (this.buffered >= FLUSH_BYTES) await this.flushToDisk();
  }

  private async flushToDisk(): Promise<void> {
    const all = new Uint8Array(this.buffered);
    let offset = 0;
    for (const c of this.buffer) {
      all.set(c, offset);
      offset += c.length;
    }
    this.buffer = [];
    this.buffered = 0;
    const data = u8ToBase64(all);
    if (!this.started) {
      await Filesystem.writeFile({ path: this.path, directory: this.directory, data, recursive: true });
      this.started = true;
    } else {
      await Filesystem.appendFile({ path: this.path, directory: this.directory, data });
    }
  }

  async close(): Promise<void> {
    if (this.buffered > 0 || !this.started) await this.flushToDisk();
  }
}

export interface SavedBackup {
  name: string;
  /** Dove si trova, in parole semplici, per il messaggio all'utente. */
  placeLabel: string;
  /** file:// (solo app Android). */
  uri?: string;
  /** Solo versione web. */
  blob?: Blob;
}

async function canUseDocuments(): Promise<boolean> {
  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage === 'granted') return true;
    const asked = await Filesystem.requestPermissions();
    return asked.publicStorage === 'granted';
  } catch {
    return false;
  }
}

/** Crea il file di backup: in Documenti/Armadio se possibile, altrimenti nella memoria dell'app. */
export async function saveBackupFile(
  db: ArmadioDB,
  kind: BackupKind,
  onProgress?: (p: ProgressInfo) => void,
): Promise<SavedBackup> {
  const name = backupFileName(kind);
  if (!isNative()) {
    const sink = new BlobSink();
    await exportBackup(db, sink, { appVersion: APP_VERSION, onProgress });
    return { name, placeLabel: 'Download', blob: sink.blob! };
  }

  const folder = kind === 'auto' ? AUTO_FOLDER : FOLDER;
  if (await canUseDocuments()) {
    const path = `${folder}/${name}`;
    try {
      await exportBackup(db, new NativeFileSink(path, Directory.Documents), { appVersion: APP_VERSION, onProgress });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
      return { name, placeLabel: `Documenti/${folder}`, uri };
    } catch (e) {
      console.warn('Documenti non disponibile, uso la memoria dell’app', e);
    }
  }
  const path = `${folder}/${name}`;
  await exportBackup(db, new NativeFileSink(path, Directory.Data), { appVersion: APP_VERSION, onProgress });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  return { name, placeLabel: 'memoria dell’app (condividilo per tenerne una copia)', uri };
}

/** Apre il menu Condividi (Drive, WhatsApp, email…). Se l'utente annulla non succede nulla. */
export async function shareBackupFile(saved: SavedBackup): Promise<void> {
  if (saved.uri) {
    try {
      await Share.share({
        title: 'Backup Armadio',
        text: 'Backup della mia app Armadio. Per ripristinarlo: Altro → Backup e dati → Ripristina.',
        files: [saved.uri],
        dialogTitle: 'Dove vuoi salvare il backup?',
      });
    } catch (e) {
      if (!/cancel/i.test(String(e))) throw e;
    }
    return;
  }
  if (saved.blob) {
    const file = new File([saved.blob], saved.name, { type: 'application/zip' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Backup Armadio' });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(saved.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saved.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Tiene solo gli ultimi 3 backup automatici in Documenti/Armadio/auto. */
export async function cleanupAutoBackups(): Promise<void> {
  if (!isNative()) return;
  try {
    const { files } = await Filesystem.readdir({ path: AUTO_FOLDER, directory: Directory.Documents });
    const names = files.map((f) => f.name);
    for (const name of autoBackupsToDelete(names)) {
      await Filesystem.deleteFile({ path: `${AUTO_FOLDER}/${name}`, directory: Directory.Documents }).catch(
        () => undefined,
      );
    }
  } catch {
    // Cartella non leggibile (es. dopo una reinstallazione): si lascia com'è.
  }
}
