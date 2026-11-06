<script lang="ts">
  import { addDays, formatDateIt, todayKey } from '../../lib/logic/util';
  import Sheet from '../../lib/ui/Sheet.svelte';

  /** "Indossa in un'altra data": un giorno passato (non nel futuro). */
  let { onpick, onclose }: { onpick: (date: string) => void; onclose: () => void } = $props();

  const today = todayKey();
  let date = $state(addDays(today, -1));
  const valid = $derived(/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
</script>

<Sheet title="Quando l’hai indossato?" {onclose}>
  <div class="quick">
    <button class="btn" onclick={() => onpick(addDays(today, -1))}>Ieri</button>
    <button class="btn" onclick={() => onpick(addDays(today, -2))}>L’altro ieri</button>
  </div>
  <label class="field">
    <span>Oppure scegli il giorno</span>
    <input class="input" type="date" max={today} bind:value={date} />
  </label>
  {#if valid}<p class="note">{formatDateIt(date)}</p>{/if}

  {#snippet footer()}
    <button class="btn btn-ghost" onclick={onclose}>Annulla</button>
    <button class="btn btn-primary" disabled={!valid} onclick={() => onpick(date)}>Segna come indossato</button>
  {/snippet}
</Sheet>

<style>
  .quick {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .quick .btn {
    flex: 1;
  }
</style>
