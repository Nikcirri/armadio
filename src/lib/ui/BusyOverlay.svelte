<script lang="ts">
  import { busy } from '../state/ui.svelte';

  const percent = $derived(busy.total > 0 ? Math.round((busy.done / busy.total) * 100) : null);
</script>

{#if busy.message}
  <div class="overlay" role="status" aria-live="polite">
    <div class="box">
      <div class="spinner" aria-hidden="true"></div>
      <p>{busy.message}</p>
      {#if percent !== null}
        <div class="bar"><div style:width="{percent}%"></div></div>
        <p class="count">{busy.done} di {busy.total}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.45);
    display: grid;
    place-items: center;
    z-index: 80;
  }
  .box {
    width: min(320px, calc(100% - 48px));
    background: var(--surface);
    border-radius: 20px;
    padding: 24px;
    text-align: center;
  }
  p {
    margin: 12px 0 0;
  }
  .count {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .spinner {
    width: 36px;
    height: 36px;
    margin: 0 auto;
    border-radius: 50%;
    border: 3px solid var(--surface-2);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    margin-top: 14px;
    overflow: hidden;
  }
  .bar > div {
    height: 100%;
    background: var(--accent);
    transition: width 120ms linear;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
