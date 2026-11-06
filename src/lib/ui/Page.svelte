<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { registerOverlay } from '../state/ui.svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    onclose,
    children,
    actions,
  }: { title: string; onclose: () => void; children: Snippet; actions?: Snippet } = $props();

  onMount(() => registerOverlay(() => onclose()));
</script>

<section class="page" aria-label={title}>
  <header>
    <button class="icon-btn" aria-label="Indietro" onclick={onclose}><Icon name="back" /></button>
    <h1>{title}</h1>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </header>
  <div class="content">{@render children()}</div>
</section>

<style>
  .page {
    /* Copre l'area tra la barra in alto e quella in basso, anche se la lista sotto è scorsa. */
    position: fixed;
    left: 0;
    right: 0;
    top: calc(var(--topbar-h) + var(--safe-top));
    bottom: calc(var(--navbar-h) + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    background: var(--surface);
    z-index: 25;
    animation: slide 180ms ease-out;
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 1.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    flex: none;
    display: flex;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px 32px;
  }
  @keyframes slide {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }
</style>
