import type {
  CategoryRecord,
  EssentialTemplateEntry,
  ListKind,
  ListRecord,
  Preset,
  SettingsMap,
  SlotType,
} from '../db/types';
import { slotInfo } from './slots';
import { newId, nowIso } from './util';

export const PRESETS: readonly { id: Preset; label: string; description: string }[] = [
  { id: 'donna', label: 'Donna', description: 'Abiti, gonne, tacchi, gioielli e intimo (reggiseni, slip, calze).' },
  { id: 'uomo', label: 'Uomo', description: 'Camicie, polo, completi, cravatte, mocassini e intimo.' },
  { id: 'neutro', label: 'Neutro', description: 'Categorie essenziali, adatte a tutti.' },
];

type CategorySeed = [name: string, slot: SlotType, icon: string];

const COMMON: CategorySeed[] = [
  ['T-shirt', 'top_base', '👕'],
  ['Camicie', 'top_base', '👔'],
  ['Maglioni', 'top_layer', '🧶'],
  ['Felpe', 'top_layer', '🧥'],
  ['Cardigan e gilet', 'top_layer', '🧶'],
  ['Pantaloni', 'bottom', '👖'],
  ['Jeans', 'bottom', '👖'],
  ['Shorts', 'bottom', '🩳'],
  ['Giacche', 'outerwear', '🧥'],
  ['Cappotti e piumini', 'outerwear', '🧥'],
  ['Blazer', 'outerwear', '🧥'],
  ['Sneakers', 'shoes', '👟'],
  ['Stivali', 'shoes', '🥾'],
  ['Sandali', 'shoes', '🩴'],
  ['Borse e zaini', 'accessory', '👜'],
  ['Cinture', 'accessory', '➰'],
  ['Sciarpe', 'accessory', '🧣'],
  ['Cappelli', 'accessory', '🧢'],
  ['Occhiali', 'accessory', '🕶️'],
];

const EXTRA: Record<Preset, CategorySeed[]> = {
  donna: [
    ['Top e body', 'top_base', '👚'],
    ['Gonne', 'bottom', '👗'],
    ['Abiti', 'full_body', '👗'],
    ['Tute e jumpsuit', 'full_body', '🩱'],
    ['Tacchi', 'shoes', '👠'],
    ['Ballerine e mocassini', 'shoes', '🥿'],
    ['Gioielli', 'accessory', '💍'],
  ],
  uomo: [
    ['Polo', 'top_base', '👕'],
    ['Tute', 'full_body', '🩱'],
    ['Scarpe eleganti', 'shoes', '👞'],
    ['Mocassini', 'shoes', '🥿'],
    ['Cravatte e papillon', 'accessory', '👔'],
    ['Orologi', 'accessory', '⌚'],
  ],
  neutro: [
    ['Top e polo', 'top_base', '👚'],
    ['Abiti e tute', 'full_body', '🩱'],
    ['Scarpe eleganti', 'shoes', '👞'],
    ['Gioielli e orologi', 'accessory', '💍'],
  ],
};

// Intimo (SPEC 4): id fissi, così la migrazione dello schema 2 e i backup vecchi non creano doppioni.
export const UNDERWEAR_CATEGORY_IDS = {
  bra: '5b1f0e7a-7c1d-4a8e-9b11-000000000001',
  briefs: '5b1f0e7a-7c1d-4a8e-9b11-000000000002',
  socks: '5b1f0e7a-7c1d-4a8e-9b11-000000000003',
  undershirt: '5b1f0e7a-7c1d-4a8e-9b11-000000000004',
} as const;

interface UnderwearSeed {
  id: string;
  name: string;
  icon: string;
  maxWears: number;
}

// Reggiseni c'è in tutti i preset (SPEC 4).
const BRA: UnderwearSeed = { id: UNDERWEAR_CATEGORY_IDS.bra, name: 'Reggiseni', icon: '👙', maxWears: 3 };

const UNDERWEAR: Record<Preset, UnderwearSeed[]> = {
  donna: [
    BRA,
    { id: UNDERWEAR_CATEGORY_IDS.briefs, name: 'Slip e culotte', icon: '🩲', maxWears: 1 },
    { id: UNDERWEAR_CATEGORY_IDS.socks, name: 'Calze e collant', icon: '🧦', maxWears: 1 },
  ],
  uomo: [
    { id: UNDERWEAR_CATEGORY_IDS.briefs, name: 'Boxer e slip', icon: '🩲', maxWears: 1 },
    { id: UNDERWEAR_CATEGORY_IDS.undershirt, name: 'Canottiere', icon: '🎽', maxWears: 1 },
    { id: UNDERWEAR_CATEGORY_IDS.socks, name: 'Calzini', icon: '🧦', maxWears: 1 },
    BRA,
  ],
  neutro: [
    { id: UNDERWEAR_CATEGORY_IDS.briefs, name: 'Intimo', icon: '🩲', maxWears: 1 },
    BRA,
    { id: UNDERWEAR_CATEGORY_IDS.socks, name: 'Calze e calzini', icon: '🧦', maxWears: 1 },
  ],
};

function underwearCategory(seed: UnderwearSeed, order: number, now: string): CategoryRecord {
  return {
    id: seed.id,
    name: seed.name,
    slotType: 'underwear',
    icon: seed.icon,
    defaultMaxWears: seed.maxWears,
    bulkWeight: slotInfo('underwear').bulkWeight,
    order,
    createdAt: now,
    updatedAt: now,
  };
}

const SLOT_ORDER: SlotType[] = [
  'top_base',
  'top_layer',
  'bottom',
  'full_body',
  'outerwear',
  'shoes',
  'accessory',
];

/** Categorie iniziali del preset, ordinate per slot (l'intimo per ultimo). */
export function buildPresetCategories(preset: Preset, now: string = nowIso()): CategoryRecord[] {
  const seeds = [...COMMON, ...EXTRA[preset]];
  const sorted = SLOT_ORDER.flatMap((slot) => seeds.filter((s) => s[1] === slot));
  const clothes = sorted.map(([name, slotType, icon], index): CategoryRecord => {
    const info = slotInfo(slotType);
    return {
      id: newId(),
      name,
      slotType,
      icon,
      defaultMaxWears: info.defaultMaxWears,
      bulkWeight: info.bulkWeight,
      order: index,
      createdAt: now,
      updatedAt: now,
    };
  });
  return [...clothes, ...UNDERWEAR[preset].map((seed, i) => underwearCategory(seed, clothes.length + i, now))];
}

/**
 * Categorie di intimo da aggiungere a un armadio già configurato (schema 2): quelle del preset,
 * solo se non c'è ancora nessuna categoria di intimo. Vanno in fondo all'elenco.
 */
export function underwearCategoriesToAdd(
  preset: Preset,
  existing: readonly Pick<CategoryRecord, 'id' | 'slotType' | 'order'>[],
  now: string = nowIso(),
): CategoryRecord[] {
  if (!existing.length || existing.some((c) => c.slotType === 'underwear')) return [];
  const taken = new Set(existing.map((c) => c.id));
  const start = existing.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  return UNDERWEAR[preset].filter((seed) => !taken.has(seed.id)).map((seed, i) => underwearCategory(seed, start + i, now));
}

/**
 * La categoria Reggiseni da aggiungere a un armadio già configurato che non ce l'ha (id fisso:
 * niente doppioni). Va in fondo all'elenco. Usata dalle migrazioni degli schemi 3 e 4.
 */
export function braCategoryToAdd(
  existing: readonly Pick<CategoryRecord, 'id' | 'order'>[],
  now: string = nowIso(),
): CategoryRecord[] {
  if (!existing.length || existing.some((c) => c.id === UNDERWEAR_CATEGORY_IDS.bra)) return [];
  const order = existing.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  return [underwearCategory(BRA, order, now)];
}

export function isPreset(value: unknown): value is Preset {
  return value === 'donna' || value === 'uomo' || value === 'neutro';
}

/** Suggerimenti per la "nota intimo/sotto" della scheda capo. */
export const INTIMATE_SUGGESTIONS: Record<Preset, string[]> = {
  donna: [
    'Reggiseno senza spalline',
    'Intimo invisibile/nude',
    'Sottoveste',
    'Collant velati',
    'Richiede cintura',
  ],
  uomo: ['Canottiera sotto', 'Intimo invisibile', 'Calzini scuri', 'Richiede cintura'],
  neutro: [
    'Intimo invisibile/nude',
    'Canottiera sotto',
    'Reggiseno senza spalline',
    'Richiede cintura',
  ],
};

type ListSeed = [name: string, key?: string, essentials?: EssentialTemplateEntry[]];

const CITY: EssentialTemplateEntry[] = [
  { label: 'Intimo', rule: 'perDayPlusOne', qty: 1 },
  { label: 'Calzini', rule: 'perDayPlusOne', qty: 1 },
  { label: 'Pigiama', rule: 'fixed', qty: 1 },
  { label: 'Beauty e spazzolino', rule: 'fixed', qty: 1 },
  { label: 'Caricabatterie', rule: 'fixed', qty: 1 },
  { label: 'Documenti', rule: 'fixed', qty: 1 },
  { label: 'Sacchetto per i panni sporchi', rule: 'fixed', qty: 1 },
];

export const DEFAULT_LISTS: Record<ListKind, ListSeed[]> = {
  owner: [['Mio', 'mine'], ['Condiviso'], ["Prestato da un'amica o un amico"]],
  location: [
    ['Armadio principale', 'main'],
    ['Cassettiera'],
    ['Scarpiera'],
    ['Scatola cambio stagione', 'seasonBox'],
    ['Seconda casa'],
  ],
  occasion: [
    ['Casual', 'casual'],
    ['Studio/Lavoro', 'work'],
    ['Serata', 'evening'],
    ['Elegante/Cerimonia', 'formal'],
    ['Sport/Relax', 'sport'],
    ['Mare/Vacanza', 'beach'],
  ],
  fabric: [
    ['Cotone', 'cotton'],
    ['Lino', 'linen'],
    ['Lana', 'wool'],
    ['Cashmere', 'cashmere'],
    ['Seta', 'silk'],
    ['Denim', 'denim'],
    ['Pelle', 'leather'],
    ['Camoscio', 'suede'],
    ['Viscosa', 'viscose'],
    ['Sintetico', 'synthetic'],
  ],
  maintenance: [
    ['Levapelucchi'],
    ['Bottone o zip'],
    ['Pulire suola o camoscio'],
    ['Rifare il tacco'],
    ['Tintoria'],
  ],
  person: [],
  packingTemplate: [
    ['Weekend in città', 'city', CITY],
    [
      'Mare',
      'beach',
      [
        ...CITY,
        { label: 'Costume', rule: 'fixed', qty: 2 },
        { label: 'Crema solare', rule: 'fixed', qty: 1 },
        { label: 'Telo mare', rule: 'fixed', qty: 1 },
      ],
    ],
    [
      'Montagna/Freddo',
      'mountain',
      [
        ...CITY,
        { label: 'Calze pesanti', rule: 'perDay', qty: 1 },
        { label: 'Guanti e cappello', rule: 'fixed', qty: 1 },
      ],
    ],
    [
      'Lavoro',
      'work',
      [...CITY, { label: 'Computer e cavi', rule: 'fixed', qty: 1 }, { label: 'Biglietti da visita', rule: 'fixed', qty: 1 }],
    ],
  ],
};

export function buildDefaultLists(now: string = nowIso()): ListRecord[] {
  const kinds = Object.keys(DEFAULT_LISTS) as ListKind[];
  return kinds.flatMap((kind) =>
    DEFAULT_LISTS[kind].map(([name, key, essentials], order) => ({
      id: newId(),
      kind,
      name,
      order,
      extra: {
        ...(key ? { key } : {}),
        ...(essentials ? { essentials: essentials.map((e) => ({ ...e })) } : {}),
      },
      createdAt: now,
      updatedAt: now,
    })),
  );
}

/** Coppie di occasioni incompatibili predefinite (SPEC.md, sezione 8.3). */
export const DEFAULT_INCOMPATIBLE: [string, string][] = [
  ['sport', 'formal'],
  ['sport', 'evening'],
  ['beach', 'work'],
];

export function buildOccasionMatrix(lists: ListRecord[]): [string, string][] {
  const byKey = new Map(
    lists.filter((l) => l.kind === 'occasion' && l.extra.key).map((l) => [l.extra.key as string, l.id]),
  );
  const pairs: [string, string][] = [];
  for (const [a, b] of DEFAULT_INCOMPATIBLE) {
    const idA = byKey.get(a);
    const idB = byKey.get(b);
    if (idA && idB) pairs.push([idA, idB]);
  }
  return pairs;
}

export function defaultSettings(
  input: { preset: Preset; userName: string; now?: string },
): Omit<SettingsMap, 'occasionMatrix' | 'theme'> {
  const now = input.now ?? nowIso();
  return {
    app: { appName: 'Armadio', onboarded: false, createdAt: now },
    profile: { userName: input.userName, measurements: {}, brandSizes: [] },
    preset: input.preset,
    backup: {
      lastBackupDate: null,
      changesSinceBackup: 0,
      reminders: true,
      autoWeekly: false,
      lastAutoBackupDate: null,
    },
    notifications: { eveningReminder: false, time: '21:00' },
    appLock: { enabled: false },
    antiRepeatDays: 3,
    schemaVersion: 1,
    errorLog: [],
    endOfDay: null,
    updates: { lastCheck: null, latestVersion: null, apkUrl: null, pageUrl: null },
  };
}
