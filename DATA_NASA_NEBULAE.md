# NASA nebula catalogue

`public/catalog/nasa-nebulae.json` is a reproducible snapshot of the nebula subset of [NASA/GSFC HEASARC NGC2000.0](https://heasarc.gsfc.nasa.gov/W3Browse/all/ngc2000.html). It is downloaded directly from NASA's [TAP service](https://heasarc.gsfc.nasa.gov/docs/archive/vo/instructions.html); the browser reads the bundled snapshot without contacting a third-party service.

Snapshot retrieved 14 September 2026. The underlying HEASARC table was last updated in September 2022. The source compilation is NGC 2000.0, R. W. Sinnott (editor), 1988, based on Dreyer's NGC and IC catalogues. NASA distributes the catalogue through HEASARC; NASA did not originate all its measurements.

## Included records

All **485** entries matching these NGC2000 classifications are included:

| Source code | Meaning | Entries |
| --- | --- | ---: |
| Nb | Bright emission or reflection nebula | 201 |
| Pl | Planetary nebula | 134 |
| C+N | Star cluster associated with nebulosity | 136 |
| Kt | Nebular knot or region in an external galaxy | 14 |

These are catalogue records, which can describe subregions, clusters with nebulosity and historical identifications. The subset is not a complete census of every known nebula. Dark nebulae and supernova remnants do not have separate source-type codes in this catalogue; the Crab Nebula is classified as a supernova remnant using its NASA object page, while retaining the original `Nb` source code. The remaining classifications follow the original catalogue.

## Measurement conventions

- Coordinates are equatorial **J2000.0**, in degrees. HEASARC converted the original B2000 positions to J2000. The original precision is 0.1 minute of right-ascension time and 1 arcminute of declination. Decimal storage is not an assertion of greater positional accuracy.
- `mag` is integrated apparent magnitude, not surface brightness. `magnitudeBand` distinguishes `visual` from `photographic-blue`. Both are null when no magnitude is supplied. Supplemental NASA pages may quote different magnitudes; the snapshot consistently retains the HEASARC measurement and its band.
- `angularSizeArcmin` is the greatest angular dimension in arcminutes, including the original upper-limit flag. Missing values remain null, not zero.
- NGC2000 supplies no line-of-sight distances. Only 11 identified objects have approximate distances from their linked NASA object pages. All other `distanceLy` values remain null. These estimates have heterogeneous methods and are not precision astrometry. In a celestial-sphere view, radial placement is a display convention rather than a measured physical distance.
- M16 includes NGC 6611 (the open cluster) and IC 4703 (the emission nebula). Its catalogue record remains `cluster-nebula`; the common label and description preserve that distinction. IC 4703 is a related search term, not an assertion that the cluster and gas are one object.
- English and Italian descriptions are concise original summaries of the linked NASA sources. Italian common names and English punctuation variants are search conveniences.

## Snapshot format

The JSON stores `{metadata, columns, objects}`. Each object is an array with the field order declared in `columns`:

```
id, name, aliases, raDeg, decDeg, type, constellation, mag,
magnitudeBand, angularSizeArcmin, angularSizeIsUpperLimit, distanceLy,
detailEn, detailIt, infoUrl, sourceCode, commonNameEn, commonNameIt
```

Identifiers are stable lowercase catalogue designations, e.g. `ngc-1976`. `name` retains the NASA NGC/IC designation. Metadata records the exact query, coordinate conventions, units, row counts, retrieval time, SHA-256 of the NASA response, attribution and supplemental-source URLs. No telescope images or decorative card images are included.

## Supplemental NASA facts and aliases

| Object | Search names | Approximate distance (light-years) | NASA source |
| --- | --- | ---: | --- |
| NGC 1952 | Crab Nebula / M1 | 6500 | [NASA object information](https://science.nasa.gov/asset/hubble/multiwavelength-crab-nebula/) |
| NGC 1976 | Orion Nebula / M42 | 1300 | [NASA object information](https://science.nasa.gov/asset/hubble/orion-nebula-3/) |
| NGC 3372 | Carina Nebula / C92 | 7500 | [NASA object information](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-92/) |
| NGC 6514 | Trifid Nebula / M20 | 5000 | [NASA object information](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-20/) |
| NGC 6523 | Lagoon Nebula / M8 | 5200 | [NASA object information](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-8/) |
| NGC 6543 | Cat's Eye Nebula / C6 | 3000 | [NASA object information](https://science.nasa.gov/asset/hubble/cats-eye-nebula/) |
| NGC 6611 | Eagle Nebula and cluster / M16 | 7000 | [NASA object information](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-16/) |
| NGC 6618 | Omega Nebula / M17 | 5500 | [NASA object information](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-17/) |
| NGC 6720 | Ring Nebula / M57 | 2500 | [NASA object information](https://science.nasa.gov/asset/webb/ring-nebula-miri-image/) |
| NGC 6853 | Dumbbell Nebula / M27 | 1200 | [NASA object information](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-27/) |
| NGC 7293 | Helix Nebula / C63 | 650 | [NASA object information](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-63/) |

The importer records additional NASA pages that establish NGC/Messier/Caldwell cross-identifications in `metadata.supplementSources`. Measurements and descriptions are deliberately separate from the original catalogue fields.

## Refresh and verify

From the project root, with Python 3 and internet access:

```sh
python3 scripts/import-nasa-nebulae.py
node --test tests/nasa-nebulae.test.js
```

The importer uses the Python standard library, rejects NASA TAP errors or truncated results, validates coordinates and identifiers, and writes the completed snapshot atomically. It does not download imagery. Re-running it refreshes the catalogue measurements; curated facts are changed only after checking their NASA sources.

Exact ADQL query:

```sql
SELECT name,source_type,ra,dec,constellation,limit_ang_diameter,
       ang_diameter,app_mag,app_mag_flag
FROM ngc2000
WHERE source_type IN ('Nb','Pl','C+N','Kt')
ORDER BY name
```

## Original catalogue attribution and use

NGC 2000.0, R. W. Sinnott (ed.), 1988, Sky Publishing Corporation and Cambridge University Press. HEASARC's copy is based on CDS catalogue VII/118. The original NGC2000 catalogue is copyrighted by Sky Publishing Corporation. NASA's catalogue page says it was archived for scientific research and that commercial use requires explicit permission from Sky Publishing Corporation. This source notice is retained in the snapshot metadata.
