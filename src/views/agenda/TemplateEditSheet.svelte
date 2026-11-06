<script lang="ts">
  import { db } from '../../lib/db';
  import { deleteTemplate, restoreTemplate, saveTemplate } from '../../lib/db/agenda';
  import type { EssentialTemplateEntry, ListRecord } from '../../lib/db/types';
  import { ESSENTIAL_RULES } from '../../lib/logic/agenda';
  import { essentialQty } from '../../lib/logic/packing';
  import { confirmDialog, showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';

  /** Modifica un template del necessaire: nome e voci con la loro regola sui giorni. */
  let { template = null, onclose }: { template?: ListRecord | null; onclose: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(template?.name ?? '');
  // svelte-ignore state_referenced_locally
  let entries = $state<EssentialTemplateEntry[]>((template?.extra.essentials ?? []).map((e) => ({ ...e })));
  let saving = $state(false);

  function add() {
    entries = [...entries, { label: '', rule: 'fixed', qty: 1 }];
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await saveTemplate(db, { name, essentials: $state.snapshot(entries) }, template?.id ?? null);
      showToast('Template salvato');
      onclose();
    } catch (e) {
      reportError(e);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!template) return;
    const ok = await confirmDialog({
      title: `Eliminare “${template.name}”?`,
      message: 'I viaggi già creati tengono il loro necessaire.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      const removed = await deleteTemplate(db, template.id);
      onclose();
      showUndoToast('Template eliminato', () => restoreTemplate(db, removed));
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Sheet title={template ? 'Modifica template' : 'Nuovo template'} {onclose}>
  <label class="field">
    <span>Nome</span>
    <input class="input" bind:value={name} maxlength="40" placeholder="Es. Settimana bianca" />
  </label>

  <h3 class="section-title">Voci del necessaire</h3>
  <p class="note tight">Esempio per 3 giorni: “Giorni + 1” = 4, “Uno al giorno” = 3, “Quantità fissa” = sempre uguale.</p>
  <div class="entries">
    {#each entries as e, i (i)}
      <div class="entry card">
        <div class="top">
          <input class="input" bind:value={e.label} placeholder="Es. Calzini" aria-label="Voce {i + 1}" />
          <button class="icon-btn" aria-label="Togli la voce {e.label || i + 1}" onclick={() => (entries = entries.filter((_, j) => j !== i))}>
            <Icon name="trash" size={20} />
          </button>
        </div>
        <div class="bottom">
          <select class="input" bind:value={e.rule} aria-label="Regola">
            {#each ESSENTIAL_RULES as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
          </select>
          <span class="qty">
            <button class="mini" aria-label="Meno" disabled={e.qty <= 1} onclick={() => (e.qty = Math.max(1, e.qty - 1))}>−</button>
            <span>{e.qty}</span>
            <button class="mini" aria-label="Più" onclick={() => (e.qty += 1)}>+</button>
          </span>
        </div>
        <p class="note tiny">Per 3 giorni: {essentialQty(e, 3)}</p>
      </div>
    {/each}
  </div>
  <button class="btn btn-block" onclick={add}><Icon name="plus" size={20} /> Aggiungi una voce</button>
  {#if template}
    <button class="btn btn-danger btn-block remove" onclick={remove}><Icon name="trash" size={20} /> Elimina template</button>
  {/if}

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={saving} onclick={save}>Salva</button>
  {/snippet}
</Sheet>

<style>
  .tight {
    margin: 0 4px 10px;
  }
  .entries {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }
  .entry {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .top,
  .bottom {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .bottom select {
    flex: 1;
  }
  .qty {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .qty span {
    min-width: 24px;
    text-align: center;
    font-weight: 600;
  }
  .mini {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .mini:disabled {
    opacity: 0.4;
  }
  .tiny {
    margin: 0 2px;
    font-size: 0.75rem;
  }
  .remove {
    margin-top: 16px;
  }
</style>
