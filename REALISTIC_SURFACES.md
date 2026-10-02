# Celestial surface and shape resources

The renderer uses local, bounded copies of official NASA resources for all eight planets and 20 selected moons: 31 textures (28 body maps, Earth clouds, lunar elevation and Saturn rings) and three native meshes. These assets replace unrelated repeating moon textures and generic procedural terrain. Three moons (Phobos, Hyperion and Mimas) retain the original irregular NASA mesh and matching UV mapping. Other body shapes use the physical radii documented in `src/body-shape-data.js`.

This is a scientific visualization, not a calibrated photometric simulator. Observed mosaics, processed NASA 3D visualization textures, cloud reconstructions and unobserved terrain are identified separately. The catalogue records the source URL, direct asset URL, credit, spectral interpretation, limitations, retrieval date, source checksum and local checksum for every resource in [`src/official-surfaces.json`](src/official-surfaces.json).

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
| Ariel | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/ariel-3d-model/) |
| Umbriel | NASA visualization map | [1024 x 512](https://science.nasa.gov/resource/umbriel-3d-model/) |
| Titania | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/titania-3d-model/) |
| Oberon | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/oberon-3d-model/) |
| Miranda | NASA visualization map | [1024 x 512](https://science.nasa.gov/resource/miranda-3d-model/) |
| Triton | NASA visualization map | [2048 x 1024](https://science.nasa.gov/resource/triton-3d-model/) |

The Sun uses a neutral visible-light photosphere approximation: orange extreme-ultraviolet imagery is not passed off as a visible surface. Moons without a suitable official asset retain an explicitly approximate ellipsoid and a neutral material. No synthetic crater pattern is described as observed terrain. Exoplanet surface geography and stellar surface details generally are not spatially resolved by the imported catalogues; their appearance remains representative.

## Observed mosaics

- **Earth:** [NASA SVS Blue Marble](https://svs.gsfc.nasa.gov/2915/), a composite of land, ocean and ice observations with topographic shading. A separate [NASA Blue Marble cloud map](https://visibleearth.nasa.gov/images/57747/blue-marble-clouds/77558l) combines two days of visible imagery and a third day of thermal-infrared polar coverage. Brightness controls illustrative cloud opacity, not measured optical depth. It is archival weather, not a live feed.
- **Moon:** [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), the 2025 LROC 643/566/415 nm color map. NASA adjusted exposure and white balance toward human vision. The publisher fills polar color gaps using monochrome LOLA albedo and inpaints small missing pixels; this project adds no synthetic lunar surface detail. The registered LOLA float elevation map is converted to a normalized 16-bit PNG with a documented physical height range, **-8.8784999847 to +10.5040006638 km**, relative to a **1737.4 km** sphere. Surface color brightness is never treated as height.
- **Jupiter:** [Cassini PIA07782 cylindrical map](https://science.nasa.gov/resource/cassinis-best-maps-of-jupiter-cylindrical-map/). The mosaic uses 36 exposures from December 11-12, 2000, in 750 nm and 451 nm bands. NASA describes its reconstructed colors as close to human vision. Polar resolution is limited by viewing angle and haze, and atmospheric features are historical. The full rectangular image is used; it is not a photograph of a disk stretched around a sphere.

## NASA 3D visualization assets

Other maps are extracted from the downloadable models on the individual NASA Science pages listed above. The NASA Visualization Technology Applications and Development (VTAD) team supplies most of these; Mars and Phobos are credited to NASA/JPL-Caltech. The pages do not provide a complete radiometric calibration history. Accordingly, these textures are identified as visualization assets rather than calibrated natural-color reflectance data.

Venus and Titan show their opaque atmosphere, not radar or infrared views of the hidden surface. Neptune's display color is a representative pale blue-green informed by the [NASA Neptune facts](https://science.nasa.gov/neptune/neptune-facts/) and [2024 spectroscopic reassessment](https://www.ox.ac.uk/news/2024-01-05-new-images-reveal-what-neptune-and-uranus-really-look-0); the display adjustment is not a new calibrated color reconstruction. Some Uranian moons and Triton have smooth gray regions in the published texture where detailed imagery is unavailable. Those gaps remain visible and are not filled with invented topography.

Most textures are already 2:1 equirectangular maps. Mercury, Mars and Saturn use a UV atlas in their NASA model. The importer resamples that atlas through the **original mesh vertices and UV coordinates** into an equirectangular map. It preserves original feature placement and uses seam-aware interpolation and explicit pole handling. The imported maps have complete raster coverage: no repair pixels were needed. Original source texture dimensions and resampling information remain in the manifest. The resulting orientation is the original visualization mapping, not a claim of accurate IAU rotational phase at the observation time.

Phobos, Hyperion and Mimas keep the native mesh and UV atlas instead of reprojecting onto a sphere. Their geometry is exported as positions, normals, UVs and triangle indices in `public/models/official/`. Original local coordinates use Y up; the renderer centers and normalizes the model for display while preserving its shape. These are NASA educational visualization meshes, not certified digital terrain models. The original nonphysical metallic material setting is not inherited.

| Native mesh | Vertices | Triangles |
| --- | ---: | ---: |
| Phobos | 16,449 | 32,040 |
| Hyperion | 8,239 | 15,872 |
| Mimas | 5,559 | 10,930 |

## Saturn rings

The radial RGBA texture comes from the original NASA Saturn model, including narrow bands, the Cassini Division, the Encke Gap and the outer F-ring profile. Its registration is recovered from the original ring mesh rather than estimated from the image: texture U=0 corresponds to **1.23230094 equatorial radii** (74,268.31 km), and U=1 to **2.33090106 radii** (140,478.75 km), using the model's 60,268 km equatorial radius. The mesh UVs verify this linear relationship to better than 0.00001 in U. The F-ring opacity peak occurs around 140,220-140,252 km in the reduced map.

The original 4096 x 16 strip is reduced to a 2048 x 8 PNG preserving its alpha channel. The renderer keeps independently documented major ring boundaries, samples the source radial texture across them and includes the outer ring region. Display alpha controls visibility and approximate shadow strength; it is not a calibrated measurement of optical depth. The source credit, original image name, registration, dimensions and SHA-256 checksum are included in the Saturn manifest entry.

## Reproduce and verify

Requires Python 3, Pillow and NumPy. Downloads are bounded to 80 MiB per source and cached in the ignored `test-results/official-source-cache/` directory. Sources were retrieved on **2026-10-02**. Only bounded JPEG/PNG maps and lightweight geometry JSON are committed; the downloaded GLBs are not.

```sh
python3 scripts/import-official-surfaces.py
python3 scripts/import-official-surfaces.py --verify
```

The importer preserves source colors, except for ordinary image resampling/JPEG encoding. It does not run generative image processing, invent missing hemispheres or estimate topography from albedo. Local maps are at most 2048 pixels on either side (native UV atlases may be square); the browser does not need external image hosts to render bodies. SHA-256 checksums make updates reviewable. `--verify` checks committed file hashes and image decoding without network access.

NASA usage and attribution follow the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). NASA origin does not imply endorsement. Credits are retained in the manifest and the object appearance information. The older [JPL simulator texture archive](https://space.jpl.nasa.gov/tmaps/) explicitly labels several giant-planet and Titan maps fictitious; those maps were not imported as observed imagery.
