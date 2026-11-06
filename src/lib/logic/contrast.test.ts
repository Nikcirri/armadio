import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTES, contrastRatio } from './theme';

// Contrasto AA (SPEC.md, sezione 7) per tutte le palette, lette direttamente da app.css.
const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Selettore mancante: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

const common = { light: block(':root {\n  --accent-contrast'), dark: block("[data-mode='dark'] {") };

function palette(id: string, mode: 'light' | 'dark') {
  const own = mode === 'light' ? block(`[data-palette='${id}'] {`) : block(`[data-mode='dark'][data-palette='${id}']`);
  return { ...common[mode], ...own };
}

// [primo piano, sfondo, minimo]: 4.5 per il testo normale, 3 per bordi dei controlli e icone.
const PAIRS: [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-2', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'surface-2', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'surface-2', 4.5],
  ['accent-contrast', 'accent', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'bg', 4.5],
  ['warning-text', 'warning-bg', 4.5],
];

describe('contrasto dei colori (WCAG AA)', () => {
  for (const p of PALETTES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${p.label} ${mode === 'light' ? 'chiaro' : 'scuro'}`, () => {
        const c = palette(p.id, mode);
        for (const [fg, bg, min] of PAIRS) {
          expect(c[fg], `${fg} mancante`).toBeDefined();
          expect(c[bg], `${bg} mancante`).toBeDefined();
          const ratio = contrastRatio(c[fg]!, c[bg]!);
          expect(ratio, `${fg} su ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
        }
      });
    }
  }
});
