/**
 * Azione Svelte: pressione prolungata (di default 450 ms).
 * Se il dito si sposta di più di 10 px (per esempio per scorrere) non scatta.
 * Dopo una pressione prolungata il "click" che segue viene ignorato.
 */
export function longpress(node: HTMLElement, opts: { onlong: () => void; delay?: number }) {
  let options = opts;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let fired = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = null;
  };

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true;
      timer = undefined;
      options.onlong();
    }, options.delay ?? 450);
  };

  const move = (e: PointerEvent) => {
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  };

  const click = (e: MouseEvent) => {
    if (!fired) return;
    fired = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  // Niente menu contestuale del browser quando si tiene premuto.
  const contextmenu = (e: Event) => e.preventDefault();

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', click, true);
  node.addEventListener('contextmenu', contextmenu);

  return {
    update(next: { onlong: () => void; delay?: number }) {
      options = next;
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('click', click, true);
      node.removeEventListener('contextmenu', contextmenu);
    },
  };
}
