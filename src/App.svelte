<script lang="ts">
  import { onMount } from 'svelte';
  import { App as CapApp } from '@capacitor/app';
  import { Capacitor } from '@capacitor/core';
  import { Haptics, ImpactStyle } from '@capacitor/haptics';
  import { TABS, decideBack, popTab, pushTab, type TabId } from './lib/logic/navigation';
  import TabIcon from './lib/ui/TabIcon.svelte';
  import Toast from './lib/ui/Toast.svelte';
  import ComingSoon from './views/ComingSoon.svelte';

  let history = $state<TabId[]>(['armadio']);
  let toastMessage = $state<string | null>(null);
  let lastBackPressAt: number | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const currentId = $derived(history[history.length - 1] ?? 'armadio');
  const currentTab = $derived(TABS.find((t) => t.id === currentId) ?? TABS[0]!);

  function showToast(message: string, ms = 2000) {
    toastMessage = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastMessage = null), ms);
  }

  async function lightTap() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // La vibrazione è un extra: se non è disponibile si continua senza.
    }
  }

  function selectTab(id: TabId) {
    if (id === currentId) return;
    history = pushTab(history, id);
    void lightTap();
  }

  function handleBack() {
    const action = decideBack({
      overlayOpen: false, // Fogli e dialoghi arrivano nella Fase 1.
      historyLength: history.length,
      lastBackPressAt,
      now: Date.now(),
    });
    switch (action) {
      case 'previous-tab':
        history = popTab(history);
        lastBackPressAt = null;
        break;
      case 'confirm-exit':
        lastBackPressAt = Date.now();
        showToast("Premi di nuovo Indietro per uscire");
        break;
      case 'exit':
        void CapApp.exitApp();
        break;
      case 'close-overlay':
        break;
    }
  }

  onMount(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener('backButton', handleBack);
    return () => {
      void listener.then((l) => l.remove());
    };
  });
</script>

<div class="shell">
  <header class="topbar">
    <span class="title">Armadio</span>
    <span class="pill" aria-label="Stato dei capi">0 puliti · 0 da lavare</span>
  </header>

  <main class="content">
    {#key currentId}
      <ComingSoon tab={currentTab} />
    {/key}
  </main>

  <nav class="navbar" aria-label="Sezioni">
    {#each TABS as tab (tab.id)}
      <button
        class="navitem"
        class:active={tab.id === currentId}
        aria-current={tab.id === currentId ? 'page' : undefined}
        onclick={() => selectTab(tab.id)}
      >
        <TabIcon tab={tab.id} />
        <span>{tab.label}</span>
      </button>
    {/each}
  </nav>

  <Toast message={toastMessage} />
</div>

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    flex: none;
    height: calc(var(--topbar-h) + var(--safe-top));
    padding: var(--safe-top) calc(16px + var(--safe-right)) 0 calc(16px + var(--safe-left));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .title {
    font-family: var(--font-serif);
    font-size: 1.375rem;
    letter-spacing: 0.02em;
  }
  .pill {
    font-size: 0.8125rem;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-muted);
    white-space: nowrap;
  }
  .content {
    flex: 1;
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
