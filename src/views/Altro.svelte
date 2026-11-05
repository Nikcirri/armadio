<script lang="ts">
  import { closeAltroPage, nav, type AltroPageId } from '../lib/state/nav.svelte';
  import Icon, { type IconName } from '../lib/ui/Icon.svelte';
  import BackupPage from './altro/BackupPage.svelte';
  import CategoriesPage from './altro/CategoriesPage.svelte';
  import InfoPage from './altro/InfoPage.svelte';
  import SettingsPage from './altro/SettingsPage.svelte';

  const ENTRIES: { page: AltroPageId; label: string; sub: string; icon: IconName }[] = [
    { page: 'settings', label: 'Impostazioni', sub: 'Nome, colori, promemoria', icon: 'settings' },
    { page: 'categories', label: 'Categorie', sub: 'Aggiungi, rinomina, riordina', icon: 'tag' },
    { page: 'backup', label: 'Backup e dati', sub: 'Esporta, ripristina, esempio', icon: 'save' },
    { page: 'info', label: 'Informazioni', sub: 'Versione e guida rapida', icon: 'info' },
  ];
</script>

<div class="altro">
  <h1>Altro</h1>
  <div class="list">
    {#each ENTRIES as e (e.page)}
      <button class="row" onclick={() => (nav.altroPage = e.page)}>
        <span class="ic"><Icon name={e.icon} /></span>
        <span class="grow">{e.label}<span class="sub">{e.sub}</span></span>
        <Icon name="chevron" size={18} />
      </button>
    {/each}
  </div>
  <p class="note">Wishlist, taglie, decluttering e statistiche arriveranno qui con la Fase 8.</p>
</div>

{#if nav.altroPage === 'settings'}
  <SettingsPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'categories'}
  <CategoriesPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'backup'}
  <BackupPage onclose={closeAltroPage} />
{:else if nav.altroPage === 'info'}
  <InfoPage onclose={closeAltroPage} />
{/if}

<style>
  .altro {
    padding: 16px;
  }
  h1 {
    margin: 8px 4px 16px;
    font-size: 1.75rem;
  }
  .ic {
    color: var(--accent);
    display: inline-flex;
  }
</style>
