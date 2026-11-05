import type { PaletteId, ThemeMode } from '../db/types';

export interface PaletteInfo {
  id: PaletteId;
  label: string;
  /** Colori per l'anteprima: sfondo chiaro, accento chiaro, sfondo scuro, accento scuro. */
  swatch: { light: string; accent: string; darkAccent: string };
  /** Colore della barra di sistema per tema chiaro e scuro. */
  bar: { light: string; dark: string };
}

export const PALETTES: readonly PaletteInfo[] = [
  { id: 'sabbia', label: 'Sabbia', swatch: { light: '#f5efe6', accent: '#7a5c3f', darkAccent: '#d2b48c' }, bar: { light: '#f5efe6', dark: '#000000' } },
  { id: 'cipria', label: 'Cipria', swatch: { light: '#f8eeee', accent: '#8c4a55', darkAccent: '#e3a3aa' }, bar: { light: '#f8eeee', dark: '#000000' } },
  { id: 'salvia', label: 'Salvia', swatch: { light: '#eef1ea', accent: '#4d6449', darkAccent: '#a8c49f' }, bar: { light: '#eef1ea', dark: '#000000' } },
  { id: 'lavanda', label: 'Lavanda', swatch: { light: '#f1eff7', accent: '#62559a', darkAccent: '#b7aef0' }, bar: { light: '#f1eff7', dark: '#000000' } },
];

export const THEME_MODES: readonly { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'Come il telefono' },
  { id: 'light', label: 'Chiaro' },
  { id: 'dark', label: 'Scuro' },
];

export type ResolvedMode = 'light' | 'dark';

export function resolveMode(mode: ThemeMode, systemPrefersDark: boolean): ResolvedMode {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}

export function paletteInfo(id: PaletteId): PaletteInfo {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

/** Contrasto WCAG tra due colori esadecimali (#rrggbb). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
