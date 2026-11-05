# Novità

## [0.3.1] - 2026-11-06

- Tenendo premuto un capo si attiva la selezione multipla con quel capo già selezionato (con una leggera vibrazione). Poi basta toccare gli altri capi per aggiungerli.
- Se mentre tieni premuto stai scorrendo la lista, la selezione non parte.

## [0.3.0] - 2026-11-05

- Armadio: ricerca per nome, brand, tessuto, taglia e note (anche senza accenti).
- Filtri combinabili: categoria, stato, posizione, proprietario, colore, stagione, pesantezza, taglio, occasione e preferiti. La scatola del cambio stagione si può nascondere.
- Ordinamento: più recenti, più e meno indossati, non indossati da più tempo, miglior costo per utilizzo, nome, prezzo.
- "Doppioni": raggruppa i capi della stessa categoria e dello stesso colore (e di tessuto simile), confrontandoli anche con la wishlist.
- Selezione multipla: cambia stato, sposta, metti in valigia, aggiungi a un outfit o elimina più capi insieme, sempre con "Annulla".
- Scheda capo completa: 8 stati con i loro campi (macchia, prestito, manutenzione, vendita con "Copia annuncio" per Vinted, valigia), proprietario e posizione, colori, tessuti, stagione, pesantezza, taglio, nota intimo con suggerimenti, campi per scarpe e borse, occasioni, etichette di lavaggio, soglia lavaggi, brand, taglia, prezzo, data di acquisto, vestibilità, note.
- Utilizzi con tasti + e −, data dell'ultima volta, costo per utilizzo ed elenco delle date; outfit che contengono il capo.
- Duplica capo; avviso se esci dalla scheda senza salvare.
- Nella griglia: stato, macchia, preferito e "da lavare presto" a colpo d'occhio.

## [0.2.3] - 2026-11-05

- Corretto: "Lo scontorno automatico non è riuscito (… is already installed)". Il controllo del modulo di Google a volte dice che manca anche quando c'è: ora l'app prova subito lo scontorno e propone il download solo se Google segnala davvero che il modulo manca.

## [0.2.2] - 2026-11-05

- Corretto: lo scontorno automatico poteva far chiudere l'app. Ora usa un componente nativo dell'app che lavora in secondo piano su una copia ridotta della foto, senza bloccare lo schermo.
- Bordi dello scontorno più morbidi e naturali (l'AI indica quanto è sicura per ogni punto).
- Se lo scontorno non riesce, il messaggio mostra il motivo tra parentesi.
- L'editor usa meno memoria (tiene gli ultimi 5 passi da annullare).

## [0.2.1] - 2026-11-05

- Corretto: il pulsante "Automatico (AI)" sembrava non fare nulla perché la domanda per scaricare il modulo compariva dietro l'editor. Ora i dialoghi stanno sempre sopra a tutto (vale anche per "Ripristina originale" e "Uscire senza salvare?").
- Corretto: lo scontorno automatico ora toglie davvero lo sfondo. Il plugin restituisce la foto con il capo velato di colore: l'app ricava la sagoma confrontandola con l'originale, anche su sfondi a fantasia come un copriletto.
- Download del modulo di scontorno più affidabile (controllo anche quando il telefono non segnala la fine).

## [0.2.0] - 2026-11-05

- Pulsante "+" nell'Armadio: Scatta foto, Dalla galleria, Multi-foto (fino a 20 capi in una volta).
- Editor foto: ruota, ritaglia (3:4, 1:1 o libero), luce e contrasto, scontorno, pennello Gomma/Ripristina con zoom, "Annulla ultimo passo" e "Ripristina originale".
- Scontorno in tre modi: automatico con l'AI di Google sul telefono (si scarica una volta, poi funziona offline), "Dagli angoli" con la regolazione di quanto sfondo togliere, pennello per rifinire.
- Colori del capo rilevati in automatico dalla foto (ignorando lo sfondo), sempre modificabili.
- Multi-foto: crea un capo per ogni foto con il colore rilevato, poi una lista per rinominarli o scartarli.
- Foto salvate in 1200 px più una miniatura leggera; orientamento delle foto corretto in automatico.
- Armadio: griglia dei capi; toccando un capo si gestiscono fino a 4 foto (copertina, retro, etichetta, indossato), nome e colori, e lo si può eliminare con Annulla.
- Foto a schermo intero con zoom a due dita, doppio tocco e scorrimento tra le foto.
- Le elaborazioni pesanti girano in un worker separato: l'app resta fluida.

## [0.1.0] - 2026-11-05

- Primo avvio guidato: nome, tipo di armadio (Donna, Uomo, Neutro), colori e come iniziare.
- Si può iniziare vuoti, caricare un esempio (8 capi disegnati, 2 outfit, 1 viaggio) o ripristinare un backup.
- 4 palette (Sabbia, Cipria, Salvia, Lavanda) con tema chiaro, scuro o come il telefono.
- Sezione Altro: Impostazioni, Categorie, Backup e dati, Informazioni. Menu ⋮ in alto per arrivarci da ovunque.
- Categorie: aggiungi, modifica (nome, icona, tipo, lavaggi, ingombro), riordina ed elimina spostando i capi.
- Backup in un file .zip con dati e foto, da salvare su Drive o WhatsApp. Ripristino con "Sostituisci tutto" (prima salva una copia automatica) o "Unisci".
- Promemoria "Salva un backup" dopo 10 modifiche o 14 giorni; backup automatico settimanale facoltativo.
- "Svuota tutto" protetto: bisogna scrivere SVUOTA.
- Il tasto Indietro chiude fogli, pagine e dialoghi prima di cambiare sezione.
- Gli errori non chiudono l'app: vengono registrati e si possono condividere dalle Impostazioni.

## [0.0.1] - 2026-11-05

- Prima versione di prova: l'app si installa e si apre.
- Cinque sezioni in basso (Armadio, Outfit, Cosa metto?, Agenda, Altro), per ora vuote.
- Il tasto Indietro di Android torna alla sezione precedente; sulla prima sezione chiede un secondo tocco per uscire.
- Tema chiaro o scuro in automatico, come il telefono.
