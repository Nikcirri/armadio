<script lang="ts">
  import { APP_VERSION, isNative } from '../../lib/platform';
  import Page from '../../lib/ui/Page.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { RELEASES_PAGE, isNewer } from '../../lib/logic/updates';
  import { formatDateIt } from '../../lib/logic/util';
  import { checkForUpdates, type UpdateResult } from '../../lib/updates';

  let { onclose }: { onclose: () => void } = $props();

  let checking = $state(false);
  let result = $state<UpdateResult | null>(null);

  const saved = $derived(settings.value.updates);
  // La versione nuova trovata (adesso o nell'ultimo controllo automatico).
  const available = $derived.by(() => {
    if (result?.kind === 'available') return { version: result.release.version, url: result.release.apkUrl ?? result.release.pageUrl, notes: result.release.notes };
    if (saved?.latestVersion && isNewer(saved.latestVersion, APP_VERSION))
      return { version: saved.latestVersion, url: saved.apkUrl ?? saved.pageUrl ?? RELEASES_PAGE, notes: [] as string[] };
    return null;
  });
  const lastCheckText = $derived.by(() => {
    if (!saved?.lastCheck) return null;
    const d = new Date(saved.lastCheck);
    return `${formatDateIt(saved.lastCheck)} alle ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  });

  async function check() {
    if (checking) return;
    checking = true;
    try {
      result = await checkForUpdates();
    } finally {
      checking = false;
    }
  }
</script>

<Page title="Informazioni" {onclose}>
  <div class="card hero">
    <h2>Armadio</h2>
    <p>Versione {APP_VERSION}</p>
  </div>

  <h2 class="section-title">Guida rapida</h2>
  <div class="card text">
    <p><strong>I tuoi dati restano sul telefono.</strong> L’app funziona senza internet e non ha account.</p>
    <p><strong>Fai spesso un backup</strong> da Altro → Backup e dati e salvalo su Drive: è l’unica copia se cambi o perdi il telefono.</p>
    <p><strong>Il tasto Indietro</strong> chiude prima i fogli aperti, poi torna alla sezione precedente.</p>
    <p><strong>Armadio</strong>: i tuoi capi con foto, filtri, lavanderia e cambio stagione. Tieni premuto un capo per selezionarne più di uno.</p>
    <p><strong>Intimo</strong>: nella scheda di un capo, “Intimo da mettere sotto” collega per esempio il reggiseno bianco alla maglietta bianca. L’app te lo ricorda negli outfit, in “Cosa metto?” e nella valigia.</p>
    <p><strong>Armocromia</strong>: in Altro fai un selfie con la luce del giorno. Trovo il viso, misuro pelle, capelli e occhi e ti dico la tua stagione, i colori che ti valorizzano e quelli da evitare vicino al viso. In “Cosa metto?” → Opzioni scegli una palette (o “La mia stagione”) per avere abbinamenti in quei colori.</p>
    <p><strong>Outfit</strong>: crea i look, segnali come indossati e la sera usa “Fine giornata” per decidere cosa lavare. Nel diario salvi i ricordi.</p>
    <p><strong>Cosa metto?</strong>: scegli il clima e l’app ti propone un abbinamento. Con il lucchetto tieni fermo un capo.</p>
    <p><strong>Agenda</strong>: pianifica i giorni e prepara la valigia dei viaggi.</p>
    <p><strong>Altro</strong>: wishlist, taglie, decluttering, statistiche, liste e impostazioni.</p>
  </div>

  <h2 class="section-title">Aggiornamenti</h2>
  {#if isNative()}
    <div class="card text">
      {#if available}
        <p class="update-title"><strong>È disponibile la versione {available.version}</strong></p>
        {#if available.notes.length > 0}
          <ul class="news" aria-label="Novità">
            {#each available.notes as line, i (i)}
              <li>{line}</li>
            {/each}
          </ul>
        {/if}
        <a class="btn btn-primary btn-block" href={available.url} target="_blank" rel="noopener">Scarica l’aggiornamento</a>
        <p class="note">
          Al termine del download apri il file e tocca <strong>Aggiorna</strong>. I tuoi dati restano. Se il telefono lo chiede,
          consenti al browser di installare app.
        </p>
      {:else if result?.kind === 'current'}
        <p class="status ok" role="status">Hai già l’ultima versione.</p>
      {:else if result?.kind === 'offline'}
        <p class="status" role="alert">Non c’è connessione a internet. Riprova quando sei online.</p>
      {:else if result?.kind === 'error'}
        <p class="status" role="alert">Non riesco a raggiungere GitHub in questo momento. Riprova più tardi.</p>
      {:else}
        <p>Controlla se è uscita una versione nuova (serve internet solo per questo).</p>
      {/if}
      <button class="btn btn-block" class:spaced={available !== null} onclick={check} disabled={checking} aria-busy={checking}>
        {checking ? 'Controllo in corso…' : 'Controlla aggiornamenti'}
      </button>
      {#if lastCheckText}
        <p class="note">Ultimo controllo: {lastCheckText}</p>
      {/if}
    </div>
  {:else}
    <div class="card text">
      <p>Questa è la versione web: si aggiorna da sola quando la riapri con internet.</p>
      <a class="btn btn-block" href={RELEASES_PAGE} target="_blank" rel="noopener">Scarica l’app per Android</a>
    </div>
  {/if}
</Page>

<style>
  .hero {
    text-align: center;
    margin-top: 8px;
  }
  .hero h2 {
    margin: 0;
    font-size: 1.75rem;
  }
  .hero p {
    margin: 4px 0 0;
    color: var(--text-muted);
  }
  .text p {
    margin: 0 0 12px;
    line-height: 1.5;
  }
  .text a {
    text-decoration: none;
  }
  .update-title {
    font-size: 1.0625rem;
  }
  .news {
    margin: 0 0 12px;
    padding-left: 20px;
    line-height: 1.5;
  }
  .status {
    font-weight: 600;
  }
  .status.ok {
    color: var(--accent);
  }
  .spaced {
    margin-top: 10px;
  }
</style>
