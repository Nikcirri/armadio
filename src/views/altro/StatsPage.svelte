<script lang="ts">
  import { db } from '../../lib/db';
  import type { CategoryRecord, ItemRecord, ListRecord } from '../../lib/db/types';
  import { colorInfo } from '../../lib/logic/colors';
  import { lastUseDate } from '../../lib/logic/declutter';
  import { formatEuro, statusInfo } from '../../lib/logic/labels';
  import {
    averageCostPerWear,
    bestInvestments,
    distribution,
    forgottenItems,
    formatCapsule,
    spendByYear,
    topWorn,
    wardrobeValue,
    wornRecentlyShare,
    type CapsuleResult,
  } from '../../lib/logic/stats';
  import { daysBetween, todayKey } from '../../lib/logic/util';
  import { computeCapsule } from '../../lib/media/capsule';
  import { matchItemNow } from '../../lib/state/generatorView.svelte';
  import { live } from '../../lib/state/live.svelte';
  import { requestOpenItem } from '../../lib/state/nav.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { reportError } from '../../lib/errors';
  import Page from '../../lib/ui/Page.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import BarList from './BarList.svelte';

  /** Statistiche (SPEC 8.5). */
  let { onclose }: { onclose: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.toArray(), [] as CategoryRecord[]);
  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);

  const today = todayKey();
  const mineId = $derived(lists.value.find((l) => l.kind === 'owner' && l.extra.key === 'mine')?.id ?? null);
  const all = $derived(items.value);
  const value = $derived(wardrobeValue(all, mineId));
  const avgCpw = $derived(averageCostPerWear(all, mineId));
  const recent = $derived(wornRecentlyShare(all, today));
  const spend = $derived(spendByYear(all, mineId));
  const top = $derived(topWorn(all));
  const best = $derived(bestInvestments(all, mineId));
  const forgotten = $derived(forgottenItems(all, today));
  const catName = $derived(new Map(categories.value.map((c) => [c.id, c.name])));
  const listName = $derived(new Map(lists.value.map((l) => [l.id, l.name])));
  const byColor = $derived(distribution(all, (i) => i.colors[0] ?? 'none', (k) => (k === 'none' ? 'Senza colore' : colorInfo(k as never).label)));
  const byCategory = $derived(distribution(all, (i) => i.categoryId, (k) => catName.get(k) ?? 'Categoria eliminata'));
  const byStatus = $derived(distribution(all, (i) => i.status, (k) => statusInfo(k as never).label));
  const byLocation = $derived(distribution(all, (i) => i.locationId ?? 'none', (k) => (k === 'none' ? 'Senza posizione' : (listName.get(k) ?? 'Posizione eliminata'))));
  const spendShares = $derived(spend.map((s) => ({ key: s.year, label: s.year, count: s.total, percent: 0 })));

  let capsule = $state<CapsuleResult | null>(null);
  let capsuleKey = '';

  // Capsule score: si ricalcola nel worker quando cambiano capi o matrice delle occasioni.
  $effect(() => {
    if (!items.ready || !settings.loaded) return;
    const matrix = settings.value.occasionMatrix ?? [];
    const key = JSON.stringify([all.map((i) => [i.id, i.slotType, i.status, i.occasions]), matrix]);
    if (key === capsuleKey) return;
    capsuleKey = key;
    capsule = null;
    computeCapsule($state.snapshot(all) as ItemRecord[], $state.snapshot(matrix) as [string, string][])
      .then((r) => {
        if (key === capsuleKey) capsule = r;
      })
      .catch((e) => reportError(e));
  });

  const sinceDays = (i: ItemRecord) => daysBetween(lastUseDate(i), today);
</script>

<Page title="Statistiche" {onclose}>
  {#if items.ready && !all.length}
    <p class="note">Aggiungi qualche capo all’Armadio: qui vedrai valore, utilizzi e i capi più amati.</p>
  {:else}
    <div class="tiles">
      <div class="tile wide">
        <span class="label">Valore dell’armadio</span>
        <span class="num">{formatEuro(value)}</span>
        <span class="hint">Solo i capi “Mio” con prezzo</span>
      </div>
      <div class="tile">
        <span class="label">Capsule score</span>
        <span class="num">{capsule ? formatCapsule(capsule) : '…'}</span>
        <span class="hint">outfit possibili</span>
      </div>
      <div class="tile">
        <span class="label">Indossati in 90 giorni</span>
        <span class="num">{recent === null ? '—' : `${recent}%`}</span>
        <span class="hint">dei tuoi capi</span>
      </div>
      <div class="tile">
        <span class="label">Costo medio a utilizzo</span>
        <span class="num">{avgCpw === null ? '—' : formatEuro(avgCpw)}</span>
        <span class="hint">capi con prezzo</span>
      </div>
      <div class="tile">
        <span class="label">Capi</span>
        <span class="num">{all.length}</span>
        <span class="hint">{all.filter((i) => i.status === 'clean').length} puliti</span>
      </div>
    </div>
    <p class="note">Capsule score: quanti outfit diversi (sopra e sotto o abito, con scarpe) puoi fare con i tuoi capi, senza abbinare occasioni che non stanno insieme.</p>

    <h2 class="section-title">Spesa per anno</h2>
    {#if spend.length}
      <BarList rows={spendShares} label="Spesa per anno" format={(r) => formatEuro(r.count)} />
    {:else}
      <p class="note">Metti prezzo e data di acquisto nelle schede dei capi per vedere quanto spendi ogni anno.</p>
    {/if}

    <h2 class="section-title">I più indossati</h2>
    {#if top.length}
      <ol class="ranks">
        {#each top as it, i (it.id)}
          <li>
            <span class="pos">{i + 1}</span>
            <button class="item" onclick={() => requestOpenItem(it.id)}>
              <span class="thumb"><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></span>
              <span class="grow">{it.name}</span>
              <span class="val">{it.wearCount} volte</span>
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="note">Quando indossi i capi, qui compaiono i tuoi preferiti.</p>
    {/if}

    <h2 class="section-title">Migliori investimenti</h2>
    {#if best.length}
      <ol class="ranks">
        {#each best as x, i (x.item.id)}
          <li>
            <span class="pos">{i + 1}</span>
            <button class="item" onclick={() => requestOpenItem(x.item.id)}>
              <span class="thumb"><PhotoThumb photoId={x.item.photoIds[0]} alt={x.item.name} /></span>
              <span class="grow">{x.item.name}</span>
              <span class="val">{formatEuro(x.cpw)} a utilizzo</span>
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="note">Servono capi con prezzo e almeno un utilizzo.</p>
    {/if}

    <h2 class="section-title">Dimenticati</h2>
    {#if forgotten.length}
      <div class="list">
        {#each forgotten as it (it.id)}
          <div class="row forgotten">
            <button class="thumb btn-plain" aria-label="Apri {it.name}" onclick={() => requestOpenItem(it.id)}><PhotoThumb photoId={it.photoIds[0]} alt={it.name} /></button>
            <span class="grow">{it.name}<span class="sub">{it.lastWornDate ? `Non lo metti da ${sinceDays(it)} giorni` : 'Mai indossato'}</span></span>
            <button class="btn small" onclick={() => matchItemNow(it.slotType, it.id)}>Abbinalo ora</button>
          </div>
        {/each}
      </div>
      <p class="note">“Abbinalo ora” apre “Cosa metto?” con quel capo già bloccato.</p>
    {:else}
      <p class="note">Nessuno: usi tutti i tuoi capi.</p>
    {/if}

    <h2 class="section-title">Per colore</h2>
    <BarList rows={byColor} label="Capi per colore principale" swatch={(k) => (k === 'none' ? null : k === 'pattern' ? 'pattern' : colorInfo(k as never).hex)} />
    <h2 class="section-title">Per categoria</h2>
    <BarList rows={byCategory} label="Capi per categoria" />
    <h2 class="section-title">Per stato</h2>
    <BarList rows={byStatus} label="Capi per stato" />
    <h2 class="section-title">Per posizione</h2>
    <BarList rows={byLocation} label="Capi per posizione" />
  {/if}
</Page>

<style>
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .tile.wide {
    grid-column: 1 / -1;
  }
  .label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .num {
    font-size: 1.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .wide .num {
    font-size: 2.25rem;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .ranks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ranks li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pos {
    width: 20px;
    text-align: center;
    font-weight: 600;
    color: var(--text-muted);
  }
  .item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px 4px 4px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    text-align: left;
    cursor: pointer;
  }
  .thumb {
    flex: none;
    width: 40px;
    height: 52px;
    border-radius: 8px;
    overflow: hidden;
  }
  .btn-plain {
    padding: 0;
    border: 0;
    cursor: pointer;
  }
  .grow {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .val {
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .forgotten {
    cursor: default;
    gap: 10px;
    padding-right: 10px;
  }
  .small {
    min-height: 40px;
    padding: 0 12px;
    font-size: 0.8125rem;
  }
</style>
