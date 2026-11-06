import { describe, expect, it } from 'vitest';
import { gridColumns, gridWindow } from './virtualGrid';

describe('griglia virtualizzata', () => {
  it('calcola le colonne come CSS auto-fill', () => {
    expect(gridColumns(360, 104, 12)).toBe(3);
    expect(gridColumns(336, 104, 12)).toBe(3);
    expect(gridColumns(335, 104, 12)).toBe(2);
    expect(gridColumns(800, 104, 12)).toBe(7);
    expect(gridColumns(0, 104, 12)).toBe(1);
  });

  it('disegna solo le righe vicine allo schermo e conserva l’altezza totale', () => {
    const base = { count: 500, cols: 3, rowHeight: 180, gap: 12 };
    const w = gridWindow({ ...base, viewTop: 1920, viewHeight: 700, overscanRows: 2 });
    // stride 192: righe visibili 10..14, con 2 di scorta 8..16
    expect(w).toEqual({ start: 24, end: 51, padTop: 8 * 192, padBottom: (167 - 1 - 16) * 192 });
    const drawnRows = (w.end - w.start) / 3;
    const total = w.padTop + drawnRows * 180 + (drawnRows - 1) * 12 + w.padBottom;
    expect(total).toBe(167 * 180 + 166 * 12);
  });

  it('gestisce inizio, fine e casi limite', () => {
    const base = { count: 10, cols: 3, rowHeight: 100, gap: 10, overscanRows: 0 };
    expect(gridWindow({ ...base, viewTop: -300, viewHeight: 200 })).toEqual({ start: 0, end: 3, padTop: 0, padBottom: 330 });
    expect(gridWindow({ ...base, viewTop: 5000, viewHeight: 200 })).toEqual({ start: 9, end: 10, padTop: 330, padBottom: 0 });
    expect(gridWindow({ ...base, count: 0, viewTop: 0, viewHeight: 500 })).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
    expect(gridWindow({ ...base, rowHeight: 0, viewTop: 0, viewHeight: 500 })).toEqual({ start: 0, end: 10, padTop: 0, padBottom: 0 });
  });
});
