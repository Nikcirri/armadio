import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  GoogleSubjectSegmentationModuleInstallState as InstallState,
  SubjectSegmentation,
} from '@capacitor-mlkit/subject-segmentation';
import { applyConfidence, resizeMask, subjectShare, type Img } from '../logic/imageOps';
import { u8ToBase64 } from '../logic/bytes';
import { UserError, errorText } from '../errors';
import { isAiModuleAlreadyInstalled } from '../logic/aiErrors';
import { Cutout, base64ToBytes } from './cutoutPlugin';
import { fitSize } from './constants';
import { imgToJpegBlob, resizeImg } from './pipeline';

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
    try {
      await SubjectSegmentation.installGoogleSubjectSegmentationModule();
    } catch (e) {
      // "Already installed": il modulo c'è già, si può procedere.
      if (isAiModuleAlreadyInstalled(errorText(e))) return;
      throw e;
    }
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

/** Lato lungo della copia passata all'AI: abbastanza per una sagoma precisa, poca memoria. */
const AI_MAX_SIDE = 1024;

/**
 * Restituisce `base` con lo sfondo trasparente calcolato dall'AI sul telefono.
 * L'AI lavora su una copia ridotta (file temporaneo nella cache); la sagoma viene poi
 * ingrandita alla dimensione della foto con bordi morbidi.
 */
export async function aiCutout(base: Img): Promise<Img> {
  const size = fitSize(base.width, base.height, AI_MAX_SIDE);
  const small = resizeImg(base, size.width, size.height);
  const jpeg = await imgToJpegBlob(small, 0.92);
  const name = `cutout-${Date.now()}.jpg`;
  await Filesystem.writeFile({
    path: name,
    directory: Directory.Cache,
    data: u8ToBase64(new Uint8Array(await jpeg.arrayBuffer())),
  });
  try {
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    const res = await Cutout.segment({ path: uri, maxSide: AI_MAX_SIDE });
    const mask = resizeMask(base64ToBytes(res.mask), res.width, res.height, base.width, base.height);
    if (subjectShare(mask) < 0.015) {
      throw new UserError('Non ho trovato nessun capo nella foto. Prova “Dagli angoli” o il pennello.');
    }
    return applyConfidence(base, mask);
  } finally {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined);
  }
}
