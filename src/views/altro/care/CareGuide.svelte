<script lang="ts">
  import {
    DELICATE_NOTE,
    FABRIC_GUIDES,
    GOLDEN_RULES,
    LAUNDRY_TIPS,
    SYMBOL_GROUPS,
    fabricGuidesFor,
    searchStains,
    type FabricGuide,
  } from '../../../lib/logic/careGuide';
  import { WASH_TAGS } from '../../../lib/logic/labels';
  import CareSymbol from './CareSymbol.svelte';

  type Tab = 'stains' | 'fabrics' | 'symbols';

  /**
   * Guida macchie e lavaggio (SPEC.md, sezione 8.8). Dalla scheda di un capo arriva con i suoi
   * tessuti (`fabrics`): la guida si apre sui tessuti e mostra prima i suoi.
   */
  let { fabrics = [] }: { fabrics?: string[] } = $props();

  const itemGuides = $derived(fabricGuidesFor(fabrics));
  // svelte-ignore state_referenced_locally
  let tab = $state<Tab>(fabricGuidesFor(fabrics).length ? 'fabrics' : 'stains');
  let query = $state('');
  const stains = $derived(searchStains(query));
  const otherGuides = $derived(FABRIC_GUIDES.filter((g) => !itemGuides.includes(g)));
  const tagLabel = (id: string) => WASH_TAGS.find((t) => t.id === id)?.label ?? id;
</script>

{#snippet fabricCard(g: FabricGuide, open: boolean)}
  <details class="card" {open}>
    <summary>{g.name}</summary>
    <dl>
      <dt>Lavaggio</dt>
      <dd>{g.wash}</dd>
      <dt>Asciugatura</dt>
      <dd>{g.dry}</dd>
      <dt>Stiro</dt>
      <dd>{g.iron}</dd>
      <dt>Come conservarlo</dt>
      <dd>{g.keep}</dd>
    </dl>
  </details>
{/snippet}

<div class="guide">
  <div class="segmented" role="group" aria-label="Parte della guida">
    <button aria-pressed={tab === 'stains'} onclick={() => (tab = 'stains')}>Macchie</button>
    <button aria-pressed={tab === 'fabrics'} onclick={() => (tab = 'fabrics')}>Tessuti</button>
    <button aria-pressed={tab === 'symbols'} onclick={() => (tab = 'symbols')}>Simboli</button>
  </div>

  {#if tab === 'stains'}
    <details class="card rules" open={!query}>
      <summary>Le regole d’oro</summary>
      <ul>
        {#each GOLDEN_RULES as r (r)}<li>{r}</li>{/each}
      </ul>
    </details>
    <label class="search">
      <span class="visually-hidden">Cerca una macchia</span>
      <input class="input" type="search" placeholder="Cerca: vino, penna, unto…" bind:value={query} />
    </label>
    {#each stains as s (s.id)}
      <details class="card" open={stains.length === 1}>
        <summary>{s.name}</summary>
        <ol>
          {#each s.steps as step (step)}<li>{step}</li>{/each}
        </ol>
        <p class="avoid"><strong>Da evitare:</strong> {s.avoid.join('; ')}.</p>
        <p class="delicate">{DELICATE_NOTE}</p>
      </details>
    {:else}
      <p class="note">Nessuna macchia trovata. Prova con un’altra parola, oppure segui le regole d’oro e il detersivo per piatti.</p>
    {/each}
  {:else if tab === 'fabrics'}
    {#if itemGuides.length}
      <h2 class="section-title">Per questo capo</h2>
      {#each itemGuides as g (g.id)}{@render fabricCard(g, true)}{/each}
      <h2 class="section-title">Gli altri tessuti</h2>
    {:else if fabrics.length}
      <p class="note">Per i tessuti di questo capo non c’è una scheda: guarda quella più simile qui sotto.</p>
    {/if}
    {#each otherGuides as g (g.id)}{@render fabricCard(g, false)}{/each}
    <details class="card">
      <summary>Consigli per il bucato</summary>
      <ul>
        {#each LAUNDRY_TIPS as t (t)}<li>{t}</li>{/each}
      </ul>
    </details>
  {:else}
    <p class="note">Così si leggono i simboli disegnati sull’etichetta. Un simbolo barrato vuol dire “no”.</p>
    {#each SYMBOL_GROUPS as group (group.title)}
      <h2 class="section-title">{group.title}</h2>
      <p class="note intro">{group.intro}</p>
      <div class="list">
        {#each group.symbols as sym (sym.id)}
          <div class="sym-row">
            <CareSymbol shape={sym.shape} />
            <span class="grow">
              <strong>{sym.title}</strong>
              <span class="sub">{sym.meaning}</span>
              {#if sym.tag}<span class="chip-tag">Nell’app: {tagLabel(sym.tag)}</span>{/if}
            </span>
          </div>
        {/each}
      </div>
    {/each}
  {/if}

  <p class="note foot">Sono consigli generali: vale sempre l’etichetta del capo. Se un capo è prezioso o delicato, chiedi in tintoria.</p>
</div>

<style>
  .guide {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card {
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 0 14px;
  }
  .card summary {
    min-height: 52px;
    display: flex;
    align-items: center;
    font-weight: 600;
    cursor: pointer;
  }
  .card[open] {
    padding-bottom: 12px;
  }
  .card ol,
  .card ul {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    line-height: 1.45;
  }
  .rules {
    background: var(--surface-2);
    border-color: transparent;
  }
  .avoid {
    margin: 10px 0 0;
    line-height: 1.45;
  }
  .delicate {
    margin: 8px 0 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--text-muted);
  }
  dl {
    margin: 0;
  }
  dt {
    font-weight: 600;
    margin-top: 8px;
  }
  dt:first-child {
    margin-top: 0;
  }
  dd {
    margin: 2px 0 0;
    line-height: 1.45;
  }
  .search {
    display: block;
  }
  .search .input {
    width: 100%;
  }
  .intro {
    margin-top: -4px;
  }
  .sym-row {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 10px 12px;
  }
  .sym-row + .sym-row {
    border-top: 1px solid var(--border);
  }
  .sym-row .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sym-row .sub {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .chip-tag {
    align-self: flex-start;
    margin-top: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .foot {
    margin-top: 12px;
  }
  .section-title {
    margin-top: 10px;
  }
</style>
