<script lang="ts">
  import { onMount } from 'svelte';
  import { registerOverlay } from '../state/ui.svelte';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';

  let {
    photoIds,
    start = 0,
    alt,
    onclose,
  }: { photoIds: string[]; start?: number; alt: string; onclose: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let index = $state(Math.min(start, Math.max(0, photoIds.length - 1)));
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let swipeDx = $state(0);

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { dist: number; scale: number; cx: number; cy: number; tx: number; ty: number } | null = null;
  let pan: { x: number; y: number; tx: number; ty: number } | null = null;
  let lastTap = 0;

  onMount(() => registerOverlay(() => onclose()));

  function resetZoom() {
    scale = 1;
    tx = 0;
    ty = 0;
  }

  function go(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= photoIds.length) return;
    index = next;
    resetZoom();
  }

  function centerAndDist() {
    const [a, b] = [...pointers.values()];
    return { cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  }

  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const g = centerAndDist();
      gesture = { ...g, scale, tx, ty };
      pan = null;
    } else if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTap < 280) {
        // Doppio tocco: zoom 2,5× oppure torna a 1×.
        if (scale > 1) resetZoom();
        else scale = 2.5;
        lastTap = 0;
      } else {
        lastTap = now;
      }
      pan = { x: e.clientX, y: e.clientY, tx, ty };
    }
  }

  function move(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && pointers.size >= 2) {
      const g = centerAndDist();
      scale = Math.max(1, Math.min(5, (gesture.scale * g.dist) / Math.max(1, gesture.dist)));
      tx = gesture.tx + (g.cx - gesture.cx);
      ty = gesture.ty + (g.cy - gesture.cy);
    } else if (pan) {
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (scale > 1) {
        tx = pan.tx + dx;
        ty = pan.ty + dy;
      } else {
        swipeDx = dx;
      }
    }
  }

  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) gesture = null;
    if (pointers.size === 0) {
      if (scale <= 1.02) {
        if (swipeDx < -60) go(1);
        else if (swipeDx > 60) go(-1);
        resetZoom();
      }
      swipeDx = 0;
      pan = null;
    }
  }
</script>

<div class="lightbox" role="dialog" aria-modal="true" aria-label="Foto: {alt}">
  <header>
    <span class="count">{photoIds.length > 1 ? `${index + 1} di ${photoIds.length}` : ''}</span>
    <button class="icon-btn" aria-label="Chiudi" onclick={onclose}><Icon name="close" /></button>
  </header>
  <div
    class="area"
    role="presentation"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    {#key photoIds[index]}
      <div class="img" style:transform="translate({tx + swipeDx}px, {ty}px) scale({scale})">
        <PhotoThumb photoId={photoIds[index]} {alt} kind="main" eager />
      </div>
    {/key}
  </div>
  {#if photoIds.length > 1}
    <footer>
      <button class="icon-btn" aria-label="Foto precedente" disabled={index === 0} onclick={() => go(-1)}>
        <Icon name="back" />
      </button>
      <span class="hint">Due dita per ingrandire · doppio tocco per lo zoom</span>
      <button class="icon-btn" aria-label="Foto successiva" disabled={index === photoIds.length - 1} onclick={() => go(1)}>
        <Icon name="chevron" />
      </button>
    </footer>
  {:else}
    <footer><span class="hint">Due dita per ingrandire · doppio tocco per lo zoom</span></footer>
  {/if}
</div>

<style>
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 75;
    background: #000;
    color: #fff;
    display: flex;
    flex-direction: column;
    padding: var(--safe-top) 0 var(--safe-bottom);
  }
  header,
  footer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
  }
  .icon-btn {
    color: #fff;
  }
  .count {
    padding-left: 12px;
    font-size: 0.875rem;
    opacity: 0.8;
  }
  .area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
    display: grid;
    place-items: center;
  }
  .img {
    width: 100%;
    height: 100%;
    transform-origin: center;
  }
  .img :global(.thumb) {
    background: transparent;
  }
  footer {
    justify-content: center;
    gap: 8px;
  }
  .hint {
    font-size: 0.75rem;
    opacity: 0.7;
    text-align: center;
    flex: 1;
  }
</style>
