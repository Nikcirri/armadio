<script lang="ts">
  import { db } from '../../lib/db';
  import { purchaseWish, undoPurchase } from '../../lib/db/altro';
  import type { CategoryRecord, ItemRecord, WishlistRecord } from '../../lib/db/types';
  import { euroInput, formatEuro, parseEuro } from '../../lib/logic/labels';
  import { todayKey } from '../../lib/logic/util';
  import { isLink, linkUrl, matchingItems, PRIORITIES, similarItems, slotOfWish, sortWishlist, wishlistTotal } from '../../lib/logic/wishlist';
  import { tapFeedback } from '../../lib/platform';
  import { live } from '../../lib/state/live.svelte';
  import { requestOpenItem } from '../../lib/state/nav.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import WishSheet from './WishSheet.svelte';

  /** Wishlist (SPEC 8.5). */
  let { onclose }: { onclose: () => void } = $props();

  const wishlist = live(() => db.wishlist.toArray(), [] as WishlistRecord[]);
  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const categories = live(() => db.categories.orderBy('order').toArray(), [] as CategoryRecord[]);

  let editing = $state<{ wish: WishlistRecord | null } | null>(null);
  let buying = $state<WishlistRecord | null>(null);
  let buyPrice = $state('');
  let buyDate = $state(todayKey());
  let buyCategory = $state('');
  let busy = $state(false);

  const sorted = $derived(sortWishlist(wishlist.value));
  const matrix = $derived(settings.value.occasionMatrix ?? []);

  function info(w: WishlistRecord) {
    return {
      matches: matchingItems({ slot: slotOfWish(w, categories.value), occasions: w.occasions, season: w.season }, items.value, matrix).length,
      similar: similarItems(w, items.value),
      category: categories.value.find((c) => c.id === w.categoryId),
    };
  }

  function startBuy(w: WishlistRecord) {
    buying = w;
    buyPrice = euroInput(w.price);
    buyDate = todayKey();
    buyCategory = w.categoryId ?? categories.value[0]?.id ?? '';
  }

  async function confirmBuy() {
    if (!buying || busy) return;
    const price = parseEuro(buyPrice);
    if (buyPrice.trim() && price === null) return showToast('Il prezzo non è un numero valido');
    if (!buyCategory) return showToast('Scegli la categoria');
    busy = true;
    try {
      const { item, snapshot } = await purchaseWish(db, buying.id, { categoryId: buyCategory, price, purchaseDate: buyDate || null });
      buying = null;
      void tapFeedback('medium');
      showToast(`“${item.name}” ora è nel tuo armadio`, { actionLabel: 'Annulla', onAction: () => undoPurchase(db, snapshot) });
    } catch (e) {
      reportError(e);
    } finally {
      busy = false;
    }
  }
</script>

<Page title="Wishlist" {onclose}>
  <button class="btn btn-primary btn-block" onclick={() => (editing = { wish: null })}><Icon name="plus" size={20} /> Nuovo desiderio</button>

  {#if wishlist.ready && !wishlist.value.length}
    <div class="empty">
      <p class="big" aria-hidden="true">✨</p>
      <p><strong>La wishlist è vuota.</strong></p>
      <p class="note">Salva i capi che vorresti comprare: vedi con quanti capi si abbinano, se ne hai già di simili, e puoi provarli negli outfit (“Includi wishlist”).</p>
    </div>
  {:else}
    <p class="note summary">
      {wishlist.value.length === 1 ? '1 desiderio' : `${wishlist.value.length} desideri`}{wishlistTotal(wishlist.value) ? ` · totale ${formatEuro(wishlistTotal(wishlist.value))}` : ''}
    </p>
    <div class="cards">
      {#each sorted as w (w.id)}
        {@const x = info(w)}
        {@const pr = PRIORITIES.find((p) => p.id === w.priority)}
        <article class="card wish">
          <button class="main" onclick={() => (editing = { wish: $state.snapshot(w) as WishlistRecord })}>
            <span class="pic"><PhotoThumb photoId={w.photoIds[0]} alt={w.name} /></span>
            <span class="text">
              <strong>{w.name}</strong>
              <span class="sub">{[x.category?.name, w.price !== null ? formatEuro(w.price) : ''].filter(Boolean).join(' · ')}</span>
              <span class="prio">{pr?.emoji} Priorità {pr?.label.toLowerCase()}</span>
              <span class="match">Si abbina con {x.matches === 1 ? '1 capo' : `${x.matches} capi`}</span>
            </span>
          </button>
          {#if x.similar.length}
            <p class="warning small">
              Hai già qualcosa di simile:
              {#each x.similar.slice(0, 3) as s, i (s.id)}{i ? ', ' : ''}<button class="link" onclick={() => requestOpenItem(s.id)}>{s.name}</button>{/each}
            </p>
          {/if}
          <div class="actions">
            {#if w.storeOrLink}
              {#if isLink(w.storeOrLink)}
                <a class="btn" href={linkUrl(w.storeOrLink)} target="_blank" rel="noopener">Apri il link</a>
              {:else}
                <span class="store">🏬 {w.storeOrLink}</span>
              {/if}
            {/if}
            <button class="btn btn-primary" onclick={() => startBuy(w)}>Comprato!</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</Page>

{#if editing}
  <WishSheet wish={editing.wish} onclose={() => (editing = null)} />
{/if}

{#if buying}
  <Sheet title="Comprato “{buying.name}”" onclose={() => (buying = null)}>
    <p class="note first">Il capo passa nell’armadio con le sue foto e i suoi dati. Negli outfit dove lo provavi diventa il capo vero.</p>
    <div class="stack">
      <label class="field">
        <span>Prezzo pagato (€)</span>
        <input class="input" inputmode="decimal" bind:value={buyPrice} />
      </label>
      <label class="field">
        <span>Data di acquisto</span>
        <input class="input" type="date" max={todayKey()} bind:value={buyDate} />
      </label>
      <label class="field">
        <span>Categoria</span>
        <select class="input" bind:value={buyCategory}>
          {#each categories.value as c (c.id)}<option value={c.id}>{c.icon} {c.name}</option>{/each}
        </select>
      </label>
    </div>
    {#snippet footer()}
      <button class="btn btn-ghost" onclick={() => (buying = null)}>Annulla</button>
      <button class="btn btn-primary" disabled={busy} onclick={confirmBuy}>Mettilo nell’armadio</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .summary {
    margin: 12px 4px 8px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wish {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .main {
    display: flex;
    gap: 12px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .pic {
    flex: none;
    width: 84px;
    height: 108px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .text strong {
    font-size: 1.0625rem;
  }
  .sub,
  .prio {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .match {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent);
  }
  .small {
    margin: 0;
    font-size: 0.8125rem;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .actions .btn {
    flex: 1;
    padding: 0 12px;
    text-decoration: none;
  }
  .store {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .empty {
    text-align: center;
    padding: 32px 12px;
  }
  .big {
    font-size: 2.5rem;
    margin: 0;
  }
  .first {
    margin: 0 4px 12px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
