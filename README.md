# ÆTHER — Atlante cosmico

Un atlante 3D interattivo in italiano, ispirato alle mappe olografiche della fantascienza. Cinque scale: Sistema Solare, stelle vicine, Via Lattea, Gruppo Locale e rete cosmica. Realizzato con Three.js e Vite, con geometrie e particelle generate localmente.

## Avvio

Richiede Node.js 22 o 24 e npm.

```sh
npm install
npm run dev
```

Apri **http://localhost:5173**. Per la build statica:

```sh
npm run build
npm run preview
```

La cartella `dist/` può essere servita da un hosting statico HTTPS. Non sono necessari backend o chiavi API. I font Google sono facoltativi: in assenza di rete vengono utilizzati i font di sistema.

## Esplorazione

- Trascina per orbitare; rotellina o pulsanti +/− per avvicinarti. Con il pulsante destro trascini il punto di osservazione.
- Su touchscreen, un dito ruota e due dita spostano/ridimensionano la vista.
- Seleziona un oggetto dalla mappa, dalla ricerca o dalle collezioni. Il pannello mostra informazioni, distanze e fonte. Alcuni oggetti consentono di entrare nella scala successiva.
- I cinque pulsanti e il cursore inferiore cambiano scala con dissolvenza. Il viaggio guidato attraversa le viste automaticamente.
- Le impostazioni controllano dettaglio, etichette, griglia, polvere e rotazione. Il suono ambiente è sintetizzato localmente e parte soltanto quando viene attivato.
- `/`: ricerca; `1`–`5`: scala; `R`: ricentra; `Spazio`: rotazione; `Esc`: chiude finestre o ripristina l’interfaccia in modalità cinema.

## VR e mani

Dal browser di un visore che supporta WebXR, premi **Entra in VR**, quindi il pulsante di avvio nel pannello. L’app rileva la disponibilità della sessione immersiva. Il tracciamento delle mani è una funzionalità opzionale: quando non è fornito dal dispositivo, restano disponibili i controller.

- Punta e fai un pizzico breve: seleziona un oggetto o un pulsante.
- Mantieni il pizzico: sposta e ruota la mappa attorno alla presa.
- Pizzica con entrambe le mani: sposta, ruota e cambia dimensione, con limiti per evitare scale inutilizzabili.
- Controller: grilletto per selezionare, impugnatura per afferrare.
- Un pannello **dentro il visore** contiene nome/distanza dell’oggetto, cambio scala, ricentramento e uscita. I comandi non dipendono dall’interfaccia HTML.

WebXR richiede un contesto sicuro e hardware/browser compatibili ([documentazione MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)). Per un visore connesso in rete, usa HTTPS con un certificato considerato attendibile dal visore. Un normale indirizzo LAN `http://...` non basta. Per usare un certificato esistente nel server Vite:

```sh
TLS_CERT=/percorso/cert.pem TLS_KEY=/percorso/key.pem npm run dev
```

Il certificato deve coprire il nome host utilizzato. In alternativa servi `dist/` tramite un hosting HTTPS. L’app non richiede una webcam desktop: le mani provengono dall’API di tracciamento del visore.

## Dati e limiti scientifici

È un atlante esplorativo con una selezione di oggetti reali, **non un censimento completo dell’universo conosciuto**. Distanze approssimate e sorgenti sono in `src/data.js` e nei pannelli dell’app.

- Sistema Solare: distanze orbitali medie reali; distanze sullo schermo compresse, dimensioni amplificate e fasi illustrative. Nessuna effemeride in tempo reale.
- Stelle vicine: coordinate equatoriali J2000 e distanze approssimate. Nessun aggiornamento per moto proprio.
- Via Lattea: spirale, polvere e stelle di sfondo procedurali; i punti luminosi decorativi non corrispondono a stelle censite. I riferimenti interni sono schematici.
- Gruppo Locale: direzioni e distanze approssimate rispetto al Sistema Solare, dimensioni delle galassie amplificate.
- Rete cosmica: struttura concettuale procedurale. I riferimenti sono oggetti reali, con collocazione schematica; non è una mappa tridimensionale derivata da un rilievo cosmologico. L’estensione indicata è un ordine di grandezza illustrativo e non una misura ricavabile dal canvas.

Fonti principali: [NASA — Galassie](https://science.nasa.gov/universe/galaxies/), [NASA — Sistema Solare](https://science.nasa.gov/solar-system/planet-sizes-and-locations-in-our-solar-system/), [NASA — Universo](https://science.nasa.gov/exoplanets/what-is-the-universe/), [SIMBAD](https://simbad.cds.unistra.fr/simbad/), [Tully et al. — Laniakea](https://arxiv.org/abs/1409.0880). Ogni oggetto ha un collegamento alla propria fonte in `data.js`.

## Verifica

```sh
npm test
npm run build
npm run preview -- --port 5174
# In un secondo terminale:
npm run test:browser
```

Il test browser richiede Chromium di Playwright (`npx playwright install chromium` se manca). `TEST_URL` permette di indicare un server diverso. Screenshot in `test-results/`.

I test coprono coordinate e integrità del catalogo, trasformazioni della presa a una/due mani, separazione fra selezione e trascinamento, errori di accesso VR, ingresso/uscita e ripristino dello stato, selezione con raggi, navigazione desktop e mobile. **Il tracciamento e il comfort su visore fisico devono essere validati sul dispositivo:** i test simulati non sostituiscono tale prova.

## Struttura

- `src/main.js`: interfaccia, ricerca, audio, preferenze e viaggio guidato.
- `src/universe.js`, `src/shaders.js`: scene, rendering, particelle, transizioni e selezione.
- `src/xr.js`, `src/xr-math.js`: sessione WebXR, pannello immersivo, mani e controller.
- `src/data.js`: oggetti astronomici, fonti e limiti delle rappresentazioni.
- `src/style.css`: interfaccia responsive e modalità cinema.

La vista delle stelle include anche 156 voci reali di HYG v4.1 entro 25 anni luce, ricercabili e selezionabili. Dati di David Nash, CC BY-SA 4.0; attribuzione e procedura riproducibile in [DATA_SOURCES.md](DATA_SOURCES.md).
