import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { u8ToBase64 } from '../logic/bytes';
import type { ContourName, FaceGeometry, Point } from '../logic/faceColors';
import type { Img } from '../logic/imageOps';
import { imgToJpegBlob } from './pipeline';

// Armocromia: viso trovato sul telefono con ML Kit (FacePlugin.java). Solo nell'app Android:
// nella versione web i colori si scelgono toccando la foto.

interface NativeFace {
  bounds: { x: number; y: number; width: number; height: number };
  angles: { x: number; y: number; z: number };
  contours: Partial<Record<ContourName, number[]>>;
}

interface FacePluginApi {
  detect(options: { path: string; maxSide?: number }): Promise<{ width: number; height: number; faces: NativeFace[] }>;
}

const Face = registerPlugin<FacePluginApi>('Face');

export function faceDetectionSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Da [x0, y0, x1, y1, ...] a punti, riportati alla scala della foto analizzata in JavaScript. */
export function toGeometry(face: NativeFace, scale: number): FaceGeometry {
  const contours: Partial<Record<ContourName, Point[]>> = {};
  for (const [name, flat] of Object.entries(face.contours) as [ContourName, number[]][]) {
    const pts: Point[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i]! * scale, flat[i + 1]! * scale]);
    if (pts.length) contours[name] = pts;
  }
  return {
    bounds: { x: face.bounds.x * scale, y: face.bounds.y * scale, width: face.bounds.width * scale, height: face.bounds.height * scale },
    angles: face.angles,
    contours,
  };
}

/** Il viso più grande nella foto, oppure null se non c'è. */
export async function detectFace(img: Img): Promise<FaceGeometry | null> {
  if (!faceDetectionSupported()) return null;
  const jpeg = await imgToJpegBlob(img, 0.95);
  const name = `face-${Date.now()}.jpg`;
  await Filesystem.writeFile({ path: name, directory: Directory.Cache, data: u8ToBase64(new Uint8Array(await jpeg.arrayBuffer())) });
  try {
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    const res = await Face.detect({ path: uri, maxSide: Math.max(img.width, img.height) });
    if (!res.faces.length) return null;
    const biggest = [...res.faces].sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)[0]!;
    return toGeometry(biggest, img.width / res.width);
  } finally {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => undefined);
  }
}
