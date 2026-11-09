<script lang="ts">
  import { untrack } from 'svelte';
  import { db } from '../lib/db';
  import { saveOutfit } from '../lib/db/outfits';
  import type { CategoryRecord, ItemRecord, ListRecord, WearLogRecord } from '../lib/db/types';
  import {
    GEN_SLOTS,
    HARMONIES,
    TEMPERATURES,
    cycle,
    generateLook,
    lookItemIds,
    outfitTagsFor,
    OCCASION_MODES,
    coveredOccasions,
    occasionsSummary,
    scoreLook,
    slotAlternatives,
    slotNeeds,
    withPick,
    workingFixes,
    type GenSlot,
    type GeneratorContext,
    type GeneratorOptions,
  } from '../lib/logic/generator';
  import { normalize } from '../lib/logic/items';
  import { parseColorProfile, seasonInfo } from '../lib/logic/armocromia';
  import { SEASON_PALETTE_ID, orderedPalettes, paletteById, paletteFit } from '../lib/logic/colorPalettes';
  import { autoLayout, pieceFromItem, semaphore } from '../lib/logic/outfits';
  import { joinNames, suggestUnderwear } from '../lib/logic/underwear';
  import { addDays, todayKey } from '../lib/logic/util';
  import { tapFeedback } from '../lib/platform';
  import { generatorView as view } from '../lib/state/generatorView.svelte';
  import { live } from '../lib/state/live.svelte';
  import { openAltroPage, requestOpenOutfit, selectTab } from '../lib/state/nav.svelte';
  import { settings } from '../lib/state/settings.svelte';
  import { confirmDialog, showToast } from '../lib/state/ui.svelte';
  import { reportError } from '../lib/errors';
  import ChipGroup from '../lib/ui/ChipGroup.svelte';
  import PaletteDots from '../lib/ui/PaletteDots.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import PhotoThumb from '../lib/ui/PhotoThumb.svelte';
  import Sheet from '../lib/ui/Sheet.svelte';
  import Switch from '../lib/ui/Switch.svelte';
  import TabIcon from '../lib/ui/TabIcon.svelte';
  import { wearWithUndo } from './outfit/actions';
  import OutfitCollage from './outfit/OutfitCollage.svelte';
  import SemaphoreBox from './outfit/SemaphoreBox.svelte';

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const recent = live(() => db.wearLog.where('date').aboveOrEqual(addDays(todayKey(), -13)).toArray(), [] as WearLogRecord[]);

  let showOptions = $state(false);
  let naming = $state(false);
  let outfitName = $state('');
  let saving = $state(false);

  const o = $derived(view.options);
  const occasions = $derived(
    lists.value
      .filter((l) => l.kind === 'occasion')
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ id: l.id, label: l.name })),
  );
  // Un'occasione eliminata dalle liste esce anche da quelle scelte (SPEC 8.3).
  $effect(() => {
    if (!occasions.length) return;
    const known = new Set(occasions.map((x) => x.id));
    const chosen = untrack(() => view.options.occasionIds);
    if (chosen.some((id) => !known.has(id))) untrack(() => setOption('occasionIds', chosen.filter((id) => known.has(id))));
  });
  const occasionLabel = (id: string) => occasions.find((x) => x.id === id)?.label ?? '';
  const byId = $derived(new Map(items.value.map((i) => [i.id, i])));
  // Armocromia (SPEC 8.6) e palette (SPEC 8.3).
  const colorProfile = $derived(parseColorProfile(settings.value.colorProfile ?? null));
  const palettes = $derived(orderedPalettes(colorProfile?.season ?? null));
  const chosenPalette = $derived(paletteById(o.paletteId));
  const seasonPaletteOn = $derived(o.paletteId === SEASON_PALETTE_ID && !!colorProfile);
  const seasonBoxId = $derived(lists.value.find((l) => l.kind === 'location' && l.extra.key === 'seasonBox')?.id ?? null);

  function buildContext(): GeneratorContext {
    const catName = new Map(categories.value.map((c) => [c.id, normalize(c.name)]));
    const banned = lists.value
      .filter((l) => l.kind === 'fabric' && ['silk', 'linen', 'suede'].includes(l.extra.key ?? ''))
      .map((l) => normalize(l.name));
    return {
      items: items.value,
      seasonBoxId,
      occasionMatrix: settings.value.occasionMatrix ?? [],
      eveningOccasionIds: lists.value.filter((l) => l.kind === 'occasion' && l.extra.key === 'evening').map((l) => l.id),
      occasionLabel: (id) => lists.value.find((l) => l.id === id)?.name ?? '',
      rainBannedFabrics: [...new Set([...banned, 'seta', 'lino', 'camoscio'])],
      coordinatingIds: new Set(
        items.value
          .filter((i) => i.slotType === 'accessory' && (i.bagSize !== null || /borse|borsa|zain|cintur/.test(catName.get(i.categoryId) ?? '')))
          .map((i) => i.id),
      ),
      today: todayKey(),
      antiRepeatDays: settings.value.antiRepeatDays ?? 3,
      recentLooks: recent.value.map((e) => e.itemIds),
      colorSeason: colorProfile?.season ?? null,
      seasonPreference: colorProfile?.useInGenerator ?? false,
    };
  }

  const ready = $derived(items.ready && lists.ready && categories.ready && recent.ready && settings.loaded);

  /** "Gira tutto": nuovo look rispettando i lucchetti (e diverso da quello attuale). */
  function spin(avoidCurrent = true) {
    try {
      const options = $state.snapshot(view.options);
      const ctx = buildContext();
      const locks = $state.snapshot(view.locks);
      const r = generateLook(options, ctx, locks, Math.random, avoidCurrent ? $state.snapshot(view.look) : null);
      view.look = r.candidate?.look ?? null;
      view.reasons = r.candidate?.reasons ?? [];
      view.relaxed = r.relaxed;
      view.problems = r.problems;
      view.fixes = r.candidate ? [] : workingFixes(options, ctx, locks).map((f) => ({ label: f.label, patch: f.patch }));
      view.savedOutfitId = null;
    } catch (e) {
      reportError(e);
    }
  }

  // Primo giro appena i dati sono pronti; di nuovo se un capo del look non esiste più.
  $effect(() => {
    if (!ready) return;
    const look = view.look;
    const missing = look ? lookItemIds(look).some((id) => !byId.has(id)) : false;
    if ((!look && !view.problems.length) || missing) untrack(() => spin(false));
  });

  function setOption<K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]) {
    view.options = { ...view.options, [key]: value };
    spin(false);
  }

  function applyFix(patch: Partial<GeneratorOptions>) {
    view.options = { ...view.options, ...patch };
    spin(false);
  }

  /** Dopo un cambio a mano ricalcola le chip "Perché funziona". */
  function rescore() {
    if (!view.look) return;
    view.reasons = scoreLook($state.snapshot(view.look), byId, $state.snapshot(view.options), buildContext()).reasons;
  }

  function step(slot: GenSlot, dir: 1 | -1) {
    if (!view.look) return;
    const look = $state.snapshot(view.look);
    const options = slotAlternatives(look, slot, $state.snapshot(view.options), buildContext());
    const next = cycle(options, look.picks[slot] ?? null, dir);
    view.look = withPick(look, slot, next);
    view.savedOutfitId = null;
    void tapFeedback();
    rescore();
  }

  /** Rigenera solo questo rullo: un'altra buona scelta per lo slot. */
  function reroll(slot: GenSlot) {
    if (!view.look) return;
    const look = $state.snapshot(view.look);
    const current = look.picks[slot] ?? null;
    const options = slotAlternatives(look, slot, $state.snapshot(view.options), buildContext()).filter((id) => id !== current);
    if (!options.length) return showToast('Non ci sono altre scelte per questo slot');
    const top = options.slice(0, 5);
    view.look = withPick(look, slot, top[Math.floor(Math.random() * top.length)] ?? null);
    view.savedOutfitId = null;
    void tapFeedback();
    rescore();
  }

  function toggleLock(slot: GenSlot) {
    const locks = { ...view.locks };
    if (locks[slot] !== undefined) delete locks[slot];
    else locks[slot] = view.look?.picks[slot] ?? null;
    view.locks = locks;
    void tapFeedback();
  }

  const look = $derived(view.look);
  const needs = $derived(look ? slotNeeds(look.mode, o, { eveningOccasionIds: lists.value.filter((l) => l.extra.key === 'evening').map((l) => l.id) }) : null);
  const rows = $derived(look && needs ? GEN_SLOTS.filter((s) => needs[s.slot] !== 'never') : []);
  const pieces = $derived(look ? lookItemIds(look).map((id) => byId.get(id)).filter((i): i is ItemRecord => !!i).map(pieceFromItem) : []);
  const layout = $derived(autoLayout(pieces));

  // "Intimo" (SPEC 8.3): l'intimo collegato ai capi proposti. Quelli non disponibili partono tolti.
  const lookKey = $derived(pieces.map((p) => p.id).join(','));
  let underChoice = $state<{ key: string; off: string[] }>({ key: '', off: [] });
  const underSuggest = $derived(
    suggestUnderwear(
      pieces.map((p) => byId.get(p.id)).filter((i): i is ItemRecord => !!i),
      byId,
      seasonBoxId,
    ),
  );
  const underOff = $derived(underChoice.key === lookKey ? underChoice.off : underSuggest.filter((u) => u.reason).map((u) => u.item.id));
  const underPieces = $derived(underSuggest.filter((u) => !underOff.includes(u.item.id)).map((u) => pieceFromItem(u.item)));
  const allPieces = $derived([...pieces, ...underPieces]);
  const light = $derived(semaphore(allPieces, byId, seasonBoxId));

  function toggleUnder(id: string) {
    const off = underOff.includes(id) ? underOff.filter((x) => x !== id) : [...underOff, id];
    underChoice = { key: lookKey, off };
    view.savedOutfitId = null;
    void tapFeedback();
  }
  const summary = $derived(
    [
      occasionsSummary(o, occasionLabel),
      o.harmony !== 'free' ? (HARMONIES.find((h) => h.id === o.harmony)?.label ?? '') : '',
      chosenPalette ? `Palette ${chosenPalette.name}` : seasonPaletteOn ? 'La mia stagione' : '',
      o.forgotten ? 'Dimenticati' : '',
      !o.onlyAvailable ? 'Anche non disponibili' : '',
      !o.coordinate ? 'Senza coordinare' : '',
    ].filter(Boolean),
  );

  /** Occasioni dell'outfit salvato: quelle scelte adatte a tutti i capi, oppure tutte quelle scelte. */
  function savedOccasions(): string[] {
    if (!look) return [];
    const covered = coveredOccasions(lookItemIds(look).map((id) => byId.get(id)).filter((i): i is ItemRecord => !!i), o);
    return covered.length ? covered : [...o.occasionIds];
  }

  function openSave() {
    outfitName = '';
    naming = true;
  }

  async function saveLook() {
    if (!look || saving) return;
    saving = true;
    try {
      const tags = outfitTagsFor(o);
      const saved = await saveOutfit(db, {
        name: outfitName,
        itemIds: allPieces.map((p) => p.id),
        wishlistIds: [],
        season: tags.season,
        occasions: savedOccasions(),
        weatherTags: tags.weatherTags,
        favorite: false,
        notes: '',
        layout: $state.snapshot(layout),
      });
      view.savedOutfitId = saved.id;
      naming = false;
      void tapFeedback();
      showToast(`“${saved.name}” salvato tra gli outfit`, { actionLabel: 'Apri', onAction: () => requestOpenOutfit(saved.id) });
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare l’outfit.');
    } finally {
      saving = false;
    }
  }

  async function wearNow() {
    if (!pieces.length) return;
    if (!light.ok) {
      const ok = await confirmDialog({
        title: 'Alcuni capi non sono disponibili',
        message: `${light.blockers.map((b) => `${b.name}: ${b.reason}`).join('\n')}\n\nVuoi segnarlo come indossato lo stesso?`,
        confirmLabel: 'Sì, indossato',
      });
      if (!ok) return;
    }
    await wearWithUndo(
      allPieces.map((p) => p.id),
      todayKey(),
      view.savedOutfitId,
    );
  }
</script>

<div class="cosa">
  {#if items.ready && items.value.length === 0}
    <section class="empty">
      <div class="badge-big"><TabIcon tab="cosa-metto" size={36} /></div>
      <h1>Prima servono dei capi</h1>
      <p>Aggiungi qualche capo all’Armadio: poi qui ti propongo un abbinamento per il meteo e l’occasione.</p>
      <button class="btn btn-primary" onclick={() => selectTab('armadio')}>Vai all’Armadio</button>
    </section>
  {:else}
    <div class="segmented temp" role="group" aria-label="Temperatura">
      {#each TEMPERATURES as t (t.id)}
        <button aria-pressed={o.temperature === t.id} onclick={() => setOption('temperature', t.id)}>
          <span aria-hidden="true">{t.emoji}</span> {t.label}
        </button>
      {/each}
    </div>
    <div class="quick">
      <button class="tool" class:active={o.rain} aria-pressed={o.rain} onclick={() => setOption('rain', !o.rain)}>🌧️ Pioggia</button>
      <button class="tool" class:active={o.layers} aria-pressed={o.layers} onclick={() => setOption('layers', !o.layers)}>🧅 A cipolla</button>
      <button class="tool" class:active={summary.length > 0} onclick={() => (showOptions = true)}>
        Altre opzioni{summary.length ? ` (${summary.length})` : ''}
      </button>
    </div>
    {#if summary.length}<p class="note summary">{summary.join(' · ')}</p>{/if}

    {#if look}
      <div class="result">
        <div class="collage"><OutfitCollage {pieces} {layout} kind="main" label="Abbinamento proposto" /></div>

        <button class="btn btn-primary btn-block spin" onclick={() => spin(true)}>
          <Icon name="shuffle" size={20} /> Gira tutto
        </button>

        <ul class="reels" aria-label="Rulli">
          {#each rows as r (r.slot)}
            {@const id = look.picks[r.slot]}
            {@const it = id ? byId.get(id) : undefined}
            {@const locked = view.locks[r.slot] !== undefined}
            <li class="reel" class:locked>
              <button class="icon-btn arrow" aria-label="{r.label}: precedente" disabled={locked} onclick={() => step(r.slot, -1)}>
                <Icon name="back" />
              </button>
              <span class="item">
                {#if it}
                  <span class="thumb"><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></span>
                {:else}
                  <span class="thumb blank" aria-hidden="true"></span>
                {/if}
                <span class="text">
                  <span class="label">{r.label}{needs?.[r.slot] === 'optional' ? '' : ' *'}</span>
                  <span class="name" class:none={!it}>{it ? it.name : 'Nessuno'}</span>
                </span>
              </span>
              <button class="icon-btn arrow" aria-label="{r.label}: successivo" disabled={locked} onclick={() => step(r.slot, 1)}>
                <Icon name="chevron" />
              </button>
              <button class="icon-btn small" aria-label="Rigenera {r.label}" disabled={locked} onclick={() => reroll(r.slot)}>
                <Icon name="refresh" size={20} />
              </button>
              <button
                class="icon-btn small lockbtn"
                aria-label={locked ? `Sblocca ${r.label}` : `Blocca ${r.label}`}
                aria-pressed={locked}
                onclick={() => toggleLock(r.slot)}
              >
                <Icon name={locked ? 'lock' : 'unlock'} size={20} />
              </button>
            </li>
          {/each}
        </ul>
        <p class="note">* sempre presente. Con il lucchetto un capo resta fermo quando giri.</p>

        {#if view.reasons.length}
          <h2 class="section-title">Perché funziona</h2>
          <ul class="chips">
            {#each view.reasons as reason (reason)}<li>{reason}</li>{/each}
          </ul>
        {/if}
        {#if underSuggest.length}
          <h2 class="section-title">Intimo</h2>
          <ul class="under-list" aria-label="Intimo da mettere sotto">
            {#each underSuggest as sug (sug.item.id)}
              {@const on = !underOff.includes(sug.item.id)}
              <li>
                <button class="under-item" class:off={!on} aria-pressed={on} onclick={() => toggleUnder(sug.item.id)}>
                  <span class="umini"><PhotoThumb photoId={sug.item.photoIds[0]} alt="" /></span>
                  <span class="utext">
                    <strong>{sug.item.name}</strong>
                    <span class="usub" class:bad={!!sug.reason}>sotto {joinNames(sug.forNames)}{sug.reason ? ` · ${sug.reason}` : ''}</span>
                  </span>
                  <span class="ucheck" class:on aria-hidden="true">{#if on}<Icon name="check" size={18} />{/if}</span>
                </button>
              </li>
            {/each}
          </ul>
          <p class="note">Tocca per toglierlo o rimetterlo: “Indossa subito” e “Salva outfit” lo includono.</p>
        {/if}
        {#if chosenPalette && paletteFit(pieces.flatMap((p) => byId.get(p.id)?.colors ?? []), chosenPalette).outside > 0}
          <p class="warning">Nessun abbinamento tutto nei colori di “{chosenPalette.name}”: questo è il più vicino.</p>
        {/if}
        {#if view.relaxed}
          <p class="warning">Per trovare un abbinamento ho usato anche capi che hai indossato negli ultimi giorni.</p>
        {/if}
        {#if !light.ok}<SemaphoreBox state={light} />{/if}

        <div class="actions">
          {#if view.savedOutfitId}
            {@const savedId = view.savedOutfitId}
            <button class="btn" onclick={() => requestOpenOutfit(savedId)}><Icon name="check" size={20} /> Apri l’outfit</button>
          {:else}
            <button class="btn" onclick={openSave}><Icon name="save" size={20} /> Salva outfit</button>
          {/if}
          <button class="btn btn-primary" onclick={wearNow}>Indossa subito</button>
        </div>
      </div>
    {:else if view.problems.length}
      <section class="card problems">
        <h2>Nessun abbinamento possibile</h2>
        <ul>
          {#each view.problems as p (p)}<li>{p}</li>{/each}
        </ul>
        {#if view.fixes.length || Object.keys(view.locks).length}
          <p class="note try">Prova così:</p>
          <div class="fixes">
            {#each view.fixes as f (f.label)}
              <button class="btn" onclick={() => applyFix(f.patch)}>{f.label}</button>
            {/each}
            {#if Object.keys(view.locks).length}<button class="btn" onclick={() => ((view.locks = {}), spin(false))}>Togli i lucchetti</button>{/if}
          </div>
        {:else}
          <p class="note">Aggiungi qualche capo nell’Armadio o cambia le opzioni qui sopra.</p>
        {/if}
      </section>
    {:else}
      <p class="note">Preparo un abbinamento…</p>
    {/if}
  {/if}
</div>

{#if showOptions}
  <Sheet title="Opzioni" onclose={() => (showOptions = false)}>
    <h3 class="section-title first">Occasione</h3>
    <ChipGroup
      label="Occasione"
      options={occasions}
      value={o.occasionIds}
      onchange={(v) => setOption('occasionIds', occasions.filter((x) => v.includes(x.id)).map((x) => x.id))}
    />
    {#if o.occasionIds.length > 1}
      <div class="segmented modes" role="group" aria-label="Con più occasioni">
        {#each OCCASION_MODES as m (m.id)}
          <button aria-pressed={o.occasionMode === m.id} onclick={() => setOption('occasionMode', m.id)}>{m.label}</button>
        {/each}
      </div>
      <p class="note">{OCCASION_MODES.find((m) => m.id === o.occasionMode)?.hint}</p>
    {:else}
      <p class="note">
        Facoltative, anche più di una. Senza occasione evito gli abbinamenti che non stanno insieme (es. sport con elegante).
      </p>
    {/if}

    <h3 class="section-title">Armonia dei colori</h3>
    <div class="list">
      {#each HARMONIES as h (h.id)}
        <button class="row" aria-pressed={o.harmony === h.id} onclick={() => setOption('harmony', h.id)}>
          <span class="radio" class:on={o.harmony === h.id} aria-hidden="true"></span>
          <span class="grow">{h.label}<span class="sub">{h.hint}</span></span>
        </button>
      {/each}
    </div>

    <h3 class="section-title">Palette</h3>
    <p class="note">Una preferenza, non un divieto: gli abbinamenti con i colori della palette vengono prima.</p>
    <div class="palettes" role="radiogroup" aria-label="Palette">
      <button class="pal" role="radio" aria-checked={!chosenPalette && !seasonPaletteOn} onclick={() => setOption('paletteId', null)}>
        <span class="pname">Nessuna</span>
        <span class="psub">Scelgo io; se riconosco una palette te lo dico</span>
      </button>
      {#if colorProfile}
        <button class="pal" role="radio" aria-checked={seasonPaletteOn} onclick={() => setOption('paletteId', SEASON_PALETTE_ID)}>
          <PaletteDots swatches={seasonInfo(colorProfile.season).best.slice(0, 6).map((x) => x.hex)} size={14} />
          <span class="pname">La mia stagione</span>
          <span class="psub">{seasonInfo(colorProfile.season).name}</span>
        </button>
      {:else}
        <button
          class="pal discover"
          onclick={() => {
            showOptions = false;
            openAltroPage('armocromia');
          }}
        >
          <span class="pname">🎨 Scopri la tua armocromia</span>
          <span class="psub">Un selfie e ti dico i colori che ti stanno meglio</span>
        </button>
      {/if}
      {#each palettes as { palette, suits } (palette.id)}
        <button class="pal" role="radio" aria-checked={o.paletteId === palette.id} onclick={() => setOption('paletteId', palette.id)}>
          <PaletteDots swatches={palette.swatches} patterns={palette.colors.flatMap((c, i) => (c === 'pattern' ? [i] : []))} size={14} />
          <span class="pname">{palette.name}</span>
          <span class="psub">{suits ? 'Adatta a te · ' : ''}{palette.hint}</span>
        </button>
      {/each}
    </div>

    <h3 class="section-title">Altro</h3>
    <div class="list">
      <Switch
        label="Coordina scarpe e borsa/cintura"
        description="Preferisce borse e cinture dello stesso colore delle scarpe."
        checked={o.coordinate}
        onchange={(v) => setOption('coordinate', v)}
      />
      <Switch
        label="Dai una possibilità ai dimenticati"
        description="Più spazio ai capi che non metti da almeno un mese."
        checked={o.forgotten}
        onchange={(v) => setOption('forgotten', v)}
      />
      <Switch
        label="Solo capi disponibili"
        description="Niente capi da lavare, in prestito o nella scatola del cambio stagione."
        checked={o.onlyAvailable}
        onchange={(v) => setOption('onlyAvailable', v)}
      />
    </div>
    {#snippet footer()}
      <button class="btn btn-primary btn-block" onclick={() => (showOptions = false)}>Fatto</button>
    {/snippet}
  </Sheet>
{/if}

{#if naming}
  <Sheet title="Salva outfit" onclose={() => (naming = false)}>
    <label class="field">
      <span>Nome</span>
      <input class="input" bind:value={outfitName} maxlength="60" placeholder="Facoltativo, es. Venerdì in ufficio" />
    </label>
    <p class="note">Lo trovi poi nella sezione Outfit, con stagione, meteo e occasione di oggi.</p>
    {#snippet footer()}
      <button class="btn btn-ghost" onclick={() => (naming = false)}>Annulla</button>
      <button class="btn btn-primary" disabled={saving} onclick={saveLook}>Salva</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .cosa {
    padding: 12px 16px 120px;
  }
  .modes {
    margin-top: 12px;
  }
  .temp button {
    min-height: 44px;
    font-size: 0.9375rem;
  }
  .quick {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .tool {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .tool.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .summary {
    margin-top: 6px;
  }
  .result {
    margin-top: 14px;
  }
  .collage {
    width: min(64%, 300px);
    margin: 0 auto;
  }
  .spin {
    margin-top: 14px;
  }
  .reels {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    overflow: hidden;
  }
  .reel {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 2px 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .reel:last-child {
    border-bottom: 0;
  }
  .reel.locked {
    background: var(--surface-2);
  }
  .arrow {
    flex: none;
    width: 36px;
    height: 56px;
  }
  .item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .thumb {
    flex: none;
    width: 42px;
    height: 54px;
    border-radius: 8px;
    overflow: hidden;
  }
  .thumb.blank {
    border: 1.5px dashed var(--border);
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .name {
    font-weight: 600;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .name.none {
    font-weight: 400;
    color: var(--text-muted);
  }
  .small {
    flex: none;
    width: 40px;
    height: 44px;
  }
  .lockbtn[aria-pressed='true'] {
    color: var(--accent);
  }
  .under-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .under-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .under-item.off {
    background: transparent;
    border-style: dashed;
  }
  .under-item.off strong {
    text-decoration: line-through;
  }
  .umini {
    width: 36px;
    height: 48px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .utext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .usub {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .usub.bad {
    color: var(--danger);
  }
  .ucheck {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--text-muted);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .ucheck.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips li {
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .warning {
    margin-top: 12px;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 16px;
  }
  .actions .btn {
    padding: 0 12px;
  }
  .problems {
    margin-top: 16px;
  }
  .problems h2 {
    margin: 0 0 8px;
    font-size: 1.25rem;
  }
  .problems ul {
    margin: 0 0 12px;
    padding-left: 20px;
    line-height: 1.5;
  }
  .try {
    margin: 0 0 8px;
  }
  .fixes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .empty {
    text-align: center;
    padding: 40px 16px;
  }
  .badge-big {
    width: 72px;
    height: 72px;
    margin: 0 auto 8px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--accent);
  }
  .empty h1 {
    font-size: 1.5rem;
    margin: 8px 0;
  }
  .empty p {
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0 0 20px;
  }
  .first {
    margin-top: 0;
  }
  .palettes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .pal {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-height: 72px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pal[aria-checked='true'] {
    border: 2px solid var(--accent);
    padding: 9px 11px;
    background: var(--surface-2);
  }
  .pal.discover {
    border-style: dashed;
  }
  .pname {
    font-weight: 600;
  }
  .psub {
    font-size: 0.75rem;
    line-height: 1.3;
    color: var(--text-muted);
  }
  .radio {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--border);
  }
  .radio.on {
    border: 7px solid var(--accent);
  }
</style>
