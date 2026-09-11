# Catalogo completo degli esopianeti confermati

L'atlante include tutti i **6.360 esopianeti confermati** presenti nella tabella
`pscomppars` del NASA Exoplanet Archive al momento del download:
**10 settembre 2026, 23:49:22 UTC (11 settembre in Italia)**. Sono associati a
**4.769 stelle ospiti**. I pianeti del Sistema Solare sono un catalogo separato.

Il termine "tutti" si riferisce all'intera tabella dei pianeti confermati di questo
archivio a questa data, non agli oggetti ancora da scoprire o ai candidati non
confermati. I dati sono una fotografia locale: non richiedono una connessione
NASA durante la navigazione e non si aggiornano automaticamente.

## Provenienza e aggiornamento

- [NASA Exoplanet Archive, tabella Planetary Systems Composite Parameters](https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html):
  una riga per pianeta confermato; valori compositi, che possono provenire da
  pubblicazioni diverse o da calcoli dell'archivio.
- [Guida ufficiale TAP](https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html).
- [Query predefinite NASA](https://exoplanetarchive.ipac.caltech.edu/docs/API_queries.html).

Rigenerare il catalogo con Python 3 e la sola libreria standard:

```sh
python3 scripts/import_exoplanets.py
npm test
```

L'importatore scarica tutti i record, senza filtri `WHERE`, limiti `TOP`,
restrizioni sulla distanza o rimozione di valori mancanti. Verifica il numero
delle righe con un `count(*)` separato prima e dopo il download. Se il conteggio
cambia o la risposta e' incompleta, non sostituisce il catalogo locale.

Il file `src/exoplanets.json` contiene `metadata` e `planets`. I metadati
registrano la query, l'URL esatto, il conteggio verificato, il momento di recupero,
il numero delle stelle ospiti, i dati mancanti e lo SHA-256 della risposta NASA
originale. Il risultato viene scritto su un file temporaneo e rinominato solo
dopo la validazione.

## Campi e limiti scientifici

| Campo applicazione | Colonna NASA | Unita' / significato |
| --- | --- | --- |
| `id` | `pl_name` | `exo-` seguito dal nome con URL encoding, reversibile e univoco |
| `name`, `host` | `pl_name`, `hostname` | Nomi originali dell'archivio |
| `raDeg`, `decDeg` | `ra`, `dec` | Coordinate equatoriali del sistema, gradi |
| `distancePc` | `sy_dist` | Distanza del sistema, parsec |
| `semiMajorAxisAu` | `pl_orbsmax` | Semiasse maggiore; per alcuni rilevamenti, separazione proiettata, au |
| `periodDays` | `pl_orbper` | Periodo orbitale, giorni |
| `radiusEarth` | `pl_rade` | Raggi terrestri |
| `massEarth` | `pl_bmasse` | Migliore massa disponibile, in masse terrestri; puo' essere una massa minima o una stima |
| `massProvenance` | `pl_bmassprov` | Provenienza della massa come riportata nell'archivio |
| `temperatureK` | `pl_eqt` | Temperatura di equilibrio / effettiva, kelvin; non una temperatura superficiale misurata |
| `discoveryYear`, `discoveryMethod` | `disc_year`, `discoverymethod` | Anno e metodo di scoperta |

I valori mancanti rimangono `null`. **28 pianeti** non hanno una distanza nota
nella tabella: rimangono ricercabili, senza assegnare loro una distanza fittizia.
Le posizioni degli esopianeti sulla mappa indicano il sistema ospite, non
effemeridi aggiornate o posizioni orbitali esatte.

Il catalogo ridotto non conserva intervalli di errore, limiti superiori/inferiori
o tutte le referenze dei singoli parametri. E' destinato a un atlante esplorativo,
non ad analisi quantitative. Per queste occorre usare le colonne complete e le
pubblicazioni originali indicate da NASA. Aspetto delle superfici, atmosfere e
rotazione dei modelli di esopianeti sono ricostruzioni artistiche, non immagini
osservate.

## Attribuzione

Dati del NASA Exoplanet Archive, gestito da Caltech per l'Exoplanet Exploration
Program della NASA. Si applicano le indicazioni di
[attribuzione e citazione dell'archivio](https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html).
La redistribuzione in questo progetto non modifica la provenienza dei dati
astronomici. La documentazione collegata riporta il ringraziamento standard e
le istruzioni per citare anche le pubblicazioni originali.
