# Stelle e costellazioni: dati, limiti e licenze

L'atlante include **119.625 stelle del catalogo HYG v4.1** e le figure delle **88 costellazioni IAU**. Questo e' un catalogo reale e riproducibile, non la totalita' delle stelle conosciute o dell'Universo. Comprende tutte le righe stellari HYG con coordinate e magnitudine visuale valide; il Sole, origine del riferimento e gia' presente nell'atlante, e' escluso da questo campo stellare.

## Catalogo stellare

- Autore e attribuzione: **David Nash / Astronexus, HYG Database v4.1**.
- [CSV originale, revisione bloccata](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/hygdata_v41.csv).
- [Documentazione dei campi e licenza](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/README.md).
- Revisione `c7f7f883fe678cc7680169a50ccd7dcc49b060ce`.
- SHA-256 del CSV `d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd`.
- Licenza: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).

`public/catalog/stars.json` conserva identificativo HYG, identificativo Hipparcos (quando presente), nome, ascensione retta in gradi, declinazione in gradi, distanza in anni luce, magnitudine visuale apparente, indice di colore B-V e sigla della costellazione. Il formato a colonne e righe riduce le dimensioni a circa 9,57 MB senza una selezione arbitraria di stelle. Le stelle prive di nome proprio usano identificativi HIP, HD o altri identificativi del catalogo.

Epoca ed equinozio sono **J2000.0**. Le coordinate non vengono propagate per moto proprio: le posizioni non sono un'efemeride astrometrica di precisione per la data corrente. Le distanze sono quelle di HYG, convertite con `1 pc = 3.261563777167433 anni luce`; non sono stime aggiornate da Gaia. Alcune distanze, in particolare di stelle lontane o multiple, possono avere notevole incertezza.

**109.400 stelle** hanno una distanza utilizzabile nel catalogo. Per **10.225** stelle il campo resta `null`: HYG dichiara esplicitamente che `dist >= 100000 pc` significa parallasse assente o dubbia. Questi valori non devono mai diventare una sfera artificiale di stelle a 326.156 anni luce. Le stelle prive di distanza si possono proiettare nel cielo a partire dalle coordinate osservate, ma non collocare a una profondita' fisica inventata.

Modifiche ai dati originali: selezione delle colonne, nomi di ripiego per le stelle senza nome proprio, conversione delle unita', arrotondamento delle coordinate a sei decimali e delle distanze a sei decimali, trasformazione della sentinella di distanza in `null`. Il catalogo derivato resta **CC BY-SA 4.0**.

## Figure delle costellazioni

- Autore e attribuzione: **Stellarium's team, modern skyculture**.
- [Dati originali, revisione bloccata](https://github.com/Stellarium/stellarium/blob/daace2add6a1bf886e8ee1934f51e9c69f818d18/skycultures/modern/index.json).
- [Descrizione, autori e licenza originali](https://github.com/Stellarium/stellarium/blob/daace2add6a1bf886e8ee1934f51e9c69f818d18/skycultures/modern/description.md).
- Revisione `daace2add6a1bf886e8ee1934f51e9c69f818d18`.
- SHA-256 di `index.json`: `1f2f5ffd6c9e25a7d0dcfdbf1f756e2db03dd3b8ed4ec016a2839b09f6b0fe1e`.
- SHA-256 di `description.md`: `4b58344f63168d7c816fdfef405103b5770fda2e1f4a4bf5c8871041ce042586`.
- La fonte dichiara: **Text and data: CC BY-SA 4.0**. Le illustrazioni hanno una licenza distinta e non sono incluse.

`public/catalog/constellations.json` contiene 88 figure, 695 segmenti unici all'interno di ciascuna figura e 710 stelle usate come estremi. Ogni estremo corrisponde esattamente a un identificativo HIP presente in HYG: **nessuna stella di figura manca dal catalogo**. Le polilinee originali sono state espanse in coppie di estremi; sono stati aggiunti nomi italiani. Il dataset derivato delle figure resta **CC BY-SA 4.0**. I metadati di entrambi i file includono attribuzione, licenza, collegamenti alle fonti e descrizione delle modifiche.

Le linee sono convenzioni visive della cultura astronomica moderna di Stellarium. L'IAU stabilisce nomi e regioni della sfera celeste, non una figura obbligatoria fatta di segmenti. Le linee non rappresentano legami fisici fra stelle: quelle che appaiono vicine dalla Terra possono essere molto lontane fra loro nello spazio tridimensionale. Non sono stati copiati disegni delle figure, confini ufficiali o descrizioni mitologiche.

Sette stelle delle figure hanno distanza ignota/dubbia in HYG: **HIP 5165, 22783, 31216, 33165, 54463, 89341 (Polis), 92202**. Le figure interessate sono Fenice, Giraffa, Unicorno, Cane Maggiore, Carena, Sagittario e Scudo. La vista del cielo conserva le figure complete; nello spazio 3D le connessioni verso queste stelle devono essere omesse e la lacuna dichiarata. Il Serpente resta un'unica costellazione con due gruppi separati di segmenti, coerentemente con la fonte.

## Riproduzione e verifica

Dalla radice del progetto, con Python 3 e accesso alle fonti pubbliche:

```sh
python3 scripts/import_constellations.py
```

Per riutilizzare i download, sempre verificandone i checksum:

```sh
python3 scripts/import_constellations.py --cache-dir /tmp/aether-catalog-sources
```

Lo script usa solo la libreria standard e fallisce se i checksum cambiano, se manca una delle 88 figure, se un HIP di figura non viene trovato o se gli identificativi non sono unici. Non necessita di token o servizi autenticati.

```sh
node --test tests/constellation-data.test.js
```

I test verificano copertura delle 88 costellazioni, corrispondenza degli estremi HIP, coordinate di stelle di riferimento, direzione della cintura di Orione, trattamento delle distanze ignote e conservazione delle attribuzioni/licenze.
