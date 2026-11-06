import { describe, expect, it } from 'vitest';
import { deltaE, rgbToLab } from './colors';
import {
  analyzeFace,
  collectPixels,
  faceCrop,
  manualRadius,
  resolveFeatures,
  faceRegions,
  gainsFromReference,
  pointInPolygon,
  referenceAt,
  robustLab,
  sampleAt,
  toFaceFeatures,
  type FaceGeometry,
  type Point,
} from './faceColors';
import { createImg, type Img } from './imageOps';

type Rgb = [number, number, number];

const SKIN: Rgb = [224, 180, 160];
const HAIR: Rgb = [90, 60, 40];
const WALL: Rgb = [230, 230, 235];
const SCLERA: Rgb = [235, 232, 228];
const IRIS: Rgb = [70, 110, 160];
const BROWS: Rgb = [70, 50, 40];
const LIPS: Rgb = [190, 90, 100];

function paint(img: Img, inside: (x: number, y: number) => boolean, rgb: Rgb) {
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (inside(x + 0.5, y + 0.5)) {
        const i = (y * img.width + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
      }
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number): Point[] =>
  Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as Point;
  });
const inEllipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const line = (x0: number, x1: number, y: (x: number) => number, n = 5): Point[] =>
  Array.from({ length: n }, (_, k) => {
    const x = x0 + ((x1 - x0) * k) / (n - 1);
    return [x, y(x)] as Point;
  });

/** Un viso disegnato: pelle, capelli, occhi azzurri, sopracciglia, labbra, su un muro chiaro. */
function drawFace(): { img: Img; face: FaceGeometry } {
  const img = createImg(400, 500, [...WALL, 255]);
  paint(img, inEllipse(200, 230, 140, 150), HAIR);
  paint(img, inEllipse(200, 280, 110, 140), SKIN);
  const eyes: Point[][] = [];
  for (const ex of [245, 155]) {
    paint(img, inEllipse(ex, 255, 22, 10), SCLERA);
    paint(img, (x, y) => (x - ex) ** 2 + (y - 255) ** 2 <= 81 && inEllipse(ex, 255, 22, 10)(x, y), IRIS);
    paint(img, (x, y) => (x - ex) ** 2 + (y - 255) ** 2 <= 9, [10, 10, 10]);
    eyes.push(ellipse(ex, 255, 22, 10, 16));
  }
  const browTop = (x0: number) => line(x0, x0 + 50, () => 225);
  const browBottom = (x0: number) => line(x0, x0 + 50, () => 233);
  for (const x0 of [220, 130]) paint(img, (x, y) => x >= x0 && x <= x0 + 50 && y >= 225 && y <= 233, BROWS);
  const upperTop = line(170, 230, (x) => 370 - 10 * Math.sin(((x - 170) / 60) * Math.PI));
  const lowerBottom = line(170, 230, (x) => 370 + 15 * Math.sin(((x - 170) / 60) * Math.PI));
  const upperBottom = line(172, 228, () => 370);
  const lowerTop = line(172, 228, () => 373);
  const outer = [...upperTop, ...[...lowerBottom].reverse()];
  const inner = [...upperBottom, ...[...lowerTop].reverse()];
  paint(img, (x, y) => pointInPolygon([x, y], outer), LIPS);
  paint(img, (x, y) => pointInPolygon([x, y], inner), [60, 20, 20]);
  return {
    img,
    face: {
      bounds: { x: 90, y: 140, width: 220, height: 280 },
      angles: { x: 0, y: 3, z: -2 },
      contours: {
        face: ellipse(200, 280, 110, 140, 36),
        leftEye: eyes[0],
        rightEye: eyes[1],
        leftEyebrowTop: browTop(220),
        leftEyebrowBottom: browBottom(220),
        rightEyebrowTop: browTop(130),
        rightEyebrowBottom: browBottom(130),
        upperLipTop: upperTop,
        upperLipBottom: upperBottom,
        lowerLipTop: lowerTop,
        lowerLipBottom: lowerBottom,
        leftCheek: [[265, 320]],
        rightCheek: [[135, 320]],
      },
    },
  };
}

const lab = (rgb: Rgb) => rgbToLab(...rgb);

function tint(img: Img, g: Rgb): Img {
  const out = createImg(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = img.data[i]! * g[0];
    out.data[i + 1] = img.data[i + 1]! * g[1];
    out.data[i + 2] = img.data[i + 2]! * g[2];
    out.data[i + 3] = 255;
  }
  return out;
}

describe('colori del viso', () => {
  it('geometria: poligoni, zone e pixel', () => {
    const sq: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon([5, 5], sq)).toBe(true);
    expect(pointInPolygon([15, 5], sq)).toBe(false);
    const { img, face } = drawFace();
    const r = faceRegions(face);
    expect(r.skin).toHaveLength(3);
    expect(r.eyes).toHaveLength(2);
    expect(r.hair).toHaveLength(3);
    expect(r.lips[0]?.kind === 'polygon' && r.lips[0].holes?.length).toBe(1);
    const px = collectPixels(img, r.skin, 400);
    expect(px.length).toBeGreaterThan(100);
    expect(px.length).toBeLessThanOrEqual(600);
  });

  it('colore robusto: scarta ombre e riflessi', () => {
    const labs = [...Array(80).fill([60, 10, 15]), ...Array(10).fill([5, 0, 0]), ...Array(10).fill([99, 0, 0])];
    expect(robustLab(labs)).toEqual([60, 10, 15]);
    expect(robustLab(labs.slice(0, 5))).toBeNull();
  });

  it('riconosce pelle, capelli, occhi, sopracciglia e labbra', () => {
    const { img, face } = drawFace();
    const a = analyzeFace(img, face);
    expect(deltaE(a.features.skin!, lab(SKIN))).toBeLessThan(3);
    expect(deltaE(a.features.hair!, lab(HAIR))).toBeLessThan(4);
    expect(deltaE(a.features.eyes!, lab(IRIS))).toBeLessThan(8);
    expect(deltaE(a.features.brows!, lab(BROWS))).toBeLessThan(4);
    expect(deltaE(a.features.lips!, lab(LIPS))).toBeLessThan(5);
    expect(a.hairConfidence).toBeGreaterThan(0.6);
    expect(a.warnings).toEqual([]);
    expect(toFaceFeatures(a.features)?.skin).toEqual(a.features.skin);
  });

  it('con luce calda avvisa e corregge in parte grazie al bianco degli occhi', () => {
    const { img, face } = drawFace();
    const warm = tint(img, [1.08, 1, 0.8]);
    const a = analyzeFace(warm, face);
    expect(a.warnings.some((w) => w.includes('calda'))).toBe(true);
    const raw = analyzeFace(warm, { ...face, contours: { ...face.contours, leftEye: undefined, rightEye: undefined } });
    expect(deltaE(a.features.skin!, lab(SKIN))).toBeLessThan(deltaE(raw.features.skin!, lab(SKIN)));
    // con un bianco toccato a mano la correzione è completa
    const white = referenceAt(warm, [20, 480], 10)!;
    const fixed = analyzeFace(warm, face, white);
    expect(deltaE(fixed.features.skin!, lab(SKIN))).toBeLessThan(4);
  });

  it('avvisa se il viso è piccolo, girato o senza capelli visibili', () => {
    const { img, face } = drawFace();
    const turned = analyzeFace(img, { ...face, angles: { x: 0, y: 35, z: 0 } });
    expect(turned.warnings.some((w) => w.includes('girata'))).toBe(true);
    const big = createImg(1200, 1500, [...WALL, 255]);
    const small = analyzeFace(big, face);
    expect(small.warnings.some((w) => w.includes('piccolo'))).toBe(true);
    const noHair = createImg(400, 500, [...SKIN, 255]);
    const bald = analyzeFace(noHair, { ...face, contours: { ...face.contours, face: ellipse(200, 145, 110, 140, 36) } });
    expect(bald.features.hair).toBeNull();
    expect(bald.warnings.some((w) => w.includes('capelli'))).toBe(true);
  });

  it('tocco a mano e bilanciamento del bianco', () => {
    const { img } = drawFace();
    expect(deltaE(sampleAt(img, [200, 200], 10, 'skin', [1, 1, 1])!, lab(SKIN))).toBeLessThan(2);
    expect(deltaE(sampleAt(img, [245, 255], 8, 'eyes', [1, 1, 1])!, lab(IRIS))).toBeLessThan(10);
    const g = gainsFromReference([250, 200, 150]);
    expect(g[0]).toBeLessThan(1);
    expect(g[2]).toBeGreaterThan(1);
    expect(Math.max(...g)).toBeLessThanOrEqual(1.25);
    expect(gainsFromReference([10, 10, 10])).toEqual([1, 1, 1]);
  });

  it('le correzioni a mano vincono su quelle automatiche', () => {
    const { img, face } = drawFace();
    const a = analyzeFace(img, face);
    const r = resolveFeatures(img, a.features, { hair: { point: [20, 20], radius: manualRadius('hair', 400, 500) } }, a.gains);
    expect(deltaE(r.hair!, lab(WALL))).toBeLessThan(3);
    expect(r.skin).toEqual(a.features.skin);
    const manual = resolveFeatures(img, null, { skin: { point: [200, 200], radius: 10 } }, [1, 1, 1]);
    expect(manual.eyes).toBeNull();
    expect(deltaE(manual.skin!, lab(SKIN))).toBeLessThan(2);
    expect(manualRadius('eyes', 400, 500)).toBeLessThan(manualRadius('skin', 400, 500));
    expect(manualRadius('eyes', 100, 100)).toBe(3);
  });

  it('ritaglia il viso con un margine, dentro la foto', () => {
    const { face } = drawFace();
    expect(faceCrop(face, 400, 500)).toEqual({ x: 24, y: 28, w: 352, h: 434 });
    const c = faceCrop(null, 400, 500);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(400);
  });
});
