import type { ColorId, ItemRecord, Season, SlotType, Warmth } from '../db/types';
import { colorInfo } from './colors';
import { isAvailable, normalize } from './items';
import type { OutfitMode } from './outfits';
import { daysBetween } from './util';

// "Cosa metto?" (SPEC.md, sezione 8.3): regole, punteggio e spiegazioni.

// ---------- Opzioni ----------

export type Temperature = 'hot' | 'mild' | 'cold';
export type Harmony = 'free' | 'neutral' | 'balanced';

export const TEMPERATURES: readonly { id: Temperature; label: string; emoji: string }[] = [
  { id: 'hot', label: 'Caldo', emoji: '☀️' },
  { id: 'mild', label: 'Mite', emoji: '⛅' },
  { id: 'cold', label: 'Freddo', emoji: '❄️' },
];

export const HARMONIES: readonly { id: Harmony; label: string; hint: string }[] = [
  { id: 'free', label: 'Libera', hint: 'Qualsiasi colore.' },
  { id: 'neutral', label: 'Neutri/Monocromatico', hint: 'Solo neutri, oppure una sola famiglia di colore.' },
  { id: 'balanced', label: 'Contrasto bilanciato', hint: 'Neutri più al massimo un colore d’accento.' },
];

export interface GeneratorOptions {
  temperature: Temperature;
  rain: boolean;
  /** "A cipolla": base leggera + strato + capospalla. */
  layers: boolean;
  occasionId: string | null;
  harmony: Harmony;
  /** Coordina scarpe e borsa/cintura. */
  coordinate: boolean;
  /** Dai una possibilità ai dimenticati. */
  forgotten: boolean;
  onlyAvailable: boolean;
}

export function defaultGeneratorOptions(): GeneratorOptions {
  return {
    temperature: 'mild',
    rain: false,
    layers: false,
    occasionId: null,
    harmony: 'free',
    coordinate: true,
    forgotten: false,
    onlyAvailable: true,
  };
}

export interface GeneratorContext {
  items: readonly ItemRecord[];
  seasonBoxId: string | null;
  /** Coppie di id di occasioni incompatibili. */
  occasionMatrix: readonly (readonly [string, string])[];
  /** Id delle occasioni "da sera" (capospalla ammesso anche col caldo). */
  eveningOccasionIds: readonly string[];
  occasionLabel: (id: string) => string;
  /** Nomi dei tessuti esclusi con la pioggia (camoscio, seta, lino), già normalizzati. */
  rainBannedFabrics: readonly string[];
  /** Borse e cinture, per "Coordina scarpe e borsa/cintura". */
  coordinatingIds: ReadonlySet<string>;
  today: string;
  antiRepeatDays: number;
  /** Capi degli outfit indossati negli ultimi 14 giorni (una lista per voce dello storico). */
  recentLooks: readonly (readonly string[])[];
}

// ---------- Slot ----------

export type GenSlot = SlotType;

/** Ordine dei rulli, dall'alto in basso. */
export const GEN_SLOTS: readonly { slot: GenSlot; label: string }[] = [
  { slot: 'outerwear', label: 'Capospalla' },
  { slot: 'top_layer', label: 'Strato' },
  { slot: 'top_base', label: 'Sopra' },
  { slot: 'full_body', label: 'Intero' },
  { slot: 'bottom', label: 'Sotto' },
  { slot: 'shoes', label: 'Scarpe' },
  { slot: 'accessory', label: 'Accessorio' },
];

export type Need = 'required' | 'optional' | 'never';

export function slotNeeds(mode: OutfitMode, opts: GeneratorOptions, ctx: Pick<GeneratorContext, 'eveningOccasionIds'>): Record<GenSlot, Need> {
  const evening = !!opts.occasionId && ctx.eveningOccasionIds.includes(opts.occasionId);
  const outerwear: Need = opts.layers || opts.temperature === 'cold' ? 'required' : opts.temperature === 'hot' ? (evening ? 'optional' : 'never') : 'optional';
  const separates = mode === 'separates';
  return {
    top_base: separates ? 'required' : 'never',
    bottom: separates ? 'required' : 'never',
    full_body: separates ? 'never' : 'required',
    top_layer: opts.layers ? 'required' : 'optional',
    outerwear,
    shoes: 'required',
    accessory: 'optional',
  };
}

/** Le modalità possibili: "A cipolla" vuole sopra base + strato, quindi solo Spezzato. */
export function modesFor(opts: GeneratorOptions): OutfitMode[] {
  return opts.layers ? ['separates'] : ['separates', 'onePiece'];
}

// ---------- Regole sui singoli capi ----------

export type ExclusionReason = 'unavailable' | 'occasion' | 'temperature' | 'season' | 'rain' | 'layers' | 'recent';

const CLOTHING: readonly GenSlot[] = ['top_base', 'top_layer', 'bottom', 'full_body', 'outerwear'];

function warmthAllowed(slot: GenSlot, warmth: Warmth, opts: GeneratorOptions): boolean {
  switch (opts.temperature) {
    case 'hot':
      if (slot === 'outerwear') return warmth === 'light';
      return warmth !== 'heavy';
    case 'mild':
      return warmth !== 'heavy';
    case 'cold':
      if (slot === 'top_base' || slot === 'accessory') return true;
      return warmth !== 'light';
  }
}

function seasonAllowed(season: Season, opts: GeneratorOptions): boolean {
  if (opts.temperature === 'hot') return season !== 'autumnWinter';
  if (opts.temperature === 'cold') return season !== 'springSummer';
  return true;
}

function rainAllowed(item: ItemRecord, slot: GenSlot, ctx: GeneratorContext): boolean {
  if (slot === 'shoes' && !item.waterproof) return false;
  return !item.fabrics.some((f) => {
    const n = normalize(f);
    return ctx.rainBannedFabrics.some((banned) => n === banned || n.includes(banned));
  });
}

/** Il capo ha l'occasione scelta (i capi senza occasioni vanno bene per tutte). */
function occasionAllowed(item: ItemRecord, opts: GeneratorOptions): boolean {
  return !opts.occasionId || item.occasions.length === 0 || item.occasions.includes(opts.occasionId);
}

function wornRecently(item: ItemRecord, slot: GenSlot, ctx: GeneratorContext): boolean {
  if (!CLOTHING.includes(slot) || !item.lastWornDate || ctx.antiRepeatDays <= 0) return false;
  return daysBetween(item.lastWornDate, ctx.today) < ctx.antiRepeatDays;
}

/** Perché un capo non può stare in quello slot oggi (null = va bene). L'ordine serve per le spiegazioni. */
export function exclusionReason(
  item: ItemRecord,
  slot: GenSlot,
  opts: GeneratorOptions,
  ctx: GeneratorContext,
  relaxRecent = false,
): ExclusionReason | null {
  if (opts.onlyAvailable && !isAvailable(item, ctx.seasonBoxId)) return 'unavailable';
  if (!occasionAllowed(item, opts)) return 'occasion';
  if (!warmthAllowed(slot, item.warmth, opts)) return 'temperature';
  if (CLOTHING.includes(slot) && !seasonAllowed(item.season, opts)) return 'season';
  if (opts.rain && !rainAllowed(item, slot, ctx)) return 'rain';
  if (opts.layers && slot === 'top_base' && item.warmth !== 'light') return 'layers';
  if (!relaxRecent && wornRecently(item, slot, ctx)) return 'recent';
  return null;
}

// ---------- Look ----------

export interface Look {
  mode: OutfitMode;
  /** Un capo per slot; lo slot manca se è vuoto. */
  picks: Partial<Record<GenSlot, string>>;
}

/** Lucchetti: un id tiene quel capo, null tiene lo slot vuoto. */
export type Locks = Partial<Record<GenSlot, string | null>>;

export function lookItemIds(look: Look): string[] {
  return GEN_SLOTS.map((s) => look.picks[s.slot]).filter((id): id is string => !!id);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// ---------- Colori ----------

const FAMILY: Record<ColorId, string> = {
  black: 'black',
  white: 'white',
  grey: 'grey',
  cream: 'earth',
  brown: 'earth',
  navy: 'blue',
  denim: 'blue',
  green: 'green',
  olive: 'green',
  red: 'red',
  burgundy: 'red',
  pink: 'red',
  yellow: 'yellow',
  orange: 'yellow',
  purple: 'purple',
  metallic: 'metallic',
  pattern: 'pattern',
};

export function colorFamily(c: ColorId): string {
  return FAMILY[c];
}

/** Colori d'accento distinti (non neutri; la fantasia conta come accento). */
export function accentColors(colors: readonly ColorId[]): ColorId[] {
  return [...new Set(colors.filter((c) => c === 'pattern' || !colorInfo(c).neutral))];
}

export function harmonyOk(colors: readonly ColorId[], harmony: Harmony): boolean {
  if (harmony === 'free' || colors.length === 0) return true;
  const accents = accentColors(colors);
  if (harmony === 'balanced') return accents.length <= 1;
  if (accents.length === 0) return true;
  if (colors.includes('pattern')) return false;
  return new Set(colors.map(colorFamily)).size === 1;
}

// ---------- Validità e punteggio ----------

/** Due capi sono incompatibili se nessuna delle loro occasioni può stare insieme. */
export function occasionsCompatible(a: readonly string[], b: readonly string[], matrix: GeneratorContext['occasionMatrix']): boolean {
  if (!a.length || !b.length) return true;
  const bad = (x: string, y: string) => matrix.some(([p, q]) => (p === x && q === y) || (p === y && q === x));
  return a.some((x) => b.some((y) => !bad(x, y)));
}

export type Violation = 'structure' | 'occasions' | 'harmony' | 'coldBase' | 'repeat';

export function lookViolation(
  look: Look,
  byId: ReadonlyMap<string, ItemRecord>,
  opts: GeneratorOptions,
  ctx: GeneratorContext,
  relaxRecent = false,
): Violation | null {
  const needs = slotNeeds(look.mode, opts, ctx);
  for (const { slot } of GEN_SLOTS) {
    const id = look.picks[slot];
    if (needs[slot] === 'required' && !id) return 'structure';
    if (needs[slot] === 'never' && id) return 'structure';
  }
  const items = lookItemIds(look)
    .map((id) => byId.get(id))
    .filter((i): i is ItemRecord => !!i);
  if (!opts.occasionId) {
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++)
        if (!occasionsCompatible(items[i]!.occasions, items[j]!.occasions, ctx.occasionMatrix)) return 'occasions';
  }
  if (!harmonyOk(items.flatMap((i) => i.colors), opts.harmony)) return 'harmony';
  if (opts.temperature === 'cold' && look.mode === 'separates' && !look.picks.top_layer) {
    const base = look.picks.top_base ? byId.get(look.picks.top_base) : undefined;
    if (base?.warmth === 'light') return 'coldBase';
  }
  if (!relaxRecent) {
    const ids = items.map((i) => i.id);
    if (ctx.recentLooks.some((r) => sameSet(r, ids))) return 'repeat';
  }
  return null;
}

export interface Scored {
  score: number;
  reasons: string[];
}

const FORGOTTEN_DAYS = 30;

function forgottenItem(item: ItemRecord, ctx: GeneratorContext): boolean {
  return !item.lastWornDate || daysBetween(item.lastWornDate, ctx.today) >= FORGOTTEN_DAYS;
}

/** Regole morbide: più alto è meglio. Le ragioni diventano le chip "Perché funziona". */
export function scoreLook(look: Look, byId: ReadonlyMap<string, ItemRecord>, opts: GeneratorOptions, ctx: GeneratorContext): Scored {
  const get = (slot: GenSlot) => {
    const id = look.picks[slot];
    return id ? byId.get(id) : undefined;
  };
  const reasons: string[] = [];
  let score = 0;
  const tops = [get('top_base'), get('top_layer')].filter((i): i is ItemRecord => !!i);
  const bottom = get('bottom');
  const all = lookItemIds(look)
    .map((id) => byId.get(id))
    .filter((i): i is ItemRecord => !!i);

  // Tagli
  if (bottom) {
    if (tops.some((t) => t.cutStyle === 'crop') && bottom.cutStyle === 'highWaist') {
      score += 3;
      reasons.push('Crop + vita alta');
    }
    const topOversize = tops.some((t) => t.cutStyle === 'oversize');
    const topFitted = tops.some((t) => t.cutStyle === 'fitted' || t.cutStyle === 'slim');
    if (topOversize && (bottom.cutStyle === 'fitted' || bottom.cutStyle === 'slim')) {
      score += 3;
      reasons.push('Oversize + aderente');
    } else if (topFitted && bottom.cutStyle === 'oversize') {
      score += 2;
      reasons.push('Aderente + oversize');
    }
    if (topOversize && bottom.cutStyle === 'oversize') score -= 6;
  }

  // Colori
  const colors = all.flatMap((i) => i.colors);
  const accents = accentColors(colors);
  if (opts.harmony === 'neutral') reasons.push(accents.length ? 'Tono su tono' : 'Tutto neutro');
  else if (opts.harmony === 'balanced') reasons.push(accents.length ? `Neutri + ${colorInfo(accents[0]!).label.toLowerCase()}` : 'Tutto neutro');
  else if (accents.length >= 3) score -= 2;
  else if (colors.length && accents.length === 0) {
    score += 1;
    reasons.push('Colori neutri, vanno con tutto');
  } else if (colors.length && accents.length === 1) {
    score += 1;
    reasons.push(`Un solo colore d’accento: ${colorInfo(accents[0]!).label.toLowerCase()}`);
  }

  // Scarpe e borsa/cintura
  const shoes = get('shoes');
  const acc = get('accessory');
  if (opts.coordinate && shoes && acc && ctx.coordinatingIds.has(acc.id)) {
    const sf = shoes.colors[0] ? colorFamily(shoes.colors[0]) : null;
    const af = acc.colors[0] ? colorFamily(acc.colors[0]) : null;
    if (sf && sf === af) {
      score += 3;
      reasons.push(acc.bagSize ? 'Scarpe e borsa coordinate' : 'Scarpe e cintura coordinate');
    } else {
      score -= 3;
    }
  } else if (opts.coordinate && acc && !ctx.coordinatingIds.has(acc.id)) {
    score -= 0.5;
  }

  // Dimenticati e varietà
  const forgotten = all.filter((i) => forgottenItem(i, ctx));
  if (opts.forgotten && forgotten.length) {
    score += 2 * forgotten.length;
    reasons.push(`Rispolvera: ${forgotten[0]!.name}`);
  }
  for (const i of all) {
    if (i.favorite) score += 0.5;
    if (opts.temperature === 'mild' && i.warmth === 'medium') score += 0.3;
  }

  // Clima e occasione
  if (opts.rain && shoes?.waterproof) reasons.push('Scarpe impermeabili');
  if (opts.layers) reasons.push('A cipolla: base leggera, strato e capospalla');
  else if (opts.temperature === 'cold' && get('outerwear')) reasons.push('Capospalla per il freddo');
  else if (opts.temperature === 'hot') reasons.push('Leggero per il caldo');
  if (opts.occasionId) reasons.push(`Adatto a ${ctx.occasionLabel(opts.occasionId)}`);

  return { score: Math.round(score * 10) / 10, reasons };
}

// ---------- Generazione ----------

export interface Candidate extends Scored {
  look: Look;
}

export type Random = () => number;

/** Numeri casuali ripetibili (per i test). */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENUMERATE_LIMIT = 6000;
const SAMPLES = 3000;

function slotOptions(
  mode: OutfitMode,
  opts: GeneratorOptions,
  ctx: GeneratorContext,
  locks: Locks,
  relaxRecent: boolean,
): Record<GenSlot, (string | null)[]> | null {
  const needs = slotNeeds(mode, opts, ctx);
  const out = {} as Record<GenSlot, (string | null)[]>;
  for (const { slot } of GEN_SLOTS) {
    const need = needs[slot];
    const locked = locks[slot];
    if (need === 'never') {
      if (locked) return null;
      out[slot] = [null];
      continue;
    }
    if (locked !== undefined) {
      if (locked === null && need === 'required') return null;
      out[slot] = [locked];
      continue;
    }
    const ids = ctx.items.filter((i) => i.slotType === slot && !exclusionReason(i, slot, opts, ctx, relaxRecent)).map((i) => i.id);
    if (need === 'required' && !ids.length) return null;
    out[slot] = need === 'optional' ? [null, ...ids] : ids;
  }
  return out;
}

function buildLook(mode: OutfitMode, choice: Record<GenSlot, string | null>): Look {
  const picks: Partial<Record<GenSlot, string>> = {};
  for (const { slot } of GEN_SLOTS) {
    const id = choice[slot];
    if (id) picks[slot] = id;
  }
  return { mode, picks };
}

/** Tutti i look validi (o un campione casuale se le combinazioni sono troppe). */
export function candidates(
  opts: GeneratorOptions,
  ctx: GeneratorContext,
  locks: Locks = {},
  random: Random = Math.random,
  relaxRecent = false,
): Candidate[] {
  const byId = new Map(ctx.items.map((i) => [i.id, i]));
  const found = new Map<string, Candidate>();
  for (const mode of modesFor(opts)) {
    const options = slotOptions(mode, opts, ctx, locks, relaxRecent);
    if (!options) continue;
    const slots = GEN_SLOTS.map((s) => s.slot);
    const total = slots.reduce((n, s) => n * options[s].length, 1);
    const consider = (choice: Record<GenSlot, string | null>) => {
      const look = buildLook(mode, choice);
      const key = `${mode}:${lookItemIds(look).join(',')}`;
      if (found.has(key) || lookViolation(look, byId, opts, ctx, relaxRecent)) return;
      found.set(key, { look, ...scoreLook(look, byId, opts, ctx) });
    };
    if (total <= ENUMERATE_LIMIT) {
      const walk = (i: number, choice: Record<GenSlot, string | null>) => {
        if (i === slots.length) return consider(choice);
        for (const id of options[slots[i]!]) walk(i + 1, { ...choice, [slots[i]!]: id });
      };
      walk(0, {} as Record<GenSlot, string | null>);
    } else {
      for (let n = 0; n < SAMPLES; n++) {
        const choice = {} as Record<GenSlot, string | null>;
        for (const s of slots) choice[s] = options[s][Math.floor(random() * options[s].length)] ?? null;
        consider(choice);
      }
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score);
}

/** Sceglie a caso tra i migliori, così ogni giro è diverso ma sensato. */
export function pickAmongBest<T extends Scored>(list: readonly T[], random: Random = Math.random, avoid?: (c: T) => boolean): T | null {
  if (!list.length) return null;
  const pool0 = avoid ? list.filter((c) => !avoid(c)) : list;
  const pool = pool0.length ? pool0 : list;
  const best = pool[0]!.score;
  const top = pool.filter((c) => c.score >= best - 2).slice(0, 12);
  return top[Math.floor(random() * top.length)] ?? top[0]!;
}

export interface GenerateResult {
  candidate: Candidate | null;
  /** La regola dei capi indossati di recente è stata allentata. */
  relaxed: boolean;
  /** Se non c'è nessun look: cosa manca, in parole semplici. */
  problems: string[];
}

export function generateLook(
  opts: GeneratorOptions,
  ctx: GeneratorContext,
  locks: Locks = {},
  random: Random = Math.random,
  avoid?: Look | null,
): GenerateResult {
  const avoidIds = avoid ? lookItemIds(avoid) : null;
  const notSame = avoidIds ? (c: Candidate) => sameSet(lookItemIds(c.look), avoidIds) : undefined;
  const strict = candidates(opts, ctx, locks, random);
  if (strict.length) return { candidate: pickAmongBest(strict, random, notSame), relaxed: false, problems: [] };
  const relaxed = candidates(opts, ctx, locks, random, true);
  if (relaxed.length) return { candidate: pickAmongBest(relaxed, random, notSame), relaxed: true, problems: [] };
  return { candidate: null, relaxed: false, problems: explainFailure(opts, ctx, locks) };
}

/** Alternative per un rullo: gli altri capi validi in quello slot (e "nessuno" se facoltativo), dal migliore. */
export function slotAlternatives(look: Look, slot: GenSlot, opts: GeneratorOptions, ctx: GeneratorContext): (string | null)[] {
  const byId = new Map(ctx.items.map((i) => [i.id, i]));
  const need = slotNeeds(look.mode, opts, ctx)[slot];
  if (need === 'never') return [];
  const ids = ctx.items.filter((i) => i.slotType === slot && !exclusionReason(i, slot, opts, ctx, true)).map((i) => i.id);
  const current = look.picks[slot];
  if (current && !ids.includes(current)) ids.unshift(current);
  const options: (string | null)[] = need === 'optional' ? [null, ...ids] : ids;
  const scored = options
    .map((id) => {
      const picks = { ...look.picks };
      if (id) picks[slot] = id;
      else delete picks[slot];
      const next: Look = { mode: look.mode, picks };
      const ok = id === current || !lookViolation(next, byId, opts, ctx, true);
      return ok ? { id, score: scoreLook(next, byId, opts, ctx).score } : null;
    })
    .filter((x): x is { id: string | null; score: number } => !!x);
  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? '') : '');
  return scored.sort((a, b) => b.score - a.score || name(a.id).localeCompare(name(b.id), 'it')).map((x) => x.id);
}

/** Freccia del rullo: il capo successivo (o precedente) tra le alternative. */
export function cycle(options: readonly (string | null)[], current: string | null, step: 1 | -1): string | null {
  if (!options.length) return current;
  const i = options.indexOf(current);
  const next = i < 0 ? (step === 1 ? 0 : options.length - 1) : (i + step + options.length) % options.length;
  return options[next] ?? null;
}

export function withPick(look: Look, slot: GenSlot, id: string | null): Look {
  const picks = { ...look.picks };
  if (id) picks[slot] = id;
  else delete picks[slot];
  return { mode: look.mode, picks };
}

// ---------- Spiegazioni ----------

const NOUNS: Record<GenSlot, { none: string; female: boolean }> = {
  top_base: { none: 'Nessun capo sopra', female: false },
  top_layer: { none: 'Nessuno strato (maglione, felpa, cardigan)', female: false },
  bottom: { none: 'Nessun capo sotto', female: false },
  full_body: { none: 'Nessun abito o tuta', female: false },
  outerwear: { none: 'Nessun capospalla', female: false },
  shoes: { none: 'Nessuna scarpa', female: true },
  accessory: { none: 'Nessun accessorio', female: false },
};

function qualifier(reason: ExclusionReason, slot: GenSlot, opts: GeneratorOptions, ctx: GeneratorContext): string {
  const f = NOUNS[slot].female;
  const a = (m: string, w: string) => (f ? w : m);
  switch (reason) {
    case 'unavailable':
      return a('pulito', 'pulita');
    case 'occasion':
      return `per l’occasione “${opts.occasionId ? ctx.occasionLabel(opts.occasionId) : ''}”`;
    case 'temperature':
      return opts.temperature === 'hot'
        ? a('abbastanza leggero per il caldo', 'abbastanza leggera per il caldo')
        : opts.temperature === 'cold'
          ? a('abbastanza caldo per il freddo', 'abbastanza calda per il freddo')
          : a('non pesante, adatto al mite', 'non pesante, adatta al mite');
    case 'season':
      return opts.temperature === 'hot' ? 'di stagione (primavera/estate)' : 'di stagione (autunno/inverno)';
    case 'rain':
      return slot === 'shoes' ? 'impermeabile' : a('adatto alla pioggia (no camoscio, seta, lino)', 'adatta alla pioggia');
    case 'layers':
      return a('leggero da usare come base', 'leggera da usare come base');
    case 'recent':
      return a('non indossato di recente', 'non indossata di recente');
  }
}

const ORDER: readonly ExclusionReason[] = ['unavailable', 'occasion', 'temperature', 'season', 'rain', 'layers', 'recent'];

/** Spiega uno slot vuoto, es. "Nessuna scarpa impermeabile pulita". */
export function explainSlot(slot: GenSlot, opts: GeneratorOptions, ctx: GeneratorContext): string {
  const all = ctx.items.filter((i) => i.slotType === slot);
  const noun = NOUNS[slot];
  if (!all.length) return `${noun.none} nell’armadio: aggiungine uno dall’Armadio.`;
  const reasons = all.map((i) => exclusionReason(i, slot, opts, ctx, true));
  // Il motivo "più specifico": l'ultimo filtro che ha tolto gli ultimi capi rimasti.
  let killer: ExclusionReason = 'unavailable';
  for (const r of ORDER) if (reasons.includes(r)) killer = r;
  const words = [qualifier(killer, slot, opts, ctx)];
  if (killer !== 'unavailable' && opts.onlyAvailable && reasons.includes('unavailable')) words.push(qualifier('unavailable', slot, opts, ctx));
  const hint = killer === 'rain' && slot === 'shoes' ? ' Se ne hai, attiva “Impermeabili” nella loro scheda.' : '';
  return `${noun.none} ${words.join(' ')}.${hint}`;
}

export function explainFailure(opts: GeneratorOptions, ctx: GeneratorContext, locks: Locks = {}): string[] {
  const problems: string[] = [];
  const hasFullBody = ctx.items.some((i) => i.slotType === 'full_body');
  for (const mode of modesFor(opts)) {
    if (mode === 'onePiece' && !hasFullBody) continue;
    const needs = slotNeeds(mode, opts, ctx);
    for (const { slot } of GEN_SLOTS) {
      if (needs[slot] !== 'required' || locks[slot]) continue;
      const any = ctx.items.some((i) => i.slotType === slot && !exclusionReason(i, slot, opts, ctx, true));
      if (!any) {
        const text = explainSlot(slot, opts, ctx);
        if (!problems.includes(text)) problems.push(text);
        break;
      }
    }
  }
  if (problems.length) return problems.slice(0, 2);
  if (opts.harmony !== 'free' && candidates({ ...opts, harmony: 'free' }, ctx, locks, seededRandom(1), true).length) {
    return [`Nessuna combinazione con l’armonia “${HARMONIES.find((h) => h.id === opts.harmony)?.label}”: prova “Libera”.`];
  }
  if (opts.temperature === 'cold') return ['Per il freddo serve uno strato sopra la base leggera, oppure una base più calda.'];
  return ['Nessuna combinazione rispetta tutte le regole: prova a togliere qualche opzione o a sbloccare un capo.'];
}

/** Cambi di opzione che si possono proporre quando non c'è nessun abbinamento. */
export const FIXES: readonly { label: string; applies: (o: GeneratorOptions) => boolean; patch: Partial<GeneratorOptions> }[] = [
  { label: 'Usa anche i capi non disponibili', applies: (o) => o.onlyAvailable, patch: { onlyAvailable: false } },
  { label: 'Senza pioggia', applies: (o) => o.rain, patch: { rain: false } },
  { label: 'Senza “A cipolla”', applies: (o) => o.layers, patch: { layers: false } },
  { label: 'Qualsiasi occasione', applies: (o) => !!o.occasionId, patch: { occasionId: null } },
  { label: 'Colori liberi', applies: (o) => o.harmony !== 'free', patch: { harmony: 'free' } },
  { label: 'Clima mite', applies: (o) => o.temperature !== 'mild', patch: { temperature: 'mild' } },
];

/** Le correzioni che darebbero davvero un abbinamento (al massimo 3). */
export function workingFixes(opts: GeneratorOptions, ctx: GeneratorContext, locks: Locks = {}): typeof FIXES {
  return FIXES.filter((f) => f.applies(opts) && candidates({ ...opts, ...f.patch }, ctx, locks, seededRandom(1), true).length > 0).slice(0, 3);
}

/** Stagione e meteo da salvare con l'outfit creato qui. */
export function outfitTagsFor(opts: GeneratorOptions): { season: Season | null; weatherTags: string[] } {
  const season: Season | null = opts.temperature === 'hot' ? 'springSummer' : opts.temperature === 'cold' ? 'autumnWinter' : null;
  return { season, weatherTags: [opts.temperature, ...(opts.rain ? ['rain'] : [])] };
}
