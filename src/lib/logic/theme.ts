import type { FontId, PaletteId, ThemeMode } from '../db/types';

// Aspetto (SPEC.md, sezione 7): 4 famiglie × 3 tonalità di colori, chiaro/scuro e 3 caratteri. I colori veri sono in app.css.

export type PaletteFamily = 'verdi' | 'blu' | 'rossi' | 'neutri';

export interface PaletteInfo {
  id: PaletteId;
  label: string;
  family: PaletteFamily;
  /** Per l'anteprima: sfondo chiaro, tessera, accento, tono profondo (barra in basso) e accento dello scuro. */
  swatch: { light: string; tile: string; accent: string; strong: string; darkAccent: string };
  /** Colore della barra di sistema (in alto) per tema chiaro e scuro: è lo sfondo. */
  bar: { light: string; dark: string };
}

/** 4 famiglie di colori con 3 tonalità ciascuna (SPEC.md, sezione 7). */
export const PALETTES: readonly PaletteInfo[] = [
  {
    id: 'salvia',
    label: 'Salvia',
    family: 'verdi',
    swatch: { light: '#eef1ea', tile: '#dde4d6', accent: '#4d6449', strong: '#2f3f2c', darkAccent: '#a8c49f' },
    bar: { light: '#eef1ea', dark: '#000000' },
  },
  {
    id: 'oliva',
    label: 'Oliva',
    family: 'verdi',
    swatch: { light: '#f3eee6', tile: '#e4d9c6', accent: '#565c3f', strong: '#3e4230', darkAccent: '#bcc49c' },
    bar: { light: '#f3eee6', dark: '#000000' },
  },
  {
    id: 'smeraldo',
    label: 'Smeraldo',
    family: 'verdi',
    swatch: { light: '#f4f0e8', tile: '#e7e0d2', accent: '#154230', strong: '#154230', darkAccent: '#c9a96a' },
    bar: { light: '#f4f0e8', dark: '#15130f' },
  },
  {
    id: 'oceano',
    label: 'Oceano',
    family: 'blu',
    swatch: { light: '#eef2f3', tile: '#dce5e8', accent: '#3d6270', strong: '#29454f', darkAccent: '#9cc3cf' },
    bar: { light: '#eef2f3', dark: '#000000' },
  },
  {
    id: 'petrolio',
    label: 'Petrolio',
    family: 'blu',
    swatch: { light: '#f5f1ea', tile: '#e9e2d6', accent: '#1f4b5a', strong: '#163844', darkAccent: '#8ec3d3' },
    bar: { light: '#f5f1ea', dark: '#000000' },
  },
  {
    id: 'notte',
    label: 'Notte',
    family: 'blu',
    swatch: { light: '#f0f1f5', tile: '#dfe2ec', accent: '#2f3f73', strong: '#1e2a4f', darkAccent: '#aab7ef' },
    bar: { light: '#f0f1f5', dark: '#000000' },
  },
  {
    id: 'cipria',
    label: 'Cipria',
    family: 'rossi',
    swatch: { light: '#f8eeee', tile: '#f0dedd', accent: '#8c4a55', strong: '#56272f', darkAccent: '#e3a3aa' },
    bar: { light: '#f8eeee', dark: '#000000' },
  },
  {
    id: 'argilla',
    label: 'Argilla',
    family: 'rossi',
    swatch: { light: '#f6efe9', tile: '#ecdccf', accent: '#934b2a', strong: '#5c2e19', darkAccent: '#e5a07c' },
    bar: { light: '#f6efe9', dark: '#000000' },
  },
  {
    id: 'prugna',
    label: 'Prugna',
    family: 'rossi',
    swatch: { light: '#f5eff0', tile: '#e8dadd', accent: '#6e3242', strong: '#4a1f2b', darkAccent: '#dba3b2' },
    bar: { light: '#f5eff0', dark: '#000000' },
  },
  {
    id: 'sabbia',
    label: 'Sabbia',
    family: 'neutri',
    swatch: { light: '#f5efe6', tile: '#ebe2d4', accent: '#7a5c3f', strong: '#4a3726', darkAccent: '#d2b48c' },
    bar: { light: '#f5efe6', dark: '#000000' },
  },
  {
    id: 'pietra',
    label: 'Pietra',
    family: 'neutri',
    swatch: { light: '#f2f0ec', tile: '#e3dfd8', accent: '#5a534a', strong: '#2b2724', darkAccent: '#d2c7b7' },
    bar: { light: '#f2f0ec', dark: '#000000' },
  },
  {
    id: 'grafite',
    label: 'Grafite',
    family: 'neutri',
    swatch: { light: '#f1f1f1', tile: '#e2e2e2', accent: '#3b3c40', strong: '#222326', darkAccent: '#d9d9dd' },
    bar: { light: '#f1f1f1', dark: '#000000' },
  },
];

export const PALETTE_FAMILIES: readonly { id: PaletteFamily; label: string; palettes: readonly PaletteId[] }[] = [
  { id: 'verdi', label: 'Verdi', palettes: ['salvia', 'oliva', 'smeraldo'] },
  { id: 'blu', label: 'Blu', palettes: ['oceano', 'petrolio', 'notte'] },
  { id: 'rossi', label: 'Rossi', palettes: ['cipria', 'argilla', 'prugna'] },
  { id: 'neutri', label: 'Neutri', palettes: ['sabbia', 'pietra', 'grafite'] },
];

/** Palette dei nuovi armadi. */
export const DEFAULT_PALETTE: PaletteId = 'oliva';

/** Palette tolte nelle versioni precedenti e quella che le sostituisce. */
const LEGACY_PALETTES: Readonly<Record<string, PaletteId>> = { lavanda: 'notte' };

export interface FontInfo {
  id: FontId;
  label: string;
  hint: string;
  /** Famiglie come in app.css: per l'anteprima nel selettore. */
  display: string;
  text: string;
}

export const FONTS: readonly FontInfo[] = [
  { id: 'classico', label: 'Classico', hint: 'Il più leggibile', display: "'Cormorant Garamond'", text: "'Jost'" },
  { id: 'rivista', label: 'Rivista', hint: 'Come una rivista di moda', display: "'Playfair Display'", text: "'DM Sans'" },
  { id: 'elegante', label: 'Elegante', hint: 'Raffinato, da boutique', display: "'Bodoni Moda'", text: "'Manrope'" },
];

export const DEFAULT_FONT: FontId = 'classico';

export function fontInfo(id: FontId | undefined | null): FontInfo {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]!;
}

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

/** Palette salvata → quella da usare: le vecchie passano alla sostituta, le sconosciute a quella dei nuovi armadi. */
export function paletteInfo(id: PaletteId | string | undefined | null): PaletteInfo {
  const wanted = (id && LEGACY_PALETTES[id]) || id;
  return PALETTES.find((p) => p.id === wanted) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE)!;
}

export function familyOf(id: PaletteId | string | undefined | null): (typeof PALETTE_FAMILIES)[number] {
  const fam = paletteInfo(id).family;
  return PALETTE_FAMILIES.find((f) => f.id === fam)!;
}

/** Il saluto dell'Armadio secondo l'ora (0–23), con il nome se c'è. */
export function greeting(hour: number, name: string): string {
  const base = hour >= 5 && hour < 13 ? 'Buongiorno' : hour >= 13 && hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const n = name.trim();
  return n ? `${base}, ${n}` : base;
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
