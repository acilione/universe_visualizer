# Fonti e licenze dei dati

## Catalogo delle stelle vicine

`src/nearby-stars.json` è un sottoinsieme di **HYG Stellar Database v4.1**, compilato da **David Nash / Astronomy Nexus** da Hipparcos, Yale Bright Star e Gliese. I dati HYG originali e questo sottoinsieme adattato sono distribuiti con licenza **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**.

- [Progetto HYG e autore](https://www.astronexus.com/projects/hyg)
- [Versione originale archiviata su GitHub](https://github.com/astronexus/HYG-Database)
- [CSV della revisione utilizzata](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/hygdata_v41.csv)
- [Licenza inclusa nel catalogo](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/LICENSE)
- [CC BY-SA 4.0: testo della licenza](https://creativecommons.org/licenses/by-sa/4.0/)
- [Documentazione dei campi originali](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/README.md)

Attribuzione breve per l'interfaccia: **Stelle: HYG 4.1 · David Nash · CC BY-SA 4.0**. Nessuna approvazione o affiliazione dell'autore è implicata. Questo avviso riguarda il dataset derivato; le altre risorse mantengono le proprie licenze.

### Trasformazioni effettuate

Il sottoinsieme contiene **156 voci reali** del CSV, con distanza maggiore di zero e non superiore a 25 anni luce. Sono esclusi il Sole e dieci record già rappresentati nelle schede curate: Proxima Centauri, Alfa Centauri A e B, Barnard, Sirio A e B, Epsilon Eridani, Procione A e B, Tau Ceti. Vega, già curata, è appena fuori dal raggio del sottoinsieme.

Sono conservati gli identificatori HYG, Hipparcos e Gliese ove disponibili. L'ascensione retta originale in ore è moltiplicata per 15 per ottenere gradi; la distanza originale in parsec è moltiplicata per `3.261563777167433` per ottenere anni luce. Le coordinate risultanti e le distanze sono arrotondate a nove decimali per serializzarle; questo non aumenta la precisione osservativa. La magnitudine è quella visuale apparente del catalogo. Le componenti di sistemi multipli non già curati restano voci distinte.

Le coordinate HYG hanno epoca ed equinozio 2000.0. Il moto proprio non viene aggiornato alla data odierna. Si tratta di un'estrazione da un archivio storico, non di un censimento completo o aggiornato di tutte le stelle entro 25 anni luce. Non sono state aggiunte stelle sintetiche a questo file. Le particelle decorative dell'applicazione sono separate dai record del dataset.

### Riproduzione

Eseguire dalla radice del progetto:

```sh
python3 scripts/import_nearby_stars.py
```

Il comando usa soltanto la libreria standard Python, scarica il CSV pubblico della revisione fissata, ne verifica l'impronta SHA-256, applica il filtro e rigenera il JSON. Non richiede credenziali. La revisione GitHub archiviata è intenzionale: il progetto HYG attuale è ospitato su Codeberg e può contenere aggiornamenti successivi.

- Revisione: `c7f7f883fe678cc7680169a50ccd7dcc49b060ce`
- SHA-256 CSV: `d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd`
- Data di estrazione: 11 settembre 2026.

## Schede astronomiche curate

Le fonti delle schede del Sistema Solare, delle stelle curate, delle galassie e degli ammassi sono riportate nelle proprietà `source` di `src/data.js` e nelle schede dell'interfaccia: NASA Science, CDS/SIMBAD e lo studio originale su Laniakea. Le coordinate approssimate e le posizioni illustrative sono identificate da `positionKind` e `positionNote`. Le ricostruzioni della Via Lattea e della rete cosmica non provengono da una survey osservativa.
