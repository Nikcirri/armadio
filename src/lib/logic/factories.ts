import type {
  CategoryRecord,
  ItemRecord,
  OutfitRecord,
  TripRecord,
} from '../db/types';
import { newId, nowIso } from './util';

/** Nuovo capo con tutti i campi ai valori predefiniti. */
export function createItem(
  input: Pick<ItemRecord, 'name'> & Partial<ItemRecord>,
  category: Pick<CategoryRecord, 'id' | 'slotType' | 'defaultMaxWears'>,
  now: string = nowIso(),
): ItemRecord {
  return {
    id: newId(),
    categoryId: category.id,
    slotType: category.slotType,
    photoIds: [],
    status: 'clean',
    statusNote: '',
    hasStain: false,
    maintenanceTags: [],
    loanTo: '',
    loanDate: null,
    ownerId: null,
    locationId: null,
    favorite: false,
    colors: [],
    fabrics: [],
    season: 'allSeasons',
    warmth: 'medium',
    cutStyle: 'regular',
    intimateNote: '',
    underwearIds: [],
    waterproof: false,
    walkability: category.slotType === 'shoes' ? 'medium' : null,
    bagSize: null,
    occasions: [],
    washTags: [],
    fitNote: '',
    brand: '',
    size: '',
    price: null,
    purchaseDate: null,
    resalePrice: null,
    wearCount: 0,
    lastWornDate: null,
    wearsSinceWash: 0,
    maxWearsBeforeWash: category.defaultMaxWears,
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function createOutfit(
  input: Pick<OutfitRecord, 'name' | 'itemIds'> & Partial<OutfitRecord>,
  now: string = nowIso(),
): OutfitRecord {
  return {
    id: newId(),
    wishlistIds: [],
    season: null,
    occasions: [],
    weatherTags: [],
    layout: [],
    favorite: false,
    notes: '',
    incomplete: false,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function createTrip(
  input: Pick<TripRecord, 'name' | 'startDate' | 'endDate'> & Partial<TripRecord>,
  now: string = nowIso(),
): TripRecord {
  return {
    id: newId(),
    luggageType: 'cabin',
    templateId: null,
    weather: '',
    outfitIds: [],
    extraItemIds: [],
    wearInTransitIds: [],
    checklist: [],
    packedItemIds: [],
    status: 'planning',
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}
