import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const APP_VERSION: string = __APP_VERSION__;

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Vibrazione leggera sulle azioni principali (se il telefono la supporta). */
export async function tapFeedback(style: 'light' | 'medium' = 'light'): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium });
  } catch {
    // La vibrazione è un extra: se non c'è si continua senza.
  }
}

/** Chiede al sistema di non cancellare i dati quando lo spazio è poco (soprattutto per la versione web). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Non disponibile: nessun problema.
  }
}
