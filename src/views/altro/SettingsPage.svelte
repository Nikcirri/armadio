<script lang="ts">
  import { Share } from '@capacitor/share';
  import { db } from '../../lib/db';
  import { setSetting, updateSetting } from '../../lib/db/repo';
  import type { ListRecord, PaletteId, Preset, ThemeMode } from '../../lib/db/types';
  import { allPairs, hasPair, togglePair } from '../../lib/logic/lists';
  import { live } from '../../lib/state/live.svelte';
  import { PRESETS } from '../../lib/logic/presets';
  import { formatDateIt } from '../../lib/logic/util';
  import { isNative } from '../../lib/platform';
  import { askNotificationPermission, refreshEndOfDayReminder } from '../../lib/notify';
  import { lockAvailable, unlockWithDevice } from '../../lib/appLock';
  import { lock } from '../../lib/state/lock.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { confirmDialog, showToast } from '../../lib/state/ui.svelte';
  import { reportError } from '../../lib/errors';
  import Page from '../../lib/ui/Page.svelte';
  import Switch from '../../lib/ui/Switch.svelte';
  import ThemePicker from '../../lib/ui/ThemePicker.svelte';
  import Icon from '../../lib/ui/Icon.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const s = $derived(settings.value);
  const lists = live(() => db.lists.where('kind').equals('occasion').sortBy('order'), [] as ListRecord[]);
  const pairs = $derived(allPairs(lists.value));
  const matrix = $derived(s.occasionMatrix ?? []);
  const repeatDays = $derived(s.antiRepeatDays ?? 3);
  let showMatrix = $state(false);

  function setRepeatDays(n: number) {
    void save(() => setSetting(db, 'antiRepeatDays', Math.max(0, Math.min(14, n))));
  }

  function togglePairSetting(a: string, b: string) {
    void save(() => setSetting(db, 'occasionMatrix', togglePair($state.snapshot(matrix) as [string, string][], a, b)));
  }
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

  async function setEveningReminder(on: boolean) {
    if (on && !(await askNotificationPermission().catch(() => false))) {
      showToast('Senza il permesso per le notifiche il promemoria non può arrivare. Puoi darlo dalle impostazioni di Android.');
      return;
    }
    await save(async () => {
      await updateSetting(db, 'notifications', { eveningReminder: on });
      await refreshEndOfDayReminder();
    });
    if (on) showToast('Promemoria attivo');
  }

  function setReminderTime(value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    void save(async () => {
      await updateSetting(db, 'notifications', { time: value });
      await refreshEndOfDayReminder();
    });
  }

  async function setAppLock(on: boolean) {
    if (on && !(await lockAvailable())) {
      showToast('Prima imposta un blocco schermo nel telefono (impronta, volto o PIN).');
      return;
    }
    const ok = await unlockWithDevice(on ? 'Conferma per attivare il blocco' : 'Conferma per togliere il blocco').catch(() => false);
    if (!ok) return;
    lock.unlocked = true;
    await save(() => updateSetting(db, 'appLock', { enabled: on }));
    showToast(on ? 'Blocco attivo: all’apertura servirà l’impronta o il PIN' : 'Blocco tolto');
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

  <h2 class="section-title">Cosa metto?</h2>
  <div class="list">
    <div class="row static">
      <span class="grow">
        Non riproporre i capi indossati negli ultimi
        <span class="sub">{repeatDays === 0 ? 'Disattivato: può riproporre anche i capi di oggi.' : 'Non vale per scarpe e accessori.'}</span>
      </span>
      <span class="stepper">
        <button class="mini" aria-label="Meno giorni" disabled={repeatDays <= 0} onclick={() => setRepeatDays(repeatDays - 1)}>−</button>
        <span>{repeatDays} {repeatDays === 1 ? 'giorno' : 'giorni'}</span>
        <button class="mini" aria-label="Più giorni" disabled={repeatDays >= 14} onclick={() => setRepeatDays(repeatDays + 1)}>+</button>
      </span>
    </div>
    <button class="row" aria-expanded={showMatrix} onclick={() => (showMatrix = !showMatrix)}>
      <span class="grow">
        Occasioni che non stanno insieme
        <span class="sub">{matrix.length === 1 ? '1 coppia' : `${matrix.length} coppie`}: senza occasione scelta, “Cosa metto?” non le abbina.</span>
      </span>
      <Icon name={showMatrix ? 'up' : 'down'} size={18} />
    </button>
    {#if showMatrix}
      {#each pairs as [a, b] (a.id + b.id)}
        <Switch label="{a.name} + {b.name}" checked={hasPair(matrix, a.id, b.id)} onchange={() => togglePairSetting(a.id, b.id)} />
      {/each}
    {/if}
  </div>

  <h2 class="section-title">Promemoria</h2>
  <div class="list">
    <Switch
      label="Promemoria serale “Fine giornata”"
      description={isNative()
        ? 'Solo nei giorni in cui hai indossato qualcosa: ti ricorda di scegliere i capi da lavare.'
        : 'Disponibile solo nell’app Android.'}
      checked={s.notifications?.eveningReminder ?? false}
      disabled={!isNative()}
      onchange={(v) => void setEveningReminder(v)}
    />
    {#if s.notifications?.eveningReminder}
      <label class="time">
        <span>Orario</span>
        <input class="input" type="time" value={s.notifications?.time ?? '21:00'} onchange={(e) => {
            setReminderTime(e.currentTarget.value);
            e.currentTarget.blur();
          }} />
      </label>
    {/if}
  </div>

  <h2 class="section-title">Privacy</h2>
  <div class="list">
    <Switch
      label="Blocca l’app con impronta o PIN"
      description={isNative()
        ? 'All’apertura e quando torni dopo almeno un minuto. Usa il blocco schermo del telefono.'
        : 'Disponibile solo nell’app Android.'}
      checked={s.appLock?.enabled ?? false}
      disabled={!isNative()}
      onchange={(v) => void setAppLock(v)}
    />
  </div>

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
  .row.static {
    cursor: default;
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .stepper span {
    min-width: 64px;
    text-align: center;
    font-weight: 600;
  }
  .mini {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .mini:disabled {
    opacity: 0.4;
  }
  .time {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px 12px;
  }
  .time .input {
    width: auto;
    min-width: 120px;
  }
</style>
