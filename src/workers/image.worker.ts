/// <reference lib="webworker" />
// Worker delle immagini: decodifica, ridimensiona, codifica in WebP, rileva colori e sfondo
// fuori dal thread dell'interfaccia, così l'app resta fluida.
import { detectGarmentColors } from '../lib/logic/garmentColors';
import { floodFillBackground } from '../lib/logic/imageOps';
import { THUMB_QUALITY, WEBP_QUALITY, fitSize } from '../lib/media/constants';
import type { DecodeResult, EncodeResult, WorkerRequest, WorkerResponse } from '../lib/media/protocol';

declare const self: DedicatedWorkerGlobalScope;

function ctx2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D non disponibile');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

async function toBlob(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
  if (webp.type === 'image/webp') return webp;
  return canvas.convertToBlob({ type: 'image/png' });
}

async function decode(blob: Blob, maxSide: number): Promise<DecodeResult> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = ctx2d(canvas);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = ctx.getImageData(0, 0, width, height);
  return { width, height, buffer: data.data.buffer as ArrayBuffer };
}

async function encode(width: number, height: number, buffer: ArrayBuffer, mainMax: number, thumbMax: number): Promise<EncodeResult> {
  const src = new OffscreenCanvas(width, height);
  ctx2d(src).putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
  const mainSize = fitSize(width, height, mainMax);
  let main = src;
  if (mainSize.width !== width || mainSize.height !== height) {
    main = new OffscreenCanvas(mainSize.width, mainSize.height);
    ctx2d(main).drawImage(src, 0, 0, mainSize.width, mainSize.height);
  }
  const thumbSize = fitSize(main.width, main.height, thumbMax);
  const thumbCanvas = new OffscreenCanvas(thumbSize.width, thumbSize.height);
  ctx2d(thumbCanvas).drawImage(main, 0, 0, thumbSize.width, thumbSize.height);
  const [blob, thumb] = await Promise.all([toBlob(main, WEBP_QUALITY), toBlob(thumbCanvas, THUMB_QUALITY)]);
  return { blob, thumb, width: main.width, height: main.height };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    let result: unknown;
    const transfer: Transferable[] = [];
    switch (req.op) {
      case 'decode': {
        const r = await decode(req.blob, req.maxSide);
        transfer.push(r.buffer);
        result = r;
        break;
      }
      case 'encode':
        result = await encode(req.width, req.height, req.buffer, req.mainMax, req.thumbMax);
        break;
      case 'colors':
        result = detectGarmentColors({ width: req.width, height: req.height, data: new Uint8ClampedArray(req.buffer) });
        break;
      case 'floodFill': {
        const mask = floodFillBackground(
          { width: req.width, height: req.height, data: new Uint8ClampedArray(req.buffer) },
          req.tolerance,
        );
        transfer.push(mask.buffer as ArrayBuffer);
        result = mask.buffer;
        break;
      }
    }
    const res: WorkerResponse = { id: req.id, ok: true, result };
    self.postMessage(res, transfer);
  } catch (e) {
    const res: WorkerResponse = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    self.postMessage(res);
  }
};
