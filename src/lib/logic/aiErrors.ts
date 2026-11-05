// Riconosce i messaggi di errore di ML Kit / Google Play services per lo scontorno AI.

/** Il modulo di Google manca o si sta ancora scaricando: va proposto il download. */
export function isAiModuleMissing(message: string): boolean {
  if (isAiModuleAlreadyInstalled(message)) return false;
  return /waiting for .*module|optional module|module .*(not|isn't) (available|installed|downloaded)|not available|unavailable|download/i.test(
    message,
  );
}

/** Google dice che il modulo è già installato: non è un errore. */
export function isAiModuleAlreadyInstalled(message: string): boolean {
  return /already installed/i.test(message);
}
