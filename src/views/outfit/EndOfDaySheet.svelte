<script lang="ts">
  import { db } from '../../lib/db';
  import type { ItemRecord } from '../../lib/db/types';
  import { endOfDayChoices } from '../../lib/logic/outfits';
  import { formatDateIt, todayKey } from '../../lib/logic/util';
  import { live } from '../../lib/state/live.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';
  import { closeDayWithUndo } from './actions';

  /** "Fine giornata" (SPEC 8.2): i capi arrivati alla soglia vanno da lavare, gli altri restano puliti. */
  let { onclose }: { onclose: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const pending = $derived(settings.value.endOfDay ?? null);
  const choices = $derived(endOfDayChoices(pending, new Map(items.value.map((i) => [i.id, i]))));

  let wash = $state<Record<string, boolean>>({});
  let stain = $state<Record<string, boolean>>({});
  let initialized = false;
  let busy = $state(false);

  $effect(() => {
    if (initialized || !items.ready) return;
    initialized = true;
    wash = Object.fromEntries(choices.map((c) => [c.item.id, c.reachedLimit]));
  });

  const when = $derived(pending ? (pending.date === todayKey() ? 'oggi' : `il ${formatDateIt(pending.date)}`) : '');
  const washCount = $derived(choices.filter((c) => wash[c.item.id]).length);

  async function confirm() {
    if (busy) return;
    busy = true;
    const washIds = choices.filter((c) => wash[c.item.id]).map((c) => c.item.id);
    const ok = await closeDayWithUndo(
      washIds,
      washIds.filter((id) => stain[id]),
    );
    busy = false;
    if (ok) onclose();
  }

  const usage = (i: ItemRecord) => `${i.wearsSinceWash} ${i.wearsSinceWash === 1 ? 'utilizzo' : 'utilizzi'} su ${i.maxWearsBeforeWash}`;
</script>

<Sheet title="Fine giornata" {onclose}>
  {#if !pending}
    <p class="note first">Non c’è niente da chiudere: segna un outfit come indossato e qui deciderai cosa mettere a lavare.</p>
  {:else if !choices.length}
    <p class="note first">
      Hai indossato solo capi che non si lavano a utilizzi (scarpe, accessori) o che non sono puliti. Restano come sono.
    </p>
  {:else}
    <p class="note first">
      Capi indossati {when}. Quelli arrivati al numero di utilizzi sono già su “Da lavare”: cambia pure se serve.
    </p>
    <div class="list">
      {#each choices as c (c.item.id)}
        {@const id = c.item.id}
        <div class="choice">
          <div class="top">
            <span class="mini"><PhotoThumb photoId={c.item.photoIds[0]} alt={c.item.name} /></span>
            <span class="grow">
              <strong>{c.item.name}</strong>
              <span class="sub" class:limit={c.reachedLimit}>{usage(c.item)}{c.reachedLimit ? ' · da lavare' : ''}</span>
            </span>
          </div>
          <div class="segmented" role="group" aria-label="Cosa fare con {c.item.name}">
            <button aria-pressed={!wash[id]} onclick={() => (wash = { ...wash, [id]: false })}>Resta pulito</button>
            <button aria-pressed={!!wash[id]} onclick={() => (wash = { ...wash, [id]: true })}>Da lavare</button>
          </div>
          {#if wash[id]}
            <Switch label="Macchia da pre-trattare" checked={!!stain[id]} onchange={(v) => (stain = { ...stain, [id]: v })} />
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#snippet footer()}
    {#if pending}
      <button class="btn btn-ghost" onclick={onclose}>Più tardi</button>
      <button class="btn btn-primary" disabled={busy} onclick={confirm}>
        {washCount ? `Conferma (${washCount} da lavare)` : 'Conferma: tutto pulito'}
      </button>
    {:else}
      <button class="btn btn-block" onclick={onclose}>Chiudi</button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .first {
    margin: 0 4px 12px;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .choice:last-child {
    border-bottom: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .sub {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
  .sub.limit {
    color: var(--accent);
    font-weight: 600;
  }
  .mini {
    flex: none;
    width: 44px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
  }
</style>
