# Gaia DR3 access

## Streamed access to the full catalogue

Open **Catalogue sections > Gaia DR3 (Full sky, streamed detail)**. The static application reads progressive catalogue tiles from the official CDS/VizieR mirror of Gaia DR3, whose advertised coverage is 1,811,709,771 sources. This view is independent of the bundled bright-source experiment below. It does not merge uncertain Gaia and NASA identities or place two competing stellar catalogues over each other.

Drag to change sky direction and use the wheel to narrow the field. Ancestor tiles retain brighter sources while deeper tiles add detail. Only the requested regions are downloaded; there is no bulk download or local archive. The interface reports the currently loaded working set and any incomplete detail or service error. High and low quality use budgets of 12,000 and 6,000 rendered sources, respectively. The geometry is one GPU batch; fetching, parsing and tile scheduling run in a worker.

Positions are angular. Native J2016.0 observations remain in each source card, including null and negative parallax values. Display directions remain at native J2016.0 so that high-proper-motion sources stay consistent with the remote tile coverage; the separate bright-source merge still uses its documented J2000 propagation. An optional inverse-parallax estimate is information only, requires quantified precision and acceptable RUWE, and is never used to invent a 3D sky distance. Quasar and galaxy candidates retain their classification flags. Gaia source IDs stay exact decimal strings.

Full archive access does not mean that every record is loaded or resolved simultaneously. Public-service availability, progressive tiling and explicit memory limits apply. The implementation is an initial streamed-sky client, not a full spatial Gaia Galaxy or an exhaustive scientific export. Full three-dimensional streaming, distant unresolved light and DR4 migration are covered in the [architecture and feasibility study](GAIA_STREAMING_STUDY.md).

Service: [CDS Gaia DR3 HiPS catalogue](https://hipscat.cds.unistra.fr/HiPSCatService/I/355/gaiadr3), [VizieR catalogue documentation](https://cdsarc.cds.unistra.fr/viz-bin/cat/I/355).

HEALPix tile geometry uses [`@hscmap/healpix`](https://github.com/michitaro/healpix), with its [MIT notice](public/licenses/healpix.txt) included in static builds.

## Bundled bright-source experiment

The optional Gaia integration uses the **official ESA Gaia Archive**, independently of the existing NASA HEASARC Hipparcos and Bright Star Catalogue snapshots. The bundled file is `public/catalog/gaia-dr3.json`.

## Use and compare

The bundled bright-source experiment is disabled by default. Enable **Settings → Gaia DR3** to include the subset in star search, catalogue sky and the combined immersive map; changing the setting reloads the current map. **Gaia coverage and cross-matches** opens the comparison without changing the setting. The same comparison is available from **Catalogue sections → Gaia DR3**. Native values appear in the **ESA GAIA DR3** section of object data. Search accepts the complete Gaia DR3 source identifier; safely matched sources retain their NASA display identity.

The bundled cross-match audit yields **4,986 enriched NASA records**, **83 added Gaia-only sources**, and **1,695 withheld sources**, accounting for all 6,764 Gaia rows exactly once. Reasons overlap: 514 processing duplicate flags, 1,241 close unlinked NASA candidates, 38 extragalactic candidate flags, and 10 ambiguous neighbour counts. Withheld sources are unresolved cases, not necessarily duplicate physical stars. The map contains 118,439 stellar records with the experiment enabled, versus 118,356 from the NASA-only merge.

The complete evidence is in `public/catalog/gaia-match-audit.json`. Regenerate it after changing either snapshot or matching code:

```sh
npm run audit:gaia
```

## Scope and selection

The snapshot contains **6,764 Gaia DR3 sources with Gaia G-band mean magnitude <= 6, over the whole sky**. It includes every source returned by that exact selection, verified against an independent count query. This is a bounded browser experiment, not the full Gaia DR3 catalogue and not a claim to include every bright astronomical object. Gaia DR3 has about 1.8 billion sources; loading that catalogue into a browser is outside this implementation.

Of the 6,764 selected sources, 5,435 have an official Hipparcos-2 best-neighbour association and 1,329 have none. There are 10 sources with multiple acceptable Gaia neighbours for their Hipparcos counterpart and 514 sources with `duplicated_source` set. These counts overlap; they are not numbers to subtract independently. There are 246 sources with a two-parameter solution and therefore no published parallax or proper motion. The runtime collision report records which rows were attached, added or held for review.

Selection is on **Gaia G**, not Johnson V. It has no distance, sky-region, parallax signal-to-noise or RUWE cut. The application does not replace NASA V magnitudes with Gaia G magnitudes.

Official references:

- [Gaia DR3 release contents and coverage](https://www.cosmos.esa.int/web/gaia/dr3)
- [ESA Gaia programmatic access](https://www.cosmos.esa.int/web/gaia-users/archive/programmatic-access)
- [Gaia DR3 source-table data model](https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html)
- [Official Hipparcos-2 best-neighbour data model](https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_cross-matches/ssec_dm_hipparcos2_best_neighbour.html)

## Reproduce the snapshot

The importer needs Python 3 and its standard library. No archive login or Python packages are required. Run from the repository root:

```sh
python3 scripts/import-gaia-dr3.py --archive-dir /tmp/aether-gaia-dr3
```

The default selection is `g.phot_g_mean_mag <= 6`. The importer first runs `COUNT(*)`; it aborts before fetching source rows if the selection exceeds the default **20,000-source** bound. It never uses an unordered `TOP` sample. A narrower or wider experimental selection can be requested explicitly:

```sh
python3 scripts/import-gaia-dr3.py --max-g 5 --max-sources 10000 --output /tmp/gaia-g5.json
```

To reproduce the normalized records without network access, retain both original ESA VOTables and use the same magnitude selection:

```sh
python3 scripts/import-gaia-dr3.py \
  --input /tmp/aether-gaia-dr3/sources.vot \
  --count-input /tmp/aether-gaia-dr3/count.vot \
  --output /tmp/gaia-reproduced.json
```

The raw VOTables are optional local provenance artifacts, not duplicated in the repository. Their SHA-256 hashes are in snapshot metadata. Offline reproduction must supply both the source and count responses; the importer verifies the ADQL query embedded by ESA in each response. The normalized `starsSha256` remains identical when using identical raw inputs. `generatedAt` and `inputMode` describe the particular import run and therefore change.

The importer uses ESA TAP `FORMAT=votable_plain`, validates every `QUERY_STATUS` (including trailing `OVERFLOW` or `ERROR` markers), enforces a 32 MiB response limit, checks row widths and required columns, and checks that the distinct source count equals the independent ESA count. It rejects malformed source identifiers, conflicting measurements for one identifier and repeated match rows. Output is replaced atomically only after validation succeeds, so a failed refresh retains the previous snapshot.

## Data contract

The JSON structure is `{metadata, stars}`. `metadata` includes the exact ADQL and count query, service endpoint, release, source and match tables, source-field datatypes and units from the VOTable, selection limits, official and imported counts, hashes, acknowledgement and documentation links.

Each `stars` entry contains:

| Field | Meaning / units |
| --- | --- |
| `sourceId` | Decimal **string**, preserving Gaia's 64-bit identifier exactly |
| `designation` | Release-qualified `Gaia DR3 <sourceId>` |
| `refEpoch` | Julian year TCB, native J2016.0 |
| `raDeg`, `decDeg` | Native barycentric ICRS direction, degrees |
| `raErrorMas`, `decErrorMas` | Position uncertainties, mas; RA error includes cos(dec) |
| `parallaxMas`, `parallaxErrorMas`, `parallaxOverError` | Parallax, uncertainty and published ratio |
| `pmRaMasYr`, `pmDecMasYr` | Proper motion, mas/year; RA component includes cos(dec) |
| `pmRaErrorMasYr`, `pmDecErrorMasYr` | Proper-motion uncertainties, mas/year |
| `radialVelocityKmS`, `radialVelocityErrorKmS` | Radial velocity and uncertainty, km/s |
| `gMag`, `bpMag`, `rpMag`, `bpRp` | Gaia mean G, BP and RP magnitudes and BP-RP colour |
| `ruwe`, `astrometricParamsSolved`, `duplicatedSource` | Published astrometric solution and quality indicators |
| `inQsoCandidates`, `inGalaxyCandidates` | Published extragalactic candidate flags; Gaia sources are not automatically confirmed stars |
| `hipMatches` | Every official Hipparcos-2 best-neighbour association for this source |

Each match contains `hip`, `angularDistanceArcsec`, `numberOfNeighbours`, and `xmFlag`. Empty measurements remain JSON `null`; negative parallaxes remain negative. The importer does not infer distances, apply a parallax zero-point correction or convert native coordinates to a different epoch. Runtime display coordinates can be derived separately while retaining these native fields.

## Collisions with NASA catalogue records

Matching uses `gaiadr3.hipparcos2_best_neighbour`, the ESA cross-match product. Its algorithm compares positions, uncertainties and source environments; a name equality or a raw coordinate coincidence is not treated as identity.

The magnitude restriction applies to `gaiadr3.gaia_source` only. The left join retains **all** Hipparcos associations for each selected Gaia source. The official `number_of_neighbours` counts all acceptable Gaia candidates for a Hipparcos source, including candidates below this snapshot's brightness limit. Thus a sole row in the bright subset does not by itself establish a unique association.

The runtime attaches Gaia measurements to an existing NASA HIP record only when the official association is unique and passes its conservative ambiguity checks. It preserves NASA IDs, names, coordinates, distances and V-band measurements. Gaia measurements remain a separate, attributed record. Potential multiple matches, duplicated-source flags and unconfirmed close positional overlaps are retained in the collision report rather than silently merged or rendered as a second copy of the same star. Extragalactic candidates are held for review rather than classified as stars.

The low three bits of `xmFlag` identify external multiples (1), suspected duplicates (2) and an external source resolved by Gaia (4). Other bits describe the solution or special matching treatment; the original bitmask is retained. `duplicatedSource` is an independent Gaia processing flag, not an instruction to merge records by name.

The official cross-match is evidence of association and has completeness/correctness trade-offs. The experiment deliberately exposes unresolved cases. It is not a replacement for a scientific catalogue-combination analysis.

## Attribution

This work has made use of data from the European Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement.

See [Gaia credits](https://www.cosmos.esa.int/web/gaia-users/credits) and [ESDC terms](https://www.cosmos.esa.int/web/esdc/terms-and-conditions). Relevant release publications include [Gaia DR3 summary of contents](https://doi.org/10.1051/0004-6361/202243940) and the [Gaia mission paper](https://doi.org/10.1051/0004-6361/201629272).
