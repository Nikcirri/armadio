// Controllo aggiornamenti (SPEC.md, sezione 11): l'unico traffico di rete dell'app.

export const RELEASES_API = 'https://api.github.com/repos/Nikcirri/armadio/releases/latest';
export const RELEASES_PAGE = 'https://github.com/Nikcirri/armadio/releases/latest';
export const AUTO_CHECK_HOURS = 24;

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
  apkUrl: string | null;
  pageUrl: string;
  notes: string[];
}

/** Dati utili dalla risposta di GitHub (null se non è una Release valida). */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; body?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) return null;
  const assets = Array.isArray(r.assets) ? (r.assets as { name?: unknown; browser_download_url?: unknown }[]) : [];
  const apk = assets.find((a) => typeof a.name === 'string' && a.name.endsWith('.apk') && typeof a.browser_download_url === 'string');
  const notes = typeof r.body === 'string' ? releaseNotes(r.body) : [];
  return {
    version: r.tag_name.replace(/^v/, ''),
    apkUrl: apk ? (apk.browser_download_url as string) : null,
    pageUrl: typeof r.html_url === 'string' ? r.html_url : RELEASES_PAGE,
    notes,
  };
}

/** Le prime voci della lista delle novità, accorciate: "Wishlist: desideri con…" → "Wishlist". */
export function releaseNotes(body: string, max = 6): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => shortNote(l.slice(2).replace(/[*`]/g, '').trim()))
    .filter((l) => l.length > 0)
    .slice(0, max);
}

function shortNote(line: string): string {
  const colon = line.indexOf(': ');
  if (colon > 0 && colon <= 40) return line.slice(0, colon);
  return line.length > 90 ? `${line.slice(0, 89).trimEnd()}…` : line;
}

/** Controllo silenzioso: al massimo una volta al giorno. */
export function shouldAutoCheck(lastCheck: string | null, now: Date): boolean {
  if (!lastCheck) return true;
  const last = new Date(lastCheck).getTime();
  return !Number.isFinite(last) || now.getTime() - last >= AUTO_CHECK_HOURS * 3_600_000;
}
