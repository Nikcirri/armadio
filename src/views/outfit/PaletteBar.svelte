<script lang="ts">
  import type { ColorId } from '../../lib/db/types';
  import { colorInfo } from '../../lib/logic/colors';

  /** Barra della palette combinata dell'outfit (colore + nome, non solo il colore). */
  let { colors }: { colors: readonly ColorId[] } = $props();
</script>

{#if colors.length}
  <ul class="palette" aria-label="Colori dell’outfit">
    {#each colors as c (c)}
      {@const info = colorInfo(c)}
      <li><span class="dot" class:pattern={c === 'pattern'} style:background={info.hex}></span>{info.label}</li>
    {/each}
  </ul>
{/if}

<style>
  .palette {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.18);
  }
  .dot.pattern {
    background: conic-gradient(#c62f2f, #e9c93b, #3f8f4f, #5b7fae, #7a4a9e, #c62f2f) !important;
  }
</style>
