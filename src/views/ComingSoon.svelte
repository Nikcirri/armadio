<script lang="ts">
  import type { TabInfo } from '../lib/logic/navigation';
  import TabIcon from '../lib/ui/TabIcon.svelte';

  let { tab }: { tab: TabInfo } = $props();
</script>

<section class="empty" aria-labelledby="title-{tab.id}">
  <div class="badge"><TabIcon tab={tab.id} size={36} /></div>
  <h1 id="title-{tab.id}">{tab.label}</h1>
  <p>{tab.description}</p>
  <p class="phase">Questa sezione arriva nella Fase {tab.phase}.</p>
</section>

<style>
  .empty {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px 28px;
    gap: 8px;
  }
  .badge {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--accent);
    margin-bottom: 12px;
  }
  h1 {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 1.75rem;
    margin: 0;
  }
  p {
    margin: 0;
    max-width: 30ch;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .phase {
    margin-top: 12px;
    font-size: 0.875rem;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text);
  }
</style>
