<script lang="ts">
  import Sheet from './Sheet.svelte';

  let {
    title,
    options,
    empty = 'Niente da scegliere.',
    note,
    onpick,
    onclose,
  }: {
    title: string;
    options: { id: string; label: string; sub?: string; emoji?: string }[];
    empty?: string;
    note?: string;
    onpick: (id: string) => void;
    onclose: () => void;
  } = $props();
</script>

<Sheet {title} {onclose}>
  {#if note}<p class="note first">{note}</p>{/if}
  {#if options.length}
    <div class="list">
      {#each options as o (o.id)}
        <button class="row" onclick={() => onpick(o.id)}>
          {#if o.emoji}<span class="emoji" aria-hidden="true">{o.emoji}</span>{/if}
          <span class="grow">{o.label}{#if o.sub}<span class="sub">{o.sub}</span>{/if}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="note">{empty}</p>
  {/if}
</Sheet>

<style>
  .first {
    margin-top: 0;
    margin-bottom: 12px;
  }
  .emoji {
    font-size: 1.3rem;
    width: 30px;
    text-align: center;
  }
</style>
