import { registerPlugin } from '@capacitor/core';

/** Plugin nativo dell'app (android/app/src/main/java/com/nikcirri/armadio/CutoutPlugin.java). */
export interface CutoutPlugin {
  /** Restituisce la sagoma del soggetto: confidenza 0-255 per pixel, in base64. */
  segment(options: { path: string; maxSide?: number }): Promise<{ width: number; height: number; mask: string }>;
}

export const Cutout = registerPlugin<CutoutPlugin>('Cutout');

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
