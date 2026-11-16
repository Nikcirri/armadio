import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT,
  DEFAULT_PALETTE,
  FONTS,
  PALETTES,
  PALETTE_FAMILIES,
  contrastRatio,
  familyOf,
  fontInfo,
  greeting,
  paletteInfo,
  resolveMode,
} from './theme';

describe('tema', () => {
  it('segue il telefono solo in modalità sistema', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('ha 4 famiglie di 3 tonalità con accento leggibile (AA) sul suo sfondo chiaro e scuro', () => {
    expect(PALETTE_FAMILIES.map((f) => [f.label, f.palettes])).toEqual([
      ['Verdi', ['salvia', 'oliva', 'smeraldo']],
      ['Blu', ['oceano', 'petrolio', 'notte']],
      ['Rossi', ['cipria', 'argilla', 'prugna']],
      ['Neutri', ['sabbia', 'pietra', 'grafite']],
    ]);
    expect(PALETTES).toHaveLength(12);
    for (const p of PALETTES) {
      expect(PALETTE_FAMILIES.find((f) => f.id === p.family)?.palettes, p.id).toContain(p.id);
      expect(contrastRatio(p.swatch.accent, p.swatch.light), `${p.id} chiaro`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.swatch.darkAccent, p.bar.dark), `${p.id} scuro`).toBeGreaterThanOrEqual(4.5);
      expect(p.bar.light).toBe(p.swatch.light);
    }
  });

  it('palette e caratteri sconosciuti tornano a quelli predefiniti', () => {
    expect(DEFAULT_PALETTE).toBe('oliva');
    expect(paletteInfo('sabbia').label).toBe('Sabbia');
    expect(paletteInfo('nuova').id).toBe('oliva');
    expect(paletteInfo(undefined).id).toBe('oliva');
    // Lavanda (fino alla 1.11) diventa Notte.
    expect(paletteInfo('lavanda').id).toBe('notte');
    expect(familyOf('lavanda').id).toBe('blu');
    expect(familyOf('argilla').label).toBe('Rossi');
    expect(DEFAULT_FONT).toBe('classico');
    expect(FONTS.map((f) => f.id)).toEqual(['classico', 'rivista', 'elegante']);
    expect(fontInfo(undefined).id).toBe('classico');
    expect(fontInfo('elegante').label).toBe('Elegante');
    expect(fontInfo('strano' as never).id).toBe('classico');
  });

  it('saluta secondo l’ora, con il nome se c’è', () => {
    expect(greeting(8, 'Giulia')).toBe('Buongiorno, Giulia');
    expect(greeting(12, '')).toBe('Buongiorno');
    expect(greeting(13, ' Ada ')).toBe('Buon pomeriggio, Ada');
    expect(greeting(17, 'Ada')).toBe('Buon pomeriggio, Ada');
    expect(greeting(18, 'Ada')).toBe('Buonasera, Ada');
    expect(greeting(2, 'Ada')).toBe('Buonasera, Ada');
    expect(greeting(5, 'Ada')).toBe('Buongiorno, Ada');
  });
});
