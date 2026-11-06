<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte';
  import { VIRTUAL_THRESHOLD, gridColumns, gridWindow } from '../logic/virtualGrid';

  /**
   * Griglia di riquadri tutti della stessa altezza. Fino a `threshold` elementi li disegna tutti;
   * oltre, solo le righe vicine allo schermo (le foto delle altre vengono liberate).
   */
  let {
    items,
    tile,
    minCol = 104,
    gap = 12,
    threshold = VIRTUAL_THRESHOLD,
    label,
  }: {
    items: readonly T[];
    tile: Snippet<[T]>;
    minCol?: number;
    gap?: number;
    threshold?: number;
    label?: string;
  } = $props();

  let ul = $state<HTMLUListElement>();
  let width = $state(0);
  let rowHeight = $state(0);
  let viewTop = $state(0);
  let viewHeight = $state(800);

  const virtual = $derived(items.length > threshold);
  const cols = $derived(gridColumns(width, minCol, gap));
  // Prima della misura vera: foto 3:4 più due righe di testo.
  const estimate = $derived(width > 0 ? ((width - (cols - 1) * gap) / cols) * (4 / 3) + 40 : 180);
  const win = $derived(
    virtual
      ? gridWindow({ count: items.length, cols, rowHeight: rowHeight || estimate, gap, viewTop, viewHeight })
      : { start: 0, end: items.length, padTop: 0, padBottom: 0 },
  );
  const slice = $derived(virtual ? items.slice(win.start, win.end) : items);

  function scrollParent(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll') return p;
    }
    return null;
  }

  // Larghezza, posizione e scorrimento: ascoltati solo quando la griglia è virtualizzata.
  $effect(() => {
    if (!virtual || !ul) return;
    const list = ul;
    const scroller = scrollParent(list);
    let frame = 0;
    const measure = () => {
      frame = 0;
      width = list.clientWidth;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      viewTop = top - list.getBoundingClientRect().top;
      viewHeight = scroller ? scroller.clientHeight : window.innerHeight;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(list);
    if (scroller) ro.observe(scroller);
    return () => {
      target.removeEventListener('scroll', schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  });

  // Altezza vera di una riga, misurata sul primo riquadro disegnato.
  $effect(() => {
    if (!virtual || !ul) return;
    void slice;
    void width;
    const first = ul.firstElementChild as HTMLElement | null;
    if (!first) return;
    const h = first.getBoundingClientRect().height;
    if (h > 0 && Math.abs(h - rowHeight) > 0.5) rowHeight = h;
  });
</script>

<ul
  class="vgrid"
  bind:this={ul}
  aria-label={label}
  style:grid-template-columns={virtual ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${minCol}px, 1fr))`}
  style:gap="{gap}px"
  style:padding-top="{win.padTop}px"
  style:padding-bottom="{win.padBottom}px"
>
  {#each slice as item (item.id)}
    <li>{@render tile(item)}</li>
  {/each}
</ul>

<style>
  .vgrid {
    list-style: none;
    padding-left: 0;
    padding-right: 0;
    margin: 10px 0 0;
    display: grid;
  }
  li {
    min-width: 0;
  }
</style>
