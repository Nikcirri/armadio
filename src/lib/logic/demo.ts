import type {
  CategoryRecord,
  ColorId,
  ItemRecord,
  ListRecord,
  OutfitRecord,
  Season,
  SlotType,
  TripRecord,
  WashTag,
  Warmth,
  WearLogRecord,
} from '../db/types';
import { createItem, createOutfit, createTrip } from './factories';
import { buildEssentials } from './packing';
import { addDays, fromDateKey, newId, nowIso, todayKey } from './util';

export type DemoShape = 'tshirt' | 'shirt' | 'sweater' | 'jeans' | 'trousers' | 'coat' | 'sneakers' | 'bag';

export interface DemoGarment {
  key: string;
  name: string;
  shape: DemoShape;
  slot: SlotType;
  /** Nomi di categoria preferiti, in ordine; se nessuno esiste si usa la prima dello slot. */
  categoryNames: string[];
  color: ColorId;
  /** Colore usato per il disegno. */
  hex: string;
  fabricKey: string;
  season: Season;
  warmth: Warmth;
  occasionKeys: string[];
  washTags: WashTag[];
  brand: string;
  price: number;
  wearCount: number;
  daysAgo: number;
  extra?: Partial<ItemRecord>;
}

// 8 capi di esempio (SPEC.md, sezione 9), adatti a qualsiasi preset.
export const DEMO_GARMENTS: readonly DemoGarment[] = [
  { key: 'tee', name: 'T-shirt bianca', shape: 'tshirt', slot: 'top_base', categoryNames: ['T-shirt'], color: 'white', hex: '#f4f2ee', fabricKey: 'cotton', season: 'allSeasons', warmth: 'light', occasionKeys: ['casual', 'sport'], washTags: ['max40'], brand: 'Basic', price: 12, wearCount: 18, daysAgo: 2 },
  { key: 'shirt', name: 'Camicia azzurra', shape: 'shirt', slot: 'top_base', categoryNames: ['Camicie'], color: 'denim', hex: '#9db8d6', fabricKey: 'cotton', season: 'allSeasons', warmth: 'light', occasionKeys: ['work', 'casual'], washTags: ['max30', 'ironLow'], brand: 'Oxford', price: 39, wearCount: 9, daysAgo: 6 },
  { key: 'sweater', name: 'Maglione beige', shape: 'sweater', slot: 'top_layer', categoryNames: ['Maglioni'], color: 'cream', hex: '#d9c6a5', fabricKey: 'wool', season: 'autumnWinter', warmth: 'heavy', occasionKeys: ['casual', 'work'], washTags: ['handWash', 'noDryer'], brand: 'Lanificio', price: 69, wearCount: 6, daysAgo: 10 },
  { key: 'jeans', name: 'Jeans blu', shape: 'jeans', slot: 'bottom', categoryNames: ['Jeans', 'Pantaloni'], color: 'denim', hex: '#3d5a80', fabricKey: 'denim', season: 'allSeasons', warmth: 'medium', occasionKeys: ['casual'], washTags: ['max30'], brand: "Denim Co.", price: 79, wearCount: 25, daysAgo: 2, extra: { cutStyle: 'highWaist' } },
  { key: 'trousers', name: 'Pantaloni neri', shape: 'trousers', slot: 'bottom', categoryNames: ['Pantaloni'], color: 'black', hex: '#2a2a2c', fabricKey: 'viscose', season: 'allSeasons', warmth: 'medium', occasionKeys: ['work', 'evening'], washTags: ['max30', 'delicate'], brand: 'Sartoria', price: 59, wearCount: 11, daysAgo: 6 },
  { key: 'coat', name: 'Trench color sabbia', shape: 'coat', slot: 'outerwear', categoryNames: ['Cappotti e piumini', 'Giacche'], color: 'cream', hex: '#c8b08a', fabricKey: 'cotton', season: 'allSeasons', warmth: 'medium', occasionKeys: ['work', 'casual', 'evening'], washTags: ['dryClean'], brand: 'Classico', price: 149, wearCount: 14, daysAgo: 10 },
  { key: 'sneakers', name: 'Sneakers bianche', shape: 'sneakers', slot: 'shoes', categoryNames: ['Sneakers'], color: 'white', hex: '#f1efea', fabricKey: 'leather', season: 'allSeasons', warmth: 'medium', occasionKeys: ['casual', 'sport'], washTags: [], brand: 'Runner', price: 95, wearCount: 40, daysAgo: 2, extra: { walkability: 'allDay', waterproof: false } },
  { key: 'bag', name: 'Borsa in pelle marrone', shape: 'bag', slot: 'accessory', categoryNames: ['Borse e zaini'], color: 'brown', hex: '#8a5a3b', fabricKey: 'leather', season: 'allSeasons', warmth: 'medium', occasionKeys: ['casual', 'work', 'evening'], washTags: [], brand: 'Pelletteria', price: 120, wearCount: 30, daysAgo: 2, extra: { bagSize: 'medium' } },
];

export interface DemoPhotoRef {
  id: string;
}

export interface DemoBundle {
  items: ItemRecord[];
  outfits: OutfitRecord[];
  trips: TripRecord[];
  wearLog: WearLogRecord[];
}

function pickCategory(categories: readonly CategoryRecord[], g: DemoGarment): CategoryRecord {
  for (const name of g.categoryNames) {
    const match = categories.find((c) => c.name === name);
    if (match) return match;
  }
  const bySlot = categories.filter((c) => c.slotType === g.slot).sort((a, b) => a.order - b.order)[0];
  if (bySlot) return bySlot;
  throw new Error(`Nessuna categoria per lo slot ${g.slot}`);
}

/** Prossimo venerdì (o oggi se è venerdì) come "YYYY-MM-DD". */
export function nextFriday(today: string): string {
  const day = fromDateKey(today).getDay();
  const diff = (5 - day + 7) % 7;
  return addDays(today, diff);
}

/** Dati di esempio: 8 capi, 2 outfit, 1 viaggio (tutti marcati come demo). */
export function buildDemoBundle(input: {
  categories: readonly CategoryRecord[];
  lists: readonly ListRecord[];
  photoIds: Record<string, string>;
  today?: string;
  now?: string;
}): DemoBundle {
  const now = input.now ?? nowIso();
  const today = input.today ?? todayKey();
  const keyed = (kind: ListRecord['kind'], key: string) =>
    input.lists.find((l) => l.kind === kind && l.extra.key === key)?.id ?? null;
  const fabricName = (key: string) =>
    input.lists.find((l) => l.kind === 'fabric' && l.extra.key === key)?.name ?? key;
  const mine = keyed('owner', 'mine');
  const main = keyed('location', 'main');

  const items = DEMO_GARMENTS.map((g) => {
    const cat = pickCategory(input.categories, g);
    const photoId = input.photoIds[g.key];
    return createItem(
      {
        name: g.name,
        demo: true,
        photoIds: photoId ? [photoId] : [],
        colors: [g.color],
        fabrics: [fabricName(g.fabricKey)],
        season: g.season,
        warmth: g.warmth,
        occasions: g.occasionKeys.map((k) => keyed('occasion', k)).filter((id): id is string => !!id),
        washTags: g.washTags,
        brand: g.brand,
        price: g.price,
        purchaseDate: addDays(today, -200),
        wearCount: g.wearCount,
        lastWornDate: addDays(today, -g.daysAgo),
        ownerId: mine,
        locationId: main,
        ...g.extra,
      },
      cat,
      now,
    );
  });
  const id = (key: string) => items[DEMO_GARMENTS.findIndex((g) => g.key === key)]!.id;

  const casual = createOutfit(
    {
      name: 'Casual del weekend',
      demo: true,
      itemIds: [id('tee'), id('jeans'), id('sneakers'), id('bag')],
      occasions: [keyed('occasion', 'casual')].filter((x): x is string => !!x),
      favorite: true,
    },
    now,
  );
  const office = createOutfit(
    {
      name: 'Ufficio di mezza stagione',
      demo: true,
      itemIds: [id('shirt'), id('sweater'), id('trousers'), id('coat'), id('sneakers')],
      occasions: [keyed('occasion', 'work')].filter((x): x is string => !!x),
    },
    now,
  );

  const start = nextFriday(addDays(today, 1));
  const end = addDays(start, 2);
  const template = input.lists.find((l) => l.kind === 'packingTemplate' && l.extra.key === 'city');
  const trip = createTrip(
    {
      name: 'Weekend a Firenze',
      demo: true,
      startDate: start,
      endDate: end,
      luggageType: 'cabin',
      templateId: template?.id ?? null,
      weather: 'Mite',
      outfitIds: [casual.id, office.id],
      wearInTransitIds: [id('coat'), id('sneakers')],
      checklist: buildEssentials(template?.extra.essentials ?? [], 3),
    },
    now,
  );

  const wearLog: WearLogRecord[] = [casual, office].map((o, i) => ({
    id: newId(),
    date: addDays(today, i === 0 ? -2 : -6),
    itemIds: [...o.itemIds],
    itemNames: o.itemIds.map((iid) => items.find((it) => it.id === iid)?.name ?? ''),
    outfitId: o.id,
    diaryId: null,
    demo: true,
    createdAt: now,
    updatedAt: now,
  }));

  return { items, outfits: [casual, office], trips: [trip], wearLog };
}
