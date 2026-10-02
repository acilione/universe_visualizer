# Planet and moon texture credits

The current renderer prefers official NASA spacecraft imagery and visualization assets, with measured NASA/JPL reference shapes. Full per-body provenance, processing, bands and coverage are documented in [REALISTIC_SURFACES.md](REALISTIC_SURFACES.md) and `src/official-surfaces.json`. Body data panels expose these sources and an individually reviewed NASA reference photograph. The [body appearance audit](BODY_APPEARANCE_AUDIT.md) covers all 37 individually rendered Solar System bodies. The Sun uses a dated, grayscale SDO/HMI observation on the observed hemisphere; white represents visible light, while the brightness and limb law are display models. Scientific PDS shape products supplement the NASA visualization meshes.

## Legacy illustration textures

The 12 files below are redistributed from **Solar System Scope / INOVE**, “Solar Textures”:
https://www.solarsystemscope.com/textures/

**License: Creative Commons Attribution 4.0 International (CC BY 4.0).**
https://creativecommons.org/licenses/by/4.0/

License and source page verified on 11 September 2026. Credit is also displayed in the application's credits.

| Local file in `public/textures/` | Original download |
| --- | --- |
| `2k_mercury.jpg` | https://www.solarsystemscope.com/textures/download/2k_mercury.jpg |
| `2k_venus_atmosphere.jpg` | https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg |
| `2k_earth_daymap.jpg` | https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg |
| `2k_earth_clouds.jpg` | https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg |
| `2k_moon.jpg` | https://www.solarsystemscope.com/textures/download/2k_moon.jpg |
| `2k_mars.jpg` | https://www.solarsystemscope.com/textures/download/2k_mars.jpg |
| `2k_jupiter.jpg` | https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg |
| `2k_saturn.jpg` | https://www.solarsystemscope.com/textures/download/2k_saturn.jpg |
| `2k_saturn_ring_alpha.png` | https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png |
| `2k_uranus.jpg` | https://www.solarsystemscope.com/textures/download/2k_uranus.jpg |
| `2k_neptune.jpg` | https://www.solarsystemscope.com/textures/download/2k_neptune.jpg |
| `2k_sun.jpg` | https://www.solarsystemscope.com/textures/download/2k_sun.jpg |

These source images remain included unchanged for any fallback illustrations. Official maps take priority. Texture assets load from this project's server; there is no runtime hotlink or texture-service dependency. Saturn and Uranus rings use separately sourced radial geometry, and surfaces receive illumination from the displayed Sun.

Solar System Scope describes these maps as derived from NASA imagery and elevation data. Their colors have been adjusted for illustration; incompletely mapped regions can include invented terrain. Venus uses its visible cloud atmosphere. These are visual maps, not live observations. Planet sizes, distances and axial orientations in the atlas are adapted for legibility and do not constitute an ephemeris.

Earth's Moon uses NASA LRO surface color and measured elevation. Other moons use the official maps or visualization meshes listed in the coverage manifest. Bodies without mapped terrain retain a neutral surface with NASA/JPL reference semiaxes. Missing imagery is not replaced with invented craters. Titan shows its opaque atmospheric haze.

Exoplanets use an original, deterministic procedural shader based on their catalog radius and equilibrium temperature when available. Their colors, clouds and terrain are **artistic illustrations, not observed surface features or evidence of habitability**. Most exoplanets do not have directly resolved surfaces.

To download the exact original texture files again, run:

```sh
python3 public/textures/download-textures.py
```
