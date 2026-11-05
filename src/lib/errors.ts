import { db } from './db';
import { appendErrorLog } from './db/repo';
import { BackupError } from './logic/backupFormat';
import { showToast } from './state/ui.svelte';

function messageOf(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`;
  try {
    return typeof e === 'string' ? e : JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Testo breve dell'errore, da mostrare tra parentesi quando aiuta a capire cosa è successo. */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}

/** Errori con un messaggio già pensato per l'utente. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/** Registra l'errore e avvisa l'utente senza far chiudere l'app. */
export function reportError(e: unknown, userMessage?: string): void {
  console.error(e);
  if (e instanceof UserError || e instanceof BackupError) {
    showToast(e.message, { duration: 4500 });
    return;
  }
  void appendErrorLog(db, messageOf(e)).catch(() => undefined);
  showToast(userMessage ?? 'Qualcosa è andato storto. L’errore è stato registrato nelle Impostazioni.', {
    duration: 4000,
  });
}

/** Gestore globale: nessun errore deve chiudere l'app. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
}
