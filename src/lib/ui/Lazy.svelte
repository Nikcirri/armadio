<script lang="ts" generics="P extends Record<string, any>">
  import { onMount } from 'svelte';
  import { logError } from '../errors';
  import type { LazyComponent } from '../lazy';
  import { registerOverlay } from '../state/ui.svelte';
  import Page from './Page.svelte';

  /**
   * Mostra un componente caricato a richiesta (SPEC.md, sezione 7). Se è già stato caricato compare
   * subito; altrimenti, se l'attesa supera un attimo, un indicatore. Se il file non arriva (succede solo
   * nella versione web, dopo un aggiornamento) un messaggio con "Ricarica l'app": il browser ricorda
   * gli import falliti, quindi riprovare senza ricaricare non servirebbe.
   * variant "page": come le pagine di Altro (tra le due barre); "full": a tutto schermo.
   */
  let {
    loader,
    props,
    title,
    onclose,
    variant = 'page',
  }: {
    loader: LazyComponent<P>;
    props: P;
    title: string;
    onclose?: () => void;
    variant?: 'page' | 'full';
  } = $props();

  // svelte-ignore state_referenced_locally
  let Loaded = $state.raw(loader.current);
  let failed = $state(false);
  let slow = $state(false);
  let slowTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    if (Loaded) return;
    slowTimer = setTimeout(() => (slow = true), 200);
    loader.load().then(
      (component) => {
        Loaded = component;
      },
      (error: unknown) => {
        logError(error, `Caricamento di «${title}» non riuscito`);
        failed = true;
      },
    );
    return () => clearTimeout(slowTimer);
  });

  // A tutto schermo il tasto Indietro chiude anche l'attesa o l'errore (le pagine lo fanno già con Page).
  $effect(() => {
    if (variant !== 'full' || Loaded || !onclose || !(slow || failed)) return;
    const close = onclose;
    return registerOverlay(() => close());
  });
</script>

{#snippet waiting()}
  <div class="state" role="status" aria-live="polite">
    <div class="spin" aria-hidden="true"></div>
    <p class="visually-hidden">Caricamento di {title}…</p>
  </div>
{/snippet}

{#snippet problem()}
  <div class="state" role="alert">
    <p class="msg">Non riesco ad aprire «{title}».</p>
    <p class="hint">Se l'app è stata appena aggiornata, ricaricala.</p>
    <div class="actions">
      <button class="btn btn-primary" onclick={() => location.reload()}>Ricarica l'app</button>
      {#if variant === 'full' && onclose}
        <button class="btn btn-ghost" onclick={onclose}>Chiudi</button>
      {/if}
    </div>
  </div>
{/snippet}

{#if Loaded}
  <Loaded {...props} />
{:else if failed || slow}
  {#if variant === 'page' && onclose}
    <Page {title} {onclose}>
      {#if failed}{@render problem()}{:else}{@render waiting()}{/if}
    </Page>
  {:else}
    <section class="full" aria-label={title}>
      {#if failed}{@render problem()}{:else}{@render waiting()}{/if}
    </section>
  {/if}
{/if}

<style>
  .full {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    background: var(--surface);
    padding: calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom));
  }
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 8px;
    text-align: center;
  }
  .spin {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 3px solid var(--surface-2);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
  .msg {
    margin: 0;
    font-weight: 600;
  }
  .hint {
    margin: 0 0 8px;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
