# ÆTHER — Scientific cosmic atlas

An interactive astronomical atlas with five reference scales, 3D constellations, an Earth sky view, and WebXR support. **English is the default language.** Choose **Settings → Interface language → Italiano** to use Italian. The language choice is saved, and the current map is restored when the interface reloads.

[Documentazione italiana](README.it.md)

## Run locally

Use Node.js 22 or 24 and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Build and preview the static application:

```sh
npm run build
npm run preview -- --port 5174
```

The application needs no account, API key or backend. Data and planet textures are bundled locally. The full stellar catalogue loads when a constellation is first opened.

## Catalogues and reference frames

- **Solar System:** Sun, eight planets and 28 selected major moons across six planetary systems. Earth’s Moon has a local lunar surface map; other satellite surfaces are illustrative. Planet sizes are enlarged and orbital spacing compressed for navigation.
- **Exoplanets:** all **6,360 confirmed planets** in the NASA PSCompPars snapshot, across **4,769 host stars**. Retrieval: **10 September 2026, 23:49 UTC**. The **28 planets with unknown distance** remain searchable. Host-system orbits and exoplanet surfaces are illustrative.
- **NASA stars and nebulae:** complete NASA HEASARC Hipparcos (118,218 entries) and Bright Star Catalogue stellar records (9,096), cross-matched into 118,356 display records, plus all 485 nebular entries in the NGC2000 archive. Names, Bayer designations and HIP/HR/HD/NGC/IC/Messier IDs are searchable. These named catalogues do not contain every star or nebula known to astronomy.
- **Nearby stars:** curated references and a HYG subset of 156 additional stars within 25 light-years.
- **Constellations:** **119,625 HYG v4.1 stars**, with **88 constellation figures** using Stellarium geometry. The 3D view uses a common linear distance scale. The Earth view projects sky directions for the selected location and instant.
- **Galactic and cosmological scales:** illustrative Milky Way, Local Group and cosmic-web representations, with source references in the object panels.

English uses IAU constellation names; Italian uses localized names. Search accepts aliases from either language. Dates, units, object descriptions, validation messages and VR controls follow the selected language.

## Navigation

Drag to orbit and scroll or pinch to zoom. Select a planet or moon to inspect its surface; the camera's minimum distance scales with the body radius. The **Planets & moons** catalogue supports name/host search, category and parent-planet filters, and pagination. A planet's **Major moons** button lists its included satellites; **View moon system** frames the planet and its moons together. Moon cards show the parent planet, mean radius, orbital semimajor axis and mean orbital period. Close moon inspection hides reference guides; the system view restores them. This is a curated selection of moons with schematic orbits, not a live ephemeris.

**Stars** and **Nebulae** below the search control open the NASA catalogue filters; they are also available in **Catalogue sections** and the search dialog. Search accepts **Rho Cygni**, **Rho Cigny**, **Scheat**, **Sheliak**, **M42** and catalogue identifiers. All matching results are paginated. **Catalogue data** opens the full scientific record. Existing HYG stars receive supplementary NASA information through HIP identity or an unambiguous positional match; their map coordinates retain HYG provenance.

The **NASA catalogue sky** places objects by equatorial direction on a reference sphere. Nebula clouds are illustrative angular extents, not photographs or measured three-dimensional shapes. Known distances remain in the information cards; unknown distances remain unavailable. The view supports zoom, immersive mode and VR.

Hipparcos ICRS positions at J1991.25 are propagated to J2000 with tangent-vector proper motion when both components exist. Otherwise their original position epoch is shown. Positive parallaxes with known relative uncertainty at most 20% permit a labelled inverse-parallax distance estimate. Original source uncertainties, photometric bands and catalogue-specific spectral measurements are retained.

In **Constellations**, choose **3D space** or **Earth surface**:

- **Show Earth** is enabled by default in 3D. The reference globe is enlarged at the origin.
- **View from Earth**, or selecting the globe, places the camera at the Earth origin while retaining stellar depth. Drag to look around; **Return to orbit** restores spatial navigation.
- **Location and time** accepts decimal degrees, decimal commas and degrees/minutes/seconds. The observer timezone is explicit; the default is Europe/Rome, with daylight-saving rules. Dates span 1900–2100.
- Observer edits are preserved when switching between the 3D and Earth tabs.
- The Orion example uses **38°06′51.98″ N, 15°39′00″ E, 11 December 2026 at 20:00 CET** (19:00 UTC). All 21 stars in the figure are above the geometric horizon.
- The **10,225 stars without usable distance** remain in the sky view and are omitted from the 3D volume. Seven figure stars have unknown depth.

The Earth sky model includes J2000 precession. Proper motion, parallax, nutation, atmospheric refraction, daylight, light pollution and terrain are not simulated. Earth–Sun separation is negligible at the constellation scale and is omitted. The sky stays at the selected instant until changed.

**Immersive view** hides interface text and labels. Press **Esc**, or use the textless restore control, to return. Reduced-motion preferences disable decorative animation. Short desktop windows use independently scrollable side panels above the reference-scale bar.

Shortcuts: **1–5** reference scale, **R** reset, **/** search, **Space** auto-rotation, **Esc** close dialog or immersive view.

## Immersive preview, VR and mixed reality

Open **VR / MR**. **Start desktop preview** provides the room-scale first-person view on a PC without a headset: W A S D to walk, Q / E to change height, drag to look around, and click to select. The preview includes map size, rotation, search and clear-screen controls.

On Quest, choose **Enter mixed reality** for passthrough or **Enter VR atlas** for the virtual background. **Room scale** is the default: the map starts around the viewer and stays fixed in the session's floor coordinates as they walk. Hand tracking is optional; controllers are supported. **Tabletop** remains available. See [Immersive views](IMMERSIVE.md) for controls and headset setup.

- Brief pinch or trigger: select an object.
- Hold a pinch or controller grip: move/rotate the spatial atlas.
- Two grips: scale and rotate the atlas.
- The VR panel provides object focus, reference scales, constellation cycling, Earth/3D perspective, recentering, immersive view and exit.
- Earth sky surrounds the observer. Grips do not move or tilt the geometric horizon.

WebXR requires HTTPS or localhost. A LAN HTTP URL is insufficient. To use existing trusted certificates with the development server:

```sh
TLS_CERT=/path/cert.pem TLS_KEY=/path/key.pem npm run dev
```

Simulated VR tests cover interaction and session behavior; tracking and comfort still require a physical headset.

## Sources

- [NASA star archives](DATA_NASA_STARS.md): complete Hipparcos and Bright Star snapshots, coordinate epochs and naming sources.
- [NASA nebula archive](DATA_NASA_NEBULAE.md): the full NGC2000 nebular subset, angular sizes and NASA object information.
- [Moon catalogue](DATA_MOONS.md): 28 selected NASA/JPL natural satellites and their measured properties.
- [Planetary snapshot](DATA_EXOPLANETS.md): NASA archive, nullable measurements and importer.
- [Stellar catalogues and constellation geometry](DATA_CONSTELLATIONS.md): HYG / David Nash and Stellarium, CC BY-SA 4.0, pinned revisions and checksums.
- [Nearby stars and curated sources](DATA_SOURCES.md).
- [Planet textures](TEXTURE_SOURCES.md): Solar System Scope, CC BY 4.0.

Regenerate catalogues with the corresponding scripts in `scripts/`. HYG is a historical observational catalogue, not a census of every known star. No synthetic star replaces a missing measured position.

## Verification

```sh
npm test
npm run build
# Keep dev on :5173 and preview on :5174 running for browser checks:
npm run test:browser
npm run test:engine
npm run test:moons
npm run test:nasa
npm run test:constellations
npm run test:constellation-ui
npm run test:earth-reference
npm run test:language
npm run test:layout
```

Browser checks require Playwright Chromium (`npx playwright install chromium` if needed). They cover layout at ten viewport sizes, both languages and explicit language persistence, planet navigation, the reported winter Orion case, immersion, and actual rendered camera transitions. Screenshots are written to `test-results/`.

The local reference video is `treasure_planet_map_video.mp4`. Git author: `acilione <antoninocilione96@gmail.com>`. Generated builds, dependencies and test screenshots are excluded from version control.
