import { describe, expect, it } from 'vitest';
import { deltaE, rgbToLab, type Lab } from './colors';
import {
  analyzeEyeCloseup,
  analyzeHairCloseup,
  fitCircle,
  labMap,
  locateIris,
  mergeCloseups,
  photosUsed,
  scleraBeside,
  type IrisFit,
} from './closeups';
import type { FeatureId, Point } from './faceColors';
import { createImg, type Img } from './imageOps';

type Rgb = [number, number, number];

const SKIN: Rgb = [214, 168, 148];
const SCLERA: Rgb = [236, 233, 228];
const LASHES: Rgb = [45, 34, 30];
const PUPIL: Rgb = [14, 13, 16];

interface EyeOptions {
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  R?: number;
  iris: Rgb;
  pupil?: number;
  /** Moltiplicatori R, G, B della luce (dominante calda o fredda). */
  light?: Rgb;
  /** Riflesso della finestra (raggio rispetto all'iride). */
  glare?: number;
  /** Dove sta il riflesso, rispetto al centro (in raggi dell'iride). */
  glareAt?: [number, number];
}

/** Numeri pseudo-casuali ripetibili (rumore della fotocamera). */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Un occhio fotografato da vicino: pelle, bianco a mandorla, iride con raggi più chiari e più
 * scuri e bordo esterno scuro, pupilla, riflesso, ciglia sulla palpebra superiore, un po' di
 * rumore e di sfocatura.
 */
function drawEye(o: EyeOptions): Img {
  const W = o.width ?? 1200;
  const H = o.height ?? 900;
  const cx = o.cx ?? W / 2;
  const cy = o.cy ?? H / 2;
  const R = o.R ?? 110;
  const pupil = (o.pupil ?? 0.35) * R;
  const light = o.light ?? [1, 1, 1];
  const ex = cx + 0.1 * R;
  const ey = cy + 0.15 * R;
  const rx = 2.7 * R;
  const ry = 0.95 * R;
  const inAlmond = (x: number, y: number) => ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 <= 1;
  const rand = rng(7);
  const src = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let c: Rgb = SKIN;
      const e = ((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2;
      if (e > 1 && e <= 1.12 && py < ey) c = LASHES;
      if (inAlmond(px, py)) {
        c = SCLERA;
        const d = Math.hypot(px - cx, py - cy);
        if (d <= R) {
          const theta = Math.atan2(py - cy, px - cx);
          const streak = 1 + 0.08 * Math.sin(theta * 14);
          const ring = d > 0.93 * R ? 0.7 : 1;
          c = [o.iris[0] * streak * ring, o.iris[1] * streak * ring, o.iris[2] * streak * ring];
          if (d <= pupil) c = PUPIL;
          const g = o.glareAt ?? [0.3, -0.2];
          if (o.glare && Math.hypot(px - (cx + g[0] * R), py - (cy + g[1] * R)) <= o.glare * R) c = [252, 252, 252];
        }
      }
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) src[i + k] = c[k]! * light[k]! + (rand() - 0.5) * 8;
    }
  }
  // Sfocatura leggera (media 5×5), come una foto vera.
  const img = createImg(W, H, [0, 0, 0, 255]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = Math.min(H - 1, Math.max(0, y + dy));
          for (let dx = -2; dx <= 2; dx++) {
            const xx = Math.min(W - 1, Math.max(0, x + dx));
            s += src[(yy * W + xx) * 3 + k]!;
            n++;
          }
        }
        img.data[(y * W + x) * 4 + k] = s / n;
      }
    }
  }
  return img;
}

const GREEN: Rgb = [96, 112, 70];
const LIGHT_BLUE: Rgb = [128, 160, 196];
const DARK_BROWN: Rgb = [62, 40, 30];

function expectIris(fit: IrisFit | null, cx: number, cy: number, R: number) {
  expect(fit).not.toBeNull();
  const f = fit!;
  expect(Math.hypot(f.iris.center[0] - cx, f.iris.center[1] - cy)).toBeLessThan(R * 0.05);
  expect(Math.abs(f.iris.radius - R) / R).toBeLessThan(0.07);
}

describe('fitCircle', () => {
  it('trova il cerchio che passa per i punti, anche solo da due archi', () => {
    const pts: Point[] = [];
    for (let a = -40; a <= 40; a += 10) pts.push([50 + 30 * Math.cos((a * Math.PI) / 180), 70 + 30 * Math.sin((a * Math.PI) / 180)]);
    for (let a = 140; a <= 220; a += 10) pts.push([50 + 30 * Math.cos((a * Math.PI) / 180), 70 + 30 * Math.sin((a * Math.PI) / 180)]);
    const c = fitCircle(pts)!;
    expect(c.center[0]).toBeCloseTo(50, 6);
    expect(c.center[1]).toBeCloseTo(70, 6);
    expect(c.radius).toBeCloseTo(30, 6);
    expect(fitCircle(pts.slice(0, 2))).toBeNull();
    expect(
      fitCircle([
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    ).toBeNull();
  });
});

describe('labMap', () => {
  it('riduce la foto facendo la media dei pixel', () => {
    const img = createImg(8, 4, [255, 255, 255, 255]);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) img.data.set([0, 0, 0], (y * 8 + x) * 4);
    const m = labMap(img, null, 4);
    expect([m.width, m.height, m.step]).toEqual([2, 1, 4]);
    expect(m.L[0]).toBeCloseTo(0, 3);
    expect(m.L[1]).toBeCloseTo(100, 1);
    const part = labMap(img, { x: 4, y: 0, w: 4, h: 4 }, 2);
    expect([part.x0, part.width, part.height]).toEqual([4, 2, 2]);
    expect(Math.min(...part.L)).toBeGreaterThan(99);
  });
});

describe('locateIris', () => {
  it('non si confonde con un riflesso grande della finestra', () => {
    expectIris(locateIris(drawEye({ iris: GREEN, glare: 0.4 }), null), 600, 450, 110);
  });

  it('trova da sola iride e pupilla di un occhio verde', () => {
    const fit = locateIris(drawEye({ iris: GREEN, glare: 0.1 }), null);
    expectIris(fit, 600, 450, 110);
    expect(Math.abs(fit!.pupil.radius - 0.35 * 110)).toBeLessThan(110 * 0.1);
    expect(fit!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(fit!.strength).toBeGreaterThan(10);
  });

  it('negli occhi chiari con la pupilla grande non scambia la pupilla per l’iride', () => {
    const fit = locateIris(drawEye({ iris: LIGHT_BLUE, pupil: 0.55, R: 90, cx: 520, cy: 470 }), null);
    expectIris(fit, 520, 470, 90);
    expect(Math.abs(fit!.pupil.radius - 0.55 * 90)).toBeLessThan(90 * 0.1);
  });

  it('trova un occhio castano scuro, dove la pupilla quasi non si vede', () => {
    const fit = locateIris(drawEye({ iris: DARK_BROWN, R: 130 }), null);
    expectIris(fit, 600, 450, 130);
  });

  it('parte dal punto toccato, anche se non è proprio al centro', () => {
    const img = drawEye({ iris: GREEN, cx: 400, cy: 500, R: 100 });
    expectIris(locateIris(img, [440, 470]), 400, 500, 100);
  });

  it('con il dito vicino a un occhio piccolo trova quello', () => {
    const img = drawEye({ iris: GREEN, R: 26, cx: 700, cy: 300 });
    const fit = locateIris(img, [703, 296]);
    expect(fit).not.toBeNull();
    expect(Math.hypot(fit!.iris.center[0] - 700, fit!.iris.center[1] - 300)).toBeLessThan(4);
    expect(Math.abs(fit!.iris.radius - 26)).toBeLessThan(3);
  });

  it('senza un occhio nella foto non inventa niente', () => {
    expect(locateIris(createImg(600, 400, [...SKIN, 255]), null)).toBeNull();
    // Una ciocca scura tra un foglio bianco e un muro chiaro non è un'iride.
    const band = createImg(900, 700, [235, 235, 238, 255]);
    for (let y = 0; y < 700; y++) for (let x = 330; x < 600; x++) band.data.set([70, 48, 30], (y * 900 + x) * 4);
    expect(locateIris(band, null)).toBeNull();
  });

  it('è abbastanza veloce su una foto grande', () => {
    const img = drawEye({ iris: GREEN, width: 1600, height: 1200, R: 150 });
    const t0 = performance.now();
    expectIris(locateIris(img, null), 800, 600, 150);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

const labOf = (rgb: Rgb): Lab => rgbToLab(...rgb);

describe('analyzeEyeCloseup', () => {
  it('misura il colore dell’iride senza pupilla, riflesso, ciglia e bordo scuro', () => {
    const img = drawEye({ iris: GREEN, glare: 0.12 });
    const res = analyzeEyeCloseup(img, locateIris(img, null), null);
    expect(deltaE(res.lab!, labOf(GREEN))).toBeLessThan(5);
    expect(res.warnings).toEqual([]);
  });

  it('corregge in parte la luce calda con il bianco dell’occhio e lo dice', () => {
    const warm: Rgb = [1, 0.95, 0.75];
    const img = drawEye({ iris: LIGHT_BLUE, light: warm });
    const fit = locateIris(img, null);
    const res = analyzeEyeCloseup(img, fit, null);
    const raw = analyzeEyeCloseup(img, fit, [255, 255, 255]);
    expect(deltaE(res.lab!, labOf(LIGHT_BLUE))).toBeLessThan(deltaE(raw.lab!, labOf(LIGHT_BLUE)));
    expect(res.warnings.some((w) => w.includes('calda'))).toBe(true);
    // Con il bianco toccato la correzione è piena.
    const sclera = scleraBeside(img, fit!.iris)!;
    const touched = analyzeEyeCloseup(img, fit, sclera);
    expect(deltaE(touched.lab!, labOf(LIGHT_BLUE))).toBeLessThan(deltaE(res.lab!, labOf(LIGHT_BLUE)));
    expect(touched.warnings.some((w) => w.includes('calda'))).toBe(false);
  });

  it('avvisa se l’occhio è piccolo, se c’è un riflesso grande o se l’iride non c’è', () => {
    const small = drawEye({ iris: GREEN, R: 26, cx: 700, cy: 300 });
    expect(analyzeEyeCloseup(small, locateIris(small, [700, 300]), null).warnings.some((w) => w.includes('piccolo'))).toBe(true);
    const shiny = drawEye({ iris: GREEN, glare: 0.38, glareAt: [0.15, 0.45] });
    expect(analyzeEyeCloseup(shiny, locateIris(shiny, null), null).warnings.some((w) => w.includes('riflesso'))).toBe(true);
    const none = analyzeEyeCloseup(shiny, null, null);
    expect(none.lab).toBeNull();
    expect(none.warnings[0]).toContain('Non ho trovato l’iride');
  });
});

describe('analyzeHairCloseup', () => {
  const HAIR: Rgb = [120, 82, 50];
  function drawHair(): Img {
    const img = createImg(800, 600, [200, 205, 210, 255]);
    const rand = rng(3);
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 800; x++) {
        const i = (y * 800 + x) * 4;
        let c: Rgb = [200, 205, 210];
        if (x > 120 && x < 700) {
          const strand = 1 + 0.2 * Math.sin(x / 3) + (rand() - 0.5) * 0.1;
          c = [HAIR[0] * strand, HAIR[1] * strand, HAIR[2] * strand];
        }
        if (x < 300 && y > 380) c = [250, 250, 250]; // il foglio bianco
        img.data.set(c, i);
      }
    }
    return img;
  }

  it('prende il colore principale della ciocca, scartando il foglio e lo sfondo', () => {
    const res = analyzeHairCloseup(drawHair(), null, null);
    expect(deltaE(res.lab!, labOf(HAIR))).toBeLessThan(6);
    expect(res.area.center).toEqual([400, 300]);
    // Le ciocche più chiare e più scure sono lo stesso colore: nessun avviso.
    expect(res.confidence).toBeGreaterThan(0.8);
    expect(res.warnings).toEqual([]);
  });

  it('misura dove si tocca e corregge la luce con il bianco toccato', () => {
    const img = drawHair();
    const res = analyzeHairCloseup(img, [500, 200], [250, 240, 220]);
    expect(res.area.center).toEqual([500, 200]);
    expect(res.lab![2]).toBeLessThan(analyzeHairCloseup(img, [500, 200], null).lab![2]);
  });

  it('avvisa se nel cerchio ci sono colori molto diversi', () => {
    const img = createImg(400, 400, [250, 250, 250, 255]);
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if ((x >> 4) % 3 === 0) img.data.set([30, 20, 15], (y * 400 + x) * 4);
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if ((x >> 4) % 3 === 1) img.data.set([200, 60, 40], (y * 400 + x) * 4);
    expect(analyzeHairCloseup(img, null, null).warnings[0]).toContain('colori diversi');
  });
});

describe('mergeCloseups', () => {
  const face: Record<FeatureId, Lab | null> = { skin: [70, 12, 15], hair: [30, 5, 10], eyes: [40, 2, 5], lips: [50, 30, 10], brows: [25, 3, 6] };

  it('le foto da vicino vincono su quella del viso e si ricorda da dove viene ogni colore', () => {
    const r = mergeCloseups(face, { eyes: [55, -4, -18], hair: null });
    expect(r.features.eyes).toEqual([55, -4, -18]);
    expect(r.features.hair).toEqual([30, 5, 10]);
    expect(r.sources).toEqual({ skin: 'face', hair: 'face', eyes: 'eyes', lips: 'face', brows: 'face' });
    expect(photosUsed(r.sources)).toEqual(['face', 'eyes']);
    const both = mergeCloseups(face, { hair: [60, 5, 20], eyes: [55, -4, -18] });
    expect(photosUsed(both.sources)).toEqual(['face', 'eyes', 'hair']);
    expect(photosUsed(mergeCloseups(face, {}).sources)).toEqual(['face']);
  });
});
