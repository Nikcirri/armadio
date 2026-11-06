<script lang="ts">
  /** Pallini di colore di una palette (la fantasia è un pallino multicolore). Solo decorativi. */
  let { swatches, patterns = [], size = 16 }: { swatches: readonly string[]; patterns?: readonly number[]; size?: number } = $props();
</script>

<span class="dots" aria-hidden="true">
  {#each swatches as hex, i (i)}
    <span class="dot" class:pattern={patterns.includes(i)} style:width="{size}px" style:height="{size}px" style:background={patterns.includes(i) ? undefined : hex}></span>
  {/each}
</span>

<style>
  .dots {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .dot {
    flex: none;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.18);
  }
  .dot.pattern {
    background: conic-gradient(#c62f2f, #e9c93b, #3f8f4f, #5b7fae, #7a4a9e, #c62f2f);
  }
</style>
