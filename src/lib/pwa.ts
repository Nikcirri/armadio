import { isNative } from './platform';
import { showToast } from './state/ui.svelte';

/** Versione web: registra il service worker (l'app funziona anche senza internet). */
export function registerServiceWorker(): void {
  if (isNative() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Al primo avvio non c'è niente da aggiornare; dopo, una versione nuova è pronta.
    if (!hadController || reloading) return;
    showToast('È pronta una versione nuova di Armadio', {
      actionLabel: 'Ricarica',
      onAction: () => {
        reloading = true;
        location.reload();
      },
      duration: 10000,
    });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.error(e));
  });
}
