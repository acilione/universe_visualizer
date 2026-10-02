# Celestial surface and shape resources

The official surface manifest contains resources for all eight planets and 27 moons: 33 textures (30 body maps, Earth clouds, lunar elevation and Saturn rings) and ten irregular meshes. Four moons retain NASA visualization meshes with their native UV textures; six use scientific shape products archived by the NASA Planetary Data System (PDS). Nereid remains explicitly approximate because its reference image does not resolve terrain. Other body shapes use the physical radii documented in `src/body-shape-data.js`. The Sun observation is managed separately.

This is a scientific visualization, not a calibrated photometric simulator. Observed mosaics, processed NASA 3D visualization textures, cloud reconstructions and unobserved terrain are identified separately. The catalogue records the source URL, direct asset URL, credit, spectral interpretation, limitations, retrieval date, source checksum and local checksum for every resource in [`src/official-surfaces.json`](src/official-surfaces.json).

The [body appearance audit](BODY_APPEARANCE_AUDIT.md) compares every individually rendered Solar System body with a specific official observation and records remaining mismatches.

## Coverage

| Body | Rendering source | Map size / official source |
| --- | --- | --- |
| Mercury | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/mercury-3d-model/) |
| Venus | Atmospheric visualization | [1440 x 720](https://science.nasa.gov/resource/venus-3d-model/) |
| Earth | Observed mosaic | [2048 x 1024](https://svs.gsfc.nasa.gov/2915/) |
| Mars | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/planet-mars-3d-model/) |
| Jupiter | Observed mosaic | [2048 x 1024](https://science.nasa.gov/resource/cassinis-best-maps-of-jupiter-cylindrical-map/) |
| Saturn | Atmospheric visualization | [2048 x 1024](https://science.nasa.gov/resource/saturn-3d-model/) |
| Uranus | Atmospheric visualization | [1024 x 512](https://science.nasa.gov/resource/uranus-3d-model/) |
| Neptune | Atmospheric visualization | [1024 x 512](https://science.nasa.gov/resource/neptune-3d-model/) |
| Moon | Observed mosaic | [2048 x 1024](https://svs.gsfc.nasa.gov/4720/) |
| Phobos | Native irregular mesh and UV texture | [2048 x 2048](https://science.nasa.gov/resource/phobos-mars-moon-3d-model/) |
| Deimos | Native irregular mesh and UV texture | [1024 x 1024](https://science.nasa.gov/resource/deimos-mars-moon-3d-model/) |
| Amalthea | Coarse Voyager scientific shape; approximate color | [PDS 5-degree radial grid](https://sbnarchive.psi.edu/pds4/non_mission/small_bodies.stooke.shape-models/data/j5amalthea.xml) |
| Io | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/io-3d-model/) |
| Europa | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/europa-3d-model/) |
| Ganymede | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/ganymede-3d-model/) |
| Callisto | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/callisto-3d-model/) |
| Mimas | Native irregular mesh and UV texture | [2048 x 2048](https://science.nasa.gov/resource/mimas-3d-model/) |
| Enceladus | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/enceladus-3d-model/) |
| Tethys | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/tethys-3d-model/) |
| Dione | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/dione-3d-model/) |
| Rhea | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/rhea-3d-model/) |
| Titan | Atmospheric visualization | [2048 x 1024](https://science.nasa.gov/resource/titan-3d-model/) |
| Hyperion | Native irregular mesh and UV texture | [1024 x 1024](https://science.nasa.gov/resource/hyperion-3d-model/) |
| Iapetus | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/iapetus-3d-model/) |
| Janus | Cassini scientific shape; approximate gray material | [PDS plate model](https://sbnarchive.psi.edu/pds4/cassini/saturn_satellite_shape_models_V1_0/document/janus_document.pdf) |
| Epimetheus | Cassini scientific shape; approximate gray material | [PDS plate model](https://sbnarchive.psi.edu/pds4/cassini/saturn_satellite_shape_models_V1_0/document/epimetheus_document.pdf) |
| Phoebe | Cassini scientific shape and relative albedo | [2048 x 1024 + PDS mesh](https://sbn.psi.edu/pds/resource/weirichphoebeshape.html) |
| Ariel | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/ariel-3d-model/) |
| Umbriel | NASA visualization map | [1024 x 512](https://science.nasa.gov/resource/umbriel-3d-model/) |
| Titania | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/titania-3d-model/) |
| Oberon | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/oberon-3d-model/) |
| Miranda | NASA visualization map | [1024 x 512](https://science.nasa.gov/resource/miranda-3d-model/) |
| Triton | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/triton-3d-model/) |
| Larissa | Very poorly constrained Voyager shape; approximate color | [PDS 5-degree radial grid](https://sbnarchive.psi.edu/pds4/non_mission/small_bodies.stooke.shape-models/data/n7larissa.xml) |
| Proteus | Coarse Voyager scientific shape; approximate color | [PDS 5-degree radial grid](https://sbnarchive.psi.edu/pds4/non_mission/small_bodies.stooke.shape-models/data/n8proteus.xml) |
| Nereid | Approximate smooth body; no resolved terrain | [Voyager reference PIA00054](https://science.nasa.gov/resource/nereid/) |

The Sun uses the dated grayscale SDO/HMI observation described below, projected only onto the observed hemisphere. Its white visible-light appearance is distinct from assigned-colour solar imagery. Nereid retains an explicitly approximate smooth shape and a neutral material. A scientific shape model without a suitable photographic map uses uniform approximate color, rather than a disk photograph wrapped around the whole body. No synthetic crater pattern is described as observed terrain. Exoplanet surface geography and stellar surface details generally are not spatially resolved by the imported catalogues; their appearance remains representative.

## Solar photosphere observation

The Sun carries actual sunspot detail from the [SDO/HMI continuum browse image of 21 September 2026, 15:10:38 UTC](https://sdo.gsfc.nasa.gov/assets/img/browse/2026/09/21/20260921_151038_1024_HMII.jpg). The image caption uses TAI (15:11:15). HMI samples continuum intensity near 617.3 nm; this grayscale observation is not a calibrated broadband RGB map. [NASA explains why the visible Sun is white and solar scientific imagery uses assigned colours](https://svs.gsfc.nasa.gov/vis/a010000/a013800/a013859/script_31299_00.html).

The original image and derived 1024-square contrast map are bundled separately from the planetary manifest. Metadata and both checksums are in `src/solar-observation.json`. The importer removes radial-median brightness from the browse image and retains pixels within 96% of the apparent disk radius. A shader projects those pixels orthographically onto one hemisphere, with a smooth transition into the excluded limb. It recomputes observer-dependent limb darkening and uses normalized white display intensity. The far side has no duplicated spots, generated active regions or inferred solar geography. Orientation is schematic, activity is historical, and the display law is not a radiometric simulation.

Close inspection faces the observed hemisphere even after the Sun rotates. The source remains available in the object data panel. Reproduce and verify with Python, Pillow and NumPy:

```sh
python3 scripts/import-solar-observation.py
python3 scripts/import-solar-observation.py --verify
```

## Observed mosaics

- **Earth:** [NASA SVS Blue Marble](https://svs.gsfc.nasa.gov/2915/), a composite of land, ocean and ice observations with topographic shading. A separate [NASA Blue Marble cloud map](https://visibleearth.nasa.gov/images/57747/blue-marble-clouds/77558l) combines two days of visible imagery and a third day of thermal-infrared polar coverage. Brightness controls illustrative cloud opacity, not measured optical depth. It is archival weather, not a live feed.
- **Moon:** [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), the 2025 LROC 643/566/415 nm color map. NASA adjusted exposure and white balance toward human vision. The publisher fills polar color gaps using monochrome LOLA albedo and inpaints small missing pixels; this project adds no synthetic lunar surface detail. The registered LOLA float elevation map is converted to a normalized 16-bit PNG with a documented physical height range, **-8.8784999847 to +10.5040006638 km**, relative to a **1737.4 km** sphere. Surface color brightness is never treated as height.
- **Jupiter:** [Cassini PIA07782 cylindrical map](https://science.nasa.gov/resource/cassinis-best-maps-of-jupiter-cylindrical-map/). The mosaic uses 36 exposures from December 11-12, 2000, in 750 nm and 451 nm bands. NASA describes its reconstructed colors as close to human vision. Polar resolution is limited by viewing angle and haze, and atmospheric features are historical. The full rectangular image is used; it is not a photograph of a disk stretched around a sphere.

## NASA 3D visualization assets

Other maps are extracted from the downloadable models on the individual NASA Science pages listed above. The NASA Visualization Technology Applications and Development (VTAD) team supplies most of these; Mars, Phobos and Deimos are credited to NASA/JPL-Caltech. The pages do not provide a complete radiometric calibration history. Accordingly, these textures are identified as visualization assets rather than calibrated natural-color reflectance data.

Venus and Titan show their opaque atmosphere, not radar or infrared views of the hidden surface. Venus uses a pale cream palette and reduced contrast, guided by the [NASA Mariner 10 view PIA23791](https://science.nasa.gov/photojournal/venus-from-mariner-10/). That reference combines orange and ultraviolet exposures; the display adjustment is illustrative rather than calibrated RGB. Neptune's display color is a representative pale blue-green informed by the [NASA Neptune facts](https://science.nasa.gov/neptune/neptune-facts/) and [2024 spectroscopic reassessment](https://www.ox.ac.uk/news/2024-01-05-new-images-reveal-what-neptune-and-uranus-really-look-0); the display adjustment is not a new calibrated color reconstruction. Some Uranian moons and Triton have smooth gray regions in the published texture where detailed imagery is unavailable. Those gaps remain visible and are not filled with invented topography. Close-up inspection starts toward latitude -40 degrees on Ariel, Umbriel, Titania, Oberon, Miranda and Triton, where the published maps contain observed terrain. Free orbit still exposes the unmapped regions.

Most textures are already 2:1 equirectangular maps. Mercury, Mars and Saturn use a UV atlas in their NASA model. The importer resamples that atlas through the **original mesh vertices and UV coordinates** into an equirectangular map. It preserves original feature placement and uses seam-aware interpolation and explicit pole handling. The imported maps have complete raster coverage: no repair pixels were needed. Original source texture dimensions and resampling information remain in the manifest. The resulting orientation is the original visualization mapping, not a claim of accurate IAU rotational phase at the observation time.

Phobos, Deimos, Hyperion and Mimas keep the native mesh and UV atlas instead of reprojecting onto a sphere. Their geometry is exported as positions, normals, UVs and triangle indices in `public/models/official/`. Original local coordinates use Y up; the renderer centers and normalizes the model for display while preserving its shape. These are NASA educational visualization meshes, not certified digital terrain models. The original nonphysical metallic material setting is not inherited.

| Native mesh | Vertices | Triangles |
| --- | ---: | ---: |
| Phobos | 16,449 | 32,040 |
| Hyperion | 8,239 | 15,872 |
| Mimas | 5,559 | 10,930 |
| Deimos | 16,649 | 32,512 |

## Scientific PDS shape models

The importer preserves measured samples and coarse archival geometry without generating extra craters. Source tables are in body-fixed kilometres with north along +Z. The proper rigid rotation `[x, z, -y]` maps this to the renderer's Y-up system. Triangle normals are derived from the archived surface; centering and normalization are only display operations. The animation does not claim the exact spacecraft observation pose.

| Scientific model | Exported vertices | Triangles | Sampling and limitations |
| --- | ---: | ---: | --- |
| Janus | 13,381 | 26,758 | Original Cassini ISS plate model; radii uncertain by 0.3-1.3 km |
| Epimetheus | 13,915 | 27,826 | Original Cassini ISS plate model; radii uncertain by 0.15-0.3 km |
| Amalthea | 2,522 | 5,040 | Original Voyager 5-degree grid; does not incorporate later Galileo observations |
| Larissa | 2,522 | 5,040 | Original Voyager 5-degree grid; fitted to only one image and very poorly constrained |
| Proteus | 2,522 | 5,040 | Original Voyager 5-degree grid; broad shape only |
| Phoebe | 24,736 | 49,152 | Original Q=128 ICQ vertices retained at every second grid position; about 2.39 km spacing |

**Janus and Epimetheus:** Peter Thomas's Cassini ISS products replace smooth ellipsoids with the observed broad outline and large depressions. The archive explicitly states that small crater morphology is not reliable. Their neutral gray material is an approximate display choice, not RGB calibration from the monochrome comparison images. A reliable global photographic albedo map was not found in the reviewed archives; the renderer does not manufacture one.

**Amalthea, Larissa and Proteus:** [Philip Stooke's PDS shape archive](https://sbnarchive.psi.edu/pds4/non_mission/small_bodies.stooke.shape-models/document/bundle_description.txt) provides longitude/latitude/radius samples every five degrees. Longitude is west-positive. The importer keeps the original sampling, joins the longitude seam and poles, and triangulates the measured grid. The archive cautions that these shapes can be too faceted or exaggerate depression depths. Larissa is particularly uncertain: its source label recommends the single-image fit only for estimating feature positions. Amalthea's reddish material does not reproduce its observed bright surface patches.

**Phoebe:** [Gaskell/Weirich's 2023 Cassini SPC product](https://sbn.psi.edu/pds/resource/weirichphoebeshape.html), DOI `10.26033/3k3c-5713`, supplies genuine shape and relative-albedo data. To keep the geometry bounded, the importer verifies the six Q=128 patches, retains every second original grid vertex, joins shared edges, and handles texture seams without modifying the source relief. This is deterministic reduction of an observed-data model, not procedurally generated terrain.

The 2222 x 1111 relative-albedo GeoTIFF is registered in its original east-positive body frame and reduced to 2048 x 1024. Source values are multiplied by an explicit display factor of 120 and encoded as grayscale; they are not geometric albedo or calibrated reflectance. A conservative polygon follows the author-marked reliability boundaries on page 7 of the [shape assessment](https://sbnarchive.psi.edu/pds4/cassini/satellite-phoebe.cassini.shape-models-maps_V1_0/document/phoebeshapeassessment.pdf). Suspect regions are uniform gray, leaving about 53% of the cylindrical raster textured. The underlying polar geometry is still weakly constrained in the source and is identified as such. No unseen photographic detail is invented.

Iapetus still uses its mapped reference ellipsoid. Inspection of the NASA GLB showed spherical geometry, so retaining that mesh would not restore the equatorial ridge's silhouette; this remains a documented limitation.

## Saturn rings

The radial RGBA texture comes from the original NASA Saturn model, including narrow bands, the Cassini Division, the Encke Gap and the outer F-ring profile. Its registration is recovered from the original ring mesh rather than estimated from the image: texture U=0 corresponds to **1.23230094 equatorial radii** (74,268.31 km), and U=1 to **2.33090106 radii** (140,478.75 km), using the model's 60,268 km equatorial radius. The mesh UVs verify this linear relationship to better than 0.00001 in U. The F-ring opacity peak occurs around 140,220-140,252 km in the reduced map.

The original 4096 x 16 strip is reduced to a 2048 x 8 PNG preserving its alpha channel. The renderer keeps independently documented major ring boundaries, samples the source radial texture across them and includes the outer ring region. Display alpha controls visibility and approximate shadow strength; it is not a calibrated measurement of optical depth. The source credit, original image name, registration, dimensions and SHA-256 checksum are included in the Saturn manifest entry.

## Reproduce and verify

Requires Python 3, Pillow and NumPy. Downloads are bounded to 80 MiB per source and cached in the ignored `test-results/official-source-cache/` directory. Sources were retrieved on **2026-10-02**. Only bounded JPEG/PNG maps and geometry JSON are committed; original GLBs, PDS tables, OBJ files and GeoTIFFs stay in the ignored cache.

```sh
python3 scripts/import-official-surfaces.py
python3 scripts/import-official-surfaces.py --verify
# Optional targeted re-import after reviewing a source update:
python3 scripts/import-official-surfaces.py --bodies janus epimetheus phoebe
```

The importer preserves source colors apart from ordinary resampling/JPEG encoding and the explicitly documented Phoebe relative-albedo display conversion and coverage mask. It does not run generative image processing, invent missing hemispheres or estimate topography from albedo. Local maps are at most 2048 pixels on either side (native UV atlases may be square); the browser does not need external image hosts to render bodies. SHA-256 checksums make updates reviewable. `--verify` checks committed hashes, bounded image dimensions, image decoding, finite mesh attributes, unit normals, vertex/index counts, index bounds and nondegenerate triangles without network access. A complete re-import was verified to reproduce every committed surface/model asset byte for byte.

NASA usage and attribution follow the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). NASA origin does not imply endorsement. Credits are retained in the manifest and the object appearance information. The older [JPL simulator texture archive](https://space.jpl.nasa.gov/tmaps/) explicitly labels several giant-planet and Titan maps fictitious; those maps were not imported as observed imagery.
