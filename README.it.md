# ÆTHER — Atlante cosmico e planetario

La lingua predefinita è inglese. Per usare l’italiano, scegli **Settings → Interface language → Italiano**. La preferenza si conserva e la mappa viene ripristinata dopo il cambio lingua.

Atlante 3D, ispirato alla scena olografica di *Treasure Planet*. Si apre nel Sistema Solare con gli otto pianeti visibili e usa un catalogo locale di **6.360 esopianeti confermati**, estratto senza filtri dal NASA Exoplanet Archive. Lo snapshot contiene **4.769 stelle ospiti**; i **28 pianeti senza distanza** sono inclusi e consultabili. Importazione: **11 settembre 2026, ore 01:49 in Italia** (10 settembre, 23:49 UTC).

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

## Esperimento immagini ufficiali e Gaia DR3

Nel branch `feat/official-images-gaia-dr3`, seleziona un oggetto e apri **Immagini d’archivio** per le osservazioni ESA/Hubble verificate o una ricerca esplicita nella raccolta NASA. Le immagini conservano inquadratura completa, crediti, bande osservative e fonti. [Copertura e archivi](OFFICIAL_IMAGES.md).

**Impostazioni → Gaia DR3** attiva il sottoinsieme opzionale su tutto il cielo **G ≤ 6**, con 6.764 sorgenti ESA. **Copertura Gaia e corrispondenze**, anche nelle sezioni del catalogo, mostra 4.986 associazioni a voci NASA, 83 sorgenti aggiuntive e 1.695 voci escluse in attesa di verifica. Identificatori e misure NASA restano conservati; le misure native Gaia sono separate. [Dati e metodo](DATA_GAIA_DR3.md).

## Pianeti e zoom

Clicca un oggetto collegato o la sua etichetta per entrare nella mappa dettagliata: **Gruppo Locale → Via Lattea → Sistema Solare**. Anche il Sole nella vista **Stelle vicine** apre il Sistema Solare. Basta un clic; funziona anche il doppio clic. Nell’anteprima PC e in VR/MR, la selezione apre la destinazione intorno all’osservatore mantenendone posizione e orientamento.

- Il pulsante **Pianeti** apre il catalogo completo, con ricerca per pianeta o stella ospite, filtro e paginazione.
- Gli otto pianeti del Sistema Solare hanno superfici con texture locali e dimensioni visive amplificate. Saturno include gli anelli.
- Selezionare un pianeta dalla mappa o dal catalogo avvia una transizione ravvicinata. Il bersaglio dello zoom e della rotazione diventa quel pianeta.
- Rotellina, pulsanti +/− o gesto a due dita permettono di avvicinarsi ulteriormente. Il limite dello zoom dipende dal raggio del corpo, per evitare di entrare nella superficie.
- Un esopianeta apre il suo sistema ospite con tutti i pianeti confermati inclusi nello snapshot. Le orbite sono schematiche: fasi arbitrarie e separazioni compresse, con ordinamento basato sui dati disponibili.
- I pulsanti delle scale e **Ricentra** consentono di tornare alla vista d’insieme. La selezione della scala già attiva conserva l’oggetto scelto.

## Stelle e costellazioni

Il pulsante **Costellazioni** apre una selezione ricercabile delle **88 costellazioni**, con nomi italiani, latini e sigle. Il catalogo completo contiene **119.625 stelle reali HYG v4.1**; viene caricato localmente solo alla prima apertura di una figura. Non rappresenta tutte le stelle conosciute da ogni survey.

- **Spazio 3D**: stelle e collegamenti occupano le loro posizioni J2000 con distanze HYG e una scala lineare comune. La figura cambia forma orbitandole attorno. La Terra è visibile di default all’origine, con dimensioni amplificate; **Mostra la Terra** permette di nasconderla. Il volume stellare mostrato si adatta alla distanza della costellazione.
- **Guarda dalla Terra**, nella vista 3D, porta la camera all’origine terrestre mantenendo posizioni e profondità delle stelle. Cliccare il globo o la sua etichetta produce lo stesso effetto. Trascina per orientarti, usa lo zoom per ingrandire e **Torna a orbitare** o **Ricentra** per riprendere la navigazione. Il globo non viene disegnato mentre la camera è al suo centro; la preferenza di visibilità si conserva tornando a orbitare. A questa scala la separazione Terra–Sole è trascurata; superficie e dimensioni del globo sono illustrative.
- **Dalla Terra**: cielo sferico con orizzonte geometrico, calcolato per latitudine, longitudine, data e ora. Il pannello mostra quante stelle della figura sono sopra l?orizzonte. Trascina per guardarti intorno, usa rotellina o due dita per ingrandire.
- **Luogo e ora**: posizione iniziale Roma, orario iniziale corrente; coordinate modificabili senza richiedere geolocalizzazione. L?orario inserito usa il fuso indicato dal browser ed ? convertito in UTC. Intervallo 1900?2100. Il cielo rimane alla data scelta finch? non la cambi.
- Le linee sottili ciano hanno alone e impulsi luminosi; la preferenza di movimento ridotto ferma gli effetti. Le figure rimangono visibili in **Spazio libero**.
- Le **10.225 stelle senza distanza** sono presenti nel cielo terrestre e omesse dal volume 3D. Sette di queste appartengono alle figure: i relativi collegamenti 3D restano interrotti.
- **Torna alle scale cosmiche** riapre il percorso fra Sistema Solare e universo osservabile.

Le figure sono convenzioni di Stellarium, non legami fisici n? bordi ufficiali IAU. Il cielo applica la precessione da J2000 ma omette moto proprio, parallasse, nutazione e rifrazione. Luminosit? e colori sono amplificati per esplorazione; illuminazione diurna, inquinamento luminoso e terreno non sono simulati. Una stella sotto l?orizzonte non ? spostata artificialmente sopra di esso.

In VR, **Spazio 3D** conserva le prese della mappa con una o due mani. **Dalla Terra** circonda l?osservatore con una cupola a scala naturale: mani e controller selezionano le stelle, mentre l?orizzonte resta fisso. Nel pannello VR, **Figura ?/?** scorre le costellazioni; **Dalla Terra / Spazio 3D** cambia prospettiva senza uscire dal visore. Il movimento del visore orienta lo sguardo; **Ricentra** riallinea cupola e pannello alla posizione attuale.

Provenienza, licenze CC BY-SA 4.0, revisioni e checksum: [DATA_CONSTELLATIONS.md](DATA_CONSTELLATIONS.md). Rigenerazione riproducibile:

```sh
python3 scripts/import_constellations.py
```

## Vista libera

La modalità immersiva nasconde pannelli, scritte, etichette, marcatori di selezione e griglia. Non contiene pulsanti con testo in sovrimpressione. **Esc** ripristina l’interfaccia; su touchscreen o dopo il movimento del puntatore compare un piccolo comando grafico per tornare alla mappa completa. I controlli di navigazione del canvas rimangono attivi.

La mappa normale riprende dal video `treasure_planet_map_video.mp4` il linguaggio di meridiani curvi azzurri, orbite luminose e particelle. Le transizioni e l’aspetto dei corpi sono adattamenti dell’atlante, non una riproduzione fotogramma per fotogramma.

## Altre funzioni

Cinque scale cosmiche (Sistema Solare, stelle vicine, Via Lattea, Gruppo Locale, rete cosmica), ricerca trasversale, 156 stelle aggiuntive reali da HYG, schede con fonti, livelli attivabili, viaggio guidato, suono sintetizzato localmente e preferenza per animazioni ridotte.

Comandi di base: trascina per orbitare, tasto destro per spostare, rotellina per zoom, `/` ricerca, `1`–`5` scala, `R` ricentra, `Spazio` rotazione, `Esc` chiude le finestre o esce dalla vista libera.

## Anteprima PC, VR e realtà mista

Apri **VR / MR** e scegli **Avvia anteprima PC** per vedere la mappa in prima persona senza visore. W A S D per camminare, Q / E per cambiare altezza, trascinamento per guardare intorno e clic per selezionare. Sono disponibili ricerca, dimensione e rotazione della mappa e comandi per nascondere le scritte.

Scegli **Contenuto della mappa → Mappa combinata: pianeti, stelle e nebulose** per caricare tutte e tre le categorie insieme. I pulsanti **Pianeti**, **Stelle** e **Nebulose** sono indipendenti e disponibili nell’anteprima, nel pannello laterale e nel visore; le preferenze vengono salvate. Anche il selettore **Mappa** dell’anteprima apre questa vista. Il Sistema Solare schematico, con i satelliti, è circondato da una proiezione delle direzioni NASA di stelle, nebulose e sistemi esoplanetari, con scale visive separate.

Su Quest, scegli **Entra in realtà mista** per il passthrough oppure **Entra nell'atlante VR** per lo sfondo virtuale. La disposizione predefinita **Scala ambiente** mette la mappa intorno all'osservatore e la mantiene fissa nelle coordinate della sessione mentre cammina. Rimane disponibile la **Mappa ridotta** davanti all'utente. Il tracciamento delle mani è opzionale; in alternativa sono utilizzabili i controller. [Viste immersive](IMMERSIVE.md) descrive comandi e configurazione del visore.

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
- [DATA_SOURCES.md](DATA_SOURCES.md): stelle vicine HYG v4.1 di David Nash, CC BY-SA 4.0, coordinate J2000 e fonti delle schede curate.
- [DATA_CONSTELLATIONS.md](DATA_CONSTELLATIONS.md): catalogo stellare completo e figure delle 88 costellazioni, HYG e Stellarium, CC BY-SA 4.0.

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

La verifica delle costellazioni nel renderer usa `npm run test:constellations` con il server di sviluppo su porta 5173. Include proiezione del cielo, stelle sotto l?orizzonte, trascinamento, zoom, distanze ignote e ritorno ai pianeti. `npm run test:constellation-ui` verifica la navigazione desktop/mobile sull?anteprima di produzione (porta 5174).

La verifica del riferimento terrestre e della camera usa **npm run test:earth-reference** sul server di sviluppo. Comprende visibilità, persistenza fra figure, prospettiva dall’origine, transizione animata e ritorno all’orbita. I test astronomici includono il caso di Orione dell’11 dicembre 2026 alle 20:00 CET.

## Satelliti naturali

Il catalogo **Pianeti e satelliti** include 28 satelliti principali di sei pianeti, compresa la Luna terrestre. Le schede mostrano raggio medio, semiasse maggiore e periodo orbitale medio da NASA/JPL. **Satelliti principali** filtra il catalogo per pianeta; **Osserva il sistema di satelliti** inquadra il pianeta con le sue lune. Ogni satellite si può selezionare e osservare da vicino anche in VR. Le orbite sono schematiche; questa è una selezione dei satelliti conosciuti. Dati e fonti: [DATA_MOONS.md](DATA_MOONS.md).

## Stelle e nebulose NASA

I controlli **Stelle** e **Nebulose**, anche nella ricerca e nelle sezioni del catalogo, consultano gli archivi NASA HEASARC: 118.218 voci Hipparcos, 9.096 voci stellari Bright Star Catalogue e 485 voci nebulari NGC2000. La corrispondenza fra i cataloghi stellari conserva tutti gli identificatori in 118.356 schede. Sono cataloghi completi nelle rispettive selezioni, non un elenco di tutti gli oggetti astronomici conosciuti.

La ricerca comprende Rho Cygni, Scheat, Sheliak, nomi alternativi e identificatori HIP/HR/HD/NGC/IC/Messier. **Dati di catalogo** mostra coordinate, magnitudini, classi spettrali, parallassi e incertezze quando disponibili. Le voci HYG corrispondenti ricevono informazioni NASA mantenendo la provenienza delle coordinate. La vista NASA usa direzioni equatoriali su una sfera di riferimento, senza inventare profondità mancanti; le nebulose sono rappresentazioni illustrative dell’estensione angolare. Zoom, immersione e VR sono disponibili.

Fonti, epoche e procedure di aggiornamento: [stelle NASA](DATA_NASA_STARS.md) e [nebulose NASA](DATA_NASA_NEBULAE.md).
