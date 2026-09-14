# Solar System moon catalogue

`src/moons.js` contains 28 selected natural satellites: Earth's Moon; Phobos and Deimos; Amalthea and the four Galilean satellites; eleven Saturnian satellites; Uranus's five large satellites; and Larissa, Proteus, Triton and Nereid. This curated selection is not a complete list of known moons. Mercury and Venus have no entries.

The catalogue was checked on 11 September 2026 against NASA/JPL Solar System Dynamics:

- [Planetary Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/): volume-equivalent mean radii in kilometres, including estimates for irregular bodies.
- [Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/): semimajor axes in kilometres and the table's mean orbital period `P` in days. Earth and most major satellites use the table's J2000 epoch; Nereid uses its listed 2020 epoch.

`periodDays` copies the fitted mean-elements table's `P`, not an independently calculated sidereal period. `periodKind` records this distinction. Periods are positive; Phoebe and Triton have a separate `retrograde` flag. The source URLs accompany every object. Physical measurements and display coordinates use separate fields.

The 3D arrangement is schematic. Circular, coplanar display orbits use stable illustrative phases, with compressed separations and enlarged bodies. Display lanes preserve increasing semimajor-axis order while keeping moons clear of their parent, Saturn's visible rings, and each other. They do not reproduce eccentricity, measured orbital-plane orientations, libration, resonances, or Janus and Epimetheus's co-orbital exchange. These elements do not provide live ephemerides. Colors are illustrative.

The module exports `solarMoons`, `moonsForPlanet(parentId)`, `findMoon(id)` and `moonCatalogMetadata`. English names and descriptions are the default; Italian is loaded through the application's explicit language setting.
