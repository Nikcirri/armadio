<script lang="ts">
  import type { Swatch } from '../../../lib/logic/armocromia';
  import { tapFeedback } from '../../../lib/platform';

  /** "Prova i colori": il viso circondato dal colore scelto, come il telo delle consulenti. */
  let { cropUrl, groups }: { cropUrl: string; groups: readonly { label: string; swatches: readonly Swatch[] }[] } = $props();

  // svelte-ignore state_referenced_locally
  let current = $state<Swatch>(groups[0]?.swatches[0] ?? { name: 'Bianco', hex: '#FFFFFF' });

  function pick(s: Swatch) {
    current = s;
    void tapFeedback();
  }
</script>

<div class="drape" style:background={current.hex}>
  <img src={cropUrl} alt="Il tuo viso con intorno il colore {current.name}" />
</div>
<p class="current" aria-live="polite">{current.name}</p>
<p class="note">Guarda la pelle: con i colori giusti sembra più luminosa e uniforme, con quelli sbagliati compaiono occhiaie e ombre.</p>
{#each groups as g (g.label)}
  <p class="group">{g.label}</p>
  <div class="swatches" role="radiogroup" aria-label={g.label}>
    {#each g.swatches as s (s.hex + s.name)}
      <button
        class="sw"
        role="radio"
        aria-checked={current.hex === s.hex && current.name === s.name}
        aria-label={s.name}
        title={s.name}
        style:background={s.hex}
        onclick={() => pick(s)}
      ></button>
    {/each}
  </div>
{/each}

<style>
  .drape {
    display: grid;
    place-items: center;
    padding: 28px 28px 0;
    border-radius: var(--radius);
    transition: background 160ms ease;
  }
  .drape img {
    display: block;
    width: 72%;
    max-width: 280px;
    aspect-ratio: 3 / 4;
    object-fit: cover;
    border-radius: 50% 50% 42% 42% / 40% 40% 60% 60%;
    box-shadow: 0 0 0 3px rgb(255 255 255 / 0.25);
  }
  .current {
    margin: 8px 0 0;
    text-align: center;
    font-weight: 600;
  }
  .group {
    margin: 14px 0 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sw {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.2);
    cursor: pointer;
  }
  .sw[aria-checked='true'] {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
