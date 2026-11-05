<script lang="ts">
  import { Clipboard } from '@capacitor/clipboard';
  import { db } from '../../lib/db';
  import {
    addWear,
    duplicateItem,
    getWearDates,
    pickEditable,
    removeItemPhoto,
    removeLastWear,
    saveItem,
    setItemCover,
    type EditableItemFields,
  } from '../../lib/db/items';
  import { deleteItemCascade, getItemUsage, restoreItemDeletion } from '../../lib/db/repo';
  import type { BagSize, CategoryRecord, ItemRecord, ItemStatus, ListRecord, OutfitRecord, TripRecord, WashTag } from '../../lib/db/types';
  import { describeUsage } from '../../lib/logic/integrity';
  import { costPerWear } from '../../lib/logic/items';
  import { MAX_ITEM_PHOTOS } from '../../lib/logic/itemPhotos';
  import {
    BAG_SIZES,
    CUTS,
    SALE_CONDITIONS,
    SEASONS,
    STATUSES,
    WALKABILITY,
    WARMTHS,
    WASH_TAGS,
    euroInput,
    formatEuro,
    parseEuro,
  } from '../../lib/logic/labels';
  import { buildListing } from '../../lib/logic/listing';
  import { INTIMATE_SUGGESTIONS } from '../../lib/logic/presets';
  import { formatDateIt, todayKey } from '../../lib/logic/util';
  import { tapFeedback } from '../../lib/platform';
  import { live } from '../../lib/state/live.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { confirmDialog, showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import CategorySelect from '../../lib/ui/CategorySelect.svelte';
  import ChipGroup from '../../lib/ui/ChipGroup.svelte';
  import ColorChips from '../../lib/ui/ColorChips.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';
  import PieceThumb from './PieceThumb.svelte';

  let {
    itemId,
    onclose,
    onopenphoto,
    oneditphoto,
    onaddphoto,
    onopenitem,
  }: {
    itemId: string;
    onclose: () => void;
    onopenphoto: (photoIds: string[], index: number, name: string) => void;
    oneditphoto: (itemId: string, photoId: string) => void;
    onaddphoto: (itemId: string, source: 'camera' | 'gallery') => void;
    onopenitem: (itemId: string) => void;
  } = $props();

  const item = live(() => db.items.get(itemId), undefined as ItemRecord | undefined);
  const categories = live(() => db.categories.orderBy('order').toArray(), [] as CategoryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);
  const trips = live(() => db.trips.filter((t) => t.status !== 'done').toArray(), [] as TripRecord[]);
  const outfits = live(() => db.outfits.filter((o) => o.itemIds.includes(itemId)).toArray(), [] as OutfitRecord[]);
  const wearDates = live(() => getWearDates(db, itemId), [] as string[]);

  // Bozza della scheda: si salva solo con "Salva".
  let draft = $state<EditableItemFields | null>(null);
  let original = '';
  let priceText = $state('');
  let resaleText = $state('');
  let tripId = $state('');
  let fabricText = $state('');
  let menuFor = $state<string | null>(null);
  let saving = $state(false);

  $effect(() => {
    const it = item.value;
    if (!it || draft) return;
    draft = pickEditable(it);
    original = JSON.stringify(draft);
    priceText = euroInput(it.price);
    resaleText = euroInput(it.resalePrice);
  });

  const it = $derived(item.value);
  const d = $derived(draft);
  const slot = $derived(categories.value.find((c) => c.id === d?.categoryId)?.slotType ?? it?.slotType);
  const kind = (k: ListRecord['kind']) =>
    lists.value.filter((l) => l.kind === k).sort((a, b) => a.order - b.order);
  const dirty = $derived(
    !!draft &&
      (JSON.stringify($state.snapshot(draft)) !== original ||
        priceText !== euroInput(it?.price ?? null) ||
        resaleText !== euroInput(it?.resalePrice ?? null) ||
        tripId !== ''),
  );
  const cpw = $derived(it ? costPerWear({ price: parseEuro(priceText), wearCount: it.wearCount }) : null);
  const preset = $derived(settings.value.preset ?? 'neutro');
  const LABELS = ['Fronte', 'Retro', 'Etichetta', 'Indossato'];
  const FIT_SUGGESTIONS = ['Perfetto', 'Veste stretto', 'Veste largo', 'Segna un po’', 'Da accorciare'];

  async function requestClose() {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Uscire senza salvare?',
        message: 'Le modifiche alla scheda andranno perse.',
        confirmLabel: 'Esci',
        danger: true,
      });
      if (!ok) return;
    }
    onclose();
  }

  async function save() {
    if (!draft || saving) return;
    const price = parseEuro(priceText);
    const resale = parseEuro(resaleText);
    if (priceText.trim() && price === null) return showToast('Il prezzo non è un numero valido');
    if (resaleText.trim() && resale === null) return showToast('Il prezzo di vendita non è un numero valido');
    saving = true;
    try {
      const fields: EditableItemFields = { ...$state.snapshot(draft), price, resalePrice: resale };
      await saveItem(db, itemId, fields, fields.status === 'packed' && tripId ? tripId : null);
      void tapFeedback();
      showToast('Scheda salvata');
      onclose();
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare la scheda.');
    } finally {
      saving = false;
    }
  }

  function setStatus(s: ItemStatus) {
    if (draft) draft.status = s;
  }

  function addFabric() {
    const f = fabricText.trim();
    if (!draft || !f) return;
    if (!draft.fabrics.some((x) => x.toLowerCase() === f.toLowerCase())) draft.fabrics = [...draft.fabrics, f];
    fabricText = '';
  }

  async function copyListing() {
    if (!draft) return;
    const cat = categories.value.find((c) => c.id === draft!.categoryId)?.name ?? '';
    const { text } = buildListing({ ...$state.snapshot(draft), resalePrice: parseEuro(resaleText) }, cat);
    try {
      await Clipboard.write({ string: text });
      showToast('Annuncio copiato: incollalo su Vinted o Wallapop');
    } catch (e) {
      reportError(e, 'Non riesco a copiare il testo.');
    }
  }

  function fromMenu(fn: (photoId: string) => void) {
    const pid = menuFor;
    menuFor = null;
    if (pid) fn(pid);
  }

  async function cover(photoId: string) {
    await setItemCover(db, itemId, photoId).catch(reportError);
    showToast('Copertina cambiata');
  }

  async function removePhoto(photoId: string) {
    const ok = await confirmDialog({ title: 'Eliminare questa foto?', confirmLabel: 'Elimina', danger: true });
    if (ok) await removeItemPhoto(db, itemId, photoId).catch(reportError);
  }

  async function wearPlus() {
    await addWear(db, itemId, todayKey()).catch(reportError);
    void tapFeedback();
  }
  async function wearMinus() {
    const ok = await removeLastWear(db, itemId).catch((e) => (reportError(e), true));
    if (!ok) showToast('Non ci sono utilizzi da togliere');
  }

  async function duplicate() {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Duplicare senza salvare?',
        message: 'La copia viene fatta dal capo com’è salvato ora. Le modifiche non salvate andranno perse.',
        confirmLabel: 'Duplica',
      });
      if (!ok) return;
    }
    try {
      const copy = await duplicateItem(db, itemId);
      showToast('Capo duplicato');
      onopenitem(copy.id);
    } catch (e) {
      reportError(e);
    }
  }

  async function remove() {
    if (!it) return;
    try {
      const usage = await getItemUsage(db, it.id);
      const ok = await confirmDialog({
        title: `Eliminare “${it.name}”?`,
        message: describeUsage(usage),
        confirmLabel: 'Elimina',
        danger: true,
      });
      if (!ok) return;
      const snap = await deleteItemCascade(db, it.id);
      onclose();
      showUndoToast(`“${it.name}” eliminato`, () => restoreItemDeletion(db, snap));
    } catch (e) {
      reportError(e);
    }
  }
</script>

{#if it && d}
  <Sheet title={d.name || 'Scheda capo'} onclose={requestClose}>
    <div class="form">
      <!-- Foto -->
      <section>
        <div class="photos">
          {#each it.photoIds as pid, i (pid)}
            <div class="slot">
              <button class="pic" aria-label="Apri foto {i + 1}" onclick={() => onopenphoto(it.photoIds, i, it.name)}>
                <PhotoThumb photoId={pid} alt="{it.name}, foto {i + 1}" />
              </button>
              <span class="tag">{i === 0 ? 'Copertina' : (LABELS[i] ?? `Foto ${i + 1}`)}</span>
              <button class="more" aria-label="Azioni foto {i + 1}" onclick={() => (menuFor = pid)}>
                <Icon name="more" size={18} />
              </button>
            </div>
          {/each}
          {#if it.photoIds.length < MAX_ITEM_PHOTOS}
            <div class="slot add">
              <button class="addbtn" onclick={() => onaddphoto(it.id, 'camera')}>Scatta</button>
              <button class="addbtn" onclick={() => onaddphoto(it.id, 'gallery')}>Galleria</button>
            </div>
          {/if}
        </div>
        <button class="fav" aria-pressed={d.favorite} onclick={() => (d.favorite = !d.favorite)}>
          {d.favorite ? '❤️ Tra i preferiti' : '🤍 Aggiungi ai preferiti'}
        </button>
      </section>

      <!-- Stato -->
      <section>
        <h3 class="section-title">Stato</h3>
        <div class="status">
          {#each STATUSES as s (s.id)}
            <button class="st" class:on={d.status === s.id} aria-pressed={d.status === s.id} onclick={() => setStatus(s.id)}>
              <span aria-hidden="true">{s.emoji}</span>{s.label}
            </button>
          {/each}
        </div>
        {#if d.status === 'clean' && it.status !== 'clean'}
          <p class="note">Salvando come Pulito si azzerano gli utilizzi dall’ultimo lavaggio.</p>
        {:else if d.status === 'toWash'}
          <div class="list ctx">
            <Switch label="🧪 Ha una macchia da pre-trattare" checked={d.hasStain} onchange={(v) => (d.hasStain = v)} />
          </div>
        {:else if d.status === 'onLoan'}
          <div class="ctx grid2">
            <label class="field"><span>Prestato a</span><input class="input" bind:value={d.loanTo} placeholder="Nome" /></label>
            <label class="field"><span>Dal</span><input class="input" type="date" value={d.loanDate ?? ''} onchange={(e) => (d.loanDate = e.currentTarget.value || null)} /></label>
          </div>
        {:else if d.status === 'maintenance'}
          <div class="ctx">
            <ChipGroup
              label="Cosa va sistemato"
              options={kind('maintenance').map((l) => ({ id: l.name, label: l.name }))}
              value={d.maintenanceTags}
              onchange={(v) => (d.maintenanceTags = v)}
            />
            <label class="field"><span>Nota</span><input class="input" bind:value={d.statusNote} placeholder="Es. manca un bottone del polsino" /></label>
          </div>
        {:else if d.status === 'forSale'}
          <div class="ctx">
            <div class="grid2">
              <label class="field"><span>Prezzo di vendita (€)</span><input class="input" inputmode="decimal" bind:value={resaleText} placeholder="Es. 15" /></label>
              <label class="field">
                <span>Condizioni</span>
                <select class="input" bind:value={d.statusNote}>
                  <option value="">—</option>
                  {#each SALE_CONDITIONS as c (c)}<option value={c}>{c}</option>{/each}
                </select>
              </label>
            </div>
            <button class="btn btn-block" onclick={copyListing}>📋 Copia annuncio per Vinted</button>
          </div>
        {:else if d.status === 'packed'}
          <div class="ctx">
            <label class="field">
              <span>In quale viaggio? (facoltativo)</span>
              <select class="input" bind:value={tripId}>
                <option value="">Nessuno in particolare</option>
                {#each trips.value as t (t.id)}<option value={t.id}>{t.name} ({formatDateIt(t.startDate)})</option>{/each}
              </select>
            </label>
          </div>
        {/if}
      </section>

      <!-- Dove -->
      <section class="grid2">
        <label class="field">
          <span>Di chi è</span>
          <select class="input" value={d.ownerId ?? ''} onchange={(e) => (d.ownerId = e.currentTarget.value || null)}>
            <option value="">—</option>
            {#each kind('owner') as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Dove si trova</span>
          <select class="input" value={d.locationId ?? ''} onchange={(e) => (d.locationId = e.currentTarget.value || null)}>
            <option value="">—</option>
            {#each kind('location') as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
          </select>
        </label>
      </section>
      <p class="note tight">I capi non “Mio” si usano negli outfit ma non contano nella spesa e nel valore dell’armadio.</p>

      <!-- Descrizione -->
      <section>
        <h3 class="section-title">Descrizione</h3>
        <div class="stack">
          <label class="field"><span>Nome</span><input class="input" bind:value={d.name} maxlength="60" /></label>
          <CategorySelect categories={categories.value} value={d.categoryId} onchange={(id) => (d.categoryId = id)} />
          <div class="field"><span>Colori</span><ColorChips value={d.colors} onchange={(c) => (d.colors = c)} /></div>
          <div class="field">
            <span>Tessuto</span>
            <ChipGroup
              label="Tessuto"
              options={[
                ...kind('fabric').map((l) => ({ id: l.name, label: l.name })),
                ...d.fabrics.filter((f) => !kind('fabric').some((l) => l.name === f)).map((f) => ({ id: f, label: f })),
              ]}
              value={d.fabrics}
              onchange={(v) => (d.fabrics = v)}
            />
            <div class="inline">
              <input class="input" bind:value={fabricText} placeholder="Altro tessuto (es. 80% cotone)" onkeydown={(e) => e.key === 'Enter' && addFabric()} />
              <button class="btn" disabled={!fabricText.trim()} onclick={addFabric}>Aggiungi</button>
            </div>
          </div>
          <div class="field"><span>Stagione</span>
            <ChipGroup single allowNone={false} label="Stagione" options={SEASONS} value={[d.season]} onchange={(v) => v[0] && (d.season = v[0])} />
          </div>
          <div class="field"><span>Pesantezza</span>
            <ChipGroup single allowNone={false} label="Pesantezza" options={WARMTHS} value={[d.warmth]} onchange={(v) => v[0] && (d.warmth = v[0])} />
          </div>
          <div class="field"><span>Taglio</span>
            <ChipGroup single allowNone={false} label="Taglio" options={CUTS} value={[d.cutStyle]} onchange={(v) => v[0] && (d.cutStyle = v[0])} />
          </div>
          <div class="field">
            <span>Nota intimo / cosa mettere sotto</span>
            <input class="input" bind:value={d.intimateNote} placeholder="Es. reggiseno senza spalline" />
            <div class="suggest">
              {#each INTIMATE_SUGGESTIONS[preset] as s (s)}
                <button class="sug" onclick={() => (d.intimateNote = s)}>{s}</button>
              {/each}
            </div>
          </div>
        </div>
      </section>

      {#if slot === 'shoes'}
        <section>
          <h3 class="section-title">Scarpe</h3>
          <div class="list"><Switch label="☔ Impermeabili, vanno bene con la pioggia" checked={d.waterproof} onchange={(v) => (d.waterproof = v)} /></div>
          <div class="field top"><span>Comodità per camminare</span>
            <ChipGroup single label="Comodità" options={WALKABILITY} value={d.walkability ? [d.walkability] : []} onchange={(v) => (d.walkability = v[0] ?? null)} />
          </div>
        </section>
      {:else if slot === 'accessory'}
        <section>
          <h3 class="section-title">Borsa</h3>
          <ChipGroup
            single
            label="Capienza"
            options={BAG_SIZES}
            value={d.bagSize ? [d.bagSize] : []}
            onchange={(v) => (d.bagSize = (v[0] as BagSize | undefined) ?? null)}
          />
          <p class="note">Lascia vuoto se l’accessorio non è una borsa.</p>
        </section>
      {/if}

      <section>
        <h3 class="section-title">Occasioni</h3>
        <ChipGroup label="Occasioni" options={kind('occasion').map((l) => ({ id: l.id, label: l.name }))} value={d.occasions} onchange={(v) => (d.occasions = v)} />
        <p class="note">Senza occasioni il capo va bene per tutte.</p>
      </section>

      <section>
        <h3 class="section-title">Lavaggio</h3>
        <ChipGroup
          label="Etichette di lavaggio"
          options={WASH_TAGS.map((w) => ({ id: w.id, label: w.label, emoji: w.icon }))}
          value={d.washTags}
          onchange={(v) => (d.washTags = v as WashTag[])}
        />
        <div class="list top">
          <Switch
            label="Si lava dopo un certo numero di utilizzi"
            checked={d.maxWearsBeforeWash !== null}
            onchange={(v) => (d.maxWearsBeforeWash = v ? (categories.value.find((c) => c.id === d.categoryId)?.defaultMaxWears ?? 3) : null)}
          />
        </div>
        {#if d.maxWearsBeforeWash !== null}
          <label class="field top">
            <span>Utilizzi prima del lavaggio</span>
            <input class="input" type="number" inputmode="numeric" min="1" max="50" value={d.maxWearsBeforeWash}
              onchange={(e) => (d.maxWearsBeforeWash = Math.max(1, Math.round(Number(e.currentTarget.value) || 1)))} />
          </label>
        {/if}
      </section>

      <section>
        <h3 class="section-title">Acquisto e vestibilità</h3>
        <div class="grid2">
          <label class="field"><span>Brand</span><input class="input" bind:value={d.brand} /></label>
          <label class="field"><span>Taglia</span><input class="input" bind:value={d.size} /></label>
          <label class="field"><span>Prezzo (€)</span><input class="input" inputmode="decimal" bind:value={priceText} placeholder="Es. 39,90" /></label>
          <label class="field"><span>Data di acquisto</span>
            <input class="input" type="date" value={d.purchaseDate ?? ''} onchange={(e) => (d.purchaseDate = e.currentTarget.value || null)} />
          </label>
        </div>
        <label class="field top">
          <span>Vestibilità</span>
          <input class="input" bind:value={d.fitNote} placeholder="Es. veste stretto" />
        </label>
        <div class="suggest">
          {#each FIT_SUGGESTIONS as s (s)}<button class="sug" onclick={() => (d.fitNote = s)}>{s}</button>{/each}
        </div>
      </section>

      <!-- Utilizzi: si aggiornano subito, non serve "Salva" -->
      <section>
        <h3 class="section-title">Utilizzi</h3>
        <div class="card wears">
          <div class="counter">
            <button class="icon-btn round" aria-label="Togli un utilizzo" onclick={wearMinus}>−</button>
            <div class="big"><strong>{it.wearCount}</strong><span>{it.wearCount === 1 ? 'volta' : 'volte'}</span></div>
            <button class="icon-btn round" aria-label="Aggiungi un utilizzo oggi" onclick={wearPlus}>+</button>
          </div>
          <dl>
            <div><dt>Dall’ultimo lavaggio</dt><dd>{it.wearsSinceWash}{d.maxWearsBeforeWash !== null ? ` di ${d.maxWearsBeforeWash}` : ''}</dd></div>
            <div><dt>Ultima volta</dt><dd>{it.lastWornDate ? formatDateIt(it.lastWornDate) : 'mai'}</dd></div>
            <div><dt>Costo per utilizzo</dt><dd>{cpw !== null ? formatEuro(cpw) : '—'}</dd></div>
          </dl>
          <p class="note">Il tasto + aggiunge un utilizzo di oggi; − toglie l’ultimo. Si salvano subito.</p>
          {#if wearDates.value.length}
            <details>
              <summary>Date in cui l’hai indossato ({wearDates.value.length})</summary>
              <ul class="dates">
                {#each wearDates.value.slice(0, 30) as date, i (date + i)}<li>{formatDateIt(date)}</li>{/each}
              </ul>
            </details>
          {/if}
        </div>
      </section>

      <section>
        <h3 class="section-title">Outfit con questo capo</h3>
        {#if outfits.value.length}
          <div class="list">
            {#each outfits.value as o (o.id)}
              <div class="row static">
                <span class="minis">
                  {#each o.itemIds.slice(0, 4) as iid (iid)}
                    <span class="mini"><PieceThumb itemId={iid} /></span>
                  {/each}
                </span>
                <span class="grow">{o.name}<span class="sub">{o.itemIds.length} capi{o.incomplete ? ' · incompleto' : ''}</span></span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="note">Non è ancora in nessun outfit. Il creatore di outfit arriva con la Fase 5.</p>
        {/if}
      </section>

      <section>
        <label class="field"><span>Note</span><textarea class="input" rows="3" bind:value={d.notes}></textarea></label>
      </section>

      <section class="actions">
        <button class="btn" onclick={duplicate}>Duplica capo</button>
        <button class="btn btn-danger" onclick={remove}><Icon name="trash" size={20} /> Elimina capo</button>
      </section>
    </div>

    {#snippet footer()}
      <button class="btn btn-ghost" onclick={requestClose}>{dirty ? 'Annulla' : 'Chiudi'}</button>
      <button class="btn btn-primary" disabled={!dirty || saving} onclick={save}>Salva</button>
    {/snippet}
  </Sheet>

  {#if menuFor}
    {@const pid = menuFor}
    <Sheet title="Foto" onclose={() => (menuFor = null)}>
      <div class="list">
        <button class="row" onclick={() => fromMenu((id) => onopenphoto(it.photoIds, it.photoIds.indexOf(id), it.name))}>
          <span class="grow">Apri a schermo intero</span>
        </button>
        <button class="row" onclick={() => fromMenu((id) => oneditphoto(it.id, id))}>
          <span class="grow">Modifica (ruota, ritaglia, luce, scontorna)</span>
        </button>
        {#if it.photoIds[0] !== pid}
          <button class="row" onclick={() => fromMenu(cover)}><span class="grow">Usa come copertina</span></button>
        {/if}
        <button class="row danger" onclick={() => fromMenu(removePhoto)}><span class="grow">Elimina foto</span></button>
      </div>
    </Sheet>
  {/if}
{/if}

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .top {
    margin-top: 10px;
  }
  .tight {
    margin-top: -6px;
  }
  .photos {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pic {
    aspect-ratio: 3 / 4;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
  }
  .tag {
    font-size: 0.6875rem;
    color: var(--text-muted);
    text-align: center;
  }
  .more {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 0;
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .add {
    aspect-ratio: 3 / 4;
    border: 2px dashed var(--border);
    border-radius: 12px;
    justify-content: center;
    padding: 4px;
  }
  .addbtn {
    min-height: 40px;
    border: 0;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .fav {
    margin-top: 10px;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    padding: 0 16px;
    cursor: pointer;
  }
  .status {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .st {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface);
    text-align: left;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .st.on {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    font-weight: 600;
  }
  .ctx {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .inline {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .inline .input {
    flex: 1;
  }
  .suggest {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .sug {
    min-height: 34px;
    padding: 2px 12px;
    border-radius: 999px;
    border: 1px dashed var(--border);
    background: transparent;
    font-size: 0.8125rem;
    color: var(--text-muted);
    cursor: pointer;
  }
  .wears .counter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
  }
  .round {
    width: 52px;
    height: 52px;
    border: 1px solid var(--border);
    font-size: 1.5rem;
  }
  .big {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .big strong {
    font-family: var(--font-serif);
    font-size: 2.25rem;
    font-weight: 500;
  }
  .big span {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  dl {
    margin: 12px 0 0;
    display: grid;
    gap: 6px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    font-weight: 600;
  }
  details {
    margin-top: 8px;
  }
  summary {
    min-height: 40px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .dates {
    margin: 0;
    padding-left: 18px;
    columns: 2;
    font-size: 0.875rem;
  }
  .static {
    cursor: default;
  }
  .minis {
    display: flex;
    gap: 4px;
  }
  .mini {
    width: 32px;
    height: 42px;
    border-radius: 6px;
    overflow: hidden;
    display: block;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
  .danger {
    color: var(--danger);
  }
</style>
