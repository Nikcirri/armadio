import { describe, expect, it } from 'vitest';
import { GARMENT_COLORS, deltaE, hexToLab, hexToRgb, labToHex, labToRgb, nearestColor, rgbToHex, rgbToLab } from './colors';

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
});
