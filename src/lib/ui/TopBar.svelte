<script lang="ts">
  import { db } from '../db';
  import { needsBackupReminder } from '../logic/backupFormat';
  import { nowIso } from '../logic/util';
  import { live } from '../state/live.svelte';
  import { openAltroPage, openLaundry, type AltroPageId } from '../state/nav.svelte';
  import { settings } from '../state/settings.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let menuOpen = $state(false);

  const counts = live(async () => {
    const seasonBox = await db.lists
      .where('kind')
      .equals('location')
      .filter((l) => l.extra.key === 'seasonBox')
      .first();
    const [clean, toWash] = await Promise.all([
      db.items
        .where('status')
        .equals('clean')
        .filter((i) => !seasonBox || i.locationId !== seasonBox.id)
        .count(),
      db.items.where('status').equals('toWash').count(),
    ]);
    return { clean, toWash };
  }, { clean: 0, toWash: 0 });

  const appName = $derived(settings.value.app?.appName || 'Armadio');
  const showBackupBadge = $derived.by(() => {
    const b = settings.value.backup;
    const app = settings.value.app;
    if (!b || !app) return false;
    return needsBackupReminder({
      enabled: b.reminders,
      changes: b.changesSinceBackup,
      lastBackupDate: b.lastBackupDate,
      appCreatedAt: app.createdAt,
      now: nowIso(),
    });
  });

  const MENU: { page: AltroPageId; label: string; icon: IconName }[] = [
    { page: 'settings', label: 'Impostazioni', icon: 'settings' },
    { page: 'categories', label: 'Categorie', icon: 'tag' },
    { page: 'backup', label: 'Backup e dati', icon: 'save' },
    { page: 'updates', label: 'Aggiornamenti', icon: 'download' },
    { page: 'info', label: 'Informazioni', icon: 'info' },
  ];

  function go(page: AltroPageId) {
    menuOpen = false;
    openAltroPage(page);
  }
</script>

<header class="topbar">
  <h1 class="title">{appName}</h1>
  <div class="right">
    {#if showBackupBadge}
      <button class="badge" onclick={() => openAltroPage('backup')}>
        <Icon name="save" size={16} /> Salva un backup
      </button>
    {:else}
      <button class="pill" aria-label="Apri la lavanderia: {counts.value.clean} puliti, {counts.value.toWash} da lavare" onclick={openLaundry}>
        {counts.value.clean} puliti · {counts.value.toWash} da lavare
      </button>
    {/if}
    <button class="icon-btn" aria-label="Menu" onclick={() => (menuOpen = true)}><Icon name="more" /></button>
  </div>
</header>

{#if menuOpen}
  <Sheet title="Menu" onclose={() => (menuOpen = false)}>
    <div class="list">
      {#each MENU as m (m.page)}
        <button class="row" onclick={() => go(m.page)}>
          <Icon name={m.icon} />
          <span class="grow">{m.label}</span>
          <Icon name="chevron" size={18} />
        </button>
      {/each}
    </div>
  </Sheet>
{/if}

<style>
  .topbar {
    flex: none;
    height: calc(var(--topbar-h) + var(--safe-top));
    padding: var(--safe-top) calc(4px + var(--safe-right)) 0 calc(20px + var(--safe-left));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: var(--bg);
  }
  /* Il nome dell'app in maiuscolo con le lettere spaziate e una lineetta sotto (SPEC.md, sezione 7). */
  .title {
    min-width: 0;
    margin: 0;
    font-family: var(--font-serif);
    font-size: calc(1.125rem * var(--display-scale));
    font-weight: var(--display-weight);
    letter-spacing: 0.36em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title::after {
    content: '';
    display: block;
    width: 26px;
    height: 1px;
    margin-top: 5px;
    background: var(--accent);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .pill {
    border: 0;
    min-height: 36px;
    cursor: pointer;
  }
  .pill,
  .badge {
    font-size: 0.8125rem;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
  }
  .badge {
    border: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    background: var(--primary);
    color: var(--on-primary);
    font-weight: 600;
    cursor: pointer;
  }
</style>
