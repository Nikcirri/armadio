// Collegamento al plugin Android "AppUpdater" (android/app/src/main/java/com/nikcirri/armadio/AppUpdaterPlugin.java).
// SPEC.md, sezione 11. Si usa solo nell'app Android.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface DownloadRequest {
  url: string;
  version: string;
  size: number;
  sha256: string | null;
}

interface AppUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string; version: string; size: number; sha256?: string }): Promise<{ reused: boolean }>;
  cleanup(): Promise<{ removed: number }>;
  addListener(event: 'progress', handler: (e: { percent: number }) => void): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

/** Android permette all'app di installare aggiornamenti ("Installa app sconosciute")? */
export async function installAllowed(): Promise<boolean> {
  return (await AppUpdater.canInstall()).allowed;
}

/** Apre la schermata "Installa app sconosciute" di Armadio. */
export async function openInstallSettings(): Promise<void> {
  await AppUpdater.openInstallSettings();
}

/** Scarica l'APK nella cache dell'app (o riusa quello già verificato) e apre l'installazione di Android. */
export async function downloadAndInstall(req: DownloadRequest, onProgress: (percent: number) => void): Promise<{ reused: boolean }> {
  const handle = await AppUpdater.addListener('progress', (e) => onProgress(e.percent));
  try {
    return await AppUpdater.downloadAndInstall({
      url: req.url,
      version: req.version,
      size: req.size,
      ...(req.sha256 ? { sha256: req.sha256 } : {}),
    });
  } finally {
    await handle.remove();
  }
}

/** Cancella l'APK scaricato (al primo avvio della versione nuova). */
export async function cleanupDownloads(): Promise<void> {
  await AppUpdater.cleanup();
}
