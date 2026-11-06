<script lang="ts">
  import { labToHex, type Lab } from '../../../lib/logic/colors';
  import {
    FEATURE_LABEL,
    manualRadius,
    type FaceRegions,
    type FeatureId,
    type ManualSample,
    type Point,
    type Region,
  } from '../../../lib/logic/faceColors';
  import { tapFeedback } from '../../../lib/platform';
  import Icon from '../../../lib/ui/Icon.svelte';

  /** La foto con le zone misurate; si tocca per correggere un colore o indicare il bianco. */
  let {
    photoUrl,
    width,
    height,
    regions,
    features,
    overrides,
    reference,
    warnings,
    faceFound,
    onsample,
    onreference,
    onreset,
  }: {
    photoUrl: string;
    width: number;
    height: number;
    regions: FaceRegions | null;
    features: Record<FeatureId, Lab | null>;
    overrides: Partial<Record<FeatureId, ManualSample>>;
    reference: ManualSample | null;
    warnings: readonly string[];
    faceFound: boolean;
    onsample: (feature: FeatureId, sample: ManualSample) => void;
    onreference: (sample: ManualSample | null) => void;
    onreset: (feature: FeatureId) => void;
  } = $props();

  const ORDER: FeatureId[] = ['skin', 'hair', 'eyes', 'lips', 'brows'];
  const HINT: Record<FeatureId | 'white', string> = {
    skin: 'Tocca la pelle della guancia, dove non c’è ombra né riflesso.',
    hair: 'Tocca i capelli, vicino alla fronte.',
    eyes: 'Tocca il centro colorato di un occhio (l’iride).',
    lips: 'Tocca il labbro inferiore.',
    brows: 'Tocca un sopracciglio.',
    white: 'Tocca qualcosa di bianco o grigio chiaro (un foglio, una maglietta): serve a correggere la luce.',
  };
  // Senza viso trovato si parte subito chiedendo la pelle.
  // svelte-ignore state_referenced_locally
  let editing = $state<FeatureId | 'white' | null>(faceFound ? null : 'skin');
  let svg = $state<SVGSVGElement>();

  function pointsAttr(points: readonly Point[]): string {
    return points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  }

  function regionList(f: FeatureId): Region[] {
    if (overrides[f] || !regions) return [];
    return regions[f];
  }

  function tap(e: PointerEvent) {
    if (!editing || !svg) return;
    const box = svg.getBoundingClientRect();
    const point: Point = [((e.clientX - box.left) / box.width) * width, ((e.clientY - box.top) / box.height) * height];
    const sample: ManualSample = { point, radius: manualRadius(editing, width, height) };
    if (editing === 'white') onreference(sample);
    else onsample(editing, sample);
    void tapFeedback();
    // Senza viso trovato si passa da sola alla zona successiva ancora vuota.
    const next = !faceFound && editing !== 'white' ? ORDER.find((f) => f !== editing && !features[f] && !overrides[f]) : undefined;
    editing = next ?? null;
  }

  const stroke = 'rgb(255 255 255 / 0.9)';
</script>

<div class="studio">
  <div class="photo" class:editing={!!editing}>
    <img src={photoUrl} alt="La tua foto" />
    <svg
      bind:this={svg}
      viewBox="0 0 {width} {height}"
      preserveAspectRatio="none"
      role="img"
      aria-label="Zone misurate sulla foto"
      onpointerup={tap}
    >
      {#each ORDER as f (f)}
        {#each regionList(f) as r, i (i)}
          {#if r.kind === 'circle'}
            <circle cx={r.center[0]} cy={r.center[1]} r={r.radius} class="zone" class:active={editing === f} stroke={stroke} />
          {:else}
            <polygon points={pointsAttr(r.points)} class="zone" class:active={editing === f} stroke={stroke} />
          {/if}
        {/each}
        {#if overrides[f]}
          {@const m = overrides[f]}
          <circle cx={m.point[0]} cy={m.point[1]} r={m.radius} class="manual" />
        {/if}
      {/each}
      {#if reference}
        <circle cx={reference.point[0]} cy={reference.point[1]} r={reference.radius} class="manual white" />
      {/if}
    </svg>
  </div>

  {#if editing}
    <p class="hint" role="status"><Icon name="pin" size={18} /> {HINT[editing]}</p>
    <button class="btn btn-ghost btn-block" onclick={() => (editing = null)}>Fatto</button>
  {/if}

  {#if warnings.length}
    <ul class="warns">
      {#each warnings as w (w)}<li class="warning">{w}</li>{/each}
    </ul>
  {/if}

  <h2 class="section-title">Colori misurati</h2>
  <div class="list">
    {#each ORDER as f (f)}
      {@const lab = features[f]}
      <div class="feat">
        <span class="sw" class:empty={!lab} style:background={lab ? labToHex(lab) : undefined} aria-hidden="true"></span>
        <span class="grow">
          {FEATURE_LABEL[f]}
          <span class="sub">{lab ? (overrides[f] ? 'Scelto da te' : 'Trovato da solo') : f === 'skin' ? 'Serve per l’analisi: toccala' : 'Non trovato'}</span>
        </span>
        {#if overrides[f] && faceFound}
          <button class="icon-btn" aria-label="Torna al colore trovato da solo per {FEATURE_LABEL[f].toLowerCase()}" onclick={() => onreset(f)}>
            <Icon name="refresh" size={20} />
          </button>
        {/if}
        <button class="btn mini" aria-pressed={editing === f} onclick={() => (editing = editing === f ? null : f)}>
          {lab ? 'Correggi' : 'Tocca'}
        </button>
      </div>
    {/each}
    <div class="feat">
      <span class="sw ref" aria-hidden="true"></span>
      <span class="grow">
        Bianco di riferimento
        <span class="sub">{reference ? 'Luce corretta con il bianco che hai toccato' : 'Facoltativo: corregge la luce'}</span>
      </span>
      {#if reference}
        <button class="icon-btn" aria-label="Togli il bianco di riferimento" onclick={() => onreference(null)}><Icon name="close" size={20} /></button>
      {/if}
      <button class="btn mini" aria-pressed={editing === 'white'} onclick={() => (editing = editing === 'white' ? null : 'white')}>Tocca</button>
    </div>
  </div>
</div>

<style>
  .photo {
    position: relative;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface-2);
    touch-action: manipulation;
  }
  .photo img {
    display: block;
    width: 100%;
    height: auto;
  }
  .photo svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .photo.editing svg {
    cursor: crosshair;
  }
  .zone {
    fill: none;
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 1.5px rgb(0 0 0 / 0.8));
  }
  .zone.active {
    stroke-width: 4;
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
</style>
