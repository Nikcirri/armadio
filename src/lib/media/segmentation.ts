import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  GoogleSubjectSegmentationModuleInstallState as InstallState,
  SubjectSegmentation,
} from '@capacitor-mlkit/subject-segmentation';
import { copyAlpha, type Img } from '../logic/imageOps';
import { u8ToBase64 } from '../backup/device';
import { decodeBlob, imgToJpegBlob, resizeImg } from './pipeline';

// Scontorno AI sul telefono con ML Kit Subject Segmentation (solo app Android).
// Il modulo di Google si scarica una volta sola (serve internet), poi funziona offline.

export function aiCutoutSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function isAiModuleReady(): Promise<boolean> {
  if (!aiCutoutSupported()) return false;
  try {
    const { available } = await SubjectSegmentation.isGoogleSubjectSegmentationModuleAvailable();
    return available;
  } catch {
    return false;
  }
}

/** Scarica il modulo di Google. `onProgress` riceve la percentuale. */
export async function installAiModule(onProgress?: (percent: number) => void): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    void SubjectSegmentation.addListener('googleSubjectSegmentationModuleInstallProgress', (ev) => {
      onProgress?.(ev.progress ?? 0);
      if (ev.state === InstallState.COMPLETED) resolve();
      if (ev.state === InstallState.FAILED || ev.state === InstallState.CANCELED) {
        reject(new Error('Download del modulo non riuscito. Controlla la connessione e riprova.'));
      }
    });
  });
  try {
    await SubjectSegmentation.installGoogleSubjectSegmentationModule();
    await Promise.race([
      done,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Il download sta impiegando troppo. Riprova più tardi.')), 180_000)),
    ]);
  } finally {
    await SubjectSegmentation.removeAllListeners().catch(() => undefined);
  }
}

/**
 * Restituisce `base` con lo sfondo trasparente calcolato dall'AI.
 * L'immagine passa da un file temporaneo nella cache dell'app.
 */
export async function aiCutout(base: Img): Promise<Img> {
  const jpeg = await imgToJpegBlob(base);
  const name = `cutout-${Date.now()}.jpg`;
  await Filesystem.writeFile({
    path: name,
    directory: Directory.Cache,
    data: u8ToBase64(new Uint8Array(await jpeg.arrayBuffer())),
  });
  const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
  try {
    let result: { path: string };
    try {
      result = await SubjectSegmentation.processImage({ path: uri, confidence: 0.6 });
    } catch {
      result = await SubjectSegmentation.processImage({ path: uri.replace(/^file:\/\//, ''), confidence: 0.6 });
    }
    const src = result.path.startsWith('file://') ? result.path : `file://${result.path}`;
    const res = await fetch(Capacitor.convertFileSrc(src));
    const segmented = await decodeBlob(await res.blob(), Math.max(base.width, base.height));
    return copyAlpha(base, resizeImg(segmented, base.width, base.height));
  } finally {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined);
  }
}
