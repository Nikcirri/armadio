<script lang="ts">
  import type { SeasonId } from '../../../lib/db/types';
  import { FAMILY_LABEL, SEASONS, type SeasonFamily } from '../../../lib/logic/armocromia';
  import PaletteDots from '../../../lib/ui/PaletteDots.svelte';
  import Sheet from '../../../lib/ui/Sheet.svelte';

  /** "Conosco già la mia stagione": le 12 stagioni divise per famiglia. */
  let { current, onpick, onclose }: { current: SeasonId | null; onpick: (season: SeasonId) => void; onclose: () => void } = $props();

  const FAMILIES: SeasonFamily[] = ['spring', 'summer', 'autumn', 'winter'];
</script>

<Sheet title="Scegli la tua stagione" {onclose}>
  {#each FAMILIES as fam (fam)}
    <h3 class="section-title">{FAMILY_LABEL[fam]}</h3>
    <div class="list" role="radiogroup" aria-label={FAMILY_LABEL[fam]}>
      {#each SEASONS.filter((s) => s.family === fam) as s (s.id)}
        <button class="row" role="radio" aria-checked={current === s.id} onclick={() => onpick(s.id)}>
          <span class="grow">
            {s.name} <span class="en">· {s.english}</span>
            <span class="sub">{s.description}</span>
            <span class="dots"><PaletteDots swatches={s.best.slice(0, 8).map((x) => x.hex)} size={14} /></span>
          </span>
        </button>
      {/each}
    </div>
  {/each}
  {#snippet footer()}
    <button class="btn btn-block" onclick={onclose}>Annulla</button>
  {/snippet}
</Sheet>

<style>
  .en {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .dots {
    display: block;
    margin-top: 6px;
  }
</style>
