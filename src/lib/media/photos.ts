import { db } from '../db';
import type { PhotoRecord } from '../db/types';
import type { Img } from '../logic/imageOps';
import { newId, nowIso } from '../logic/util';
import { decodeBlob, encodeImg } from './pipeline';

/** Salva un'immagine nella tabella photos (1200 px + miniatura) e restituisce l'id. */
export async function storePhoto(img: Img): Promise<string> {
  const { blob, thumb, width, height } = await encodeImg(img);
  const now = nowIso();
  const rec: PhotoRecord = { id: newId(), blob, thumb, width, height, createdAt: now, updatedAt: now };
  await db.photos.add(rec);
  return rec.id;
}

/** Sostituisce l'immagine di una foto esistente (stesso id). */
export async function replacePhoto(id: string, img: Img): Promise<void> {
  const current = await db.photos.get(id);
  if (!current) throw new Error('Foto non trovata');
  const { blob, thumb, width, height } = await encodeImg(img);
  await db.photos.put({ ...current, blob, thumb, width, height, updatedAt: nowIso() });
}

/** Carica la foto per modificarla nell'editor. */
export async function loadPhotoImg(id: string): Promise<Img> {
  const rec = await db.photos.get(id);
  if (!rec) throw new Error('Foto non trovata');
  return decodeBlob(rec.blob);
}
