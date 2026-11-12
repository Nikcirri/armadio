<script lang="ts">
  import type { ColorId } from '../db/types';
  import { GARMENT_COLORS, swatchCss } from '../logic/colors';

  let {
    value,
    onchange,
    detected = [],
  }: { value: ColorId[]; onchange: (colors: ColorId[]) => void; detected?: ColorId[] } = $props();

  function toggle(id: ColorId) {
    if (value.includes(id)) onchange(value.filter((c) => c !== id));
    else onchange([...value, id]);
  }
</script>

<div class="chips" role="group" aria-label="Colori">
  {#each GARMENT_COLORS as c (c.id)}
    {@const index = value.indexOf(c.id)}
    <button
      class="chip"
      class:on={index >= 0}
      aria-pressed={index >= 0}
      onclick={() => toggle(c.id)}
      title={c.label}
    >
      <span class="dot" style:background={swatchCss(c.id)}></span>
      <span class="label">
        {c.label}{#if index === 0}<span class="main"> · principale</span>{/if}
        {#if detected.includes(c.id) && index < 0}<span class="hint"> · rilevato</span>{/if}
      </span>
    </button>
  {/each}
</div>
<p class="note">Il primo colore scelto è il principale. Tocca di nuovo per togliere.</p>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .chip.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    font-weight: 600;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.15);
    flex: none;
  }
  .main,
  .hint {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
</style>
