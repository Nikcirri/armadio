<script lang="ts">
  import type { SymbolShape } from '../../../lib/logic/careGuide';

  /** Un simbolo dell'etichetta di lavaggio, disegnato a linee (SPEC.md, sezione 8.8). */
  let { shape, size = 48 }: { shape: SymbolShape; size?: number } = $props();

  const dots = $derived(Array.from({ length: shape.dots ?? 0 }, (_, i) => i));
  const bars = $derived(Array.from({ length: shape.bars ?? 0 }, (_, i) => i));
</script>

<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" class="sym">
  {#if shape.base === 'wash' || shape.base === 'hand'}
    <path d="M6 14 L10 36 H38 L42 14" />
    <path d="M6 14 q4.5 -4 9 0 t9 0 t9 0 t9 0" />
    {#if shape.base === 'hand'}
      <path d="M18 31 v-7 a1.6 1.6 0 0 1 3.2 0 v3 m0 -5 a1.6 1.6 0 0 1 3.2 0 v5 m0 -4 a1.6 1.6 0 0 1 3.2 0 v6 q0 4 -4.5 4 h-2.5 q-3 0 -4.6 -3 l-1.6 -3 a1.4 1.4 0 0 1 2.4 -1.4 z" class="thin" />
    {:else if shape.temp}
      <text x="24" y="29.5" text-anchor="middle">{shape.temp}</text>
    {/if}
    {#each bars as i (i)}
      <path d={`M9 ${41 + i * 4} H39`} class="thin" />
    {/each}
  {:else if shape.base === 'bleach' || shape.base === 'bleachOxygen'}
    <path d="M24 7 L43 39 H5 Z" />
    {#if shape.base === 'bleachOxygen'}
      <path d="M17 34 L24 21 M23 34 L30 21" class="thin" />
    {/if}
  {:else if shape.base === 'dryer' || shape.base === 'dryFlat' || shape.base === 'dryLine'}
    <rect x="7" y="7" width="34" height="34" rx="2" />
    {#if shape.base === 'dryer'}
      <circle cx="24" cy="24" r="12" />
      {#each dots as i (i)}
        <circle cx={24 + (i - (dots.length - 1) / 2) * 7} cy="24" r="2" class="dot" />
      {/each}
    {:else if shape.base === 'dryFlat'}
      <path d="M13 24 H35" />
    {:else}
      <path d="M24 13 V35" />
    {/if}
  {:else if shape.base === 'iron'}
    <path d="M6 36 H42 L40 27 Q38 19 30 19 H17 Q10 19 8 27 Z" />
    <path d="M14 19 Q15 12 22 12 H34" />
    {#each dots as i (i)}
      <circle cx={24 + (i - (dots.length - 1) / 2) * 7} cy="29" r="2" class="dot" />
    {/each}
  {:else if shape.base === 'pro'}
    <circle cx="24" cy="24" r="16" />
    {#if shape.letter}
      <text x="24" y="29.5" text-anchor="middle">{shape.letter}</text>
    {/if}
  {/if}
  {#if shape.crossed}
    <path d="M8 8 L40 40 M40 8 L8 40" />
  {/if}
</svg>

<style>
  .sym {
    flex: none;
    color: var(--text);
  }
  .sym :global(path),
  .sym :global(rect),
  .sym :global(circle) {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sym :global(.thin) {
    stroke-width: 2;
  }
  .sym :global(.dot) {
    fill: currentColor;
    stroke: none;
  }
  .sym text {
    fill: currentColor;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
  }
</style>
