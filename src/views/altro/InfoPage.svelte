<script lang="ts">
  import { APP_VERSION } from '../../lib/platform';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';

  let { onclose, onupdates }: { onclose: () => void; onupdates: () => void } = $props();
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
    <p><strong>Cosa metto?</strong>: scegli il clima e l’app ti propone un abbinamento. Con il lucchetto tieni fermo un capo. Nelle Opzioni puoi scegliere più occasioni: “Una qualsiasi” per un look adatto ad almeno una, “Tutte insieme” per un look che vada bene per tutte (es. dall’ufficio all’aperitivo).</p>
    <p><strong>Agenda</strong>: pianifica i giorni e prepara la valigia dei viaggi.</p>
    <p><strong>Altro</strong>: wishlist, taglie, decluttering, statistiche, liste e impostazioni.</p>
    <p><strong>Aggiornamenti</strong>: quando esce una versione nuova compare un avviso in alto. Tocca <strong>Aggiorna</strong>: l’app la scarica e apre l’installazione di Android; i tuoi dati restano.</p>
  </div>

  <h2 class="section-title">Aggiornamenti</h2>
  <div class="list">
    <button class="row" onclick={onupdates}>
      <span class="grow">Aggiornamenti<span class="sub">Controlla e installa le versioni nuove</span></span>
      <Icon name="chevron" size={18} />
    </button>
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
</style>
