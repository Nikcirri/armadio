<script lang="ts">
  import { db } from '../../lib/db';
  import { deleteWish, saveWish } from '../../lib/db/altro';
  import { addPurchasedItem, deleteItemsHard } from '../../lib/db/items';
  import type { CategoryRecord, ItemRecord, WishlistRecord } from '../../lib/db/types';
  import { FIT_LABEL, parseColorProfile, seasonInfo } from '../../lib/logic/armocromia';
  import { guessCategory } from '../../lib/logic/categoryGuess';
  import { colorInfo, swatchCss } from '../../lib/logic/colors';
  import type { Img } from '../../lib/logic/imageOps';
  import { formatEuro, parseEuro } from '../../lib/logic/labels';
  import {
    costPerWearAt,
    groupMatches,
    SHOP_WEARS,
    shopFit,
    shopMatches,
    shopSimilar,
    shopSummary,
    type ShopPiece,
    type Tone,
  } from '../../lib/logic/shopMode';
  import { todayKey } from '../../lib/logic/util';
  import { chooseFromGallery, takePhoto } from '../../lib/media/acquire';
  import { colorsOf, decodeBlob } from '../../lib/media/pipeline';
  import { storePhoto } from '../../lib/media/photos';
  import { imageLabels, visionSupported } from '../../lib/media/vision';
  import { tapFeedback } from '../../lib/platform';
  import { reportError } from '../../lib/errors';
  import { live } from '../../lib/state/live.svelte';
  import { nav } from '../../lib/state/nav.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { shop } from '../../lib/state/shopSession.svelte';
  import { showToast, showUndoToast, withBusy } from '../../lib/state/ui.svelte';
  import { canvasView } from '../../lib/ui/canvasView';
  import CategorySelect from '../../lib/ui/CategorySelect.svelte';
  import ColorChips from '../../lib/ui/ColorChips.svelte';
  import Icon, { type IconName } from '../../lib/ui/Icon.svelte';
  import Lazy from '../../lib/ui/Lazy.svelte';
  import Lightbox from '../../lib/ui/Lightbox.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import { photoEditor } from '../../lib/ui/photoEditor';

  /** Modalità negozio (SPEC.md, sezione 8.5). */
  let { onclose, onarmocromia }: { onclose: () => void; onarmocromia: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.orderBy('order').toArray(), [] as CategoryRecord[]);
  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);

  let editing = $state(false);
  let lightbox = $state<{ photoIds: string[]; name: string } | null>(null);
  let busy = $state(false);
  let showColors = $state(false);

  const profile = $derived(parseColorProfile(settings.value.colorProfile ?? null));
  const season = $derived(profile?.season ?? null);
  const category = $derived(categories.value.find((c) => c.id === shop.categoryId) ?? null);
  const piece = $derived<ShopPiece | null>(category ? { categoryId: category.id, slot: category.slotType, colors: shop.colors } : null);
  const matches = $derived(piece ? shopMatches(piece, items.value) : []);
  const groups = $derived(groupMatches(matches));
  const similar = $derived(piece ? shopSimilar(piece, items.value, wishlist.value) : { items: [], wishes: [], sameCategory: 0 });
  const fit = $derived(piece ? shopFit(season, piece) : null);
  const summary = $derived(piece && fit ? shopSummary({ piece, matches, similar, fit, season }) : []);
  const priceValue = $derived(parseEuro(shop.price));
  const priceInvalid = $derived(shop.price.trim() !== '' && priceValue === null);
  const perWear = $derived(costPerWearAt(priceValue));
  const guessName = $derived(shop.guess ? (categories.value.find((c) => c.id === shop.guess!.categoryId)?.name ?? null) : null);

  const TONE_ICON: Record<Tone, IconName> = { good: 'check', warn: 'alert', info: 'info' };
  const TONE_LABEL: Record<Tone, string> = { good: 'Bene', warn: 'Attenzione', info: 'Da completare' };

  /** Colori e categoria proposti dalla foto (solo proposte: le scelte fatte a mano restano). */
  function analyze(img: Img) {
    const run = shop.setPhoto(img);
    colorsOf(img)
      .then((c) => {
        if (run !== shop.run) return;
        shop.detected = c;
        if (!shop.colorsTouched) shop.colors = [...c];
      })
      .catch(() => undefined);
    if (visionSupported()) {
      // Se il modello non risponde, semplicemente non c'è la proposta.
      Promise.all([imageLabels(img), db.categories.orderBy('order').toArray()])
        .then(([labels, cats]) => {
          if (run !== shop.run) return;
          const g = guessCategory(labels, cats);
          shop.guess = g;
          if (g && !shop.categoryTouched) shop.categoryId = g.categoryId;
        })
        .catch(() => undefined);
    }
  }

  async function acquire(source: 'camera' | 'gallery') {
    try {
      const blob = source === 'camera' ? await takePhoto() : (await chooseFromGallery(false))[0];
      if (!blob) return;
      const img = await withBusy('Apro la foto…', () => decodeBlob(blob));
      shop.reset();
      showColors = false;
      analyze(img);
    } catch (e) {
      reportError(e, 'Non riesco ad aprire la foto.');
    }
  }

  function onEdited(img: Img) {
    editing = false;
    analyze(img);
  }

  function chooseCategory(id: string) {
    shop.categoryTouched = true;
    shop.categoryId = id;
  }

  /** Scarta il capo senza salvarlo, con "Annulla" per riaverlo. */
  function discard(message: string, after: () => void) {
    const snap = shop.snapshot();
    shop.reset();
    after();
    if (snap.img) {
      showToast(message, {
        actionLabel: 'Annulla',
        onAction: () => {
          shop.restore(snap);
          nav.altroPage = 'shop';
        },
      });
    }
  }

  function close() {
    discard('Capo scartato', onclose);
  }

  function checkPrice(): boolean {
    if (!priceInvalid) return true;
    showToast('Il prezzo non è un numero valido');
    return false;
  }

  async function addToWishlist() {
    const img = shop.img;
    if (!img || busy || !checkPrice()) return;
    busy = true;
    try {
      const wish = await withBusy('Salvo nella wishlist…', async () => {
        const photoId = await storePhoto(img);
        return saveWish(db, {
          name: shop.name.trim() || category?.name || 'Desiderio',
          categoryId: category?.id ?? null,
          photoIds: [photoId],
          price: priceValue,
          storeOrLink: shop.store,
          colors: [...shop.colors],
          season: null,
          occasions: [],
          priority: 'medium',
          notes: '',
        });
      });
      shop.reset();
      void tapFeedback();
      showUndoToast(`“${wish.name}” aggiunto alla wishlist`, async () => {
        await deleteWish(db, wish.id);
      });
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare nella wishlist.');
    } finally {
      busy = false;
    }
  }

  async function bought() {
    const img = shop.img;
    if (!img || busy || !checkPrice()) return;
    if (!category) {
      showToast('Scegli prima la categoria');
      return;
    }
    const cat = category;
    busy = true;
    try {
      const item = await withBusy('Salvo il capo…', async () => {
        const photoId = await storePhoto(img);
        return addPurchasedItem(db, {
          name: shop.name,
          categoryId: cat.id,
          colors: [...shop.colors],
          photoIds: [photoId],
          price: priceValue,
          purchaseDate: todayKey(),
          store: shop.store,
        });
      });
      shop.reset();
      void tapFeedback('medium');
      showUndoToast(`“${item.name}” ora è nel tuo armadio`, () => deleteItemsHard(db, [item.id]));
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare il capo.');
    } finally {
      busy = false;
    }
  }
</script>

<Page title="Modalità negozio" onclose={close}>
  {#snippet actions()}
    {#if shop.img}
      <button class="btn btn-ghost head-btn" onclick={() => discard('Foto scartata', () => undefined)}>
        <Icon name="camera" size={20} /> Nuova foto
      </button>
    {/if}
  {/snippet}

  {#if !shop.img}
    <div class="intro card">
      <span class="intro-ic" aria-hidden="true"><Icon name="bag" size={32} /></span>
      <p><strong>Sei in negozio?</strong></p>
      <p class="note">Fotografa il capo che ti piace: vedi subito con quanti dei tuoi capi si abbina, se hai già qualcosa di simile e se il colore ti dona.</p>
    </div>
    <div class="start">
      <button class="btn btn-primary btn-block" onclick={() => acquire('camera')}><Icon name="camera" size={20} /> Scatta una foto</button>
      <button class="btn btn-block" onclick={() => acquire('gallery')}><Icon name="image" size={20} /> Scegli dalla galleria</button>
    </div>
    <p class="note">Consiglio: inquadra solo il capo, su uno sfondo semplice (appeso o steso). Dopo puoi anche ritagliarlo.</p>
    <p class="note">La foto resta solo in questa pagina: si salva se scegli “Wishlist” o “L’ho comprato”.</p>
    {#if !profile}
      <div class="tip">
        <p class="note first">Non hai ancora fatto l’armocromia: facendola, qui vedi anche se il colore del capo ti valorizza.</p>
        <button class="btn" onclick={onarmocromia}><Icon name="palette" size={20} /> Fai l’armocromia</button>
      </div>
    {/if}
  {:else}
    <div class="top">
      <div class="photo-col">
        <button class="preview" aria-label="Ritaglia o scontorna la foto" onclick={() => (editing = true)} use:canvasView={shop.img}></button>
        <span class="hint">Tocca per ritagliare</span>
      </div>
      <ul class="summary" aria-label="Riepilogo">
        {#if !piece}
          <li class="line info">
            <span class="badge"><Icon name="info" size={16} /></span>
            <span>Scegli la categoria qui sotto: poi vedi abbinamenti, simili e stagione.</span>
          </li>
        {:else}
          {#each summary as l (l.id)}
            <li class="line {l.tone}">
              <span class="badge"><Icon name={TONE_ICON[l.tone]} size={16} /></span>
              <span><span class="visually-hidden">{TONE_LABEL[l.tone]}: </span>{l.text}</span>
            </li>
          {/each}
        {/if}
      </ul>
    </div>

    <div class="stack details">
      <CategorySelect categories={categories.value} value={shop.categoryId} placeholder="Scegli la categoria" onchange={chooseCategory} />
      {#if shop.guess && guessName && shop.guess.categoryId !== shop.categoryId}
        {@const g = shop.guess}
        <div class="guess" role="status">
          <Icon name="sparkles" size={20} />
          <span class="grow">Sembra {g.phrase}</span>
          <button class="btn mini" onclick={() => chooseCategory(g.categoryId)}>Usa {guessName}</button>
        </div>
      {:else if shop.guess && shop.guess.categoryId === shop.categoryId && !shop.categoryTouched}
        <p class="note first">Categoria proposta dalla foto: controlla che sia giusta.</p>
      {/if}
      <div class="field">
        <span>Colori</span>
        <div class="color-row">
          {#each shop.colors as c, i (c)}
            <span class="mini-chip">
              <span class="dot-s" style:background={swatchCss(c)} aria-hidden="true"></span>{colorInfo(c).label}{#if i === 0 && shop.colors.length > 1}<span class="muted">&nbsp;· principale</span>{/if}
            </span>
          {:else}
            <span class="muted">{shop.detected.length ? 'Nessun colore scelto' : 'Li leggo dalla foto…'}</span>
          {/each}
          <button class="btn mini" aria-expanded={showColors} onclick={() => (showColors = !showColors)}>{showColors ? 'Fatto' : 'Cambia'}</button>
        </div>
        {#if showColors}
          <ColorChips
            value={shop.colors}
            detected={shop.detected}
            onchange={(c) => {
              shop.colorsTouched = true;
              shop.colors = c;
            }}
          />
        {/if}
      </div>
      <label class="field">
        <span>Prezzo (€)</span>
        <input class="input" inputmode="decimal" placeholder="Es. 39,90" bind:value={shop.price} aria-invalid={priceInvalid} />
      </label>
      {#if priceInvalid}
        <p class="warning small">Il prezzo non è un numero valido.</p>
      {:else if perWear !== null}
        <p class="note first">Se lo metti {SHOP_WEARS} volte, costa <strong>{formatEuro(perWear)}</strong> a utilizzo.</p>
      {/if}
    </div>

    {#if piece}
      <h2 class="section-title">Si abbina con {matches.length === 1 ? '1 capo' : `${matches.length} capi`}</h2>
      {#if !groups.length}
        <p class="note">
          Nessun capo del tuo armadio si abbina per tipo e colore. {shop.colors.length ? 'Controlla che i colori siano giusti.' : ''}
        </p>
      {:else}
        {#each groups as g (g.id)}
          <p class="strip-title">{g.label} ({g.items.length})</p>
          <div class="strip">
            {#each g.items as i (i.id)}
              <button class="thumb" onclick={() => (lightbox = { photoIds: i.photoIds, name: i.name })} disabled={!i.photoIds.length}>
                <span class="pic"><PhotoThumb photoId={i.photoIds[0]} alt="" /></span>
                <span class="tname">{i.name}</span>
              </button>
            {/each}
          </div>
        {/each}
        <p class="note">Contano i capi che possono stare nello stesso outfit e i cui colori stanno bene insieme. Tocca un capo per vederlo grande.</p>
      {/if}

      <h2 class="section-title">Ne hai già di simili?</h2>
      {#if !shop.colors.length}
        <p class="note">Scegli il colore per cercare i capi simili.</p>
      {:else}
        {#if similar.items.length}
          <p class="warning">
            {similar.items.length === 1 ? 'Hai già un capo' : `Hai già ${similar.items.length} capi`} della stessa categoria e dello stesso colore principale.
          </p>
          <div class="strip">
            {#each similar.items as i (i.id)}
              <button class="thumb" onclick={() => (lightbox = { photoIds: i.photoIds, name: i.name })} disabled={!i.photoIds.length}>
                <span class="pic"><PhotoThumb photoId={i.photoIds[0]} alt="" /></span>
                <span class="tname">{i.name}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="note">Nel tuo armadio non c’è niente della stessa categoria e dello stesso colore principale.</p>
        {/if}
        {#if similar.wishes.length}
          <p class="note">Nella wishlist: {similar.wishes.map((w) => w.name).join(', ')}.</p>
        {/if}
      {/if}
      {#if category}
        <p class="note">
          In “{category.name}” hai {similar.sameCategory === 0 ? 'ancora nessun capo' : similar.sameCategory === 1 ? 'già 1 capo' : `già ${similar.sameCategory} capi`}.
        </p>
      {/if}

      <h2 class="section-title">La tua stagione</h2>
      {#if !fit || fit.kind === 'noProfile'}
        <p class="note">Fai l’armocromia (in Altro) per sapere se il colore ti dona.</p>
      {:else if fit.kind === 'unjudgeable'}
        <p class="note">{shop.colors.length ? 'Una fantasia non si può giudicare: conta il colore che vedi di più vicino al viso.' : 'Scegli il colore per sapere se ti dona.'}</p>
      {:else}
        <div class="fit card">
          <span class="dot" style:background={swatchCss(fit.color)} aria-hidden="true"></span>
          <span class="grow">
            <strong>{colorInfo(fit.color).label}: {FIT_LABEL[fit.fit].toLowerCase()}</strong>
            <span class="sub">Per la tua stagione, {season ? seasonInfo(season).name : ''}</span>
          </span>
        </div>
        {#if fit.fit === 'avoid' && !fit.nearFace}
          <p class="note">Questo capo si porta lontano dal viso, quindi il colore conta meno.</p>
        {:else if fit.fit === 'avoid'}
          <p class="note">Se ti piace lo stesso, portalo con una sciarpa o un colletto nei tuoi colori vicino al viso.</p>
        {/if}
      {/if}
    {/if}

    <h2 class="section-title">Altri dettagli</h2>
    <div class="stack">
      <label class="field">
        <span>Nome (facoltativo)</span>
        <input class="input" placeholder={category ? `Es. ${category.name} rossa` : 'Es. Giacca di jeans'} maxlength="60" bind:value={shop.name} />
      </label>
      <label class="field">
        <span>Negozio (facoltativo)</span>
        <input class="input" placeholder="Es. Zara via Roma" maxlength="80" bind:value={shop.store} />
      </label>
      <p class="note first">Si salvano con il capo se lo metti in wishlist o lo compri.</p>
    </div>

    <div class="bar">
      <button class="btn" disabled={busy} onclick={addToWishlist}><Icon name="plus" size={20} /> Wishlist</button>
      <button class="btn btn-primary" disabled={busy} onclick={bought}><Icon name="bag" size={20} /> L’ho comprato</button>
    </div>
  {/if}
</Page>

{#if editing && shop.img}
  <Lazy
    loader={photoEditor}
    variant="full"
    title="Ritaglia il capo"
    onclose={() => (editing = false)}
    props={{ img: shop.img, title: 'Ritaglia il capo', saveLabel: 'Usa', onsave: onEdited, oncancel: () => (editing = false) }}
  />
{/if}

{#if lightbox}
  <Lightbox photoIds={lightbox.photoIds} alt={lightbox.name} onclose={() => (lightbox = null)} />
{/if}

<style>
  .intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 4px;
  }
  .intro p {
    margin: 0;
  }
  .intro-ic {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    margin-bottom: 6px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--accent);
  }
  .start {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 16px 0 4px;
  }
  .tip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    margin-top: 20px;
    padding: 14px;
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .first {
    margin-top: 0;
  }
  .head-btn {
    min-height: 40px;
    padding: 0 12px;
    font-size: 0.875rem;
  }
  .top {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .photo-col {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .preview {
    width: 112px;
    height: 150px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background-color: #fff;
    background-image: conic-gradient(#e4e4e4 25%, #fff 0 50%, #e4e4e4 0 75%, #fff 0);
    background-size: 14px 14px;
    cursor: pointer;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .summary {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 0.9375rem;
    line-height: 1.35;
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-top: -1px;
  }
  .line.good .badge {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .line.warn .badge {
    background: var(--warning-bg);
    color: var(--warning-text);
  }
  .line.info .badge {
    background: var(--surface-2);
    color: var(--text-muted);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .details {
    margin-top: 18px;
  }
  .color-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .mini-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 2px 12px 2px 4px;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .muted {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .dot-s {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.15);
    flex: none;
  }
  .color-row .mini {
    margin-left: auto;
  }
  .guess {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: -4px;
    padding: 8px 8px 8px 12px;
    border-radius: var(--radius);
    background: var(--surface-2);
    font-weight: 600;
  }
  .guess .grow {
    flex: 1;
    min-width: 0;
  }
  .mini {
    min-height: 40px;
    padding: 0 14px;
    font-size: 0.875rem;
    flex: none;
  }
  .small {
    margin: -6px 0 0;
  }
  .strip-title {
    margin: 10px 4px 6px;
    font-weight: 600;
  }
  .strip {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 0 0 6px;
    margin-top: 8px;
  }
  .strip-title + .strip {
    margin-top: 0;
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
  .thumb:disabled {
    cursor: default;
    opacity: 1;
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
  .fit {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .fit .grow {
    flex: 1;
    min-width: 0;
  }
  .fit .sub {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .dot {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .bar {
    position: sticky;
    bottom: -32px;
    display: flex;
    gap: 10px;
    margin: 24px -16px -32px;
    padding: 12px 16px 16px;
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  .bar .btn {
    flex: 1;
    min-width: 0;
    padding: 0 10px;
    font-size: 0.9375rem;
    white-space: nowrap;
  }
</style>
