import type { ListKind, ListRecord } from '../db/types';
import { normalize } from './items';

// Categorie e liste (SPEC.md, sezione 8.5).

export type EditableKind = Exclude<ListKind, 'packingTemplate'>;

export const LIST_KINDS: readonly { kind: EditableKind; label: string; singular: string; hint: string; byName: boolean }[] = [
  { kind: 'owner', label: 'Proprietari', singular: 'proprietario', hint: 'Di chi è il capo (es. Mio, di mia sorella).', byName: false },
  { kind: 'location', label: 'Posizioni', singular: 'posizione', hint: 'Dove tieni il capo (es. Cassettiera, Seconda casa).', byName: false },
  { kind: 'occasion', label: 'Occasioni', singular: 'occasione', hint: 'Per quando va bene un capo o un outfit.', byName: false },
  { kind: 'fabric', label: 'Tessuti', singular: 'tessuto', hint: 'Suggerimenti nella scheda capo.', byName: true },
  { kind: 'maintenance', label: 'Tag di manutenzione', singular: 'tag', hint: 'Cosa c’è da sistemare su un capo.', byName: true },
  { kind: 'person', label: 'Persone', singular: 'persona', hint: 'Nomi suggeriti nel diario dei ricordi.', byName: true },
];

export function kindInfo(kind: EditableKind) {
  return LIST_KINDS.find((k) => k.kind === kind)!;
}

/** Voci che servono all'app: si rinominano ma non si eliminano. */
export function isProtected(entry: Pick<ListRecord, 'kind' | 'extra'>): boolean {
  const k = entry.extra.key;
  return (entry.kind === 'owner' && k === 'mine') || (entry.kind === 'location' && (k === 'main' || k === 'seasonBox'));
}

/** Il nome è già usato da un'altra voce dello stesso tipo? */
export function nameTaken(lists: readonly Pick<ListRecord, 'id' | 'kind' | 'name'>[], kind: ListKind, name: string, exceptId: string | null = null): boolean {
  const n = normalize(name);
  return lists.some((l) => l.kind === kind && l.id !== exceptId && normalize(l.name) === n);
}

/** Sostituisce un nome in una lista di nomi (tessuti, tag, persone), senza doppioni. */
export function renameIn(names: readonly string[], from: string, to: string): string[] {
  const out: string[] = [];
  for (const n of names) {
    const v = n === from ? to : n;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

// ---------- Matrice delle occasioni ----------

export function samePair(p: readonly [string, string], a: string, b: string): boolean {
  return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
}

export function hasPair(matrix: readonly (readonly [string, string])[], a: string, b: string): boolean {
  return matrix.some((p) => samePair(p, a, b));
}

export function togglePair(matrix: readonly (readonly [string, string])[], a: string, b: string): [string, string][] {
  if (hasPair(matrix, a, b)) return matrix.filter((p) => !samePair(p, a, b)).map((p) => [p[0], p[1]]);
  return [...matrix.map((p): [string, string] => [p[0], p[1]]), [a, b]];
}

/** Tutte le coppie di occasioni, per l'elenco delle impostazioni. */
export function allPairs<T extends { id: string }>(occasions: readonly T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < occasions.length; i++) for (let j = i + 1; j < occasions.length; j++) out.push([occasions[i]!, occasions[j]!]);
  return out;
}

export function withoutOccasion(matrix: readonly (readonly [string, string])[], id: string): [string, string][] {
  return matrix.filter((p) => p[0] !== id && p[1] !== id).map((p) => [p[0], p[1]]);
}
