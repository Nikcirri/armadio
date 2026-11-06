import { Camera, CameraDirection, MediaTypeSelection } from '@capacitor/camera';
import { isNative } from '../platform';

export const MAX_BATCH = 20;

function isCancel(e: unknown): boolean {
  const text = `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? e}`;
  return /cancel|annull|OS-PLUG-CAMR-0006|OS-PLUG-CAMR-0020/i.test(text);
}

async function webPathToBlob(webPath: string): Promise<Blob> {
  const res = await fetch(webPath);
  if (!res.ok) throw new Error('Impossibile leggere la foto');
  return res.blob();
}

/** Input file nascosto (versione web). */
function pickFromInput(opts: { multiple: boolean; capture: boolean | 'user' }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = opts.multiple;
    if (opts.capture) input.setAttribute('capture', opts.capture === 'user' ? 'user' : 'environment');
    input.style.display = 'none';
    let done = false;
    const finish = (files: File[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.append(input);
    input.click();
  });
}

/** Apre la fotocamera posteriore. Restituisce null se l'utente annulla. */
export async function takePhoto(): Promise<Blob | null> {
  if (!isNative()) return (await pickFromInput({ multiple: false, capture: true }))[0] ?? null;
  try {
    const res = await Camera.takePhoto({
      quality: 90,
      correctOrientation: true,
      cameraDirection: CameraDirection.Rear,
      editable: 'no',
      saveToGallery: false,
    });
    if (!res.webPath) return null;
    return await webPathToBlob(res.webPath);
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

/** Selfie con la fotocamera frontale (armocromia). Null se l'utente annulla. */
export async function takeSelfie(): Promise<Blob | null> {
  if (!isNative()) return (await pickFromInput({ multiple: false, capture: 'user' }))[0] ?? null;
  try {
    const res = await Camera.takePhoto({
      quality: 95,
      correctOrientation: true,
      cameraDirection: CameraDirection.Front,
      editable: 'no',
      saveToGallery: false,
    });
    if (!res.webPath) return null;
    return await webPathToBlob(res.webPath);
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

/** Sceglie una o più foto dalla galleria (massimo 20). Lista vuota se l'utente annulla. */
export async function chooseFromGallery(multiple: boolean): Promise<Blob[]> {
  if (!isNative()) {
    const files = await pickFromInput({ multiple, capture: false });
    return files.slice(0, multiple ? MAX_BATCH : 1);
  }
  try {
    const res = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: multiple,
      limit: multiple ? MAX_BATCH : 1,
      correctOrientation: true,
      quality: 90,
    });
    const paths = res.results.map((r) => r.webPath).filter((p): p is string => !!p);
    const blobs: Blob[] = [];
    for (const p of paths.slice(0, multiple ? MAX_BATCH : 1)) blobs.push(await webPathToBlob(p));
    return blobs;
  } catch (e) {
    if (isCancel(e)) return [];
    throw e;
  }
}
