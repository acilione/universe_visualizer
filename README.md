# ÆTHER — Atlante cosmico e planetario

Atlante 3D in italiano, ispirato alla scena olografica di *Treasure Planet*. Si apre nel Sistema Solare con gli otto pianeti visibili e usa un catalogo locale di **6.360 esopianeti confermati**, estratto senza filtri dal NASA Exoplanet Archive. Lo snapshot contiene **4.769 stelle ospiti**; i **28 pianeti senza distanza** sono inclusi e consultabili. Importazione: **11 settembre 2026, ore 01:49 in Italia** (10 settembre, 23:49 UTC).

## Avvio

Node.js 22 o 24 e npm:

```sh
npm install
npm run dev
```

Apri **http://localhost:5173**. Per compilare e provare la versione statica:

```sh
npm run build
npm run preview -- --port 5174
```

`dist/` può essere pubblicata su un hosting statico HTTPS. Nessun backend, account o chiave API. Dati e texture sono locali; i font esterni hanno un fallback di sistema.

## Pianeti e zoom

- Il pulsante **Pianeti** apre il catalogo completo, con ricerca per pianeta o stella ospite, filtro e paginazione.
- Gli otto pianeti del Sistema Solare hanno superfici con texture locali e dimensioni visive amplificate. Saturno include gli anelli.
- Selezionare un pianeta dalla mappa o dal catalogo avvia una transizione ravvicinata. Il bersaglio dello zoom e della rotazione diventa quel pianeta.
- Rotellina, pulsanti +/− o gesto a due dita permettono di avvicinarsi ulteriormente. Il limite dello zoom dipende dal raggio del corpo, per evitare di entrare nella superficie.
- Un esopianeta apre il suo sistema ospite con tutti i pianeti confermati inclusi nello snapshot. Le orbite sono schematiche: fasi arbitrarie e separazioni compresse, con ordinamento basato sui dati disponibili.
- I pulsanti delle scale e **Ricentra** consentono di tornare alla vista d’insieme. La selezione della scala già attiva conserva l’oggetto scelto.

## Vista libera

La modalità immersiva nasconde pannelli, scritte, etichette, marcatori di selezione e griglia. Non contiene pulsanti con testo in sovrimpressione. **Esc** ripristina l’interfaccia; su touchscreen o dopo il movimento del puntatore compare un piccolo comando grafico per tornare alla mappa completa. I controlli di navigazione del canvas rimangono attivi.

La mappa normale riprende dal video `treasure_planet_map_video.mp4` il linguaggio di meridiani curvi azzurri, orbite luminose e particelle. Le transizioni e l’aspetto dei corpi sono adattamenti dell’atlante, non una riproduzione fotogramma per fotogramma.

## Altre funzioni

Cinque scale cosmiche (Sistema Solare, stelle vicine, Via Lattea, Gruppo Locale, rete cosmica), ricerca trasversale, 156 stelle aggiuntive reali da HYG, schede con fonti, livelli attivabili, viaggio guidato, suono sintetizzato localmente e preferenza per animazioni ridotte.

Comandi di base: trascina per orbitare, tasto destro per spostare, rotellina per zoom, `/` ricerca, `1`–`5` scala, `R` ricentra, `Spazio` rotazione, `Esc` chiude le finestre o esce dalla vista libera.

## VR e mani

Premi **Entra in VR** in un browser e visore compatibili con WebXR. Il tracciamento delle mani è opzionale; in alternativa sono utilizzabili i controller.

- Pizzico breve o grilletto: seleziona.
- Pizzico mantenuto o impugnatura: afferra, sposta e ruota.
- Due prese: ridimensiona e ruota attorno alle mani.
- **Avvicina** nel pannello del visore porta il pianeta selezionato a una dimensione comoda per osservarlo, muovendo la mappa e mantenendo fermo l’osservatore.
- **Libera** nasconde le scritte; un piccolo elemento sferico senza testo consente di ripristinare il pannello.
- **Ricentra** torna all’insieme; **Esci VR** o il menu del visore termina la sessione.

WebXR richiede un contesto sicuro ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)). Per un visore in rete usa HTTPS con un certificato attendibile dal dispositivo; un indirizzo LAN `http://...` non basta. Il server di sviluppo può utilizzare certificati esistenti:

```sh
TLS_CERT=/percorso/cert.pem TLS_KEY=/percorso/key.pem npm run dev
```

Le mani sono fornite dal visore, non da una webcam desktop. I test simulati non sostituiscono la verifica del tracciamento e del comfort su un visore fisico.

## Provenienza e limiti

“Tutti i pianeti” indica gli **otto pianeti del Sistema Solare più tutte le righe della tabella NASA `pscomppars` alla data di importazione**. Il conteggio è verificato prima e dopo il download. Candidati non confermati, lune, pianeti nani e oggetti non ancora presenti nell’archivio non sono inclusi. Non è un censimento di pianeti non osservati.

- [DATA_EXOPLANETS.md](DATA_EXOPLANETS.md): snapshot NASA, proprietà, null, aggiornamento e riconoscimenti. Massa da catalogo può essere `Msini` o stimata; temperatura di equilibrio non è temperatura superficiale. Le superfici esoplanetarie sono procedurali e illustrative.
- [TEXTURE_SOURCES.md](TEXTURE_SOURCES.md): texture Solar System Scope, CC BY 4.0, provenienza e interventi artistici. Le texture sono mappe composte, non immagini live.
- [DATA_SOURCES.md](DATA_SOURCES.md): stelle HYG v4.1 di David Nash, CC BY-SA 4.0, coordinate J2000 e fonti delle schede curate.

Dimensioni e distanze sullo schermo non sono tutte nella stessa scala. La Via Lattea e la rete cosmica restano ricostruzioni illustrative; le particelle decorative non sono un catalogo osservativo. Non viene calcolata un’effemeride attuale delle orbite.

Per aggiornare l’intero catalogo degli esopianeti:

```sh
python3 scripts/import_exoplanets.py
```

Per rigenerare le stelle vicine:

```sh
python3 scripts/import_nearby_stars.py
```

## Test

```sh
npm test
npm run build
npm run preview -- --port 5174
# In un secondo terminale:
npm run test:browser
```

Serve Chromium di Playwright (`npx playwright install chromium` se assente). `TEST_URL` può indicare un server diverso. Screenshot in `test-results/`. Test: completezza dello snapshot, coordinate, zoom, appartenenza ai sistemi, valori sconosciuti, presa delle mani, raycasting, sessione VR e navigazione desktop/mobile.

## Git

Il commit iniziale richiesto è `b09f3da`, con autore `acilione <antoninocilione96@gmail.com>`. Il video fornito è incluso come riferimento locale in quel commit. Dipendenze, build e output dei test sono esclusi da Git.

La verifica del renderer e dello zoom usa anche `npm run test:engine` con il server di sviluppo attivo su porta 5173 (oppure `ENGINE_TEST_URL`).
