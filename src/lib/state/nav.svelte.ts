import { pushTab, popTab, type TabId } from '../logic/navigation';

export type AltroPageId = 'settings' | 'categories' | 'backup' | 'info';

export const nav = $state<{ history: TabId[]; altroPage: AltroPageId | null; laundryOpen: boolean }>({
  history: ['armadio'],
  altroPage: null,
  laundryOpen: false,
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

export function resetNavigation(): void {
  nav.history = ['armadio'];
  nav.altroPage = null;
  nav.laundryOpen = false;
}
