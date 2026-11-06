<script lang="ts">
  import type { Semaphore } from '../../lib/logic/outfits';

  /** Semaforo dell'outfit: verde se tutto è disponibile, altrimenti l'elenco dei capi bloccati. */
  let { state, compact = false }: { state: Semaphore; compact?: boolean } = $props();
</script>

{#if state.ok}
  <p class="ok"><span class="light green" aria-hidden="true"></span>Tutto disponibile: puoi indossarlo.</p>
{:else}
  <div class="ko">
    <p class="head">
      <span class="light red" aria-hidden="true"></span>
      {state.blockers.length === 1 ? '1 capo non è disponibile' : `${state.blockers.length} capi non sono disponibili`}
    </p>
    {#if !compact}
      <ul>
        {#each state.blockers as b (b.id)}
          <li><strong>{b.name}</strong> — {b.reason}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .ok,
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .ok {
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, #2e7d32 12%, transparent);
  }
  .ko {
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }
  ul {
    margin: 6px 0 0;
    padding-left: 30px;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .light {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }
  .green {
    background: #2e7d32;
  }
  .red {
    background: var(--danger);
  }
</style>
