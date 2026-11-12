import type { ColorId } from '../db/types';
import { colorFit, type SeasonId } from './armocromia';
import { colorInfo } from './colors';

// Palette di colori che stanno bene insieme (SPEC.md, sezione 8.3): preferenze per "Cosa metto?".

export interface ColorPalette {
  id: string;
  name: string;
  hint: string;
  /** I colori dei capi ammessi nella palette. */
  colors: readonly ColorId[];
  /** Le sfumature da mostrare, una per colore e nello stesso ordine. */
  swatches: readonly string[];
}

/** Id speciale: la palette della propria stagione di armocromia. */
export const SEASON_PALETTE_ID = 'season';

const p = (id: string, name: string, hint: string, pairs: readonly (readonly [ColorId, string])[]): ColorPalette => ({
  id,
  name,
  hint,
  colors: pairs.map((x) => x[0]),
  swatches: pairs.map((x) => x[1]),
});

export const COLOR_PALETTES: readonly ColorPalette[] = [
  p('mediterraneo', 'Mediterraneo', 'Blu navy, bianco e rosso', [['navy', '#1F2F56'], ['white', '#F7F7F5'], ['red', '#C62F2F']]),
  p('riviera', 'Riviera', 'Blu navy, bianco e giallo', [['navy', '#1F2F56'], ['white', '#F7F7F5'], ['yellow', '#E9C93B']]),
  p('oceano', 'Oceano', 'Blu navy, denim, bianco e grigio', [['navy', '#1F2F56'], ['denim', '#5B7FAE'], ['white', '#F7F7F5'], ['grey', '#9A9A9E']]),
  p('biancoNero', 'Bianco e nero', 'Nero, bianco e grigio', [['black', '#1C1C1E'], ['white', '#F7F7F5'], ['grey', '#9A9A9E']]),
  p('citta', 'Inverno in città', 'Blu navy, grigio, bianco e nero', [['navy', '#1F2F56'], ['grey', '#9A9A9E'], ['white', '#F7F7F5'], ['black', '#1C1C1E']]),
  p('totalBlack', 'Total black', 'Nero, antracite e un tocco d’oro o d’argento', [['black', '#1C1C1E'], ['charcoal', '#3C3F44'], ['metallic', '#C8B273'], ['silver', '#C0C4C8']]),
  p('notteElegante', 'Notte elegante', 'Nero, bordeaux e oro o argento', [['black', '#1C1C1E'], ['burgundy', '#6D1F2F'], ['metallic', '#C8B273'], ['silver', '#C0C4C8']]),
  p('notteBlu', 'Notte blu', 'Blu navy, nero, grigio e argento', [['navy', '#1F2F56'], ['black', '#1C1C1E'], ['grey', '#9A9A9E'], ['silver', '#C0C4C8']]),
  p('oroNero', 'Oro e nero', 'Nero, bianco e dettagli oro', [['metallic', '#C8B273'], ['black', '#1C1C1E'], ['white', '#F7F7F5']]),
  p('rossoNero', 'Rosso e nero', 'Rosso con nero, grigio e bianco', [['red', '#C62F2F'], ['black', '#1C1C1E'], ['grey', '#9A9A9E'], ['white', '#F7F7F5']]),
  p('vinoBlu', 'Vino e blu', 'Bordeaux, blu navy, grigio e bianco', [['burgundy', '#6D1F2F'], ['navy', '#1F2F56'], ['grey', '#9A9A9E'], ['white', '#F7F7F5']]),
  p('ciliegia', 'Ciliegia', 'Bordeaux, rosa e panna', [['burgundy', '#6D1F2F'], ['pink', '#E79AB4'], ['cream', '#EFE4CC']]),
  p('sabbia', 'Sabbia', 'Panna, bianco e cuoio', [['cream', '#E3D3B4'], ['white', '#F7F7F5'], ['brown', '#8B5A33']]),
  p('cammelloBlu', 'Cammello e blu', 'Blu navy, cammello e panna', [['navy', '#1F2F56'], ['camel', '#C19A6B'], ['cream', '#EFE4CC']]),
  p('denimCuoio', 'Denim e cuoio', 'Denim, cuoio, bianco e panna', [['denim', '#5B7FAE'], ['brown', '#8B5A33'], ['white', '#F7F7F5'], ['cream', '#E3D3B4']]),
  p('safari', 'Safari', 'Kaki, oliva, panna e cuoio', [['khaki', '#A99A6B'], ['olive', '#6B6B35'], ['cream', '#E3D3B4'], ['brown', '#8B5A33']]),
  p('urban', 'Urban', 'Oliva, nero, bianco e denim', [['olive', '#6B6B35'], ['black', '#1C1C1E'], ['white', '#F7F7F5'], ['denim', '#5B7FAE']]),
  p('bosco', 'Bosco', 'Verde bosco, verde, oliva, marrone e panna', [
    ['forest', '#1F4D33'],
    ['green', '#3F6B4A'],
    ['olive', '#6B6B35'],
    ['brown', '#7A5032'],
    ['cream', '#EFE4CC'],
  ]),
  p('college', 'College', 'Verde bosco, blu navy, panna e marrone', [['forest', '#1F4D33'], ['navy', '#1F2F56'], ['cream', '#EFE4CC'], ['brown', '#7A5032']]),
  p('foglieAutunno', 'Foglie d’autunno', 'Bordeaux, oliva, marrone e panna', [['burgundy', '#6D1F2F'], ['olive', '#6B6B35'], ['brown', '#7A5032'], ['cream', '#E3D3B4']]),
  p('terracotta', 'Terracotta', 'Terracotta, marrone e panna', [['rust', '#B5532F'], ['brown', '#7A5032'], ['cream', '#EFE4CC']]),
  p('rossoCammello', 'Rosso e cammello', 'Rosso, cammello, panna e denim', [['red', '#C62F2F'], ['camel', '#C19A6B'], ['cream', '#EFE4CC'], ['denim', '#5B7FAE']]),
  p('corallo', 'Corallo e jeans', 'Corallo, denim, bianco e panna', [['coral', '#F2775F'], ['denim', '#5B7FAE'], ['white', '#F7F7F5'], ['cream', '#EFE4CC']]),
  p('soleEstate', 'Sole d’estate', 'Giallo, bianco e denim', [['yellow', '#E9C93B'], ['white', '#F7F7F5'], ['denim', '#5B7FAE']]),
  p('limone', 'Limone e grigio', 'Giallo, grigio, bianco e nero', [['yellow', '#E9C93B'], ['grey', '#9A9A9E'], ['white', '#F7F7F5'], ['black', '#1C1C1E']]),
  p('pastello', 'Pastello', 'Rosa, celeste, bianco e panna', [['pink', '#F3B6C8'], ['lightBlue', '#A9CBE8'], ['white', '#F7F7F5'], ['cream', '#F2E6CC']]),
  p('rosaGrigio', 'Rosa e grigio', 'Rosa, grigio e bianco', [['pink', '#E79AB4'], ['grey', '#9A9A9E'], ['white', '#F7F7F5']]),
  p('giardino', 'Giardino', 'Verde, rosa, panna e bianco', [['green', '#3F8F4F'], ['pink', '#E79AB4'], ['cream', '#EFE4CC'], ['white', '#F7F7F5']]),
  p('fioriPrimavera', 'Fiori di primavera', 'Rosa, giallo, verde e bianco', [['pink', '#F3B6C8'], ['yellow', '#F4E08A'], ['green', '#9CCB8A'], ['white', '#F7F7F5']]),
  p('lavanda', 'Lavanda', 'Lilla, grigio, bianco e panna', [['lilac', '#C3A6D6'], ['grey', '#9A9A9E'], ['white', '#F7F7F5'], ['cream', '#EFE4CC']]),
  p('tramonto', 'Tramonto', 'Arancio, rosa, viola e panna', [['orange', '#E07A2E'], ['pink', '#E79AB4'], ['purple', '#7A4A9E'], ['cream', '#EFE4CC']]),
  p('cioccolatoCammello', 'Cioccolato e cammello', 'Cioccolato, cammello, panna e bianco', [['chocolate', '#4A2F22'], ['camel', '#C19A6B'], ['cream', '#EFE4CC'], ['white', '#F7F7F5']]),
  p('salviaTortora', 'Salvia e tortora', 'Verde salvia, tortora, panna e bianco', [['sage', '#9CB29A'], ['taupe', '#A08F80'], ['cream', '#EFE4CC'], ['white', '#F7F7F5']]),
  p('petrolioSenape', 'Petrolio e senape', 'Petrolio, senape, panna e cuoio', [['teal', '#1F5F6B'], ['mustard', '#C99A2E'], ['cream', '#EFE4CC'], ['brown', '#7A5032']]),
  p('laguna', 'Laguna', 'Turchese, bianco, blu navy e sabbia', [['turquoise', '#2BB3B1'], ['white', '#F7F7F5'], ['navy', '#1F2F56'], ['cream', '#E3D3B4']]),
  p('bluReale', 'Blu reale', 'Blu, bianco, cammello e grigio', [['blue', '#2F5BBF'], ['white', '#F7F7F5'], ['camel', '#C19A6B'], ['grey', '#9A9A9E']]),
  p('fucsiaNero', 'Fucsia e nero', 'Fucsia, nero, bianco e grigio', [['fuchsia', '#D1307F'], ['black', '#1C1C1E'], ['white', '#F7F7F5'], ['grey', '#9A9A9E']]),
  p('prugnaLilla', 'Prugna e lilla', 'Prugna, lilla, grigio e bianco', [['plum', '#5E2A4E'], ['lilac', '#C3A6D6'], ['grey', '#9A9A9E'], ['white', '#F7F7F5']]),
  p('fantasiaNeutri', 'Fantasia + neutri', 'Un capo fantasia con nero, bianco, panna, blu o grigio', [
    ['pattern', '#888888'],
    ['black', '#1C1C1E'],
    ['white', '#F7F7F5'],
    ['cream', '#EFE4CC'],
    ['navy', '#1F2F56'],
    ['denim', '#5B7FAE'],
    ['grey', '#9A9A9E'],
  ]),
];

export function paletteById(id: string | null): ColorPalette | null {
  return COLOR_PALETTES.find((x) => x.id === id) ?? null;
}

export interface PaletteFit {
  /** Colori fuori palette (la fantasia non prevista conta mezzo). */
  outside: number;
  /** Quanti colori diversi della palette usa. */
  used: number;
  /** Quanti di questi sono colori d'accento (non neutri). */
  accents: number;
}

export function paletteFit(colors: readonly ColorId[], palette: Pick<ColorPalette, 'colors'>): PaletteFit {
  const distinct = [...new Set(colors)];
  let outside = 0;
  let used = 0;
  let accents = 0;
  for (const c of distinct) {
    if (palette.colors.includes(c)) {
      used += 1;
      if (c === 'pattern' || !colorInfo(c).neutral) accents += 1;
    } else outside += c === 'pattern' ? 0.5 : 1;
  }
  return { outside, used, accents };
}

/**
 * La palette che un abbinamento rispetta (per la chip "Palette X" senza palette scelta):
 * tutti i colori dentro e almeno tre colori, oppure due con un colore d'accento.
 * A parità vince la palette che ne usa di più, poi la più piccola (più precisa).
 */
export function matchingPalette(colors: readonly ColorId[]): ColorPalette | null {
  let best: { palette: ColorPalette; used: number } | null = null;
  for (const palette of COLOR_PALETTES) {
    const fit = paletteFit(colors, palette);
    if (fit.outside > 0 || !(fit.used >= 3 || (fit.used >= 2 && fit.accents >= 1))) continue;
    if (!best || fit.used > best.used || (fit.used === best.used && palette.colors.length < best.palette.colors.length)) {
      best = { palette, used: fit.used };
    }
  }
  return best?.palette ?? null;
}

const FIT_RANK = { good: 2, ok: 1, avoid: 0 } as const;

/**
 * Quanto una palette sta bene a una stagione: null se contiene colori da evitare vicino al viso.
 * Se la palette offre oro e argento ("un tocco d'oro o d'argento") conta il metallo che sta meglio.
 */
export function paletteSeasonScore(palette: Pick<ColorPalette, 'colors'>, season: SeasonId): number | null {
  const metals = palette.colors.filter((c) => c === 'metallic' || c === 'silver');
  const bestMetal = metals
    .map((c) => colorFit(season, c))
    .filter((f) => f !== null)
    .sort((a, b) => FIT_RANK[b] - FIT_RANK[a])[0];
  const fits = [...palette.colors.filter((c) => c !== 'metallic' && c !== 'silver').map((c) => colorFit(season, c)), bestMetal].filter(
    (f) => f !== null && f !== undefined,
  );
  if (!fits.length || fits.includes('avoid')) return null;
  return fits.filter((f) => f === 'good').length / fits.length;
}

/** Le palette adatte a una stagione (almeno metà colori che valorizzano), dalle più adatte. */
export function palettesForSeason(season: SeasonId): ColorPalette[] {
  return COLOR_PALETTES.map((palette) => ({ palette, score: paletteSeasonScore(palette, season) }))
    .filter((x): x is { palette: ColorPalette; score: number } => x.score !== null && x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.palette);
}

/** Tutte le palette, con quelle adatte alla stagione per prime (se c'è). */
export function orderedPalettes(season: SeasonId | null): { palette: ColorPalette; suits: boolean }[] {
  if (!season) return COLOR_PALETTES.map((palette) => ({ palette, suits: false }));
  const suited = palettesForSeason(season);
  return [
    ...suited.map((palette) => ({ palette, suits: true })),
    ...COLOR_PALETTES.filter((x) => !suited.includes(x)).map((palette) => ({ palette, suits: false })),
  ];
}
