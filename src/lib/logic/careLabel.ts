import type { WashTag } from '../db/types';

// "Leggi l'etichetta" (SPEC.md, sezione 8.1): dal testo letto sull'etichetta interna di un capo
// ricava marca, taglia, tessuti e istruzioni di lavaggio scritte. Funzioni pure.

/** Una riga letta da ML Kit, con il rettangolo in pixel (sinistra, alto, destra, basso) se c'è. */
export interface OcrLine {
  text: string;
  box: readonly [number, number, number, number] | null;
}

export interface Fiber {
  /** Nome italiano in minuscolo, es. "cotone". */
  name: string;
  percent: number;
}

export interface LabelReading {
  /** sure = marca riconosciuta (tua o nota); altrimenti è solo la scritta più grande. */
  brand: { value: string; sure: boolean } | null;
  size: string | null;
  /** Fibre del tessuto principale (non la fodera), dalla più presente. */
  fibers: Fiber[];
  /** Es. "95% cotone, 5% elastan". */
  composition: string | null;
  /** Tessuti da mettere nel capo: quelli dal 15% in su, con i nomi della tua lista. */
  fabrics: string[];
  washTags: WashTag[];
  /** Tutto il testo letto, riga per riga. */
  text: string;
}

/** Un tessuto entra tra quelli del capo da questa percentuale in su (sotto è solo nelle note). */
export const MAIN_FIBER_PERCENT = 15;

/** Minuscolo, senza accenti, apostrofi e trattini come spazi. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`´-]/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

// ---------- Fibre ----------

interface FiberInfo {
  name: string;
  synthetic: boolean;
  /** Parole e sigle (già normalizzate) in italiano, inglese, francese, spagnolo, tedesco, olandese, portoghese. */
  words: string[];
}

const FIBERS: readonly FiberInfo[] = [
  { name: 'cotone', synthetic: false, words: ['cotone', 'cotton', 'coton', 'algodon', 'baumwolle', 'katoen', 'algodao', 'co', 'cot'] },
  { name: 'poliestere', synthetic: true, words: ['poliestere', 'polyester', 'polyestere', 'poliester', 'poliéster', 'polyesterfaser', 'pes', 'pl', 'pet'] },
  { name: 'elastan', synthetic: true, words: ['elastan', 'elastane', 'elasthan', 'elasthanne', 'elastam', 'elastano', 'spandex', 'lycra', 'ea', 'el'] },
  { name: 'poliammide', synthetic: true, words: ['poliammide', 'polyamide', 'polyamid', 'poliamida', 'poliamide', 'nylon', 'nailon', 'pa'] },
  { name: 'viscosa', synthetic: false, words: ['viscosa', 'viscose', 'viskose', 'vi', 'cv'] },
  { name: 'lino', synthetic: false, words: ['lino', 'linen', 'lin', 'leinen', 'linnen', 'linho', 'li'] },
  { name: 'lana', synthetic: false, words: ['lana vergine', 'virgin wool', 'laine vierge', 'schurwolle', 'lana', 'wool', 'laine', 'wolle', 'wol', 'wo', 'wv'] },
  { name: 'seta', synthetic: false, words: ['seta', 'silk', 'soie', 'seda', 'seide', 'zijde', 'se'] },
  { name: 'acrilico', synthetic: true, words: ['acrilico', 'acrylic', 'acrylique', 'acryl', 'pan', 'pc'] },
  { name: 'cashmere', synthetic: false, words: ['cashmere', 'cachemire', 'cachemira', 'kaschmir', 'kasjmier', 'ws'] },
  { name: 'modal', synthetic: false, words: ['modal', 'md', 'cmd'] },
  { name: 'lyocell', synthetic: false, words: ['lyocell', 'liocel', 'tencel', 'cly'] },
  { name: 'acetato', synthetic: true, words: ['acetato', 'acetate', 'acetat', 'ca'] },
  { name: 'cupro', synthetic: false, words: ['cupro', 'cup'] },
  { name: 'poliuretano', synthetic: true, words: ['poliuretano', 'polyurethane', 'polyurethan', 'pu'] },
  { name: 'alpaca', synthetic: false, words: ['alpaca', 'alpaka', 'wp'] },
  { name: 'mohair', synthetic: false, words: ['mohair', 'wm'] },
  { name: 'angora', synthetic: false, words: ['angora', 'wa'] },
  { name: 'pelle', synthetic: false, words: ['pelle', 'leather', 'cuir', 'cuero', 'leder', 'leer', 'couro'] },
  { name: 'camoscio', synthetic: false, words: ['camoscio', 'suede', 'daim', 'ante', 'wildleder'] },
];

const FIBER_BY_WORD = new Map<string, FiberInfo>();
for (const f of FIBERS) for (const w of f.words) FIBER_BY_WORD.set(normalize(w), f);
const FIBER_ALT = [...FIBER_BY_WORD.keys()].sort((a, b) => b.length - a.length).join('|');
const FIBER_RE = new RegExp(`(?<![a-z])(${FIBER_ALT})(?![a-z])`, 'g');
const NUMBER_FIRST = new RegExp(`%\\s*(?:${FIBER_ALT})(?![a-z])`, 'g');
const WORD_FIRST = new RegExp(`(?<![a-z])(?:${FIBER_ALT})\\s*:?\\s*\\d{1,3}(?:[.,]\\d)?\\s*%`, 'g');

// Sezioni dell'etichetta: il tessuto principale e quelle da non contare (fodera, tasche, imbottitura…).
const MAIN_SECTION = /(?:^|[^a-z])(esterno|tessuto principale|tessuto|parte esterna|shell|outer|outside|main fabric|exterieur|exterior|oberstoff|buitenkant)(?![a-z])/g;
const OTHER_SECTION =
  /(?:^|[^a-z])(fodera|fodere|lining|doublure|forro|futter|voering|tasche|tasca|pocket|pockets|poche|poches|bolsillo|bolsillos|imbottitura|padding|filling|rembourrage|relleno|wattierung|fullung|bordi|finiture|trim|rib|polsini|maniche|sleeves)(?![a-z])/g;

interface Section {
  kind: 'lead' | 'main' | 'other';
  text: string;
}

function sections(text: string): Section[] {
  const marks: { at: number; end: number; kind: 'main' | 'other' }[] = [];
  for (const m of text.matchAll(MAIN_SECTION)) marks.push({ at: m.index, end: m.index + m[0].length, kind: 'main' });
  for (const m of text.matchAll(OTHER_SECTION)) marks.push({ at: m.index, end: m.index + m[0].length, kind: 'other' });
  marks.sort((a, b) => a.at - b.at);
  const out: Section[] = [{ kind: 'lead', text: text.slice(0, marks[0]?.at ?? text.length) }];
  marks.forEach((m, i) => out.push({ kind: m.kind, text: text.slice(m.end, marks[i + 1]?.at ?? text.length) }));
  return out;
}

/** Le fibre con la percentuale in un pezzo di testo, fermandosi a 100% (le etichette ripetono in più lingue). */
function fibersIn(text: string): Fiber[] {
  // "95% COTONE" (numero prima) o "COTONE 95%" (numero dopo)? Vince la forma più frequente.
  const numberFirst = [...text.matchAll(NUMBER_FIRST)].length;
  const wordFirst = [...text.matchAll(WORD_FIRST)].length;
  const found: Fiber[] = [];
  let total = 0;
  const percents = [...text.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*%/g)];
  percents.forEach((m, i) => {
    if (total >= 99.5) return;
    const percent = Number(m[1]!.replace(',', '.'));
    if (!(percent > 0 && percent <= 100)) return;
    // Finestre fino al numero vicino: "95% XYZ 5% ELASTAN" non dà l'elastan al 95%.
    const end = m.index + m[0].length;
    const next = percents[i + 1]?.index ?? text.length;
    const prev = i > 0 ? percents[i - 1]!.index + percents[i - 1]![0].length : 0;
    const after = text.slice(end, Math.min(next, end + 30));
    const before = text.slice(Math.max(prev, m.index - 25), m.index);
    const firstAfter = () => {
      FIBER_RE.lastIndex = 0;
      return FIBER_RE.exec(after)?.[1];
    };
    const lastBefore = () => {
      const all = [...before.matchAll(FIBER_RE)];
      return all[all.length - 1]?.[1];
    };
    const word = wordFirst > numberFirst ? (lastBefore() ?? firstAfter()) : (firstAfter() ?? lastBefore());
    const fiber = word ? FIBER_BY_WORD.get(word) : undefined;
    if (!fiber || found.some((f) => f.name === fiber.name) || total + percent > 100.5) return;
    found.push({ name: fiber.name, percent });
    total += percent;
  });
  return found;
}

/** Fibre del tessuto principale: la sezione "esterno" se c'è, altrimenti la prima parte con percentuali. */
export function parseFibers(text: string): Fiber[] {
  const norm = normalize(text);
  const parts = sections(norm);
  const main = parts.find((p) => p.kind === 'main' && fibersIn(p.text).length);
  const chosen = main ?? parts.find((p) => p.kind === 'lead' && fibersIn(p.text).length) ?? parts.find((p) => p.kind !== 'other' && fibersIn(p.text).length);
  return chosen ? fibersIn(chosen.text).sort((a, b) => b.percent - a.percent) : [];
}

const formatPercent = (p: number) => (Number.isInteger(p) ? String(p) : String(p).replace('.', ','));

export function compositionText(fibers: readonly Fiber[]): string | null {
  return fibers.length ? fibers.map((f) => `${formatPercent(f.percent)}% ${f.name}`).join(', ') : null;
}

/**
 * I tessuti da mettere nel capo: le fibre dal 15% in su (o la principale), con il nome della lista
 * dell'utente se c'è; le sintetiche diventano "Sintetico" se la lista ha quello e non il loro nome.
 */
export function fabricsFor(fibers: readonly Fiber[], fabricList: readonly string[]): string[] {
  const byName = new Map(fabricList.map((n) => [normalize(n).trim(), n]));
  const synthetic = byName.get('sintetico');
  const out: string[] = [];
  fibers.forEach((f, i) => {
    if (i > 0 && f.percent < MAIN_FIBER_PERCENT) return;
    const info = FIBERS.find((x) => x.name === f.name);
    const own = byName.get(f.name);
    const name = own ?? (info?.synthetic && synthetic ? synthetic : f.name.charAt(0).toUpperCase() + f.name.slice(1));
    if (!out.includes(name)) out.push(name);
  });
  return out;
}

// ---------- Taglia ----------

const LETTER_SIZES = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL'];
const LETTER = `(?:${[...LETTER_SIZES].sort((a, b) => b.length - a.length).join('|')})`;
const REGIONS: Readonly<Record<string, string>> = {
  IT: 'IT',
  I: 'IT',
  EU: 'EU',
  EUR: 'EU',
  FR: 'FR',
  F: 'FR',
  DE: 'DE',
  D: 'DE',
  ES: 'ES',
  E: 'ES',
  UK: 'UK',
  GB: 'UK',
  US: 'US',
  USA: 'US',
};
const REGION_ORDER = ['IT', 'EU', 'FR', 'DE', 'ES', 'UK', 'US'];

/** La taglia: dopo "Taglia/Size…", poi IT/EU/… con il numero, poi W e L, poi una taglia a lettere su una riga corta. */
export function parseSize(lines: readonly string[]): string | null {
  const upper = lines.map((l) => normalize(l).toUpperCase());
  const all = upper.join(' | ');

  const keyword = new RegExp(`(?:^|[^A-Z])(?:TAGLIA|SIZE|TALLA|TAILLE|GROSSE|GROESSE|GR\\.|MAAT|TAMANHO|TAM\\.)\\s*[:.]?\\s*(${LETTER}|\\d{1,2}(?:[.,]5)?)(?![A-Z0-9])`);
  const k = keyword.exec(all);
  if (k) return k[1]!.replace(',', '.');

  const region = new RegExp(`(?:^|[^A-Z])(${Object.keys(REGIONS).join('|')})\\s*[:.]?\\s*(${LETTER}|\\d{1,2}(?:[.,]5)?)(?![A-Z0-9%])`, 'g');
  const found: { region: string; value: string }[] = [];
  for (const m of all.matchAll(region)) found.push({ region: REGIONS[m[1]!]!, value: m[2]!.replace(',', '.') });
  if (found.length) {
    const letter = found.find((f) => LETTER_SIZES.includes(f.value));
    if (letter) return letter.value;
    const best = [...found].sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region))[0]!;
    return `${best.region} ${best.value}`;
  }

  const wl = /(?:^|[^A-Z])W\s?(\d{2})\s*[/-]?\s*L\s?(\d{2})(?![0-9])/.exec(all);
  if (wl) return `W${wl[1]} L${wl[2]}`;

  for (const line of upper) {
    const tokens = line.split(/[\s/|]+/).filter(Boolean);
    if (tokens.length > 3) continue;
    const t = tokens.find((x) => LETTER_SIZES.includes(x));
    if (t) return t;
  }
  return null;
}

// ---------- Lavaggio ----------

const NEGATION = /(?:^|[^a-z])(?:non|not|no|ne|pas|nicht|niet|nao|dont)\s+(?:\S+\s+)?$/;

/** La frase c'è, e non è negata subito prima ("do not dry clean", "non lavare a secco")? */
function hasPhrase(text: string, phrases: readonly string[], negatable: boolean): boolean {
  for (const p of phrases) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(p, from);
      if (at < 0) break;
      from = at + p.length;
      if (!negatable || !NEGATION.test(text.slice(Math.max(0, at - 16), at))) return true;
    }
  }
  return false;
}

const WASH_PHRASES: readonly { tag: WashTag; negatable: boolean; phrases: string[] }[] = [
  {
    tag: 'handWash',
    negatable: true,
    phrases: ['lavare a mano', 'lavaggio a mano', 'lavare solo a mano', 'hand wash', 'handwash', 'wash by hand', 'lavage a la main', 'laver a la main', 'lavar a mano', 'lavado a mano', 'handwasche', 'handwaesche', 'lavar a mao'],
  },
  {
    tag: 'delicate',
    negatable: true,
    phrases: ['delicat', 'gentle', 'programma lana', 'wool cycle', 'schonwasch', 'ciclo suave', 'programa delicado'],
  },
  {
    tag: 'noSpin',
    negatable: false,
    phrases: ['non centrifugare', 'non strizzare', 'do not wring', 'do not spin', 'no spin', 'ne pas essorer', 'no centrifugar', 'no escurrir', 'nicht schleudern', 'nicht wringen', 'nicht auswringen'],
  },
  {
    tag: 'noDryer',
    negatable: false,
    phrases: [
      'non asciugare in asciugatrice',
      'non usare asciugatrice',
      'non usare l asciugatrice',
      'no asciugatrice',
      'do not tumble',
      'no tumble dry',
      'ne pas secher en tambour',
      'pas de seche linge',
      'ne pas utiliser de seche linge',
      'no usar secadora',
      'no secar en secadora',
      'nicht im trockner',
      'nicht trocknergeeignet',
      'nicht tumbler',
    ],
  },
  {
    tag: 'ironLow',
    negatable: true,
    phrases: ['stirare a bassa', 'stiro a bassa', 'stirare a basso', 'ferro tiepido', 'iron low', 'low iron', 'cool iron', 'iron on low', 'repassage doux', 'fer doux', 'repasser a basse', 'planchar a baja', 'plancha baja', 'bugeln niedrig', 'nur leicht bugeln'],
  },
  {
    tag: 'dryClean',
    negatable: true,
    phrases: ['lavaggio a secco', 'lavare a secco', 'pulitura a secco', 'dry clean', 'dryclean', 'nettoyage a sec', 'nettoyer a sec', 'limpieza en seco', 'limpiar en seco', 'chemisch reinigen', 'chemische reinigung'],
  },
];

const COLD = ['lavare a freddo', 'lavaggio a freddo', 'wash cold', 'cold wash', 'lavage a froid', 'laver a froid', 'lavar en frio', 'lavado en frio', 'kaltwasche', 'kalt waschen'];

/** Temperature di lavaggio scritte: "30°", "30 °C", "lavare a 30", "wash at 40" (non quelle del ferro, a 3 cifre). */
function washTemperatures(text: string): number[] {
  const temps: number[] = [];
  const patterns = [
    /(?:^|[^0-9])(\d{2})\s*[°º˚*]/g,
    /(?:^|[^0-9a-z])(\d{2})\s*c(?![a-z])/g,
    /(?:lavare|lavaggio|lavatrice|wash|washing|laver|lavage|lavar|lavado|waschen|wasche|max)\.?\s*(?:a|at|a max|bei|in|max|max\.|up to)?\s*(\d{2})(?![0-9])/g,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) temps.push(Number(m[1]));
  return temps.filter((t) => t >= 20 && t <= 95);
}

export function parseWash(text: string): WashTag[] {
  const norm = normalize(text);
  const tags = new Set<WashTag>();
  for (const w of WASH_PHRASES) if (hasPhrase(norm, w.phrases, w.negatable)) tags.add(w.tag);
  const temps = washTemperatures(norm);
  const coldest = temps.length ? Math.min(...temps) : Infinity;
  if (coldest <= 30 || hasPhrase(norm, COLD, true)) tags.add('max30');
  else if (coldest <= 40) tags.add('max40');
  const order: WashTag[] = ['handWash', 'max30', 'max40', 'delicate', 'noSpin', 'noDryer', 'ironLow', 'dryClean'];
  return order.filter((t) => tags.has(t));
}

// ---------- Marca ----------

/** Marche note (oltre a quelle già usate nei tuoi capi). */
export const KNOWN_BRANDS: readonly string[] = [
  'Zara', 'H&M', 'Mango', 'Bershka', 'Pull&Bear', 'Stradivarius', 'Massimo Dutti', 'Oysho', 'Lefties', 'Uniqlo', 'Primark',
  'COS', 'Arket', 'Weekday', 'Monki', '& Other Stories', 'Benetton', 'Sisley', 'OVS', 'Upim', 'Coin', 'Piazza Italia', 'Terranova',
  'Calliope', 'Alcott', 'Motivi', 'Oltre', 'Fiorella Rubino', 'Max Mara', 'Marina Rinaldi', 'Pinko', 'Liu Jo', 'Guess',
  'Patrizia Pepe', 'Twinset', 'Elisabetta Franchi', 'Kocca', 'Imperial', 'Gaudì', 'Jack & Jones', 'Only', 'Vero Moda',
  'Selected', 'Tommy Hilfiger', 'Calvin Klein', 'Ralph Lauren', 'Lacoste', 'Fred Perry', "Levi's", 'Wrangler', 'Lee',
  'Diesel', 'Replay', 'Pepe Jeans', 'Carhartt', 'Dickies', 'Superdry', 'Napapijri', 'The North Face', 'Columbia',
  'Patagonia', 'Colmar', 'Ciesse', 'Moncler', 'Woolrich', 'Barbour', 'Geox', 'Timberland', 'Clarks', 'Dr. Martens',
  'Converse', 'Vans', 'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Asics', 'Fila', 'Kappa', 'Champion',
  'Under Armour', 'Diadora', 'Lotto', 'Le Coq Sportif', 'Decathlon', 'Quechua', 'Kalenji', 'Domyos', 'Calzedonia',
  'Intimissimi', 'Tezenis', 'Yamamay', 'Golden Lady', 'Sloggi', 'Triumph', 'Lovable', 'Gap', 'Abercrombie & Fitch',
  'Hollister', 'Shein', 'Asos', 'Kiabi', 'C&A', 'Esprit', 's.Oliver', 'Tom Tailor', "Marc O'Polo", 'Hugo Boss', 'Boss',
  'Emporio Armani', 'Armani Exchange', 'Armani', 'Gucci', 'Prada', 'Miu Miu', 'Versace', 'Dolce & Gabbana', 'Fendi',
  'Valentino', 'Moschino', 'Burberry', 'Michael Kors', 'Furla', 'Desigual', 'Stone Island', 'Paul & Shark', 'North Sails',
  'Sundek', 'K-Way', 'Fay', 'Brooks Brothers', 'Zegna', 'Brunello Cucinelli', 'Herno', 'Blauer', 'Bomboogie',
  'Refrigiwear', 'Alpha Industries', 'Sandro', 'Maje', 'Zadig & Voltaire', 'Massimo Rebecchi', 'Original Marines',
  'Brums', 'Chicco', 'Sergio Tacchini', 'Ellesse', 'Champion', 'Salomon', 'Merrell', 'Skechers', 'Crocs', 'Birkenstock',
];

const key = (s: string) => normalize(s).replace(/[^a-z0-9]/g, '');
/** Marche che sono anche parole comuni ("dry clean only"): valgono solo se sono da sole sulla riga. */
const AMBIGUOUS = new Set(['only', 'lee', 'gap', 'boss', 'fay', 'coin', 'lotto', 'oltre', 'imperial', 'selected', 'champion', 'motivi', 'guess', 'lovable', 'desigual', 'triumph', 'mango', 'esprit', 'replay', 'kappa', 'vans', 'fila', 'puma', 'sandro', 'maje']);
const SIZE_OR_CARE =
  /(\d{1,3}\s*%|made in|fabbricato|hecho en|fabrique|hergestellt|^rn\b|\brn\s*\d|\bca\s*\d|www\.|\.com|lavare|wash|laver|lavar|wasch|stirare|iron|repass|planch|bugel|taglia|size|talla|taille|gross|clean|dry|tumble|bleach|candeggi|asciug|secco|nettoy|sech|javel|lejia|trock|bleich|reinig|lining|fodera|doublure|forro)/;
const STOP = new Set(['made', 'in', 'italy', 'china', 'turkey', 'india', 'bangladesh', 'portugal', 'romania', 'vietnam', 'cambodia', 'pakistan', 'morocco', 'tunisia', 'myanmar']);

function height(line: OcrLine): number {
  return line.box ? Math.max(0, line.box[3] - line.box[1]) : 0;
}

/**
 * La marca: una di quelle conosciute (prima le tue) scritta sull'etichetta, la più grande se più
 * d'una; altrimenti la scritta più grande e isolata, ma solo come proposta (sure = false).
 */
export function parseBrand(lines: readonly OcrLine[], ownBrands: readonly string[]): LabelReading['brand'] {
  const candidates = [...new Set([...ownBrands.map((b) => b.trim()).filter(Boolean), ...KNOWN_BRANDS])];
  let best: { value: string; h: number; own: boolean } | null = null;
  for (const line of lines) {
    const lineKey = key(line.text);
    const tokens = line.text.split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}&]/gu, '').toUpperCase());
    for (const brand of candidates) {
      const k = key(brand);
      if (!k) continue;
      const hit = AMBIGUOUS.has(k)
        ? lineKey === k
        : k.length <= 3
          ? tokens.includes(brand.replace(/[^\p{L}\p{N}&]/gu, '').toUpperCase())
          : lineKey.includes(k);
      if (!hit) continue;
      const own = ownBrands.some((b) => key(b) === k);
      const h = height(line);
      // Le tue marche prima; poi la scritta più grande; poi il nome più lungo ("Emporio Armani" su "Armani").
      if (!best || (own && !best.own) || (own === best.own && (h > best.h || (h === best.h && brand.length > best.value.length)))) {
        best = { value: brand, h, own };
      }
    }
  }
  if (best) return { value: best.value, sure: true };

  const usable = lines.filter((l) => {
    const t = l.text.trim();
    const letters = (t.match(/\p{L}/gu) ?? []).length;
    const digits = (t.match(/\d/g) ?? []).length;
    const words = normalize(t).split(/\s+/).filter(Boolean);
    return (
      t.length >= 3 &&
      t.length <= 24 &&
      letters >= 3 &&
      letters / t.length >= 0.6 &&
      digits <= 2 &&
      !SIZE_OR_CARE.test(normalize(t)) &&
      !words.every((w) => STOP.has(w) || FIBER_BY_WORD.has(w) || LETTER_SIZES.includes(w.toUpperCase()))
    );
  });
  if (!usable.length) return null;
  const heights = lines.map(height).filter((h) => h > 0).sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)]! : 0;
  const top = [...usable].sort((a, b) => height(b) - height(a))[0]!;
  const prominent = lines.length <= 3 || (median > 0 && height(top) >= median * 1.3);
  return prominent ? { value: top.text.trim(), sure: false } : null;
}

// ---------- Tutto insieme ----------

export function readCareLabel(lines: readonly OcrLine[], ownBrands: readonly string[], fabricList: readonly string[]): LabelReading {
  const clean = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
  const text = clean.map((l) => l.text).join('\n');
  const fibers = parseFibers(clean.map((l) => l.text).join(' | '));
  return {
    brand: parseBrand(clean, ownBrands),
    size: parseSize(clean.map((l) => l.text)),
    fibers,
    composition: compositionText(fibers),
    fabrics: fabricsFor(fibers, fabricList),
    washTags: parseWash(text),
    text,
  };
}

/** Ha trovato qualcosa di sicuro da usare? (Una marca solo proposta non basta.) */
export function hasFindings(r: LabelReading): boolean {
  return !!(r.brand?.sure || r.size || r.fibers.length || r.washTags.length);
}
