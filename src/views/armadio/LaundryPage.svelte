<script lang="ts">
  import { db } from '../../lib/db';
  import { bulkSetStatus, clearStain, restoreBulk } from '../../lib/db/items';
  import type { ItemRecord, ItemStatus } from '../../lib/db/types';
  import { statusInfo } from '../../lib/logic/labels';
  import { PROGRAMS, buildLoads, laundryOverview, loadTitle, programOf, type Load, type Program } from '../../lib/logic/laundry';
  import { tapFeedback } from '../../lib/platform';
  import { live } from '../../lib/state/live.svelte';
  import { showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Page from '../../lib/ui/Page.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import LaundryRow from './LaundryRow.svelte';

  let { onclose, onopenitem }: { onclose: () => void; onopenitem: (id: string) => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  let merged = $state<Program[]>([]);

  const o = $derived(laundryOverview(items.value));
  const loads = $derived(buildLoads(o.toWash, new Set(merged)));
  const nothing = $derived(
    !o.toWash.length && !o.drying.length && !o.toIron.length && !o.maintenance.length && !o.dueSoon.length,
  );

  const programLabel = (p: Program) => PROGRAMS.find((x) => x.id === p)?.label ?? '';
  const count = (n: number) => (n === 1 ? '1 capo' : `${n} capi`);

  async function move(list: ItemRecord[], status: ItemStatus) {
    if (!list.length) return;
    try {
      const snap = await bulkSetStatus(
        db,
        list.map((i) => i.id),
        status,
      );
      void tapFeedback();
      showUndoToast(`${count(list.length)} → ${statusInfo(status).label}`, () => restoreBulk(db, snap));
    } catch (e) {
      reportError(e);
    }
  }

  async function pretreated(item: ItemRecord) {
    try {
      await clearStain(db, item.id);
      showToast(`Macchia di “${item.name}” pre-trattata`);
    } catch (e) {
      reportError(e);
    }
  }

  function merge(p: Program) {
    merged = [...merged, p];
  }
  function unmerge(p: Program) {
    merged = merged.filter((x) => x !== p);
  }

  const isDryClean = (l: Load) => l.program === 'dryClean';
</script>

<Page title="Lavanderia" {onclose}>
  <p class="summary">
    {o.toWash.length} da lavare · {o.drying.length} stesi · {o.toIron.length} da stirare · {o.maintenance.length} da sistemare
  </p>

  {#if nothing}
    <div class="empty">
      <p class="big">✨</p>
      <p><strong>Niente in lavanderia.</strong></p>
      <p class="note">Quando metti un capo “Da lavare” lo trovi qui, già diviso nei carichi giusti.</p>
    </div>
  {/if}

  {#if o.stains.length}
    <h2 class="section-title">🧪 Macchie da pre-trattare</h2>
    <div class="list">
      {#each o.stains as item (item.id)}
        <LaundryRow {item} sub="Pre-trattala prima di lavare" onopen={onopenitem}>
          {#snippet actions()}
            <button class="mini-btn" onclick={() => pretreated(item)}>Fatto</button>
          {/snippet}
        </LaundryRow>
      {/each}
    </div>
  {/if}

  {#if loads.length}
    <h2 class="section-title">🧺 Carichi da lavare</h2>
    {#each loads as load (load.key)}
      <section class="load card" class:warn={load.warning}>
        <header>
          <h3>{loadTitle(load)}</h3>
          <span class="n">{count(load.items.length)}</span>
        </header>
        {#if load.warning}
          <p class="alert">
            ⚠️ Ci sono capi bianchi insieme a capi scuri o rossi: rischiano di macchiarsi.
            {#if PROGRAMS.find((p) => p.id === load.program)?.machine}
              <button class="link" onclick={() => unmerge(load.program)}>Dividi per colore</button>
            {/if}
          </p>
        {:else if load.split}
          <div class="split-row">
            <p class="info">Separati per colore così i bianchi non si macchiano.</p>
            <button class="merge-btn" onclick={() => merge(load.program)}>Lava tutto insieme</button>
          </div>
        {/if}
        <div class="thumbs">
          {#each load.items as item (item.id)}
            <button class="thumb" onclick={() => onopenitem(item.id)} title={item.name}>
              <PhotoThumb photoId={item.photoIds[0]} alt={item.name} />
              {#if item.hasStain}<span class="stain" aria-label="Macchia">🧪</span>{/if}
            </button>
          {/each}
        </div>
        <p class="names">{load.items.map((i) => i.name).join(', ')}</p>
        <div class="actions">
          {#if isDryClean(load)}
            <button class="btn" onclick={() => move(load.items, 'clean')}>Ritirati puliti 🟢</button>
          {:else}
            <button class="btn" onclick={() => move(load.items, 'drying')}>Stesi 🌬️</button>
            <button class="btn" onclick={() => move(load.items, 'toIron')}>Da stirare 💨</button>
            <button class="btn btn-primary" onclick={() => move(load.items, 'clean')}>Tutto pulito 🟢</button>
          {/if}
        </div>
      </section>
    {/each}
  {/if}

  {#if o.drying.length}
    <div class="head">
      <h2 class="section-title">🌬️ Stesi ad asciugare</h2>
      <button class="link" onclick={() => move(o.drying, 'clean')}>Tutti puliti</button>
    </div>
    <div class="list">
      {#each o.drying as item (item.id)}
        <LaundryRow {item} sub={programLabel(programOf(item))} onopen={onopenitem}>
          {#snippet actions()}
            <button class="mini-btn" onclick={() => move([item], 'toIron')}>Da stirare</button>
            <button class="mini-btn" onclick={() => move([item], 'clean')}>Pulito</button>
          {/snippet}
        </LaundryRow>
      {/each}
    </div>
  {/if}

  {#if o.toIron.length}
    <div class="head">
      <h2 class="section-title">💨 Da stirare</h2>
      <button class="link" onclick={() => move(o.toIron, 'clean')}>Tutti stirati</button>
    </div>
    <div class="list">
      {#each o.toIron as item (item.id)}
        <LaundryRow {item} sub={item.washTags.includes('ironLow') ? 'Stiro delicato' : undefined} onopen={onopenitem}>
          {#snippet actions()}
            <button class="mini-btn" onclick={() => move([item], 'clean')}>Stirato</button>
          {/snippet}
        </LaundryRow>
      {/each}
    </div>
  {/if}

  {#if o.maintenance.length}
    <h2 class="section-title">🧵 Da sistemare</h2>
    <div class="list">
      {#each o.maintenance as item (item.id)}
        <LaundryRow {item} sub={[...item.maintenanceTags, item.statusNote].filter(Boolean).join(' · ') || 'Manutenzione'} onopen={onopenitem}>
          {#snippet actions()}
            <button class="mini-btn" onclick={() => move([item], 'clean')}>Sistemato</button>
          {/snippet}
        </LaundryRow>
      {/each}
    </div>
  {/if}

  {#if o.dueSoon.length}
    <div class="head">
      <h2 class="section-title">⏳ Hanno raggiunto i lavaggi</h2>
      <button class="link" onclick={() => move(o.dueSoon, 'toWash')}>Tutti da lavare</button>
    </div>
    <p class="note tight">Puliti, ma li hai già messi quante volte prevede la loro soglia.</p>
    <div class="list">
      {#each o.dueSoon as item (item.id)}
        <LaundryRow {item} sub="{item.wearsSinceWash} utilizzi su {item.maxWearsBeforeWash}" onopen={onopenitem}>
          {#snippet actions()}
            <button class="mini-btn" onclick={() => move([item], 'toWash')}>Da lavare</button>
          {/snippet}
        </LaundryRow>
      {/each}
    </div>
  {/if}
</Page>

<style>
  .summary {
    margin: 4px 4px 8px;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .empty {
    text-align: center;
    padding: 40px 12px;
  }
  .empty .big {
    font-size: 2.5rem;
    margin: 0;
  }
  .load {
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .load.warn {
    border-color: var(--danger);
  }
  .load header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h3 {
    margin: 0;
    font-size: 1.125rem;
  }
  .n {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .alert {
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--warning-bg);
    color: var(--warning-text);
    font-size: 0.875rem;
    line-height: 1.45;
  }
  .split-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .info {
    flex: 1;
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .merge-btn {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
  .merge-btn:active {
    background: var(--surface-2, transparent);
  }
  .thumbs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .thumb {
    position: relative;
    flex: none;
    width: 56px;
    height: 72px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
  }
  .stain {
    position: absolute;
    top: 2px;
    left: 2px;
    font-size: 0.8rem;
  }
  .names {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions .btn {
    flex: 1 1 auto;
    min-height: 44px;
    padding: 0 12px;
    font-size: 0.875rem;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .head .section-title {
    margin-bottom: 8px;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
    min-height: 36px;
    padding: 0 4px;
    cursor: pointer;
  }
  .tight {
    margin-top: -4px;
    margin-bottom: 8px;
  }
</style>
