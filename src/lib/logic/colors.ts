import type { ColorId } from '../db/types';

// SPEC.md, sezione 6: palette dei colori dei capi.
export interface PaletteColor {
  id: ColorId;
  label: string;
  hex: string;
  neutral: boolean;
  /** Escluso dal rilevamento automatico (difficile da riconoscere in foto). */
  manualOnly?: boolean;
}

export const GARMENT_COLORS: readonly PaletteColor[] = [
  // Neutri scuri e chiari
  { id: 'black', label: 'Nero', hex: '#1c1c1e', neutral: true },
  { id: 'charcoal', label: 'Antracite', hex: '#3c3f44', neutral: true },
  { id: 'grey', label: 'Grigio', hex: '#9a9a9e', neutral: true },
  { id: 'white', label: 'Bianco', hex: '#f7f7f5', neutral: true },
  { id: 'cream', label: 'Panna/Beige', hex: '#e3d3b4', neutral: true },
  { id: 'taupe', label: 'Tortora', hex: '#a08f80', neutral: true },
  // Terra
  { id: 'camel', label: 'Cammello', hex: '#c19a6b', neutral: true },
  { id: 'khaki', label: 'Kaki', hex: '#a99a6b', neutral: true },
  { id: 'brown', label: 'Marrone/Cuoio', hex: '#7a5032', neutral: true },
  { id: 'chocolate', label: 'Cioccolato', hex: '#4a2f22', neutral: true },
  // Blu e azzurri
  { id: 'navy', label: 'Blu navy', hex: '#1f2f56', neutral: true },
  { id: 'blue', label: 'Blu', hex: '#2f5bbf', neutral: false },
  { id: 'denim', label: 'Azzurro/Denim', hex: '#5b7fae', neutral: true },
  { id: 'lightBlue', label: 'Celeste', hex: '#a9cbe8', neutral: false },
  { id: 'turquoise', label: 'Turchese', hex: '#2bb3b1', neutral: false },
  { id: 'teal', label: 'Petrolio', hex: '#1f5f6b', neutral: false },
  // Verdi
  { id: 'sage', label: 'Verde salvia', hex: '#9cb29a', neutral: false },
  { id: 'green', label: 'Verde', hex: '#3f8f4f', neutral: false },
  { id: 'forest', label: 'Verde bosco', hex: '#1f4d33', neutral: false },
  { id: 'olive', label: 'Oliva', hex: '#6b6b35', neutral: false },
  // Gialli, aranci e rossi
  { id: 'yellow', label: 'Giallo', hex: '#e9c93b', neutral: false },
  { id: 'mustard', label: 'Senape', hex: '#c99a2e', neutral: false },
  { id: 'orange', label: 'Arancio', hex: '#e07a2e', neutral: false },
  { id: 'coral', label: 'Corallo', hex: '#f2775f', neutral: false },
  { id: 'rust', label: 'Terracotta', hex: '#b5532f', neutral: false },
  { id: 'red', label: 'Rosso', hex: '#c62f2f', neutral: false },
  { id: 'burgundy', label: 'Bordeaux', hex: '#6d1f2f', neutral: false },
  // Rosa e viola
  { id: 'pink', label: 'Rosa', hex: '#e79ab4', neutral: false },
  { id: 'fuchsia', label: 'Fucsia', hex: '#d1307f', neutral: false },
  { id: 'lilac', label: 'Lilla', hex: '#c3a6d6', neutral: false },
  { id: 'purple', label: 'Viola', hex: '#7a4a9e', neutral: false },
  { id: 'plum', label: 'Prugna', hex: '#5e2a4e', neutral: false },
  // Solo a mano
  { id: 'metallic', label: 'Oro', hex: '#c8b273', neutral: false, manualOnly: true },
  { id: 'silver', label: 'Argento', hex: '#c0c4c8', neutral: false, manualOnly: true },
  { id: 'pattern', label: 'Fantasia', hex: '#888888', neutral: false, manualOnly: true },
];

export function colorInfo(id: ColorId): PaletteColor {
  return GARMENT_COLORS.find((c) => c.id === id) ?? GARMENT_COLORS[0]!;
}

/** Sfondo CSS del pallino di un colore: sfumature per oro, argento e fantasia. */
export function swatchCss(id: ColorId): string {
  if (id === 'pattern') return 'conic-gradient(#c62f2f, #e9c93b, #3f8f4f, #5b7fae, #7a4a9e, #c62f2f)';
  if (id === 'metallic') return 'linear-gradient(135deg, #f1e3a6, #c8a84e 45%, #a8862f 55%, #e6d48e)';
  if (id === 'silver') return 'linear-gradient(135deg, #f2f3f5, #b9bdc3 45%, #8f949b 55%, #dfe2e6)';
  return colorInfo(id).hex;
}

export type Lab = [number, number, number];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Converte RGB (0-255) nello spazio colore CIE Lab (D65). */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/** Da Lab (D65) a RGB 0-255 (i colori fuori gamma vengono riportati dentro). */
export function labToRgb(lab: Lab): [number, number, number] {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  const r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const b = x * 0.0557 + y * -0.204 + z * 1.057;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function labToHex(lab: Lab): string {
  return rgbToHex(...labToRgb(lab));
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(...hexToRgb(hex));
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Distanza percettiva tra due colori (CIE76). */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const PALETTE_LAB: { id: ColorId; lab: Lab }[] = GARMENT_COLORS.filter((c) => !c.manualOnly).map((c) => ({
  id: c.id,
  lab: rgbToLab(...hexToRgb(c.hex)),
}));

/** Colore della palette più vicino. */
export function nearestColor(lab: Lab): ColorId {
  let best = PALETTE_LAB[0]!;
  let bestD = Infinity;
  for (const p of PALETTE_LAB) {
    const d = deltaE(lab, p.lab);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best.id;
}

/** Generatore pseudo-casuale con seme: stesso input, stesso risultato. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Cluster {
  center: Lab;
  count: number;
}

/** k-means con inizializzazione k-means++ (deterministico). */
export function kmeans(points: readonly Lab[], k: number, iterations = 12, seed = 42): Cluster[] {
  if (points.length === 0) return [];
  const rand = mulberry32(seed);
  const kk = Math.min(k, points.length);
  const centers: Lab[] = [points[Math.floor(rand() * points.length)]!];
  while (centers.length < kk) {
    const d2 = points.map((p) => Math.min(...centers.map((c) => deltaE(p, c) ** 2)));
    const sum = d2.reduce((a, b) => a + b, 0);
    if (sum === 0) break;
    let r = rand() * sum;
    let idx = 0;
    for (; idx < d2.length - 1; idx++) {
      r -= d2[idx]!;
      if (r <= 0) break;
    }
    centers.push(points[idx]!);
  }
  const assign = new Int32Array(points.length);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = deltaE(points[i]!, centers[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const s = sums[assign[i]!]!;
      const p = points[i]!;
      s[0]! += p[0];
      s[1]! += p[1];
      s[2]! += p[2];
      s[3]! += 1;
    }
    sums.forEach((s, c) => {
      if (s[3]! > 0) centers[c] = [s[0]! / s[3]!, s[1]! / s[3]!, s[2]! / s[3]!];
    });
  }
  const counts = centers.map(() => 0);
  for (let i = 0; i < points.length; i++) counts[assign[i]!]! += 1;
  return centers.map((center, i) => ({ center, count: counts[i]! })).filter((c) => c.count > 0);
}

export interface PixelSource {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Campiona i pixel della parte centrale (esclude il 12% di bordo) ignorando quelli trasparenti.
 * Restituisce al massimo ~3000 punti in Lab.
 */
export function samplePixels(img: PixelSource, border = 0.12, maxPoints = 3000): Lab[] {
  const x0 = Math.floor(img.width * border);
  const x1 = Math.ceil(img.width * (1 - border));
  const y0 = Math.floor(img.height * border);
  const y1 = Math.ceil(img.height * (1 - border));
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const step = Math.max(1, Math.floor(Math.sqrt(area / maxPoints)));
  const out: Lab[] = [];
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * img.width + x) * 4;
      if ((img.data[i + 3] ?? 0) < 200) continue;
      out.push(rgbToLab(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!));
    }
  }
  return out;
}

/**
 * Colori probabili del capo: il principale e, se occupa almeno il 25%, un secondo.
 * Se ci sono 3 colori diversi ciascuno sopra il 18% aggiunge "Fantasia".
 */
export function detectColors(img: PixelSource): ColorId[] {
  const points = samplePixels(img);
  if (points.length < 20) return [];
  const clusters = kmeans(points, 4);
  const total = clusters.reduce((a, c) => a + c.count, 0);
  const shares = new Map<ColorId, number>();
  for (const c of clusters) {
    const id = nearestColor(c.center);
    shares.set(id, (shares.get(id) ?? 0) + c.count / total);
  }
  const ranked = [...shares.entries()].sort((a, b) => b[1] - a[1]);
  const result: ColorId[] = [ranked[0]![0]];
  const second = ranked[1];
  if (second && second[1] >= 0.25) result.push(second[0]);
  const strong = ranked.filter(([, s]) => s >= 0.18);
  if (strong.length >= 3) result.push('pattern');
  return result;
}
