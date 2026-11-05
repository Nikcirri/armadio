import { liveQuery } from 'dexie';
import { reportError } from '../errors';

/**
 * Risultato di una query che si aggiorna da solo quando i dati cambiano.
 * Va chiamata durante l'inizializzazione di un componente.
 */
export function live<T>(query: () => Promise<T>, initial: T): { readonly value: T; readonly ready: boolean } {
  const state = $state<{ value: T; ready: boolean }>({ value: initial, ready: false });
  $effect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => {
        state.value = v;
        state.ready = true;
      },
      error: (e) => reportError(e),
    });
    return () => sub.unsubscribe();
  });
  return state;
}
