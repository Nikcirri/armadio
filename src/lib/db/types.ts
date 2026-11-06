// Tipi dei record del database "ArmadioDB" (SPEC.md, sezione 3).
// Id: UUID stringa. Date: "YYYY-MM-DD". Timestamp: ISO 8601.

export type SlotType =
  | 'top_base'
  | 'top_layer'
  | 'bottom'
  | 'full_body'
  | 'outerwear'
  | 'shoes'
  | 'accessory';

export type ItemStatus =
  | 'clean'
  | 'toWash'
  | 'drying'
  | 'toIron'
  | 'packed'
  | 'onLoan'
  | 'maintenance'
  | 'forSale';

export type Season = 'springSummer' | 'autumnWinter' | 'allSeasons';
export type Warmth = 'light' | 'medium' | 'heavy';
export type CutStyle = 'regular' | 'highWaist' | 'lowWaist' | 'crop' | 'oversize' | 'fitted' | 'slim';
export type Walkability = 'allDay' | 'medium' | 'eveningOnly';
export type BagSize = 'mini' | 'medium' | 'large';
export type WashTag =
  | 'handWash'
  | 'max30'
  | 'max40'
  | 'delicate'
  | 'noSpin'
  | 'noDryer'
  | 'ironLow'
  | 'dryClean';

export type ColorId =
  | 'black'
  | 'white'
  | 'cream'
  | 'grey'
  | 'navy'
  | 'denim'
  | 'green'
  | 'olive'
  | 'red'
  | 'burgundy'
  | 'pink'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'brown'
  | 'metallic'
  | 'pattern';

export type Preset = 'donna' | 'uomo' | 'neutro';
export type PaletteId = 'sabbia' | 'cipria' | 'salvia' | 'lavanda';
export type ThemeMode = 'system' | 'light' | 'dark';

interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

/** Record creati da "Carica esempio": si eliminano tutti insieme con un tocco. */
interface DemoFlag {
  demo?: boolean;
}

export interface PhotoRecord extends Timestamps, DemoFlag {
  id: string;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export interface CategoryRecord extends Timestamps {
  id: string;
  name: string;
  slotType: SlotType;
  icon: string;
  /** null = non si lava a utilizzi (scarpe, accessori). */
  defaultMaxWears: number | null;
  bulkWeight: number;
  order: number;
}

export interface ItemRecord extends Timestamps, DemoFlag {
  id: string;
  name: string;
  categoryId: string;
  slotType: SlotType;
  photoIds: string[];
  status: ItemStatus;
  statusNote: string;
  hasStain: boolean;
  maintenanceTags: string[];
  loanTo: string;
  loanDate: string | null;
  ownerId: string | null;
  locationId: string | null;
  favorite: boolean;
  colors: ColorId[];
  fabrics: string[];
  season: Season;
  warmth: Warmth;
  cutStyle: CutStyle;
  intimateNote: string;
  waterproof: boolean;
  walkability: Walkability | null;
  bagSize: BagSize | null;
  occasions: string[];
  washTags: WashTag[];
  fitNote: string;
  brand: string;
  size: string;
  price: number | null;
  purchaseDate: string | null;
  resalePrice: number | null;
  wearCount: number;
  lastWornDate: string | null;
  wearsSinceWash: number;
  maxWearsBeforeWash: number | null;
  notes: string;
}

export interface WearLogRecord extends Timestamps, DemoFlag {
  id: string;
  date: string;
  itemIds: string[];
  itemNames: string[];
  outfitId: string | null;
  diaryId: string | null;
}

export interface OutfitLayoutEntry {
  itemId: string;
  x: number;
  y: number;
  scale: number;
  z: number;
}

export interface OutfitRecord extends Timestamps, DemoFlag {
  id: string;
  name: string;
  itemIds: string[];
  wishlistIds: string[];
  season: Season | null;
  occasions: string[];
  weatherTags: string[];
  layout: OutfitLayoutEntry[];
  favorite: boolean;
  notes: string;
  incomplete: boolean;
}

export interface DiaryRecord extends Timestamps, DemoFlag {
  id: string;
  date: string;
  outfitId: string | null;
  itemIds: string[];
  location: string;
  people: string[];
  note: string;
  photoIds: string[];
}

export interface PlannerRecord extends Timestamps, DemoFlag {
  date: string;
  outfitId: string | null;
  itemIds: string[];
  note: string;
}

export type LuggageType = 'underseat' | 'cabin' | 'checked';
export type TripStatus = 'planning' | 'packed' | 'travelling' | 'done';

export interface ChecklistEntry {
  id: string;
  label: string;
  qty: number;
  checked: boolean;
}

export interface TripRecord extends Timestamps, DemoFlag {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  luggageType: LuggageType;
  templateId: string | null;
  weather: string;
  outfitIds: string[];
  extraItemIds: string[];
  wearInTransitIds: string[];
  checklist: ChecklistEntry[];
  packedItemIds: string[];
  status: TripStatus;
}

export interface WishlistRecord extends Timestamps, DemoFlag {
  id: string;
  name: string;
  categoryId: string | null;
  photoIds: string[];
  price: number | null;
  storeOrLink: string;
  colors: ColorId[];
  season: Season | null;
  occasions: string[];
  priority: 'low' | 'medium' | 'high';
  notes: string;
}

export type ListKind =
  | 'owner'
  | 'location'
  | 'occasion'
  | 'fabric'
  | 'maintenance'
  | 'person'
  | 'packingTemplate';

export type EssentialRule = 'perDayPlusOne' | 'perDay' | 'fixed';

export interface EssentialTemplateEntry {
  label: string;
  rule: EssentialRule;
  qty: number;
}

export interface ListExtra {
  /** Chiave stabile per le regole (es. "mine", "seasonBox", "sport", "suede"). */
  key?: string;
  essentials?: EssentialTemplateEntry[];
}

export interface ListRecord extends Timestamps {
  id: string;
  kind: ListKind;
  name: string;
  order: number;
  extra: ListExtra;
}

export interface ErrorLogEntry {
  at: string;
  message: string;
}

/** Capi indossati che aspettano "Fine giornata" (da lavare o restano puliti). */
export interface EndOfDayPending {
  /** Giorno più recente in cui sono stati indossati. */
  date: string;
  itemIds: string[];
}

export interface SettingsMap {
  app: { appName: string; onboarded: boolean; createdAt: string };
  profile: {
    userName: string;
    measurements: Record<string, number | null>;
    brandSizes: { brand: string; size: string }[];
  };
  theme: { palette: PaletteId; mode: ThemeMode };
  preset: Preset;
  backup: {
    lastBackupDate: string | null;
    changesSinceBackup: number;
    reminders: boolean;
    autoWeekly: boolean;
    lastAutoBackupDate: string | null;
  };
  notifications: { eveningReminder: boolean; time: string };
  appLock: { enabled: boolean };
  antiRepeatDays: number;
  /** Coppie di id di occasioni incompatibili tra loro. */
  occasionMatrix: [string, string][];
  schemaVersion: number;
  errorLog: ErrorLogEntry[];
  endOfDay: EndOfDayPending | null;
  /** Ultimo controllo aggiornamenti (solo su questo telefono). */
  updates: UpdateCheckState;
}

export interface UpdateCheckState {
  lastCheck: string | null;
  latestVersion: string | null;
  apkUrl: string | null;
  pageUrl: string | null;
}

export type SettingKey = keyof SettingsMap;

export interface SettingRecord<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingsMap[K];
}

/** Tabelle con chiave "id" che finiscono nel backup come dati. */
export const DATA_TABLES = [
  'categories',
  'items',
  'wearLog',
  'outfits',
  'diary',
  'trips',
  'wishlist',
  'lists',
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
