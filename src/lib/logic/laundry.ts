import type { ColorId, ItemRecord, Season } from '../db/types';
import { needsWash } from './items';

// Lavanderia (SPEC.md, sezione 5): programmi, gruppi di colore, carichi suggeriti.

export type Program = 'hand' | 'delicate' | 'wash30' | 'wash40' | 'dryClean';

export const PROGRAMS: readonly { id: Program; label: string; machine: boolean }[] = [
  { id: 'hand', label: 'A mano', machine: false },
  { id: 'delicate', label: 'Delicati', machine: true },
  { id: 'wash30', label: '30°', machine: true },
  { id: 'wash40', label: '40°', machine: true },
  { id: 'dryClean', label: 'A secco (tintoria)', machine: false },
];

/** Programma più delicato tra quelli indicati dalle etichette. Senza etichette: 30°, il più sicuro. */
export function programOf(item: Pick<ItemRecord, 'washTags'>): Program {
  const t = item.washTags;
  if (t.includes('dryClean')) return 'dryClean';
  if (t.includes('handWash')) return 'hand';
  if (t.includes('delicate') || t.includes('noSpin')) return 'delicate';
  if (t.includes('max30')) return 'wash30';
  if (t.includes('max40')) return 'wash40';
  return 'wash30';
}

export type ColorGroup = 'light' | 'colored' | 'dark';

export const COLOR_GROUPS: readonly { id: ColorGroup; label: string }[] = [
  { id: 'light', label: 'Chiari' },
  { id: 'colored', label: 'Colorati' },
  { id: 'dark', label: 'Scuri' },
];

const LIGHT: ColorId[] = ['white', 'cream'];
const DARK: ColorId[] = ['black', 'charcoal', 'navy', 'brown', 'chocolate', 'denim', 'grey', 'burgundy', 'forest', 'teal', 'plum'];
/** Colori che possono stingere sui bianchi. */
const BLEEDING: ColorId[] = [
  'red',
  'burgundy',
  'fuchsia',
  'rust',
  'black',
  'charcoal',
  'navy',
  'blue',
  'denim',
  'brown',
  'chocolate',
  'forest',
  'teal',
  'plum',
];

export function colorGroupOf(item: Pick<ItemRecord, 'colors'>): ColorGroup {
  const main = item.colors[0];
  if (main && LIGHT.includes(main)) return 'light';
  if (main && DARK.includes(main)) return 'dark';
  return 'colored';
}

/** Rischio che un capo scuro o rosso stinga su un capo bianco o chiaro. */
export function hasBleedRisk(items: readonly Pick<ItemRecord, 'colors'>[]): boolean {
  const light = items.some((i) => colorGroupOf(i) === 'light');
  const bleeding = items.some((i) => (i.colors[0] ? BLEEDING.includes(i.colors[0]) : false));
  return light && bleeding;
}

export interface Load {
  key: string;
  program: Program;
  /** null = un solo carico per questo programma, senza dividere i colori. */
  colorGroup: ColorGroup | null;
  items: ItemRecord[];
  /** Nel carico ci sono bianchi insieme a capi scuri o rossi. */
  warning: boolean;
  /** Il programma è stato diviso per colore per evitare che i colori stingano. */
  split: boolean;
  /** Programmi dei capi nel carico: più di uno quando si lava tutto insieme. */
  programs: Program[];
}

export interface LoadOptions {
  /** "Lava tutto insieme": tutti i capi da lavatrice in un solo lavaggio, con il programma più delicato. */
  together?: boolean;
  /** Con `together`: dividi comunque chiari e scuri (stesso programma, due lavatrici). */
  splitColors?: boolean;
}

const isMachine = (p: Program) => PROGRAMS.find((x) => x.id === p)?.machine ?? false;
const programRank = (p: Program) => PROGRAMS.findIndex((x) => x.id === p);

/** Il programma più delicato tra quelli indicati (PROGRAMS è ordinato dal più delicato). */
export function gentlestProgram(programs: readonly Program[]): Program | null {
  return [...programs].sort((a, b) => programRank(a) - programRank(b))[0] ?? null;
}

function byColor(key: string, program: Program, items: ItemRecord[], programs: Program[]): Load[] {
  const loads: Load[] = [];
  for (const g of COLOR_GROUPS) {
    const part = items.filter((i) => colorGroupOf(i) === g.id);
    if (part.length) loads.push({ key: `${key}-${g.id}`, program, colorGroup: g.id, items: part, warning: false, split: true, programs });
  }
  return loads;
}

/**
 * Carichi suggeriti: uno per programma; se nello stesso programma da lavatrice ci sono bianchi
 * e capi scuri o rossi, si divide per colore (Chiari / Colorati / Scuri).
 * Con `together` tutti i capi da lavatrice vanno in un solo carico con il programma più
 * delicato tra quelli presenti (con l'avviso se mescola bianchi e scuri, oppure diviso per
 * colore con `splitColors`). A mano e a secco restano sempre a parte.
 */
export function buildLoads(items: readonly ItemRecord[], options: LoadOptions = {}): Load[] {
  const groups = PROGRAMS.map((p) => ({ program: p, items: items.filter((i) => programOf(i) === p.id) })).filter(
    (g) => g.items.length,
  );
  const machineGroups = groups.filter((g) => g.program.machine);
  const loads: Load[] = [];
  let machineDone = false;
  for (const g of groups) {
    const p = g.program;
    if (p.machine && options.together) {
      if (machineDone) continue;
      machineDone = true;
      const all = machineGroups.flatMap((m) => m.items);
      const programs = machineGroups.map((m) => m.program.id);
      const program = gentlestProgram(programs) ?? p.id;
      const risk = hasBleedRisk(all);
      if (risk && options.splitColors) loads.push(...byColor('machine', program, all, programs));
      else loads.push({ key: 'machine', program, colorGroup: null, items: all, warning: risk, split: false, programs });
      continue;
    }
    const risk = hasBleedRisk(g.items);
    if (risk && p.machine) loads.push(...byColor(p.id, p.id, g.items, [p.id]));
    else loads.push({ key: p.id, program: p.id, colorGroup: null, items: g.items, warning: risk, split: false, programs: [p.id] });
  }
  return loads;
}

/** Quante lavatrici (carichi da lavatrice) ci sono: con 2 o più si può lavare tutto insieme. */
export function machineLoadCount(loads: readonly Pick<Load, 'program'>[]): number {
  return loads.filter((l) => isMachine(l.program)).length;
}

export function programLabel(p: Program): string {
  return PROGRAMS.find((x) => x.id === p)?.label ?? '';
}

export function loadTitle(load: Pick<Load, 'program' | 'colorGroup' | 'programs'>): string {
  const p = programLabel(load.program);
  const g = load.colorGroup ? COLOR_GROUPS.find((x) => x.id === load.colorGroup)?.label : null;
  if (g) return `${p} · ${g}`;
  return load.programs.length > 1 ? `${p} · Tutto insieme` : p;
}

export interface LaundryOverview {
  stains: ItemRecord[];
  toWash: ItemRecord[];
  drying: ItemRecord[];
  toIron: ItemRecord[];
  maintenance: ItemRecord[];
  /** Puliti ma arrivati alla soglia di utilizzi: andrebbero lavati. */
  dueSoon: ItemRecord[];
}

export function laundryOverview(items: readonly ItemRecord[]): LaundryOverview {
  const byName = (a: ItemRecord, b: ItemRecord) => a.name.localeCompare(b.name, 'it');
  const pick = (f: (i: ItemRecord) => boolean) => items.filter(f).sort(byName);
  return {
    stains: pick((i) => i.status === 'toWash' && i.hasStain),
    toWash: pick((i) => i.status === 'toWash'),
    drying: pick((i) => i.status === 'drying'),
    toIron: pick((i) => i.status === 'toIron'),
    maintenance: pick((i) => i.status === 'maintenance'),
    dueSoon: pick((i) => i.status === 'clean' && needsWash(i)),
  };
}

// ---------- Cambio stagione (SPEC.md, sezione 8.1) ----------

/** Stagione opposta a quella da riporre (per suggerire cosa tirare fuori). */
export function otherSeason(season: Exclude<Season, 'allSeasons'>): Exclude<Season, 'allSeasons'> {
  return season === 'springSummer' ? 'autumnWinter' : 'springSummer';
}

/** Stagione da riporre suggerita in base al mese: da aprile a settembre si ripone l'inverno. */
export function suggestedSeasonToStore(month: number): Exclude<Season, 'allSeasons'> {
  return month >= 3 && month <= 8 ? 'autumnWinter' : 'springSummer';
}

export interface StoreCandidates {
  /** Capi da riporre (della stagione scelta, non già nella scatola). */
  movable: ItemRecord[];
  /** Della stagione scelta ma non riponibili ora (in valigia, in prestito, da lavare…). */
  skipped: ItemRecord[];
}

const NOT_STORABLE: ItemRecord['status'][] = ['packed', 'onLoan', 'toWash', 'drying', 'toIron', 'maintenance'];

export function storeCandidates(items: readonly ItemRecord[], season: Exclude<Season, 'allSeasons'>, seasonBoxId: string): StoreCandidates {
  const ofSeason = items.filter((i) => i.season === season && i.locationId !== seasonBoxId && i.status !== 'forSale');
  return {
    movable: ofSeason.filter((i) => !NOT_STORABLE.includes(i.status)),
    skipped: ofSeason.filter((i) => NOT_STORABLE.includes(i.status)),
  };
}

/** Capi nella scatola da tirare fuori; con `season` solo quelli di quella stagione. */
export function returnCandidates(items: readonly ItemRecord[], seasonBoxId: string, season: Season | null): ItemRecord[] {
  return items.filter((i) => i.locationId === seasonBoxId && (season === null || i.season === season));
}
