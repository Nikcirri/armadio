<script lang="ts">
  import { onMount } from 'svelte';
  import { unlockWithDevice } from '../appLock';
  import { lock } from '../state/lock.svelte';

  /** Schermata di blocco: copre tutta l'app finché non ti sblocchi con impronta o PIN. */
  let failed = $state(false);

  async function unlock() {
    failed = false;
    const ok = await unlockWithDevice().catch(() => false);
    if (ok) lock.unlocked = true;
    else failed = true;
  }

  onMount(() => {
    void unlock();
  });
</script>

<div class="lock" role="dialog" aria-modal="true" aria-label="App bloccata">
  <div class="box">
    <div class="icon" aria-hidden="true">🔒</div>
    <h1>Armadio è bloccato</h1>
    <p>Usa l’impronta, il volto o il PIN del telefono.</p>
    <button class="btn btn-primary btn-block" onclick={unlock}>Sblocca</button>
    {#if failed}<p class="note">Sblocco non riuscito o annullato: tocca “Sblocca” per riprovare.</p>{/if}
  </div>
</div>

<style>
  .lock {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg);
  }
  .box {
    width: min(100%, 360px);
    text-align: center;
  }
  .icon {
    font-size: 3rem;
  }
  h1 {
    margin: 8px 0;
    font-size: 1.6rem;
  }
  p {
    color: var(--text-muted);
    line-height: 1.5;
  }
</style>
