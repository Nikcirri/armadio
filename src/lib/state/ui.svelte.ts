// Stato condiviso dell'interfaccia: fogli aperti (per il tasto Indietro), toast, dialoghi, attese.
import { untrack } from 'svelte';

// ---------- Fogli, pagine e dialoghi aperti ----------

interface OverlayEntry {
  id: number;
  close: () => void;
}

let nextOverlayId = 1;
const overlays = $state<OverlayEntry[]>([]);

/**
 * Registra un elemento chiudibile con Indietro. Restituisce la funzione per toglierlo.
 * `untrack`: si può chiamare dentro un $effect senza creare dipendenze (e cicli infiniti).
 */
export function registerOverlay(close: () => void): () => void {
  const id = nextOverlayId++;
  untrack(() => overlays.push({ id, close }));
  return () => {
    untrack(() => {
      const i = overlays.findIndex((o) => o.id === id);
      if (i >= 0) overlays.splice(i, 1);
    });
  };
}

export function hasOverlay(): boolean {
  return untrack(() => overlays.length > 0);
}

/** Chiude l'ultimo elemento aperto. Restituisce false se non c'era niente da chiudere. */
export function closeTopOverlay(): boolean {
  const top = untrack(() => overlays[overlays.length - 1]);
  if (!top) return false;
  top.close();
  return true;
}

// ---------- Toast ----------

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

export const toast = $state<{ current: ToastState | null }>({ current: null });
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let nextToastId = 1;

/** Messaggio breve in basso. Con `action` mostra un pulsante (es. "Annulla") per 5 secondi. */
export function showToast(
  message: string,
  opts: { actionLabel?: string; onAction?: () => void | Promise<void>; duration?: number } = {},
): void {
  const id = nextToastId++;
  toast.current = { id, message, actionLabel: opts.actionLabel, onAction: opts.onAction };
  clearTimeout(toastTimer);
  const duration = opts.duration ?? (opts.onAction ? 5000 : 2500);
  toastTimer = setTimeout(() => {
    if (toast.current?.id === id) toast.current = null;
  }, duration);
}

export function dismissToast(): void {
  clearTimeout(toastTimer);
  toast.current = null;
}

/** Toast con "Annulla" per le azioni che si possono disfare. */
export function showUndoToast(message: string, undo: () => void | Promise<void>): void {
  showToast(message, { actionLabel: 'Annulla', onAction: undo });
}

// ---------- Dialogo di conferma ----------

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Se presente, l'utente deve scrivere questa parola per confermare (es. "SVUOTA"). */
  requireText?: string;
}

interface DialogState extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

export const dialog = $state<{ current: DialogState | null }>({ current: null });
let nextDialogId = 1;

/** Dialogo di conferma dell'app (al posto di confirm()). */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  dialog.current?.resolve(false);
  return new Promise((resolve) => {
    dialog.current = { ...opts, id: nextDialogId++, resolve };
  });
}

export function resolveDialog(ok: boolean): void {
  const d = dialog.current;
  if (!d) return;
  dialog.current = null;
  d.resolve(ok);
}

// ---------- Attesa con avanzamento ----------

export const busy = $state<{
  message: string | null;
  done: number;
  total: number;
  cancellable: boolean;
  cancelled: boolean;
}>({
  message: null,
  done: 0,
  total: 0,
  cancellable: false,
  cancelled: false,
});

/**
 * Mostra un'attesa bloccante mentre `fn` lavora.
 * Con `cancellable` compare il tasto Annulla: `fn` controlla `isCancelled()` tra un passo e l'altro.
 */
export async function withBusy<T>(
  message: string,
  fn: (progress: (done: number, total: number) => void, isCancelled: () => boolean) => Promise<T>,
  opts: { cancellable?: boolean } = {},
): Promise<T> {
  busy.message = message;
  busy.done = 0;
  busy.total = 0;
  busy.cancellable = opts.cancellable ?? false;
  busy.cancelled = false;
  try {
    return await fn(
      (done, total) => {
        busy.done = done;
        busy.total = total;
      },
      () => busy.cancelled,
    );
  } finally {
    busy.message = null;
    busy.cancellable = false;
  }
}

export function setBusyMessage(message: string): void {
  if (busy.message !== null) busy.message = message;
}

export function cancelBusy(): void {
  busy.cancelled = true;
}
