<script lang="ts">
  import { onDestroy } from 'svelte';
  import { db } from '../../lib/db';
  import { setSetting } from '../../lib/db/repo';
  import type { ColorProfile, ItemRecord, SeasonId } from '../../lib/db/types';
  import { manualProfile, measureFace, parseColorProfile, rankSeasons, seasonInfo } from '../../lib/logic/armocromia';
  import { labToHex } from '../../lib/logic/colors';
  import {
    FEATURE_LABEL,
    NO_GAINS,
    analyzeFace,
    faceCrop,
    gainsFromReference,
    referenceAt,
    resolveFeatures,
    toFaceFeatures,
    type FaceGeometry,
    type FeatureId,
    type ManualSample,
  } from '../../lib/logic/faceColors';
  import { crop, type Img } from '../../lib/logic/imageOps';
  import { nowIso } from '../../lib/logic/util';
  import { chooseFromGallery, takeSelfie } from '../../lib/media/acquire';
  import { detectFace, faceDetectionSupported } from '../../lib/media/face';
  import { decodeBlob, imgToJpegBlob } from '../../lib/media/pipeline';
  import { reportError } from '../../lib/errors';
  import { generatorView } from '../../lib/state/generatorView.svelte';
  import { live } from '../../lib/state/live.svelte';
  import { requestOpenItem, selectTab } from '../../lib/state/nav.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { confirmDialog, showToast, withBusy } from '../../lib/state/ui.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import Switch from '../../lib/ui/Switch.svelte';
  import FaceStudio from './armocromia/FaceStudio.svelte';
  import SeasonPickerSheet from './armocromia/SeasonPickerSheet.svelte';
  import SeasonResult from './armocromia/SeasonResult.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const profile = $derived(parseColorProfile(settings.value.colorProfile ?? null));

  /** La foto resta solo qui, in memoria: non si salva e non si invia. */
  interface Session {
    img: Img;
    face: FaceGeometry | null;
    photoUrl: string;
    cropUrl: string;
    overrides: Partial<Record<FeatureId, ManualSample>>;
    reference: ManualSample | null;
    chosen: SeasonId | null;
    savedAt: string | null;
  }
  let session = $state.raw<Session | null>(null);
  let picking = $state(false);

  const refRgb = $derived(session?.reference ? referenceAt(session.img, session.reference.point, session.reference.radius) : null);
  const auto = $derived(session?.face ? analyzeFace(session.img, session.face, refRgb) : null);
  const gains = $derived(refRgb ? gainsFromReference(refRgb, 1, 0.3) : (auto?.gains ?? NO_GAINS));
  const features = $derived(session ? resolveFeatures(session.img, auto?.features ?? null, session.overrides, gains) : null);
  const faceFeatures = $derived(features ? toFaceFeatures(features) : null);
  const metrics = $derived(faceFeatures ? measureFace(faceFeatures) : null);
  const ranking = $derived(metrics ? rankSeasons(metrics) : []);
  const sessionSeason = $derived(session?.chosen ?? ranking[0]?.season ?? null);
  const warnings = $derived.by(() => {
    if (!session) return [];
    if (!session.face) {
      return [
        faceDetectionSupported()
          ? 'Non ho trovato il viso nella foto: tocca tu la pelle, i capelli e gli occhi, poi misuro io i colori.'
          : 'Nella versione web tocca tu la pelle, i capelli e gli occhi nella foto: misuro io i colori.',
      ];
    }
    const o = session.overrides;
    return (auto?.warnings ?? []).filter(
      (w) => !(o.hair && w.includes('capelli')) && !(o.eyes && w.includes('occhi')) && !(session?.reference && w.includes('luce è molto')),
    );
  });
  const measuredColors = $derived(
    features
      ? (['skin', 'hair', 'eyes', 'lips'] as FeatureId[]).map((f) => ({ label: FEATURE_LABEL[f], hex: features[f] ? labToHex(features[f]!) : null }))
      : null,
  );
  const savedColors = $derived(
    profile?.colors
      ? [
          { label: 'Pelle', hex: profile.colors.skin },
          { label: 'Capelli', hex: profile.colors.hair },
          { label: 'Occhi', hex: profile.colors.eyes },
          { label: 'Labbra', hex: profile.colors.lips },
        ]
      : null,
  );

  function revoke(s: Session | null) {
    if (!s) return;
    URL.revokeObjectURL(s.photoUrl);
    URL.revokeObjectURL(s.cropUrl);
  }
  onDestroy(() => revoke(session));

  async function start(kind: 'selfie' | 'gallery') {
    try {
      const blob = kind === 'selfie' ? await takeSelfie() : ((await chooseFromGallery(false))[0] ?? null);
      if (!blob) return;
      const next = await withBusy('Cerco il viso e misuro i colori…', async () => {
        const img = await decodeBlob(blob, 1280);
        let face: FaceGeometry | null = null;
        try {
          face = await detectFace(img);
        } catch (e) {
          console.error(e);
        }
        const c = faceCrop(face, img.width, img.height);
        const photoUrl = URL.createObjectURL(await imgToJpegBlob(img, 0.9));
        const cropUrl = URL.createObjectURL(await imgToJpegBlob(crop(img, c), 0.9));
        return { img, face, photoUrl, cropUrl, overrides: {}, reference: null, chosen: null, savedAt: null } satisfies Session;
      });
      revoke(session);
      session = next;
    } catch (e) {
      reportError(e);
    }
  }

  function closeSession() {
    revoke(session);
    session = null;
  }

  function setOverride(f: FeatureId, sample: ManualSample) {
    if (session) session = { ...session, overrides: { ...session.overrides, [f]: sample }, chosen: null, savedAt: null };
  }

  function resetOverride(f: FeatureId) {
    if (!session) return;
    const overrides = { ...session.overrides };
    delete overrides[f];
    session = { ...session, overrides, chosen: null, savedAt: null };
  }

  function setReference(sample: ManualSample | null) {
    if (session) session = { ...session, reference: sample, chosen: null, savedAt: null };
  }

  async function saveSession() {
    if (!session || !sessionSeason || !features?.skin || !metrics) return;
    const hex = (f: FeatureId) => (features[f] ? labToHex(features[f]!) : null);
    const p: ColorProfile = {
      season: sessionSeason,
      source: 'photo',
      date: nowIso(),
      colors: { skin: labToHex(features.skin), hair: hex('hair'), eyes: hex('eyes'), lips: hex('lips'), brows: hex('brows') },
      metrics: { ...metrics },
      ranking: ranking.slice(0, 3).map((r) => ({ season: r.season, percent: r.percent })),
      useInGenerator: profile?.useInGenerator ?? true,
    };
    try {
      await setSetting(db, 'colorProfile', p);
      session = { ...session, savedAt: p.date };
      showToast(`Salvata: ${seasonInfo(p.season).name}`);
    } catch (e) {
      reportError(e);
    }
  }

  async function pickManual(season: SeasonId) {
    picking = false;
    try {
      await setSetting(db, 'colorProfile', manualProfile(season, nowIso(), profile?.useInGenerator ?? true));
      closeSession();
      showToast(`Salvata: ${seasonInfo(season).name}`);
    } catch (e) {
      reportError(e);
    }
  }

  /** Dalla classifica salvata: passa a una delle stagioni vicine. */
  async function chooseSaved(season: SeasonId) {
    if (!profile || profile.season === season) return;
    try {
      await setSetting(db, 'colorProfile', { ...profile, season });
      showToast(`Salvata: ${seasonInfo(season).name}`);
    } catch (e) {
      reportError(e);
    }
  }

  async function setUse(on: boolean) {
    if (!profile) return;
    try {
      await setSetting(db, 'colorProfile', { ...profile, useInGenerator: on });
    } catch (e) {
      reportError(e);
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Eliminare l’armocromia?',
      message: 'La stagione salvata sparisce e “Cosa metto?” non la userà più. Puoi rifarla quando vuoi.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await setSetting(db, 'colorProfile', null);
      if (generatorView.options.paletteId === 'season') generatorView.options = { ...generatorView.options, paletteId: null };
      showToast('Armocromia eliminata');
    } catch (e) {
      reportError(e);
    }
  }

  function usePalette(id: string) {
    generatorView.options = { ...generatorView.options, paletteId: id };
    generatorView.look = null;
    generatorView.reasons = [];
    generatorView.problems = [];
    generatorView.fixes = [];
    generatorView.savedOutfitId = null;
    selectTab('cosa-metto');
  }
</script>

<Page title="Armocromia" {onclose}>
  <div class="armo">
    {#if session}
      <FaceStudio
        photoUrl={session.photoUrl}
        width={session.img.width}
        height={session.img.height}
        regions={auto?.regions ?? null}
        features={features!}
        overrides={session.overrides}
        reference={session.reference}
        {warnings}
        faceFound={!!session.face}
        onsample={setOverride}
        onreference={setReference}
        onreset={resetOverride}
      />
      {#if sessionSeason}
        <h2 class="section-title result-title">Il risultato</h2>
        <SeasonResult
          season={sessionSeason}
          {ranking}
          {metrics}
          colors={measuredColors}
          cropUrl={session.cropUrl}
          items={items.value}
          onchoose={(s) => session && (session = { ...session, chosen: s, savedAt: null })}
          onopenitem={requestOpenItem}
          onusepalette={usePalette}
        />
        <div class="actions">
          <button class="btn btn-primary btn-block" onclick={saveSession} disabled={!!session.savedAt}>
            {#if session.savedAt}<Icon name="check" size={20} /> Salvata come tua stagione{:else}Salva: {seasonInfo(sessionSeason).name}{/if}
          </button>
          <button class="btn btn-block" onclick={() => start('selfie')}><Icon name="camera" size={20} /> Rifai la foto</button>
          <button class="btn btn-ghost btn-block" onclick={closeSession}>Chiudi la foto</button>
        </div>
      {:else}
        <p class="note">Tocca la pelle nella foto: senza la pelle non posso fare l’analisi.</p>
      {/if}
    {:else if profile}
      <SeasonResult
        season={profile.season}
        ranking={profile.ranking}
        metrics={profile.metrics}
        colors={savedColors}
        items={items.value}
        onchoose={chooseSaved}
        onopenitem={requestOpenItem}
        onusepalette={usePalette}
      />
      <p class="note">
        {profile.source === 'manual' ? 'Stagione scelta da te' : 'Analisi dalla foto'} del {new Date(profile.date).toLocaleDateString('it-IT', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}. Per provare i colori sul viso rifai la foto: non la conservo.
      </p>
      <h3 class="section-title">Impostazioni</h3>
      <div class="list">
        <Switch
          label="Usa in Cosa metto?"
          description="Preferisce i capi nei tuoi colori vicino al viso (sopra, strati, abiti, capospalla)."
          checked={profile.useInGenerator}
          onchange={setUse}
        />
      </div>
      <div class="actions">
        <button class="btn btn-block" onclick={() => start('selfie')}><Icon name="camera" size={20} /> Rifai con un selfie</button>
        <button class="btn btn-block" onclick={() => start('gallery')}><Icon name="image" size={20} /> Rifai da una foto</button>
        <button class="btn btn-block" onclick={() => (picking = true)}>Scegli la stagione a mano</button>
        <button class="btn btn-ghost btn-block danger" onclick={remove}><Icon name="trash" size={20} /> Elimina armocromia</button>
      </div>
    {:else}
      <div class="intro">
        <h2>Scopri i colori che ti stanno meglio</h2>
        <p>
          Fai un selfie: trovo il viso e misuro i colori di pelle, capelli, occhi e labbra. Poi ti dico la tua stagione (una delle 12
          dell’armocromia), i colori che ti illuminano, quelli da evitare vicino al viso e quali capi del tuo armadio ti valorizzano.
        </p>
      </div>
      <h3 class="section-title">Per una foto perfetta</h3>
      <ul class="tips">
        <li><span aria-hidden="true">☀️</span> Luce del giorno, vicino a una finestra. Niente sole diretto, lampadine o flash.</li>
        <li><span aria-hidden="true">🙂</span> Viso pulito, senza trucco e senza filtri. Togli gli occhiali.</li>
        <li><span aria-hidden="true">💇</span> Capelli visibili intorno al viso (non raccolti all’indietro, niente cappello).</li>
        <li><span aria-hidden="true">📏</span> Guarda dritto verso il telefono, con il viso grande nella foto.</li>
        <li><span aria-hidden="true">📄</span> Facoltativo: tieni un foglio bianco vicino al viso e toccalo dopo, così correggo la luce.</li>
      </ul>
      <p class="note">La foto resta sul telefono solo mentre la guardi: non viene salvata né inviata.</p>
      <div class="actions">
        <button class="btn btn-primary btn-block" onclick={() => start('selfie')}><Icon name="camera" size={20} /> Fai un selfie</button>
        <button class="btn btn-block" onclick={() => start('gallery')}><Icon name="image" size={20} /> Scegli una foto</button>
        <button class="btn btn-ghost btn-block" onclick={() => (picking = true)}>Conosco già la mia stagione</button>
      </div>
    {/if}
  </div>
</Page>

{#if picking}
  <SeasonPickerSheet current={profile?.season ?? null} onpick={pickManual} onclose={() => (picking = false)} />
{/if}

<style>
  .armo {
    padding: 16px 16px 40px;
  }
  .intro h2 {
    margin: 4px 0 8px;
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 1.5rem;
  }
  .intro p {
    margin: 0;
    line-height: 1.5;
  }
  .tips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    line-height: 1.45;
  }
  .tips li {
    display: flex;
    gap: 10px;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 20px;
  }
  .result-title {
    margin-top: 28px;
  }
  .danger {
    color: var(--danger);
  }
</style>
