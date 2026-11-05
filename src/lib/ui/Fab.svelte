<script lang="ts" module>
  export interface FabAction {
    label: string;
    hint?: string;
    run: () => void;
  }
</script>

<script lang="ts">
  import { registerOverlay } from '../state/ui.svelte';
  import Icon from './Icon.svelte';

  let { actions, label = 'Aggiungi' }: { actions: FabAction[]; label?: string } = $props();

  let open = $state(false);

  $effect(() => {
    if (!open) return;
    return registerOverlay(() => (open = false));
  });

  function pick(a: FabAction) {
    open = false;
    a.run();
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={() => (open = false)}></div>
  <div class="menu" role="menu">
    {#each actions as a (a.label)}
      <button class="action" role="menuitem" onclick={() => pick(a)}>
        <span>{a.label}</span>
        {#if a.hint}<small>{a.hint}</small>{/if}
      </button>
    {/each}
  </div>
{/if}

<button class="fab" class:open aria-label={open ? 'Chiudi menu' : label} aria-expanded={open} onclick={() => (open = !open)}>
  <Icon name="plus" size={28} />
</button>

<style>
  .fab {
    position: fixed;
    right: calc(16px + var(--safe-right));
    bottom: calc(var(--navbar-h) + var(--safe-bottom) + 16px);
    width: 60px;
    height: 60px;
    border-radius: 20px;
    border: 0;
    background: var(--accent);
    color: var(--accent-contrast);
    display: grid;
    place-items: center;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.22);
    z-index: 21;
    cursor: pointer;
    transition: transform 160ms ease;
  }
  .fab.open {
    transform: rotate(45deg);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.3);
    z-index: 20;
  }
  .menu {
    position: fixed;
    right: calc(16px + var(--safe-right));
    bottom: calc(var(--navbar-h) + var(--safe-bottom) + 88px);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    z-index: 21;
  }
  .action {
    min-height: 52px;
    padding: 8px 18px;
    border: 0;
    border-radius: 16px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-weight: 600;
    cursor: pointer;
    animation: pop 140ms ease-out;
  }
  small {
    font-weight: 400;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
