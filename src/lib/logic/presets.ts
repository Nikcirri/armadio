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
  { id: 'donna', label: 'Donna', description: 'Abiti, gonne, tacchi, gioielli e note per l’intimo.' },
  { id: 'uomo', label: 'Uomo', description: 'Camicie, polo, completi, cravatte e mocassini.' },
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

const SLOT_ORDER: SlotType[] = [
  'top_base',
  'top_layer',
  'bottom',
  'full_body',
  'outerwear',
  'shoes',
  'accessory',
];

/** Categorie iniziali del preset, ordinate per slot. */
export function buildPresetCategories(preset: Preset, now: string = nowIso()): CategoryRecord[] {
  const seeds = [...COMMON, ...EXTRA[preset]];
  const sorted = SLOT_ORDER.flatMap((slot) => seeds.filter((s) => s[1] === slot));
  return sorted.map(([name, slotType, icon], index) => {
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
  };
}
