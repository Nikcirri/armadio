import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  installAllowed: vi.fn(async () => true),
  openInstallSettings: vi.fn(async () => undefined),
  downloadAndInstall: vi.fn(async (_req: unknown, onProgress: (p: number) => void) => {
    onProgress(40);
    onProgress(100);
    return { reused: false };
  }),
  cleanupDownloads: vi.fn(async () => undefined),
}));
const ui = vi.hoisted(() => ({ confirmDialog: vi.fn(async () => true), showToast: vi.fn() }));

vi.mock('../appUpdater', () => plugin);
vi.mock('../platform', () => ({ APP_VERSION: '1.4.0', isNative: () => true }));
vi.mock('./ui.svelte', async (importOriginal) => ({ ...(await importOriginal<typeof import('./ui.svelte')>()), ...ui }));

import { db } from '../db';
import { getSetting, setSetting } from '../db/repo';
import { APK_URL_PREFIX } from '../logic/updates';
import {
  announceUpdate,
  bannerVisible,
  dismissUpdate,
  installUpdate,
  refreshUpdate,
  resumeUpdate,
  update,
  updateFromApp,
} from './update.svelte';

const SHA = 'd'.repeat(64);
const APK = `${APK_URL_PREFIX}v1.5.0/Armadio-v1.5.0.apk`;
const RELEASE = {
  tag_name: 'v1.5.0',
  html_url: 'https://github.com/Nikcirri/armadio/releases/tag/v1.5.0',
  body: '- Uno\n- Due\n- Tre\n- Quattro',
  assets: [{ name: 'Armadio-v1.5.0.apk', browser_download_url: APK, size: 22_000_000, digest: `sha256:${SHA}` }],
};

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => body }) as Response),
  );
}

function stubStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

const toasts = () => ui.showToast.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  update.available = null;
  update.dismissedVersion = null;
  update.phase = 'idle';
  update.percent = 0;
  update.lastResult = null;
  stubFetch(RELEASE);
  stubStorage();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  plugin.installAllowed.mockImplementation(async () => true);
  ui.confirmDialog.mockImplementation(async () => true);
  await db.settings.clear();
});

describe('avviso e "Dopo"', () => {
  it('mostra la versione nuova e "Dopo" la rimanda dicendo dove ritrovarla', async () => {
    await refreshUpdate();
    expect(update.available).toMatchObject({ version: '1.5.0', apkUrl: APK, apkSize: 22_000_000, apkSha256: SHA, notes: ['Uno', 'Due', 'Tre', 'Quattro'] });
    expect(bannerVisible()).toBe(true);
    dismissUpdate();
    expect(bannerVisible()).toBe(false);
    expect(toasts().at(-1)).toContain('Altro → Aggiornamenti');
    // Un altro controllo della stessa versione non la ripropone; una versione ancora più nuova sì.
    await setSetting(db, 'updates', { ...(await getSetting(db, 'updates'))!, lastCheck: '2000-01-01T00:00:00.000Z' });
    await refreshUpdate();
    expect(bannerVisible()).toBe(false);
    stubFetch({ ...RELEASE, tag_name: 'v1.6.0', assets: [] });
    await setSetting(db, 'updates', { ...(await getSetting(db, 'updates'))!, lastCheck: '2000-01-01T00:00:00.000Z' });
    await refreshUpdate();
    expect(update.available?.version).toBe('1.6.0');
    expect(bannerVisible()).toBe(true);
  });
});

describe('"Aggiorna"', () => {
  it('scarica con la percentuale e apre l’installazione; se la annulli torna l’avviso', async () => {
    await refreshUpdate();
    await installUpdate();
    expect(plugin.downloadAndInstall).toHaveBeenCalledWith({ url: APK, version: '1.5.0', size: 22_000_000, sha256: SHA }, expect.any(Function));
    expect(update.percent).toBe(100);
    expect(update.phase).toBe('install');
    expect(bannerVisible()).toBe(true);
    await resumeUpdate();
    expect(update.phase).toBe('idle');
    expect(bannerVisible()).toBe(true);
  });

  it('senza permesso spiega cosa toccare, apre le impostazioni e riparte da solo al ritorno', async () => {
    await refreshUpdate();
    plugin.installAllowed.mockImplementation(async () => false);
    await installUpdate();
    expect(ui.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Apri impostazioni' }));
    const asked = ui.confirmDialog.mock.calls[0] as unknown as [{ message: string }];
    expect(asked[0].message).toContain('Consenti da questa origine');
    expect(plugin.openInstallSettings).toHaveBeenCalled();
    expect(update.phase).toBe('permission');
    expect(plugin.downloadAndInstall).not.toHaveBeenCalled();
    plugin.installAllowed.mockImplementation(async () => true);
    await resumeUpdate();
    expect(plugin.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(update.phase).toBe('install');
  });

  it('se il permesso non viene dato lo dice; se rinunci non apre nulla', async () => {
    await refreshUpdate();
    plugin.installAllowed.mockImplementation(async () => false);
    await installUpdate();
    await resumeUpdate();
    expect(update.phase).toBe('idle');
    expect(toasts().at(-1)).toContain('Permesso non dato');
    ui.confirmDialog.mockImplementation(async () => false);
    plugin.openInstallSettings.mockClear();
    await installUpdate();
    expect(plugin.openInstallSettings).not.toHaveBeenCalled();
    expect(update.phase).toBe('idle');
  });

  it('riparte anche se Android ha riavviato l’app mentre davi il permesso', async () => {
    await refreshUpdate();
    plugin.installAllowed.mockImplementation(async () => false);
    await installUpdate();
    // Riavvio: lo stato in memoria si perde, il ricordo in localStorage resta.
    update.phase = 'idle';
    update.available = null;
    plugin.installAllowed.mockImplementation(async () => true);
    await refreshUpdate();
    expect(plugin.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(update.phase).toBe('install');
  });

  it('mostra gli errori del plugin e torna all’avviso', async () => {
    await refreshUpdate();
    plugin.downloadAndInstall.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Il file scaricato non è completo. Riprova.'), { code: 'UPDATE_FAILED' });
    });
    await installUpdate();
    expect(update.phase).toBe('idle');
    expect(toasts().at(-1)).toBe('Il file scaricato non è completo. Riprova.');
    plugin.downloadAndInstall.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Questa versione è già installata'), { code: 'NOT_NEWER' });
    });
    await installUpdate();
    expect(update.available).toBeNull();
    expect(bannerVisible()).toBe(false);
  });

  it('"Aggiorna dall’app" controlla prima, e dice se è già l’ultima versione', async () => {
    stubFetch({ ...RELEASE, tag_name: 'v1.4.0' });
    await updateFromApp();
    expect(toasts().at(-1)).toBe('Hai già l’ultima versione.');
    expect(plugin.downloadAndInstall).not.toHaveBeenCalled();
    stubFetch(RELEASE);
    await updateFromApp();
    expect(plugin.downloadAndInstall).toHaveBeenCalledTimes(1);
  });
});

describe('dopo un aggiornamento', () => {
  it('"App aggiornata alla versione X" una volta sola, e cancella l’APK scaricato', async () => {
    await setSetting(db, 'lastVersion', '1.3.1');
    await announceUpdate(true);
    expect(toasts()).toContain('App aggiornata alla versione 1.4.0');
    expect(plugin.cleanupDownloads).toHaveBeenCalledTimes(1);
    expect(await getSetting(db, 'lastVersion')).toBe('1.4.0');
    ui.showToast.mockClear();
    await announceUpdate(true);
    expect(toasts()).toEqual([]);
  });

  it('niente messaggio al primo avvio di un’installazione nuova, sì arrivando da una versione che non registrava', async () => {
    await announceUpdate(false);
    expect(toasts()).toEqual([]);
    expect(await getSetting(db, 'lastVersion')).toBe('1.4.0');
    await db.settings.clear();
    await announceUpdate(true);
    expect(toasts()).toContain('App aggiornata alla versione 1.4.0');
  });
});
