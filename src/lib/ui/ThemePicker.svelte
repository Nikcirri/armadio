<script lang="ts">
  import type { PaletteId, ThemeMode } from '../db/types';
  import { PALETTES, THEME_MODES } from '../logic/theme';

  let {
    palette,
    mode,
    onchange,
  }: { palette: PaletteId; mode: ThemeMode; onchange: (palette: PaletteId, mode: ThemeMode) => void } = $props();
</script>

<div class="palettes" role="radiogroup" aria-label="Palette colori">
  {#each PALETTES as p (p.id)}
    <button
      class="swatch"
      role="radio"
      aria-checked={palette === p.id}
      onclick={() => onchange(p.id, mode)}
    >
      <span class="dot" style:background={p.swatch.light}>
        <span style:background={p.swatch.accent}></span>
      </span>
      <span class="name">{p.label}</span>
    </button>
  {/each}
</div>

<div class="segmented" role="group" aria-label="Chiaro o scuro">
  {#each THEME_MODES as m (m.id)}
    <button aria-pressed={mode === m.id} onclick={() => onchange(palette, m.id)}>{m.label}</button>
  {/each}
</div>

<style>
  .palettes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  .swatch {
    border: 2px solid transparent;
    border-radius: 14px;
    background: var(--surface);
    padding: 10px 4px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .swatch[aria-checked='true'] {
    border-color: var(--accent);
  }
  .dot {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
  }
  .dot > span {
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }
  .name {
    font-size: 0.8125rem;
  }
</style>
