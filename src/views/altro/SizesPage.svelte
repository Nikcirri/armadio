<script lang="ts">
  import { db } from '../../lib/db';
  import { updateSetting } from '../../lib/db/repo';
  import type { ItemRecord } from '../../lib/db/types';
  import { addBrandSize, filterBrandSizes, formatCm, MEASUREMENTS, parseCm, sizeSuggestions, type BrandSize } from '../../lib/logic/sizes';
  import { live } from '../../lib/state/live.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';

  /** Taglie e misure (SPEC 8.5): da consultare in negozio, anche senza internet. */
  let { onclose }: { onclose: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const profile = $derived(settings.value.profile);
  const measurements = $derived(profile?.measurements ?? {});
  const sizes = $derived(profile?.brandSizes ?? []);

  let query = $state('');
  let brand = $state('');
  let size = $state('');

  const shown = $derived(filterBrandSizes(sizes, query));
  const suggestions = $derived(sizeSuggestions(items.value, sizes));

  async function saveMeasure(key: string, text: string) {
    const value = parseCm(text);
    if (text.trim() && value === null) return showToast('Scrivi la misura in centimetri, es. 72 o 72,5');
    try {
      await updateSetting(db, 'profile', { measurements: { ...$state.snapshot(measurements), [key]: value } });
    } catch (e) {
      reportError(e);
    }
  }

  async function saveSizes(next: BrandSize[]) {
    try {
      await updateSetting(db, 'profile', { brandSizes: next });
    } catch (e) {
      reportError(e);
    }
  }

  function add(entry: BrandSize) {
    const current = $state.snapshot(sizes) as BrandSize[];
    const next = addBrandSize(current, entry);
    if (next.length === current.length) return showToast(entry.brand.trim() && entry.size.trim() ? 'Questa taglia c’è già' : 'Scrivi brand e taglia');
    void saveSizes(next);
    brand = '';
    size = '';
  }

  function remove(entry: BrandSize) {
    const before = $state.snapshot(sizes) as BrandSize[];
    void saveSizes(before.filter((b) => !(b.brand === entry.brand && b.size === entry.size)));
    showUndoToast(`${entry.brand} ${entry.size} tolta`, () => saveSizes(before));
  }
</script>

<Page title="Taglie e misure" {onclose}>
  <p class="note first">Tutto resta sul telefono: in negozio lo trovi anche senza internet.</p>

  <h2 class="section-title">Le mie taglie per brand</h2>
  {#if sizes.length > 5}
    <input class="input search" type="search" placeholder="Cerca un brand…" bind:value={query} />
  {/if}
  {#if shown.length}
    <div class="list">
      {#each shown as b (`${b.brand}|${b.size}`)}
        <div class="row static">
          <span class="grow"><strong>{b.brand}</strong></span>
          <span class="size">{b.size}</span>
          <button class="icon-btn" aria-label="Togli {b.brand} {b.size}" onclick={() => remove(b)}><Icon name="close" size={20} /></button>
        </div>
      {/each}
    </div>
  {:else if sizes.length}
    <p class="note">Nessun brand con “{query}”.</p>
  {:else}
    <p class="note">Aggiungi le taglie che porti nei diversi brand, es. Levi’s 27, Zara M, Nike 38,5.</p>
  {/if}
  <form class="add" onsubmit={(e) => (e.preventDefault(), add({ brand, size }))}>
    <input class="input" bind:value={brand} placeholder="Brand" aria-label="Brand" />
    <input class="input small" bind:value={size} placeholder="Taglia" aria-label="Taglia" />
    <button class="btn" type="submit" aria-label="Aggiungi taglia"><Icon name="plus" size={20} /></button>
  </form>
  {#if suggestions.length}
    <p class="note">Dai tuoi capi:</p>
    <div class="chips">
      {#each suggestions as sug (`${sug.brand}|${sug.size}`)}
        <button class="chip" onclick={() => add(sug)}>+ {sug.brand} {sug.size}</button>
      {/each}
    </div>
  {/if}

  <h2 class="section-title">Misure del corpo (cm)</h2>
  <div class="list">
    {#each MEASUREMENTS as m (m.key)}
      <label class="row measure">
        <span class="grow">{m.label}<span class="sub">{m.hint}</span></span>
        <input
          class="input cm"
          inputmode="decimal"
          value={formatCm(measurements[m.key])}
          placeholder="—"
          aria-label="{m.label} in centimetri"
          onchange={(e) => saveMeasure(m.key, e.currentTarget.value)}
        />
        <span class="unit">cm</span>
      </label>
    {/each}
  </div>
  <p class="note">Misura con un metro da sarta, senza stringere.</p>
</Page>

<style>
  .first {
    margin: 4px 4px 0;
  }
  .search {
    margin-bottom: 8px;
  }
  .row.static,
  .row.measure {
    cursor: default;
  }
  .size {
    font-family: var(--font-serif);
    font-size: 1.25rem;
  }
  .add {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .add .small {
    width: 110px;
    flex: none;
  }
  .add .btn {
    flex: none;
    padding: 0 14px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .cm {
    width: 84px;
    text-align: right;
  }
  .unit {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
