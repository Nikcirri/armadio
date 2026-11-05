/** Dimensioni di salvataggio delle foto (SPEC.md, sezione 6). */
export const MAIN_MAX_SIDE = 1200;
export const THUMB_MAX_SIDE = 320;
export const WEBP_QUALITY = 0.8;
export const THUMB_QUALITY = 0.75;

/** Lato lungo della foto da salvare, mantenendo le proporzioni. */
export function fitSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
