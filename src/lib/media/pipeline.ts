import type { ColorId } from '../db/types';
import { detectGarmentColors } from '../logic/garmentColors';
import { floodFillBackground, type Img } from '../logic/imageOps';
import { MAIN_MAX_SIDE, THUMB_MAX_SIDE, THUMB_QUALITY, WEBP_QUALITY, fitSize } from './constants';
import type { EncodeResult, WorkerRequest, WorkerResponse, WorkerResultMap } from './protocol';

// Le operazioni pesanti girano nel Web Worker; se non è disponibile (browser vecchi) sul thread principale.

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    worker = null;
    return null;
  }
  try {
    worker = new Worker(new URL('../../workers/image.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      // Il worker non parte: si passa al thread principale per le prossime operazioni.
      const err = new Error(e.message || 'Worker immagini non disponibile');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

type RequestWithoutId = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

function call<K extends keyof WorkerResultMap>(msg: RequestWithoutId & { op: K }, transfer: Transferable[] = []): Promise<WorkerResultMap[K]> | null {
  const w = getWorker();
  if (!w) return null;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ ...msg, id }, transfer);
  });
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
}

function blobFromCanvas(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => {
        if (!b) return reject(new Error('Impossibile creare l’immagine'));
        if (b.type === 'image/webp') return resolve(b);
        c.toBlob((png) => (png ? resolve(png) : reject(new Error('Impossibile creare l’immagine'))), 'image/png');
      },
      'image/webp',
      quality,
    ),
  );
}

/** Decodifica una foto (orientamento EXIF corretto) e la riduce a `maxSide` pixel sul lato lungo. */
export async function decodeBlob(blob: Blob, maxSide = MAIN_MAX_SIDE): Promise<Img> {
  try {
    const viaWorker = call({ op: 'decode', blob, maxSide });
    if (viaWorker) {
      const r = await viaWorker;
      return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.buffer) };
    }
  } catch (e) {
    if (worker !== null) throw e;
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
  const [, ctx] = canvas2d(width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = ctx.getImageData(0, 0, width, height);
  return { width, height, data: data.data };
}

/** Immagine principale (1200 px) e miniatura (320 px) in WebP. */
export async function encodeImg(img: Img): Promise<EncodeResult> {
  try {
    const buffer = img.data.slice().buffer as ArrayBuffer;
    const viaWorker = call({ op: 'encode', width: img.width, height: img.height, buffer, mainMax: MAIN_MAX_SIDE, thumbMax: THUMB_MAX_SIDE }, [buffer]);
    if (viaWorker) return await viaWorker;
  } catch (e) {
    if (worker !== null) throw e;
  }
  const [src, ctx] = canvas2d(img.width, img.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const mainSize = fitSize(img.width, img.height, MAIN_MAX_SIDE);
  let main = src;
  if (mainSize.width !== img.width || mainSize.height !== img.height) {
    const [m, mctx] = canvas2d(mainSize.width, mainSize.height);
    mctx.drawImage(src, 0, 0, mainSize.width, mainSize.height);
    main = m;
  }
  const thumbSize = fitSize(main.width, main.height, THUMB_MAX_SIDE);
  const [t, tctx] = canvas2d(thumbSize.width, thumbSize.height);
  tctx.drawImage(main, 0, 0, thumbSize.width, thumbSize.height);
  const [blob, thumb] = await Promise.all([blobFromCanvas(main, WEBP_QUALITY), blobFromCanvas(t, THUMB_QUALITY)]);
  return { blob, thumb, width: main.width, height: main.height };
}

export async function colorsOf(img: Img): Promise<ColorId[]> {
  try {
    const buffer = img.data.slice().buffer as ArrayBuffer;
    const viaWorker = call({ op: 'colors', width: img.width, height: img.height, buffer }, [buffer]);
    if (viaWorker) return await viaWorker;
  } catch (e) {
    if (worker !== null) throw e;
  }
  return detectGarmentColors(img);
}

export async function backgroundMask(img: Img, tolerance: number): Promise<Uint8Array> {
  try {
    const buffer = img.data.slice().buffer as ArrayBuffer;
    const viaWorker = call({ op: 'floodFill', width: img.width, height: img.height, buffer, tolerance }, [buffer]);
    if (viaWorker) return new Uint8Array(await viaWorker);
  } catch (e) {
    if (worker !== null) throw e;
  }
  return floodFillBackground(img, tolerance);
}

/** Disegna un'immagine su un canvas (anteprime e editor). */
export function imgToCanvas(img: Img): HTMLCanvasElement {
  const [c, ctx] = canvas2d(img.width, img.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

/** Ridimensiona un'immagine con il canvas (es. per allineare il risultato dello scontorno AI). */
export function resizeImg(img: Img, width: number, height: number): Img {
  if (img.width === width && img.height === height) return img;
  const src = imgToCanvas(img);
  const [, ctx] = canvas2d(width, height);
  ctx.drawImage(src, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** JPEG senza trasparenza (sfondo bianco), per lo scontorno AI. */
export function imgToJpegBlob(img: Img, quality = 0.92): Promise<Blob> {
  const [c, ctx] = canvas2d(img.width, img.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.drawImage(imgToCanvas(img), 0, 0);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Impossibile creare il JPEG'))), 'image/jpeg', quality),
  );
}
