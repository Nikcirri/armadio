<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { registerOverlay } from '../state/ui.svelte';
  import Icon from './Icon.svelte';

  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

  onMount(() => registerOverlay(() => onclose()));
</script>

<section class="page" aria-label={title}>
  <header>
    <button class="icon-btn" aria-label="Indietro" onclick={onclose}><Icon name="back" /></button>
    <h1>{title}</h1>
  </header>
  <div class="content">{@render children()}</div>
</section>

<style>
  .page {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    z-index: 5;
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
    margin: 0;
    font-size: 1.25rem;
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
