<script lang="ts">
  let {
    checked,
    label,
    description,
    onchange,
    disabled = false,
  }: {
    checked: boolean;
    label: string;
    description?: string;
    onchange: (value: boolean) => void;
    disabled?: boolean;
  } = $props();
</script>

<label class="row switch-row" class:disabled>
  <span class="grow">
    {label}
    {#if description}<span class="sub">{description}</span>{/if}
  </span>
  <input
    type="checkbox"
    role="switch"
    {checked}
    {disabled}
    onchange={(e) => onchange((e.currentTarget as HTMLInputElement).checked)}
  />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
</label>

<style>
  .switch-row {
    cursor: pointer;
  }
  .disabled {
    opacity: 0.5;
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    flex: none;
    width: 52px;
    height: 32px;
    border-radius: 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    position: relative;
    transition: background 150ms ease;
  }
  .thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: transform 150ms ease, background 150ms ease;
  }
  input:checked + .track {
    background: var(--accent);
    border-color: var(--accent);
  }
  input:checked + .track .thumb {
    transform: translateX(20px);
    background: var(--accent-contrast);
  }
  input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
