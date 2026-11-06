import { db } from '../db';
import type { ColorId, OutfitLayoutEntry } from '../db/types';
import { colorInfo } from '../logic/colors';
import { drawOrder } from '../logic/outfits';

// Immagine da condividere: collage dell'outfit su sfondo neutro, con titolo e palette.

export interface CollageImageInput {
  title: string;
  subtitle?: string;
  layout: readonly OutfitLayoutEntry[];
  /** Pezzo → foto di copertina (undefined se il pezzo non ha foto). */
  photoOf: ReadonlyMap<string, string | undefined>;
  nameOf: ReadonlyMap<string, string>;
  palette: readonly ColorId[];
}

const W = 1080;
const HEADER = 180;
const BOX_H = Math.round(W / (3 / 4));
const FOOTER = 120;
const H = HEADER + BOX_H + FOOTER;
const BG = '#f6f1ea';
const INK = '#2b2520';
const MUTED = '#7a6d60';

type Drawable = ImageBitmap | HTMLImageElement;

async function loadDrawable(photoId: string): Promise<Drawable | null> {
  const rec = await db.photos.get(photoId);
  if (!rec) return null;
  try {
    return await createImageBitmap(rec.blob);
  } catch {
    const url = URL.createObjectURL(rec.blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function sizeOf(d: Drawable): { w: number; h: number } {
  return d instanceof HTMLImageElement ? { w: d.naturalWidth, h: d.naturalHeight } : { w: d.width, h: d.height };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Accorcia il testo con "…" finché non entra nella larghezza. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export async function renderCollageImage(input: CollageImageInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  if (document.fonts?.ready) await document.fonts.ready;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = '500 64px "Noto Serif", Georgia, "Times New Roman", serif';
  ctx.fillText(fitText(ctx, input.title, W - 120), W / 2, input.subtitle ? 100 : 118);
  if (input.subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = '400 32px system-ui, -apple-system, Roboto, sans-serif';
    ctx.fillText(fitText(ctx, input.subtitle, W - 160), W / 2, 150);
  }

  for (const e of drawOrder(input.layout)) {
    const w = e.scale * W;
    const cx = e.x * W;
    const cy = HEADER + e.y * BOX_H;
    const photoId = input.photoOf.get(e.itemId);
    const d = photoId ? await loadDrawable(photoId) : null;
    if (d) {
      const s = sizeOf(d);
      const h = s.w > 0 ? (w * s.h) / s.w : w;
      ctx.save();
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 20);
      ctx.clip();
      ctx.drawImage(d, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      if (!(d instanceof HTMLImageElement)) d.close();
    } else {
      const h = w * 1.2;
      ctx.fillStyle = '#e8e0d4';
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 20);
      ctx.fill();
      ctx.fillStyle = MUTED;
      ctx.font = `500 ${Math.max(22, Math.round(w / 9))}px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText(fitText(ctx, input.nameOf.get(e.itemId) ?? '', w - 24), cx, cy);
    }
  }

  const dots = input.palette.slice(0, 8);
  if (dots.length) {
    const r = 22;
    const gap = 18;
    const total = dots.length * r * 2 + (dots.length - 1) * gap;
    let x = (W - total) / 2 + r;
    const y = HEADER + BOX_H + 38;
    for (const c of dots) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = colorInfo(c).hex;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.stroke();
      x += r * 2 + gap;
    }
  }
  ctx.fillStyle = MUTED;
  ctx.font = '400 26px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillText('Creato con Armadio', W / 2, H - 22);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Immagine non creata'))), 'image/jpeg', 0.92),
  );
}
