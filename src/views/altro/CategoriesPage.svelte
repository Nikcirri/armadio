<script lang="ts">
  import { db } from '../../lib/db';
  import { getCategories, moveCategory } from '../../lib/db/repo';
  import type { CategoryRecord } from '../../lib/db/types';
  import { SLOTS } from '../../lib/logic/slots';
  import { live } from '../../lib/state/live.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import CategorySheet from './CategorySheet.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const categories = live(() => getCategories(db), [] as CategoryRecord[]);
  const counts = live(async () => {
    const keys = (await db.items.orderBy('categoryId').keys()) as string[];
    const map: Record<string, number> = {};
    for (const k of keys) map[k] = (map[k] ?? 0) + 1;
    return map;
  }, {} as Record<string, number>);

  let editing = $state<{ category: CategoryRecord | null } | null>(null);

  const all = $derived(categories.value);
  const groups = $derived(
    SLOTS.map((slot) => ({ slot, cats: all.filter((c) => c.slotType === slot.id) })).filter((g) => g.cats.length > 0),
  );

  function move(id: string, dir: -1 | 1) {
    moveCategory(db, id, dir).catch(reportError);
  }

</script>

<Page title="Categorie" {onclose}>
  <p class="note">Tocca una categoria per modificarla. Con le frecce cambi l’ordine in cui compaiono.</p>

  {#each groups as g (g.slot.id)}
    <h2 class="section-title">{g.slot.label}</h2>
    <div class="list">
      {#each g.cats as c, i (c.id)}
        <div class="row cat">
          <button class="main" onclick={() => (editing = { category: c })}>
            <span class="emoji" aria-hidden="true">{c.icon}</span>
            <span class="grow">
              {c.name}
              <span class="sub">
                {counts.value[c.id] ?? 0} capi · {c.defaultMaxWears === null
                  ? 'non si lava a utilizzi'
                  : `lavare dopo ${c.defaultMaxWears} ${c.defaultMaxWears === 1 ? 'uso' : 'usi'}`}
              </span>
            </span>
          </button>
          <button class="icon-btn" aria-label="Sposta su {c.name}" disabled={i === 0} onclick={() => move(c.id, -1)}>
            <Icon name="up" size={20} />
          </button>
          <button class="icon-btn" aria-label="Sposta giù {c.name}" disabled={i === g.cats.length - 1} onclick={() => move(c.id, 1)}>
            <Icon name="down" size={20} />
          </button>
        </div>
      {/each}
    </div>
  {/each}

  <button class="btn btn-primary btn-block add" onclick={() => (editing = { category: null })}>
    <Icon name="plus" size={20} /> Aggiungi categoria
  </button>
</Page>

{#if editing}
  <CategorySheet
    category={editing.category}
    categories={all}
    itemCount={editing.category ? (counts.value[editing.category.id] ?? 0) : 0}
    onclose={() => (editing = null)}
  />
{/if}

<style>
  .cat {
    padding: 0 4px 0 0;
    cursor: default;
  }
  .main {
    flex: 1;
    min-width: 0;
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 4px 8px 16px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .emoji {
    font-size: 1.5rem;
    width: 32px;
    text-align: center;
  }
  .add {
    margin-top: 24px;
  }
</style>
