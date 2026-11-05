<script lang="ts">
  import type { CategoryRecord } from '../../lib/db/types';
  import { SLOTS } from '../../lib/logic/slots';
  import { MAX_BATCH } from '../../lib/media/acquire';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let {
    categories,
    onpick,
    onclose,
  }: { categories: CategoryRecord[]; onpick: (c: CategoryRecord) => void; onclose: () => void } = $props();

  const groups = $derived(
    SLOTS.map((s) => ({ slot: s, cats: categories.filter((c) => c.slotType === s.id) })).filter((g) => g.cats.length),
  );
</script>

<Sheet title="Multi-foto: in che categoria?" {onclose}>
  <p class="note first">
    Scegli la categoria, poi seleziona fino a {MAX_BATCH} foto dalla galleria. Per ognuna creo un capo con il colore rilevato;
    alla fine potrai rinominarli.
  </p>
  {#each groups as g (g.slot.id)}
    <h3 class="section-title">{g.slot.label}</h3>
    <div class="list">
      {#each g.cats as c (c.id)}
        <button class="row" onclick={() => onpick(c)}>
          <span class="emoji" aria-hidden="true">{c.icon}</span>
          <span class="grow">{c.name}</span>
        </button>
      {/each}
    </div>
  {/each}
</Sheet>

<style>
  .first {
    margin-top: 0;
  }
  .emoji {
    font-size: 1.4rem;
    width: 32px;
    text-align: center;
  }
</style>
