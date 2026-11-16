<script lang="ts">
  import type { FontId, PaletteId, ThemeMode } from '../db/types';
  import { FONTS, PALETTE_FAMILIES, THEME_MODES, familyOf, paletteInfo } from '../logic/theme';

  /** Aspetto (SPEC.md, sezione 7): palette, caratteri e chiaro/scuro, con anteprima subito applicata. */
  let {
    palette,
    mode,
    font,
    onchange,
  }: {
    palette: PaletteId;
    mode: ThemeMode;
    font: FontId;
    onchange: (palette: PaletteId, mode: ThemeMode, font: FontId) => void;
  } = $props();

  const current = $derived(paletteInfo(palette));
  const family = $derived(familyOf(current.id));

  /** Cambiando famiglia si tiene la stessa posizione della tonalità (chiara, media, profonda). */
  function pickFamily(id: (typeof PALETTE_FAMILIES)[number]['id']) {
    const target = PALETTE_FAMILIES.find((f) => f.id === id)!;
    const index = Math.max(0, family.palettes.indexOf(current.id));
    onchange(target.palettes[index] ?? target.palettes[0]!, mode, font);
  }
</script>

<p class="eyebrow label" id="theme-colors">Colori</p>
<div class="families" role="radiogroup" aria-labelledby="theme-colors">
  {#each PALETTE_FAMILIES as f (f.id)}
    <button class="family" role="radio" aria-checked={family.id === f.id} onclick={() => pickFamily(f.id)}>
      <span class="stripes" aria-hidden="true">
        {#each f.palettes as id (id)}<span style:background={paletteInfo(id).swatch.accent}></span>{/each}
      </span>
      <span class="name">{f.label}</span>
    </button>
  {/each}
</div>

<p class="eyebrow label sub" id="theme-shades">Tonalità</p>
<div class="palettes" role="radiogroup" aria-labelledby="theme-shades">
  {#each family.palettes.map((id) => paletteInfo(id)) as p (p.id)}
    <button class="swatch" role="radio" aria-checked={current.id === p.id} onclick={() => onchange(p.id, mode, font)}>
      <span class="preview" style:background={p.swatch.light} aria-hidden="true">
        <span class="tile" style:background={p.swatch.tile}></span>
        <span class="dot" style:background={p.swatch.accent}></span>
        <span class="bar" style:background={p.swatch.strong}></span>
      </span>
      <span class="name">{p.label}</span>
    </button>
  {/each}
</div>

<p class="eyebrow label" id="theme-fonts">Caratteri</p>
<div class="fonts" role="radiogroup" aria-labelledby="theme-fonts">
  {#each FONTS as f (f.id)}
    <button class="font" role="radio" aria-checked={font === f.id} onclick={() => onchange(palette, mode, f.id)}>
      <span class="sample" style:font-family={f.display} aria-hidden="true">Il tuo <em>armadio</em></span>
      <span class="meta" style:font-family={f.text}><strong>{f.label}</strong> · {f.hint}</span>
    </button>
  {/each}
</div>

<p class="eyebrow label" id="theme-mode">Chiaro o scuro</p>
<div class="segmented modes" role="group" aria-labelledby="theme-mode">
  {#each THEME_MODES as m (m.id)}
    <button aria-pressed={mode === m.id} onclick={() => onchange(palette, m.id, font)}>{m.label}</button>
  {/each}
</div>

<style>
  .label {
    margin: 0 2px 10px;
  }
  .label:not(:first-child) {
    margin-top: 20px;
  }
  .label.sub {
    margin-top: 16px;
  }
  .families {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .family {
    min-height: 64px;
    padding: 8px 4px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .family[aria-checked='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .family[aria-checked='true'] .name {
    font-weight: 600;
  }
  .stripes {
    display: flex;
    width: 46px;
    height: 22px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid rgb(0 0 0 / 0.12);
  }
  .stripes > span {
    flex: 1;
  }
  .palettes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .swatch {
    border: 0;
    background: transparent;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .preview {
    position: relative;
    width: 100%;
    max-width: 96px;
    aspect-ratio: 4 / 5;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgb(0 0 0 / 0.12);
    box-shadow: 0 0 0 2px transparent;
  }
  .swatch[aria-checked='true'] .preview {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }
  .tile {
    position: absolute;
    left: 14%;
    top: 14%;
    width: 44%;
    height: 40%;
    border-radius: 6px;
  }
  .dot {
    position: absolute;
    right: 14%;
    top: 18%;
    width: 18%;
    aspect-ratio: 1;
    border-radius: 50%;
  }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 24%;
    border-radius: 8px 8px 0 0;
  }
  .name {
    font-size: 0.8125rem;
  }
  .swatch[aria-checked='true'] .name {
    font-weight: 600;
  }
  .modes button {
    flex: 1 1 auto;
    padding: 0 10px;
    white-space: nowrap;
  }
  .fonts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .font {
    min-height: 64px;
    padding: 10px 16px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    cursor: pointer;
  }
  .font[aria-checked='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .sample {
    font-size: 1.5rem;
    line-height: 1.15;
  }
  .sample em {
    color: var(--accent-2);
  }
  .meta {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .meta strong {
    color: var(--text);
    font-weight: 600;
  }
</style>
