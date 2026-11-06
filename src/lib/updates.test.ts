import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { getSetting } from './db/repo';
import { autoCheckForUpdates, checkForUpdates } from './updates';

const release = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.com/Nikcirri/armadio/releases/tag/${tag}`,
  body: '- Novità',
  assets: [{ name: `Armadio-${tag}.apk`, browser_download_url: `https://x/Armadio-${tag}.apk` }],
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
  it('trova una versione nuova e la ricorda', async () => {
    const fetchFn = stubFetch(release('v99.0.0'));
    const r = await checkForUpdates(new Date('2026-11-06T10:00:00Z'));
    expect(r.kind).toBe('available');
    expect(fetchFn).toHaveBeenCalledWith('https://api.github.com/repos/Nikcirri/armadio/releases/latest', expect.anything());
    expect(await getSetting(db, 'updates')).toEqual({
      lastCheck: '2026-11-06T10:00:00.000Z',
      latestVersion: '99.0.0',
      apkUrl: 'https://x/Armadio-v99.0.0.apk',
      pageUrl: 'https://github.com/Nikcirri/armadio/releases/tag/v99.0.0',
    });
  });

  it('dice quando la versione è già l’ultima o c’è un errore', async () => {
    stubFetch(release('v0.0.1'));
    expect((await checkForUpdates()).kind).toBe('current');
    stubFetch({}, false);
    expect((await checkForUpdates()).kind).toBe('error');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect((await checkForUpdates()).kind).toBe('error');
  });

  it('in silenzio controlla al massimo una volta al giorno', async () => {
    const fetchFn = stubFetch(release('v99.0.0'));
    expect((await autoCheckForUpdates(new Date('2026-11-06T08:00:00Z')))?.version).toBe('99.0.0');
    expect(await autoCheckForUpdates(new Date('2026-11-06T20:00:00Z'))).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await autoCheckForUpdates(new Date('2026-11-07T09:00:00Z'))).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
