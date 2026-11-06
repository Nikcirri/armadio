# Armadio — Specifica completa (SPEC.md)

Questo file è la fonte di verità del progetto. Leggilo tutto prima di ogni fase e rispettalo. Se qualcosa è ambiguo o in conflitto, chiedi prima di decidere.

## 0. Ruolo e metodo
- Agisci come Senior Mobile Engineer (app ibride con Capacitor) e Lead UI/UX Designer.
- Lavori a fasi (sezione 13). In ogni fase implementi per intero ciò che la fase chiede: niente codice troncato, niente "// TODO", niente funzioni vuote o segnaposto.
- Alla fine di ogni fase devono passare typecheck, test automatici, build web e build Android. Poi aggiorni CHANGELOG.md e la versione in package.json e fai commit e push su main: GitHub Actions crea tag, APK e Release.
- L'utente non è uno sviluppatore: quando deve fare qualcosa (Secrets di GitHub, installazione, prove), dagli istruzioni passo passo pensate per il telefono.

## 1. Obiettivo e vincoli
- App Android "Armadio": armadio virtuale, outfit, generatore "Cosa metto?", lavanderia, agenda, valigia, diario dei ricordi, wishlist e statistiche.
- Si installa come APK e si comporta come un'app del Play Store: icona, splash screen, tasto Indietro, nessuna barra del browser. Icona: gruccia color crema su marrone (#7a5c3f), adattiva e con il livello monocromatico per le icone a tema; schermata di avvio color sabbia (#f5efe6, nera con il tema scuro del telefono) con l'icona al centro. Sorgenti in resources/.
- 100% offline: nessun account, nessun server, nessuna analitica. Dati e foto restano sul telefono. Nessuna risorsa da CDN: font, icone e librerie sono inclusi nell'app.
- Distribuzione gratuita: APK firmato pubblicato su GitHub Releases da GitHub Actions. Lo stesso codice è pubblicabile come PWA su GitHub Pages per chi ha iPhone (obiettivo secondario).
- Interfaccia in italiano. Utenti di qualsiasi genere: nessun presupposto nei testi, preset scelto al primo avvio.
- Android 8 o superiore, schermi da 360 px di larghezza in su, fluida su telefoni di fascia media.

## 2. Stack tecnico (vincolante)
- Vite + Svelte 5 + TypeScript in modalità strict. CSS con variabili, nessuna libreria UI pesante.
- Capacitor (ultima versione stabile) con piattaforma Android. Plugin ufficiali: @capacitor/camera, @capacitor/filesystem, @capacitor/share, @capacitor/app, @capacitor/haptics, @capacitor/status-bar, @capacitor/splash-screen, @capacitor/local-notifications. Per lo scontorno AI e per il blocco con impronta scegli plugin mantenuti e motiva la scelta.
- Database: IndexedDB tramite Dexie.js, con versioni e migrazioni dello schema.
- Backup: ZIP con fflate.
- Icone dell'interfaccia: set SVG incluso (es. Lucide). Le emoji sono ammesse come decorazione, mai come unico portatore di significato.
- Test: Vitest per tutta la logica pura.
- Elaborazione immagini in un Web Worker con OffscreenCanvas (fallback su canvas normale) per non bloccare l'interfaccia.
- Struttura: src/lib/db (schema, migrazioni, repository), src/lib/logic (lavanderia, generatore, valigia, statistiche, colori), src/lib/media (foto, editor, scontorno), src/lib/ui (componenti), src/views (le 5 sezioni), src/workers.
- CI con GitHub Actions:
  - quando su main cambia la versione in package.json (o a ogni tag v*), se la Release non esiste ancora: build web, cap sync, build Gradle release firmata con il keystore preso dai Secrets (file in base64 + password), pubblicazione di una Release con il file Armadio-vX.Y.Z.apk e le note dal CHANGELOG;
  - versionCode incrementato automaticamente, versionName uguale al tag;
  - workflow separato e facoltativo, avviato solo a mano, che pubblica la versione PWA su GitHub Pages (con manifest e service worker veri: il service worker è generato al build con l'elenco di tutti i file, quindi la versione web funziona senza internet; quando è pronta una versione nuova compare un messaggio con "Ricarica"). Nell'app Android il service worker non viene registrato;
  - il keystore non va mai nel repository.

## 3. Modello dati (Dexie, database "ArmadioDB")
Id: UUID in formato stringa. Date: "YYYY-MM-DD"; timestamp: ISO. Ogni record ha createdAt e updatedAt.

- photos: id, blob (immagine principale, lato lungo 1200 px, WebP qualità 0.8), thumb (320 px), width, height.
- categories: id, name, slotType, icon, defaultMaxWears (null = non si lava a utilizzi), bulkWeight, order.
- items: id, name, categoryId, slotType (copiato dalla categoria per gli indici), photoIds[] (la prima è la copertina; massimo 4: fronte, retro, etichetta, indossato), status, statusNote, hasStain, maintenanceTags[], loanTo, loanDate, ownerId, locationId, favorite, colors[] (il primo è il principale), fabrics[], season, warmth, cutStyle, intimateNote, underwearIds[] (capi Intimo da mettere sotto, es. il reggiseno bianco sotto la maglietta bianca), waterproof, walkability, bagSize, occasions[], washTags[], fitNote, brand, size, price, purchaseDate, resalePrice, wearCount, lastWornDate, wearsSinceWash, maxWearsBeforeWash, notes.
- wearLog (fonte di verità degli utilizzi): id, date, itemIds[] (indice multiEntry), itemNames[] (copia dei nomi, così lo storico resta leggibile se un capo viene eliminato), outfitId?, diaryId?. wearCount e lastWornDate dei capi sono valori derivati, aggiornati nella stessa transazione.
- outfits: id, name, itemIds[], wishlistIds[], season, occasions[], weatherTags[], layout (posizioni dei pezzi nel collage), favorite, notes, incomplete (true se un capo è stato eliminato).
- diary: id, date, outfitId?, itemIds[], location, people[], note, photoIds[] (polaroid).
- planner: date (chiave primaria), outfitId?, itemIds[], note.
- trips: id, name, startDate, endDate, luggageType, templateId, weather, outfitIds[], extraItemIds[], wearInTransitIds[], checklist[{id, label, qty, checked}], packedItemIds[], status (planning, packed, travelling, done).
- wishlist: id, name, categoryId, photoIds[], price, storeOrLink, colors[], season, occasions[], priority, notes.
- lists: id, kind (owner, location, occasion, fabric, maintenance, person, packingTemplate), name, order, extra (es. contenuto di un template valigia).
- settings (chiave → valore): profile (userName, measurements, brandSizes[]), theme (palette, mode: system/light/dark), preset, backup (lastBackupDate, changesSinceBackup), notifications, appLock, antiRepeatDays, occasionMatrix, schemaVersion, endOfDay (data e capi indossati in attesa di "Fine giornata", null se non c'è niente da chiudere).

Regole di integrità:
- Eliminare un capo: un dialogo elenca dove è usato (outfit, viaggi, agenda). Il capo viene tolto ovunque, gli outfit toccati diventano "incompleti", lo storico resta. Un toast con "Annulla" per 5 secondi ripristina tutto in una sola transazione.
- Eliminare una categoria: obbligatorio scegliere dove spostare i suoi capi.
- Ogni operazione che tocca più tabelle avviene in una transazione.
- Migrazioni: ogni cambio di schema è una nuova versione Dexie con una funzione di migrazione non distruttiva e un test dedicato.
  - Schema 2 (versione 1.1): aggiunge underwearIds = [] a tutti i capi e, se l'app è già configurata e non ha categorie di intimo, quelle del preset. La stessa migrazione vale per i backup dello schema 1.
  - Schema 3 (versione 1.2): con il preset Neutro aggiunge la categoria Reggiseni, se l'app è già configurata e non c'è. Vale anche per i backup dello schema 2.
  - Schema 4 (versione 1.2.1): Reggiseni è predefinita in tutti i preset; la aggiunge in fondo (con qualsiasi preset) se l'app è già configurata e non c'è. Vale anche per i backup dello schema 3.

## 4. Categorie e macro-slot
Otto macro-slot con soglia di lavaggio e ingombro predefiniti (modificabili per categoria e per singolo capo):

| slot | esempi | soglia lavaggio (usi) | ingombro (punti) |
| top_base | T-shirt, camicie, top, body, polo | 1 | 1 |
| top_layer | maglioni, cardigan, felpe, gilet | 3 | 2 |
| bottom | pantaloni, jeans, gonne, shorts | 4 | 2 |
| full_body | abiti, tute | 2 | 2 |
| outerwear | giacche, cappotti, trench, piumini, blazer | 10 | 4 |
| shoes | sneakers, stivali, scarpe eleganti, sandali, mocassini | nessuna | 3 |
| accessory | borse, cinture, sciarpe, cappelli, gioielli, occhiali, cravatte | nessuna | 1 |
| underwear | reggiseni, slip, boxer, calze, collant, canottiere intime | 1 | 1 |

L'intimo (slot underwear) non ha un rullo in "Cosa metto?" e non compare nel collage (neanche nell'immagine condivisa): si collega ai capi con cui va (scheda capo) e l'app lo propone quando servono quei capi.

Preset al primo avvio: Donna, Uomo, Neutro. Il preset cambia solo le categorie iniziali e i suggerimenti (es. note intimo); tutto resta modificabile. Categorie di intimo: Donna → Reggiseni (soglia 3 utilizzi), Slip e culotte, Calze e collant; Uomo → Boxer e slip, Canottiere, Calzini, Reggiseni (soglia 3 utilizzi); Neutro → Intimo, Reggiseni (soglia 3 utilizzi), Calze e calzini. Hanno id fissi, così l'aggiornamento dello schema e i backup vecchi le aggiungono una volta sola, senza doppioni. Categorie: aggiungi, rinomina, riordina, elimina con riassegnazione dei capi. Nel foglio della categoria si sceglie prima il tipo di capo, poi l'icona: circa 70 emoji divise in gruppi (Sopra, Sotto e abiti, Scarpe, Accessori, Intimo e notte, Mare e sport, Altro), con il gruppo del tipo scelto in cima e un'etichetta per i lettori di schermo. In una categoria nuova, finché non si tocca un'icona, cambiare tipo propone l'icona tipica di quel tipo.

## 5. Stati del capo e lavanderia
Stati (pillole con icona e testo):
- Pulito: disponibile. Imposta wearsSinceWash = 0 e hasStain = false.
- Da lavare: interruttore "Macchia da pre-trattare".
- Steso ad asciugare.
- Da stirare.
- In valigia (collegato a un viaggio).
- In prestito: a chi e da quando.
- In manutenzione: tag rapidi (levapelucchi, bottone/zip, suola/camoscio, tacco, tintoria) + nota.
- Da vendere: prezzo di vendita + "Copia annuncio".

Un capo è disponibile se è Pulito e non si trova nella posizione "Scatola cambio stagione".

Ciclo: Da lavare → Steso → Da stirare (facoltativo) → Pulito. Il passaggio a Pulito azzera gli utilizzi dall'ultimo lavaggio.

Vista Lavanderia:
- in cima i capi con macchia da pre-trattare;
- i capi da lavare divisi in carichi suggeriti per programma (a mano, delicati, 30°, 40°, a secco) e per colore (chiari, scuri, colorati), con avviso se un carico mescola bianchi con rossi o scuri;
- "Lava tutto insieme" (visibile quando ci sono almeno 2 lavatrici): unisce in un solo lavaggio tutti i capi da lavatrice (delicati, 30°, 40°, di qualsiasi colore) con il programma più delicato tra quelli presenti. Se mescola bianchi con rossi o scuri mostra l'avviso con "Dividi per colore" (resta il programma unico, ma chiari e scuri in due lavatrici). "Torna ai carichi suggeriti" ripristina la divisione. I capi a mano e a secco restano sempre a parte;
- pulsanti rapidi per ogni carico: "Steso ad asciugare", "Da stirare", "Tutto pulito";
- righe dedicate a Stesi, Da stirare e In manutenzione, con tasto "Pulito".

Scarpe e accessori non usano la soglia di lavaggio; possono andare in manutenzione.

## 6. Foto
- Acquisizione con @capacitor/camera: Scatta (fotocamera posteriore), Galleria, Multi-foto (fino a 20, con barra di avanzamento e tasto Annulla).
- Multi-foto: per ogni foto crea una bozza nella categoria scelta, con colore rilevato; alla fine mostra una lista per rinominare e confermare velocemente.
- Correzione automatica dell'orientamento EXIF. Salvataggio: immagine principale 1200 px + miniatura 320 px. Le griglie usano solo le miniature.
- Editor non distruttivo (l'originale resta fino al salvataggio; tasto "Ripristina originale"): ruota 90°, ritaglio libero, 3:4 o 1:1 con maniglie, luminosità e contrasto con cursori, scontorno.
- Scontorno in tre livelli:
  1. AI sul telefono con ML Kit Subject Segmentation tramite un plugin Capacitor mantenuto (verifica quale; es. il progetto capacitor-mlkit). Se il modello non è disponibile, si passa al livello 2;
  2. flood-fill dai 4 angoli con cursore di tolleranza;
  3. pennello manuale Gomma/Ripristina con zoom, sempre disponibile per rifinire.
- Rilevamento colore: ignora pixel trasparenti e bordi, k-means (k = 3) nello spazio colore Lab, abbina ogni gruppo al colore più vicino della palette; preseleziona 1-2 colori che l'utente conferma.
- Palette colori: Nero, Bianco, Panna/Beige, Grigio, Blu navy, Azzurro/Denim, Verde, Oliva, Rosso, Bordeaux, Rosa, Giallo, Arancio, Viola, Marrone/Cuoio, Oro/Argento, Fantasia/Multicolor. Neutri: nero, bianco, panna/beige, grigio, blu navy, denim, marrone.
- Lightbox con zoom a due dita e scorrimento tra le foto del capo.

## 7. Navigazione e design
- Barra in basso con 5 tab: Armadio, Outfit, Cosa metto?, Agenda, Altro.
- Barra in alto compatta: titolo, pillola stato (es. "42 puliti · 7 da lavare"; toccandola si apre la Lavanderia), menu ⋮.
- Pulsante "+" fluttuante e contestuale: in Armadio apre Scatta / Galleria / Multi-foto; in Outfit "Nuovo outfit"; in Agenda "Nuovo viaggio".
- Moduli in fogli che salgono dal basso, chiudibili con uno swipe. Vietati alert(), confirm() e prompt(): solo dialoghi e toast dell'app.
- Tasto Indietro di Android: prima chiude il foglio o il dialogo aperto, poi torna alla vista precedente, infine chiede un doppio tocco per uscire.
- Stile editoriale elegante: 4 palette (Sabbia, Cipria, Salvia, Lavanda) × Chiaro, Scuro OLED, Come il sistema. Status bar e barra di navigazione di Android colorate di conseguenza.
- Ergonomia: aree di tocco minime 48 px, testo degli input 16 px, margini sicuri (status bar, notch, barra dei gesti). Zoom non bloccato.
- Vibrazione leggera sulle azioni principali. Animazioni ≤ 200 ms, disattivate se il sistema chiede movimento ridotto.
- Ogni lista vuota ha uno stato vuoto con spiegazione e pulsante d'azione.
- Prestazioni: griglia virtualizzata oltre 200 capi, URL delle immagini liberati quando non servono, avvio sotto i 2 secondi e scorrimento fluido con 500 capi e 1.500 foto.
- Accessibilità: etichette per lettori di schermo, contrasto AA, significato mai affidato solo al colore o alle emoji. Un test controlla il contrasto AA di tutte le palette, chiare e scure, leggendo i colori da app.css.

## 8. Sezioni

### 8.1 Armadio
- Ricerca su nome, brand, note e tessuto. Filtri combinabili a chip: categoria, stato, posizione (con interruttore "nascondi scatola cambio stagione"), proprietario, colore, stagione, pesantezza, taglio, occasione, preferiti. Contatore dei risultati e "Azzera filtri".
- Ordinamento: più recenti, più indossati, meno indossati, non indossati da più tempo, miglior costo per utilizzo, nome A-Z, prezzo.
- Controlla doppioni: gruppi di capi con stessa categoria e stesso colore principale (e tessuto simile), confrontati anche con la wishlist.
- Selezione multipla: si attiva con il pulsante "Seleziona" oppure tenendo premuto un capo (che risulta già selezionato, con una leggera vibrazione). Azioni: cambia stato, sposta posizione, metti in valigia (scegli il viaggio), aggiungi a un outfit, elimina. Ogni azione di massa ha "Annulla".
- Cambio stagione guidato: scegli la stagione da riporre → anteprima dei capi → sposta in "Scatola cambio stagione"; operazione inversa per tirarli fuori.
- Scheda capo (foglio a tutta altezza, sempre modificabile, salvataggio esplicito con avviso se esci senza salvare):
  - foto (fino a 4) con lightbox ed editor, preferito;
  - stato con i campi contestuali della sezione 5;
  - proprietario e posizione (liste personalizzabili; i capi non "Mio" si usano negli outfit ma non contano nella spesa e nel valore dell'armadio);
  - nome, categoria, colori, tessuti (chip + testo libero), stagione (Primavera/Estate, Autunno/Inverno, 4 stagioni), pesantezza (Leggero, Medio, Pesante), taglio (Regolare, Vita alta, Vita bassa, Corto/Crop, Oversize, Aderente, Slim);
  - intimo: "Cosa metti sotto" collega uno o più capi Intimo (con il selettore a foglio) più una nota libera con suggerimenti dal preset (es. "reggiseno senza spalline"). Nella scheda di un capo Intimo c'è invece "Va sotto a", con i capi collegati, modificabile da lì; eliminando un capo Intimo il collegamento sparisce ovunque (e torna con "Annulla");
  - campi per slot: scarpe → impermeabile, comodità (tutto il giorno, media, solo serata); borse → capienza (mini, media, grande);
  - occasioni multiple (Casual, Studio/Lavoro, Serata, Elegante/Cerimonia, Sport/Relax, Mare/Vacanza; lista personalizzabile);
  - etichette di lavaggio cliccabili (a mano, max 30°, max 40°, delicati, no centrifuga, no asciugatrice, stiro delicato, lavaggio a secco);
  - vestibilità, brand, taglia, prezzo, data di acquisto, note;
  - utilizzi: totale, dall'ultimo lavaggio / soglia, ultima volta, costo per utilizzo (prezzo ÷ utilizzi, "—" se zero) ed elenco delle date dallo storico; i tasti + e − aggiungono o tolgono una voce nello storico;
  - "Outfit con questo capo" (miniature) e "Crea outfit con questo capo";
  - Duplica ed Elimina.

### 8.2 Outfit
- Libreria: griglia di collage con filtri per occasione, stagione, meteo (Caldo, Mite, Freddo, Pioggia), preferiti, "mai indossati", "non indossati da 30+ giorni", "incompleti". Un outfit risulta indossato quando nello storico c'è una voce con il suo id.
- Builder: Spezzato (sopra base + strato facoltativo + sotto) oppure Intero; più capospalla, scarpe e più accessori insieme; Intimo facoltativo (anche più capi), con i "Consigliati" collegati ai capi scelti da aggiungere con un tocco. Selettore a foglio filtrato per slot, con ricerca e solo capi disponibili (interruttore per vederli tutti). Interruttore "Includi wishlist".
- Collage automatico (capospalla e sopra in alto, sotto al centro, scarpe in basso, accessori di lato) su sfondo neutro; i pezzi si possono spostare e ridimensionare e le posizioni vengono salvate.
- Barra della palette combinata e avvisi dalle note di intimo e vestibilità (es. "Questo abito richiede un reggiseno senza spalline"). Nel dettaglio, "Da ricordare" mostra anche l'intimo collegato ai capi che non è nell'outfit (es. "Sotto Maglietta bianca: Reggiseno bianco", con il motivo se non è disponibile) e "Aggiungi" lo mette nell'outfit.
- Semaforo: verde se tutti i capi sono disponibili; altrimenti elenca ogni capo bloccato e il motivo (da lavare, steso, da stirare, in valigia, in prestito, in manutenzione, da vendere, in scatola cambio stagione; i pezzi della wishlist risultano "da comprare").
- "Indossa oggi" (o in un'altra data): crea la voce nel wearLog, aggiorna i contatori, toast con "Annulla" per 5 secondi. Poi propone "Fine giornata": i capi arrivati alla soglia vanno in Da lavare (con opzione macchia), gli altri restano puliti. Se attivata (Impostazioni → promemoria serale, con orario), una notifica locale all'orario scelto ricorda di farlo, solo nei giorni in cui hai indossato qualcosa; toccandola si apre "Fine giornata".
- Diario dei ricordi (sotto-tab): timeline globale con data, luogo, persone (chip con completamento dai nomi già usati), nota, foto polaroid e outfit. Le voci si possono aggiungere anche a posteriori.
- Filtro "Mai indossato con…": scegli una persona e vedi gli outfit mai usati in sua compagnia.
- Condividi: immagine collage elegante generata su canvas, inviata con il menu di condivisione di Android o salvata in galleria (cartella Immagini/Armadio).
- Eliminare un outfit: viene tolto da viaggi e agenda; le voci del diario tengono i suoi capi; lo storico resta. Toast con "Annulla".

### 8.3 Cosa metto?
- Input: temperatura (Caldo, Mite, Freddo), interruttori Pioggia e A cipolla, occasione (facoltativa), armonia dei colori (Libera, Neutri/Monocromatico, Contrasto bilanciato), "Coordina scarpe e borsa/cintura", "Dai una possibilità ai dimenticati", "Solo capi disponibili" (attivo di default).
- Regole:
  - Caldo: leggero o medio, stagione Primavera/Estate o 4 stagioni, niente capospalla salvo sera. Mite: medio, capospalla leggero facoltativo. Freddo: medio o pesante, capospalla obbligatorio.
    Dettaglio: con il caldo niente capi pesanti (scarpe comprese) e, la sera, solo capospalla leggero; con il mite niente capi pesanti e capospalla facoltativo (leggero o medio); con il freddo stagione Autunno/Inverno o 4 stagioni, niente scarpe leggere, strato, sotto, abito e capospalla medi o pesanti, e la base leggera solo sotto uno strato.
  - Pioggia: solo scarpe impermeabili; esclusi camoscio, seta e lino.
  - A cipolla: obbligatori sopra base leggero + strato + capospalla.
  - Con un'occasione scelta, ogni capo deve avere quell'occasione (i capi senza occasioni valgono per tutte). Senza occasione sono vietate le coppie incompatibili della matrice (default: Sport/Relax con Elegante/Cerimonia o Serata; Mare/Vacanza con Studio/Lavoro), modificabile nelle impostazioni.
  - Tagli: privilegia Corto/Crop con Vita alta e Oversize con Aderente/Slim; evita Oversize sopra e sotto insieme.
  - Colori: Neutri/Monocromatico = solo neutri o una sola famiglia di colore; Contrasto bilanciato = neutri + al massimo un colore d'accento (la fantasia conta come accento).
  - Evita i capi indossati negli ultimi 3 giorni (impostabile; non vale per scarpe e accessori) e gli outfit identici a quelli degli ultimi 14 giorni. Se così non resta nessuna combinazione, la regola si allenta e lo dice. I capi bloccati con il lucchetto restano sempre.
  - Struttura: Spezzato (sopra + sotto, strato e capospalla secondo il clima) o Intero (abito o tuta); scarpe sempre; un accessorio facoltativo (con "Coordina" si preferiscono borsa o cintura nella stessa famiglia di colore delle scarpe).
- Motore a punteggio: genera i candidati validi, assegna un punteggio con le regole morbide e sceglie a caso tra i migliori, così ogni giro è diverso ma sensato.
- Rulli per slot con frecce, rigenera singolo, lucchetto e "Gira tutto". Sotto, chip "Perché funziona" (es. "Crop + vita alta", "Scarpe impermeabili").
- Se non esiste nessuna combinazione valida, spiega quale slot manca (es. "Nessuna scarpa impermeabile pulita").
- "Intimo": per ogni capo proposto con dell'intimo collegato, il primo disponibile (oppure il primo, con il motivo). Ogni voce si toglie o rimette con un tocco; quelle non disponibili partono tolte.
- Pulsanti "Salva outfit" e "Indossa subito" (includono l'intimo rimasto selezionato).

### 8.4 Agenda (planner + valigia)
- Calendario su date reali: vista settimana scorrevole e vista mese. Nel passato mostra cosa hai indossato (dallo storico), nel futuro cosa hai pianificato. I giorni di viaggio compaiono come una fascia.
- Per ogni giorno: outfit (o capi singoli) e nota. Badge giallo se un capo pianificato non sarà disponibile (non pulito o macchiato).
- Viaggi:
  - nome, date di partenza e ritorno (giorni calcolati), meteo previsto, bagaglio: zaino sotto-sedile (12 punti), trolley cabina (25), valigia grande (50);
  - outfit per ogni giorno di viaggio (collegati all'agenda) + capi extra;
  - barra di riempimento calcolata sui capi unici; "Indosso in viaggio" toglie dal conteggio i capi indossati durante il trasferimento;
  - template modificabili e salvabili (Weekend in città, Mare, Montagna/Freddo, Lavoro) che precompilano il necessaire;
  - lista unica dei capi senza doppioni, con il numero di look in cui servono ("Jeans blu — 3 look"); l'intimo collegato ai capi del viaggio entra da solo nella lista ("Reggiseno bianco — sotto Maglietta bianca"), il primo collegato di ogni capo se nella lista non ce n'è già uno;
  - note intimo dei capi scelti aggiunte in evidenza alla checklist;
  - allarme pre-partenza per i capi non disponibili ("Da lavare prima di partire");
  - necessaire con quantità calcolate sui giorni (intimo e calzini = giorni + 1, pigiama, beauty, caricabatterie, documenti, sacchetto per i panni sporchi), personalizzabile;
  - spuntare un capo lo mette nello stato In valigia;
  - "Disfa valigia": per ogni capo scegli Da lavare o Pulito (di default Da lavare se risulta indossato in agenda), tutto in un solo passaggio.
  - Dettagli: l'outfit di ogni giorno del viaggio è il giorno dell'agenda (planner); `outfitIds` del viaggio sono gli outfit da portare senza un giorno preciso. Un look = un giorno pianificato oppure un outfit senza giorno. I punti di ingombro vengono dalla categoria del capo. "Indossato in agenda" = nello storico durante il viaggio, oppure pianificato per un giorno del viaggio già passato. Togliere la spunta rimette il capo Pulito senza azzerare gli utilizzi. Eliminare un viaggio (con "Annulla") lascia i giorni dell'agenda e rimette Pulito i capi ancora in valigia. Cambiando le date si ricalcolano le quantità del necessaire che vengono dal template. I template si gestiscono da Agenda → Viaggi → "Template valigia"; "Salva come template" crea un template dal necessaire del viaggio.

### 8.5 Altro
- Wishlist: schede con foto, prezzo, link o negozio, priorità; "Si abbina con N capi" calcolato con le regole del generatore; avviso se possiedi già capi simili; "Comprato!" lo sposta nell'armadio tenendo foto e dati e chiedendo prezzo e data.
- Taglie e misure: misure del corpo in cm e taglie per brand (es. Levi's 27, Zara M, Nike 38.5), consultabili offline in negozio.
- Decluttering: capi Da vendere, suggerimenti (non indossati da 12 mesi, costo per utilizzo alto), ricavo stimato e "Copia annuncio" per Vinted/Wallapop (titolo + descrizione con brand, taglia, colore, tessuto, condizioni e misure se presenti).
- Statistiche: valore dell'armadio (solo capi "Mio"), spesa per anno, costo medio per utilizzo, percentuale di capi indossati negli ultimi 90 giorni, top 5 più indossati, migliori investimenti (costo per utilizzo più basso), dimenticati (con "Abbinalo ora", che apre il generatore con quel capo bloccato), distribuzione per colore, categoria, stato e posizione. Capsule score = numero di outfit validi secondo le regole del generatore (senza filtro meteo), calcolato in un worker e mostrato come "oltre 10.000" se supera il limite.
- Categorie e liste: categorie, proprietari, posizioni, occasioni, tessuti, tag di manutenzione, persone, template valigia.
- Impostazioni: nome dell'app, tema, preset, giorni anti-ripetizione, matrice delle occasioni, notifiche (promemoria serale, promemoria backup), blocco dell'app facoltativo con impronta o PIN di sistema.
- Backup e dati (sezione 10). Info: versione, "Controlla aggiornamenti", guida rapida.
- Dettagli della sezione Altro:
  - Wishlist: "Si abbina con N capi" conta i capi dell'armadio (non da vendere) negli slot compatibili, con occasioni compatibili secondo la matrice e stagione non opposta. "Simili" = stessa categoria e stesso colore principale. "Comprato!" crea il capo (stesse foto e dati, prezzo e data chiesti) e negli outfit il desiderio diventa il capo vero; c'è "Annulla".
  - Decluttering: "non indossati da 12 mesi" usa l'ultima volta indossato (o, se mai indossato, la data di acquisto o di inserimento); "costo per utilizzo alto" = almeno 15 € e almeno il triplo della mediana dei capi indossati. Il ricavo stimato usa il prezzo di vendita, oppure il 30% del prezzo pagato (indicato come stima). "Metti in vendita" porta il capo su Da vendere.
  - Intimo: escluso da "più indossati", "migliori investimenti", "dimenticati" e dai suggerimenti del decluttering (conta invece in valore, spesa e distribuzioni).
  - Statistiche: i capi senza proprietario contano come "Mio"; "dimenticati" = non indossati da almeno 30 giorni (stessa soglia del generatore). Il capsule score conta tutti i capi tranne quelli da vendere: Spezzato (sopra + sotto, strato e capospalla facoltativi) o Intero, con scarpe; accessori esclusi; vale solo la regola delle occasioni.
  - Liste: si aggiungono, rinominano, riordinano ed eliminano (con "Annulla"). "Mio", "Armadio principale" e "Scatola cambio stagione" si possono rinominare ma non eliminare. Eliminando un proprietario i suoi capi passano a "Mio", una posizione all'Armadio principale; un'occasione sparisce da capi, outfit, wishlist e matrice. Rinominando tessuti, tag di manutenzione e persone il nome cambia anche nei capi e nel diario.
  - Blocco dell'app: con impronta, volto o PIN del telefono, all'apertura e quando torni dopo almeno un minuto.

## 9. Primo avvio
Tre schermate: nome; preset Donna, Uomo o Neutro; palette e tema. Poi la scelta tra "Inizia vuoto", "Carica esempio" (8 capi disegnati su canvas, 2 outfit e 1 viaggio, marcati come demo ed eliminabili con un tocco) e "Ripristina un backup".

## 10. Backup e sicurezza dei dati
- Avviso chiaro: disinstallare l'app cancella i dati; il backup è l'unica copia di sicurezza.
- Esporta: file "Armadio-backup-AAAA-MM-GG.zip" con data.json (schemaVersion, appVersion, exportedAt, tutte le tabelle) e la cartella photos/. Creato a pezzi per non esaurire la memoria. Salvato in Documenti/Armadio e proposto con il menu Condividi (Drive, WhatsApp, email). Azzera changesSinceBackup.
- Importa: scegli il file, verificalo, mostra un riepilogo (quanti capi, outfit e foto), poi "Sostituisci tutto" (prima crea in automatico un backup dei dati attuali) oppure "Unisci" (per id; vince il record con updatedAt più recente). Le migrazioni si applicano anche ai backup di versioni vecchie.
- Promemoria: badge dopo 10 modifiche o 14 giorni dall'ultimo backup.
- Backup automatico settimanale facoltativo in Documenti/Armadio, conservando gli ultimi 3.
- "Svuota tutto" richiede di scrivere SVUOTA.
- Nella versione web chiama navigator.storage.persist().

## 11. Internet (solo facoltativo)
L'app non richiede mai internet. Unica eccezione: "Controlla aggiornamenti" interroga l'ultima Release del repository GitHub, confronta la versione e propone di scaricare il nuovo APK. Avviene quando l'utente tocca il pulsante e, se c'è connessione, al massimo una volta al giorno in silenzio (solo nell'app Android). Se c'è una versione nuova compare un messaggio con "Scarica"; in Altro → Informazioni si vedono la versione nuova, le prime novità e il pulsante "Scarica l'aggiornamento", che apre l'APK nel browser del telefono. Nessun altro traffico di rete.

## 12. Qualità del codice
- TypeScript strict con svelte-check. Codice e nomi in inglese; testi dell'interfaccia in italiano scritti direttamente nei componenti (l'app è solo in italiano), messaggi di errore per l'utente in `src/lib/errors.ts` e nei moduli di logica.
- Tutta la logica (soglie di lavaggio, semaforo, generatore, calcolo valigia, statistiche, colori, migrazioni, unione dei backup) in funzioni pure con test Vitest.
- Gestore errori globale: nessun crash, toast comprensibile e registro errori esportabile dalle Impostazioni.
- README.md per l'utente: come installare, aggiornare e fare il backup. CHANGELOG.md aggiornato a ogni versione.
- CLAUDE.md con le regole di lavoro e il rimando a questo file.

## 13. Fasi
0. Fondamenta e distribuzione: progetto, CI, APK firmato, navigazione vuota.
1. Dati, impostazioni, tema, primo avvio, backup, esempio, toast con Annulla.
2. Foto ed editor.
3. Armadio e scheda capo.
4. Lavanderia e cambio stagione.
5. Outfit, Indossa oggi, diario, condivisione; nella scheda capo il pulsante "Crea outfit con questo capo".
6. Cosa metto?
7. Agenda e valigia.
8. Altro: wishlist, taglie, decluttering, statistiche.
9. Rifinitura: prestazioni, accessibilità, icona e splash definitivi, controllo aggiornamenti, versione 1.0.

Ogni fase termina con un APK installabile e un elenco di cose da provare sul telefono.
