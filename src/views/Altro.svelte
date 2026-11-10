<script lang="ts">
  import { closeAltroPage, nav, type AltroPageId } from '../lib/state/nav.svelte';
  import Icon, { type IconName } from '../lib/ui/Icon.svelte';
  import { lazyComponent } from '../lib/lazy';
  import Lazy from '../lib/ui/Lazy.svelte';

  // Le pagine di Altro si caricano quando si aprono (SPEC.md, sezione 7): all'avvio non servono.
  const PAGES = {
    settings: lazyComponent(() => import('./altro/SettingsPage.svelte')),
    lists: lazyComponent(() => import('./altro/ListsPage.svelte')),
    categories: lazyComponent(() => import('./altro/CategoriesPage.svelte')),
    backup: lazyComponent(() => import('./altro/BackupPage.svelte')),
    info: lazyComponent(() => import('./altro/InfoPage.svelte')),
    updates: lazyComponent(() => import('./altro/UpdatesPage.svelte')),
    wishlist: lazyComponent(() => import('./altro/WishlistPage.svelte')),
    sizes: lazyComponent(() => import('./altro/SizesPage.svelte')),
    declutter: lazyComponent(() => import('./altro/DeclutterPage.svelte')),
    stats: lazyComponent(() => import('./altro/StatsPage.svelte')),
    armocromia: lazyComponent(() => import('./altro/ArmocromiaPage.svelte')),
  };
  const toLists = () => (nav.altroPage = 'lists');
  // Aggiornamenti aperto da Informazioni torna a Informazioni; dal menu o da Altro torna ad Altro.
  let updatesFromInfo = $state(false);
  $effect(() => {
    if (nav.altroPage !== 'updates' && nav.altroPage !== 'info') updatesFromInfo = false;
  });
  const toUpdatesFromInfo = () => {
    updatesFromInfo = true;
    nav.altroPage = 'updates';
  };
  const closeUpdates = () => {
    nav.altroPage = updatesFromInfo ? 'info' : null;
    updatesFromInfo = false;
  };
  const toCategories = () => (nav.altroPage = 'categories');

  const GROUPS: { title: string; entries: { page: AltroPageId; label: string; sub: string; icon: IconName }[] }[] = [
    {
      title: 'Il tuo armadio',
      entries: [
        { page: 'armocromia', label: 'Armocromia', sub: 'La tua stagione e i colori che ti stanno meglio', icon: 'palette' },
        { page: 'wishlist', label: 'Wishlist', sub: 'Cosa vorresti comprare', icon: 'sparkles' },
        { page: 'sizes', label: 'Taglie e misure', sub: 'Da consultare in negozio', icon: 'tag' },
        { page: 'declutter', label: 'Decluttering', sub: 'Cosa vendere e annunci pronti', icon: 'copy' },
        { page: 'stats', label: 'Statistiche', sub: 'Valore, utilizzi, capsule score', icon: 'info' },
      ],
    },
    {
      title: 'App',
      entries: [
        { page: 'lists', label: 'Categorie e liste', sub: 'Categorie, posizioni, occasioni, persone…', icon: 'tag' },
        { page: 'settings', label: 'Impostazioni', sub: 'Nome, colori, promemoria, blocco', icon: 'settings' },
        { page: 'backup', label: 'Backup e dati', sub: 'Esporta, ripristina, esempio', icon: 'save' },
        { page: 'updates', label: 'Aggiornamenti', sub: 'Versione installata e versioni nuove', icon: 'download' },
        { page: 'info', label: 'Informazioni', sub: 'Guida rapida e versione', icon: 'info' },
      ],
    },
  ];
</script>

<div class="altro">
  <h1>Altro</h1>
  {#each GROUPS as g (g.title)}
    <h2 class="section-title">{g.title}</h2>
    <div class="list">
      {#each g.entries as e (e.page)}
        <button class="row" onclick={() => (nav.altroPage = e.page)}>
          <span class="ic"><Icon name={e.icon} /></span>
          <span class="grow">{e.label}<span class="sub">{e.sub}</span></span>
          <Icon name="chevron" size={18} />
        </button>
      {/each}
    </div>
  {/each}
</div>

{#if nav.altroPage === 'settings'}
  <Lazy loader={PAGES.settings} title="Impostazioni" onclose={closeAltroPage} props={{ onclose: closeAltroPage }} />
{:else if nav.altroPage === 'lists'}
  <Lazy
    loader={PAGES.lists}
    title="Categorie e liste"
    onclose={closeAltroPage}
    props={{ onclose: closeAltroPage, oncategories: toCategories }}
  />
{:else if nav.altroPage === 'categories'}
  <Lazy loader={PAGES.categories} title="Categorie" onclose={toLists} props={{ onclose: toLists }} />
{:else if nav.altroPage === 'backup'}
  <Lazy loader={PAGES.backup} title="Backup e dati" onclose={closeAltroPage} props={{ onclose: closeAltroPage }} />
{:else if nav.altroPage === 'info'}
  <Lazy loader={PAGES.info} title="Informazioni" onclose={closeAltroPage} props={{ onclose: closeAltroPage, onupdates: toUpdatesFromInfo }} />
{:else if nav.altroPage === 'updates'}
  <Lazy loader={PAGES.updates} title="Aggiornamenti" onclose={closeUpdates} props={{ onclose: closeUpdates }} />
{:else if nav.altroPage === 'wishlist'}
  <Lazy loader={PAGES.wishlist} title="Wishlist" onclose={closeAltroPage} props={{ onclose: closeAltroPage }} />
{:else if nav.altroPage === 'sizes'}
  <Lazy loader={PAGES.sizes} title="Taglie e misure" onclose={closeAltroPage} props={{ onclose: closeAltroPage }} />
{:else if nav.altroPage === 'declutter'}
  <Lazy loader={PAGES.declutter} title="Decluttering" onclose={closeAltroPage} props={{ onclose: closeAltroPage }} />
{:else if nav.altroPage === 'stats'}
  <Lazy loader={PAGES.stats} title="Statistiche" onclose={closeAltroPage} props={{ onclose: closeAltroPage }} />
{:else if nav.altroPage === 'armocromia'}
  <Lazy loader={PAGES.armocromia} title="Armocromia" onclose={closeAltroPage} props={{ onclose: closeAltroPage }} />
{/if}

<style>
  .altro {
    padding: 16px 16px 40px;
  }
  h1 {
    margin: 8px 4px 0;
    font-size: 1.75rem;
  }
  .ic {
    color: var(--accent);
    display: inline-flex;
  }
</style>
