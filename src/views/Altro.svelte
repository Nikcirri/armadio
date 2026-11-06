<script lang="ts">
  import { closeAltroPage, nav, type AltroPageId } from '../lib/state/nav.svelte';
  import Icon, { type IconName } from '../lib/ui/Icon.svelte';
  import ArmocromiaPage from './altro/ArmocromiaPage.svelte';
  import BackupPage from './altro/BackupPage.svelte';
  import CategoriesPage from './altro/CategoriesPage.svelte';
  import DeclutterPage from './altro/DeclutterPage.svelte';
  import InfoPage from './altro/InfoPage.svelte';
  import ListsPage from './altro/ListsPage.svelte';
  import SettingsPage from './altro/SettingsPage.svelte';
  import SizesPage from './altro/SizesPage.svelte';
  import StatsPage from './altro/StatsPage.svelte';
  import WishlistPage from './altro/WishlistPage.svelte';

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
        { page: 'info', label: 'Informazioni', sub: 'Versione e guida rapida', icon: 'info' },
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
  <SettingsPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'lists'}
  <ListsPage onclose={closeAltroPage} oncategories={() => (nav.altroPage = 'categories')} />
{:else if nav.altroPage === 'categories'}
  <CategoriesPage onclose={() => (nav.altroPage = 'lists')} />
{:else if nav.altroPage === 'backup'}
  <BackupPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'info'}
  <InfoPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'wishlist'}
  <WishlistPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'sizes'}
  <SizesPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'declutter'}
  <DeclutterPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'stats'}
  <StatsPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'armocromia'}
  <ArmocromiaPage onclose={closeAltroPage} />
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
