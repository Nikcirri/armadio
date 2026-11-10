import { db } from './db';
import { getSetting, setSetting } from './db/repo';
import {
  RELEASES_API,
  isNewer,
  normalizeUpdateState,
  parseRelease,
  releaseFromState,
  shouldAutoCheck,
  stateFromRelease,
  type ReleaseInfo,
  type UpdateCheckState,
} from './logic/updates';
import { APP_VERSION } from './platform';

// SPEC.md, sezione 11: l'unica richiesta di rete dell'app, verso api.github.com.

export type UpdateResult =
  | { kind: 'available'; release: ReleaseInfo }
  | { kind: 'current'; release: ReleaseInfo }
  | { kind: 'offline' }
  | { kind: 'error' };

const TIMEOUT_MS = 10_000;

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return parseRelease(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Stato dell'ultimo controllo (completo anche se salvato da una versione vecchia). */
export async function loadUpdateState(): Promise<UpdateCheckState> {
  return normalizeUpdateState(await getSetting(db, 'updates'));
}

/** Interroga GitHub e ricorda il risultato (per l'avviso e la pagina Aggiornamenti). */
export async function checkForUpdates(now: Date = new Date()): Promise<UpdateResult> {
  if (offline()) return { kind: 'offline' };
  let release: ReleaseInfo | null;
  try {
    release = await fetchLatestRelease();
  } catch {
    return { kind: offline() ? 'offline' : 'error' };
  }
  if (!release) return { kind: 'error' };
  await setSetting(db, 'updates', stateFromRelease(release, now));
  return isNewer(release.version, APP_VERSION) ? { kind: 'available', release } : { kind: 'current', release };
}

/**
 * Controllo silenzioso (all'apertura e al ritorno nell'app): GitHub al massimo ogni 10 minuti e solo
 * con internet; nel frattempo vale la versione nuova trovata l'ultima volta.
 */
export async function autoCheckForUpdates(now: Date = new Date()): Promise<ReleaseInfo | null> {
  const state = await loadUpdateState();
  if (!shouldAutoCheck(state.lastCheck, now) || offline()) return releaseFromState(state, APP_VERSION);
  const result = await checkForUpdates(now);
  if (result.kind === 'available') return result.release;
  if (result.kind === 'current') return null;
  return releaseFromState(state, APP_VERSION);
}

/** Apre un link fuori dall'app (nel browser del telefono). */
export function openExternal(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}
