<script lang="ts">
  import type { OutfitLayoutEntry } from '../../lib/db/types';
  import { bringToFront, moveEntry, scaleEntry, type Piece } from '../../lib/logic/outfits';
  import CollagePiece from './CollagePiece.svelte';

  /**
   * Collage dell'outfit (riquadro 3:4). In modifica: un dito sposta il pezzo,
   * due dita lo ingrandiscono o rimpiccioliscono.
   */
  let {
    pieces,
    layout,
    kind = 'thumb',
    editable = false,
    selected = null,
    onselect,
    onchange,
    label = 'Collage dell’outfit',
  }: {
    pieces: readonly Piece[];
    layout: readonly OutfitLayoutEntry[];
    kind?: 'thumb' | 'main';
    editable?: boolean;
    selected?: string | null;
    onselect?: (id: string | null) => void;
    onchange?: (layout: OutfitLayoutEntry[]) => void;
    label?: string;
  } = $props();

  let box: HTMLDivElement;
  const byId = $derived(new Map(pieces.map((p) => [p.id, p])));
  const entries = $derived(layout.filter((e) => byId.has(e.itemId)));

  type Gesture = {
    id: string;
    startX: number;
    startY: number;
    startScale: number;
    origin: { x: number; y: number };
    startDist: number;
  };
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: Gesture | null = null;

  function pinchDistance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function begin(id: string, current: readonly OutfitLayoutEntry[]) {
    const e = current.find((x) => x.itemId === id);
    if (!e) return;
    const first = [...pointers.values()][0] ?? { x: 0, y: 0 };
    gesture = { id, startX: e.x, startY: e.y, startScale: e.scale, origin: { ...first }, startDist: pinchDistance() };
  }

  function onPointerDown(ev: PointerEvent) {
    if (!editable) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    box.setPointerCapture(ev.pointerId);
    if (pointers.size === 1) {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-piece]');
      const id = target?.dataset.piece ?? null;
      onselect?.(id);
      if (!id) {
        gesture = null;
        return;
      }
      const next = bringToFront(layout, id);
      onchange?.(next);
      begin(id, next);
    } else if (pointers.size === 2 && selected) {
      begin(selected, layout);
    }
  }

  function onPointerMove(ev: PointerEvent) {
    if (!editable || !pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!gesture) return;
    const rect = box.getBoundingClientRect();
    if (pointers.size >= 2 && gesture.startDist > 0) {
      const ratio = pinchDistance() / gesture.startDist;
      onchange?.(scaleEntry(layout, gesture.id, gesture.startScale * ratio));
    } else if (pointers.size === 1) {
      const p = [...pointers.values()][0]!;
      const x = gesture.startX + (p.x - gesture.origin.x) / rect.width;
      const y = gesture.startY + (p.y - gesture.origin.y) / rect.height;
      onchange?.(moveEntry(layout, gesture.id, x, y));
    }
  }

  function onPointerUp(ev: PointerEvent) {
    pointers.delete(ev.pointerId);
    if (pointers.size === 1 && gesture) begin(gesture.id, layout);
    else if (pointers.size === 0) gesture = null;
  }
</script>

<div
  class="box"
  class:editable
  bind:this={box}
  role={editable ? 'application' : 'img'}
  aria-label={label}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  {#each entries as e (e.itemId)}
    {@const p = byId.get(e.itemId)!}
    <div
      class="item"
      class:sel={editable && selected === e.itemId}
      class:wish={p.source === 'wishlist'}
      data-piece={e.itemId}
      style:left="{e.x * 100}%"
      style:top="{e.y * 100}%"
      style:width="{e.scale * 100}%"
      style:z-index={e.z}
    >
      <CollagePiece photoId={p.photoId} name={p.name} {kind} />
    </div>
  {/each}
  {#if !entries.length}
    <p class="empty">Scegli i capi: il collage si compone da solo.</p>
  {/if}
</div>

<style>
  .box {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 4;
    background: var(--surface-2);
    border-radius: var(--radius);
    overflow: hidden;
    isolation: isolate;
  }
  .box.editable {
    touch-action: none;
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }
  .item {
    position: absolute;
    transform: translate(-50%, -50%);
  }
  .editable .item {
    cursor: grab;
  }
  .item.sel {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 8px;
  }
  .item.wish {
    opacity: 0.7;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }
</style>
