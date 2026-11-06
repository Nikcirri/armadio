import { describe, expect, it } from 'vitest';
import { SEASONS } from './armocromia';
import { GARMENT_COLORS } from './colors';
import {
  COLOR_PALETTES,
  matchingPalette,
  orderedPalettes,
  paletteById,
  paletteFit,
  paletteSeasonScore,
  palettesForSeason,
} from './colorPalettes';

describe('palette di colori', () => {
  it('tante palette, ben formate', () => {
    expect(COLOR_PALETTES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(COLOR_PALETTES.map((x) => x.id)).size).toBe(COLOR_PALETTES.length);
    expect(new Set(COLOR_PALETTES.map((x) => x.name)).size).toBe(COLOR_PALETTES.length);
    const ids = new Set(GARMENT_COLORS.map((c) => c.id));
    for (const pal of COLOR_PALETTES) {
      expect(pal.colors.length, pal.id).toBeGreaterThanOrEqual(3);
      expect(pal.swatches).toHaveLength(pal.colors.length);
      expect(new Set(pal.colors).size, pal.id).toBe(pal.colors.length);
      for (const c of pal.colors) expect(ids.has(c), `${pal.id} ${c}`).toBe(true);
      for (const h of pal.swatches) expect(h).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(paletteById('bosco')?.name).toBe('Bosco');
    expect(paletteById(null)).toBeNull();
  });

  it('misura quanto un abbinamento sta nella palette', () => {
    const med = paletteById('mediterraneo')!;
    expect(paletteFit(['navy', 'white', 'red', 'navy'], med)).toEqual({ outside: 0, used: 3, accents: 1 });
    expect(paletteFit(['navy', 'brown'], med)).toEqual({ outside: 1, used: 1, accents: 0 });
    expect(paletteFit(['pattern', 'white'], med).outside).toBe(0.5);
    expect(paletteFit(['pattern', 'white'], paletteById('fantasiaNeutri')!)).toEqual({ outside: 0, used: 2, accents: 1 });
  });

  it('riconosce la palette di un abbinamento', () => {
    expect(matchingPalette(['navy', 'white', 'red'])?.id).toBe('mediterraneo');
    expect(matchingPalette(['green', 'olive', 'brown', 'cream'])?.id).toBe('bosco');
    expect(matchingPalette(['red', 'black'])?.id).toBe('rossoNero');
    // due neutri soli non bastano, colori fuori da tutte le palette nemmeno
    expect(matchingPalette(['black', 'white'])).toBeNull();
    expect(matchingPalette(['purple', 'yellow', 'olive'])).toBeNull();
  });

  it('sceglie le palette adatte a ogni stagione', () => {
    for (const s of SEASONS) expect(palettesForSeason(s.id).length, s.id).toBeGreaterThanOrEqual(3);
    const autumn = palettesForSeason('warmAutumn').map((x) => x.id);
    expect(autumn).toContain('bosco');
    expect(autumn).toContain('terracotta');
    expect(autumn).not.toContain('biancoNero');
    const winter = palettesForSeason('deepWinter').map((x) => x.id);
    expect(winter).toContain('biancoNero');
    expect(winter).toContain('notteElegante');
    expect(winter).not.toContain('terracotta');
    expect(paletteSeasonScore(paletteById('totalBlack')!, 'deepWinter')).toBe(1);
    expect(paletteSeasonScore(paletteById('mediterraneo')!, 'warmAutumn')).toBeNull();
    const ordered = orderedPalettes('warmAutumn');
    expect(ordered).toHaveLength(COLOR_PALETTES.length);
    expect(ordered[0]!.suits).toBe(true);
    expect(orderedPalettes(null).every((x) => !x.suits)).toBe(true);
  });
});
