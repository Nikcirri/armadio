import { describe, expect, it } from 'vitest';
import {
  APK_URL_PREFIX,
  EMPTY_UPDATE_STATE,
  RELEASES_PAGE,
  canDownloadInApp,
  isAllowedApkUrl,
  isNewer,
  normalizeUpdateState,
  parseRelease,
  parseSha256,
  parseVersion,
  pickApkAsset,
  releaseFromState,
  releaseNotes,
  shouldAutoCheck,
  shouldResume,
  stateFromRelease,
  updateAnnouncement,
} from './updates';

const SHA = 'a'.repeat(64);
const url = (tag: string, name = `Armadio-${tag}.apk`) => `${APK_URL_PREFIX}${tag}/${name}`;
const asset = (tag: string, extra: Record<string, unknown> = {}) => ({
  name: `Armadio-${tag}.apk`,
  browser_download_url: url(tag),
  size: 21_576_736,
  digest: `sha256:${SHA}`,
  ...extra,
});

describe('versioni', () => {
  it('confronta le versioni', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion(' 1.2.3 ')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('1.2.3-beta')).toBeNull();
    expect(isNewer('v1.0.0', '0.8.0')).toBe(true);
    expect(isNewer('0.10.0', '0.9.5')).toBe(true);
    expect(isNewer('1.5.0', '1.4.10')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
    expect(isNewer('boh', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0', '0.0.0-dev')).toBe(false);
  });
});

describe('indirizzi e file della Release', () => {
  it('accetta solo gli APK delle Release di Armadio', () => {
    expect(isAllowedApkUrl(url('v1.5.0'))).toBe(true);
    expect(isAllowedApkUrl('https://github.com/Nikcirri/armadio/releases/download/v1.5.0/Armadio_v1.5.0-fix.apk')).toBe(true);
    expect(isAllowedApkUrl('http://github.com/Nikcirri/armadio/releases/download/v1.5.0/Armadio-v1.5.0.apk')).toBe(false);
    expect(isAllowedApkUrl('https://github.com/Nikcirri/nutrizione/releases/download/v1.5.0/Nutrizione.apk')).toBe(false);
    expect(isAllowedApkUrl('https://github.com/Nikcirri/armadio/releases/download/v1.5.0/Armadio-v1.5.0.zip')).toBe(false);
    expect(isAllowedApkUrl('https://github.com/Nikcirri/armadio/releases/download/../../x/Armadio.apk')).toBe(false);
    expect(isAllowedApkUrl('https://github.com/Nikcirri/armadio/releases/download/v1/a b.apk')).toBe(false);
    expect(isAllowedApkUrl('https://github.com/Nikcirri/armadio/releases/download/v1/a.apk?x=1.apk')).toBe(false);
    expect(isAllowedApkUrl('https://github.com.evil.it/Nikcirri/armadio/releases/download/v1/a.apk')).toBe(false);
    expect(isAllowedApkUrl(`${APK_URL_PREFIX}.apk`)).toBe(false);
  });

  it('legge l’impronta SHA-256 di GitHub', () => {
    expect(parseSha256(`sha256:${SHA}`)).toBe(SHA);
    expect(parseSha256(`sha256:${'AB'.repeat(32)}`)).toBe('ab'.repeat(32));
    expect(parseSha256('sha1:abc')).toBeNull();
    expect(parseSha256(`sha256:${'a'.repeat(63)}`)).toBeNull();
    expect(parseSha256(null)).toBeNull();
  });

  it('sceglie Armadio-vX.Y.Z.apk, poi un altro .apk ammesso', () => {
    const notes = { name: 'note.txt', browser_download_url: `${APK_URL_PREFIX}v1.5.0/note.txt`, size: 10 };
    const debug = { name: 'Armadio-debug.apk', browser_download_url: url('v1.5.0', 'Armadio-debug.apk'), size: 2_000_000 };
    const foreign = { name: 'Armadio-v1.5.0.apk', browser_download_url: 'https://example.com/Armadio-v1.5.0.apk', size: 2_000_000 };
    expect(pickApkAsset([notes, debug, asset('v1.5.0')], '1.5.0')).toEqual({ url: url('v1.5.0'), size: 21_576_736, sha256: SHA });
    expect(pickApkAsset([notes, debug], '1.5.0')?.url).toBe(debug.browser_download_url);
    expect(pickApkAsset([foreign, notes], '1.5.0')).toBeNull();
    expect(pickApkAsset([asset('v1.5.0', { size: -3, digest: 'boh' })], '1.5.0')).toEqual({ url: url('v1.5.0'), size: null, sha256: null });
    expect(pickApkAsset('rotto', '1.5.0')).toBeNull();
    expect(pickApkAsset([null, 3], '1.5.0')).toBeNull();
  });

  it('legge la Release di GitHub', () => {
    const r = parseRelease({
      tag_name: 'v1.5.0',
      html_url: 'https://github.com/Nikcirri/armadio/releases/tag/v1.5.0',
      body: '- Prima novità\n- Seconda\n\n### Come installare\nScarica il file.',
      assets: [asset('v1.5.0')],
    });
    expect(r).toEqual({
      version: '1.5.0',
      apkUrl: url('v1.5.0'),
      apkSize: 21_576_736,
      apkSha256: SHA,
      pageUrl: 'https://github.com/Nikcirri/armadio/releases/tag/v1.5.0',
      notes: ['Prima novità', 'Seconda'],
    });
    expect(parseRelease({ tag_name: 'latest' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ tag_name: 'v1.0.1' })).toMatchObject({ apkUrl: null, apkSize: null, pageUrl: RELEASES_PAGE, notes: [] });
    expect(parseRelease({ tag_name: 'v1.0.1', html_url: 'https://evil.example/x' })?.pageUrl).toBe(RELEASES_PAGE);
  });
});

describe('novità', () => {
  it('prende solo le voci principali, senza markdown né doppioni', () => {
    const body = [
      '- **Cosa metto?**: più occasioni. Con due o più compare un interruttore:',
      '  - "Una qualsiasi": basta una.',
      '  - "Tutte insieme": servono tutte.',
      '* Taglie e misure: `vita bassa` e [anelli](https://x).',
      '- Taglie e misure: `vita bassa` e [anelli](https://x).',
      'testo',
      '-senza spazio',
      '- ',
      '### Come installare',
    ].join('\n');
    expect(releaseNotes(body)).toEqual([
      'Cosa metto?: più occasioni. Con due o più compare un interruttore:',
      'Taglie e misure: vita bassa e anelli.',
    ]);
    expect(releaseNotes('- a\n- b\n- c', 2)).toEqual(['a', 'b']);
    expect(releaseNotes('- a\r\n- b\r\n')).toEqual(['a', 'b']);
  });

  it('accorcia le voci lunghe su uno spazio', () => {
    const long = 'Parola '.repeat(30).trim();
    const [n] = releaseNotes(`- ${long}`);
    expect(n!.length).toBeLessThanOrEqual(110);
    expect(n!.endsWith('Parola…')).toBe(true);
    const [x] = releaseNotes(`- ${'x'.repeat(150)}`);
    expect(x).toBe(`${'x'.repeat(109)}…`);
  });
});

describe('controllo automatico e stato salvato', () => {
  it('controlla al massimo ogni 10 minuti', () => {
    const now = new Date('2026-11-10T10:00:00Z');
    expect(shouldAutoCheck(null, now)).toBe(true);
    expect(shouldAutoCheck('2026-11-10T09:55:00Z', now)).toBe(false);
    expect(shouldAutoCheck('2026-11-10T09:50:00Z', now)).toBe(true);
    expect(shouldAutoCheck('2026-11-10T11:00:00Z', now)).toBe(true);
    expect(shouldAutoCheck('rotto', now)).toBe(true);
  });

  it('completa lo stato salvato dalle versioni vecchie e scarta i valori sbagliati', () => {
    expect(normalizeUpdateState(undefined)).toEqual(EMPTY_UPDATE_STATE);
    expect(
      normalizeUpdateState({ lastCheck: '2026-11-06T10:00:00.000Z', latestVersion: '1.4.0', apkUrl: url('v1.4.0'), pageUrl: RELEASES_PAGE }),
    ).toEqual({
      lastCheck: '2026-11-06T10:00:00.000Z',
      latestVersion: '1.4.0',
      apkUrl: url('v1.4.0'),
      apkSize: null,
      apkSha256: null,
      pageUrl: RELEASES_PAGE,
      notes: [],
    });
    const bad = normalizeUpdateState({ apkUrl: 'https://evil.example/a.apk', apkSize: 1.5, apkSha256: 'xyz', notes: ['ok', 3] });
    expect(bad).toMatchObject({ apkUrl: null, apkSize: null, apkSha256: null, notes: ['ok'] });
  });

  it('ricorda la versione nuova trovata e la ripropone finché è più nuova', () => {
    const release = parseRelease({ tag_name: 'v1.5.0', body: '- Novità', assets: [asset('v1.5.0')] })!;
    const state = stateFromRelease(release, new Date('2026-11-10T10:00:00Z'));
    expect(state.lastCheck).toBe('2026-11-10T10:00:00.000Z');
    expect(releaseFromState(state, '1.4.0')).toEqual({ ...release, pageUrl: RELEASES_PAGE });
    expect(releaseFromState(state, '1.5.0')).toBeNull();
    expect(releaseFromState(EMPTY_UPDATE_STATE, '1.4.0')).toBeNull();
  });

  it('aggiorna dall’app solo con un APK ammesso e la sua dimensione', () => {
    const release = parseRelease({ tag_name: 'v1.5.0', assets: [asset('v1.5.0')] })!;
    expect(canDownloadInApp(release)).toBe(true);
    expect(canDownloadInApp({ ...release, apkSize: null })).toBe(false);
    expect(canDownloadInApp({ ...release, apkSize: 1000 })).toBe(false);
    expect(canDownloadInApp({ ...release, apkUrl: 'https://evil.example/a.apk' })).toBe(false);
    expect(canDownloadInApp({ ...release, apkUrl: null })).toBe(false);
    expect(canDownloadInApp(null)).toBe(false);
  });
});

describe('dopo un aggiornamento', () => {
  it('annuncia la versione nuova una volta sola', () => {
    expect(updateAnnouncement('1.4.0', '1.5.0', true)).toBe('App aggiornata alla versione 1.5.0');
    expect(updateAnnouncement('1.5.0', '1.5.0', true)).toBeNull();
    expect(updateAnnouncement('1.6.0', '1.5.0', true)).toBeNull();
    // Arrivo da una versione che non registrava l'ultima versione avviata: solo se l'app era configurata.
    expect(updateAnnouncement(null, '1.5.0', true)).toBe('App aggiornata alla versione 1.5.0');
    expect(updateAnnouncement(null, '1.5.0', false)).toBeNull();
  });

  it('riprende da solo dopo il permesso, per la stessa versione e entro 15 minuti', () => {
    const now = new Date('2026-11-10T10:00:00Z');
    const pending = { version: '1.5.0', at: '2026-11-10T09:50:00Z' };
    expect(shouldResume(pending, '1.5.0', now)).toBe(true);
    expect(shouldResume(pending, '1.5.1', now)).toBe(false);
    expect(shouldResume(pending, null, now)).toBe(false);
    expect(shouldResume(null, '1.5.0', now)).toBe(false);
    expect(shouldResume({ version: '1.5.0', at: '2026-11-10T09:40:00Z' }, '1.5.0', now)).toBe(false);
    expect(shouldResume({ version: '1.5.0', at: 'rotto' }, '1.5.0', now)).toBe(false);
  });
});
