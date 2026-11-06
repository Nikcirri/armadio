<script lang="ts">
  import type { Share } from '../../lib/logic/stats';

  /**
   * Barre orizzontali ordinate dalla più grande, di un solo colore (si confrontano lungo la
   * stessa linea di base). Il valore è scritto accanto: il colore non porta da solo il significato.
   */
  let {
    rows,
    label,
    swatch,
    format = (r) => `${r.count}`,
    max = 8,
  }: {
    rows: readonly Share[];
    label: string;
    /** Colore del campione accanto al nome (solo per la distribuzione per colore). */
    swatch?: (key: string) => string | null;
    format?: (r: Share) => string;
    max?: number;
  } = $props();

  const shown = $derived(rows.slice(0, max));
  const rest = $derived(rows.slice(max).reduce((n, r) => n + r.count, 0));
  const top = $derived(Math.max(1, ...shown.map((r) => r.count)));
</script>

<ul class="bars" aria-label={label}>
  {#each shown as r (r.key)}
    {@const sw = swatch?.(r.key) ?? null}
    <li title="{r.label}: {format(r)} ({r.percent}%)">
      <span class="name">
        {#if sw}<span class="swatch" class:pattern={sw === 'pattern'} style:background={sw === 'pattern' ? undefined : sw}></span>{/if}
        {r.label}
      </span>
      <span class="track" aria-hidden="true"><span class="bar" style:width="{(r.count / top) * 100}%"></span></span>
      <span class="value">{format(r)}</span>
    </li>
  {/each}
</ul>
{#if rest > 0}<p class="more">e altri {rest}</p>{/if}

<style>
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: grid;
    grid-template-columns: minmax(90px, 38%) 1fr auto;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .swatch {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.2);
  }
  .swatch.pattern {
    background: conic-gradient(#c62f2f, #e9c93b, #3f8f4f, #5b7fae, #7a4a9e, #c62f2f);
  }
  .track {
    height: 10px;
  }
  .bar {
    display: block;
    height: 100%;
    min-width: 4px;
    border-radius: 0 4px 4px 0;
    background: var(--accent);
  }
  .value {
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    min-width: 2ch;
    text-align: right;
  }
  .more {
    margin: 6px 0 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
</style>
