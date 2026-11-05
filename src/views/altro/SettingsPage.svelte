<script lang="ts">
  import { Share } from '@capacitor/share';
  import { db } from '../../lib/db';
  import { setSetting, updateSetting } from '../../lib/db/repo';
  import type { PaletteId, Preset, ThemeMode } from '../../lib/db/types';
  import { PRESETS } from '../../lib/logic/presets';
  import { formatDateIt } from '../../lib/logic/util';
  import { isNative } from '../../lib/platform';
  import { settings } from '../../lib/state/settings.svelte';
  import { confirmDialog, showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Page from '../../lib/ui/Page.svelte';
  import Switch from '../../lib/ui/Switch.svelte';
  import ThemePicker from '../../lib/ui/ThemePicker.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const s = $derived(settings.value);
  const errors = $derived(s.errorLog ?? []);

  async function save(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      reportError(e);
    }
  }

  function saveName(value: string) {
    void save(() => updateSetting(db, 'profile', { userName: value.trim() }));
  }
  function saveAppName(value: string) {
    void save(() => updateSetting(db, 'app', { appName: value.trim() || 'Armadio' }));
  }
  function saveTheme(palette: PaletteId, mode: ThemeMode) {
    void save(() => setSetting(db, 'theme', { palette, mode }));
  }
  function savePreset(preset: Preset) {
    void save(() => setSetting(db, 'preset', preset));
  }

  async function shareErrors() {
    const text = errors.map((e) => `[${e.at}] ${e.message}`).join('\n\n');
    try {
      if (isNative()) {
        await Share.share({ title: 'Registro errori Armadio', text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast('Registro copiato negli appunti');
      }
    } catch (e) {
      if (!/cancel|abort/i.test(String(e))) reportError(e);
    }
  }

  async function clearErrors() {
    const ok = await confirmDialog({ title: 'Svuotare il registro errori?', confirmLabel: 'Svuota' });
    if (ok) await save(() => setSetting(db, 'errorLog', []));
  }
</script>

<Page title="Impostazioni" {onclose}>
  <h2 class="section-title">Profilo</h2>
  <div class="card stack">
    <label class="field">
      <span>Il tuo nome</span>
      <input
        class="input"
        value={s.profile?.userName ?? ''}
        placeholder="Facoltativo"
        onchange={(e) => saveName(e.currentTarget.value)}
      />
    </label>
    <label class="field">
      <span>Nome dell’app (in alto)</span>
      <input
        class="input"
        value={s.app?.appName ?? 'Armadio'}
        maxlength="24"
        onchange={(e) => saveAppName(e.currentTarget.value)}
      />
    </label>
  </div>

  <h2 class="section-title">Aspetto</h2>
  <div class="card">
    <ThemePicker palette={s.theme?.palette ?? 'sabbia'} mode={s.theme?.mode ?? 'system'} onchange={saveTheme} />
  </div>

  <h2 class="section-title">Tipo di armadio</h2>
  <div class="segmented" role="group" aria-label="Tipo di armadio">
    {#each PRESETS as p (p.id)}
      <button aria-pressed={s.preset === p.id} onclick={() => savePreset(p.id)}>{p.label}</button>
    {/each}
  </div>
  <p class="note">Cambia solo i suggerimenti (per esempio le note sull’intimo). Le tue categorie restano come sono.</p>

  <h2 class="section-title">Backup</h2>
  <div class="list">
    <Switch
      label="Promemoria backup"
      description="Avviso in alto dopo 10 modifiche o 14 giorni senza backup."
      checked={s.backup?.reminders ?? true}
      onchange={(v) => void save(() => updateSetting(db, 'backup', { reminders: v }))}
    />
    <Switch
      label="Backup automatico settimanale"
      description={isNative()
        ? `In Documenti/Armadio/auto, tiene gli ultimi 3.${s.backup?.lastAutoBackupDate ? ` Ultimo: ${formatDateIt(s.backup.lastAutoBackupDate)}.` : ''}`
        : 'Disponibile solo nell’app Android.'}
      checked={s.backup?.autoWeekly ?? false}
      disabled={!isNative()}
      onchange={(v) => void save(() => updateSetting(db, 'backup', { autoWeekly: v }))}
    />
  </div>
  <p class="note">Il backup automatico resta sul telefono: per sicurezza salva ogni tanto un backup anche su Drive.</p>

  <h2 class="section-title">Registro errori</h2>
  <div class="card">
    {#if errors.length === 0}
      <p class="plain">Nessun errore registrato.</p>
    {:else}
      <p class="plain">
        {errors.length === 1 ? '1 errore registrato' : `${errors.length} errori registrati`}, l’ultimo il
        {formatDateIt(errors[errors.length - 1]!.at)}.
      </p>
      <div class="buttons">
        <button class="btn" onclick={shareErrors}>Condividi</button>
        <button class="btn btn-ghost" onclick={clearErrors}>Svuota</button>
      </div>
    {/if}
  </div>
</Page>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .plain {
    margin: 0;
    line-height: 1.5;
  }
  .buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
</style>
