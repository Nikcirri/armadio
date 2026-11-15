import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { u8ToBase64 } from '../logic/bytes';
import type { OcrLine } from '../logic/careLabel';
import type { ImageLabel } from '../logic/categoryGuess';
import type { Img } from '../logic/imageOps';
import { imgToJpegBlob } from './pipeline';

// Lettura dell'etichetta e categoria suggerita (VisionPlugin.java, SPEC.md sezioni 6 e 8.1).
// Solo nell'app Android, con i modelli di ML Kit inclusi nell'app.

interface VisionPluginApi {
  readText(options: { path: string }): Promise<{ width: number; height: number; lines: { text: string; box?: number[] }[] }>;
  labels(options: { path: string }): Promise<{ labels: ImageLabel[] }>;
}

const Vision = registerPlugin<VisionPluginApi>('Vision');

export function visionSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Passa la foto al plugin come file JPEG temporaneo nella cache dell'app, poi lo cancella. */
async function withJpeg<T>(img: Img, prefix: string, run: (uri: string) => Promise<T>): Promise<T> {
  const jpeg = await imgToJpegBlob(img, 0.92);
  const name = `${prefix}-${Date.now()}.jpg`;
  await Filesystem.writeFile({ path: name, directory: Directory.Cache, data: u8ToBase64(new Uint8Array(await jpeg.arrayBuffer())) });
  try {
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    return await run(uri);
  } finally {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined);
  }
}

/** Le righe di testo della foto (es. l'etichetta interna di un capo). */
export async function readText(img: Img): Promise<OcrLine[]> {
  const res = await withJpeg(img, 'etichetta', (path) => Vision.readText({ path }));
  return res.lines.map((l) => ({
    text: l.text,
    box: l.box && l.box.length === 4 ? ([l.box[0]!, l.box[1]!, l.box[2]!, l.box[3]!] as const) : null,
  }));
}

/** Le etichette generiche della foto (es. "Jacket" 0,82), per suggerire la categoria. */
export async function imageLabels(img: Img): Promise<ImageLabel[]> {
  const res = await withJpeg(img, 'capo', (path) => Vision.labels({ path }));
  return res.labels;
}
