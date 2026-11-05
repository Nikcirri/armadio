# Armadio

L'app per gestire il tuo armadio: capi, outfit, lavanderia, valigia e ricordi. Funziona senza internet e tutti i dati restano sul tuo telefono.

## Installare l'app (Android)

1. Dal telefono apri https://github.com/Nikcirri/armadio/releases/latest
2. In fondo alla pagina, sotto "Assets", tocca il file `Armadio-vX.Y.Z.apk` per scaricarlo.
3. Apri il file scaricato (dalla notifica o dall'app File).
4. Se Android dice che l'installazione è bloccata, tocca **Impostazioni**, attiva **Consenti da questa origine** e torna indietro.
5. Tocca **Installa**. Se compare un avviso di Play Protect, tocca **Installa comunque**: succede con tutte le app che non arrivano dal Play Store.

## Aggiornare

Scarica e installa la nuova versione dallo stesso link: si installa sopra quella vecchia e i dati restano.

## Backup

Apri **Altro → Backup e dati → Esporta backup** e scegli dove salvarlo (per esempio Google Drive o una chat WhatsApp con te stesso). Per recuperare i dati: **Altro → Backup e dati → Ripristina da un backup** e scegli il file .zip.

Ricorda: se disinstalli l'app, i dati vengono cancellati. Il backup è l'unica copia.

## Per chi sviluppa

- Specifica completa: [`SPEC.md`](SPEC.md). Regole di lavoro: [`CLAUDE.md`](CLAUDE.md).
- `npm run dev` avvia la versione web, `npm run verify` fa controlli, test e build.
- Quando su `main` cambia la versione in `package.json`, GitHub Actions costruisce l'APK firmato e pubblica la Release `vX.Y.Z` (`.github/workflows/release.yml`).
