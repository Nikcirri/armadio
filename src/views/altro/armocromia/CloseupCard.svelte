<script lang="ts" module>
  export type PhotoSource = 'selfie' | 'camera' | 'gallery';
</script>

<script lang="ts">
  import type { Lab } from '../../../lib/logic/colors';
  import { labToHex } from '../../../lib/logic/colors';
  import type { Circle, CloseupKind, IrisFit } from '../../../lib/logic/closeups';
  import { manualRadius, type ManualSample, type Point } from '../../../lib/logic/faceColors';
  import { tapFeedback } from '../../../lib/platform';
  import Icon from '../../../lib/ui/Icon.svelte';

  /** Una foto da vicino (occhio o capelli): consigli, foto con i cerchi misurati, correzioni. */
  let {
    kind,
    photoUrl,
    width,
    height,
    fit,
    area,
    reference,
    lab,
    warnings,
    onpick,
    onseed,
    onreference,
    onremove,
  }: {
    kind: CloseupKind;
    /** Null finché la foto non c'è. */
    photoUrl: string | null;
    width: number;
    height: number;
    /** Occhio: iride e pupilla trovate. */
    fit: IrisFit | null;
    /** Capelli: il cerchio misurato. */
    area: Circle | null;
    reference: ManualSample | null;
    lab: Lab | null;
    warnings: readonly string[];
    onpick: (source: PhotoSource) => void;
    onseed: (point: Point) => void;
    onreference: (sample: ManualSample | null) => void;
    onremove: () => void;
  } = $props();

  const eyes = $derived(kind === 'eyes');
  let mode = $state<'seed' | 'white' | null>(null);
  let retaking = $state(false);
  let zoomed = $state(true);
  let svg = $state<SVGSVGElement>();

  /** Occhio trovato: la foto si vede ingrandita intorno all'iride. */
  const view = $derived.by(() => {
    if (!eyes || !fit || !zoomed) return { x: 0, y: 0, w: width, h: height };
    const r = fit.iris.radius;
    const w = Math.min(width, r * 6);
    const h = Math.min(height, r * 4);
    const x = Math.min(width - w, Math.max(0, fit.iris.center[0] - w / 2));
    const y = Math.min(height - h, Math.max(0, fit.iris.center[1] - h / 2));
    return { x, y, w, h };
  });
  const canZoom = $derived(eyes && !!fit && (fit.iris.radius * 6 < width * 0.9 || fit.iris.radius * 4 < height * 0.9));

  const HINT = $derived({
    seed: eyes ? 'Tocca il centro dell’occhio (la pupilla): cerco di nuovo l’iride lì intorno.' : 'Tocca i capelli dove il colore è più naturale (non i riflessi).',
    white: 'Tocca qualcosa di bianco o grigio chiaro (un foglio, una maglietta): serve a correggere la luce di questa foto.',
  });

  /** Senza iride trovata, un tocco sulla foto indica subito il centro dell'occhio. */
  const tapMode = $derived(mode ?? (eyes && !fit ? 'seed' : null));

  function tap(e: PointerEvent) {
    const current = tapMode;
    if (!current || !svg) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    const point: Point = [Math.min(width, Math.max(0, p.x)), Math.min(height, Math.max(0, p.y))];
    void tapFeedback();
    if (current === 'white') onreference({ point, radius: manualRadius('white', width, height) });
    else onseed(point);
    mode = null;
  }

  function pick(source: PhotoSource) {
    retaking = false;
    mode = null;
    zoomed = true;
    onpick(source);
  }

  const stroke = 'rgb(255 255 255 / 0.9)';
</script>

<section class="closeup" aria-labelledby="closeup-{kind}">
  <h2 class="section-title" id="closeup-{kind}">
    {eyes ? 'Occhi da vicino' : 'Capelli da vicino'}
    <span class="tag">{eyes ? 'consigliata' : 'facoltativa'}</span>
  </h2>

  {#if !photoUrl || retaking}
    {#if eyes}
      <p class="lead">Da lontano molte fotocamere sbagliano il colore degli occhi. Fai una foto di un occhio da vicino: misuro solo l’iride.</p>
      <ul class="tips">
        <li>L’occhio deve essere grande nella foto, ben aperto e rivolto verso la finestra. Niente flash.</li>
        <li>Con il selfie tieni il telefono a 20–25 cm e usa lo zoom: più vicino molte fotocamere non mettono a fuoco.</li>
        <li>Ancora meglio: fatti fare la foto con la fotocamera dietro, a 10–15 cm. Se è sfocata, allontana un po’ il telefono.</li>
      </ul>
    {:else}
      <p class="lead">
        Se il colore dei capelli non ti convince, fotografa una ciocca alla luce del giorno. Meglio con un foglio bianco accanto: lo tocchi dopo e
        correggo la luce.
      </p>
    {/if}
    <div class="sources">
      <button class="btn" onclick={() => pick('selfie')}><Icon name="camera" size={20} /> Selfie</button>
      <button class="btn" onclick={() => pick('camera')}><Icon name="camera" size={20} /> Fatti fare la foto</button>
      <button class="btn" onclick={() => pick('gallery')}><Icon name="image" size={20} /> Dalla galleria</button>
      {#if retaking}
        <button class="btn btn-ghost" onclick={() => (retaking = false)}>Annulla</button>
      {/if}
    </div>
  {:else}
    <div class="photo" class:editing={!!tapMode} style:aspect-ratio="{view.w} / {view.h}">
      <svg
        bind:this={svg}
        viewBox="{view.x} {view.y} {view.w} {view.h}"
        role="img"
        aria-label={eyes ? 'Foto dell’occhio con l’iride trovata' : 'Foto dei capelli con la zona misurata'}
        onpointerup={tap}
      >
        <image href={photoUrl} x="0" y="0" {width} {height} />
        {#if eyes && fit}
          <circle cx={fit.iris.center[0]} cy={fit.iris.center[1]} r={fit.iris.radius} class="zone" {stroke} />
          <circle cx={fit.pupil.center[0]} cy={fit.pupil.center[1]} r={fit.pupil.radius} class="zone thin" {stroke} />
        {/if}
        {#if !eyes && area}
          <circle cx={area.center[0]} cy={area.center[1]} r={area.radius} class="zone" {stroke} />
        {/if}
        {#if reference}
          <circle cx={reference.point[0]} cy={reference.point[1]} r={reference.radius} class="manual" />
        {/if}
      </svg>
    </div>
    {#if canZoom || (eyes && fit && !zoomed)}
      <button class="btn btn-ghost btn-block zoom" onclick={() => (zoomed = !zoomed)}>{zoomed ? 'Vedi tutta la foto' : 'Ingrandisci l’occhio'}</button>
    {/if}

    {#if mode}
      <p class="hint" role="status"><Icon name="pin" size={18} /> {HINT[mode]}</p>
      <button class="btn btn-ghost btn-block" onclick={() => (mode = null)}>Annulla</button>
    {/if}

    {#if warnings.length}
      <ul class="warns">
        {#each warnings as w (w)}<li class="warning">{w}</li>{/each}
      </ul>
    {/if}

    <div class="list">
      <div class="feat">
        <span class="sw" class:empty={!lab} style:background={lab ? labToHex(lab) : undefined} aria-hidden="true"></span>
        <span class="grow">
          {eyes ? 'Colore degli occhi' : 'Colore dei capelli'}
          <span class="sub">{lab ? 'Da questa foto: sostituisce quello della foto del viso' : 'Non misurato: vale quello della foto del viso'}</span>
        </span>
        <button class="btn mini" aria-pressed={mode === 'seed'} onclick={() => (mode = mode === 'seed' ? null : 'seed')}>
          {eyes ? 'Sposta' : 'Tocca'}
        </button>
      </div>
      <div class="feat">
        <span class="sw ref" aria-hidden="true"></span>
        <span class="grow">
          Bianco di riferimento
          <span class="sub">
            {#if reference}Luce corretta con il bianco che hai toccato{:else if eyes}Facoltativo: di solito basta il bianco dell’occhio{:else}Facoltativo: senza, la luce di questa foto non si corregge{/if}
          </span>
        </span>
        {#if reference}
          <button class="icon-btn" aria-label="Togli il bianco di riferimento" onclick={() => onreference(null)}><Icon name="close" size={20} /></button>
        {/if}
        <button class="btn mini" aria-pressed={mode === 'white'} onclick={() => (mode = mode === 'white' ? null : 'white')}>Tocca</button>
      </div>
    </div>

    <div class="row-actions">
      <button class="btn btn-block" onclick={() => (retaking = true)}><Icon name="camera" size={20} /> Rifai la foto</button>
      <button class="btn btn-ghost btn-block" onclick={onremove}><Icon name="trash" size={20} /> Togli questa foto</button>
    </div>
  {/if}
</section>

<style>
  .closeup {
    margin-top: 28px;
  }
  .tag {
    margin-left: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    vertical-align: middle;
  }
  .lead {
    margin: 0 0 10px;
    line-height: 1.5;
  }
  .tips {
    margin: 0 0 14px;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    line-height: 1.45;
  }
  .sources {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .photo {
    position: relative;
    width: 100%;
    max-height: 70vh;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface-2);
    touch-action: manipulation;
  }
  .photo svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .photo.editing svg {
    cursor: crosshair;
  }
  .zoom {
    margin-top: 6px;
  }
  .zone {
    fill: none;
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 1.5px rgb(0 0 0 / 0.8));
  }
  .zone.thin {
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
  }
  .manual {
    fill: rgb(255 255 255 / 0.15);
    stroke: #fff;
    stroke-width: 3;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 1.5px rgb(0 0 0 / 0.8));
  }
  .hint {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 12px 0 6px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--surface-2);
    font-weight: 600;
  }
  .warns {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .list {
    margin-top: 12px;
  }
  .feat {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 6px 12px;
  }
  .feat + .feat {
    border-top: 1px solid var(--border);
  }
  .feat .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .feat .sub {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .sw {
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.2);
  }
  .sw.empty {
    border: 2px dashed var(--text-muted);
  }
  .sw.ref {
    background: linear-gradient(135deg, #fff 50%, #d9d9d9 50%);
  }
  .mini {
    min-height: 40px;
    padding: 0 14px;
    font-size: 0.875rem;
    flex: none;
  }
  .mini[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
  }
  .row-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }
</style>
