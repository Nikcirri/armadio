import { pushTab, popTab, type TabId } from '../logic/navigation';

export type AltroPageId =
  | 'settings'
  | 'categories'
  | 'lists'
  | 'backup'
  | 'info'
  | 'wishlist'
  | 'sizes'
  | 'declutter'
  | 'stats'
  | 'armocromia';

export type OutfitSection = 'outfits' | 'diary';

/** Richiesta per la sezione Outfit da un'altra parte dell'app (scheda capo, notifica…). */
export type OutfitRequest = { kind: 'new'; itemIds: string[] } | { kind: 'endOfDay' };

export const nav = $state<{
  history: TabId[];
  altroPage: AltroPageId | null;
  laundryOpen: boolean;
  outfitSection: OutfitSection;
  outfitRequest: OutfitRequest | null;
  /** Outfit aperto nel dettaglio: resta aperto anche se si passa a un'altra sezione e si torna. */
  outfitDetail: string | null;
  /** Capo da aprire nell'Armadio (es. toccato dentro un outfit). */
  itemRequest: string | null;
}>({
  history: ['armadio'],
  altroPage: null,
  laundryOpen: false,
  outfitSection: 'outfits',
  outfitRequest: null,
  outfitDetail: null,
  itemRequest: null,
});

export function currentTab(): TabId {
  return nav.history[nav.history.length - 1] ?? 'armadio';
}

export function selectTab(id: TabId): void {
  nav.history = pushTab(nav.history, id);
}

export function previousTab(): void {
  nav.history = popTab(nav.history);
}

/** Apre una pagina della sezione Altro (es. dal menu ⋮ o dal badge del backup). */
export function openAltroPage(page: AltroPageId): void {
  selectTab('altro');
  nav.altroPage = page;
}

export function closeAltroPage(): void {
  nav.altroPage = null;
}

/** Apre la Lavanderia (dalla pillola in alto o dall'Armadio). */
export function openLaundry(): void {
  selectTab('armadio');
  nav.laundryOpen = true;
}

export function closeLaundry(): void {
  nav.laundryOpen = false;
}

/** "Crea outfit con questo capo" e "Nuovo outfit con questi capi". */
export function requestNewOutfit(itemIds: string[]): void {
  nav.outfitSection = 'outfits';
  nav.outfitRequest = { kind: 'new', itemIds: [...itemIds] };
  selectTab('outfit');
}

export function requestOpenOutfit(id: string): void {
  nav.outfitSection = 'outfits';
  nav.outfitDetail = id;
  selectTab('outfit');
}

/** Dalla notifica serale. */
export function requestEndOfDay(): void {
  nav.outfitRequest = { kind: 'endOfDay' };
  selectTab('outfit');
}

export function requestOpenItem(id: string): void {
  nav.laundryOpen = false;
  nav.itemRequest = id;
  selectTab('armadio');
}

export function resetNavigation(): void {
  nav.history = ['armadio'];
  nav.altroPage = null;
  nav.laundryOpen = false;
  nav.outfitSection = 'outfits';
  nav.outfitRequest = null;
  nav.outfitDetail = null;
  nav.itemRequest = null;
}
