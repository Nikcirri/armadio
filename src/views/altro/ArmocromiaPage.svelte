<script lang="ts">
  import { onDestroy } from 'svelte';
  import { db } from '../../lib/db';
  import { setSetting } from '../../lib/db/repo';
  import type { ColorProfile, ItemRecord, SeasonId } from '../../lib/db/types';
  import { manualProfile, measureFace, parseColorProfile, photosDescription, rankSeasons, seasonInfo } from '../../lib/logic/armocromia';
  import {
    analyzeEyeCloseup,
    analyzeHairCloseup,
    mergeCloseups,
    photosUsed,
    type CloseupKind,
    type IrisFit,
  } from '../../lib/logic/closeups';
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
    type Point,
  } from '../../lib/logic/faceColors';
  import { crop, type Img } from '../../lib/logic/imageOps';
  import { nowIso } from '../../lib/logic/util';
  import { chooseFromGallery, takePhoto, takeSelfie } from '../../lib/media/acquire';
  import { detectFace, faceDetectionSupported } from '../../lib/media/face';
  import { decodeBlob, findIris, imgToJpegBlob } from '../../lib/media/pipeline';
  import { reportError } from '../../lib/errors';
  import { generatorView } from '../../lib/state/generatorView.svelte';
  import { live } from '../../lib/state/live.svelte';
  import { requestOpenItem, selectTab } from '../../lib/state/nav.svelte';
  import { settings } from '../../lib/state/settings.svelte';
  import { confirmDialog, showToast, withBusy } from '../../lib/state/ui.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import Page from '../../lib/ui/Page.svelte';
  import Switch from '../../lib/ui/Switch.svelte';
  import CloseupCard, { type PhotoSource } from './armocromia/CloseupCard.svelte';
  import FaceStudio from './armocromia/FaceStudio.svelte';
  import SeasonPickerSheet from './armocromia/SeasonPickerSheet.svelte';
  import SeasonResult from './armocromia/SeasonResult.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const items = live(() => db.items.toArray(), [] as ItemRecord[]);
  const profile = $derived(parseColorProfile(settings.value.colorProfile ?? null));

  /** Foto da vicino (occhio o capelli). */
  interface Shot {
    img: Img;
    photoUrl: string;
    /** Punto toccato: centro dell'occhio o ciocca da misurare. */
    seed: Point | null;
    /** Occhio: iride e pupilla trovate. */
    fit: IrisFit | null;
    reference: ManualSample | null;
  }

  /** Le foto restano solo qui, in memoria: non si salvano e non si inviano. */
  interface Session {
    img: Img;
    face: FaceGeometry | null;
    photoUrl: string;
    cropUrl: string;
    overrides: Partial<Record<FeatureId, ManualSample>>;
    reference: ManualSample | null;
    eyes: Shot | null;
    hair: Shot | null;
    chosen: SeasonId | null;
    savedAt: string | null;
  }

  /** Le foto si analizzano a 1600 px di lato: le parti piccole del viso restano dettagliate. */
  const ANALYSIS_SIDE = 1600;
  const CLOSEUPS: readonly CloseupKind[] = ['eyes', 'hair'];
  let session = $state.raw<Session | null>(null);
  let picking = $state(false);
  let refacing = $state(false);

  const refRgb = $derived(session?.reference ? referenceAt(session.img, session.reference.point, session.reference.radius) : null);
  const auto = $derived(session?.face ? analyzeFace(session.img, session.face, refRgb) : null);
  const gains = $derived(refRgb ? gainsFromReference(refRgb, 1, 0.3) : (auto?.gains ?? NO_GAINS));
  const faceOnly = $derived(session ? resolveFeatures(session.img, auto?.features ?? null, session.overrides, gains) : null);

  const shotRef = (shot: Shot | null) => (shot?.reference ? referenceAt(shot.img, shot.reference.point, shot.reference.radius) : null);
  const eyeResult = $derived(session?.eyes ? analyzeEyeCloseup(session.eyes.img, session.eyes.fit, shotRef(session.eyes)) : null);
  const hairResult = $derived(session?.hair ? analyzeHairCloseup(session.hair.img, session.hair.seed, shotRef(session.hair)) : null);
  const merged = $derived(faceOnly ? mergeCloseups(faceOnly, { eyes: eyeResult?.lab ?? null, hair: hairResult?.lab ?? null }) : null);
  const features = $derived(merged?.features ?? null);
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
    const fromCloseup = (f: FeatureId) => merged?.sources[f] !== 'face';
    return (auto?.warnings ?? []).filter(
      (w) =>
        !((o.hair || fromCloseup('hair')) && w.includes('capelli')) &&
        !((o.eyes || fromCloseup('eyes')) && w.includes('occhi')) &&
        !(session?.reference && w.includes('luce è molto')),
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

  function revokeShot(shot: Shot | null) {
    if (shot) URL.revokeObjectURL(shot.photoUrl);
  }

  function revoke(s: Session | null) {
    if (!s) return;
    URL.revokeObjectURL(s.photoUrl);
    URL.revokeObjectURL(s.cropUrl);
    revokeShot(s.eyes);
    revokeShot(s.hair);
  }
  onDestroy(() => revoke(session));

  async function acquire(source: PhotoSource): Promise<Blob | null> {
    if (source === 'selfie') return takeSelfie();
    if (source === 'camera') return takePhoto();
    return (await chooseFromGallery(false))[0] ?? null;
  }

  /** Foto del viso. Rifacendola, le foto da vicino già fatte restano. */
  async function start(source: PhotoSource) {
    try {
      const blob = await acquire(source);
      if (!blob) return;
      const keep = session ? { eyes: session.eyes, hair: session.hair } : { eyes: null, hair: null };
      const next = await withBusy('Cerco il viso e misuro i colori…', async () => {
        const img = await decodeBlob(blob, ANALYSIS_SIDE);
        let face: FaceGeometry | null = null;
        try {
          face = await detectFace(img);
        } catch (e) {
          console.error(e);
        }
        const c = faceCrop(face, img.width, img.height);
        const photoUrl = URL.createObjectURL(await imgToJpegBlob(img, 0.9));
        const cropUrl = URL.createObjectURL(await imgToJpegBlob(crop(img, c), 0.9));
        return { img, face, photoUrl, cropUrl, overrides: {}, reference: null, ...keep, chosen: null, savedAt: null } satisfies Session;
      });
      if (session) {
        URL.revokeObjectURL(session.photoUrl);
        URL.revokeObjectURL(session.cropUrl);
      }
      session = next;
      refacing = false;
    } catch (e) {
      reportError(e);
    }
  }

  /** Foto da vicino: occhio (cerco l'iride) o capelli. */
  async function startCloseup(kind: CloseupKind, source: PhotoSource) {
    try {
      const blob = await acquire(source);
      if (!blob || !session) return;
      const shot = await withBusy(kind === 'eyes' ? 'Cerco l’iride e misuro il colore…' : 'Misuro il colore dei capelli…', async () => {
        const img = await decodeBlob(blob, ANALYSIS_SIDE);
        const fit = kind === 'eyes' ? await findIris(img, null) : null;
        const photoUrl = URL.createObjectURL(await imgToJpegBlob(img, 0.9));
        return { img, photoUrl, seed: null, fit, reference: null } satisfies Shot;
      });
      if (!session) {
        revokeShot(shot);
        return;
      }
      revokeShot(session[kind]);
      session = { ...session, [kind]: shot, chosen: null, savedAt: null };
    } catch (e) {
      reportError(e);
    }
  }

  function updateShot(kind: CloseupKind, change: Partial<Shot>) {
    const shot = session?.[kind];
    if (session && shot) session = { ...session, [kind]: { ...shot, ...change }, chosen: null, savedAt: null };
  }

  /** Punto toccato: per l'occhio si cerca di nuovo l'iride lì intorno. */
  async function setSeed(kind: CloseupKind, point: Point) {
    const shot = session?.[kind];
    if (!shot) return;
    if (kind === 'hair') {
      updateShot(kind, { seed: point });
      return;
    }
    try {
      const fit = await withBusy('Cerco l’iride…', () => findIris(shot.img, point));
      if (session?.[kind] !== shot) return;
      updateShot(kind, { seed: point, fit });
    } catch (e) {
      reportError(e);
    }
  }

  function removeCloseup(kind: CloseupKind) {
    if (!session) return;
    revokeShot(session[kind]);
    session = { ...session, [kind]: null, chosen: null, savedAt: null };
  }

  function closeSession() {
    revoke(session);
    session = null;
    refacing = false;
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
      photos: merged ? photosUsed(merged.sources) : ['face'],
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
        sources={merged!.sources}
        overrides={session.overrides}
        reference={session.reference}
        {warnings}
        faceFound={!!session.face}
        onsample={setOverride}
        onreference={setReference}
        onreset={resetOverride}
      />
      {#each CLOSEUPS as kind (kind)}
        {@const shot = session[kind]}
        <CloseupCard
          {kind}
          photoUrl={shot?.photoUrl ?? null}
          width={shot?.img.width ?? 1}
          height={shot?.img.height ?? 1}
          fit={shot?.fit ?? null}
          area={kind === 'hair' ? (hairResult?.area ?? null) : null}
          reference={shot?.reference ?? null}
          lab={kind === 'eyes' ? (eyeResult?.lab ?? null) : (hairResult?.lab ?? null)}
          warnings={kind === 'eyes' ? (eyeResult?.warnings ?? []) : (hairResult?.warnings ?? [])}
          onpick={(source) => startCloseup(kind, source)}
          onseed={(point) => setSeed(kind, point)}
          onreference={(sample) => updateShot(kind, { reference: sample })}
          onremove={() => removeCloseup(kind)}
        />
      {/each}
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
          {#if refacing}
            <p class="note">Rifai la foto del viso (le foto da vicino restano):</p>
            {@render sources(() => (refacing = false))}
          {:else}
            <button class="btn btn-block" onclick={() => (refacing = true)}><Icon name="camera" size={20} /> Rifai la foto del viso</button>
          {/if}
          <button class="btn btn-ghost btn-block" onclick={closeSession}>Chiudi le foto</button>
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
        {profile.source === 'manual' ? 'Stagione scelta da te' : photosDescription(profile.photos)} del {new Date(profile.date).toLocaleDateString('it-IT', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}. Per provare i colori sul viso rifai la foto: le foto non le conservo.
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
      <h3 class="section-title">Rifai l’analisi</h3>
      <p class="note">Prima la foto del viso, poi quella degli occhi da vicino.</p>
      {@render sources()}
      <div class="actions">
        <button class="btn btn-block" onclick={() => (picking = true)}>Scegli la stagione a mano</button>
        <button class="btn btn-ghost btn-block danger" onclick={remove}><Icon name="trash" size={20} /> Elimina armocromia</button>
      </div>
    {:else}
      <div class="intro">
        <h2>Scopri i colori che ti stanno meglio</h2>
        <p>
          Misuro i colori di pelle, capelli, occhi e labbra e ti dico la tua stagione (una delle 12 dell’armocromia), i colori che ti illuminano,
          quelli da evitare vicino al viso e quali capi del tuo armadio ti valorizzano.
        </p>
      </div>
      <h3 class="section-title">Come funziona</h3>
      <ol class="steps">
        <li><strong>Una foto del viso.</strong> Da qui misuro pelle, capelli, sopracciglia e labbra.</li>
        <li>
          <strong>Una foto di un occhio da vicino</strong> (consigliata). Da lontano molte fotocamere sbagliano il colore degli occhi e delle
          parti piccole del viso: da vicino lo misuro bene.
        </li>
        <li><strong>Una ciocca di capelli da vicino</strong>, se vuoi.</li>
      </ol>
      <h3 class="section-title">Per foto perfette</h3>
      <ul class="tips">
        <li><span aria-hidden="true">☀️</span> Luce del giorno, vicino a una finestra. Niente sole diretto, lampadine o flash.</li>
        <li><span aria-hidden="true">🙂</span> Viso pulito, senza trucco. Togli gli occhiali.</li>
        <li><span aria-hidden="true">📵</span> Niente filtri, modalità bellezza o ritratto della fotocamera: cambiano i colori.</li>
        <li><span aria-hidden="true">💇</span> Capelli visibili intorno al viso (non raccolti all’indietro, niente cappello).</li>
        <li><span aria-hidden="true">📏</span> Guarda dritto verso il telefono, con il viso grande nella foto.</li>
        <li><span aria-hidden="true">📄</span> Facoltativo: tieni un foglio bianco vicino al viso e toccalo dopo, così correggo la luce.</li>
      </ul>
      <p class="note">Le foto restano sul telefono solo mentre le guardi: non vengono salvate né inviate.</p>
      <h3 class="section-title">Inizia dalla foto del viso</h3>
      {@render sources()}
      <div class="actions">
        <button class="btn btn-ghost btn-block" onclick={() => (picking = true)}>Conosco già la mia stagione</button>
      </div>
    {/if}
  </div>
</Page>

{#snippet sources(oncancel?: () => void)}
  <div class="sources">
    <button class="btn btn-primary" onclick={() => start('selfie')}><Icon name="camera" size={20} /> Fai un selfie</button>
    <button class="btn" onclick={() => start('camera')}><Icon name="camera" size={20} /> Fatti fare una foto</button>
    <button class="btn" onclick={() => start('gallery')}><Icon name="image" size={20} /> Dalla galleria</button>
    {#if oncancel}<button class="btn btn-ghost" onclick={oncancel}>Annulla</button>{/if}
  </div>
{/snippet}

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
  .steps {
    margin: 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    line-height: 1.45;
  }
  .sources {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
