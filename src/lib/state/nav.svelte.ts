import { pushTab, popTab, type TabId } from '../logic/navigation';

export type AltroPageId = 'settings' | 'categories' | 'backup' | 'info';

export const nav = $state<{ history: TabId[]; altroPage: AltroPageId | null }>({
  history: ['armadio'],
  altroPage: null,
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

export function resetNavigation(): void {
  nav.history = ['armadio'];
  nav.altroPage = null;
}
