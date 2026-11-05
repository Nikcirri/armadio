<script lang="ts" generics="T extends string">
  let {
    options,
    value,
    onchange,
    single = false,
    allowNone = true,
    label,
  }: {
    options: readonly { id: T; label: string; emoji?: string; color?: string }[];
    value: T[];
    onchange: (value: T[]) => void;
    /** Una sola scelta alla volta. */
    single?: boolean;
    /** Con `single`: toccando la scelta attiva la si toglie. */
    allowNone?: boolean;
    label?: string;
  } = $props();

  function toggle(id: T) {
    const on = value.includes(id);
    if (single) {
      if (on) {
        if (allowNone) onchange([]);
      } else onchange([id]);
      return;
    }
    onchange(on ? value.filter((v) => v !== id) : [...value, id]);
  }
</script>

<div class="chips" role="group" aria-label={label}>
  {#each options as o (o.id)}
    <button class="chip" class:on={value.includes(o.id)} aria-pressed={value.includes(o.id)} onclick={() => toggle(o.id)}>
      {#if o.color}<span class="dot" style:background={o.color}></span>{/if}
      {#if o.emoji}<span aria-hidden="true">{o.emoji}</span>{/if}
      {o.label}
    </button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .chip.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    color: var(--text);
    font-weight: 600;
  }
  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.15);
  }
</style>
