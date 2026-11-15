import type { CategoryRecord, SlotType } from '../db/types';
import { normalize } from './careLabel';

// Categoria suggerita dalla foto (SPEC.md, sezione 6): le etichette di ML Kit Image Labeling
// (modello generico, in inglese) diventano un tipo di capo e poi una delle tue categorie.

export interface ImageLabel {
  text: string;
  confidence: number;
}

export interface CategoryGuess {
  categoryId: string;
  /** Es. "una giacca", per "Sembra una giacca". */
  phrase: string;
  confidence: number;
}

interface Kind {
  labels: string[];
  phrase: string;
  /** Tipo di capo per l'ultima scelta (null = solo se il nome di una categoria corrisponde). */
  slot: SlotType | null;
  /** Pezzi di nome di categoria, dal più adatto. */
  keywords: string[];
  /** Più alto = etichetta più precisa (Blazer prima di Jacket, Sneakers prima di Shoe). */
  rank: number;
}

const KINDS: readonly Kind[] = [
  { labels: ['Blazer'], phrase: 'un blazer', slot: 'outerwear', keywords: ['blazer', 'giacc'], rank: 3 },
  { labels: ['Tuxedo'], phrase: 'uno smoking', slot: 'outerwear', keywords: ['smoking', 'blazer', 'giacc'], rank: 3 },
  { labels: ['Jacket'], phrase: 'una giacca', slot: 'outerwear', keywords: ['giacc', 'giubb', 'bomber', 'blazer', 'cappott', 'piumin'], rank: 2 },
  { labels: ['Outerwear'], phrase: 'un capospalla', slot: 'outerwear', keywords: ['cappott', 'piumin', 'giacc', 'giubb', 'parka', 'trench'], rank: 1 },
  { labels: ['Jeans'], phrase: 'dei jeans', slot: 'bottom', keywords: ['jeans', 'pantalon'], rank: 3 },
  { labels: ['Denim'], phrase: 'un capo in denim', slot: null, keywords: ['jeans', 'denim'], rank: 0 },
  { labels: ['Shorts'], phrase: 'degli shorts', slot: 'bottom', keywords: ['short', 'bermuda', 'pantaloncin'], rank: 3 },
  { labels: ['Leggings'], phrase: 'dei leggings', slot: 'bottom', keywords: ['legging', 'pantalon'], rank: 3 },
  { labels: ['Tights'], phrase: 'dei collant', slot: 'underwear', keywords: ['collant', 'calze', 'calz'], rank: 3 },
  { labels: ['Dress', 'Gown'], phrase: 'un abito', slot: 'full_body', keywords: ['abit', 'vestit'], rank: 3 },
  { labels: ['Swimwear', 'Wetsuit'], phrase: 'un costume', slot: null, keywords: ['costum', 'bikini', 'mare'], rank: 3 },
  { labels: ['Polo'], phrase: 'una polo', slot: 'top_base', keywords: ['polo', 't shirt', 'top', 'magliett'], rank: 3 },
  { labels: ['Jersey'], phrase: 'una maglia', slot: 'top_base', keywords: ['magli', 't shirt', 'felp', 'top'], rank: 1 },
  { labels: ['Sneakers'], phrase: 'delle sneakers', slot: 'shoes', keywords: ['sneaker', 'ginnastica', 'scarp'], rank: 3 },
  { labels: ['Shoe'], phrase: 'una scarpa', slot: 'shoes', keywords: ['scarp', 'sneaker', 'mocassin', 'ballerin', 'stival', 'tacch', 'sandal'], rank: 1 },
  { labels: ['Handbag'], phrase: 'una borsa', slot: 'accessory', keywords: ['bors', 'pochette', 'zain'], rank: 3 },
  { labels: ['Bag'], phrase: 'una borsa', slot: 'accessory', keywords: ['bors', 'zain', 'pochette'], rank: 2 },
  { labels: ['Hat', 'Cap', 'Beanie'], phrase: 'un cappello', slot: 'accessory', keywords: ['cappell', 'berrett', 'cuffi'], rank: 3 },
  { labels: ['Scarf'], phrase: 'una sciarpa', slot: 'accessory', keywords: ['sciarp', 'foulard', 'stol'], rank: 3 },
  { labels: ['Tie'], phrase: 'una cravatta', slot: 'accessory', keywords: ['cravatt', 'papillon'], rank: 3 },
  { labels: ['Sunglasses', 'Glasses'], phrase: 'degli occhiali', slot: 'accessory', keywords: ['occhial'], rank: 3 },
  {
    labels: ['Necklace', 'Bracelet', 'Bangle', 'Ring', 'Jewellery'],
    phrase: 'un gioiello',
    slot: 'accessory',
    keywords: ['gioiell', 'collane', 'braccial', 'anell', 'bijou'],
    rank: 2,
  },
];

/** Sicurezza minima di ML Kit perché il suggerimento compaia. */
export const MIN_CONFIDENCE = 0.55;

/** La tua categoria per quel tipo di capo: prima per nome, poi la prima del tipo giusto. */
function categoryFor(kind: Kind, categories: readonly CategoryRecord[]): CategoryRecord | null {
  const named = categories.map((c) => ({ c, n: normalize(c.name) }));
  for (const k of kind.keywords) {
    const hit = named.find((x) => x.n.includes(k));
    if (hit) return hit.c;
  }
  return kind.slot ? (categories.find((c) => c.slotType === kind.slot) ?? null) : null;
}

/**
 * Il tipo di capo più probabile tra le etichette (le più precise un po' avvantaggiate) e la
 * categoria corrispondente. Null se nessuna etichetta è abbastanza sicura o non c'è una categoria.
 * `categories` nell'ordine dell'app.
 */
export function guessCategory(labels: readonly ImageLabel[], categories: readonly CategoryRecord[]): CategoryGuess | null {
  let best: { kind: Kind; confidence: number; score: number } | null = null;
  for (const l of labels) {
    if (!(l.confidence >= MIN_CONFIDENCE)) continue;
    const kind = KINDS.find((k) => k.labels.some((x) => x.toLowerCase() === l.text.trim().toLowerCase()));
    if (!kind) continue;
    const score = l.confidence + kind.rank * 0.06;
    if (!best || score > best.score) best = { kind, confidence: l.confidence, score };
  }
  if (!best) return null;
  const category = categoryFor(best.kind, categories);
  return category ? { categoryId: category.id, phrase: best.kind.phrase, confidence: Math.round(best.confidence * 100) / 100 } : null;
}
