<script lang="ts">
  import { onMount } from 'svelte';
  import {
    adjustLight,
    applyBackgroundMask,
    brushStroke,
    centeredRect,
    clampRect,
    cloneImg,
    crop,
    rotate90,
    type Img,
    type Rect,
  } from '../logic/imageOps';
  import { backgroundMask } from '../media/pipeline';
  import { aiCutout, aiCutoutSupported, installAiModule } from '../media/segmentation';
  import { isAiModuleMissing } from '../logic/aiErrors';
  import { confirmDialog, registerOverlay, withBusy } from '../state/ui.svelte';
  import { errorText, reportError } from '../errors';
  import { tapFeedback } from '../platform';
  import Icon from './Icon.svelte';

  type Mode = 'main' | 'crop' | 'light' | 'cutout' | 'brush';
  type Corner = 'nw' | 'ne' | 'sw' | 'se';

  let {
    img,
    title = 'Modifica foto',
    saveLabel = 'Salva',
    onsave,
    oncancel,
  }: {
    img: Img;
    title?: string;
    saveLabel?: string;
    onsave: (img: Img) => void | Promise<void>;
    oncancel: () => void;
  } = $props();

  // L'originale resta intatto fino al salvataggio ("Ripristina originale").
  // svelte-ignore state_referenced_locally
  const original = cloneImg(img);
  // `base` = foto senza trasparenze dello scontorno (serve al pennello "Ripristina").
  let base = $state.raw(cloneImg(original));
  let current = $state.raw(cloneImg(original));
  let history = $state.raw<{ base: Img; current: Img }[]>([]);
  let changed = $state(false);
  let mode = $state<Mode>('main');
  let saving = $state(false);

  let canvas: HTMLCanvasElement;
  let vpW = $state(0);
  let vpH = $state(0);

  let brightness = $state(0);
  let contrast = $state(0);
  let cropRatio = $state<number | null>(3 / 4);
  let cropRect = $state<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  let tolerance = $state(30);
  let lastCutout = $state<'ai' | 'corners' | null>(null);
  let brushMode = $state<'erase' | 'restore'>('erase');
  let brushSize = $state(28);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let panning = $state(false);

  const aiSupported = aiCutoutSupported();

  // Dimensione a schermo: la foto entra tutta nello spazio disponibile.
  const display = $derived.by(() => {
    if (!vpW || !vpH) return { w: 0, h: 0 };
    // Margine di 28 px: le maniglie del ritaglio restano dentro lo schermo.
    const scale = Math.min((vpW - 56) / current.width, (vpH - 56) / current.height);
    return { w: Math.max(1, Math.floor(current.width * scale)), h: Math.max(1, Math.floor(current.height * scale)) };
  });

  function draw(image: Img) {
    if (!canvas) return;
    if (canvas.width !== image.width || canvas.height !== image.height) {
      canvas.width = image.width;
      canvas.height = image.height;
    }
    const ctx = canvas.getContext('2d');
    ctx?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  }

  $effect(() => {
    const showLight = mode === 'light' && (brightness !== 0 || contrast !== 0);
    draw(showLight ? adjustLight(current, brightness, contrast) : current);
  });

  function commit(next: { base?: Img; current: Img }) {
    history = [...history.slice(-4), { base, current }];
    if (next.base) base = next.base;
    current = next.current;
    changed = true;
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    history = history.slice(0, -1);
    base = last.base;
    current = last.current;
    changed = history.length > 0 || changed;
  }

  async function resetOriginal() {
    const ok = await confirmDialog({
      title: 'Tornare alla foto originale?',
      message: 'Si perdono tutte le modifiche fatte in questo editor.',
      confirmLabel: 'Ripristina',
    });
    if (!ok) return;
    base = cloneImg(original);
    current = cloneImg(original);
    history = [];
    changed = false;
    lastCutout = null;
    mode = 'main';
  }

  async function cancel() {
    if (changed) {
      const ok = await confirmDialog({
        title: 'Uscire senza salvare?',
        message: 'Le modifiche alla foto andranno perse.',
        confirmLabel: 'Esci',
        danger: true,
      });
      if (!ok) return;
    }
    oncancel();
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await onsave(current);
      void tapFeedback();
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare la foto.');
    } finally {
      saving = false;
    }
  }

  onMount(() => registerOverlay(() => void (mode === 'main' ? cancel() : leaveMode())));

  function leaveMode() {
    if (mode === 'light') {
      brightness = 0;
      contrast = 0;
    }
    if (mode === 'brush') {
      zoom = 1;
      panX = 0;
      panY = 0;
      panning = false;
    }
    mode = 'main';
  }

  // ---------- Ruota ----------
  function rotate() {
    commit({ base: rotate90(base), current: rotate90(current) });
  }

  // ---------- Ritaglia ----------
  function startCrop() {
    cropRect = centeredRect(current.width, current.height, cropRatio);
    mode = 'crop';
  }
  function setRatio(r: number | null) {
    cropRatio = r;
    cropRect = centeredRect(current.width, current.height, r);
  }
  function applyCrop() {
    const r = clampRect(cropRect, current.width, current.height);
    commit({ base: crop(base, r), current: crop(current, r) });
    mode = 'main';
  }

  let drag: { kind: 'move' | Corner; x: number; y: number; rect: Rect; scale: number } | null = null;

  function startDrag(e: PointerEvent, kind: 'move' | Corner) {
    e.stopPropagation();
    const box = canvas.getBoundingClientRect();
    drag = { kind, x: e.clientX, y: e.clientY, rect: { ...cropRect }, scale: current.width / box.width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveDrag(e: PointerEvent) {
    if (!drag) return;
    const W = current.width;
    const H = current.height;
    const MIN = Math.max(40, Math.round(Math.min(W, H) * 0.1));
    const dx = (e.clientX - drag.x) * drag.scale;
    const dy = (e.clientY - drag.y) * drag.scale;
    const r = drag.rect;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (drag.kind === 'move') {
      cropRect = { ...r, x: clamp(r.x + dx, 0, W - r.w), y: clamp(r.y + dy, 0, H - r.h) };
      return;
    }
    const k = drag.kind;
    let left = r.x;
    let top = r.y;
    let right = r.x + r.w;
    let bottom = r.y + r.h;
    if (k.includes('w')) left = clamp(left + dx, 0, right - MIN);
    if (k.includes('e')) right = clamp(right + dx, left + MIN, W);
    if (k.includes('n')) top = clamp(top + dy, 0, bottom - MIN);
    if (k.includes('s')) bottom = clamp(bottom + dy, top + MIN, H);
    if (cropRatio) {
      // Rapporto bloccato: l'altezza segue la larghezza, ancorata al lato opposto all'angolo.
      let w = right - left;
      let h = w / cropRatio;
      const maxH = k.includes('s') ? H - top : bottom;
      if (h > maxH) {
        h = maxH;
        w = h * cropRatio;
      }
      if (k.includes('e')) right = left + w;
      else left = right - w;
      if (k.includes('s')) bottom = top + h;
      else top = bottom - h;
    }
    cropRect = { x: left, y: top, w: right - left, h: bottom - top };
  }

  function endDrag() {
    drag = null;
  }

  // ---------- Luce ----------
  function applyLight() {
    if (brightness !== 0 || contrast !== 0) {
      commit({ base: adjustLight(base, brightness, contrast), current: adjustLight(current, brightness, contrast) });
    }
    brightness = 0;
    contrast = 0;
    mode = 'main';
  }

  // ---------- Scontorno ----------
  // Si prova subito lo scontorno: il download del modulo di Google si propone solo se Google dice che manca.
  async function runAi() {
    try {
      let out: Img;
      try {
        out = await withBusy('Scontorno automatico…', () => aiCutout(base));
      } catch (e) {
        if (!isAiModuleMissing(errorText(e))) throw e;
        const ok = await confirmDialog({
          title: 'Scaricare lo scontorno automatico?',
          message:
            'Serve internet solo questa volta: Google scarica sul telefono un piccolo modulo gratuito. Dopo funziona anche senza internet.',
          confirmLabel: 'Scarica',
        });
        if (!ok) return;
        await withBusy('Scarico il modulo di scontorno…', (progress) => installAiModule((p) => progress(p, 100)));
        out = await withBusy('Scontorno automatico…', () => aiCutout(base));
      }
      commit({ current: out });
      lastCutout = 'ai';
    } catch (e) {
      reportError(
        e,
        `Lo scontorno automatico non è riuscito (${errorText(e)}). Prova “Dagli angoli” o il pennello.`,
      );
    }
  }

  async function runCorners(replaceLast = false) {
    try {
      const mask = await withBusy('Tolgo lo sfondo…', () => backgroundMask(base, tolerance));
      const out = applyBackgroundMask(base, mask);
      if (replaceLast && lastCutout === 'corners') {
        current = out;
        changed = true;
      } else {
        commit({ current: out });
      }
      lastCutout = 'corners';
    } catch (e) {
      reportError(e);
    }
  }

  function removeCutout() {
    commit({ current: cloneImg(base) });
    lastCutout = null;
  }

  // ---------- Pennello ----------
  let stroke: { last: [number, number]; data: ImageData } | null = null;
  let pan: { x: number; y: number; px: number; py: number } | null = null;

  function toImage(e: PointerEvent): [number, number] {
    const b = canvas.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * current.width, ((e.clientY - b.top) / b.height) * current.height];
  }

  function paint(x: number, y: number) {
    if (!stroke) return;
    const r = brushStroke(current, base, x, y, brushSize / 2, brushMode);
    if (r) canvas.getContext('2d')?.putImageData(stroke.data, 0, 0, r.x, r.y, r.w, r.h);
  }

  function brushDown(e: PointerEvent) {
    if (mode !== 'brush') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (panning) {
      pan = { x: e.clientX, y: e.clientY, px: panX, py: panY };
      return;
    }
    history = [...history.slice(-4), { base, current: cloneImg(current) }];
    changed = true;
    stroke = { last: toImage(e), data: new ImageData(current.data as Uint8ClampedArray<ArrayBuffer>, current.width, current.height) };
    paint(...stroke.last);
  }

  function brushMove(e: PointerEvent) {
    if (pan) {
      panX = pan.px + (e.clientX - pan.x);
      panY = pan.py + (e.clientY - pan.y);
      return;
    }
    if (!stroke) return;
    const [x, y] = toImage(e);
    const [lx, ly] = stroke.last;
    const dist = Math.hypot(x - lx, y - ly);
    const step = Math.max(1, brushSize / 4);
    for (let t = step; t <= dist; t += step) paint(lx + ((x - lx) * t) / dist, ly + ((y - ly) * t) / dist);
    paint(x, y);
    stroke.last = [x, y];
  }

  function brushUp() {
    stroke = null;
    pan = null;
  }

  const TOOLS: { id: Exclude<Mode, 'main'> | 'rotate'; label: string }[] = [
    { id: 'rotate', label: 'Ruota 90°' },
    { id: 'crop', label: 'Ritaglia' },
    { id: 'light', label: 'Luce' },
    { id: 'cutout', label: 'Scontorna' },
    { id: 'brush', label: 'Pennello' },
  ];

  function pickTool(id: (typeof TOOLS)[number]['id']) {
    if (id === 'rotate') return rotate();
    if (id === 'crop') return startCrop();
    mode = id;
  }
</script>

<div class="editor" role="dialog" aria-modal="true" aria-label={title}>
  <header>
    <button class="icon-btn" aria-label="Chiudi senza salvare" onclick={cancel}><Icon name="close" /></button>
    <h2>{title}</h2>
    <button class="icon-btn" aria-label="Annulla ultimo passo" disabled={history.length === 0} onclick={undo}>
      <Icon name="back" />
    </button>
    <button class="btn btn-primary save" disabled={saving || mode !== 'main'} onclick={save}>{saveLabel}</button>
  </header>

  <div class="viewport" bind:clientWidth={vpW} bind:clientHeight={vpH}>
    <div
      class="stage"
      class:brush={mode === 'brush' && !panning}
      style:width="{display.w}px"
      style:height="{display.h}px"
      style:transform="translate({panX}px, {panY}px) scale({zoom})"
      role="presentation"
      onpointerdown={brushDown}
      onpointermove={brushMove}
      onpointerup={brushUp}
      onpointercancel={brushUp}
    >
      <canvas bind:this={canvas}></canvas>
      {#if mode === 'crop'}
        <div
          class="crop"
          role="presentation"
          style:left="{(cropRect.x / current.width) * 100}%"
          style:top="{(cropRect.y / current.height) * 100}%"
          style:width="{(cropRect.w / current.width) * 100}%"
          style:height="{(cropRect.h / current.height) * 100}%"
          onpointerdown={(e) => startDrag(e, 'move')}
          onpointermove={moveDrag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
        >
          {#each ['nw', 'ne', 'sw', 'se'] as const as c (c)}
            <span
              class="handle {c}"
              role="presentation"
              onpointerdown={(e) => startDrag(e, c)}
              onpointermove={moveDrag}
              onpointerup={endDrag}
              onpointercancel={endDrag}
            ></span>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <footer>
    {#if mode === 'main'}
      <div class="tools">
        {#each TOOLS as t (t.id)}
          <button class="tool" onclick={() => pickTool(t.id)}>{t.label}</button>
        {/each}
      </div>
      <button class="btn btn-ghost reset" disabled={!changed} onclick={resetOriginal}>Ripristina originale</button>
    {:else if mode === 'crop'}
      <div class="segmented">
        <button aria-pressed={cropRatio === 3 / 4} onclick={() => setRatio(3 / 4)}>3:4 verticale</button>
        <button aria-pressed={cropRatio === 1} onclick={() => setRatio(1)}>1:1 quadrato</button>
        <button aria-pressed={cropRatio === null} onclick={() => setRatio(null)}>Libero</button>
      </div>
      <p class="hint">Trascina il riquadro o i suoi angoli.</p>
      <div class="row-actions">
        <button class="btn btn-ghost" onclick={leaveMode}>Annulla</button>
        <button class="btn btn-primary" onclick={applyCrop}>Applica</button>
      </div>
    {:else if mode === 'light'}
      <label class="slider">
        <span>Luminosità <strong>{brightness > 0 ? '+' : ''}{brightness}</strong></span>
        <input type="range" min="-60" max="60" step="1" bind:value={brightness} />
      </label>
      <label class="slider">
        <span>Contrasto <strong>{contrast > 0 ? '+' : ''}{contrast}</strong></span>
        <input type="range" min="-60" max="60" step="1" bind:value={contrast} />
      </label>
      <div class="row-actions">
        <button class="btn btn-ghost" onclick={leaveMode}>Annulla</button>
        <button class="btn btn-primary" onclick={applyLight}>Applica</button>
      </div>
    {:else if mode === 'cutout'}
      <div class="stack">
        {#if aiSupported}
          <button class="btn btn-primary btn-block" onclick={runAi}>Automatico (AI)</button>
        {/if}
        <button class="btn btn-block" onclick={() => runCorners(false)}>Dagli angoli</button>
        {#if lastCutout === 'corners'}
          <label class="slider">
            <span>Quanto sfondo togliere <strong>{tolerance}</strong></span>
            <input type="range" min="0" max="100" step="1" bind:value={tolerance} onchange={() => runCorners(true)} />
          </label>
        {/if}
        <div class="row-actions">
          <button class="btn btn-ghost" onclick={removeCutout}>Togli scontorno</button>
          <button class="btn" onclick={() => (mode = 'brush')}>Rifinisci col pennello</button>
        </div>
        <button class="btn btn-ghost" onclick={leaveMode}>Fatto</button>
      </div>
    {:else if mode === 'brush'}
      <div class="segmented">
        <button aria-pressed={!panning && brushMode === 'erase'} onclick={() => ((brushMode = 'erase'), (panning = false))}>Gomma</button>
        <button aria-pressed={!panning && brushMode === 'restore'} onclick={() => ((brushMode = 'restore'), (panning = false))}>Ripristina</button>
        <button aria-pressed={panning} onclick={() => (panning = true)}>Sposta</button>
      </div>
      <label class="slider">
        <span>Dimensione pennello <strong>{brushSize}</strong></span>
        <input type="range" min="6" max="120" step="2" bind:value={brushSize} />
      </label>
      <div class="segmented">
        {#each [1, 2, 3] as z (z)}
          <button aria-pressed={zoom === z} onclick={() => ((zoom = z), z === 1 && ((panX = 0), (panY = 0)))}>Zoom {z}×</button>
        {/each}
      </div>
      <button class="btn btn-ghost btn-block" onclick={leaveMode}>Fatto</button>
    {/if}
  </footer>
</div>

<style>
  .editor {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    flex-direction: column;
    background: #121212;
    color: #f2f2f2;
    padding-top: var(--safe-top);
    padding-bottom: var(--safe-bottom);
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px 4px 4px;
  }
  header .icon-btn {
    color: #f2f2f2;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 1.125rem;
  }
  .save {
    min-height: 40px;
  }
  .viewport {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: grid;
    place-items: center;
    touch-action: none;
  }
  .stage {
    position: relative;
    background-color: #fff;
    background-image: conic-gradient(#d6d6d6 25%, #fff 0 50%, #d6d6d6 0 75%, #fff 0);
    background-size: 16px 16px;
    transform-origin: center;
    transition: transform 120ms ease;
    touch-action: none;
  }
  .stage.brush {
    cursor: crosshair;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .crop {
    position: absolute;
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55);
    outline: 2px solid #fff;
    touch-action: none;
  }
  .handle {
    position: absolute;
    width: 36px;
    height: 36px;
    margin: -18px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.9);
    border: 3px solid #121212;
    touch-action: none;
  }
  .nw {
    left: 0;
    top: 0;
  }
  .ne {
    right: 0;
    top: 0;
    margin-right: -18px;
    margin-left: 0;
  }
  .sw {
    left: 0;
    bottom: 0;
    margin-bottom: -18px;
    margin-top: 0;
  }
  .se {
    right: 0;
    bottom: 0;
    margin: 0 -18px -18px 0;
  }
  footer {
    flex: none;
    padding: 12px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #1b1b1b;
    border-top: 1px solid #2c2c2c;
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .tool {
    min-height: 56px;
    border: 0;
    border-radius: 12px;
    background: #2a2a2a;
    color: #f2f2f2;
    font-size: 0.8125rem;
    cursor: pointer;
  }
  .tool:active {
    background: #3a3a3a;
  }
  .reset,
  footer .btn-ghost {
    color: #f2f2f2;
  }
  footer .btn:not(.btn-primary):not(.btn-ghost) {
    background: #2a2a2a;
    border-color: #3a3a3a;
    color: #f2f2f2;
  }
  footer .segmented {
    background: #2a2a2a;
  }
  footer .segmented button {
    color: #f2f2f2;
  }
  footer .segmented button[aria-pressed='true'] {
    background: #f2f2f2;
    color: #121212;
  }
  .hint {
    margin: 0;
    font-size: 0.875rem;
    color: #bdbdbd;
    text-align: center;
  }
  .row-actions {
    display: flex;
    gap: 8px;
  }
  .row-actions .btn {
    flex: 1;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .slider {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.875rem;
  }
  .slider span {
    display: flex;
    justify-content: space-between;
  }
  input[type='range'] {
    width: 100%;
    min-height: 32px;
    accent-color: #f2f2f2;
  }
</style>
