<script lang="ts">
  import type { ListRecord } from '../../lib/db/types';
  import { SEASONS } from '../../lib/logic/labels';
  import { activeOutfitFilterCount, emptyOutfitFilters, RECENT_DAYS, WEATHER_TAGS, type OutfitFilters } from '../../lib/logic/outfits';
  import ChipGroup from '../../lib/ui/ChipGroup.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';

  let {
    filters,
    lists,
    people,
    resultCount,
    onchange,
    onclose,
  }: {
    filters: OutfitFilters;
    lists: ListRecord[];
    /** Persone già usate nel diario, per "Mai indossato con…". */
    people: string[];
    resultCount: number;
    onchange: (f: OutfitFilters) => void;
    onclose: () => void;
  } = $props();

  const occasions = $derived(
    lists
      .filter((l) => l.kind === 'occasion')
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ id: l.id, label: l.name })),
  );

  function set<K extends keyof OutfitFilters>(key: K, value: OutfitFilters[K]) {
    onchange({ ...filters, [key]: value });
  }

  const count = $derived(activeOutfitFilterCount(filters));
</script>

<Sheet title="Filtri outfit" {onclose}>
  <div class="list">
    <Switch label="Solo preferiti" checked={filters.favorites} onchange={(v) => set('favorites', v)} />
    <Switch label="Mai indossati" checked={filters.neverWorn} onchange={(v) => set('neverWorn', v)} />
    <Switch
      label="Non indossati da {RECENT_DAYS}+ giorni"
      description="Compresi quelli mai indossati."
      checked={filters.notWornRecently}
      onchange={(v) => set('notWornRecently', v)}
    />
    <Switch
      label="Incompleti"
      description="Outfit a cui manca un capo eliminato."
      checked={filters.incomplete}
      onchange={(v) => set('incomplete', v)}
    />
  </div>

  <h3 class="section-title">Occasione</h3>
  <ChipGroup label="Occasione" options={occasions} value={filters.occasionIds} onchange={(v) => set('occasionIds', v)} />

  <h3 class="section-title">Stagione</h3>
  <ChipGroup label="Stagione" options={SEASONS} value={filters.seasons} onchange={(v) => set('seasons', v)} />

  <h3 class="section-title">Meteo</h3>
  <ChipGroup label="Meteo" options={WEATHER_TAGS} value={filters.weather} onchange={(v) => set('weather', v)} />

  <h3 class="section-title">Mai indossato con…</h3>
  {#if people.length}
    <ChipGroup
      label="Persona"
      single
      options={people.map((p) => ({ id: p, label: p }))}
      value={filters.neverWith ? [filters.neverWith] : []}
      onchange={(v) => set('neverWith', v[0] ?? null)}
    />
    <p class="note">Mostra gli outfit che non hai mai messo quando eri con questa persona (dal diario).</p>
  {:else}
    <p class="note">Aggiungi le persone ai ricordi del diario: qui potrai vedere gli outfit che non hai mai indossato con loro.</p>
  {/if}

  {#snippet footer()}
    <button class="btn btn-ghost" disabled={count === 0} onclick={() => onchange({ ...emptyOutfitFilters(), query: filters.query })}>Azzera</button>
    <button class="btn btn-primary" onclick={onclose}>Mostra {resultCount} {resultCount === 1 ? 'outfit' : 'outfit'}</button>
  {/snippet}
</Sheet>
