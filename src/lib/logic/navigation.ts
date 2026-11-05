export type TabId = 'armadio' | 'outfit' | 'cosa-metto' | 'agenda' | 'altro';

export interface TabInfo {
  id: TabId;
  label: string;
  phase: number;
  description: string;
}

export const TABS: readonly TabInfo[] = [
  {
    id: 'armadio',
    label: 'Armadio',
    phase: 3,
    description: 'Qui troverai tutti i tuoi capi, con foto, filtri e lavanderia.',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    phase: 5,
    description: 'Qui creerai i tuoi look e il diario dei ricordi.',
  },
  {
    id: 'cosa-metto',
    label: 'Cosa metto?',
    phase: 6,
    description: "Qui l'app ti proporrà un abbinamento in base a meteo e occasione.",
  },
  {
    id: 'agenda',
    label: 'Agenda',
    phase: 7,
    description: 'Qui pianificherai i giorni e preparerai la valigia.',
  },
  {
    id: 'altro',
    label: 'Altro',
    phase: 8,
    description: 'Qui troverai wishlist, taglie, statistiche, impostazioni e backup.',
  },
];

/** Tempo massimo (ms) tra due pressioni di Indietro per uscire dall'app. */
export const EXIT_WINDOW_MS = 2000;

export type BackAction = 'close-overlay' | 'previous-tab' | 'confirm-exit' | 'exit';

export interface BackInput {
  overlayOpen: boolean;
  historyLength: number;
  lastBackPressAt: number | null;
  now: number;
}

/**
 * Decide cosa fa il tasto Indietro di Android:
 * 1. chiude il foglio o il dialogo aperto;
 * 2. torna alla scheda precedente;
 * 3. alla prima pressione sulla scheda iniziale chiede conferma;
 * 4. alla seconda pressione entro EXIT_WINDOW_MS esce.
 */
export function decideBack(input: BackInput): BackAction {
  if (input.overlayOpen) return 'close-overlay';
  if (input.historyLength > 1) return 'previous-tab';
  if (input.lastBackPressAt !== null && input.now - input.lastBackPressAt <= EXIT_WINDOW_MS) {
    return 'exit';
  }
  return 'confirm-exit';
}

/** Aggiunge una scheda alla cronologia, senza duplicati consecutivi e senza cicli. */
export function pushTab(history: readonly TabId[], tab: TabId): TabId[] {
  if (history[history.length - 1] === tab) return [...history];
  const withoutTab = history.filter((t) => t !== tab);
  return [...withoutTab, tab];
}

/** Toglie l'ultima scheda dalla cronologia, lasciandone sempre almeno una. */
export function popTab(history: readonly TabId[]): TabId[] {
  if (history.length <= 1) return [...history];
  return history.slice(0, -1);
}
