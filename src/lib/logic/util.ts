/** Id univoco (UUID v4). */
export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data locale nel formato "YYYY-MM-DD". */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/** Converte "YYYY-MM-DD" in una data locale a mezzogiorno (evita problemi con l'ora legale). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Giorni interi tra due istanti (ISO o "YYYY-MM-DD"); positivo se `to` è dopo `from`. */
export function daysBetween(from: string, to: string): number {
  const a = from.length === 10 ? fromDateKey(from) : new Date(from);
  const b = to.length === 10 ? fromDateKey(to) : new Date(to);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/** Data leggibile in italiano, es. "5 novembre 2026". */
export function formatDateIt(isoOrKey: string): string {
  const d = isoOrKey.length === 10 ? fromDateKey(isoOrKey) : new Date(isoOrKey);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Nome file sicuro con data e ora locali, es. "2026-11-05-2158". */
export function fileStamp(now: Date = new Date()): string {
  return `${toDateKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
