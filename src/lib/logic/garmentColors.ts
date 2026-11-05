import type { ColorId } from '../db/types';
import { detectColors } from './colors';
import { applyBackgroundMask, floodFillBackground, transparentShare, type Img } from './imageOps';

/**
 * Colori del capo in una foto. Se la foto non è scontornata, prima si "toglie" lo sfondo
 * dagli angoli (solo per il calcolo, la foto resta com'è) così il colore dello sfondo non conta.
 */
export function detectGarmentColors(img: Img): ColorId[] {
  if (transparentShare(img) < 0.05) {
    const mask = floodFillBackground(img, 25);
    let bg = 0;
    for (let i = 0; i < mask.length; i++) bg += mask[i]!;
    const share = bg / mask.length;
    if (share > 0.08 && share < 0.92) return detectColors(applyBackgroundMask(img, mask));
  }
  return detectColors(img);
}
