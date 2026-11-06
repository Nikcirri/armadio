<script lang="ts">
  import { addPerson, suggestPeople } from '../../lib/logic/outfits';
  import Icon from '../../lib/ui/Icon.svelte';

  /** Persone come chip, con completamento dai nomi già usati nel diario. */
  let { value, known, onchange }: { value: string[]; known: readonly string[]; onchange: (people: string[]) => void } = $props();

  let typed = $state('');
  const suggestions = $derived(suggestPeople(known, typed, value));

  function add(name: string) {
    onchange(addPerson(value, name));
    typed = '';
  }

  function onKey(e: KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && typed.trim()) {
      e.preventDefault();
      add(typed);
    }
  }
</script>

<div class="people">
  {#if value.length}
    <ul class="chosen">
      {#each value as p (p)}
        <li>
          <span>{p}</span>
          <button aria-label="Togli {p}" onclick={() => onchange(value.filter((x) => x !== p))}><Icon name="close" size={16} /></button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="add">
    <input class="input" placeholder="Scrivi un nome…" bind:value={typed} onkeydown={onKey} enterkeyhint="done" autocomplete="off" />
    <button class="btn" disabled={!typed.trim()} onclick={() => add(typed)}>Aggiungi</button>
  </div>
  {#if suggestions.length}
    <div class="suggest" aria-label="Nomi già usati">
      {#each suggestions as s (s)}
        <button class="chip" onclick={() => add(s)}>+ {s}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .people {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chosen {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chosen li {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding-left: 12px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .chosen button {
    width: 36px;
    height: 36px;
    border: 0;
    background: none;
    color: inherit;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .add {
    display: flex;
    gap: 8px;
  }
  .add .btn {
    flex: none;
    padding: 0 16px;
  }
  .suggest {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.875rem;
    cursor: pointer;
  }
</style>
