<script lang="ts">
  import { db } from '../../lib/db';
  import { addCategory, deleteCategory, updateCategory } from '../../lib/db/repo';
  import type { CategoryRecord, SlotType } from '../../lib/db/types';
  import { SLOTS, slotInfo } from '../../lib/logic/slots';
  import { confirmDialog, showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import { tapFeedback } from '../../lib/platform';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';

  let {
    category,
    categories,
    itemCount,
    onclose,
  }: {
    category: CategoryRecord | null;
    categories: CategoryRecord[];
    itemCount: number;
    onclose: () => void;
  } = $props();

  const ICONS = ['👕', '👚', '👔', '🧶', '🧥', '🥼', '👖', '🩳', '👗', '🩱', '👘', '🥻', '👟', '👞', '👠', '🥿', '🥾', '👡', '🩴', '👜', '🎒', '👛', '🧣', '🧤', '🧢', '👒', '🎩', '🕶️', '💍', '⌚', '➰', '🩲', '🧦', '🩰'];

  // svelte-ignore state_referenced_locally
  const initial = category;
  let name = $state(initial?.name ?? '');
  let icon = $state(initial?.icon ?? '👕');
  let slotType = $state<SlotType>(initial?.slotType ?? 'top_base');
  let washByUses = $state((initial ? initial.defaultMaxWears : slotInfo('top_base').defaultMaxWears) !== null);
  let maxWears = $state(initial?.defaultMaxWears ?? slotInfo('top_base').defaultMaxWears ?? 1);
  let bulkWeight = $state(initial?.bulkWeight ?? slotInfo('top_base').bulkWeight);
  let moveTo = $state('');

  const others = $derived(categories.filter((c) => c.id !== initial?.id));
  const valid = $derived(name.trim().length > 0);

  function changeSlot(next: SlotType) {
    slotType = next;
    if (!initial) {
      const info = slotInfo(next);
      washByUses = info.defaultMaxWears !== null;
      maxWears = info.defaultMaxWears ?? 1;
      bulkWeight = info.bulkWeight;
    }
  }

  async function save() {
    if (!valid) return;
    const patch = {
      name: name.trim(),
      icon,
      slotType,
      defaultMaxWears: washByUses ? Math.max(1, Math.round(maxWears)) : null,
      bulkWeight: Math.max(1, Math.round(bulkWeight)),
    };
    try {
      if (initial) await updateCategory(db, initial.id, patch);
      else await addCategory(db, patch);
      void tapFeedback();
      showToast(initial ? 'Categoria salvata' : 'Categoria aggiunta');
      onclose();
    } catch (e) {
      reportError(e);
    }
  }

  async function remove() {
    if (!initial) return;
    if (itemCount > 0 && !moveTo) {
      showToast('Scegli prima dove spostare i capi');
      return;
    }
    const target = others.find((c) => c.id === moveTo);
    const ok = await confirmDialog({
      title: `Eliminare “${initial.name}”?`,
      message: itemCount > 0 ? `I suoi ${itemCount} capi passeranno in “${target?.name}”.` : undefined,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCategory(db, initial.id, itemCount > 0 ? moveTo : null);
      showToast('Categoria eliminata');
      onclose();
    } catch (e) {
      reportError(e);
    }
  }
</script>

<Sheet title={initial ? 'Modifica categoria' : 'Nuova categoria'} {onclose}>
  <div class="form">
    <label class="field">
      <span>Nome</span>
      <input class="input" bind:value={name} maxlength="32" placeholder="Es. Camicie di lino" />
    </label>

    <div class="field">
      <span>Icona</span>
      <div class="icons" role="radiogroup" aria-label="Icona">
        {#each ICONS as i (i)}
          <button class="ic" role="radio" aria-checked={icon === i} onclick={() => (icon = i)}>{i}</button>
        {/each}
      </div>
    </div>

    <label class="field">
      <span>Tipo di capo</span>
      <select class="input" value={slotType} onchange={(e) => changeSlot(e.currentTarget.value as SlotType)}>
        {#each SLOTS as s (s.id)}
          <option value={s.id}>{s.label}</option>
        {/each}
      </select>
    </label>

    <div class="list">
      <Switch
        label="Si lava dopo un certo numero di utilizzi"
        description="Spento per scarpe e accessori."
        checked={washByUses}
        onchange={(v) => (washByUses = v)}
      />
    </div>
    {#if washByUses}
      <label class="field">
        <span>Utilizzi prima del lavaggio</span>
        <input class="input" type="number" inputmode="numeric" min="1" max="50" bind:value={maxWears} />
      </label>
    {/if}
    <label class="field">
      <span>Ingombro in valigia (punti)</span>
      <input class="input" type="number" inputmode="numeric" min="1" max="10" bind:value={bulkWeight} />
    </label>

    {#if initial}
      <h3 class="section-title">Elimina</h3>
      {#if itemCount > 0}
        <label class="field">
          <span>Questa categoria ha {itemCount} capi. Spostali in:</span>
          <select class="input" bind:value={moveTo}>
            <option value="" disabled>Scegli una categoria</option>
            {#each others as c (c.id)}
              <option value={c.id}>{c.icon} {c.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      <button class="btn btn-danger" onclick={remove}>Elimina categoria</button>
    {/if}
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={!valid} onclick={save}>Salva</button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 6px;
  }
  .ic {
    height: 48px;
    border-radius: 12px;
    border: 2px solid transparent;
    background: var(--surface-2);
    font-size: 1.5rem;
    cursor: pointer;
  }
  .ic[aria-checked='true'] {
    border-color: var(--accent);
  }
  h3.section-title {
    margin-bottom: 0;
  }
</style>
