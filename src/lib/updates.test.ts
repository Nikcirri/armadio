import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { getSetting, setSetting } from './db/repo';
import { APK_URL_PREFIX } from './logic/updates';
import { autoCheckForUpdates, checkForUpdates, loadUpdateState } from './updates';

const SHA = 'c'.repeat(64);
const release = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.com/Nikcirri/armadio/releases/tag/${tag}`,
  body: '- Novità\n  - dettaglio',
  assets: [
    { name: `Armadio-${tag}.apk`, browser_download_url: `${APK_URL_PREFIX}${tag}/Armadio-${tag}.apk`, size: 21_000_000, digest: `sha256:${SHA}` },
  ],
});

function stubFetch(body: unknown, ok = true) {
  const fn = vi.fn(async () => ({ ok, json: async () => body }) as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.settings.clear();
});

describe('controllo aggiornamenti', () => {
  it('trova una versione nuova e la ricorda con dimensione, impronta e novità', async () => {
    const fetchFn = stubFetch(release('v99.0.0'));
    const r = await checkForUpdates(new Date('2026-11-10T10:00:00Z'));
    expect(r.kind).toBe('available');
    expect(fetchFn).toHaveBeenCalledWith('https://api.github.com/repos/Nikcirri/armadio/releases/latest', expect.anything());
    expect(await getSetting(db, 'updates')).toEqual({
      lastCheck: '2026-11-10T10:00:00.000Z',
      latestVersion: '99.0.0',
      apkUrl: `${APK_URL_PREFIX}v99.0.0/Armadio-v99.0.0.apk`,
      apkSize: 21_000_000,
      apkSha256: SHA,
      pageUrl: 'https://github.com/Nikcirri/armadio/releases/tag/v99.0.0',
      notes: ['Novità'],
    });
  });

  it('dice quando la versione è già l’ultima o c’è un errore', async () => {
    stubFetch(release('v0.0.1'));
    expect((await checkForUpdates()).kind).toBe('current');
    stubFetch({}, false);
    expect((await checkForUpdates()).kind).toBe('error');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect((await checkForUpdates()).kind).toBe('error');
    vi.stubGlobal('navigator', { onLine: false });
    expect((await checkForUpdates()).kind).toBe('offline');
  });

  it('in silenzio interroga GitHub al massimo ogni 10 minuti, ma ripropone la versione nuova già trovata', async () => {
    const fetchFn = stubFetch(release('v99.0.0'));
    expect((await autoCheckForUpdates(new Date('2026-11-10T08:00:00Z')))?.version).toBe('99.0.0');
    const again = await autoCheckForUpdates(new Date('2026-11-10T08:05:00Z'));
    expect(again).toMatchObject({ version: '99.0.0', apkSize: 21_000_000, apkSha256: SHA, notes: ['Novità'] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await autoCheckForUpdates(new Date('2026-11-10T08:11:00Z'))).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('senza internet o con un errore tiene la versione nuova trovata l’ultima volta', async () => {
    stubFetch(release('v99.0.0'));
    await checkForUpdates(new Date('2026-11-10T08:00:00Z'));
    stubFetch({}, false);
    expect((await autoCheckForUpdates(new Date('2026-11-10T09:00:00Z')))?.version).toBe('99.0.0');
    stubFetch(release('v0.0.1'));
    expect(await autoCheckForUpdates(new Date('2026-11-10T10:00:00Z'))).toBeNull();
  });

  it('legge lo stato salvato dalle versioni vecchie', async () => {
    await setSetting(db, 'updates', {
      lastCheck: '2026-11-06T10:00:00.000Z',
      latestVersion: '1.4.0',
      apkUrl: 'https://x/Armadio.apk',
      pageUrl: null,
    } as never);
    expect(await loadUpdateState()).toMatchObject({ latestVersion: '1.4.0', apkUrl: null, apkSize: null, notes: [] });
  });
});
