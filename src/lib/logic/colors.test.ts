import { describe, expect, it } from 'vitest';
import { GARMENT_COLORS, colorInfo, deltaE, hexToLab, hexToRgb, labToHex, labToRgb, nearestColor, rgbToHex, rgbToLab, swatchCss } from './colors';

describe('conversioni di colore', () => {
  it('RGB → Lab → RGB torna allo stesso colore', () => {
    for (const rgb of [
      [0, 0, 0],
      [255, 255, 255],
      [224, 180, 160],
      [31, 47, 86],
      [198, 47, 47],
    ] as [number, number, number][]) {
      expect(labToRgb(rgbToLab(...rgb))).toEqual(rgb);
    }
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 1);
  });

  it('esadecimale', () => {
    expect(rgbToHex(255, 0, 16)).toBe('#FF0010');
    expect(rgbToHex(300, -4, 15.6)).toBe('#FF0010');
    expect(hexToRgb('#7a5c3f')).toEqual([122, 92, 63]);
    expect(labToHex(hexToLab('#C8102E'))).toBe('#C8102E');
    expect(deltaE(hexToLab('#000000'), hexToLab('#000000'))).toBe(0);
  });

  it('ogni colore della palette dei capi è il più vicino a sé stesso', () => {
    for (const c of GARMENT_COLORS.filter((x) => !x.manualOnly)) expect(nearestColor(hexToLab(c.hex))).toBe(c.id);
  });

  it('35 colori diversi tra loro; oro, argento e fantasia solo a mano', () => {
    expect(GARMENT_COLORS).toHaveLength(35);
    expect(new Set(GARMENT_COLORS.map((c) => c.id)).size).toBe(35);
    expect(new Set(GARMENT_COLORS.map((c) => c.label)).size).toBe(35);
    expect(new Set(GARMENT_COLORS.map((c) => c.hex.toLowerCase())).size).toBe(35);
    expect(GARMENT_COLORS.filter((c) => c.manualOnly).map((c) => c.label)).toEqual(['Oro', 'Argento', 'Fantasia']);
    // abbastanza lontani perché il rilevamento dalla foto non li confonda
    const auto = GARMENT_COLORS.filter((c) => !c.manualOnly);
    for (const a of auto) for (const b of auto) if (a !== b) expect(deltaE(hexToLab(a.hex), hexToLab(b.hex)), `${a.id} ${b.id}`).toBeGreaterThan(9);
    expect(GARMENT_COLORS.filter((c) => c.neutral).map((c) => c.id)).toEqual([
      'black', 'charcoal', 'grey', 'white', 'cream', 'taupe', 'camel', 'khaki', 'brown', 'chocolate', 'navy', 'denim',
    ]);
    expect(colorInfo('metallic').label).toBe('Oro');
  });

  it('pallini: sfumature per oro, argento e fantasia, tinta unita per gli altri', () => {
    expect(swatchCss('camel')).toBe('#c19a6b');
    expect(swatchCss('metallic')).toMatch(/^linear-gradient/);
    expect(swatchCss('silver')).toMatch(/^linear-gradient/);
    expect(swatchCss('pattern')).toMatch(/^conic-gradient/);
  });
});
