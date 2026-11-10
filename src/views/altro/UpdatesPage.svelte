<script lang="ts">
  import { formatDateIt } from '../../lib/logic/util';
  import { canDownloadInApp, normalizeUpdateState } from '../../lib/logic/updates';
  import { APP_VERSION, isNative } from '../../lib/platform';
  import { settings } from '../../lib/state/settings.svelte';
  import { checkUpdateNow, downloadFromGitHub, update, updateFromApp } from '../../lib/state/update.svelte';
  import Page from '../../lib/ui/Page.svelte';

  // Aggiornamenti (SPEC.md, sezione 11): versione, controllo, "Aggiorna dall'app" e "Scarica da GitHub".
  let { onclose }: { onclose: () => void } = $props();

  const native = isNative();
  const saved = $derived(normalizeUpdateState(settings.value.updates));
  const lastCheckText = $derived.by(() => {
    if (!saved.lastCheck) return null;
    const d = new Date(saved.lastCheck);
    return `${formatDateIt(saved.lastCheck)} alle ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  });
  const release = $derived(update.available);
  const busy = $derived(update.checking || update.phase === 'download');
</script>

<Page title="Aggiornamenti" {onclose}>
  <div class="card hero">
    <p class="label">Versione installata</p>
    <p class="version">{APP_VERSION}</p>
    {#if native && lastCheckText}<p class="note">Ultimo controllo: {lastCheckText}</p>{/if}
  </div>

  {#if native}
    <div class="card text" aria-live="polite">
      {#if release}
        <p class="new"><strong>È disponibile la versione {release.version}</strong></p>
        {#if release.notes.length}
          <ul class="news" aria-label="Novità">
            {#each release.notes as line, i (i)}<li>{line}</li>{/each}
          </ul>
        {/if}
        {#if update.phase === 'download'}
          <p class="status" role="status">Scarico… {update.percent}%</p>
          <div class="progress" role="progressbar" aria-label="Scaricamento" aria-valuemin="0" aria-valuemax="100" aria-valuenow={update.percent}>
            <div style:width="{update.percent}%"></div>
          </div>
        {:else if update.phase === 'install'}
          <p class="status" role="status">Nella finestra di Android tocca <b>Aggiorna</b> (o <b>Installa</b>), poi <b>Apri</b>.</p>
        {:else if update.phase === 'permission'}
          <p class="status" role="status">Attiva <b>Consenti da questa origine</b> e torna indietro: riparto da solo.</p>
        {:else if !canDownloadInApp(release)}
          <p class="status">Questa versione non si può scaricare dall’app: usa «Scarica da GitHub».</p>
        {/if}
      {:else if update.checking}
        <p class="status" role="status">Controllo in corso…</p>
      {:else if update.lastResult === 'current'}
        <p class="status ok" role="status">Hai già l’ultima versione.</p>
      {:else if update.lastResult === 'offline'}
        <p class="status" role="alert">Non c’è connessione a internet. Riprova quando sei online.</p>
      {:else if update.lastResult === 'error'}
        <p class="status" role="alert">Non riesco a raggiungere GitHub in questo momento. Riprova più tardi.</p>
      {:else}
        <p>Controlla se è uscita una versione nuova (serve internet solo per questo).</p>
      {/if}
      <button class="btn btn-block" onclick={() => checkUpdateNow()} disabled={busy} aria-busy={update.checking}>
        {update.checking ? 'Controllo in corso…' : 'Controlla aggiornamenti'}
      </button>
    </div>

    <div class="actions">
      <button class="btn btn-primary btn-block" onclick={() => updateFromApp()} disabled={busy}>Aggiorna dall’app</button>
      <button class="btn btn-block" onclick={downloadFromGitHub}>Scarica da GitHub</button>
    </div>
    <p class="note">
      <strong>Aggiorna dall’app</strong> scarica la versione nuova dentro l’app e apre l’installazione di Android: si installa sopra e i
      tuoi dati restano. Il file sta nella memoria temporanea dell’app, non in Download, e si cancella da solo dopo l’aggiornamento; per
      liberare spazio prima basta «Svuota cache» nelle impostazioni di Android.
    </p>
    <p class="note"><strong>Scarica da GitHub</strong> apre nel browser la pagina dell’ultima versione, da cui scaricare il file .apk.</p>
  {:else}
    <div class="card text">
      <p>Questa è la versione web: si aggiorna da sola quando la riapri con internet.</p>
      <p>Per l’app Android scarica il file .apk dalla pagina di GitHub.</p>
    </div>
    <div class="actions">
      <button class="btn btn-block" onclick={downloadFromGitHub}>Scarica da GitHub</button>
    </div>
  {/if}
</Page>

<style>
  .hero {
    text-align: center;
    margin-top: 8px;
  }
  .label {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .version {
    margin: 2px 0 0;
    font-family: var(--font-serif);
    font-size: 2rem;
  }
  .hero .note {
    margin: 6px 0 0;
  }
  .text {
    margin-top: 12px;
  }
  .text p {
    margin: 0 0 12px;
    line-height: 1.5;
  }
  .new {
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
  .progress {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
    margin: -4px 0 12px;
  }
  .progress div {
    height: 100%;
    background: var(--accent);
    transition: width 200ms ease;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  }
  @media (prefers-reduced-motion: reduce) {
    .progress div {
      transition: none;
    }
  }
</style>
