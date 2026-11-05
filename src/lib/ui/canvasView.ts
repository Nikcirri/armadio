import type { Img } from '../logic/imageOps';
import { imgToCanvas } from '../media/pipeline';

/** Azione Svelte: mostra un'immagine in memoria dentro l'elemento (anteprime senza salvare). */
export function canvasView(node: HTMLElement, img: Img) {
  const render = (image: Img) => {
    node.replaceChildren();
    const c = imgToCanvas(image);
    c.style.width = '100%';
    c.style.height = '100%';
    c.style.objectFit = 'contain';
    node.append(c);
  };
  render(img);
  return {
    update: render,
    destroy: () => node.replaceChildren(),
  };
}
