<script lang="ts">
  import { db } from '../../lib/db';
  import type { ListRecord } from '../../lib/db/types';
  import { ruleText } from '../../lib/logic/agenda';
  import { live } from '../../lib/state/live.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import TemplateEditSheet from './TemplateEditSheet.svelte';

  /** Template della valigia (SPEC 8.4): precompilano il necessaire dei nuovi viaggi. */
  let { onclose }: { onclose: () => void } = $props();

  const templates = live(() => db.lists.where('kind').equals('packingTemplate').sortBy('order'), [] as ListRecord[]);
  let editing = $state<{ template: ListRecord | null } | null>(null);
</script>

<Sheet title="Template valigia" {onclose}>
  <p class="note first">Scegli un template quando crei un viaggio: il necessaire si compila da solo, con le quantità giuste per i giorni.</p>
  <div class="list">
    {#each templates.value as t (t.id)}
      {@const es = t.extra.essentials ?? []}
      <button class="row" onclick={() => (editing = { template: $state.snapshot(t) as ListRecord })}>
        <span class="grow">
          {t.name}
          <span class="sub">{es.length ? es.map((e) => `${e.label} (${ruleText(e)})`).join(', ') : 'Nessuna voce'}</span>
        </span>
        <Icon name="chevron" size={18} />
      </button>
    {/each}
  </div>
  <button class="btn btn-block add" onclick={() => (editing = { template: null })}><Icon name="plus" size={20} /> Nuovo template</button>

  {#snippet footer()}
    <button class="btn btn-block" onclick={onclose}>Chiudi</button>
  {/snippet}
</Sheet>

{#if editing}
  <TemplateEditSheet template={editing.template} onclose={() => (editing = null)} />
{/if}

<style>
  .first {
    margin: 0 4px 12px;
  }
  .sub {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .add {
    margin-top: 10px;
  }
</style>
