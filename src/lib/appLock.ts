import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

// Blocco dell'app con impronta, volto o PIN del telefono (plugin dell'app AppLockPlugin.java).

interface AppLockPlugin {
  isAvailable(): Promise<{ available: boolean; code: number }>;
  authenticate(options: { title?: string; subtitle?: string }): Promise<{ success: boolean; code?: number; message?: string }>;
}

const AppLock = registerPlugin<AppLockPlugin>('AppLock');

/** Il telefono ha un blocco schermo (impronta, volto o PIN) che l'app può usare? */
export async function lockAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await AppLock.isAvailable()).available;
  } catch {
    return false;
  }
}

let busy = false;

/** Chiede l'impronta o il PIN. Vero se l'utente si è sbloccato. */
export async function unlockWithDevice(subtitle = ''): Promise<boolean> {
  if (!isNative()) return true;
  if (busy) return false;
  busy = true;
  try {
    return (await AppLock.authenticate({ title: 'Sblocca Armadio', subtitle })).success;
  } finally {
    busy = false;
  }
}

/** Mentre è aperta la richiesta di sblocco (che a volte mette l'app in pausa) non si riblocca. */
export function unlockInProgress(): boolean {
  return busy;
}
