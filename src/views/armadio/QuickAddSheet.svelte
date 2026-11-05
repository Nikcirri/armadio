<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../../lib/db';
  import { addItem, deleteItemsHard } from '../../lib/db/items';
  import type { CategoryRecord, ColorId } from '../../lib/db/types';
  import type { Img } from '../../lib/logic/imageOps';
  import { colorsOf } from '../../lib/media/pipeline';
  import { storePhoto } from '../../lib/media/photos';
  import { showUndoToast, withBusy } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import { tapFeedback } from '../../lib/platform';
  import { canvasView } from '../../lib/ui/canvasView';
  import CategorySelect from '../../lib/ui/CategorySelect.svelte';
  import ColorChips from '../../lib/ui/ColorChips.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import { getLastCategoryId, setLastCategoryId } from './lastCategory';

  let {
    img,
    categories,
    onclose,
    onedit,
  }: { img: Img; categories: CategoryRecord[]; onclose: () => void; onedit: () => void } = $props();

  let name = $state('');
  // svelte-ignore state_referenced_locally
  const last = getLastCategoryId();
  // svelte-ignore state_referenced_locally
  let categoryId = $state(categories.find((c) => c.id === last)?.id ?? categories[0]?.id ?? '');
  let colors = $state<ColorId[]>([]);
  let detected = $state<ColorId[]>([]);
  let touched = false;

  onMount(() => {
    colorsOf(img)
      .then((c) => {
        detected = c;
        if (!touched) colors = c;
      })
      .catch(() => undefined);
  });

  async function save() {
    if (!categoryId) return;
    try {
      const item = await withBusy('Salvo il capo…', async () => {
        const photoId = await storePhoto(img);
        return addItem(db, { name, categoryId, colors: [...colors], photoIds: [photoId] });
      });
      setLastCategoryId(categoryId);
      void tapFeedback();
      showUndoToast(`“${item.name}” aggiunto all’armadio`, () => deleteItemsHard(db, [item.id]));
      onclose();
    } catch (e) {
      reportError(e, 'Non sono riuscito a salvare il capo.');
    }
  }
</script>

<Sheet title="Nuovo capo" {onclose}>
  <div class="layout">
    <button class="preview" aria-label="Modifica di nuovo la foto" onclick={onedit} use:canvasView={img}></button>
    <p class="note center">Tocca la foto per modificarla di nuovo.</p>

    <label class="field">
      <span>Nome</span>
      <input class="input" bind:value={name} placeholder="Es. Jeans blu a vita alta" maxlength="60" />
    </label>

    <CategorySelect {categories} value={categoryId} onchange={(id) => (categoryId = id)} />

    <div class="field">
      <span>Colori {detected.length ? '(rilevati dalla foto, puoi cambiarli)' : ''}</span>
      <ColorChips
        value={colors}
        {detected}
        onchange={(c) => {
          touched = true;
          colors = c;
        }}
      />
    </div>
    <p class="note">Tutti gli altri dettagli (tessuto, stagione, prezzo…) li aggiungerai nella scheda del capo.</p>
  </div>

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={!categoryId} onclick={save}>Aggiungi</button>
  {/snippet}
</Sheet>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .preview {
    align-self: center;
    width: 180px;
    height: 240px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background-color: #fff;
    background-image: conic-gradient(#e4e4e4 25%, #fff 0 50%, #e4e4e4 0 75%, #fff 0);
    background-size: 14px 14px;
    cursor: pointer;
  }
  .center {
    text-align: center;
    margin-top: -8px;
  }
</style>
