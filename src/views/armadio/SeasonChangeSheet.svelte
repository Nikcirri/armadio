<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../../lib/db';
  import { bulkSetLocation, ensureLocation, restoreBulk } from '../../lib/db/items';
  import type { ItemRecord, ListRecord, Season } from '../../lib/db/types';
  import { labelOf, SEASONS, statusInfo } from '../../lib/logic/labels';
  import { otherSeason, returnCandidates, storeCandidates, suggestedSeasonToStore } from '../../lib/logic/laundry';
  import { tapFeedback } from '../../lib/platform';
  import { live } from '../../lib/state/live.svelte';
  import { showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import PhotoThumb from '../../lib/ui/PhotoThumb.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();

  type Step = 'choose' | 'store' | 'return';
  type RealSeason = Exclude<Season, 'allSeasons'>;

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const locations = live(
    () => db.lists.where('kind').equals('location').sortBy('order'),
    [] as ListRecord[],
  );

  let boxId = $state<string | null>(null);
  let mainId = $state<string | null>(null);
  let step = $state<Step>('choose');
  const suggested = suggestedSeasonToStore(new Date().getMonth());
  let storeSeason = $state<RealSeason>(suggested);
  let returnSeason = $state<Season | 'all'>(otherSeason(suggested));
  let destination = $state('');
  let excluded = $state<string[]>([]);

  onMount(() => {
    // La scatola cambio stagione (e l'armadio principale) devono esistere: se mancano si ricreano.
    Promise.all([ensureLocation(db, 'seasonBox', 'Scatola cambio stagione'), ensureLocation(db, 'main', 'Armadio principale')])
      .then(([box, main]) => {
        boxId = box;
        mainId = main;
        destination = main;
      })
      .catch(reportError);
  });

  const inBox = $derived(boxId ? items.value.filter((i) => i.locationId === boxId).length : 0);
  const store = $derived(boxId ? storeCandidates(items.value, storeSeason, boxId) : { movable: [], skipped: [] });
  const toReturn = $derived(boxId ? returnCandidates(items.value, boxId, returnSeason === 'all' ? null : returnSeason) : []);
  const list = $derived(step === 'store' ? store.movable : step === 'return' ? toReturn : []);
  const chosen = $derived(list.filter((i) => !excluded.includes(i.id)));
  const realSeasons = SEASONS.filter((s): s is { id: RealSeason; label: string } => s.id !== 'allSeasons');

  function go(next: Step) {
    excluded = [];
    step = next;
  }

  function toggle(id: string) {
    excluded = excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id];
  }

  async function confirm() {
    if (!boxId || !chosen.length) return;
    const ids = chosen.map((i) => i.id);
    const target = step === 'store' ? boxId : destination || mainId;
    if (!target) return;
    try {
      const snap = await bulkSetLocation(db, ids, target);
      void tapFeedback();
      const one = ids.length === 1;
      const n = one ? '1 capo' : `${ids.length} capi`;
      const where = locations.value.find((l) => l.id === target)?.name ?? '';
      showUndoToast(
        step === 'store' ? `${n} ${one ? 'riposto' : 'riposti'} nella scatola` : `${n} ${one ? 'spostato' : 'spostati'} in ${where}`,
        () => restoreBulk(db, snap),
      );
      onclose();
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Sheet title="Cambio stagione" {onclose}>
  {#if step === 'choose'}
    <p class="note first">
      Riponi i capi della stagione finita nella <strong>scatola cambio stagione</strong>: restano nell’app ma non ingombrano
      l’armadio (puoi rivederli con i filtri). Ora nella scatola ci sono {inBox === 1 ? '1 capo' : `${inBox} capi`}.
    </p>
    <div class="choices">
      <button class="choice" onclick={() => go('store')}>
        <strong>📦 Riponi una stagione</strong>
        <span>Sposta nella scatola i capi della stagione che non usi più.</span>
      </button>
      <button class="choice" disabled={inBox === 0} onclick={() => go('return')}>
        <strong>👕 Tira fuori dalla scatola</strong>
        <span>{inBox ? 'Rimetti nell’armadio i capi della nuova stagione.' : 'La scatola è vuota.'}</span>
      </button>
    </div>
  {:else}
    <button class="back" onclick={() => go('choose')}><Icon name="back" size={18} /> Indietro</button>
    {#if step === 'store'}
      <div class="field">
        <span>Quale stagione riponi?</span>
        <div class="segmented" role="group" aria-label="Stagione da riporre">
          {#each realSeasons as s (s.id)}
            <button aria-pressed={storeSeason === s.id} onclick={() => ((storeSeason = s.id), (excluded = []))}>{s.label}</button>
          {/each}
        </div>
      </div>
      <p class="note">I capi “4 stagioni” restano nell’armadio.</p>
    {:else}
      <div class="field">
        <span>Cosa tiri fuori?</span>
        <div class="segmented" role="group" aria-label="Stagione da tirare fuori">
          {#each realSeasons as s (s.id)}
            <button aria-pressed={returnSeason === s.id} onclick={() => ((returnSeason = s.id), (excluded = []))}>{s.label}</button>
          {/each}
          <button aria-pressed={returnSeason === 'all'} onclick={() => ((returnSeason = 'all'), (excluded = []))}>Tutto</button>
        </div>
      </div>
      <label class="field top">
        <span>Dove li rimetti?</span>
        <select class="input" bind:value={destination}>
          {#each locations.value.filter((l) => l.id !== boxId) as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
        </select>
      </label>
    {/if}

    <h3 class="section-title">
      {list.length ? `${chosen.length} di ${list.length} ${list.length === 1 ? 'capo selezionato' : 'capi selezionati'}` : 'Nessun capo'}
    </h3>
    {#if list.length}
      <p class="note tight">Tocca un capo per escluderlo.</p>
      <ul class="grid">
        {#each list as item (item.id)}
          {@const on = !excluded.includes(item.id)}
          <li>
            <button class="tile" class:off={!on} aria-pressed={on} onclick={() => toggle(item.id)}>
              <span class="pic">
                <PhotoThumb photoId={item.photoIds[0]} alt={item.name} />
                <span class="check" class:on aria-hidden="true">{#if on}<Icon name="check" size={16} />{/if}</span>
              </span>
              <span class="name">{item.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="note">
        {step === 'store'
          ? `Nessun capo ${labelOf(SEASONS, storeSeason)} da riporre: controlla la stagione nella scheda dei capi.`
          : 'Nella scatola non ci sono capi di questa stagione.'}
      </p>
    {/if}

    {#if step === 'store' && store.skipped.length}
      <p class="warning top">
        Non riposti perché non sono puliti nell’armadio:
        {store.skipped.map((i) => `${i.name} (${statusInfo(i.status).label.toLowerCase()})`).join(', ')}.
      </p>
    {/if}
  {/if}

  {#snippet footer()}
    {#if step === 'choose'}
      <button class="btn btn-ghost" onclick={onclose}>Chiudi</button>
    {:else}
      <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
      <button class="btn btn-primary" disabled={!chosen.length} onclick={confirm}>
        {step === 'store' ? `Riponi ${chosen.length}` : `Tira fuori ${chosen.length}`}
      </button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .first {
    margin-top: 0;
    margin-bottom: 14px;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .choice {
    text-align: left;
    padding: 16px;
    border-radius: var(--radius);
    border: 2px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }
  .choice:disabled {
    opacity: 0.55;
  }
  .choice span {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 40px;
    border: 0;
    background: none;
    padding: 0;
    margin-bottom: 8px;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .top {
    margin-top: 12px;
  }
  .tight {
    margin-top: -4px;
    margin-bottom: 8px;
  }
  .grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
    gap: 10px;
  }
  .tile {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .tile.off {
    opacity: 0.45;
  }
  .pic {
    position: relative;
    display: block;
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .check {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: rgb(0 0 0 / 0.35);
    display: grid;
    place-items: center;
    color: #fff;
  }
  .check.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }
  .name {
    display: block;
    font-size: 0.75rem;
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
