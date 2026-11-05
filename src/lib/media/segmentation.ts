import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  GoogleSubjectSegmentationModuleInstallState as InstallState,
  SubjectSegmentation,
} from '@capacitor-mlkit/subject-segmentation';
import { applyBackgroundMask, backgroundFromTint, cleanMask, type Img } from '../logic/imageOps';
import { u8ToBase64 } from '../backup/device';
import { UserError } from '../errors';
import { decodeBlob, imgToPngBlob, resizeImg } from './pipeline';

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
  let poll: ReturnType<typeof setInterval> | undefined;
  const done = new Promise<void>((resolve, reject) => {
    void SubjectSegmentation.addListener('googleSubjectSegmentationModuleInstallProgress', (ev) => {
      onProgress?.(ev.progress ?? 0);
      if (ev.state === InstallState.COMPLETED) resolve();
      if (ev.state === InstallState.FAILED || ev.state === InstallState.CANCELED) {
        reject(new UserError('Download del modulo non riuscito. Controlla la connessione a internet e riprova.'));
      }
    });
    // Alcuni telefoni non mandano l'evento finale: si controlla anche ogni 2 secondi.
    poll = setInterval(() => {
      void isAiModuleReady().then((ready) => ready && resolve());
    }, 2000);
  });
  try {
    await SubjectSegmentation.installGoogleSubjectSegmentationModule();
    await Promise.race([
      done,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new UserError('Il download sta impiegando troppo. Riprova più tardi con il Wi-Fi.')), 240_000),
      ),
    ]);
  } finally {
    clearInterval(poll);
    await SubjectSegmentation.removeAllListeners().catch(() => undefined);
  }
}

/**
 * Restituisce `base` con lo sfondo trasparente.
 * Il plugin restituisce la foto con il capo velato di magenta: la sagoma si ricava confrontandola con l'originale.
 */
export async function aiCutout(base: Img): Promise<Img> {
  const png = await imgToPngBlob(base);
  const name = `cutout-${Date.now()}.png`;
  await Filesystem.writeFile({
    path: name,
    directory: Directory.Cache,
    data: u8ToBase64(new Uint8Array(await png.arrayBuffer())),
  });
  const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
  let outputPath: string | null = null;
  try {
    const result = await SubjectSegmentation.processImage({ path: uri, confidence: 0.5 });
    outputPath = result.path.startsWith('file://') ? result.path : `file://${result.path}`;
    const res = await fetch(Capacitor.convertFileSrc(outputPath));
    if (!res.ok) throw new Error(`Risultato dello scontorno non leggibile (${res.status})`);
    const tinted = await decodeBlob(await res.blob(), Math.max(result.width, result.height, base.width, base.height));
    const aligned = resizeImg(tinted, base.width, base.height);
    const mask = cleanMask(backgroundFromTint(base, aligned), base.width, base.height);
    let bg = 0;
    for (let i = 0; i < mask.length; i++) bg += mask[i]!;
    if (bg / mask.length > 0.985) {
      throw new UserError('Non ho trovato nessun capo nella foto. Prova “Dagli angoli” o il pennello.');
    }
    return applyBackgroundMask(base, mask);
  } finally {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined);
    if (outputPath) await Filesystem.deleteFile({ path: outputPath }).catch(() => undefined);
  }
}
