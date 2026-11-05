// Ricorda l'ultima categoria usata per aggiungere un capo (comodità per chi usa l'app; non è un dato).
const KEY = 'armadio.lastCategoryId';

export function getLastCategoryId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastCategoryId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Memoria del browser non disponibile: nessun problema.
  }
}
