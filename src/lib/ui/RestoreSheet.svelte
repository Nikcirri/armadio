<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { runRestore, type PreparedRestore, type RestoreMode } from '../backup/service';
  import { shareBackupFile } from '../backup/device';
  import { confirmDialog, showToast, withBusy } from '../state/ui.svelte';
  import { reportError } from '../errors';
  import { formatDateIt } from '../logic/util';

  let {
    prepared,
    allowMerge = true,
    onclose,
    ondone,
  }: {
    prepared: PreparedRestore;
    allowMerge?: boolean;
    onclose: () => void;
    ondone?: (mode: RestoreMode) => void;
  } = $props();

  const s = $derived(prepared.summary);

  async function restore(mode: RestoreMode) {
    if (mode === 'replace' && allowMerge) {
      const ok = await confirmDialog({
        title: 'Sostituire tutto?',
        message:
          'I dati attuali verranno sostituiti da quelli del backup.\nPrima salvo in automatico una copia dei dati attuali in Documenti/Armadio.',
        confirmLabel: 'Sostituisci',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const res = await withBusy('Ripristino in corso…', (progress) =>
        runRestore(prepared, mode, (p) => progress(p.done, p.total)),
      );
      if (res.safetyCopy?.blob) await shareBackupFile(res.safetyCopy);
      showToast(
        res.safetyCopy
          ? `Ripristino completato. Copia dei dati precedenti in ${res.safetyCopy.placeLabel}.`
          : 'Ripristino completato.',
        { duration: 4500 },
      );
      onclose();
      ondone?.(mode);
    } catch (e) {
      reportError(e, 'Il ripristino non è riuscito. I tuoi dati attuali non sono stati persi.');
    }
  }
</script>

<Sheet title="Ripristina backup" {onclose}>
  <p class="lead">
    Backup del {s.exportedAt ? formatDateIt(s.exportedAt) : 'giorno sconosciuto'}
    <span class="muted">(app versione {s.appVersion})</span>
  </p>
  <ul class="counts">
    <li><strong>{s.items}</strong> capi</li>
    <li><strong>{s.outfits}</strong> outfit</li>
    <li><strong>{s.photos}</strong> foto</li>
    <li><strong>{s.trips}</strong> viaggi</li>
    <li><strong>{s.diary}</strong> ricordi</li>
    <li><strong>{s.wishlist}</strong> desideri</li>
  </ul>

  <div class="choices">
    <button class="btn btn-primary btn-block" onclick={() => restore('replace')}>Sostituisci tutto</button>
    <p class="note">
      L’app diventa uguale al backup.{#if allowMerge} Prima viene salvata una copia dei dati attuali.{/if}
    </p>
    {#if allowMerge}
      <button class="btn btn-block" onclick={() => restore('merge')}>Unisci ai dati attuali</button>
      <p class="note">
        Aggiunge ciò che manca. Se un capo è in entrambi, tiene la versione modificata più di recente.
      </p>
    {/if}
  </div>
</Sheet>

<style>
  .lead {
    margin: 4px 0 12px;
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .counts {
    list-style: none;
    padding: 0;
    margin: 0 0 20px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .counts li {
    background: var(--surface-2);
    border-radius: 12px;
    padding: 10px;
    text-align: center;
    font-size: 0.875rem;
  }
  .counts strong {
    display: block;
    font-size: 1.25rem;
    font-family: var(--font-serif);
  }
  .choices .note {
    margin: 6px 4px 16px;
  }
</style>
