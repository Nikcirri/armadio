import type { FaceFeatures } from './armocromia';
import { chromaOf } from './armocromia';
import { deltaE, kmeans, rgbToLab, type Lab } from './colors';
import type { Img } from './imageOps';

// Colori del viso per l'armocromia (SPEC.md, sezione 8.6). Funzioni pure: lavorano sui pixel
// della foto e sui contorni del viso trovati da ML Kit (oppure su punti toccati dall'utente).

export type Point = readonly [number, number];

export type ContourName =
  | 'face'
  | 'leftEyebrowTop'
  | 'leftEyebrowBottom'
  | 'rightEyebrowTop'
  | 'rightEyebrowBottom'
  | 'leftEye'
  | 'rightEye'
  | 'upperLipTop'
  | 'upperLipBottom'
  | 'lowerLipTop'
  | 'lowerLipBottom'
  | 'noseBridge'
  | 'noseBottom'
  | 'leftCheek'
  | 'rightCheek';

/** Il viso trovato da ML Kit, nelle coordinate della foto analizzata. */
export interface FaceGeometry {
  bounds: { x: number; y: number; width: number; height: number };
  contours: Partial<Record<ContourName, Point[]>>;
  /** Rotazione della testa in gradi (su/giù, destra/sinistra, inclinazione). */
  angles: { x: number; y: number; z: number };
}

export type FeatureId = 'skin' | 'hair' | 'eyes' | 'lips' | 'brows';

export const FEATURE_LABEL: Record<FeatureId, string> = {
  skin: 'Pelle',
  hair: 'Capelli',
  eyes: 'Occhi',
  lips: 'Labbra',
  brows: 'Sopracciglia',
};

export type Region =
  | { kind: 'polygon'; points: Point[]; holes?: Point[][] }
  | { kind: 'circle'; center: Point; radius: number };

export type FaceRegions = Record<FeatureId, Region[]>;

/** Moltiplicatori R, G, B per il bilanciamento del bianco. */
export type Gains = readonly [number, number, number];
export const NO_GAINS: Gains = [1, 1, 1];

type Rgb = readonly [number, number, number];

// ---------- Geometria ----------

export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inRegion(p: Point, r: Region): boolean {
  if (r.kind === 'circle') return (p[0] - r.center[0]) ** 2 + (p[1] - r.center[1]) ** 2 <= r.radius ** 2;
  if (!pointInPolygon(p, r.points)) return false;
  return !(r.holes ?? []).some((h) => pointInPolygon(p, h));
}

function regionBox(r: Region): { x0: number; y0: number; x1: number; y1: number } {
  if (r.kind === 'circle') {
    return { x0: r.center[0] - r.radius, y0: r.center[1] - r.radius, x1: r.center[0] + r.radius, y1: r.center[1] + r.radius };
  }
  const xs = r.points.map((p) => p[0]);
  const ys = r.points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function centroid(points: readonly Point[]): Point {
  const n = points.length || 1;
  return [points.reduce((a, p) => a + p[0], 0) / n, points.reduce((a, p) => a + p[1], 0) / n];
}

const rect = (x0: number, y0: number, x1: number, y1: number): Region => ({
  kind: 'polygon',
  points: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
});

/** Le zone da misurare, ricavate dai contorni del viso. */
export function faceRegions(face: FaceGeometry): FaceRegions {
  const c = face.contours;
  const oval = c.face?.length ? c.face : null;
  const b = face.bounds;
  const left = oval ? Math.min(...oval.map((p) => p[0])) : b.x;
  const right = oval ? Math.max(...oval.map((p) => p[0])) : b.x + b.width;
  const top = oval ? Math.min(...oval.map((p) => p[1])) : b.y;
  const bottom = oval ? Math.max(...oval.map((p) => p[1])) : b.y + b.height;
  const w = right - left;
  const h = bottom - top;
  const cx = (left + right) / 2;

  // Pelle: guance e fronte (sotto la fronte c'è ancora pelle, sopra le sopracciglia).
  const browTops = [...(c.leftEyebrowTop ?? []), ...(c.rightEyebrowTop ?? [])];
  const browTop = browTops.length ? Math.min(...browTops.map((p) => p[1])) : top + h * 0.3;
  const cheek = (pt: Point[] | undefined, side: -1 | 1): Point => (pt?.[0] ? pt[0] : [cx + side * w * 0.25, top + h * 0.62]);
  const skin: Region[] = [
    { kind: 'circle', center: cheek(c.leftCheek, 1), radius: w * 0.075 },
    { kind: 'circle', center: cheek(c.rightCheek, -1), radius: w * 0.075 },
    { kind: 'circle', center: [cx, browTop - (browTop - top) * 0.45], radius: Math.max(2, Math.min(w * 0.08, (browTop - top) * 0.35)) },
  ];

  // Occhi: l'apertura delle palpebre (il bianco e la pupilla si scartano dopo).
  const eyes: Region[] = [c.leftEye, c.rightEye].filter((e): e is Point[] => !!e && e.length >= 3).map((points) => ({ kind: 'polygon', points }));

  // Sopracciglia: tra il contorno di sopra e quello di sotto.
  const brows: Region[] = (
    [
      [c.leftEyebrowTop, c.leftEyebrowBottom],
      [c.rightEyebrowTop, c.rightEyebrowBottom],
    ] as const
  )
    .filter(([t, u]) => t?.length && u?.length)
    .map(([t, u]) => ({ kind: 'polygon', points: [...t!, ...[...u!].reverse()] }));

  // Labbra: contorno esterno meno l'interno della bocca.
  const lips: Region[] =
    c.upperLipTop?.length && c.lowerLipBottom?.length
      ? [
          {
            kind: 'polygon',
            points: [...c.upperLipTop, ...[...c.lowerLipBottom].reverse()],
            holes:
              c.upperLipBottom?.length && c.lowerLipTop?.length ? [[...c.upperLipBottom, ...[...c.lowerLipTop].reverse()]] : [],
          },
        ]
      : [];

  // Capelli: una fascia sopra la fronte e due alle tempie.
  const hair: Region[] = [
    rect(cx - w * 0.3, top - h * 0.2, cx + w * 0.3, top - h * 0.02),
    rect(left - w * 0.12, top + h * 0.02, left + w * 0.02, browTop),
    rect(right - w * 0.02, top + h * 0.02, right + w * 0.12, browTop),
  ];

  return { skin, hair, eyes, lips, brows };
}

// ---------- Pixel ----------

interface Sample {
  rgb: Rgb;
  x: number;
  /** Posizione verticale (per sapere cosa è vicino alla fronte). */
  y: number;
}

/** I pixel dentro le zone (al massimo `maxSamples`, presi a griglia). */
export function collectPixels(img: Img, regions: readonly Region[], maxSamples = 5000): Sample[] {
  let area = 0;
  for (const r of regions) {
    const bx = regionBox(r);
    area += Math.max(0, bx.x1 - bx.x0) * Math.max(0, bx.y1 - bx.y0);
  }
  const step = Math.max(1, Math.ceil(Math.sqrt(area / maxSamples)));
  const out: Sample[] = [];
  for (const r of regions) {
    const bx = regionBox(r);
    const x0 = Math.max(0, Math.floor(bx.x0));
    const y0 = Math.max(0, Math.floor(bx.y0));
    const x1 = Math.min(img.width - 1, Math.ceil(bx.x1));
    const y1 = Math.min(img.height - 1, Math.ceil(bx.y1));
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        if (!inRegion([x + 0.5, y + 0.5], r)) continue;
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3]! < 200) continue;
        out.push({ rgb: [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!], x, y });
      }
    }
  }
  return out;
}

export function applyGains(rgb: Rgb, gains: Gains): Rgb {
  return [Math.min(255, rgb[0] * gains[0]), Math.min(255, rgb[1] * gains[1]), Math.min(255, rgb[2] * gains[2])];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Colore robusto: scarta la parte più scura (ombre) e più chiara (riflessi) per luminosità,
 * poi prende la mediana di ogni componente. Null se ci sono troppo pochi pixel.
 */
export function robustLab(labs: readonly Lab[], dropDark = 0.15, dropLight = 0.15, minCount = 12): Lab | null {
  if (labs.length < minCount) return null;
  const sorted = [...labs].sort((a, b) => a[0] - b[0]);
  const from = Math.floor(sorted.length * dropDark);
  const to = Math.max(from + 1, Math.ceil(sorted.length * (1 - dropLight)));
  const kept = sorted.slice(from, to);
  return [median(kept.map((l) => l[0])), median(kept.map((l) => l[1])), median(kept.map((l) => l[2]))];
}

const toLab = (rgb: Rgb, gains: Gains): Lab => rgbToLab(...applyGains(rgb, gains));

// ---------- Bilanciamento del bianco ----------

/** Moltiplicatori che rendono neutro un colore di riferimento (bianco o grigio). */
export function gainsFromReference(ref: Rgb, strength = 1, limit = 0.25): Gains {
  const mean = (ref[0] + ref[1] + ref[2]) / 3;
  if (mean < 30) return NO_GAINS;
  return ref.map((v) => {
    const full = mean / Math.max(1, v);
    const g = 1 + (full - 1) * strength;
    return Math.min(1 + limit, Math.max(1 - limit, g));
  }) as unknown as Gains;
}

function meanRgb(px: readonly Rgb[]): Rgb {
  const n = px.length || 1;
  return [px.reduce((a, p) => a + p[0], 0) / n, px.reduce((a, p) => a + p[1], 0) / n, px.reduce((a, p) => a + p[2], 0) / n];
}

/**
 * Bianco degli occhi: i pixel più chiari e poco colorati dentro le palpebre. La correzione è
 * parziale e limitata (il bianco degli occhi non è mai bianco puro). Null se non si trova.
 */
export function scleraReference(img: Img, eyes: readonly Region[]): Rgb | null {
  const px = collectPixels(img, eyes, 3000).map((s) => s.rgb);
  if (px.length < 30) return null;
  const withL = px.map((rgb) => ({ rgb, lab: rgbToLab(...rgb) })).sort((a, b) => b.lab[0] - a.lab[0]);
  const bright = withL.slice(0, Math.max(8, Math.floor(withL.length * 0.25))).filter((p) => chromaOf(p.lab) < 35 && p.lab[0] > 45);
  if (bright.length < 6) return null;
  return meanRgb(bright.map((p) => p.rgb));
}

// ---------- Le cinque zone ----------

/** Iride: dentro un cerchio al centro dell'occhio, senza bianco (chiari) né pupilla e ciglia (scuri). */
export function irisLab(img: Img, eye: Region, gains: Gains): Lab | null {
  if (eye.kind !== 'polygon') return robustLab(collectPixels(img, [eye]).map((s) => toLab(s.rgb, gains)), 0.25, 0.3, 8);
  const ys = eye.points.map((p) => p[1]);
  const opening = Math.max(...ys) - Math.min(...ys);
  const circle: Region = { kind: 'circle', center: centroid(eye.points), radius: Math.max(2, opening * 0.5) };
  const labs = collectPixels(img, [circle], 1500)
    .filter((s) => inRegion([s.x + 0.5, s.y + 0.5], eye))
    .map((s) => toLab(s.rgb, gains));
  return robustLab(labs, 0.25, 0.3, 8);
}

export interface HairResult {
  lab: Lab | null;
  /** Quanto è sicuro (0-1): basso se la fascia sopra la fronte mescola colori diversi. */
  confidence: number;
}

/**
 * Capelli: i pixel delle fasce, senza quelli simili alla pelle, divisi in 3 gruppi di colore.
 * Vince il gruppo più presente nella parte vicina alla fronte (lo sfondo sta più in alto).
 */
export function hairLab(img: Img, regions: readonly Region[], skin: Lab | null, foreheadTop: number, gains: Gains): HairResult {
  const px = collectPixels(img, regions, 4000).map((s) => ({ lab: toLab(s.rgb, gains), y: s.y }));
  const notSkin = skin ? px.filter((p) => deltaE(p.lab, skin) > 12) : px;
  if (notSkin.length < 25) return { lab: null, confidence: 0 };
  const clusters = kmeans(
    notSkin.map((p) => p.lab),
    3,
  );
  const nearest = (lab: Lab) => {
    let best = 0;
    let bestD = Infinity;
    clusters.forEach((c, i) => {
      const d = deltaE(lab, c.center);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const ys = notSkin.map((p) => p.y);
  const yTop = Math.min(...ys);
  const near = notSkin.filter((p) => p.y >= foreheadTop - (foreheadTop - yTop) * 0.5);
  const pool = near.length >= 15 ? near : notSkin;
  const counts = clusters.map(() => 0);
  for (const p of pool) counts[nearest(p.lab)]! += 1;
  const best = counts.indexOf(Math.max(...counts));
  const members = notSkin.filter((p) => nearest(p.lab) === best).map((p) => p.lab);
  return { lab: robustLab(members, 0.1, 0.2, 10), confidence: Math.round((counts[best]! / pool.length) * 100) / 100 };
}

export interface FaceAnalysis {
  features: Record<FeatureId, Lab | null>;
  regions: FaceRegions;
  gains: Gains;
  hairConfidence: number;
  warnings: string[];
}

/** Analisi automatica di un viso trovato da ML Kit. `reference` = bianco toccato dall'utente. */
export function analyzeFace(img: Img, face: FaceGeometry, reference: Rgb | null = null): FaceAnalysis {
  const regions = faceRegions(face);
  const warnings: string[] = [];
  const sclera = scleraReference(img, regions.eyes);
  let gains: Gains = NO_GAINS;
  if (reference) gains = gainsFromReference(reference, 1, 0.3);
  else if (sclera) gains = gainsFromReference(sclera, 0.6, 0.12);
  if (!reference && sclera) {
    const cast = rgbToLab(...sclera);
    if (cast[2] > 14) warnings.push('La luce è molto calda (lampadina?): con la luce del giorno il risultato è più preciso.');
    else if (cast[2] < -8) warnings.push('La luce è molto fredda o bluastra: con la luce del giorno il risultato è più preciso.');
  }

  const skin = robustLab(collectPixels(img, regions.skin).map((s) => toLab(s.rgb, gains)));
  const brows = robustLab(
    collectPixels(img, regions.brows).map((s) => toLab(s.rgb, gains)),
    0.05,
    0.5,
  );
  const irises = regions.eyes.map((e) => irisLab(img, e, gains)).filter((l): l is Lab => !!l);
  const eyes = irises.length ? (irises.length === 1 ? irises[0]! : averageLab(irises)) : null;
  const lips = robustLab(collectPixels(img, regions.lips).map((s) => toLab(s.rgb, gains)));
  const top = face.contours.face?.length ? Math.min(...face.contours.face.map((p) => p[1])) : face.bounds.y;
  const hair = top > img.height * 0.03 ? hairLab(img, regions.hair, skin, top, gains) : { lab: null, confidence: 0 };

  const faceW = face.bounds.width;
  if (faceW < img.width * 0.22) warnings.push('Il viso è piccolo nella foto: avvicinati per una misura più precisa.');
  if (Math.abs(face.angles.y) > 20 || Math.abs(face.angles.z) > 20) warnings.push('La testa è girata: guarda dritto verso la fotocamera.');
  if (skin && skin[0] < 28) warnings.push('La foto è scura: cerca più luce.');
  if (skin && skin[0] > 90) warnings.push('C’è troppa luce sul viso: evita il sole diretto e il flash.');
  if (!hair.lab) warnings.push('Non ho trovato i capelli: toccali nella foto con “Correggi”.');
  else if (hair.confidence < 0.45) warnings.push('Non sono sicuro del colore dei capelli: controllalo e, se serve, correggilo toccandoli.');
  if (!eyes) warnings.push('Non ho trovato bene gli occhi: puoi toccarli nella foto.');

  return { features: { skin, hair: hair.lab, eyes, lips, brows }, regions, gains, hairConfidence: hair.confidence, warnings };
}

export function averageLab(labs: readonly Lab[]): Lab {
  const n = labs.length || 1;
  return [labs.reduce((a, l) => a + l[0], 0) / n, labs.reduce((a, l) => a + l[1], 0) / n, labs.reduce((a, l) => a + l[2], 0) / n];
}

/** Colore di una zona toccata a mano (cerchio intorno al dito). */
export function sampleAt(img: Img, center: Point, radius: number, feature: FeatureId, gains: Gains): Lab | null {
  const circle: Region = { kind: 'circle', center, radius };
  const labs = collectPixels(img, [circle], 1500).map((s) => toLab(s.rgb, gains));
  if (feature === 'eyes') return robustLab(labs, 0.25, 0.3, 6);
  if (feature === 'brows') return robustLab(labs, 0.05, 0.5, 6);
  return robustLab(labs, 0.15, 0.15, 6);
}

/** Il bianco toccato a mano: media dei pixel (per il bilanciamento). */
export function referenceAt(img: Img, center: Point, radius: number): Rgb | null {
  const px = collectPixels(img, [{ kind: 'circle', center, radius }], 800).map((s) => s.rgb);
  if (px.length < 6) return null;
  return meanRgb(px);
}

/** I colori che servono all'analisi (la pelle è indispensabile). */
export function toFaceFeatures(f: Record<FeatureId, Lab | null>): FaceFeatures | null {
  if (!f.skin) return null;
  return { skin: f.skin, hair: f.hair, eyes: f.eyes, lips: f.lips, brows: f.brows };
}

// ---------- Correzioni a mano ----------

/** Un punto toccato sulla foto, con il raggio del cerchio misurato. */
export interface ManualSample {
  point: Point;
  radius: number;
}

/** Raggio del cerchio misurato quando si tocca la foto (gli occhi sono piccoli). */
export function manualRadius(target: FeatureId | 'white', width: number, height: number): number {
  const side = Math.max(width, height);
  const share: Record<FeatureId | 'white', number> = { skin: 0.025, hair: 0.025, eyes: 0.009, lips: 0.012, brows: 0.008, white: 0.02 };
  return Math.max(3, side * share[target]);
}

/** I colori finali: quelli toccati a mano vincono su quelli trovati da soli. */
export function resolveFeatures(
  img: Img,
  auto: Record<FeatureId, Lab | null> | null,
  overrides: Partial<Record<FeatureId, ManualSample>>,
  gains: Gains,
): Record<FeatureId, Lab | null> {
  const out = {} as Record<FeatureId, Lab | null>;
  for (const f of Object.keys(FEATURE_LABEL) as FeatureId[]) {
    const m = overrides[f];
    out[f] = m ? sampleAt(img, m.point, m.radius, f, gains) : (auto?.[f] ?? null);
  }
  return out;
}

/** Il riquadro del viso con un po' di margine (per "Prova i colori"). */
export function faceCrop(face: FaceGeometry | null, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const b = face?.bounds ?? { x: width * 0.2, y: height * 0.15, width: width * 0.6, height: height * 0.6 };
  const x0 = Math.max(0, Math.round(b.x - b.width * 0.3));
  const y0 = Math.max(0, Math.round(b.y - b.height * 0.4));
  const x1 = Math.min(width, Math.round(b.x + b.width * 1.3));
  const y1 = Math.min(height, Math.round(b.y + b.height * 1.15));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
