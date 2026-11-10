<script lang="ts">
  import { BANNER_NOTES } from '../logic/updates';
  import { bannerVisible, dismissUpdate, installUpdate, update } from '../state/update.svelte';

  // Avviso di aggiornamento sotto la barra in alto (SPEC.md, sezione 11).
  let el = $state<HTMLElement>();
  const visible = $derived(bannerVisible());

  // Le pagine (Page.svelte) si aprono sotto l'avviso: la sua altezza va in --banner-h.
  $effect(() => {
    const node = el;
    if (!node) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--banner-h', `${node.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--banner-h');
    };
  });
</script>

{#if visible && update.available}
  {@const release = update.available}
  <section class="banner" bind:this={el} aria-label="Aggiornamento dell’app">
    {#if update.phase === 'download'}
      <p class="title" role="status">Scarico la versione {release.version}…</p>
      <div
        class="progress"
        role="progressbar"
        aria-label="Scaricamento dell’aggiornamento"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={update.percent}
      >
        <div style:width="{update.percent}%"></div>
      </div>
      <p class="sub"><span class="pct">{update.percent}%</span> · Puoi continuare a usare l’app intanto.</p>
    {:else if update.phase === 'install'}
      <p class="title" role="status">Quasi fatto</p>
      <p class="sub">Nella finestra di Android tocca <b>Aggiorna</b> (o <b>Installa</b>), poi <b>Apri</b>. I tuoi dati restano.</p>
      <div class="actions">
        <button class="btn btn-ghost" onclick={() => installUpdate()}>Riapri l’installazione</button>
      </div>
    {:else if update.phase === 'permission'}
      <p class="title" role="status">Dai il permesso e torna qui</p>
      <p class="sub">Attiva <b>Consenti da questa origine</b>, poi torna indietro: l’aggiornamento riparte da solo.</p>
    {:else}
      <p class="title" role="status">Nuova versione {release.version}</p>
      <p class="sub">Si installa sopra quella attuale: i tuoi dati restano.</p>
      {#if release.notes.length}
        <ul aria-label="Novità">
          {#each release.notes.slice(0, BANNER_NOTES) as note, i (i)}<li><span>{note}</span></li>{/each}
        </ul>
      {/if}
      <div class="actions">
        <button class="btn btn-ghost" onclick={dismissUpdate}>Dopo</button>
        <button class="btn btn-primary" onclick={() => installUpdate()}>Aggiorna</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .banner {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px calc(16px + var(--safe-right)) 12px calc(16px + var(--safe-left));
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    border-left: 4px solid var(--accent);
  }
  .title {
    margin: 0;
    font-weight: 700;
    font-size: 1rem;
  }
  .sub {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .sub b {
    color: var(--text);
  }
  .pct {
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  ul {
    margin: 2px 0 0;
    padding-left: 18px;
    font-size: 0.8125rem;
    line-height: 1.4;
  }
  li span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  li::marker {
    color: var(--accent);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .progress {
    height: 8px;
    border-radius: 4px;
    background: var(--surface);
    overflow: hidden;
  }
  .progress div {
    height: 100%;
    background: var(--accent);
    transition: width 200ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .progress div {
      transition: none;
    }
  }
</style>
