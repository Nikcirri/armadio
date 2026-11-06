<script lang="ts">
  import { Clipboard } from '@capacitor/clipboard';
  import { db } from '../../lib/db';
  import { bulkSetStatus, restoreBulk } from '../../lib/db/items';
  import type { CategoryRecord, ItemRecord } from '../../lib/db/types';
  import { estimatedRevenue, highCostPerWear, resaleOf, unusedFor, unwornForAYear } from '../../lib/logic/declutter';
  import { formatEuro } from '../../lib/logic/labels';
  import { buildListing } from '../../lib/logic/listing';
  import { todayKey } from '../../lib/logic/util';
  import { live } from '../../lib/state/live.svelte';
  import { requestOpenItem } from '../../lib/state/nav.svelte';
  import { showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Page from '../../lib/ui/Page.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';

  /** Decluttering (SPEC 8.5): capi da vendere, suggerimenti e annunci per Vinted o Wallapop. */
  let { onclose }: { onclose: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);

  const today = todayKey();
  const forSale = $derived(items.value.filter((i) => i.status === 'forSale').sort((a, b) => a.name.localeCompare(b.name, 'it')));
  const revenue = $derived(estimatedRevenue(items.value));
  const unworn = $derived(unwornForAYear(items.value, today));
  const expensive = $derived(highCostPerWear(items.value).filter((x) => !unworn.some((u) => u.id === x.item.id)));

  async function copy(item: ItemRecord) {
    const cat = categories.value.find((c) => c.id === item.categoryId)?.name ?? '';
    const { text } = buildListing(item, cat);
    try {
      await Clipboard.write({ string: text });
      showToast('Annuncio copiato: incollalo su Vinted o Wallapop');
    } catch (e) {
      reportError(e, 'Non riesco a copiare il testo.');
    }
  }

  async function sell(item: ItemRecord) {
    try {
      const snap = await bulkSetStatus(db, [item.id], 'forSale');
      showUndoToast(`“${item.name}” → Da vendere`, () => restoreBulk(db, snap));
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Page title="Decluttering" {onclose}>
  <div class="card hero">
    <p class="label">Ricavo stimato</p>
    <p class="big">{formatEuro(revenue.total)}</p>
    <p class="note">
      {forSale.length === 1 ? '1 capo da vendere' : `${forSale.length} capi da vendere`}{revenue.estimated
        ? ` · ${revenue.estimated} con prezzo stimato al 30% di quanto l’hai pagato`
        : ''}{revenue.missing ? ` · ${revenue.missing} senza prezzo` : ''}
    </p>
  </div>

  <h2 class="section-title">Da vendere</h2>
  {#if forSale.length}
    <div class="list">
      {#each forSale as it (it.id)}
        {@const r = resaleOf(it)}
        <div class="row">
          <button class="pic" aria-label="Apri {it.name}" onclick={() => requestOpenItem(it.id)}><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></button>
          <button class="grow plain" onclick={() => requestOpenItem(it.id)}>
            {it.name}
            <span class="sub">{r.value === null ? 'Prezzo da decidere' : `${formatEuro(r.value)}${r.estimated ? ' (stima)' : ''}`}{it.statusNote ? ` · ${it.statusNote}` : ''}</span>
          </button>
          <button class="btn small" onclick={() => copy(it)}>📋 Annuncio</button>
        </div>
      {/each}
    </div>
    <p class="note">L’annuncio ha titolo e descrizione con brand, taglia, colore, tessuto, condizioni e misure. Il prezzo di vendita si mette nella scheda del capo.</p>
  {:else}
    <p class="note">Nessun capo da vendere. Mettine uno su “Da vendere” dalla sua scheda o dai suggerimenti qui sotto.</p>
  {/if}

  <h2 class="section-title">Non indossati da 12 mesi</h2>
  {#if unworn.length}
    <div class="list">
      {#each unworn as it (it.id)}
        <div class="row">
          <button class="pic" aria-label="Apri {it.name}" onclick={() => requestOpenItem(it.id)}><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></button>
          <span class="grow">{it.name}<span class="sub">Non lo usi {unusedFor(it, today)}</span></span>
          <button class="btn small" onclick={() => sell(it)}>Vendi</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="note">Nessuno: usi tutti i tuoi capi almeno una volta l’anno.</p>
  {/if}

  <h2 class="section-title">Costo per utilizzo alto</h2>
  {#if expensive.length}
    <div class="list">
      {#each expensive as x (x.item.id)}
        <div class="row">
          <button class="pic" aria-label="Apri {x.item.name}" onclick={() => requestOpenItem(x.item.id)}><PhotoThumb photoId={x.item.photoIds[0]} alt={x.item.name} /></button>
          <span class="grow">
            {x.item.name}
            <span class="sub">{formatEuro(x.cpw)} a utilizzo · {x.item.wearCount === 1 ? '1 volta' : `${x.item.wearCount} volte`}</span>
          </span>
          <button class="btn small" onclick={() => sell(x.item)}>Vendi</button>
        </div>
      {/each}
    </div>
    <p class="note">Capi che ti sono costati almeno 15 € a utilizzo, molto più degli altri. Indossali di più, oppure vendili.</p>
  {:else}
    <p class="note">Nessuno: i tuoi capi costano il giusto per quanto li usi.</p>
  {/if}
</Page>

<style>
  .hero {
    text-align: center;
  }
  .label {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .big {
    margin: 4px 0;
    font-family: var(--font-serif);
    font-size: 2.25rem;
  }
  .row {
    cursor: default;
    gap: 10px;
    padding-right: 10px;
  }
  .pic {
    flex: none;
    width: 44px;
    height: 56px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
  }
  .plain {
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .small {
    min-height: 40px;
    padding: 0 12px;
    font-size: 0.8125rem;
  }
</style>
