import type { DemoShape } from '../logic/demo';

const W = 600;
const H = 800;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount)))),
  );
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

function fillShape(ctx: CanvasRenderingContext2D, path: Path2D, hex: string): void {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, shade(hex, 0.18));
  grad.addColorStop(1, shade(hex, -0.14));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = grad;
  ctx.fill(path);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = shade(hex, -0.35);
  ctx.stroke(path);
}

function line(ctx: CanvasRenderingContext2D, hex: string, points: [number, number][], width = 3): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = shade(hex, -0.35);
  ctx.stroke();
}

function top(sleeve: 'short' | 'long'): Path2D {
  const p = new Path2D();
  const s = sleeve === 'short';
  p.moveTo(230, 150);
  p.quadraticCurveTo(300, 200, 370, 150);
  p.lineTo(470, 190);
  p.lineTo(s ? 540 : 520, s ? 320 : 600);
  p.lineTo(s ? 470 : 470, s ? 345 : 610);
  p.lineTo(440, s ? 290 : 330);
  p.lineTo(440, 660);
  p.lineTo(160, 660);
  p.lineTo(160, s ? 290 : 330);
  p.lineTo(s ? 130 : 130, s ? 345 : 610);
  p.lineTo(s ? 60 : 80, s ? 320 : 600);
  p.lineTo(130, 190);
  p.closePath();
  return p;
}

function draw(ctx: CanvasRenderingContext2D, shape: DemoShape, hex: string): void {
  switch (shape) {
    case 'tshirt': {
      fillShape(ctx, top('short'), hex);
      break;
    }
    case 'shirt': {
      fillShape(ctx, top('long'), hex);
      line(ctx, hex, [[300, 185], [300, 660]]);
      for (let y = 240; y < 640; y += 70) {
        ctx.beginPath();
        ctx.arc(312, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = shade(hex, -0.3);
        ctx.fill();
      }
      line(ctx, hex, [[230, 150], [270, 215], [300, 185], [330, 215], [370, 150]]);
      break;
    }
    case 'sweater': {
      fillShape(ctx, top('long'), hex);
      for (let y = 300; y < 650; y += 22) line(ctx, hex, [[175, y], [425, y]], 1);
      line(ctx, hex, [[160, 630], [440, 630]], 5);
      break;
    }
    case 'jeans':
    case 'trousers': {
      const p = new Path2D();
      p.moveTo(180, 110);
      p.lineTo(420, 110);
      p.lineTo(450, 720);
      p.lineTo(320, 720);
      p.lineTo(300, 300);
      p.lineTo(280, 720);
      p.lineTo(150, 720);
      p.closePath();
      fillShape(ctx, p, hex);
      line(ctx, hex, [[180, 150], [420, 150]]);
      if (shape === 'jeans') {
        line(ctx, hex, [[205, 160], [235, 240]], 2);
        line(ctx, hex, [[395, 160], [365, 240]], 2);
      } else {
        line(ctx, hex, [[215, 160], [215, 715]], 1);
        line(ctx, hex, [[385, 160], [385, 715]], 1);
      }
      break;
    }
    case 'coat': {
      const p = new Path2D();
      p.moveTo(225, 120);
      p.lineTo(300, 200);
      p.lineTo(375, 120);
      p.lineTo(470, 170);
      p.lineTo(520, 620);
      p.lineTo(470, 630);
      p.lineTo(445, 330);
      p.lineTo(455, 740);
      p.lineTo(145, 740);
      p.lineTo(155, 330);
      p.lineTo(130, 630);
      p.lineTo(80, 620);
      p.lineTo(130, 170);
      p.closePath();
      fillShape(ctx, p, hex);
      line(ctx, hex, [[300, 200], [300, 740]]);
      line(ctx, hex, [[155, 420], [445, 420]], 6);
      line(ctx, hex, [[225, 120], [260, 260], [300, 200], [340, 260], [375, 120]]);
      break;
    }
    case 'sneakers': {
      const shoe = (dx: number, dy: number) => {
        const p = new Path2D();
        p.moveTo(90 + dx, 300 + dy);
        p.quadraticCurveTo(150 + dx, 220 + dy, 260 + dx, 250 + dy);
        p.quadraticCurveTo(330 + dx, 290 + dy, 470 + dx, 330 + dy);
        p.quadraticCurveTo(520 + dx, 350 + dy, 510 + dx, 400 + dy);
        p.lineTo(90 + dx, 400 + dy);
        p.closePath();
        fillShape(ctx, p, hex);
        line(ctx, hex, [[90 + dx, 380 + dy], [510 + dx, 380 + dy]], 4);
        for (let i = 0; i < 4; i++) line(ctx, hex, [[220 + dx + i * 30, 265 + dy + i * 8], [250 + dx + i * 30, 290 + dy + i * 8]], 2);
      };
      shoe(-10, 60);
      shoe(10, 300);
      break;
    }
    case 'bag': {
      const handle = new Path2D();
      handle.moveTo(210, 300);
      handle.quadraticCurveTo(300, 120, 390, 300);
      ctx.lineWidth = 18;
      ctx.strokeStyle = shade(hex, -0.2);
      ctx.stroke(handle);
      const p = new Path2D();
      p.moveTo(120, 300);
      p.lineTo(480, 300);
      p.lineTo(510, 640);
      p.quadraticCurveTo(300, 680, 90, 640);
      p.closePath();
      fillShape(ctx, p, hex);
      line(ctx, hex, [[130, 380], [470, 380]], 2);
      ctx.fillStyle = '#c9a24a';
      ctx.fillRect(285, 370, 30, 22);
      break;
    }
  }
}

/** Disegna un capo di esempio su sfondo trasparente (come una foto già scontornata). */
export function drawDemoGarment(shape: DemoShape, hex: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx, shape, hex);
  return canvas;
}
