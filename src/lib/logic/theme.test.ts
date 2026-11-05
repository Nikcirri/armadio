import { describe, expect, it } from 'vitest';
import { PALETTES, contrastRatio, paletteInfo, resolveMode } from './theme';

describe('tema', () => {
  it('segue il telefono solo in modalità sistema', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('ha 4 palette con accento leggibile (AA) su sfondo chiaro e su nero', () => {
    expect(PALETTES).toHaveLength(4);
    for (const p of PALETTES) {
      expect(contrastRatio(p.swatch.accent, p.swatch.light), `${p.id} chiaro`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.swatch.darkAccent, '#000000'), `${p.id} scuro`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('torna alla prima palette se l’id è sconosciuto', () => {
    expect(paletteInfo('sabbia').label).toBe('Sabbia');
  });
});
