import { MAIN_MAX_SIDE, THUMB_MAX_SIDE, WEBP_QUALITY } from './constants';

export { MAIN_MAX_SIDE, THUMB_MAX_SIDE, WEBP_QUALITY };

/** Converte un canvas in Blob WebP (PNG se il WebP non è supportato). */
export function canvasToBlob(canvas: HTMLCanvasElement, quality = WEBP_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Impossibile creare l’immagine'));
          return;
        }
        if (blob.type === 'image/webp') {
          resolve(blob);
          return;
        }
        canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('Impossibile creare l’immagine'))), 'image/png');
      },
      'image/webp',
      quality,
    );
  });
}

/** Ridimensiona mantenendo le proporzioni, con il lato lungo al massimo `maxSide`. */
export function scaleCanvas(source: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxSide / Math.max(source.width, source.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(source.width * ratio));
  out.height = Math.max(1, Math.round(source.height * ratio));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/** Immagine principale + miniatura pronte per la tabella photos. */
export async function canvasToPhotoBlobs(
  canvas: HTMLCanvasElement,
): Promise<{ blob: Blob; thumb: Blob; width: number; height: number }> {
  const main = scaleCanvas(canvas, MAIN_MAX_SIDE);
  const small = scaleCanvas(main, THUMB_MAX_SIDE);
  const [blob, thumb] = await Promise.all([canvasToBlob(main), canvasToBlob(small, 0.75)]);
  return { blob, thumb, width: main.width, height: main.height };
}
