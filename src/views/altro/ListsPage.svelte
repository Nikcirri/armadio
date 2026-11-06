<script lang="ts">
  import { db } from '../../lib/db';
  import { addListEntry, deleteListEntry, listEntryUsage, moveListEntry, renameListEntry, restoreListDeletion } from '../../lib/db/altro';
  import type { ListRecord } from '../../lib/db/types';
  import { isProtected, LIST_KINDS, type EditableKind } from '../../lib/logic/lists';
  import { live } from '../../lib/state/live.svelte';
  import { confirmDialog, showToast, showUndoToast } from '../../lib/state/ui.svelte';
  import { errorText, reportError } from '../../lib/errors';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import TemplatesSheet from '../agenda/TemplatesSheet.svelte';

  /** Categorie e liste (SPEC 8.5). */
  let { onclose, oncategories }: { onclose: () => void; oncategories: () => void } = $props();

  const lists = live(() => db.lists.toArray(), [] as ListRecord[]);
  let open = $state<EditableKind | null>(null);
  let newName = $state('');
  let renaming = $state<ListRecord | null>(null);
  let renameText = $state('');
  let templates = $state(false);

  const entries = (kind: EditableKind) => lists.value.filter((l) => l.kind === kind).sort((a, b) => a.order - b.order);

  async function add(kind: EditableKind) {
    try {
      await addListEntry(db, kind, newName);
      newName = '';
    } catch (e) {
      showToast(errorText(e));
    }
  }

  async function rename() {
    if (!renaming) return;
    try {
      await renameListEntry(db, renaming.id, renameText);
      renaming = null;
      showToast('Nome cambiato');
    } catch (e) {
      showToast(errorText(e));
    }
  }

  async function remove(entry: ListRecord) {
    const used = await listEntryUsage(db, entry).catch(() => 0);
    const what =
      entry.kind === 'owner'
        ? 'I suoi capi passano a “Mio”.'
        : entry.kind === 'location'
          ? 'I capi che sono lì passano all’Armadio principale.'
          : entry.kind === 'occasion'
            ? 'Viene tolta da capi, outfit e wishlist.'
            : 'Nei capi resta scritto, ma non viene più suggerito.';
    const ok = await confirmDialog({
      title: `Eliminare “${entry.name}”?`,
      message: `${used ? `È usata in ${used === 1 ? '1 capo' : `${used} capi`}. ` : ''}${what}`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      const snap = await deleteListEntry(db, entry.id);
      showUndoToast(`“${entry.name}” eliminata`, () => restoreListDeletion(db, snap));
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Page title="Categorie e liste" {onclose}>
  <div class="list">
    <button class="row" onclick={oncategories}>
      <span class="grow">Categorie<span class="sub">Tipi di capo, lavaggi e ingombro in valigia</span></span>
      <Icon name="chevron" size={18} />
    </button>
    <button class="row" onclick={() => (templates = true)}>
      <span class="grow">Template valigia<span class="sub">Il necessaire dei viaggi</span></span>
      <Icon name="chevron" size={18} />
    </button>
  </div>

  {#each LIST_KINDS as k (k.kind)}
    {@const list = entries(k.kind)}
    <h2 class="section-title">{k.label}</h2>
    <div class="list">
      <button class="row head" aria-expanded={open === k.kind} onclick={() => ((open = open === k.kind ? null : k.kind), (newName = ''))}>
        <span class="grow">
          {list.length ? list.map((l) => l.name).join(', ') : 'Nessuna voce'}
          <span class="sub">{k.hint}</span>
        </span>
        <Icon name={open === k.kind ? 'up' : 'down'} size={18} />
      </button>
      {#if open === k.kind}
        {#each list as e, i (e.id)}
          <div class="row entry">
            <button class="grow plain" onclick={() => ((renaming = e), (renameText = e.name))}>
              {e.name}
              {#if isProtected(e)}<span class="sub">🔒 serve all’app: si può solo rinominare</span>{/if}
            </button>
            <button class="icon-btn" aria-label="Sposta su {e.name}" disabled={i === 0} onclick={() => moveListEntry(db, e.id, -1).catch(reportError)}><Icon name="up" size={20} /></button>
            <button class="icon-btn" aria-label="Sposta giù {e.name}" disabled={i === list.length - 1} onclick={() => moveListEntry(db, e.id, 1).catch(reportError)}><Icon name="down" size={20} /></button>
            <button class="icon-btn" aria-label="Elimina {e.name}" disabled={isProtected(e)} onclick={() => remove(e)}><Icon name="trash" size={20} /></button>
          </div>
        {/each}
        <form class="row add" onsubmit={(ev) => (ev.preventDefault(), add(k.kind))}>
          <input class="input" bind:value={newName} placeholder="Nuov{k.singular === 'tag' || k.singular === 'tessuto' || k.singular === 'proprietario' ? 'o' : 'a'} {k.singular}" />
          <button class="btn" type="submit" disabled={!newName.trim()}>Aggiungi</button>
        </form>
      {/if}
    </div>
  {/each}
</Page>

{#if renaming}
  <Sheet title="Rinomina" onclose={() => (renaming = null)}>
    <label class="field">
      <span>Nome</span>
      <input class="input" bind:value={renameText} maxlength="40" />
    </label>
    {#if renaming.kind === 'fabric' || renaming.kind === 'maintenance' || renaming.kind === 'person'}
      <p class="note">Il nome cambia anche nei capi{renaming.kind === 'person' ? ' e nei ricordi del diario' : ''}.</p>
    {/if}
    {#snippet footer()}
      <button class="btn btn-ghost" onclick={() => (renaming = null)}>Annulla</button>
      <button class="btn btn-primary" disabled={!renameText.trim()} onclick={rename}>Salva</button>
    {/snippet}
  </Sheet>
{/if}

{#if templates}
  <TemplatesSheet onclose={() => (templates = false)} />
{/if}

<style>
  .head .grow {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .entry {
    cursor: default;
    gap: 0;
    padding-right: 4px;
  }
  .plain {
    border: 0;
    background: none;
    text-align: left;
    padding: 0;
    cursor: pointer;
  }
  .add {
    cursor: default;
    gap: 8px;
  }
  .add .btn {
    flex: none;
    padding: 0 14px;
  }
</style>
