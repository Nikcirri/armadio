// Aggiornamenti (SPEC.md, sezione 11): l'unico traffico di rete dell'app, solo verso GitHub.

export const RELEASES_API = 'https://api.github.com/repos/Nikcirri/armadio/releases/latest';
export const RELEASES_PAGE = 'https://github.com/Nikcirri/armadio/releases/latest';
/** Gli APK si scaricano solo da qui: lo stesso controllo c'è nel plugin Android (AppUpdaterPlugin). */
export const APK_URL_PREFIX = 'https://github.com/Nikcirri/armadio/releases/download/';
/** Controllo automatico all'apertura e al ritorno nell'app, al massimo ogni 10 minuti. */
export const AUTO_CHECK_MINUTES = 10;
/** Novità mostrate nell'avviso in alto. */
export const BANNER_NOTES = 3;
/** Sotto questa dimensione non è un APK di Armadio (come nel plugin). */
export const MIN_APK_BYTES = 1_000_000;
/** Dopo aver aperto le impostazioni del permesso, entro quanto si riprende da soli anche se Android ha riavviato l'app. */
export const RESUME_WINDOW_MINUTES = 15;

/** "v1.2.3" o "1.2.3" → [1, 2, 3]. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

export interface ReleaseInfo {
  version: string;
  /** APK scaricabile dall'app (solo se l'indirizzo è ammesso), altrimenti null. */
  apkUrl: string | null;
  /** Dimensione in byte dichiarata da GitHub. */
  apkSize: number | null;
  /** Impronta SHA-256 dichiarata da GitHub (64 caratteri esadecimali minuscoli), se c'è. */
  apkSha256: string | null;
  pageUrl: string;
  notes: string[];
}

/** Stato salvato dell'ultimo controllo (solo su questo telefono). */
export interface UpdateCheckState {
  lastCheck: string | null;
  latestVersion: string | null;
  apkUrl: string | null;
  apkSize: number | null;
  apkSha256: string | null;
  pageUrl: string | null;
  notes: string[];
}

export const EMPTY_UPDATE_STATE: UpdateCheckState = {
  lastCheck: null,
  latestVersion: null,
  apkUrl: null,
  apkSize: null,
  apkSha256: null,
  pageUrl: null,
  notes: [],
};

/** Stesse regole del plugin: prefisso delle Release di Armadio, .apk, solo caratteri sicuri, niente "..". */
export function isAllowedApkUrl(url: string): boolean {
  if (!url.startsWith(APK_URL_PREFIX) || !url.endsWith('.apk')) return false;
  const rest = url.slice(APK_URL_PREFIX.length);
  return !rest.includes('..') && /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.apk$/.test(rest);
}

/** "sha256:ab12…" (campo digest degli asset di GitHub) → "ab12…" in minuscolo, oppure null. */
export function parseSha256(digest: unknown): string | null {
  if (typeof digest !== 'string') return null;
  const m = /^sha256:([0-9a-f]{64})$/i.exec(digest.trim());
  return m ? m[1]!.toLowerCase() : null;
}

export interface ApkAsset {
  url: string;
  size: number | null;
  sha256: string | null;
}

/**
 * Il file .apk della Release: prima "Armadio-vX.Y.Z.apk" della stessa versione, altrimenti il primo .apk.
 * Contano solo gli indirizzi ammessi.
 */
export function pickApkAsset(assets: unknown, version: string): ApkAsset | null {
  if (!Array.isArray(assets)) return null;
  const apks = assets.filter(
    (a): a is { name: string; browser_download_url: string; size?: unknown; digest?: unknown } =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as { name?: unknown }).name === 'string' &&
      (a as { name: string }).name.endsWith('.apk') &&
      typeof (a as { browser_download_url?: unknown }).browser_download_url === 'string' &&
      isAllowedApkUrl((a as { browser_download_url: string }).browser_download_url),
  );
  const chosen = apks.find((a) => a.name === `Armadio-v${version}.apk`) ?? apks[0];
  if (!chosen) return null;
  const size = typeof chosen.size === 'number' && Number.isInteger(chosen.size) && chosen.size > 0 ? chosen.size : null;
  return { url: chosen.browser_download_url, size, sha256: parseSha256(chosen.digest) };
}

/** Dati utili dalla risposta di GitHub (null se non è una Release valida). */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; body?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) return null;
  const version = r.tag_name.trim().replace(/^v/, '');
  const apk = pickApkAsset(r.assets, version);
  return {
    version,
    apkUrl: apk?.url ?? null,
    apkSize: apk?.size ?? null,
    apkSha256: apk?.sha256 ?? null,
    pageUrl: typeof r.html_url === 'string' && r.html_url.startsWith('https://github.com/Nikcirri/armadio/') ? r.html_url : RELEASES_PAGE,
    notes: typeof r.body === 'string' ? releaseNotes(r.body) : [],
  };
}

/**
 * Le voci principali dell'elenco delle novità (senza i sotto-punti rientrati), senza markdown,
 * accorciate a 110 caratteri su uno spazio, senza doppioni.
 */
export function releaseNotes(body: string, max = 6): string[] {
  const out: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    if (!/^[-*] /.test(raw)) continue;
    const text = raw
      .slice(2)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|[*`]/g, '')
      .trim();
    if (!text) continue;
    const short = shorten(text, 110);
    if (!out.includes(short)) out.push(short);
    if (out.length >= max) break;
  }
  return out;
}

function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.(-]+$/, '')}…`;
}

/** Controllo silenzioso: al massimo ogni 10 minuti. */
export function shouldAutoCheck(lastCheck: string | null, now: Date): boolean {
  if (!lastCheck) return true;
  const last = new Date(lastCheck).getTime();
  return !Number.isFinite(last) || now.getTime() - last >= AUTO_CHECK_MINUTES * 60_000 || last > now.getTime();
}

/** Stato salvato da una versione vecchia (senza i campi nuovi) o rovinato → stato completo. */
export function normalizeUpdateState(raw: unknown): UpdateCheckState {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_UPDATE_STATE };
  const s = raw as Partial<Record<keyof UpdateCheckState, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const apkUrl = str(s.apkUrl);
  return {
    lastCheck: str(s.lastCheck),
    latestVersion: str(s.latestVersion),
    apkUrl: apkUrl && isAllowedApkUrl(apkUrl) ? apkUrl : null,
    apkSize: typeof s.apkSize === 'number' && Number.isInteger(s.apkSize) && s.apkSize > 0 ? s.apkSize : null,
    apkSha256: typeof s.apkSha256 === 'string' && /^[0-9a-f]{64}$/.test(s.apkSha256) ? s.apkSha256 : null,
    pageUrl: str(s.pageUrl),
    notes: Array.isArray(s.notes) ? s.notes.filter((n): n is string => typeof n === 'string') : [],
  };
}

export function stateFromRelease(release: ReleaseInfo, now: Date): UpdateCheckState {
  return {
    lastCheck: now.toISOString(),
    latestVersion: release.version,
    apkUrl: release.apkUrl,
    apkSize: release.apkSize,
    apkSha256: release.apkSha256,
    pageUrl: release.pageUrl,
    notes: release.notes,
  };
}

/** La versione nuova ricordata dall'ultimo controllo, se è più nuova di quella installata. */
export function releaseFromState(state: UpdateCheckState, current: string): ReleaseInfo | null {
  if (!state.latestVersion || !isNewer(state.latestVersion, current)) return null;
  return {
    version: state.latestVersion,
    apkUrl: state.apkUrl,
    apkSize: state.apkSize,
    apkSha256: state.apkSha256,
    pageUrl: state.pageUrl ?? RELEASES_PAGE,
    notes: state.notes,
  };
}

/** Si può aggiornare dall'app: APK ammesso con la sua dimensione. */
export function canDownloadInApp(release: ReleaseInfo | null): boolean {
  return !!release && !!release.apkUrl && isAllowedApkUrl(release.apkUrl) && !!release.apkSize && release.apkSize >= MIN_APK_BYTES;
}

/**
 * Messaggio al primo avvio dopo un aggiornamento (null se non va mostrato). Senza versione registrata
 * (installazione nuova, oppure arrivo da una versione che non la registrava) solo se l'app era già configurata.
 */
export function updateAnnouncement(lastVersion: string | null, current: string, onboarded: boolean): string | null {
  if (lastVersion === current) return null;
  if (lastVersion ? !isNewer(current, lastVersion) : !onboarded) return null;
  return `App aggiornata alla versione ${current}`;
}

/** Ricordo di "sono andato a dare il permesso" (sopravvive se Android riavvia l'app). */
export interface PendingResume {
  version: string;
  at: string;
}

/** Riprendere da soli l'aggiornamento dopo il permesso: stessa versione e poco tempo fa. */
export function shouldResume(pending: PendingResume | null, availableVersion: string | null, now: Date): boolean {
  if (!pending || !availableVersion || pending.version !== availableVersion) return false;
  const at = new Date(pending.at).getTime();
  return Number.isFinite(at) && at <= now.getTime() && now.getTime() - at <= RESUME_WINDOW_MINUTES * 60_000;
}
