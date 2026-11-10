# Armadio

L'app per gestire il tuo armadio: capi, outfit, lavanderia, valigia e ricordi. Funziona senza internet e tutti i dati restano sul tuo telefono.

## Installare l'app (Android)

1. Dal telefono apri https://github.com/Nikcirri/armadio/releases/latest
2. In fondo alla pagina, sotto "Assets", tocca il file `Armadio-vX.Y.Z.apk` per scaricarlo.
3. Apri il file scaricato (dalla notifica o dall'app File).
4. Se Android dice che l'installazione è bloccata, tocca **Impostazioni**, attiva **Consenti da questa origine** e torna indietro.
5. Tocca **Installa**. Se compare un avviso di Play Protect, tocca **Installa comunque**: succede con tutte le app che non arrivano dal Play Store.

## Aggiornare

Quando esce una versione nuova, in alto compare un avviso con le novità e due pulsanti:

1. Tocca **Aggiorna**: l'app scarica la versione nuova (vedi la percentuale) e apre l'installazione di Android.
2. La prima volta Android chiede il permesso **Installa app sconosciute**: l'app ti porta alla schermata giusta, attiva **Consenti da questa origine** e torna indietro. L'aggiornamento riparte da solo.
3. Nella finestra di Android tocca **Aggiorna** (o **Installa**), poi **Apri**. I tuoi dati restano.

**Dopo** chiude l'avviso: lo ritrovi in **Altro → Aggiornamenti** (o nel menu **⋮ → Aggiornamenti**), dove ci sono anche **Controlla aggiornamenti**, **Aggiorna dall'app** e **Scarica da GitHub** (apre la pagina delle versioni nel browser).

Il file scaricato sta nella memoria temporanea dell'app, non nella cartella Download, e si cancella da solo dopo l'aggiornamento; per liberare spazio prima basta **Svuota cache** nelle impostazioni dell'app di Android.

## Backup

Apri **Altro → Backup e dati → Esporta backup** e scegli dove salvarlo (per esempio Google Drive o una chat WhatsApp con te stesso). Per recuperare i dati: **Altro → Backup e dati → Ripristina da un backup** e scegli il file .zip.

Ricorda: se disinstalli l'app, i dati vengono cancellati. Il backup è l'unica copia.

## Versione web (facoltativa, per esempio per iPhone)

L'app può essere pubblicata anche come sito, che funziona senza internet dopo la prima apertura.

1. Su GitHub apri **Settings → Pages** e in **Source** scegli **GitHub Actions** (solo la prima volta).
2. Apri **Actions → Pubblica versione web → Run workflow**.
3. Il sito sarà su https://nikcirri.github.io/armadio/. Dal browser del telefono usa **Aggiungi a schermata Home**.

I dati della versione web restano nel browser e sono separati da quelli dell'app Android: per spostarli usa il backup.

## Per chi sviluppa

- Specifica completa: [`SPEC.md`](SPEC.md). Regole di lavoro: [`CLAUDE.md`](CLAUDE.md).
- `npm run dev` avvia la versione web, `npm run verify` fa controlli, test e build.
- Quando su `main` cambia la versione in `package.json`, GitHub Actions costruisce l'APK firmato e pubblica la Release `vX.Y.Z` (`.github/workflows/release.yml`).
- L'APK contiene solo le librerie native ARM ed è ridotto con R8 (regole prudenti in `android/app/proguard-rules.pro`). Prima di ogni Release, e a ogni push nel workflow "Controllo", `scripts/check_apk.py` apre l'APK e controlla plugin Capacitor, ponte JavaScript, funzioni native, classi del manifest e file web: `python3 scripts/check_apk.py <apk> --dist dist [--compare vecchio.apk]`.
- Le pagine di Altro, l'editor foto, il primo avvio e la libreria dei backup si caricano a richiesta (`src/lib/lazy.ts`, `src/lib/ui/Lazy.svelte`).
- La versione web si pubblica a mano con `.github/workflows/pages.yml`; il service worker è generato al build da `build/serviceWorker.ts`.
- Icona e schermata di avvio: sorgenti in `resources/`.
- Armocromia: il viso si trova sul telefono con ML Kit Face Detection (`FacePlugin.java`, modello incluso nell'app); i colori si misurano in `src/lib/logic/faceColors.ts` e la stagione in `src/lib/logic/armocromia.ts`.
