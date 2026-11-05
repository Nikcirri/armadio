<script lang="ts">
  import { onMount } from 'svelte';
  import { App as CapApp } from '@capacitor/app';
  import { TABS, decideBack, type TabId } from './lib/logic/navigation';
  import { isNative, tapFeedback } from './lib/platform';
  import { runAutoBackupIfDue } from './lib/backup/service';
  import { reportError } from './lib/errors';
  import { currentTab, nav, previousTab, selectTab } from './lib/state/nav.svelte';
  import { settings } from './lib/state/settings.svelte';
  import { applyTheme, system } from './lib/state/theme.svelte';
  import { closeTopOverlay, showToast } from './lib/state/ui.svelte';
  import BusyOverlay from './lib/ui/BusyOverlay.svelte';
  import DialogHost from './lib/ui/DialogHost.svelte';
  import TabIcon from './lib/ui/TabIcon.svelte';
  import Toast from './lib/ui/Toast.svelte';
  import TopBar from './lib/ui/TopBar.svelte';
  import Altro from './views/Altro.svelte';
  import ComingSoon from './views/ComingSoon.svelte';
  import Onboarding from './views/Onboarding.svelte';

  let lastBackPressAt: number | null = null;
  let autoBackupChecked = false;

  const onboarded = $derived(settings.loaded && settings.value.app?.onboarded === true);
  const activeId = $derived(currentTab());
  const activeTab = $derived(TABS.find((t) => t.id === activeId) ?? TABS[0]!);

  // Tema: segue le impostazioni (durante il primo avvio lo gestisce Onboarding).
  $effect(() => {
    if (!onboarded) return;
    void system.prefersDark;
    applyTheme(settings.value.theme?.palette ?? 'sabbia', settings.value.theme?.mode ?? 'system');
  });

  // Backup automatico settimanale: una volta per avvio.
  $effect(() => {
    if (!onboarded || autoBackupChecked) return;
    autoBackupChecked = true;
    runAutoBackupIfDue()
      .then((done) => {
        if (done) showToast('Backup automatico salvato in Documenti/Armadio/auto');
      })
      .catch((e) => reportError(e, 'Il backup automatico non è riuscito.'));
  });

  function onTab(id: TabId) {
    if (id === activeId) {
      if (id === 'altro') nav.altroPage = null;
      return;
    }
    selectTab(id);
    void tapFeedback();
  }

  function handleBack() {
    if (closeTopOverlay()) {
      lastBackPressAt = null;
      return;
    }
    const action = decideBack({
      overlayOpen: false,
      historyLength: nav.history.length,
      lastBackPressAt,
      now: Date.now(),
    });
    switch (action) {
      case 'previous-tab':
        previousTab();
        lastBackPressAt = null;
        break;
      case 'confirm-exit':
        lastBackPressAt = Date.now();
        showToast('Premi di nuovo Indietro per uscire');
        break;
      case 'exit':
        void CapApp.exitApp();
        break;
      case 'close-overlay':
        break;
    }
  }

  onMount(() => {
    if (!isNative()) return;
    const listener = CapApp.addListener('backButton', handleBack);
    return () => {
      void listener.then((l) => l.remove());
    };
  });
</script>

{#if !settings.loaded}
  <div class="loading" aria-busy="true"></div>
{:else if !onboarded}
  <Onboarding />
{:else}
  <div class="shell">
    <TopBar />

    <main class="content">
      {#if activeId === 'altro'}
        <Altro />
      {:else}
        {#key activeId}
          <ComingSoon tab={activeTab} />
        {/key}
      {/if}
    </main>

    <nav class="navbar" aria-label="Sezioni">
      {#each TABS as tab (tab.id)}
        <button
          class="navitem"
          class:active={tab.id === activeId}
          aria-current={tab.id === activeId ? 'page' : undefined}
          onclick={() => onTab(tab.id)}
        >
          <TabIcon tab={tab.id} />
          <span>{tab.label}</span>
        </button>
      {/each}
    </nav>
  </div>
{/if}

<Toast />
<DialogHost />
<BusyOverlay />

<style>
  .loading {
    height: 100%;
    background: var(--bg);
  }
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .content {
    flex: 1;
    position: relative;
    overflow-y: auto;
    background: var(--surface);
  }
  .navbar {
    flex: none;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: calc(var(--navbar-h) + var(--safe-bottom));
    padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
    background: var(--bg);
    border-top: 1px solid var(--border);
  }
  .navitem {
    min-height: 48px;
    border: 0;
    background: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 0.6875rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 150ms ease;
  }
  .navitem.active {
    color: var(--accent);
    font-weight: 600;
  }
</style>
