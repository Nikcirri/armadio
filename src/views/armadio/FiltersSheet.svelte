<script lang="ts">
  import type { CategoryRecord, ColorId, ItemStatus, ListRecord } from '../../lib/db/types';
  import { GARMENT_COLORS } from '../../lib/logic/colors';
  import { CUTS, SEASONS, STATUSES, WARMTHS } from '../../lib/logic/labels';
  import { activeFilterCount, emptyFilters, type ItemFilters } from '../../lib/logic/items';
  import ChipGroup from '../../lib/ui/ChipGroup.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';

  let {
    filters,
    categories,
    lists,
    resultCount,
    onchange,
    onclose,
  }: {
    filters: ItemFilters;
    categories: CategoryRecord[];
    lists: ListRecord[];
    resultCount: number;
    onchange: (f: ItemFilters) => void;
    onclose: () => void;
  } = $props();

  const kind = (k: ListRecord['kind']) =>
    lists.filter((l) => l.kind === k).sort((a, b) => a.order - b.order).map((l) => ({ id: l.id, label: l.name }));

  function set<K extends keyof ItemFilters>(key: K, value: ItemFilters[K]) {
    onchange({ ...filters, [key]: value });
  }

  const count = $derived(activeFilterCount(filters));
</script>

<Sheet title="Filtri" {onclose}>
  <div class="sections">
    <div class="list">
      <Switch label="Solo preferiti ❤️" checked={filters.favoritesOnly} onchange={(v) => set('favoritesOnly', v)} />
      <Switch
        label="Nascondi la scatola cambio stagione"
        description="I capi riposti non compaiono, tranne se filtri proprio per quella posizione."
        checked={filters.hideSeasonBox}
        onchange={(v) => set('hideSeasonBox', v)}
      />
    </div>

    <section>
      <h3 class="section-title">Categoria</h3>
      <ChipGroup
        label="Categoria"
        options={categories.map((c) => ({ id: c.id, label: c.name, emoji: c.icon }))}
        value={filters.categoryIds}
        onchange={(v) => set('categoryIds', v)}
      />
    </section>

    <section>
      <h3 class="section-title">Stato</h3>
      <ChipGroup
        label="Stato"
        options={STATUSES.map((s) => ({ id: s.id, label: s.label, emoji: s.emoji }))}
        value={filters.statuses}
        onchange={(v) => set('statuses', v as ItemStatus[])}
      />
    </section>

    <section>
      <h3 class="section-title">Dove si trova</h3>
      <ChipGroup label="Posizione" options={kind('location')} value={filters.locationIds} onchange={(v) => set('locationIds', v)} />
    </section>

    <section>
      <h3 class="section-title">Di chi è</h3>
      <ChipGroup label="Proprietario" options={kind('owner')} value={filters.ownerIds} onchange={(v) => set('ownerIds', v)} />
    </section>

    <section>
      <h3 class="section-title">Colore</h3>
      <ChipGroup
        label="Colore"
        options={GARMENT_COLORS.map((c) => ({ id: c.id, label: c.label, color: c.id === 'pattern' ? 'conic-gradient(#c62f2f,#e9c93b,#3f8f4f,#5b7fae,#c62f2f)' : c.hex }))}
        value={filters.colors}
        onchange={(v) => set('colors', v as ColorId[])}
      />
    </section>

    <section>
      <h3 class="section-title">Stagione</h3>
      <ChipGroup label="Stagione" options={SEASONS} value={filters.seasons} onchange={(v) => set('seasons', v)} />
    </section>

    <section>
      <h3 class="section-title">Pesantezza</h3>
      <ChipGroup label="Pesantezza" options={WARMTHS} value={filters.warmths} onchange={(v) => set('warmths', v)} />
    </section>

    <section>
      <h3 class="section-title">Taglio</h3>
      <ChipGroup label="Taglio" options={CUTS} value={filters.cuts} onchange={(v) => set('cuts', v)} />
    </section>

    <section>
      <h3 class="section-title">Occasione</h3>
      <ChipGroup label="Occasione" options={kind('occasion')} value={filters.occasionIds} onchange={(v) => set('occasionIds', v)} />
    </section>
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost" disabled={count === 0 && filters.hideSeasonBox} onclick={() => onchange({ ...emptyFilters(), query: filters.query })}>
      Azzera
    </button>
    <button class="btn btn-primary" onclick={onclose}>
      Mostra {resultCount} {resultCount === 1 ? 'capo' : 'capi'}
    </button>
  {/snippet}
</Sheet>

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  section .section-title {
    margin-top: 16px;
  }
</style>
