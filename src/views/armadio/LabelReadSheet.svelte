<script lang="ts" module>
  import type { WashTag } from '../../lib/db/types';
  import type { Img } from '../../lib/logic/imageOps';

  /** Cosa usare dell'etichetta letta (solo le voci spuntate). */
  export interface LabelChoice {
    brand: string | null;
    size: string | null;
    fabrics: string[];
    composition: string | null;
    washTags: WashTag[];
    photo: Img | null;
  }
</script>

<script lang="ts">
  import { hasFindings, readCareLabel, type LabelReading } from '../../lib/logic/careLabel';
  import { WASH_TAGS } from '../../lib/logic/labels';
  import { chooseFromGallery, takePhoto } from '../../lib/media/acquire';
  import { decodeBlob } from '../../lib/media/pipeline';
  import { readText } from '../../lib/media/vision';
  import { reportError } from '../../lib/errors';
  import { withBusy } from '../../lib/state/ui.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import Sheet from '../../lib/ui/Sheet.svelte';
  import Switch from '../../lib/ui/Switch.svelte';

  /** "Leggi l'etichetta" (SPEC.md, sezione 8.1): foto dell'etichetta interna, poi cosa ho trovato. */
  let {
    ownBrands,
    fabricList,
    canAddPhoto,
    onapply,
    onclose,
  }: {
    ownBrands: string[];
    fabricList: string[];
    canAddPhoto: boolean;
    onapply: (choice: LabelChoice) => void;
    onclose: () => void;
  } = $props();

  /** Per l'OCR la foto resta grande: le scritte delle etichette sono piccole. */
  const READ_SIDE = 2400;

  let reading = $state.raw<LabelReading | null>(null);
  let photo = $state.raw<Img | null>(null);
  let use = $state({ brand: false, size: true, fabrics: true, composition: true, wash: true, photo: true });

  const found = $derived(reading ? hasFindings(reading) : false);
  const washLabels = $derived(reading ? reading.washTags.map((t) => WASH_TAGS.find((w) => w.id === t)?.label ?? t).join(', ') : '');

  async function read(source: 'camera' | 'gallery') {
    try {
      const blob = source === 'camera' ? await takePhoto() : ((await chooseFromGallery(false))[0] ?? null);
      if (!blob) return;
      const result = await withBusy('Leggo l’etichetta…', async () => {
        const img = await decodeBlob(blob, READ_SIDE);
        return { img, reading: readCareLabel(await readText(img), ownBrands, fabricList) };
      });
      photo = result.img;
      reading = result.reading;
      use = { brand: !!result.reading.brand?.sure, size: true, fabrics: true, composition: true, wash: true, photo: canAddPhoto };
    } catch (e) {
      reportError(e, 'Non sono riuscito a leggere l’etichetta.');
    }
  }

  function apply() {
    const r = reading;
    if (!r) return;
    onapply({
      brand: use.brand && r.brand ? r.brand.value : null,
      size: use.size ? r.size : null,
      fabrics: use.fabrics ? r.fabrics : [],
      composition: use.composition ? r.composition : null,
      washTags: use.wash ? r.washTags : [],
      photo: use.photo && canAddPhoto ? photo : null,
    });
  }
</script>

<Sheet title="Leggi l’etichetta" {onclose}>
  {#if !reading}
    <p class="note first">
      Fotografa l’etichetta interna del capo, quella con tessuto e lavaggio (o quella con marca e taglia). Leggo marca, taglia, tessuto e le
      istruzioni di lavaggio scritte. I simboli disegnati non li leggo: quelli li tocchi tu nella scheda.
    </p>
    <ul class="tips">
      <li>Etichetta distesa e ben illuminata, senza flash.</li>
      <li>Avvicinati finché le scritte riempiono la foto, ma restano a fuoco.</li>
      <li>Se ci sono più etichette, fai una foto alla volta.</li>
    </ul>
    <div class="sources">
      <button class="btn btn-primary" onclick={() => read('camera')}><Icon name="camera" size={20} /> Scatta foto</button>
      <button class="btn" onclick={() => read('gallery')}><Icon name="image" size={20} /> Dalla galleria</button>
    </div>
  {:else}
    {#if !found}
      <p class="warning first">
        Non ho trovato dati utili. Prova con più luce, con l’etichetta ben distesa e a fuoco, oppure fotografa l’altra etichetta.
      </p>
    {:else}
      <p class="note first">Ecco cosa ho letto. Togli la spunta a quello che non va: poi ricordati di salvare la scheda.</p>
    {/if}
    <div class="list">
      {#if reading.brand}
        <Switch
          label="Marca: {reading.brand.value}"
          description={reading.brand.sure ? 'Riconosciuta' : 'Non sono sicuro: è la scritta più grande'}
          checked={use.brand}
          onchange={(v) => (use.brand = v)}
        />
      {/if}
      {#if reading.size}
        <Switch label="Taglia: {reading.size}" checked={use.size} onchange={(v) => (use.size = v)} />
      {/if}
      {#if reading.fabrics.length}
        <Switch label="Tessuto: {reading.fabrics.join(', ')}" description="Si aggiunge ai tessuti del capo" checked={use.fabrics} onchange={(v) => (use.fabrics = v)} />
      {/if}
      {#if reading.composition}
        <Switch label="Composizione: {reading.composition}" description="Si aggiunge alle note" checked={use.composition} onchange={(v) => (use.composition = v)} />
      {/if}
      {#if reading.washTags.length}
        <Switch label="Lavaggio: {washLabels}" description="Si aggiunge alle etichette di lavaggio" checked={use.wash} onchange={(v) => (use.wash = v)} />
      {/if}
      {#if canAddPhoto}
        <Switch label="Aggiungi la foto dell’etichetta" description="Tra le foto del capo, per rivedere i simboli" checked={use.photo} onchange={(v) => (use.photo = v)} />
      {/if}
    </div>
    {#if reading.text}
      <details class="raw">
        <summary>Testo letto</summary>
        <pre>{reading.text}</pre>
      </details>
    {/if}
    <div class="sources again">
      <button class="btn" onclick={() => read('camera')}><Icon name="camera" size={20} /> Rifai la foto</button>
      <button class="btn btn-ghost" onclick={() => read('gallery')}><Icon name="image" size={20} /> Dalla galleria</button>
    </div>
  {/if}

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={!reading || (!found && !(reading.brand && use.brand) && !(use.photo && canAddPhoto))} onclick={apply}>
      Usa questi dati
    </button>
  {/snippet}
</Sheet>

<style>
  .tips {
    margin: 0 0 16px;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    line-height: 1.45;
  }
  .sources {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .again {
    margin-top: 16px;
  }
  .raw {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .raw summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 32px;
    display: flex;
    align-items: center;
  }
  .raw pre {
    margin: 8px 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-muted);
  }
</style>
