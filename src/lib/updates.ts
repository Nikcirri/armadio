import { db } from './db';
import { getSetting, setSetting } from './db/repo';
import type { UpdateCheckState } from './db/types';
import { RELEASES_API, isNewer, parseRelease, shouldAutoCheck, type ReleaseInfo } from './logic/updates';
import { nowIso } from './logic/util';
import { APP_VERSION } from './platform';

// SPEC.md, sezione 11: l'unica richiesta di rete dell'app.

export type UpdateResult =
  | { kind: 'available'; release: ReleaseInfo }
  | { kind: 'current'; release: ReleaseInfo }
  | { kind: 'offline' }
  | { kind: 'error' };

const TIMEOUT_MS = 10_000;

export const EMPTY_UPDATE_STATE: UpdateCheckState = { lastCheck: null, latestVersion: null, apkUrl: null, pageUrl: null };

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

/** Interroga GitHub e ricorda il risultato (anche per mostrarlo subito in Informazioni). */
export async function checkForUpdates(now: Date = new Date()): Promise<UpdateResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline' };
  let release: ReleaseInfo | null;
  try {
    release = await fetchLatestRelease();
  } catch {
    return { kind: navigator.onLine === false ? 'offline' : 'error' };
  }
  if (!release) return { kind: 'error' };
  await setSetting(db, 'updates', {
    lastCheck: nowIso(now),
    latestVersion: release.version,
    apkUrl: release.apkUrl,
    pageUrl: release.pageUrl,
  });
  return isNewer(release.version, APP_VERSION) ? { kind: 'available', release } : { kind: 'current', release };
}

/** Controllo silenzioso all'avvio: al massimo una volta al giorno e solo con internet. */
export async function autoCheckForUpdates(now: Date = new Date()): Promise<ReleaseInfo | null> {
  const state = (await getSetting(db, 'updates')) ?? EMPTY_UPDATE_STATE;
  if (!shouldAutoCheck(state.lastCheck, now)) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const result = await checkForUpdates(now);
  return result.kind === 'available' ? result.release : null;
}

/** Apre un link fuori dall'app (nel browser del telefono, che scarica l'APK). */
export function openExternal(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}
