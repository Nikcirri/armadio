<script lang="ts">
  import { APP_VERSION } from '../../lib/platform';
  import Page from '../../lib/ui/Page.svelte';

  let { onclose }: { onclose: () => void } = $props();
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
    <p><strong>Le sezioni</strong> Armadio, Outfit, Cosa metto? e Agenda arrivano con i prossimi aggiornamenti.</p>
  </div>

  <h2 class="section-title">Aggiornamenti</h2>
  <div class="card text">
    <p>Le nuove versioni sono qui (serve internet solo per scaricarle):</p>
    <a class="btn btn-block" href="https://github.com/Nikcirri/armadio/releases/latest" target="_blank" rel="noopener">
      Apri la pagina degli aggiornamenti
    </a>
    <p class="note">Installa la nuova versione sopra quella vecchia: i dati restano.</p>
  </div>
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
</style>
