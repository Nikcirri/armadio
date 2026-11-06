<script lang="ts">
  import type { ItemRecord, SeasonId, SlotType } from '../../../lib/db/types';
  import {
    FAMILY_LABEL,
    METAL_LABEL,
    describeMetrics,
    itemFit,
    seasonInfo,
    type ColorMetrics,
    type Swatch,
  } from '../../../lib/logic/armocromia';
  import { palettesForSeason } from '../../../lib/logic/colorPalettes';
  import PaletteDots from '../../../lib/ui/PaletteDots.svelte';
  import PhotoThumb from '../../../lib/ui/PhotoThumb.svelte';
  import DrapeTest from './DrapeTest.svelte';

  let {
    season,
    ranking = [],
    metrics = null,
    colors = null,
    cropUrl = null,
    items,
    onchoose,
    onopenitem,
    onusepalette,
  }: {
    season: SeasonId;
    ranking?: readonly { season: SeasonId; percent: number }[];
    metrics?: ColorMetrics | null;
    colors?: { label: string; hex: string | null }[] | null;
    cropUrl?: string | null;
    items: readonly ItemRecord[];
    onchoose?: (season: SeasonId) => void;
    onopenitem: (id: string) => void;
    onusepalette: (paletteId: string) => void;
  } = $props();

  const NEAR_FACE: readonly SlotType[] = ['top_base', 'top_layer', 'full_body', 'outerwear'];
  const info = $derived(seasonInfo(season));
  const near = $derived(ranking.find((r) => r.season !== season)?.season ?? null);
  const labels = $derived(metrics ? describeMetrics(metrics) : null);
  const palettes = $derived(palettesForSeason(season));
  const wardrobe = $derived.by(() => {
    const good: ItemRecord[] = [];
    const avoid: ItemRecord[] = [];
    for (const i of items) {
      if (!NEAR_FACE.includes(i.slotType) || i.status === 'forSale') continue;
      const fit = itemFit(season, i.colors);
      if (fit === 'good') good.push(i);
      else if (fit === 'avoid') avoid.push(i);
    }
    return { good, avoid };
  });
  const drapeGroups = $derived.by(() => {
    const groups: { label: string; swatches: readonly Swatch[] }[] = [{ label: `${info.name}: i tuoi colori`, swatches: info.best }];
    if (near) groups.push({ label: `${seasonInfo(near).name} (la più vicina)`, swatches: seasonInfo(near).best });
    groups.push({ label: 'Da evitare vicino al viso', swatches: info.avoid });
    return groups;
  });
</script>

<div class="hero">
  <p class="family">{FAMILY_LABEL[info.family]}</p>
  <h2>{info.name}</h2>
  <p class="en">{info.english}</p>
  <p class="desc">{info.description}</p>
  <PaletteDots swatches={info.best.slice(0, 10).map((s) => s.hex)} size={22} />
</div>

{#if ranking.length}
  <h3 class="section-title">Le stagioni più vicine</h3>
  <div class="list" role="radiogroup" aria-label="Le stagioni più vicine">
    {#each ranking.slice(0, 3) as r (r.season)}
      <button class="row" role="radio" aria-checked={season === r.season} onclick={() => onchoose?.(r.season)} disabled={!onchoose}>
        <span class="radio" class:on={season === r.season} aria-hidden="true"></span>
        <span class="grow">
          {seasonInfo(r.season).name}
          <span class="meter" aria-hidden="true"><span style:width="{Math.max(3, r.percent)}%"></span></span>
        </span>
        <span class="pct">{r.percent}%</span>
      </button>
    {/each}
  </div>
  <p class="note">La prima è la più probabile. Se sei indecisa tra due, confrontale con “Prova i colori” e scegli quella che ti illumina di più.</p>
{/if}

{#if labels}
  <h3 class="section-title">Le tue caratteristiche</h3>
  <div class="card traits">
    <p><span>Sottotono</span><strong>{labels.undertone}</strong></p>
    <p><span>Intensità</span><strong>{labels.depth}</strong></p>
    <p><span>Brillantezza</span><strong>{labels.clarity}</strong></p>
    <p><span>Contrasto</span><strong>{labels.contrast}</strong></p>
    {#if colors?.length}
      <div class="measured">
        {#each colors as c (c.label)}
          <span class="m">
            <span class="msw" class:empty={!c.hex} style:background={c.hex ?? undefined} aria-hidden="true"></span>
            <span>{c.label}</span>
          </span>
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#if cropUrl}
  <h3 class="section-title">Prova i colori</h3>
  {#key season}
    <DrapeTest {cropUrl} groups={drapeGroups} />
  {/key}
{/if}

<h3 class="section-title">I tuoi colori migliori</h3>
<div class="grid">
  {#each info.best as s (s.name)}
    <div class="cell"><span class="block" style:background={s.hex}></span><span class="name">{s.name}</span></div>
  {/each}
</div>

<h3 class="section-title">Neutri</h3>
<div class="grid">
  {#each info.neutrals as s (s.name)}
    <div class="cell"><span class="block" style:background={s.hex}></span><span class="name">{s.name}</span></div>
  {/each}
</div>

<h3 class="section-title">Gioielli e accessori metallici</h3>
<p class="card metal">{METAL_LABEL[info.metal]}</p>

<h3 class="section-title">Da evitare vicino al viso</h3>
<div class="grid">
  {#each info.avoid as s (s.name)}
    <div class="cell"><span class="block avoid" style:background={s.hex}></span><span class="name">{s.name}</span></div>
  {/each}
</div>
<p class="note">Lontano dal viso (pantaloni, scarpe, borse) puoi usarli senza problemi.</p>

<h3 class="section-title">Palette per “Cosa metto?”</h3>
<div class="list">
  {#each palettes as pal (pal.id)}
    <div class="pal">
      <PaletteDots swatches={pal.swatches} patterns={pal.colors.flatMap((c, i) => (c === 'pattern' ? [i] : []))} />
      <span class="grow">{pal.name}<span class="sub">{pal.hint}</span></span>
      <button class="btn mini" onclick={() => onusepalette(pal.id)}>Prova</button>
    </div>
  {/each}
</div>

<h3 class="section-title">Nel tuo armadio</h3>
{#if !wardrobe.good.length && !wardrobe.avoid.length}
  <p class="note">Quando aggiungi capi da indossare sopra (magliette, camicie, maglioni, abiti, giacche) qui vedi quali ti valorizzano.</p>
{/if}
{#if wardrobe.good.length}
  <p class="strip-title">Ti valorizzano ({wardrobe.good.length})</p>
  <div class="strip">
    {#each wardrobe.good as i (i.id)}
      <button class="thumb" onclick={() => onopenitem(i.id)}>
        <span class="pic"><PhotoThumb photoId={i.photoIds[0]} alt="" /></span>
        <span class="tname">{i.name}</span>
      </button>
    {/each}
  </div>
{/if}
{#if wardrobe.avoid.length}
  <p class="strip-title">Da evitare vicino al viso ({wardrobe.avoid.length})</p>
  <div class="strip">
    {#each wardrobe.avoid as i (i.id)}
      <button class="thumb" onclick={() => onopenitem(i.id)}>
        <span class="pic"><PhotoThumb photoId={i.photoIds[0]} alt="" /></span>
        <span class="tname">{i.name}</span>
      </button>
    {/each}
  </div>
  <p class="note">Per questi capi: abbinali a una sciarpa o un colletto nei tuoi colori, oppure portali lontano dal viso.</p>
{/if}

<style>
  .hero {
    padding: 18px;
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .family {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .hero h2 {
    margin: 2px 0 0;
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 1.75rem;
  }
  .en {
    margin: 0 0 8px;
    color: var(--text-muted);
  }
  .desc {
    margin: 0 0 12px;
    line-height: 1.45;
  }
  .radio {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--text-muted);
  }
  .radio.on {
    border: 7px solid var(--accent);
  }
  .row .grow {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .meter {
    display: block;
    height: 6px;
    border-radius: 3px;
    background: var(--border);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .pct {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .traits p {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    padding: 6px 0;
  }
  .traits p + p {
    border-top: 1px solid var(--border);
  }
  .traits span {
    color: var(--text-muted);
  }
  .measured {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .m {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
  }
  .msw {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.2);
  }
  .msw.empty {
    border: 2px dashed var(--text-muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 10px;
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .block {
    display: block;
    aspect-ratio: 1;
    border-radius: 12px;
    border: 1px solid rgb(0 0 0 / 0.15);
  }
  .block.avoid {
    position: relative;
    background-clip: padding-box;
  }
  .block.avoid::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top right, transparent calc(50% - 1.5px), rgb(255 255 255 / 0.85) 50%, transparent calc(50% + 1.5px));
    border-radius: 12px;
  }
  .name {
    font-size: 0.75rem;
    line-height: 1.2;
    color: var(--text-muted);
  }
  .metal {
    margin: 0;
  }
  .pal {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 8px 12px;
  }
  .pal + .pal {
    border-top: 1px solid var(--border);
  }
  .pal .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .pal .sub {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .mini {
    min-height: 40px;
    padding: 0 14px;
    font-size: 0.875rem;
    flex: none;
  }
  .strip-title {
    margin: 10px 0 6px;
    font-weight: 600;
  }
  .strip {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 6px;
  }
  .thumb {
    flex: none;
    width: 84px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pic {
    width: 84px;
    height: 112px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface-2);
  }
  .tname {
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
