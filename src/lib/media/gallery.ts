import { registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { u8ToBase64 } from '../backup/device';
import { isNative } from '../platform';

// Salvataggio in galleria (plugin dell'app GalleryPlugin.java) e condivisione di un'immagine.

interface GalleryPlugin {
  saveImage(options: { data: string; fileName: string; mimeType?: string }): Promise<{ uri: string }>;
}

const Gallery = registerPlugin<GalleryPlugin>('Gallery');

export async function blobToBase64(blob: Blob): Promise<string> {
  return u8ToBase64(new Uint8Array(await blob.arrayBuffer()));
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Salva l'immagine in Immagini/Armadio (nella versione web la scarica). */
export async function saveImageToGallery(blob: Blob, fileName: string): Promise<'gallery' | 'download'> {
  if (!isNative()) {
    download(blob, fileName);
    return 'download';
  }
  await Gallery.saveImage({ data: await blobToBase64(blob), fileName, mimeType: blob.type || 'image/jpeg' });
  return 'gallery';
}

/** L'utente ha chiuso il menu Condividi senza scegliere: non è un errore. */
export function isShareCancel(e: unknown): boolean {
  return /cancel|abort|dismiss/i.test(String((e as { message?: string })?.message ?? e));
}

/** Apre il menu Condividi di Android (WhatsApp, Instagram, email…) con l'immagine. */
export async function shareImage(blob: Blob, fileName: string, title: string): Promise<void> {
  if (isNative()) {
    const written = await Filesystem.writeFile({
      path: `condividi/${fileName}`,
      directory: Directory.Cache,
      data: await blobToBase64(blob),
      recursive: true,
    });
    await Share.share({ title, files: [written.uri], dialogTitle: 'Condividi outfit' });
    return;
  }
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  download(blob, fileName);
}
