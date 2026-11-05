<script lang="ts">
  import { db } from '../../lib/db';
  import { countData, deleteDemoData, hasDemoData, wipeEverything } from '../../lib/db/repo';
  import { exportAndShare, prepareRestore, type PreparedRestore } from '../../lib/backup/service';
  import { loadDemoData } from '../../lib/demo';
  import { formatDateIt } from '../../lib/logic/util';
  import { live } from '../../lib/state/live.svelte';
  import { resetNavigation } from '../../lib/state/nav.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { confirmDialog, showToast, withBusy } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import { tapFeedback } from '../../lib/platform';
  import { pickFile } from '../../lib/ui/pickFile';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import RestoreSheet from '../../lib/ui/RestoreSheet.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const backup = $derived(settings.value.backup);
  const demo = live(() => hasDemoData(db), false);
  const counts = live(() => countData(db), { items: 0, outfits: 0, photos: 0, trips: 0, wishlist: 0, diary: 0 });
  // $state.raw: i dati del backup vanno nel database così come sono (niente proxy reattivi).
  let restoring = $state.raw<PreparedRestore | null>(null);

  async function doExport() {
    try {
      const saved = await withBusy('Preparo il backup…', (progress) =>
        exportAndShare((p) => progress(p.done, p.total)),
      );
      void tapFeedback();
      showToast(`Backup salvato in ${saved.placeLabel}`, { duration: 4500 });
    } catch (e) {
      reportError(e, 'Il backup non è riuscito. Riprova; se succede ancora controlla lo spazio libero.');
    }
  }

  async function doRestore() {
    const file = await pickFile();
    if (!file) return;
    try {
      restoring = await withBusy('Leggo il backup…', () => prepareRestore(file));
    } catch (e) {
      reportError(e);
    }
  }

  async function doLoadDemo() {
    try {
      await withBusy('Preparo l’esempio…', () => loadDemoData());
      showToast('Esempio caricato: 8 capi, 2 outfit e 1 viaggio');
    } catch (e) {
      reportError(e);
    }
  }

  async function doDeleteDemo() {
    const ok = await confirmDialog({
      title: 'Eliminare i dati di esempio?',
      message: 'Vengono eliminati gli 8 capi, gli outfit e il viaggio di esempio. I tuoi dati restano.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      const n = await deleteDemoData(db);
      showToast(n > 0 ? 'Esempio eliminato' : 'Non c’era nessun esempio');
    } catch (e) {
      reportError(e);
    }
  }

  async function doWipe() {
    const ok = await confirmDialog({
      title: 'Svuotare tutto?',
      message:
        'Vengono cancellati per sempre capi, foto, outfit, viaggi e impostazioni. L’app ripartirà dal primo avvio.\nSe non hai un backup, non potrai recuperarli.',
      confirmLabel: 'Svuota tutto',
      danger: true,
      requireText: 'SVUOTA',
    });
    if (!ok) return;
    try {
      await withBusy('Cancello i dati…', () => wipeEverything(db));
      resetNavigation();
      showToast('Tutti i dati sono stati cancellati');
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Page title="Backup e dati" {onclose}>
  <div class="card status">
    <div>
      <span class="label">Ultimo backup</span>
      <strong>{backup?.lastBackupDate ? formatDateIt(backup.lastBackupDate) : 'mai'}</strong>
    </div>
    <div>
      <span class="label">Modifiche non salvate</span>
      <strong>{backup?.changesSinceBackup ?? 0}</strong>
    </div>
    <div>
      <span class="label">Nell’app ora</span>
      <strong>{counts.value.items} capi · {counts.value.photos} foto</strong>
    </div>
  </div>

  <p class="warning">
    I dati sono solo su questo telefono. Se disinstalli l’app o perdi il telefono, il backup è l’unica copia: salvalo su
    Drive o mandalo a te stesso su WhatsApp.
  </p>

  <h2 class="section-title">Backup</h2>
  <div class="list">
    <button class="row" onclick={doExport}>
      <Icon name="upload" />
      <span class="grow">Esporta backup<span class="sub">Crea un file .zip con dati e foto e scegli dove salvarlo</span></span>
    </button>
    <button class="row" onclick={doRestore}>
      <Icon name="download" />
      <span class="grow">Ripristina da un backup<span class="sub">Scegli un file .zip creato da Armadio</span></span>
    </button>
  </div>

  <h2 class="section-title">Esempio</h2>
  <div class="list">
    {#if demo.value}
      <button class="row" onclick={doDeleteDemo}>
        <Icon name="trash" />
        <span class="grow">Elimina dati di esempio<span class="sub">Toglie solo i capi, gli outfit e il viaggio di prova</span></span>
      </button>
    {:else}
      <button class="row" onclick={doLoadDemo}>
        <Icon name="sparkles" />
        <span class="grow">Carica esempio<span class="sub">8 capi, 2 outfit e 1 viaggio per provare l’app</span></span>
      </button>
    {/if}
  </div>

  <h2 class="section-title">Zona pericolosa</h2>
  <button class="btn btn-danger btn-block" onclick={doWipe}>Svuota tutto</button>
</Page>

{#if restoring}
  <RestoreSheet prepared={restoring} onclose={() => (restoring = null)} />
{/if}

<style>
  .status {
    display: grid;
    gap: 12px;
    margin: 8px 0 12px;
  }
  .status > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .label {
    color: var(--text-muted);
  }
  .row :global(svg) {
    flex: none;
    color: var(--accent);
  }
</style>
