# Planet texture credits

The 11 files below are redistributed from **Solar System Scope / INOVE**, “Solar Textures”:
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
| `2k_mars.jpg` | https://www.solarsystemscope.com/textures/download/2k_mars.jpg |
| `2k_jupiter.jpg` | https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg |
| `2k_saturn.jpg` | https://www.solarsystemscope.com/textures/download/2k_saturn.jpg |
| `2k_saturn_ring_alpha.png` | https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png |
| `2k_uranus.jpg` | https://www.solarsystemscope.com/textures/download/2k_uranus.jpg |
| `2k_neptune.jpg` | https://www.solarsystemscope.com/textures/download/2k_neptune.jpg |
| `2k_sun.jpg` | https://www.solarsystemscope.com/textures/download/2k_sun.jpg |

These source images are included unchanged. The renderer wraps them around spheres, adds lighting, thin atmospheric rims and a separate cloud layer for Earth, and maps the Saturn ring image radially onto ring geometry. All maps are loaded from this project's server; there is no runtime hotlink or texture-service dependency.

Solar System Scope describes these maps as derived from NASA imagery and elevation data. Their colors have been adjusted for illustration; incompletely mapped regions can include invented terrain. Venus uses its visible cloud atmosphere. These are visual maps, not live observations. Planet sizes, distances and axial orientations in the atlas are adapted for legibility and do not constitute an ephemeris.

Exoplanets use an original, deterministic procedural shader based on their catalog radius and equilibrium temperature when available. Their colors, clouds and terrain are **artistic illustrations, not observed surface features or evidence of habitability**. Most exoplanets do not have directly resolved surfaces.

To download the exact original texture files again, run:

```sh
python3 public/textures/download-textures.py
```
