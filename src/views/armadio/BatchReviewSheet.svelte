<script lang="ts">
  import { db } from '../../lib/db';
  import { deleteItemsHard, updateItemFields } from '../../lib/db/items';
  import type { ColorId, ItemRecord } from '../../lib/db/types';
  import { colorInfo } from '../../lib/logic/colors';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import ColorChips from '../../lib/ui/ColorChips.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { itemIds, onclose }: { itemIds: string[]; onclose: () => void } = $props();

  const items = live(
    async () => (await db.items.bulkGet(itemIds)).filter((i): i is ItemRecord => !!i),
    [] as ItemRecord[],
  );
  let openColors = $state<string | null>(null);

  function rename(id: string, value: string) {
    updateItemFields(db, id, { name: value }).catch(reportError);
  }
  function setColors(id: string, colors: ColorId[]) {
    updateItemFields(db, id, { colors }).catch(reportError);
  }
  async function remove(item: ItemRecord) {
    const ok = await confirmDialog({ title: `Scartare “${item.name}”?`, confirmLabel: 'Scarta', danger: true });
    if (!ok) return;
    deleteItemsHard(db, [item.id]).catch(reportError);
  }
  function done() {
    const n = items.value.length;
    if (n) showToast(n === 1 ? '1 capo aggiunto all’armadio' : `${n} capi aggiunti all’armadio`);
    onclose();
  }
</script>

<Sheet title="Controlla i nuovi capi" onclose={done}>
  <p class="note first">Le modifiche si salvano da sole. Tocca i pallini per cambiare i colori.</p>
  <div class="items">
    {#each items.value as item (item.id)}
      <div class="item">
        <div class="top">
          <div class="pic"><PhotoThumb photoId={item.photoIds[0]} alt={item.name} eager /></div>
          <div class="grow">
            <input
              class="input"
              value={item.name}
              aria-label="Nome del capo"
              onchange={(e) => rename(item.id, e.currentTarget.value)}
            />
            <button
              class="colors"
              aria-expanded={openColors === item.id}
              onclick={() => (openColors = openColors === item.id ? null : item.id)}
            >
              {#each item.colors as c (c)}
                <span class="dot" style:background={colorInfo(c).hex} title={colorInfo(c).label}></span>
              {/each}
              <span class="sub">{item.colors.length ? item.colors.map((c) => colorInfo(c).label).join(', ') : 'Nessun colore'}</span>
            </button>
          </div>
          <button class="icon-btn" aria-label="Scarta {item.name}" onclick={() => remove(item)}>
            <Icon name="trash" size={20} />
          </button>
        </div>
        {#if openColors === item.id}
          <ColorChips value={item.colors} onchange={(c) => setColors(item.id, c)} />
        {/if}
      </div>
    {:else}
      <p class="note">Nessun capo da controllare.</p>
    {/each}
  </div>

  {#snippet footer()}
    <button class="btn btn-primary" onclick={done}>Fatto</button>
  {/snippet}
</Sheet>

<style>
  .first {
    margin-top: 0;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .item {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .top {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .pic {
    width: 64px;
    height: 84px;
    border-radius: 10px;
    overflow: hidden;
    flex: none;
  }
  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .colors {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 36px;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.15);
    flex: none;
  }
  .sub {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-left: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
