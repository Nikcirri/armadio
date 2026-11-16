<script lang="ts">
  import { db, tracker } from '../lib/db';
  import { completeOnboarding, setupNewWardrobe } from '../lib/db/repo';
  import type { FontId, PaletteId, Preset, ThemeMode } from '../lib/db/types';
  import { PRESETS } from '../lib/logic/presets';
  import { DEFAULT_FONT, DEFAULT_PALETTE } from '../lib/logic/theme';
  import { applyTheme, system } from '../lib/state/theme.svelte';
  import { registerOverlay, withBusy } from '../lib/state/ui.svelte';
  import { loadDemoData } from '../lib/demo';
  import { prepareRestore, type PreparedRestore } from '../lib/backup/service';
  import { reportError } from '../lib/errors';
  import { pickFile } from '../lib/ui/pickFile';
  import ThemePicker from '../lib/ui/ThemePicker.svelte';
  import RestoreSheet from '../lib/ui/RestoreSheet.svelte';
  import Icon from '../lib/ui/Icon.svelte';

  let step = $state(0);
  let userName = $state('');
  let preset = $state<Preset>('neutro');
  let palette = $state<PaletteId>(DEFAULT_PALETTE);
  let mode = $state<ThemeMode>('system');
  let font = $state<FontId>(DEFAULT_FONT);
  // $state.raw: i dati del backup vanno nel database così come sono (niente proxy reattivi).
  let restoring = $state.raw<PreparedRestore | null>(null);

  const STEPS = 4;

  $effect(() => {
    void system.prefersDark;
    applyTheme(palette, mode, font);
  });

  $effect(() => {
    if (step === 0) return;
    return registerOverlay(() => (step -= 1));
  });

  // Il primo avvio non conta come "modifiche" per il promemoria backup.
  const setup = () => tracker.withoutTracking(() => setupNewWardrobe(db, { preset, userName, palette, mode, font }));

  async function startEmpty() {
    try {
      await withBusy('Preparo il tuo armadio…', async () => {
        await setup();
        await completeOnboarding(db);
      });
    } catch (e) {
      reportError(e);
    }
  }

  async function startDemo() {
    try {
      await withBusy('Preparo l’esempio…', async () => {
        await setup();
        await loadDemoData();
        await completeOnboarding(db);
      });
    } catch (e) {
      reportError(e);
    }
  }

  async function startRestore() {
    const file = await pickFile();
    if (!file) return;
    try {
      restoring = await withBusy('Leggo il backup…', async () => {
        const prepared = await prepareRestore(file);
        await setup();
        return prepared;
      });
    } catch (e) {
      reportError(e);
    }
  }
</script>

<main class="onboarding">
  <div class="dots" aria-hidden="true">
    {#each Array(STEPS) as _, i (i)}
      <span class:on={i <= step}></span>
    {/each}
  </div>

  {#if step === 0}
    <section>
      <p class="brand" aria-hidden="true">ARMADIO</p>
      <h1>Ciao, questo è il tuo <em>armadio</em></h1>
      <p class="lead">Il tuo armadio sempre in tasca: capi, outfit, lavatrice e valigia. Tutto resta sul tuo telefono, anche senza internet.</p>
      <label class="field">
        <span>Come ti chiami? (facoltativo)</span>
        <input class="input" bind:value={userName} autocomplete="given-name" placeholder="Il tuo nome" />
      </label>
    </section>
  {:else if step === 1}
    <section>
      <h1>Che armadio hai?</h1>
      <p class="lead">Serve solo per scegliere le categorie iniziali e qualche suggerimento. Potrai cambiare tutto in seguito.</p>
      <div class="presets" role="radiogroup" aria-label="Tipo di armadio">
        {#each PRESETS as p (p.id)}
          <button class="preset" role="radio" aria-checked={preset === p.id} onclick={() => (preset = p.id)}>
            <strong>{p.label}</strong>
            <span>{p.description}</span>
          </button>
        {/each}
      </div>
    </section>
  {:else if step === 2}
    <section>
      <h1>Scegli il tuo <em>stile</em></h1>
      <p class="lead">Colori e caratteri cambiano subito, così vedi come stanno. Puoi cambiarli quando vuoi da Altro → Impostazioni.</p>
      <ThemePicker
        {palette}
        {mode}
        {font}
        onchange={(p, m, f) => {
          palette = p;
          mode = m;
          font = f;
        }}
      />
    </section>
  {:else}
    <section>
      <h1>{userName.trim() ? `Pronti, ${userName.trim()}!` : 'Pronti!'}</h1>
      <p class="lead">Come vuoi iniziare?</p>
      <div class="choices">
        <button class="choice" onclick={startEmpty}>
          <strong>Inizia con l’armadio vuoto</strong>
          <span>Aggiungerai i tuoi capi con le foto.</span>
        </button>
        <button class="choice" onclick={startDemo}>
          <strong>Carica un esempio</strong>
          <span>8 capi, 2 outfit e 1 viaggio per provare l’app. Li elimini con un tocco quando vuoi.</span>
        </button>
        <button class="choice" onclick={startRestore}>
          <strong>Ripristina un backup</strong>
          <span>Hai già usato Armadio? Scegli il file .zip del backup.</span>
        </button>
      </div>
    </section>
  {/if}

  <nav class="actions">
    {#if step > 0}
      <button class="btn btn-ghost" onclick={() => (step -= 1)}><Icon name="back" size={20} /> Indietro</button>
    {:else}
      <span></span>
    {/if}
    {#if step < STEPS - 1}
      <button class="btn btn-primary" onclick={() => (step += 1)}>Avanti</button>
    {/if}
  </nav>
</main>

{#if restoring}
  <RestoreSheet prepared={restoring} allowMerge={false} onclose={() => (restoring = null)} />
{/if}

<style>
  .onboarding {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 24px) calc(24px + var(--safe-right)) calc(var(--safe-bottom) + 16px)
      calc(24px + var(--safe-left));
    background: var(--bg);
  }
  .dots {
    display: flex;
    gap: 6px;
    justify-content: center;
  }
  .dots span {
    width: 28px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }
  .dots span.on {
    background: var(--strong);
  }
  section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 40px;
    max-width: 480px;
    width: 100%;
    margin: 0 auto;
  }
  h1 {
    font-size: calc(2.25rem * var(--display-scale));
    line-height: 1.08;
    margin: 0;
  }
  .brand {
    margin: 0 0 4px;
    font-family: var(--font-serif);
    font-weight: var(--display-weight);
    font-size: 1.25rem;
    letter-spacing: 0.42em;
    color: var(--accent);
  }
  .brand::after {
    content: '';
    display: block;
    width: 28px;
    height: 1px;
    margin-top: 8px;
    background: var(--accent);
  }
  .lead {
    margin: 0 0 12px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .presets,
  .choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .preset,
  .choice {
    text-align: left;
    padding: 16px 18px;
    border-radius: var(--radius);
    border: 2px solid transparent;
    background: var(--surface);
    box-shadow: var(--shadow-soft);
    outline: 1px solid var(--card-border);
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }
  .preset[aria-checked='true'] {
    border-color: var(--accent);
  }
  .preset span,
  .choice span {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .choice:active {
    border-color: var(--accent);
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 480px;
    width: 100%;
    margin: 16px auto 0;
  }
</style>
