import type { PhotoKind } from '../db/types';
import { deltaE, kmeans, rgbToLab, type Lab } from './colors';
import { NO_GAINS, applyGains, collectPixels, gainsFromReference, robustLab, type FeatureId, type Gains, type Point, type Rgb } from './faceColors';
import type { Img } from './imageOps';

// Foto da vicino per l'armocromia (SPEC.md, sezione 8.6): un occhio e una ciocca di capelli.
// Da lontano le fotocamere dei telefoni sbagliano i colori delle parti piccole del viso:
// qui l'iride è grande e si misura con cura. Funzioni pure.

export type CloseupKind = Exclude<PhotoKind, 'face'>;

export interface Circle {
  center: Point;
  radius: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEG = Math.PI / 180;

function median(values: readonly number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const toLab = (rgb: Rgb, gains: Gains): Lab => rgbToLab(...applyGains(rgb, gains));
const chromaOf = (lab: Lab): number => Math.hypot(lab[1], lab[2]);

// ---------- Mappa ridotta (luminosità e saturazione) ----------

/** Una parte della foto ridotta: per ogni punto il colore Lab (L, a, b) e la saturazione C. */
export interface LabMap {
  width: number;
  height: number;
  /** Quanti pixel della foto, per lato, finiscono in un punto della mappa. */
  step: number;
  /** Angolo in alto a sinistra della parte di foto, in pixel della foto. */
  x0: number;
  y0: number;
  L: Float32Array;
  A: Float32Array;
  B: Float32Array;
  C: Float32Array;
}

function clampBox(b: Box, img: Img): Box {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(b.x)));
  const y = Math.min(img.height - 1, Math.max(0, Math.floor(b.y)));
  const x1 = Math.min(img.width, Math.ceil(b.x + b.w));
  const y1 = Math.min(img.height, Math.ceil(b.y + b.h));
  return { x, y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y) };
}

/** Riduce una parte della foto (tutta se `box` è null): ogni punto è la media di `step`×`step` pixel. */
export function labMap(img: Img, box: Box | null, step: number): LabMap {
  const b = clampBox(box ?? { x: 0, y: 0, w: img.width, h: img.height }, img);
  const s = Math.max(1, Math.floor(step));
  const width = Math.max(1, Math.floor(b.w / s));
  const height = Math.max(1, Math.floor(b.h / s));
  const L = new Float32Array(width * height);
  const A = new Float32Array(width * height);
  const B = new Float32Array(width * height);
  const C = new Float32Array(width * height);
  // Al massimo 4×4 pixel letti per punto: basta per la media e resta veloce.
  const sub = Math.min(s, 4);
  const inc = s / sub;
  for (let my = 0; my < height; my++) {
    for (let mx = 0; mx < width; mx++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      for (let j = 0; j < sub; j++) {
        const y = Math.min(img.height - 1, b.y + my * s + Math.floor(j * inc));
        for (let k = 0; k < sub; k++) {
          const x = Math.min(img.width - 1, b.x + mx * s + Math.floor(k * inc));
          const i = (y * img.width + x) * 4;
          r += img.data[i]!;
          g += img.data[i + 1]!;
          bl += img.data[i + 2]!;
          n++;
        }
      }
      const lab = rgbToLab(r / n, g / n, bl / n);
      const k = my * width + mx;
      L[k] = lab[0];
      A[k] = lab[1];
      B[k] = lab[2];
      C[k] = Math.hypot(lab[1], lab[2]);
    }
  }
  return { width, height, step: s, x0: b.x, y0: b.y, L, A, B, C };
}

/** Valore interpolato nel punto (coordinate della mappa); NaN fuori dalla mappa. */
function at(map: LabMap, arr: Float32Array, x: number, y: number): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  if (!(fx >= 0 && fy >= 0 && fx <= map.width - 1 && fy <= map.height - 1)) return NaN;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(map.width - 1, x0 + 1);
  const y1 = Math.min(map.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const w = map.width;
  const top = arr[y0 * w + x0]! * (1 - tx) + arr[y0 * w + x1]! * tx;
  const bottom = arr[y1 * w + x0]! * (1 - tx) + arr[y1 * w + x1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

const toMap = (map: LabMap, p: Point): Point => [(p[0] - map.x0) / map.step, (p[1] - map.y0) / map.step];
const fromMap = (map: LabMap, p: Point): Point => [map.x0 + p[0] * map.step, map.y0 + p[1] * map.step];

// ---------- Cerchio dai punti ----------

/** Il cerchio che passa meglio per i punti (minimi quadrati). Null con meno di 3 punti o se sono in fila. */
export function fitCircle(points: readonly Point[]): Circle | null {
  const n = points.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p[0];
    my += p[1];
  }
  mx /= n;
  my /= n;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of points) {
    const u = p[0] - mx;
    const v = p[1] - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9 * Math.max(1, suu * svv)) return null;
  const b1 = 0.5 * (suuu + suvv);
  const b2 = 0.5 * (svvv + svuu);
  const uc = (b1 * svv - b2 * suv) / det;
  const vc = (suu * b2 - suv * b1) / det;
  return { center: [uc + mx, vc + my], radius: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

// ---------- Ricerca dell'iride ----------

const dir = (deg: number): Point => [Math.cos(deg * DEG), Math.sin(deg * DEG)];
// Angoli in gradi con l'asse y verso il basso (90 = giù, -90 = su): a destra e a sinistra
// dell'iride, più in basso che in alto (in alto c'è la palpebra).
const SIDE_RIGHT = [-30, -15, 0, 15, 30, 45].map(dir);
const SIDE_LEFT = [210, 195, 180, 165, 150, 135].map(dir);
// Giro dentro l'iride, senza la parte alta.
const RING = [0, 30, 60, 90, 120, 150, 180, 210, 330].map(dir);
// Sopra e sotto il cerchio.
const ABOVE = [255, 270, 285].map(dir);
const BELOW = [75, 90, 105].map(dir);

/** Distanza tra il primo e il terzo quartile: quanto variano i valori, senza gli estremi. */
function spreadOf(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * 0.75)]! - s[Math.floor((s.length - 1) * 0.25)]!;
}

interface Score {
  score: number;
  /** Luminosità appena dentro il cerchio ai lati. */
  innerL: number;
  /** Luminosità e saturazione appena fuori dal cerchio ai lati (il bianco dell'occhio). */
  outerL: number;
  outerC: number;
}

interface Candidate extends Score {
  x: number;
  y: number;
  r: number;
}

/**
 * Quanto il cerchio sembra un'iride: lungo i raggi verso destra e verso sinistra, poco dentro
 * il cerchio è scuro e poco fuori è chiaro e poco colorato (il bianco dell'occhio); dentro, i due
 * lati e il giro intorno alla pupilla hanno lo stesso colore (un cerchio a metà tra pupilla,
 * riflesso e iride no). Si usano le mediane, così un riflesso o le ciglia su un raggio non
 * cambiano il risultato. Null se il cerchio esce dalla mappa.
 */
function scoreAt(map: LabMap, cx: number, cy: number, r: number, spread = 0.2, floor = -Infinity): Score | null {
  const side = (dirs: readonly Point[]) => {
    const edges: number[] = [];
    const li: number[] = [];
    const lo: number[] = [];
    const co: number[] = [];
    for (const d of dirs) {
      const lin = at(map, map.L, cx + d[0] * r * (1 - spread), cy + d[1] * r * (1 - spread));
      const x = cx + d[0] * r * (1 + spread);
      const y = cy + d[1] * r * (1 + spread);
      const lout = at(map, map.L, x, y);
      if (Number.isNaN(lin) || Number.isNaN(lout)) return null;
      edges.push(lout - lin);
      li.push(lin);
      lo.push(lout);
      co.push(at(map, map.C, x, y));
    }
    return { edge: median(edges), inner: median(li), l: median(lo), c: median(co) };
  };
  const right = side(SIDE_RIGHT);
  const left = right && side(SIDE_LEFT);
  if (!right || !left) return null;
  const outerL = (right.l + left.l) / 2;
  const outerC = (right.c + left.c) / 2;
  // Le altre prove possono solo abbassare il punteggio: se è già sotto `floor`, si salta il resto.
  let score = Math.min(right.edge, left.edge) - 0.6 * Math.max(0, outerC - 14) - 0.5 * Math.abs(right.inner - left.inner);
  if (score < floor) return null;
  const ring: number[] = [];
  const ringA: number[] = [];
  const ringB: number[] = [];
  for (const d of RING) {
    const x = cx + d[0] * r * 0.72;
    const y = cy + d[1] * r * 0.72;
    const v = at(map, map.L, x, y);
    if (Number.isNaN(v)) return null;
    ring.push(v);
    ringA.push(at(map, map.A, x, y));
    ringB.push(at(map, map.B, x, y));
  }
  score -= 0.5 * spreadOf(ring);
  if (score < floor) return null;
  const inside: Lab = [median(ring), median(ringA), median(ringB)];
  // Una striscia scura tra due zone chiare (una ciocca, un'ombra) continua uguale sopra e sotto;
  // l'iride no: sopra e sotto ci sono palpebre, ciglia o il bianco dell'occhio.
  const away = (dirs: readonly Point[]) => {
    const ls: number[] = [];
    const as: number[] = [];
    const bs: number[] = [];
    for (const d of dirs) {
      const x = cx + d[0] * r * 1.25;
      const y = cy + d[1] * r * 1.25;
      const v = at(map, map.L, x, y);
      if (Number.isNaN(v)) return NaN;
      ls.push(v);
      as.push(at(map, map.A, x, y));
      bs.push(at(map, map.B, x, y));
    }
    return deltaE([median(ls), median(as), median(bs)], inside);
  };
  // Se sopra o sotto si esce dalla foto, conta il lato che si vede.
  const seen = [away(ABOVE), away(BELOW)].filter((v) => !Number.isNaN(v));
  const band = seen.length ? Math.max(...seen) : Infinity;
  score -= 4 * Math.max(0, 10 - band);
  return { score, innerL: (right.inner + left.inner) / 2, outerL, outerC };
}

function radiiBetween(rMin: number, rMax: number, ratio = 1.15): number[] {
  const out: number[] = [];
  for (let r = rMin; r <= rMax * 1.0001; r *= ratio) out.push(r);
  return out;
}

const overlaps = (a: Candidate, b: Candidate) => Math.hypot(a.x - b.x, a.y - b.y) < 0.6 * Math.max(a.r, b.r) && Math.max(a.r, b.r) < 1.6 * Math.min(a.r, b.r);

/** Tiene i `keep` cerchi migliori, senza doppioni (cerchi quasi uguali contano una volta). */
function addCandidate(list: Candidate[], c: Candidate, keep: number): void {
  const twin = list.findIndex((o) => overlaps(o, c));
  if (twin >= 0) {
    if (c.score > list[twin]!.score) list[twin] = c;
  } else if (list.length < keep) {
    list.push(c);
  } else {
    const worst = list.reduce((w, o, i) => (o.score < list[w]!.score ? i : w), 0);
    if (c.score > list[worst]!.score) list[worst] = c;
  }
  list.sort((a, b) => b.score - a.score);
}

/**
 * I cerchi migliori con il centro nel rettangolo (x0, y0)-(x1, y1), dal più probabile.
 * `stepShare` = passo della griglia rispetto al raggio.
 */
function search(
  map: LabMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radii: readonly number[],
  spread = 0.2,
  stepShare = 0.25,
  keep = 1,
): Candidate[] {
  const list: Candidate[] = [];
  for (const r of radii) {
    const st = Math.max(1, r * stepShare);
    for (let y = y0; y <= y1; y += st) {
      for (let x = x0; x <= x1; x += st) {
        const floor = list.length < keep ? 8 : list[list.length - 1]!.score;
        const s = scoreAt(map, x, y, r, spread, floor);
        if (s && s.score >= floor) addCandidate(list, { ...s, x, y, r }, keep);
      }
    }
  }
  return list;
}

/**
 * Negli occhi chiari anche la pupilla è un cerchio scuro su fondo più chiaro: se intorno al
 * cerchio trovato ce n'è uno più grande che ha dentro il colore che c'era fuori (l'iride) e fuori
 * un bianco più chiaro, l'iride è quello.
 */
function widen(map: LabMap, found: Candidate): Candidate {
  let cur = found;
  for (let round = 0; round < 2; round++) {
    let next: Candidate | null = null;
    for (const r of radiiBetween(cur.r * 1.5, cur.r * 4)) {
      const st = Math.max(1, Math.round(r / 6));
      const span = r * 0.35;
      for (let y = cur.y - span; y <= cur.y + span; y += st) {
        for (let x = cur.x - span; x <= cur.x + span; x += st) {
          const s = scoreAt(map, x, y, r);
          if (!s || s.score < 8 || s.outerL < cur.outerL + 8 || Math.abs(s.innerL - cur.outerL) > 12) continue;
          if (!next || s.score > next.score) next = { ...s, x, y, r };
        }
      }
    }
    if (!next) break;
    cur = next;
  }
  return cur;
}

// ---------- Bordo dell'iride lungo i raggi ----------

// Raggi verso destra e sinistra, più verso il basso che verso l'alto (lì c'è la palpebra).
const RAYS: number[] = [];
for (let a = -30; a <= 52.5; a += 7.5) RAYS.push(a, 180 - a);

interface Edge {
  point: Point;
  strength: number;
}

/**
 * Sul raggio dal centro: l'ultimo salto netto da scuro a chiaro, con fuori un colore poco saturo
 * (il bianco dell'occhio). Più dentro ci possono essere la pupilla e i riflessi.
 */
function edgeOnRay(map: LabMap, cx: number, cy: number, r: number, deg: number, cMax: number): Edge | null {
  const [dx, dy] = dir(deg);
  const dt = Math.max(0.35, r / 40);
  const ts: number[] = [];
  const ls: number[] = [];
  const cs: number[] = [];
  for (let t = 0.5 * r; t <= 1.7 * r; t += dt) {
    const x = cx + dx * t;
    const y = cy + dy * t;
    const l = at(map, map.L, x, y);
    if (Number.isNaN(l)) break;
    ts.push(t);
    ls.push(l);
    cs.push(at(map, map.C, x, y));
  }
  const w = Math.max(2, Math.round((0.12 * r) / dt));
  if (ts.length < 2 * w + 3) return null;
  const edge: number[] = ts.map(() => -Infinity);
  for (let i = w; i < ts.length - w; i++) {
    let lin = 0;
    let lout = 0;
    let cout = 0;
    for (let k = 1; k <= w; k++) {
      lin += ls[i - k]!;
      lout += ls[i + k]!;
      cout += cs[i + k]!;
    }
    if (cout / w <= cMax) edge[i] = (lout - lin) / w;
  }
  const max = Math.max(...edge);
  if (!(max >= 6)) return null;
  const min = Math.max(6, max * 0.45);
  for (let i = ts.length - w - 1; i >= w; i--) {
    const e = edge[i]!;
    if (e >= min && e >= edge[i - 1]! && e >= (edge[i + 1] ?? -Infinity)) {
      return { point: [cx + dx * ts[i]!, cy + dy * ts[i]!], strength: e };
    }
  }
  return null;
}

interface Refined {
  x: number;
  y: number;
  r: number;
  /** Quota dei raggi che stanno sul cerchio (0-1). */
  confidence: number;
  /** Salto di luminosità medio sul bordo. */
  strength: number;
}

function refine(map: LabMap, cx: number, cy: number, r: number, cMax: number): Refined | null {
  let x = cx;
  let y = cy;
  let rr = r;
  let result: Refined | null = null;
  for (let iter = 0; iter < 2; iter++) {
    const edges = RAYS.map((a) => edgeOnRay(map, x, y, rr, a, cMax)).filter((e): e is Edge => {
      if (!e) return false;
      const d = Math.hypot(e.point[0] - x, e.point[1] - y);
      return d >= 0.6 * rr && d <= 1.45 * rr;
    });
    let kept = edges;
    let circle: Circle | null = null;
    for (let round = 0; round < 3; round++) {
      const sides = kept.filter((e) => e.point[0] > x).length;
      if (kept.length < 6 || sides < 2 || kept.length - sides < 2) {
        circle = null;
        break;
      }
      circle = fitCircle(kept.map((e) => e.point));
      if (!circle) break;
      const c = circle;
      const tol = Math.max(1, c.radius * 0.08);
      const inliers = edges.filter((e) => Math.abs(Math.hypot(e.point[0] - c.center[0], e.point[1] - c.center[1]) - c.radius) <= tol);
      if (inliers.length === kept.length) break;
      kept = inliers;
    }
    if (!circle) return result;
    const shift = Math.hypot(circle.center[0] - x, circle.center[1] - y);
    if (circle.radius < 0.6 * rr || circle.radius > 1.45 * rr || shift > 0.6 * rr) return result;
    result = {
      x: circle.center[0],
      y: circle.center[1],
      r: circle.radius,
      confidence: kept.length / RAYS.length,
      strength: median(kept.map((e) => e.strength)),
    };
    x = result.x;
    y = result.y;
    rr = result.r;
  }
  return result;
}

/** La pupilla: dove la luminosità dal centro sale a metà strada verso quella dell'iride. */
function pupilRadius(map: LabMap, cx: number, cy: number, r: number): number {
  const rings = 18;
  const values: number[] = [];
  for (let k = 0; k < rings; k++) {
    const t = ((k + 0.5) / rings) * r;
    const ls: number[] = [];
    for (let a = 0; a < 360; a += 15) {
      if (a > 210 && a < 330) continue; // in alto c'è la palpebra
      const v = at(map, map.L, cx + Math.cos(a * DEG) * t, cy + Math.sin(a * DEG) * t);
      if (!Number.isNaN(v)) ls.push(v);
    }
    values.push(median(ls));
  }
  const l0 = median(values.slice(0, 3));
  const li = median(values.filter((_, k) => (k + 0.5) / rings >= 0.6 && (k + 0.5) / rings <= 0.85));
  if (!(li - l0 >= 10)) return 0.35 * r;
  const half = l0 + (li - l0) / 2;
  const k = values.findIndex((v, i) => i >= 1 && v >= half);
  if (k < 1) return 0.35 * r;
  const prev = values[k - 1]!;
  const frac = values[k]! === prev ? 0 : Math.min(1, Math.max(0, (half - prev) / (values[k]! - prev)));
  return Math.min(0.65 * r, Math.max(0.18 * r, ((k - 0.5 + frac) / rings) * r));
}

/** Iride e pupilla trovate in una foto da vicino, in pixel della foto. */
export interface IrisFit {
  iris: Circle;
  pupil: Circle;
  /** Quota dei raggi che stanno sul cerchio (0-1). */
  confidence: number;
  /** Salto di luminosità sul bordo dell'iride (bordo netto = numero alto). */
  strength: number;
}

/**
 * Cerca l'iride: in tutta la foto oppure intorno al punto toccato (`seed`). Prima un cerchio
 * scuro con il bianco ai lati su una copia ridotta della foto, poi il bordo preciso lungo i raggi
 * su una copia più dettagliata intorno all'occhio. Null se non c'è un'iride chiara.
 */
export function locateIris(img: Img, seed: Point | null): IrisFit | null {
  const minSide = Math.min(img.width, img.height);
  let coarse: LabMap;
  let found: Candidate[];
  if (seed) {
    const side = minSide * 0.5;
    coarse = labMap(img, { x: seed[0] - side / 2, y: seed[1] - side / 2, w: side, h: side }, Math.ceil(side / 300));
    const s = toMap(coarse, seed);
    const span = Math.max(coarse.width, coarse.height) * 0.25;
    const radii = radiiBetween(3, Math.max(4, Math.min(coarse.width, coarse.height) * 0.3));
    found = search(coarse, s[0] - span, s[1] - span, s[0] + span, s[1] + span, radii, 0.2, 0.25, 4);
  } else {
    coarse = labMap(img, null, Math.ceil(Math.max(img.width, img.height) / 400));
    const m = Math.min(coarse.width, coarse.height);
    const radii = radiiBetween(Math.max(3, m * 0.025), m * 0.25);
    found = search(coarse, coarse.width * 0.1, coarse.height * 0.1, coarse.width * 0.9, coarse.height * 0.9, radii, 0.2, 0.25, 4);
  }
  // Sulla copia ridotta i cerchi si provano a passi larghi: si tengono i migliori e si
  // confrontano sulla copia dettagliata intorno a ognuno (il raggio diventa di circa 40 punti).
  const tried: Candidate[] = [];
  let best: { fine: LabMap; at: Candidate; outerC: number } | null = null;
  for (const f of found) {
    const cand = widen(coarse, f);
    if (tried.some((t) => overlaps(t, cand))) continue;
    tried.push(cand);
    const center = fromMap(coarse, [cand.x, cand.y]);
    const r = cand.r * coarse.step;
    const half = r * 2.6;
    const fine = labMap(img, { x: center[0] - half, y: center[1] - half, w: half * 2, h: half * 2 }, Math.max(1, Math.floor(r / 40)));
    const c = toMap(fine, center);
    const rf = r / fine.step;
    const span = rf * 0.3;
    const precise = search(fine, c[0] - span, c[1] - span, c[0] + span, c[1] + span, radiiBetween(rf * 0.75, rf * 1.35, 1.04), 0.1, 1 / 12)[0];
    if (precise && (!best || precise.score > best.at.score)) best = { fine, at: precise, outerC: cand.outerC };
  }
  if (!best) return null;

  // Il bordo preciso lungo i raggi.
  const { fine, at: precise } = best;
  const refined = refine(fine, precise.x, precise.y, precise.r, Math.max(22, best.outerC + 10));
  if (!refined) return null;
  const irisCenter = fromMap(fine, [refined.x, refined.y]);
  const irisR = refined.r * fine.step;
  const pupilR = pupilRadius(fine, refined.x, refined.y, refined.r) * fine.step;
  return {
    iris: { center: irisCenter, radius: irisR },
    pupil: { center: irisCenter, radius: pupilR },
    confidence: Math.round(refined.confidence * 100) / 100,
    strength: Math.round(refined.strength * 10) / 10,
  };
}

// ---------- Colore dell'occhio ----------

/**
 * Il bianco dell'occhio a destra e a sinistra dell'iride: i pixel più chiari e poco colorati
 * (senza quelli bruciati). Null se non ce ne sono abbastanza.
 */
export function scleraBeside(img: Img, iris: Circle): Rgb | null {
  return scleraSides(img, iris).rgb;
}

/** Il bianco dell'occhio e la luminosità della parte più chiara ai lati (per dire se la foto è scura). */
function scleraSides(img: Img, iris: Circle): { rgb: Rgb | null; brightL: number } {
  const [cx, cy] = iris.center;
  const r = iris.radius;
  const px: Rgb[] = [];
  for (const sideSign of [-1, 1]) {
    const xa = cx + sideSign * r * 1.12;
    const xb = cx + sideSign * r * 1.7;
    const x0 = Math.max(0, Math.min(xa, xb));
    const x1 = Math.min(img.width, Math.max(xa, xb));
    if (x1 - x0 < 3) continue;
    const b = clampBox({ x: x0, y: cy - r * 0.35, w: x1 - x0, h: r * 0.7 }, img);
    const step = Math.max(1, Math.floor(Math.sqrt((b.w * b.h) / 1500)));
    for (let y = b.y; y < b.y + b.h; y += step) {
      for (let x = b.x; x < b.x + b.w; x += step) {
        const i = (y * img.width + x) * 4;
        const rgb: Rgb = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
        if (Math.min(...rgb) >= 250) continue; // riflesso bruciato
        px.push(rgb);
      }
    }
  }
  if (px.length < 20) return { rgb: null, brightL: NaN };
  const withL = px.map((rgb) => ({ rgb, lab: rgbToLab(...rgb) })).sort((a, b) => b.lab[0] - a.lab[0]);
  const top = withL.slice(0, Math.max(10, Math.floor(withL.length * 0.3)));
  const brightL = median(top.map((p) => p.lab[0]));
  const bright = top.filter((p) => chromaOf(p.lab) < 30 && p.lab[0] > 45);
  if (bright.length < 10) return { rgb: null, brightL };
  const n = bright.length;
  return {
    rgb: [bright.reduce((a, p) => a + p.rgb[0], 0) / n, bright.reduce((a, p) => a + p.rgb[1], 0) / n, bright.reduce((a, p) => a + p.rgb[2], 0) / n],
    brightL,
  };
}

/** I pixel dell'anello dell'iride: senza pupilla, bordo esterno, parte alta (palpebra) e riflessi. */
function irisPixels(img: Img, fit: IrisFit, gains: Gains): { labs: Lab[]; glare: number } {
  const [cx, cy] = fit.iris.center;
  const R = fit.iris.radius;
  const inner = fit.pupil.radius + (R - fit.pupil.radius) * 0.15;
  const outer = R * 0.88;
  const b = clampBox({ x: cx - outer, y: cy - outer, w: outer * 2, h: outer * 2 }, img);
  const step = Math.max(1, Math.floor(Math.sqrt((Math.PI * outer * outer) / 6000)));
  const labs: Lab[] = [];
  let glare = 0;
  for (let y = b.y; y < b.y + b.h; y += step) {
    for (let x = b.x; x < b.x + b.w; x += step) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d < inner || d > outer) continue;
      if (dy < 0 && Math.abs(dx) < -dy * 1.7) continue; // spicchio in alto, sotto la palpebra
      const i = (y * img.width + x) * 4;
      const lab = toLab([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!], gains);
      if (lab[0] > 82 && chromaOf(lab) < 14) {
        glare++;
        continue;
      }
      labs.push(lab);
    }
  }
  return { labs, glare: labs.length + glare ? glare / (labs.length + glare) : 0 };
}

export interface EyeCloseup {
  lab: Lab | null;
  gains: Gains;
  warnings: string[];
}

/**
 * Colore dell'occhio dalla foto da vicino. La luce si corregge con il bianco toccato
 * (`reference`) oppure, in parte, con il bianco dell'occhio intorno all'iride.
 */
export function analyzeEyeCloseup(img: Img, fit: IrisFit | null, reference: Rgb | null): EyeCloseup {
  if (!fit) {
    return {
      lab: null,
      gains: reference ? gainsFromReference(reference, 1, 0.3) : NO_GAINS,
      warnings: ['Non ho trovato l’iride: tocca il centro dell’occhio nella foto.'],
    };
  }
  const warnings: string[] = [];
  const sides = scleraSides(img, fit.iris);
  const sclera = sides.rgb;
  let gains: Gains = NO_GAINS;
  if (reference) gains = gainsFromReference(reference, 1, 0.3);
  else if (sclera) gains = gainsFromReference(sclera, 0.6, 0.12);
  if (!reference && sclera) {
    const cast = rgbToLab(...sclera);
    if (cast[2] > 14) warnings.push('La luce è molto calda (lampadina?): con la luce del giorno il risultato è più preciso.');
    else if (cast[2] < -8) warnings.push('La luce è molto fredda o bluastra: con la luce del giorno il risultato è più preciso.');
    if (cast[0] < 55) warnings.push('La foto è scura: cerca più luce, vicino a una finestra.');
  }
  if (!reference && !sclera) {
    warnings.push(
      sides.brightL < 50
        ? 'La foto è scura: cerca più luce, vicino a una finestra.'
        : 'Non vedo bene il bianco dell’occhio: se puoi, tocca qualcosa di bianco nella foto per correggere la luce.',
    );
  }
  if (fit.iris.radius < 40) warnings.push('L’occhio è piccolo nella foto: avvicina il telefono o usa lo zoom.');
  if (fit.confidence < 0.5 || fit.strength < 10) {
    warnings.push('Il bordo dell’iride non è netto (foto mossa, sfocata o con poca luce): controlla il cerchio e, se è sbagliato, tocca il centro dell’occhio.');
  }
  const { labs, glare } = irisPixels(img, fit, gains);
  if (glare > 0.15) warnings.push('C’è un riflesso grande nell’occhio: rifai la foto girandoti un po’ rispetto alla finestra.');
  return { lab: robustLab(labs, 0.2, 0.2, 30), gains, warnings };
}

// ---------- Capelli da vicino ----------

export interface HairCloseup {
  lab: Lab | null;
  /** Il cerchio misurato. */
  area: Circle;
  /** Quanto è sicuro (0-1): basso se nel cerchio ci sono colori diversi. */
  confidence: number;
  warnings: string[];
}

const isPaper = (lab: Lab) => lab[0] > 85 && chromaOf(lab) < 10;

/**
 * Capelli da una foto da vicino: al centro (o dove si tocca) si dividono i colori in 4 gruppi;
 * i gruppi vicini (ciocche più chiare e più scure dello stesso colore) si uniscono e vince il
 * più presente, scartando il foglio bianco se c'è un altro gruppo abbastanza grande.
 */
export function analyzeHairCloseup(img: Img, seed: Point | null, reference: Rgb | null): HairCloseup {
  const minSide = Math.min(img.width, img.height);
  const area: Circle = seed ? { center: seed, radius: minSide * 0.07 } : { center: [img.width / 2, img.height / 2], radius: minSide * 0.2 };
  const gains = reference ? gainsFromReference(reference, 1, 0.3) : NO_GAINS;
  const labs = collectPixels(img, [{ kind: 'circle', center: area.center, radius: area.radius }], 3000).map((s) => toLab(s.rgb, gains));
  if (labs.length < 30) return { lab: null, area, confidence: 0, warnings: ['Non riesco a misurare i capelli qui: tocca la ciocca nella foto.'] };
  const clusters = kmeans(labs, 4);
  // Gruppi: i centri a meno di 16 di distanza di colore finiscono insieme.
  const group = clusters.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (deltaE(clusters[i]!.center, clusters[j]!.center) < 16) group[root(j)] = root(i);
    }
  }
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
    return root(best);
  };
  const byGroup = new Map<number, Lab[]>();
  for (const l of labs) {
    const g = nearest(l);
    const list = byGroup.get(g);
    if (list) list.push(l);
    else byGroup.set(g, [l]);
  }
  const order = [...byGroup.values()].sort((a, b) => b.length - a.length);
  let members = order[0]!;
  const paper = (list: Lab[]) => isPaper(averageOf(list));
  if (paper(members) && order[1] && order[1].length >= labs.length * 0.15) members = order[1];
  const confidence = Math.round((members.length / labs.length) * 100) / 100;
  const warnings: string[] = [];
  if (confidence < 0.5) warnings.push('Nel cerchio ci sono colori diversi: tocca il centro della ciocca.');
  return { lab: robustLab(members, 0.1, 0.2, 10), area, confidence, warnings };
}

function averageOf(labs: readonly Lab[]): Lab {
  const n = labs.length || 1;
  return [labs.reduce((a, l) => a + l[0], 0) / n, labs.reduce((a, l) => a + l[1], 0) / n, labs.reduce((a, l) => a + l[2], 0) / n];
}

// ---------- Unione delle foto ----------

/** I colori finali: quelli delle foto da vicino vincono su quelli della foto del viso. */
export function mergeCloseups(
  face: Record<FeatureId, Lab | null>,
  closeups: Partial<Record<CloseupKind, Lab | null>>,
): { features: Record<FeatureId, Lab | null>; sources: Record<FeatureId, PhotoKind> } {
  const features = { ...face };
  const sources: Record<FeatureId, PhotoKind> = { skin: 'face', hair: 'face', eyes: 'face', lips: 'face', brows: 'face' };
  for (const kind of ['eyes', 'hair'] as const) {
    const lab = closeups[kind];
    if (lab) {
      features[kind] = lab;
      sources[kind] = kind;
    }
  }
  return { features, sources };
}

/** Le foto da cui vengono i colori, nell'ordine in cui si fanno. */
export function photosUsed(sources: Record<FeatureId, PhotoKind>): PhotoKind[] {
  const used = new Set(Object.values(sources));
  return (['face', 'eyes', 'hair'] as const).filter((k) => k === 'face' || used.has(k));
}
