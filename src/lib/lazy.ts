import type { Component } from 'svelte';

/**
 * Componente caricato a richiesta (SPEC.md, sezione 7): il suo codice sta in un file separato
 * e arriva solo la prima volta che serve, così all'avvio il telefono ha meno JavaScript da leggere.
 */
export interface LazyComponent<P extends Record<string, any>> {
  /** Il componente, se è già stato caricato (allora si mostra subito, senza attesa). */
  readonly current: Component<P> | null;
  /** Carica il componente una volta sola; se fallisce, la chiamata successiva riprova. */
  load(): Promise<Component<P>>;
}

export function lazyComponent<P extends Record<string, any>>(
  importer: () => Promise<{ default: Component<P> }>,
): LazyComponent<P> {
  let current: Component<P> | null = null;
  let pending: Promise<Component<P>> | null = null;
  return {
    get current() {
      return current;
    },
    load() {
      if (current) return Promise.resolve(current);
      pending ??= importer().then(
        (mod) => {
          current = mod.default;
          return current;
        },
        (error: unknown) => {
          pending = null;
          throw error;
        },
      );
      return pending;
    },
  };
}
