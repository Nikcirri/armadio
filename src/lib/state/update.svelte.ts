// Aggiornamenti (SPEC.md, sezione 11): controllo all'apertura, al ritorno nell'app e a mano;
// avviso in alto; scaricamento e installazione dentro l'app; messaggio dopo l'aggiornamento.
import { cleanupDownloads, downloadAndInstall, installAllowed, openInstallSettings } from '../appUpdater';
import { db } from '../db';
import { getSetting, setSetting } from '../db/repo';
import { logError, reportError } from '../errors';
import {
  RELEASES_PAGE,
  canDownloadInApp,
  isNewer,
  shouldResume,
  updateAnnouncement,
  type PendingResume,
  type ReleaseInfo,
} from '../logic/updates';
import { APP_VERSION, isNative } from '../platform';
import { autoCheckForUpdates, checkForUpdates, openExternal, type UpdateResult } from '../updates';
import { confirmDialog, showToast } from './ui.svelte';

/** idle: niente in corso; download: scarico; install: installazione di Android aperta; permission: in attesa del permesso. */
export type UpdatePhase = 'idle' | 'download' | 'install' | 'permission';

export const update = $state({
  /** Versione più nuova di quella installata (null se non c'è). */
  available: null as ReleaseInfo | null,
  /** "Dopo": l'avviso di questa versione resta chiuso fino alla prossima apertura dell'app. */
  dismissedVersion: null as string | null,
  phase: 'idle' as UpdatePhase,
  percent: 0,
  checking: false,
  lastResult: null as UpdateResult['kind'] | null,
});

/** L'avviso in alto si vede: c'è una versione nuova non rimandata, oppure un aggiornamento in corso. */
export function bannerVisible(): boolean {
  return !!update.available && (update.phase !== 'idle' || update.dismissedVersion !== update.available.version);
}

// "Sono andato a dare il permesso": in localStorage perché Android può riavviare l'app quando lo cambi.
const RESUME_KEY = 'armadio.updateResume';

function savePending(version: string): void {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ version, at: new Date().toISOString() } satisfies PendingResume));
  } catch {
    // Senza memoria del browser si riprende solo se l'app non viene riavviata.
  }
}

function readPending(): PendingResume | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<PendingResume>) : null;
    return v && typeof v.version === 'string' && typeof v.at === 'string' ? { version: v.version, at: v.at } : null;
  } catch {
    return null;
  }
}

function clearPending(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    // Niente da fare.
  }
}

function setAvailable(release: ReleaseInfo | null): void {
  if (release && isNewer(release.version, APP_VERSION)) update.available = release;
  else if (update.phase === 'idle') update.available = null;
}

let refreshing = false;

/** Controllo silenzioso (solo app Android): GitHub al massimo ogni 10 minuti. */
export async function refreshUpdate(): Promise<void> {
  if (!isNative() || refreshing || update.phase === 'download') return;
  refreshing = true;
  try {
    setAvailable(await autoCheckForUpdates());
    // Android ha riavviato l'app mentre davi il permesso: si riprende da qui.
    const pending = readPending();
    if (pending && update.phase === 'idle') {
      clearPending();
      if (shouldResume(pending, update.available?.version ?? null, new Date())) await continueAfterPermission();
    }
  } catch (e) {
    console.error(e);
  } finally {
    refreshing = false;
  }
}

/** "Controlla aggiornamenti" a mano. */
export async function checkUpdateNow(): Promise<UpdateResult> {
  update.checking = true;
  try {
    const result = await checkForUpdates();
    if (result.kind === 'available') setAvailable(result.release);
    else if (result.kind === 'current') setAvailable(null);
    update.lastResult = result.kind;
    return result;
  } finally {
    update.checking = false;
  }
}

/** "Dopo": chiude l'avviso e dice dove ritrovarlo. */
export function dismissUpdate(): void {
  if (!update.available) return;
  update.dismissedVersion = update.available.version;
  showToast('Lo ritrovi in Altro → Aggiornamenti, oppure nel menu ⋮ → Aggiornamenti.', { duration: 5000 });
}

/** "Scarica da GitHub": la pagina dell'ultima versione nel browser. */
export function downloadFromGitHub(): void {
  openExternal(RELEASES_PAGE);
}

const PLUGIN_ERRORS = new Set(['BAD_URL', 'BAD_VERSION', 'BAD_SIZE', 'BAD_SHA256', 'NETWORK', 'UPDATE_FAILED', 'NO_INSTALLER', 'BUSY', 'NO_PERMISSION']);

function errorCode(e: unknown): string | null {
  return typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : null;
}

/** "Aggiorna": scarica la versione nuova dentro l'app e apre l'installazione di Android. */
export async function installUpdate(): Promise<void> {
  const release = update.available;
  if (!release || update.phase === 'download') return;
  if (!isNative() || !canDownloadInApp(release)) {
    showToast('Apro la pagina di GitHub: scarica il file .apk e aprilo.', { duration: 5000 });
    downloadFromGitHub();
    return;
  }
  try {
    if (!(await installAllowed())) {
      const ok = await confirmDialog({
        title: 'Serve un permesso, una volta sola',
        message:
          'Android chiede di consentire ad Armadio di installare i suoi aggiornamenti.\nNella schermata che si apre attiva «Consenti da questa origine», poi torna indietro: l’aggiornamento riparte da solo.',
        confirmLabel: 'Apri impostazioni',
        cancelLabel: 'Non ora',
      });
      if (!ok) return;
      update.phase = 'permission';
      savePending(release.version);
      await openInstallSettings();
      return;
    }
    update.phase = 'download';
    update.percent = 0;
    await downloadAndInstall(
      { url: release.apkUrl!, version: release.version, size: release.apkSize!, sha256: release.apkSha256 },
      (p) => (update.percent = p),
    );
    update.phase = 'install';
  } catch (e) {
    update.phase = 'idle';
    clearPending();
    const code = errorCode(e);
    if (code === 'NOT_NEWER') {
      update.available = null;
      showToast('Hai già questa versione.');
    } else if (code && PLUGIN_ERRORS.has(code) && e instanceof Error && e.message) {
      logError(e, 'Aggiornamento dall’app');
      showToast(e.message, { duration: 5000 });
    } else {
      reportError(e, 'Non riesco ad aggiornare dall’app. Riprova, oppure usa «Scarica da GitHub».');
    }
  }
}

/** "Aggiorna dall'app" della pagina Aggiornamenti: se non si sa ancora di una versione nuova, prima controlla. */
export async function updateFromApp(): Promise<void> {
  if (update.phase === 'download' || update.checking) return;
  if (!update.available) {
    const r = await checkUpdateNow();
    if (r.kind === 'current') return showToast('Hai già l’ultima versione.');
    if (r.kind === 'offline') return showToast('Sei offline: collegati a internet e riprova.');
    if (r.kind === 'error') return showToast('Non riesco a raggiungere GitHub adesso. Riprova più tardi.');
  }
  await installUpdate();
}

async function continueAfterPermission(): Promise<void> {
  try {
    if (await installAllowed()) await installUpdate();
    else showToast('Permesso non dato: quando vuoi, riprova da «Aggiorna».', { duration: 5000 });
  } catch (e) {
    reportError(e);
  }
}

/** Al ritorno nell'app: dopo l'installazione annullata si torna all'avviso; dopo il permesso si riparte. */
export async function resumeUpdate(): Promise<void> {
  if (update.phase === 'install') {
    update.phase = 'idle';
    return;
  }
  if (update.phase !== 'permission') return;
  update.phase = 'idle';
  clearPending();
  await continueAfterPermission();
}

/** Al primo avvio della versione nuova: "App aggiornata alla versione X" e via l'APK scaricato. */
export async function announceUpdate(onboarded: boolean): Promise<void> {
  const last = (await getSetting(db, 'lastVersion')) ?? null;
  if (last === APP_VERSION) return;
  await setSetting(db, 'lastVersion', APP_VERSION);
  if (isNative()) cleanupDownloads().catch((e: unknown) => console.error(e));
  const message = updateAnnouncement(last, APP_VERSION, onboarded);
  if (message) showToast(message, { duration: 4000 });
}
