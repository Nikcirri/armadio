// Operazioni sui pixel (RGBA) usate dall'editor foto. Funzioni pure: non toccano il DOM.

export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createImg(width: number, height: number, fill?: [number, number, number, number]): Img {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { width, height, data };
}

export function cloneImg(img: Img): Img {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** Ruota di 90° in senso orario (dir = 1) o antiorario (dir = -1). */
export function rotate90(img: Img, dir: 1 | -1 = 1): Img {
  const { width: w, height: h, data } = img;
  const out = createImg(h, w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = dir === 1 ? h - 1 - y : y;
      const ny = dir === 1 ? x : w - 1 - x;
      const si = (y * w + x) * 4;
      const di = (ny * h + nx) * 4;
      out.data[di] = data[si]!;
      out.data[di + 1] = data[si + 1]!;
      out.data[di + 2] = data[si + 2]!;
      out.data[di + 3] = data[si + 3]!;
    }
  }
  return out;
}

/** Riporta un rettangolo dentro l'immagine, con lati interi e almeno 1 pixel. */
export function clampRect(r: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width - 1, Math.round(r.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(r.y)));
  const w = Math.max(1, Math.min(width - x, Math.round(r.w)));
  const h = Math.max(1, Math.min(height - y, Math.round(r.h)));
  return { x, y, w, h };
}

export function crop(img: Img, rect: Rect): Img {
  const r = clampRect(rect, img.width, img.height);
  const out = createImg(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const start = ((r.y + y) * img.width + r.x) * 4;
    out.data.set(img.data.subarray(start, start + r.w * 4), y * r.w * 4);
  }
  return out;
}

/** Rettangolo centrato più grande possibile con il rapporto larghezza/altezza indicato. */
export function centeredRect(width: number, height: number, ratio: number | null, fill = 0.9): Rect {
  if (ratio === null) {
    const w = width * fill;
    const h = height * fill;
    return { x: (width - w) / 2, y: (height - h) / 2, w, h };
  }
  let w = width;
  let h = w / ratio;
  if (h > height) {
    h = height;
    w = h * ratio;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/**
 * Luminosità e contrasto da -100 a 100 (0 = invariato). La trasparenza non cambia.
 */
export function adjustLight(img: Img, brightness: number, contrast: number): Img {
  const out = cloneImg(img);
  const b = (brightness / 100) * 255 * 0.5;
  const c = Math.max(-99, Math.min(99, contrast));
  const factor = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55));
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = factor * (v + b - 128) + 128;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]!]!;
    d[i + 1] = lut[d[i + 1]!]!;
    d[i + 2] = lut[d[i + 2]!]!;
  }
  return out;
}

/** Colore medio di un quadrato `size`×`size` in un angolo. */
export function cornerColor(img: Img, corner: 0 | 1 | 2 | 3, size: number): [number, number, number] {
  const s = Math.max(1, Math.min(size, img.width, img.height));
  const x0 = corner === 1 || corner === 3 ? img.width - s : 0;
  const y0 = corner >= 2 ? img.height - s : 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = y0; y < y0 + s; y++) {
    for (let x = x0; x < x0 + s; x++) {
      const i = (y * img.width + x) * 4;
      r += img.data[i]!;
      g += img.data[i + 1]!;
      b += img.data[i + 2]!;
    }
  }
  const n = s * s;
  return [r / n, g / n, b / n];
}

/**
 * Sfondo da rimuovere: dai 4 angoli si espande ai pixel vicini di colore simile al colore medio
 * dell'angolo. `tolerance` da 0 a 100. Restituisce 1 = sfondo, 0 = capo.
 */
export function floodFillBackground(img: Img, tolerance: number): Uint8Array {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  const maxDist = 8 + (tolerance / 100) * 140;
  const maxD2 = maxDist * maxDist;
  const sample = Math.max(4, Math.round(Math.min(w, h) * 0.03));
  const corners: [number, number][] = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  const stack = new Int32Array(w * h);
  corners.forEach(([sx, sy], ci) => {
    const [cr, cg, cb] = cornerColor(img, ci as 0 | 1 | 2 | 3, sample);
    const start = sy * w + sx;
    if (mask[start]) return;
    let top = 0;
    stack[top++] = start;
    const visited = new Uint8Array(w * h);
    visited[start] = 1;
    while (top > 0) {
      const p = stack[--top]!;
      const i = p * 4;
      const dr = data[i]! - cr;
      const dg = data[i + 1]! - cg;
      const db = data[i + 2]! - cb;
      if (data[i + 3]! > 0 && dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11 > maxD2 * 0.5) continue;
      mask[p] = 1;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && !visited[p - 1]) {
        visited[p - 1] = 1;
        stack[top++] = p - 1;
      }
      if (x < w - 1 && !visited[p + 1]) {
        visited[p + 1] = 1;
        stack[top++] = p + 1;
      }
      if (y > 0 && !visited[p - w]) {
        visited[p - w] = 1;
        stack[top++] = p - w;
      }
      if (y < h - 1 && !visited[p + w]) {
        visited[p + w] = 1;
        stack[top++] = p + w;
      }
    }
  });
  return mask;
}

/**
 * Applica una maschera di sfondo: trasparente dove mask = 1, bordo ammorbidito di 1 pixel.
 * Parte da `base` (immagine senza trasparenze) così si può cambiare tolleranza senza perdere qualità.
 */
export function applyBackgroundMask(base: Img, mask: Uint8Array): Img {
  const out = cloneImg(base);
  const { width: w, height: h } = base;
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4 + 3;
    if (mask[p]) {
      out.data[i] = 0;
      continue;
    }
    const x = p % w;
    const y = (p - x) / w;
    const edge =
      (x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w]);
    if (edge) out.data[i] = Math.min(out.data[i]!, 150);
  }
  return out;
}

/** Copia la trasparenza da un'immagine scontornata della stessa dimensione (es. risultato AI). */
export function copyAlpha(target: Img, alphaSource: Img): Img {
  if (target.width !== alphaSource.width || target.height !== alphaSource.height) {
    throw new Error('Le immagini devono avere la stessa dimensione');
  }
  const out = cloneImg(target);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = alphaSource.data[i]!;
  return out;
}

/**
 * Pennello: "erase" rende trasparente, "restore" rimette i pixel di `base`.
 * Modifica `img` sul posto e restituisce il rettangolo toccato (per ridisegnare solo quello).
 */
export function brushStroke(
  img: Img,
  base: Img,
  cx: number,
  cy: number,
  radius: number,
  mode: 'erase' | 'restore',
): Rect | null {
  const r = Math.max(1, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + r));
  if (x0 > x1 || y0 > y1) return null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      // Bordo morbido: pieno fino al 70% del raggio.
      const strength = d < r * 0.7 ? 1 : 1 - (d - r * 0.7) / (r * 0.3);
      const i = (y * img.width + x) * 4 + 3;
      const current = img.data[i]!;
      if (mode === 'erase') {
        img.data[i] = Math.min(current, Math.round(current * (1 - strength)));
      } else {
        const target = base.data[i]!;
        img.data[i - 3] = base.data[i - 3]!;
        img.data[i - 2] = base.data[i - 2]!;
        img.data[i - 1] = base.data[i - 1]!;
        img.data[i] = Math.max(current, Math.round(current + (target - current) * strength));
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Quota di pixel trasparenti (alfa < 128). */
export function transparentShare(img: Img): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 128) n++;
  return n / (img.width * img.height);
}
