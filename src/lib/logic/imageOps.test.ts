import { describe, expect, it } from 'vitest';
import {
  adjustLight,
  applyBackgroundMask,
  backgroundFromTint,
  brushStroke,
  centeredRect,
  cleanMask,
  clampRect,
  cloneImg,
  copyAlpha,
  createImg,
  crop,
  floodFillBackground,
  rotate90,
  transparentShare,
  type Img,
} from './imageOps';
import { detectColors, deltaE, kmeans, nearestColor, rgbToLab } from './colors';

function px(img: Img, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return Array.from(img.data.subarray(i, i + 4));
}

function setPx(img: Img, x: number, y: number, v: [number, number, number, number]) {
  img.data.set(v, (y * img.width + x) * 4);
}

/** Capo rosso al centro su sfondo bianco leggermente rumoroso. */
function garmentOnWhite(w = 60, h = 80): Img {
  const img = createImg(w, h, [245, 245, 242, 255]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const noise = ((x * 7 + y * 13) % 5) - 2;
      if (x > 15 && x < 45 && y > 15 && y < 65) setPx(img, x, y, [200, 40, 40, 255]);
      else setPx(img, x, y, [245 + noise, 245 + noise, 242 + noise, 255]);
    }
  }
  return img;
}

describe('geometria', () => {
  it('ruota di 90° in senso orario e torna indietro', () => {
    const img = createImg(3, 2);
    setPx(img, 0, 0, [1, 0, 0, 255]);
    setPx(img, 2, 1, [9, 0, 0, 255]);
    const r = rotate90(img, 1);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect(px(r, 1, 0)[0]).toBe(1);
    expect(px(r, 0, 2)[0]).toBe(9);
    expect(rotate90(r, -1).data).toEqual(img.data);
  });

  it('ritaglia e tiene il rettangolo dentro l’immagine', () => {
    const img = createImg(10, 10);
    setPx(img, 5, 6, [7, 7, 7, 255]);
    const c = crop(img, { x: 4, y: 5, w: 3, h: 3 });
    expect([c.width, c.height]).toEqual([3, 3]);
    expect(px(c, 1, 1)[0]).toBe(7);
    expect(clampRect({ x: -5, y: 8, w: 50, h: 50 }, 10, 10)).toEqual({ x: 0, y: 8, w: 10, h: 2 });
  });

  it('calcola il ritaglio centrato 3:4 e 1:1', () => {
    expect(centeredRect(1200, 900, 3 / 4)).toEqual({ x: 262.5, y: 0, w: 675, h: 900 });
    expect(centeredRect(900, 1200, 1)).toEqual({ x: 0, y: 150, w: 900, h: 900 });
  });
});

describe('luce e contrasto', () => {
  it('schiarisce senza toccare la trasparenza', () => {
    const img = createImg(1, 1, [100, 100, 100, 77]);
    const out = adjustLight(img, 40, 0);
    expect(px(out, 0, 0)[0]).toBeGreaterThan(100);
    expect(px(out, 0, 0)[3]).toBe(77);
    expect(px(img, 0, 0)[0]).toBe(100);
  });
  it('con 0 e 0 non cambia nulla', () => {
    const img = garmentOnWhite();
    expect(adjustLight(img, 0, 0).data).toEqual(img.data);
  });
});

describe('scontorno dagli angoli', () => {
  it('toglie lo sfondo bianco e lascia il capo', () => {
    const img = garmentOnWhite();
    const mask = floodFillBackground(img, 30);
    const out = applyBackgroundMask(img, mask);
    expect(px(out, 0, 0)[3]).toBe(0);
    expect(px(out, 30, 40)[3]).toBe(255);
    const share = transparentShare(out);
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.75);
  });

  it('con tolleranza bassa su uno sfondo sfumato toglie meno', () => {
    const img = garmentOnWhite();
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++)
        if (!(x > 15 && x < 45 && y > 15 && y < 65)) {
          const v = 245 - Math.round((x / img.width) * 30) - Math.round((y / img.height) * 30);
          setPx(img, x, y, [v, v, v, 255]);
        }
    const low = transparentShare(applyBackgroundMask(img, floodFillBackground(img, 0)));
    const high = transparentShare(applyBackgroundMask(img, floodFillBackground(img, 40)));
    expect(low).toBeLessThan(high);
  });

  it('copia la trasparenza da un altro scontorno', () => {
    const a = createImg(2, 1, [10, 10, 10, 255]);
    const b = createImg(2, 1, [0, 0, 0, 0]);
    setPx(b, 1, 0, [0, 0, 0, 255]);
    const out = copyAlpha(a, b);
    expect(px(out, 0, 0)).toEqual([10, 10, 10, 0]);
    expect(px(out, 1, 0)).toEqual([10, 10, 10, 255]);
    expect(() => copyAlpha(a, createImg(1, 1))).toThrow();
  });
});

describe('pennello', () => {
  it('cancella e poi ripristina dalla base', () => {
    const base = createImg(20, 20, [50, 60, 70, 255]);
    const img = cloneImg(base);
    const rect = brushStroke(img, base, 10, 10, 4, 'erase');
    expect(rect).toEqual({ x: 6, y: 6, w: 9, h: 9 });
    expect(px(img, 10, 10)[3]).toBe(0);
    expect(px(img, 0, 0)[3]).toBe(255);
    brushStroke(img, base, 10, 10, 4, 'restore');
    expect(px(img, 10, 10)).toEqual([50, 60, 70, 255]);
  });
  it('fuori dall’immagine non fa nulla', () => {
    const base = createImg(5, 5, [0, 0, 0, 255]);
    expect(brushStroke(cloneImg(base), base, -50, -50, 3, 'erase')).toBeNull();
  });
});

describe('colori', () => {
  it('riconosce i colori base', () => {
    const near = (r: number, g: number, b: number) => nearestColor(rgbToLab(r, g, b));
    expect(near(20, 20, 22)).toBe('black');
    expect(near(250, 250, 250)).toBe('white');
    expect(near(200, 30, 35)).toBe('red');
    expect(near(30, 45, 90)).toBe('navy');
    expect(near(90, 125, 175)).toBe('denim');
    expect(near(225, 210, 180)).toBe('cream');
  });

  it('k-means separa due gruppi', () => {
    const pts = [
      ...Array.from({ length: 50 }, () => rgbToLab(250, 250, 250)),
      ...Array.from({ length: 30 }, () => rgbToLab(10, 10, 10)),
    ];
    const cl = kmeans(pts, 2).sort((a, b) => b.count - a.count);
    expect(cl.map((c) => c.count)).toEqual([50, 30]);
    expect(deltaE(cl[0]!.center, rgbToLab(250, 250, 250))).toBeLessThan(1);
  });

  it('trova il colore del capo ignorando bordi e trasparenza', () => {
    const img = garmentOnWhite();
    const cut = applyBackgroundMask(img, floodFillBackground(img, 30));
    expect(detectColors(cut)[0]).toBe('red');
  });

  it('segnala "fantasia" con tre colori forti', () => {
    const img = createImg(90, 90, [0, 0, 0, 255]);
    for (let y = 0; y < 90; y++)
      for (let x = 0; x < 90; x++) {
        const band = Math.floor(x / 30);
        setPx(img, x, y, band === 0 ? [200, 30, 35, 255] : band === 1 ? [230, 200, 50, 255] : [60, 140, 80, 255]);
      }
    expect(detectColors(createImgFrom(img))).toContain('pattern');
  });
});

function createImgFrom(img: Img): Img {
  return cloneImg(img);
}

describe('scontorno AI dal velo magenta del plugin', () => {
  /** Simula il plugin: copre il capo con magenta al 50% e aggiunge un po' di rumore (JPEG/PNG). */
  function tint(img: Img, isSubject: (x: number, y: number) => boolean): Img {
    const out = cloneImg(img);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const noise = ((x * 31 + y * 17) % 7) - 3;
        if (isSubject(x, y)) {
          out.data[i] = (img.data[i]! + 255) / 2 + noise;
          out.data[i + 1] = img.data[i + 1]! / 2 + noise;
          out.data[i + 2] = (img.data[i + 2]! + 255) / 2 + noise;
        } else {
          out.data[i] = img.data[i]! + noise;
          out.data[i + 1] = img.data[i + 1]! + noise;
          out.data[i + 2] = img.data[i + 2]! + noise;
        }
      }
    return out;
  }
  const inside = (x: number, y: number) => x > 15 && x < 45 && y > 15 && y < 65;

  it('ricava la sagoma di un capo scuro su un copriletto fantasia', () => {
    const img = createImg(60, 80);
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < 60; x++)
        setPx(img, x, y, inside(x, y) ? [30, 32, 38, 255] : (x + y) % 6 < 3 ? [200, 195, 180, 255] : [150, 145, 130, 255]);
    const mask = backgroundFromTint(img, tint(img, inside));
    let wrong = 0;
    for (let y = 0; y < 80; y++) for (let x = 0; x < 60; x++) if (mask[y * 60 + x] !== (inside(x, y) ? 0 : 1)) wrong++;
    expect(wrong).toBe(0);
  });

  it('funziona anche con capi chiari e colorati', () => {
    for (const color of [[245, 245, 245], [230, 195, 55], [60, 90, 130], [200, 35, 40]] as const) {
      const img = createImg(60, 80, [120, 110, 100, 255]);
      for (let y = 0; y < 80; y++) for (let x = 0; x < 60; x++) if (inside(x, y)) setPx(img, x, y, [...color, 255]);
      const mask = backgroundFromTint(img, tint(img, inside));
      expect(mask[40 * 60 + 30], `capo ${color}`).toBe(0);
      expect(mask[2 * 60 + 2], `sfondo ${color}`).toBe(1);
    }
  });

  it('pulisce i puntini isolati', () => {
    const m = new Uint8Array(25).fill(1);
    m[12] = 0;
    expect(cleanMask(m, 5, 5)[12]).toBe(1);
  });

  it('rifiuta immagini di dimensioni diverse', () => {
    expect(() => backgroundFromTint(createImg(2, 2), createImg(3, 2))).toThrow();
  });
});
