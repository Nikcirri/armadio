import type {
  CategoryRecord,
  ColorId,
  DiaryRecord,
  EndOfDayPending,
  ItemRecord,
  ListRecord,
  OutfitLayoutEntry,
  OutfitRecord,
  PlannerRecord,
  Season,
  SlotType,
  TripRecord,
  WearLogRecord,
  WishlistRecord,
} from '../db/types';
import { needsWash, normalize } from './items';
import { daysBetween, fromDateKey } from './util';

// Outfit (SPEC.md, sezione 8.2): struttura, semaforo, collage, filtri, Fine giornata, diario.

// ---------- Struttura: Spezzato / Intero ----------

export type OutfitMode = 'separates' | 'onePiece';

export interface SlotRule {
  slot: SlotType;
  label: string;
  /** Si possono scegliere più capi (capospalla, scarpe, accessori). */
  multiple: boolean;
  optional: boolean;
}

const EXTRA_SLOTS: SlotRule[] = [
  { slot: 'outerwear', label: 'Capospalla', multiple: true, optional: true },
  { slot: 'shoes', label: 'Scarpe', multiple: true, optional: true },
  { slot: 'accessory', label: 'Accessori', multiple: true, optional: true },
];

export const MODE_SLOTS: Record<OutfitMode, readonly SlotRule[]> = {
  separates: [
    { slot: 'top_base', label: 'Sopra', multiple: false, optional: false },
    { slot: 'top_layer', label: 'Strato', multiple: false, optional: true },
    { slot: 'bottom', label: 'Sotto', multiple: false, optional: false },
    ...EXTRA_SLOTS,
  ],
  onePiece: [
    { slot: 'full_body', label: 'Intero (abito, tuta)', multiple: false, optional: false },
    { slot: 'top_layer', label: 'Strato', multiple: false, optional: true },
    ...EXTRA_SLOTS,
  ],
};

export const MODES: readonly { id: OutfitMode; label: string }[] = [
  { id: 'separates', label: 'Spezzato' },
  { id: 'onePiece', label: 'Intero' },
];

/** Un pezzo dell'outfit: un capo dell'armadio o un desiderio della wishlist. */
export interface Piece {
  id: string;
  name: string;
  slotType: SlotType;
  photoId: string | undefined;
  colors: ColorId[];
  source: 'item' | 'wishlist';
}

export type Picks = Partial<Record<SlotType, string[]>>;

export function pieceFromItem(item: ItemRecord): Piece {
  return { id: item.id, name: item.name, slotType: item.slotType, photoId: item.photoIds[0], colors: item.colors, source: 'item' };
}

/** Slot di un desiderio della wishlist: quello della sua categoria (accessori se non ne ha). */
export function wishlistSlot(w: Pick<WishlistRecord, 'categoryId'>, categories: readonly CategoryRecord[]): SlotType {
  return categories.find((c) => c.id === w.categoryId)?.slotType ?? 'accessory';
}

export function pieceFromWishlist(w: WishlistRecord, categories: readonly CategoryRecord[]): Piece {
  return { id: w.id, name: w.name, slotType: wishlistSlot(w, categories), photoId: w.photoIds[0], colors: w.colors, source: 'wishlist' };
}

/** Pezzi di un outfit, nell'ordine: prima i capi, poi i desideri. Gli id che non esistono più vengono saltati. */
export function outfitPieces(
  outfit: Pick<OutfitRecord, 'itemIds' | 'wishlistIds'>,
  itemsById: ReadonlyMap<string, ItemRecord>,
  wishlistById: ReadonlyMap<string, WishlistRecord>,
  categories: readonly CategoryRecord[],
): Piece[] {
  const pieces: Piece[] = [];
  for (const id of outfit.itemIds) {
    const item = itemsById.get(id);
    if (item) pieces.push(pieceFromItem(item));
  }
  for (const id of outfit.wishlistIds) {
    const w = wishlistById.get(id);
    if (w) pieces.push(pieceFromWishlist(w, categories));
  }
  return pieces;
}

export function modeOf(slots: readonly SlotType[]): OutfitMode {
  return slots.includes('full_body') ? 'onePiece' : 'separates';
}

/** Divide i pezzi per slot (tiene tutto, anche più capi in uno slot "singolo"). */
export function picksFromPieces(pieces: readonly Pick<Piece, 'id' | 'slotType'>[]): Picks {
  const picks: Picks = {};
  for (const p of pieces) (picks[p.slotType] ??= []).push(p.id);
  return picks;
}

/** Tocco su un capo nel selettore: negli slot multipli aggiunge o toglie, negli altri sostituisce. */
export function togglePick(picks: Picks, rule: Pick<SlotRule, 'slot' | 'multiple'>, id: string): Picks {
  const current = picks[rule.slot] ?? [];
  let next: string[];
  if (current.includes(id)) next = current.filter((x) => x !== id);
  else next = rule.multiple ? [...current, id] : [id];
  return { ...picks, [rule.slot]: next };
}

/** Id scelti negli slot della modalità (gli slot dell'altra modalità restano da parte, non si salvano). */
export function pickedIds(picks: Picks, mode: OutfitMode): string[] {
  const ids: string[] = [];
  for (const rule of MODE_SLOTS[mode]) for (const id of picks[rule.slot] ?? []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** Slot obbligatori ancora vuoti (es. "Sotto"): solo un suggerimento, non blocca il salvataggio. */
export function missingSlots(picks: Picks, mode: OutfitMode): string[] {
  return MODE_SLOTS[mode].filter((r) => !r.optional && !(picks[r.slot]?.length)).map((r) => r.label);
}

/** "Outfit N" con il primo numero libero. */
export function defaultOutfitName(existing: readonly string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  let n = existing.length + 1;
  while (taken.has(`outfit ${n}`)) n += 1;
  return `Outfit ${n}`;
}

// ---------- Semaforo ----------

export interface Blocker {
  id: string;
  name: string;
  reason: string;
}

/** Perché un capo non si può indossare adesso (null se è disponibile). */
export function blockReason(item: ItemRecord, seasonBoxId: string | null): string | null {
  switch (item.status) {
    case 'clean':
      return seasonBoxId && item.locationId === seasonBoxId ? 'nella scatola cambio stagione' : null;
    case 'toWash':
      return item.hasStain ? 'da lavare (con macchia)' : 'da lavare';
    case 'drying':
      return 'steso ad asciugare';
    case 'toIron':
      return 'da stirare';
    case 'packed':
      return 'in valigia';
    case 'onLoan':
      return item.loanTo.trim() ? `in prestito a ${item.loanTo.trim()}` : 'in prestito';
    case 'maintenance':
      return 'in manutenzione';
    case 'forSale':
      return 'da vendere';
  }
}

export interface Semaphore {
  /** Verde: tutti i capi sono disponibili. */
  ok: boolean;
  blockers: Blocker[];
}

export function semaphore(
  pieces: readonly Piece[],
  itemsById: ReadonlyMap<string, ItemRecord>,
  seasonBoxId: string | null,
): Semaphore {
  const blockers: Blocker[] = [];
  for (const p of pieces) {
    if (p.source === 'wishlist') {
      blockers.push({ id: p.id, name: p.name, reason: 'da comprare (wishlist)' });
      continue;
    }
    const item = itemsById.get(p.id);
    const reason = item ? blockReason(item, seasonBoxId) : null;
    if (reason) blockers.push({ id: p.id, name: p.name, reason });
  }
  return { ok: blockers.length === 0, blockers };
}

// ---------- Collage ----------

/** Il collage è un riquadro 3:4. x e y sono il centro del pezzo (0-1), scale è la larghezza (0-1). */
export const COLLAGE_RATIO = 3 / 4;
export const MIN_SCALE = 0.08;
export const MAX_SCALE = 0.9;

const SLOT_Z: Record<SlotType, number> = {
  outerwear: 0,
  bottom: 1,
  top_layer: 2,
  full_body: 2,
  top_base: 3,
  shoes: 4,
  accessory: 5,
};

const round = (v: number) => Math.round(v * 1000) / 1000;

function row(
  ids: readonly string[],
  y: number,
  scale: number,
  cx: number,
  span: number,
  zBase: (i: number) => number,
): OutfitLayoutEntry[] {
  const n = ids.length;
  if (!n) return [];
  const spacing = n === 1 ? 0 : Math.min(scale * 0.72, span / (n - 1));
  return ids.map((itemId, i) => ({
    itemId,
    x: round(cx + (i - (n - 1) / 2) * spacing),
    y: round(y),
    scale: round(scale),
    z: zBase(i),
  }));
}

/**
 * Disposizione automatica (SPEC 8.2): capospalla e sopra in alto, sotto al centro,
 * scarpe in basso, accessori di lato.
 */
export function autoLayout(pieces: readonly Pick<Piece, 'id' | 'slotType'>[]): OutfitLayoutEntry[] {
  const of = (slot: SlotType) => pieces.filter((p) => p.slotType === slot).map((p) => p.id);
  const accessories = of('accessory');
  const cx = accessories.length ? 0.4 : 0.5;
  const span = accessories.length ? 0.4 : 0.52;
  const full = of('full_body');
  const upper = [...of('outerwear'), ...of('top_layer'), ...of('top_base')];
  const bottoms = of('bottom');
  const shoes = of('shoes');
  const slotOf = new Map(pieces.map((p) => [p.id, p.slotType]));
  const z = (id: string, i: number) => SLOT_Z[slotOf.get(id) ?? 'accessory'] * 10 + i;

  const out: OutfitLayoutEntry[] = [];
  const push = (entries: OutfitLayoutEntry[]) => out.push(...entries.map((e, i) => ({ ...e, z: z(e.itemId, i) })));
  const sizeFor = (n: number, one: number, two: number, many: number) => (n <= 1 ? one : n === 2 ? two : many);

  if (full.length) {
    push(row(full, 0.42, sizeFor(full.length, 0.5, 0.42, 0.34), cx, span, () => 0));
    push(row(upper, 0.3, sizeFor(upper.length, 0.42, 0.38, 0.32), cx, span + 0.1, () => 0));
    push(row(bottoms, 0.64, 0.34, cx, span, () => 0));
  } else {
    push(row(upper, 0.24, sizeFor(upper.length, 0.48, 0.42, 0.36), cx, span, () => 0));
    push(row(bottoms, 0.58, sizeFor(bottoms.length, 0.42, 0.36, 0.3), cx, span, () => 0));
  }
  push(row(shoes, 0.87, sizeFor(shoes.length, 0.28, 0.24, 0.2), cx, span, () => 0));
  const n = accessories.length;
  accessories.forEach((itemId, i) => {
    out.push({
      itemId,
      x: 0.84,
      y: round(n === 1 ? 0.5 : 0.14 + (i * 0.72) / (n - 1)),
      scale: n > 4 ? 0.16 : 0.2,
      z: z(itemId, i),
    });
  });
  return out.map(clampEntry);
}

export function clampEntry(e: OutfitLayoutEntry): OutfitLayoutEntry {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { ...e, x: clamp(e.x, 0, 1), y: clamp(e.y, 0, 1), scale: clamp(e.scale, MIN_SCALE, MAX_SCALE) };
}

/** Tiene le posizioni salvate dei pezzi presenti; i pezzi nuovi prendono quella automatica. */
export function mergeLayout(
  saved: readonly OutfitLayoutEntry[],
  pieces: readonly Pick<Piece, 'id' | 'slotType'>[],
): OutfitLayoutEntry[] {
  const byId = new Map(saved.map((e) => [e.itemId, e]));
  if (pieces.every((p) => byId.has(p.id))) return pieces.map((p) => byId.get(p.id)!);
  const auto = new Map(autoLayout(pieces).map((e) => [e.itemId, e]));
  const top = saved.reduce((m, e) => Math.max(m, e.z), 0);
  let extra = 0;
  return pieces.map((p) => byId.get(p.id) ?? { ...auto.get(p.id)!, z: top + 1 + extra++ });
}

/** Pezzo toccato: va davanti a tutti. */
export function bringToFront(layout: readonly OutfitLayoutEntry[], itemId: string): OutfitLayoutEntry[] {
  const top = layout.reduce((m, e) => Math.max(m, e.z), 0);
  const current = layout.find((e) => e.itemId === itemId);
  if (!current || (current.z === top && layout.filter((e) => e.z === top).length === 1)) return [...layout];
  return layout.map((e) => (e.itemId === itemId ? { ...e, z: top + 1 } : e));
}

export function moveEntry(layout: readonly OutfitLayoutEntry[], itemId: string, x: number, y: number): OutfitLayoutEntry[] {
  return layout.map((e) => (e.itemId === itemId ? clampEntry({ ...e, x: round(x), y: round(y) }) : e));
}

export function scaleEntry(layout: readonly OutfitLayoutEntry[], itemId: string, scale: number): OutfitLayoutEntry[] {
  return layout.map((e) => (e.itemId === itemId ? clampEntry({ ...e, scale: round(scale) }) : e));
}

/** Ordine di disegno: dal più indietro al più avanti. */
export function drawOrder(layout: readonly OutfitLayoutEntry[]): OutfitLayoutEntry[] {
  return [...layout].sort((a, b) => a.z - b.z);
}

// ---------- Palette e avvisi ----------

/** Colori dell'outfit, dal più presente (al massimo 8). */
export function outfitPalette(pieces: readonly Pick<Piece, 'colors'>[]): ColorId[] {
  const count = new Map<ColorId, number>();
  const first = new Map<ColorId, number>();
  let order = 0;
  for (const p of pieces) {
    p.colors.forEach((c, i) => {
      count.set(c, (count.get(c) ?? 0) + (i === 0 ? 2 : 1));
      if (!first.has(c)) first.set(c, order++);
    });
  }
  return [...count.keys()]
    .sort((a, b) => count.get(b)! - count.get(a)! || first.get(a)! - first.get(b)!)
    .slice(0, 8);
}

export interface OutfitWarning {
  kind: 'intimate' | 'fit';
  text: string;
}

/** Avvisi dalle note di intimo e vestibilità dei capi (es. "Abito rosso: reggiseno senza spalline"). */
export function outfitWarnings(items: readonly Pick<ItemRecord, 'name' | 'intimateNote' | 'fitNote'>[]): OutfitWarning[] {
  const out: OutfitWarning[] = [];
  for (const it of items) {
    const intimate = it.intimateNote.trim();
    if (intimate) out.push({ kind: 'intimate', text: `${it.name}: ${intimate}` });
  }
  for (const it of items) {
    const fit = it.fitNote.trim();
    if (fit && normalize(fit) !== 'perfetto') out.push({ kind: 'fit', text: `${it.name}: ${fit}` });
  }
  return out;
}

// ---------- Storico degli outfit ----------

export interface OutfitWearInfo {
  count: number;
  last: string | null;
}

export function outfitWearStats(log: readonly Pick<WearLogRecord, 'outfitId' | 'date'>[]): Map<string, OutfitWearInfo> {
  const stats = new Map<string, OutfitWearInfo>();
  for (const e of log) {
    if (!e.outfitId) continue;
    const s = stats.get(e.outfitId) ?? { count: 0, last: null };
    s.count += 1;
    if (!s.last || e.date > s.last) s.last = e.date;
    stats.set(e.outfitId, s);
  }
  return stats;
}

export function describeWears(info: OutfitWearInfo | undefined, formatDate: (d: string) => string): string {
  if (!info || info.count === 0) return 'Mai indossato';
  const times = info.count === 1 ? '1 volta' : `${info.count} volte`;
  return info.last ? `Indossato ${times} · ${formatDate(info.last)}` : `Indossato ${times}`;
}

// ---------- Filtri della libreria ----------

export type WeatherTag = 'hot' | 'mild' | 'cold' | 'rain';

export const WEATHER_TAGS: readonly { id: WeatherTag; label: string; emoji: string }[] = [
  { id: 'hot', label: 'Caldo', emoji: '☀️' },
  { id: 'mild', label: 'Mite', emoji: '⛅' },
  { id: 'cold', label: 'Freddo', emoji: '❄️' },
  { id: 'rain', label: 'Pioggia', emoji: '🌧️' },
];

export interface OutfitFilters {
  query: string;
  occasionIds: string[];
  seasons: Season[];
  weather: WeatherTag[];
  favorites: boolean;
  neverWorn: boolean;
  /** Non indossati da 30 giorni o più (compresi i mai indossati). */
  notWornRecently: boolean;
  incomplete: boolean;
  /** "Mai indossato con…": nome della persona. */
  neverWith: string | null;
}

export function emptyOutfitFilters(): OutfitFilters {
  return {
    query: '',
    occasionIds: [],
    seasons: [],
    weather: [],
    favorites: false,
    neverWorn: false,
    notWornRecently: false,
    incomplete: false,
    neverWith: null,
  };
}

export function activeOutfitFilterCount(f: OutfitFilters): number {
  return (
    (f.occasionIds.length ? 1 : 0) +
    (f.seasons.length ? 1 : 0) +
    (f.weather.length ? 1 : 0) +
    (f.favorites ? 1 : 0) +
    (f.neverWorn ? 1 : 0) +
    (f.notWornRecently ? 1 : 0) +
    (f.incomplete ? 1 : 0) +
    (f.neverWith ? 1 : 0)
  );
}

export const RECENT_DAYS = 30;

const samePerson = (a: string, b: string) => normalize(a) === normalize(b);

/** Outfit indossati in compagnia di questa persona (dalle voci del diario). */
export function outfitsWornWith(person: string, diary: readonly Pick<DiaryRecord, 'outfitId' | 'people'>[]): Set<string> {
  const ids = new Set<string>();
  for (const d of diary) {
    if (d.outfitId && d.people.some((p) => samePerson(p, person))) ids.add(d.outfitId);
  }
  return ids;
}

export function filterOutfits(
  outfits: readonly OutfitRecord[],
  f: OutfitFilters,
  ctx: { stats: ReadonlyMap<string, OutfitWearInfo>; diary: readonly Pick<DiaryRecord, 'outfitId' | 'people'>[]; today: string },
): OutfitRecord[] {
  const q = normalize(f.query.trim());
  const wornWith = f.neverWith ? outfitsWornWith(f.neverWith, ctx.diary) : null;
  return outfits.filter((o) => {
    const info = ctx.stats.get(o.id);
    if (q && !normalize(`${o.name} ${o.notes}`).includes(q)) return false;
    if (f.occasionIds.length && !o.occasions.some((id) => f.occasionIds.includes(id))) return false;
    if (f.seasons.length && o.season && o.season !== 'allSeasons' && !f.seasons.includes(o.season)) return false;
    if (f.weather.length && !o.weatherTags.some((t) => (f.weather as string[]).includes(t))) return false;
    if (f.favorites && !o.favorite) return false;
    if (f.neverWorn && info?.count) return false;
    if (f.notWornRecently && info?.last && daysBetween(info.last, ctx.today) < RECENT_DAYS) return false;
    if (f.incomplete && !o.incomplete) return false;
    if (wornWith?.has(o.id)) return false;
    return true;
  });
}

export type OutfitSort = 'recent' | 'mostWorn' | 'longestUnworn' | 'name';

export const OUTFIT_SORTS: readonly { id: OutfitSort; label: string }[] = [
  { id: 'recent', label: 'Più recenti' },
  { id: 'mostWorn', label: 'Più indossati' },
  { id: 'longestUnworn', label: 'Non indossati da più tempo' },
  { id: 'name', label: 'Nome A-Z' },
];

export function sortOutfits(
  outfits: readonly OutfitRecord[],
  sort: OutfitSort,
  stats: ReadonlyMap<string, OutfitWearInfo>,
): OutfitRecord[] {
  const list = [...outfits];
  const byName = (a: OutfitRecord, b: OutfitRecord) => a.name.localeCompare(b.name, 'it');
  switch (sort) {
    case 'recent':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
    case 'mostWorn':
      return list.sort((a, b) => (stats.get(b.id)?.count ?? 0) - (stats.get(a.id)?.count ?? 0) || byName(a, b));
    case 'longestUnworn':
      return list.sort((a, b) => (stats.get(a.id)?.last ?? '').localeCompare(stats.get(b.id)?.last ?? '') || byName(a, b));
    case 'name':
      return list.sort(byName);
  }
}

// ---------- Persone (diario) ----------

/** Nomi già usati nel diario e nella lista "Persone", dal più frequente, senza doppioni (maiuscole e accenti ignorati). */
export function knownPeople(
  diary: readonly Pick<DiaryRecord, 'people'>[],
  lists: readonly Pick<ListRecord, 'kind' | 'name'>[] = [],
): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  const add = (name: string, weight: number) => {
    const clean = name.trim();
    if (!clean) return;
    const key = normalize(clean);
    const cur = counts.get(key);
    if (cur) cur.n += weight;
    else counts.set(key, { name: clean, n: weight });
  };
  for (const d of diary) for (const p of d.people) add(p, 1);
  for (const l of lists) if (l.kind === 'person') add(l.name, 0);
  return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'it')).map((x) => x.name);
}

/** Suggerimenti mentre si scrive un nome: prima chi inizia così, poi chi lo contiene. */
export function suggestPeople(known: readonly string[], typed: string, chosen: readonly string[], max = 6): string[] {
  const q = normalize(typed.trim());
  const free = known.filter((n) => !chosen.some((c) => samePerson(c, n)));
  if (!q) return free.slice(0, max);
  const starts = free.filter((n) => normalize(n).startsWith(q));
  const contains = free.filter((n) => !normalize(n).startsWith(q) && normalize(n).includes(q));
  return [...starts, ...contains].slice(0, max);
}

/** Aggiunge un nome alla lista delle persone, se non c'è già. */
export function addPerson(chosen: readonly string[], name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || chosen.some((c) => samePerson(c, clean))) return [...chosen];
  return [...chosen, clean];
}

// ---------- Fine giornata ----------

/** Aggiunge i capi indossati a quelli che aspettano "Fine giornata". */
export function addToEndOfDay(pending: EndOfDayPending | null, date: string, itemIds: readonly string[]): EndOfDayPending {
  const ids = [...(pending?.itemIds ?? [])];
  for (const id of itemIds) if (!ids.includes(id)) ids.push(id);
  return { date: pending && pending.date > date ? pending.date : date, itemIds: ids };
}

export interface EndOfDayChoice {
  item: ItemRecord;
  /** Arrivato (o oltre) al numero di utilizzi prima del lavaggio. */
  reachedLimit: boolean;
}

/**
 * Capi da decidere a fine giornata: solo quelli puliti che si lavano a utilizzi
 * (scarpe e accessori no). I capi arrivati alla soglia partono già "Da lavare".
 */
export function endOfDayChoices(pending: EndOfDayPending | null, itemsById: ReadonlyMap<string, ItemRecord>): EndOfDayChoice[] {
  if (!pending) return [];
  const out: EndOfDayChoice[] = [];
  for (const id of pending.itemIds) {
    const item = itemsById.get(id);
    if (!item || item.status !== 'clean' || item.maxWearsBeforeWash === null) continue;
    out.push({ item, reachedLimit: needsWash(item) });
  }
  return out;
}

/** Quando suonare il promemoria serale: oggi all'orario scelto, solo se non è già passato. */
export function reminderTime(date: string, time: string, now: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const at = fromDateKey(date);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return at.getTime() > now.getTime() ? at : null;
}

// ---------- Eliminare un outfit ----------

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...a, ...b.filter((id) => !a.includes(id))];
}

export function detachOutfitFromTrip(trip: TripRecord, outfitId: string, now: string): TripRecord | null {
  if (!trip.outfitIds.includes(outfitId)) return null;
  return { ...trip, outfitIds: trip.outfitIds.filter((id) => id !== outfitId), updatedAt: now };
}

/** Il giorno dell'agenda resta pianificato con i capi dell'outfit. */
export function detachOutfitFromPlanner(day: PlannerRecord, outfit: Pick<OutfitRecord, 'id' | 'itemIds'>, now: string): PlannerRecord | null {
  if (day.outfitId !== outfit.id) return null;
  return { ...day, outfitId: null, itemIds: union(day.itemIds, outfit.itemIds), updatedAt: now };
}

/** Il ricordo resta, con i capi che avevi addosso. */
export function detachOutfitFromDiary(entry: DiaryRecord, outfit: Pick<OutfitRecord, 'id' | 'itemIds'>, now: string): DiaryRecord | null {
  if (entry.outfitId !== outfit.id) return null;
  return { ...entry, outfitId: null, itemIds: union(entry.itemIds, outfit.itemIds), updatedAt: now };
}

// ---------- Diario ----------

const MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ''} ${y}`;
}

export function weekdayShort(date: string): string {
  return WEEKDAYS[fromDateKey(date).getDay()] ?? '';
}

export interface DiaryMonth {
  key: string;
  label: string;
  entries: DiaryRecord[];
}

/** Timeline del diario: mesi dal più recente, voci dalla più recente. */
export function groupDiaryByMonth(entries: readonly DiaryRecord[]): DiaryMonth[] {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const months: DiaryMonth[] = [];
  for (const e of sorted) {
    const key = e.date.slice(0, 7);
    let month = months[months.length - 1];
    if (!month || month.key !== key) {
      month = { key, label: monthLabel(key), entries: [] };
      months.push(month);
    }
    month.entries.push(e);
  }
  return months;
}

/** Pezzi da mostrare per un ricordo: quelli dell'outfit, oppure i capi scelti. */
export function diaryPieceIds(entry: Pick<DiaryRecord, 'outfitId' | 'itemIds'>, outfitsById: ReadonlyMap<string, OutfitRecord>): string[] {
  const outfit = entry.outfitId ? outfitsById.get(entry.outfitId) : undefined;
  return outfit ? union(outfit.itemIds, entry.itemIds) : [...entry.itemIds];
}
