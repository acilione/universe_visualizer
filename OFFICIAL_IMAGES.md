# Official image archives experiment

Select an object, then choose **Archive images** to inspect its observational imagery. Images load only in this explicit gallery; object cards and the procedural map remain image-free. The existing planetary rendering is unchanged.

The experiment uses two official providers:

- [NASA Image and Video Library](https://images.nasa.gov/). The [documented REST API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf) supports image search, metadata and asset manifests, including browser CORS. A small live anonymous search was verified on 2026-09-14 (HTTP 200; CORS allowed). No API key or account is required for this endpoint.
- [ESA/Hubble observation archive](https://esahubble.org/images/). The initial manifest contains seven manually checked telescope observations with complete credits, observing bands, source records and links to the [published reuse conditions](https://esahubble.org/copyright/).

| Object | Source observation | Display interpretation |
| --- | --- | --- |
| Orion Nebula / M42 / NGC 1976 | [heic0601a](https://esahubble.org/images/heic0601a/) | Optical/near-infrared composite, with Hubble and ground-based exposures |
| Andromeda / M31 | [heic1502a](https://esahubble.org/images/heic1502a/) | Hubble mosaic covering part of the disk |
| Triangulum / M33 | [heic1901a](https://esahubble.org/images/heic1901a/) | Hubble mosaic of the central region and inner arms |
| Crab Nebula / M1 / NGC 1952 | [heic0515a](https://esahubble.org/images/heic0515a/) | Optical emission-line mosaic |
| Ring Nebula / M57 / NGC 6720 | [heic1310a](https://esahubble.org/images/heic1310a/) | Optical emission-line composite |
| Proxima Centauri | [potw1343a](https://esahubble.org/images/potw1343a/) | Unresolved stellar image, not a resolved stellar surface |
| Sirius A/B | [heic0516a](https://esahubble.org/images/heic0516a/) | Overexposed primary reveals the companion; telescope diffraction remains visible |

The manifest deliberately supplies no external photograph of the Milky Way. A view of our Galaxy from outside it would be a reconstruction.

Exact IDs and complete aliases are matched independently of the active UI language, including attached NASA metadata for nearby stars. No substring association is made: M42 is not M420, and a host-star image is not assigned to its exoplanet. Existing coordinates, distances and scientific catalogue records are not modified.

The separate **Search NASA Image Library** action returns up to eight archive previews per request (hard cap: 12). These are visibly identified as search results; free-text relevance is not a validated astronomical crossmatch. The archive can include related objects, diagrams and artist illustrations. Search results are never promoted to verified observations. Their source records provide the full context and usage information; see [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/).

Only explicit HTTPS raster image URLs on the NASA assets and ESA/Hubble CDN hosts are accepted. Source and credit links accompany each image. The Hubble manifest requests screen-sized JPEGs, approximately 100-441 KB each; it never downloads multi-gigabyte originals. Gallery images keep their aspect ratio. NASA requests time out after 12 seconds and are abortable when the gallery closes.

Implementation files: `src/official-images.js`, `src/official-images-manifest.json`, and the gallery integration. Test the data helper with `node --test tests/official-images.test.js`. The tests cover exact identities, neighbouring catalogue numbers, planet/host collisions, nested NASA metadata, URL validation, malformed and duplicate archive responses, request limits, failures and cancellation.
