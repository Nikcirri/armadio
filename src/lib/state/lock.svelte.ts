/** Stato del blocco dell'app: sbloccata in questa sessione e quando è andata in secondo piano. */
export const lock = $state<{ unlocked: boolean; hiddenAt: number | null }>({ unlocked: false, hiddenAt: null });

/** Dopo quanto tempo in secondo piano l'app si riblocca. */
export const RELOCK_AFTER_MS = 60_000;

export function shouldRelock(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= RELOCK_AFTER_MS;
}
