<script lang="ts">
  import type { CategoryRecord } from '../db/types';
  import { SLOTS } from '../logic/slots';

  let {
    categories,
    value,
    onchange,
    label = 'Categoria',
  }: { categories: CategoryRecord[]; value: string; onchange: (id: string) => void; label?: string } = $props();

  const groups = $derived(
    SLOTS.map((s) => ({ slot: s, cats: categories.filter((c) => c.slotType === s.id) })).filter((g) => g.cats.length),
  );
</script>

<label class="field">
  <span>{label}</span>
  <select class="input" {value} onchange={(e) => onchange(e.currentTarget.value)}>
    {#each groups as g (g.slot.id)}
      <optgroup label={g.slot.label}>
        {#each g.cats as c (c.id)}
          <option value={c.id}>{c.icon} {c.name}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
</label>
