# NASA-hosted stellar catalogues

The application bundles two complete catalogue snapshots retrieved directly from the [NASA HEASARC Table Access Protocol service](https://heasarc.gsfc.nasa.gov/docs/archive/vo/instructions.html). The browser reads the local JSON files; it does not depend on a live NASA query.

| Snapshot | NASA table | Included records | Original catalogue |
| --- | --- | ---: | --- |
| `public/catalog/nasa-stars.json` | [BSC5P](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html) | 9,096 stars | Hoffleit and Warren, Yale Bright Star Catalog, fifth revised preliminary edition (1991) |
| `public/catalog/nasa-hipparcos.json` | [HIPPARCOS](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hipparcos.html) | 118,218 entries | ESA, The Hipparcos and Tycho Catalogues, SP-1200 (1997) |

NASA HEASARC distributes these catalogues; Yale and ESA remain the original data providers. These are complete imports of the specified tables, not a claim to contain every known star. BSC5P is predominantly a bright-star catalogue. A star present in both snapshots is not automatically two different stars: the runtime may associate their entries using catalogue identifiers and coordinate agreement.

BSC5P contains 9,110 HR entries. NASA identifies 14 as nonstellar objects: HR 92, 95, 182, 1057, 1841, 2472, 2496, 3515, 3671, 6309, 6515, 7189, 7539 and 8296. The stellar snapshot excludes exactly those entries. No brightness filter or handpicked inclusion list is applied to either stellar catalogue.

## Measurements and precision

Both snapshots use `columns` plus compact `stars` arrays. A row becomes an object by pairing each element with the corresponding column. `metadata` retains the archive, original catalogue, retrieval timestamp, exact ADQL query, source URL, source counts, response checksum and coordinate conventions. `units` and `fieldDescriptions` describe the selected source fields. Missing values are JSON `null`, never invented zeros.

BSC5P retains HR, HD and SAO identifiers; the original Bayer/Flamsteed designation; J2000 equatorial position; catalogue magnitude and quality flags; spectral type; B-V colour; parallax in **arcseconds**; proper motions in arcseconds/year; variable-star identifier; multiplicity information; and heliocentric radial velocity in km/s with its original notes. `parallaxKind = D` denotes a dynamical parallax. A blank kind denotes trigonometric when a parallax measurement is present. This table supplies no parallax uncertainty, so its snapshot does not infer a distance.

Hipparcos retains HIP and HD identifiers; Johnson V magnitude; spectral type; B-V colour; trigonometric parallax and its standard error in **milliarcseconds**; proper motions and their errors in mas/year; variability flags and period; and the double/multiple-system flag and resolved component count.

Hipparcos `raDeg` and `decDeg` use the precise `ra_deg` and `dec_deg` columns wherever available. They use the **ICRS reference frame at epoch J1991.25**, not an epoch-2000 propagated position. The RA proper motion is `mu_alpha * cos(delta)`. The application must account for this convention when advancing positions. For the 263 entries without precise positions, the importer obtains NASA's rounded `ra` and `dec` values from the same table (original precision 0.01 seconds of RA time and 0.1 arcseconds in declination). Their `positionPrecision` is `rounded`; all other rows are `precise`. `metadata.roundedPositionHipIds` lists those 263 IDs and `coordinateFallbackRequest` records the supplementary NASA response. Every current entry has a position; truly unavailable coordinates would remain null.

Zero, negative and insignificant parallaxes are preserved as measurements. The importer does not derive distances. Any runtime parallax-based distance estimate must state its method and require a meaningful positive measurement with its uncertainty; an unavailable or unreliable parallax does not place an object at zero distance.

## Search names

`src/nasa-star-names.js` expands the source Bayer and Flamsteed abbreviations into full star designations. Examples include `73Rho Cyg` to **Rho Cygni**, `53Bet Peg` to **Beta Pegasi**, and `10Bet Lyr` to **Beta Lyrae**. Catalogue IDs and original designations remain searchable. Component numbers are retained.

The common-name aliases include **Scheat** and **Sheliak** as distinct stars. The misspelling `Rho Cigny` is a search alias only. Common-name and designation references are exposed as `starNameSources`, including:

- [NASA Imagine the Universe: Pegasus star names](https://imagine.gsfc.nasa.gov/ask_astro/night_sky.html).
- [NASA NTRS: bright-star identifications](https://ntrs.nasa.gov/citations/19740019266).
- [NASA NTRS: constellation names, abbreviations and genitives](https://ntrs.nasa.gov/citations/19760010919).
- [NASA Hubble: Messier 57, Sheliak and Sulafat](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-57/).
- [NASA APOD: Deneb and Altair designations](https://apod.nasa.gov/apod/ap210819.html).
- [NASA APOD: Sadr/Gamma Cygni](https://apod.nasa.gov/apod/ap121130.html).

No third-party catalogue supplies new physical measurements to these snapshots. Previously bundled HYG geometry and labels retain their own provenance.

## Refresh and verify

Python 3 standard library is sufficient:

```sh
python3 scripts/import-nasa-stars.py
node --test tests/nasa-star-data.test.js
```

For one catalogue and an archived raw response:

```sh
python3 scripts/import-nasa-stars.py --catalog bsc5p --raw-output /tmp/bsc5p.vot
python3 scripts/import-nasa-stars.py --catalog hipparcos --raw-output /tmp/hipparcos-votables.json
```

`--input` reprocesses an archived response without network access; specify the matching `--catalog`. BSC5P uses one VOTable. Hipparcos uses a JSON bundle containing three unchanged base64 VOTables and their exact queries/URLs. A supplementary response supplies the 263 rounded coordinate fallbacks. Its disjoint primary HIP-number ranges are `<= 40000`, `> 40000 AND <= 80000`, and `> 80000`. This avoids NASA's server row cap even when a larger `MAXREC` is requested. The current page counts are 39,956, 39,955 and 38,307.

The importer rejects VOTable errors and overflow, inconsistent page schemas, invalid coordinates, duplicate identifiers and unexpected total counts before overwriting a snapshot. It supports NASA's inline BINARY VOTables and TABLEDATA, preserves null sentinels, and rounds floating-point values to the source field's declared decimal precision. Raw response hashes are retained for audit; retrieval timestamps naturally differ on refresh.

## Runtime integration

`src/celestial-catalog.js` propagates Hipparcos position vectors from J1991.25 to J2000 using the published tangent proper motions (the RA component already includes cos(dec)). Records without both components retain their original epoch. Source coordinates and precision remain in the snapshots. BSC records match a Hipparcos entry only with a common HD identifier and an unambiguous separation within 5 arcseconds after propagation. All unmatched BSC entries remain separate; every source HIP and HR identity survives. The resulting display contains 118,356 stellar entries.

Hipparcos measurements take precedence in combined cards, with Bright Star values and notes retained separately. Original HR photometry and dynamical parallaxes are labelled explicitly. BSC radial velocities and alternate spectral classes retain BSC attribution. For positive Hipparcos parallax with a positive uncertainty no greater than 20% of the parallax, inverse-parallax distance is labelled as an estimate; other distances remain unavailable. This is not a Bayesian distance catalogue.

Existing HYG figures may display supplementary NASA information matched by HIP identity, or by a unique positional match within 3 arcseconds when no HIP identifier exists. The HYG geometry and distance are never overwritten by this enrichment.
