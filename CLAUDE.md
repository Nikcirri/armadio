# Regole di lavoro per il progetto Armadio

- Prima di ogni fase leggi tutto `SPEC.md`: è la fonte di verità. Se una richiesta è in conflitto con SPEC.md, chiedi prima di procedere; se l'utente cambia una funzione, aggiorna prima SPEC.md e poi il codice.
- Lavora una fase alla volta (SPEC.md, sezione 13). Implementa tutto per intero: niente codice troncato, niente `TODO`, niente funzioni vuote o segnaposto.
- Stack vincolante: Vite + Svelte 5 (runes) + TypeScript strict + Capacitor 8 Android. Niente CDN: tutto incluso nell'app, che deve funzionare offline.
- Logica in funzioni pure dentro `src/lib/logic`, ognuna con test Vitest accanto (`*.test.ts`).
- Fine di ogni fase, sempre in quest'ordine:
  1. `npm run verify` (typecheck + test + build) deve passare senza errori;
  2. `npx cap sync android`;
  3. aggiorna `CHANGELOG.md` con una sezione `## [X.Y.Z] - AAAA-MM-GG` e la versione in `package.json`;
  4. commit, push e tag `vX.Y.Z` (il tag fa partire la build dell'APK su GitHub Actions);
  5. dai all'utente il link https://github.com/Nikcirri/armadio/releases/latest e un elenco breve di cose da provare sul telefono.
- L'utente è un principiante assoluto e usa solo il telefono: istruzioni passo passo, parole semplici, niente comandi da terminale per lui.
- La chiave di firma non va mai nel repository. Vive solo nei Secrets di GitHub (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, alias `armadio`). Non cambiarla mai: con una chiave diversa gli aggiornamenti non si installano sopra la versione vecchia.
- Non cambiare `appId` (`com.nikcirri.armadio`), per lo stesso motivo.
- Testi dell'interfaccia in italiano; codice e nomi in inglese.
