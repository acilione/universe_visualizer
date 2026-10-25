# ÆTHER — Scientific cosmic atlas

An interactive astronomical atlas with five reference scales, 3D constellations, an Earth sky view, and WebXR support. **English is the default language.** Choose **Settings → Interface language → Italiano** to use Italian. The language choice is saved, and the current map is restored when the interface reloads.

[Open the atlas](https://acilione.github.io/universe_visualizer/) · [Documentazione italiana](README.it.md)

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

The application needs no account, API key or backend. Core catalogues and planet textures are bundled locally; the full Gaia survey requires an internet connection. The combined catalogue loads at startup.

## Default view and Gaia streaming

The normal atlas and immersive entry default to the combined planets, moons, stars and nebulae view. Saved object-layer choices remain in effect. The Solar System is available while the local catalogues load; an explicit navigation action takes precedence over delayed loading.

**Catalogue sections > Gaia DR3 (Full sky, streamed detail)** opens on-demand access to the full CDS Gaia DR3 catalogue. Drag to look and scroll to resolve a smaller field. A worker loads only relevant progressive sky tiles, with fixed source and memory budgets. Source information preserves exact Gaia identifiers and native astrometry; the status distinguishes loaded sources from total archive coverage. This angular survey is separate from NASA catalogue merging and the optional bundled bright-source experiment.

[Full-Gaia architecture study](GAIA_STREAMING_STUDY.md) covers static hosting, service limits, level of detail, 3D distance uncertainty, and preparation for DR4. [Gaia data notes](DATA_GAIA_DR3.md) describe the implemented modes.

## Official imagery and Gaia DR3 experiment

Select an object and open **Archive images** for verified ESA/Hubble observations or an explicit NASA Image Library search. Images retain their full framing, credits, wavelengths and source links. [Archive sources and coverage](OFFICIAL_IMAGES.md).

Open **Settings → Gaia DR3** to enable the optional all-sky **G ≤ 6** subset (6,764 ESA sources). **Gaia coverage and cross-matches**, also available in Catalogue sections, reports **4,986 NASA associations**, **83 additional sources** and **1,695 withheld records**. NASA values and IDs remain intact; native Gaia measurements are shown separately. This is a bounded DR3 experiment. [Data, matching policy and reproduction](DATA_GAIA_DR3.md).

## Celestial-body rendering

Solar System bodies use official NASA surface maps and spacecraft visualization assets where available. The Moon combines LRO color imagery with measured lunar elevation. Ten moons use NASA 3D or NASA PDS shape models, including measured Cassini geometry for Janus and Epimetheus. The Sun uses a dated SDO/HMI observation for visible sunspot detail on its observed hemisphere. NASA/JPL reference semiaxes reproduce planetary flattening and the proportions of other moons. Saturn and Uranus have separate ring systems with measured radial boundaries. Saturn uses NASA’s registered ring texture and casts shadows between its globe and rings.

Object data identifies the appearance source, observing bands, image coverage and shape measurements. Unmapped regions and illustrative reconstructions remain identified. Venus and Titan show their opaque cloud or haze layers; exoplanet surfaces remain illustrations because surface maps are unavailable.

Illumination follows the Sun in map coordinates, including when the map is moved or scaled in VR. Inspection starts on the illuminated side and favors the photographed hemisphere where coverage is incomplete. Solar inspection starts on the hemisphere captured by SDO. Display exposure is normalized across the compressed Solar System; this is not a simulation of apparent brightness at physical distances. Planet spin uses measured rotation periods at 600 simulated seconds per second. Moon orientations remain fixed with the schematic orbits. **Space** pauses auto-rotation.

[Body-by-body NASA comparison](BODY_APPEARANCE_AUDIT.md) · [Sources, processing and coverage](REALISTIC_SURFACES.md) · [Texture credits](TEXTURE_SOURCES.md).

## Catalogues and reference frames

- **Solar System:** Sun, eight planets and 28 selected major moons across six planetary systems. Planet and moon appearances use locally bundled spacecraft maps where available and measured reference shapes. Planet sizes are enlarged and orbital spacing compressed for navigation.
- **Exoplanets:** all **6,360 confirmed planets** in the NASA PSCompPars snapshot, across **4,769 host stars**. Retrieval: **10 September 2026, 23:49 UTC**. The **28 planets with unknown distance** remain searchable. Host-system orbits and exoplanet surfaces are illustrative.
- **NASA stars and nebulae:** complete NASA HEASARC Hipparcos (118,218 entries) and Bright Star Catalogue stellar records (9,096), cross-matched into 118,356 display records, plus all 485 nebular entries in the NGC2000 archive. Names, Bayer designations and HIP/HR/HD/NGC/IC/Messier IDs are searchable. These named catalogues do not contain every star or nebula known to astronomy.
- **Nearby stars:** curated references and a HYG subset of 156 additional stars within 25 light-years.
- **Constellations:** **119,625 HYG v4.1 stars**, with **88 constellation figures** using Stellarium geometry. The 3D view uses a common linear distance scale. The Earth view projects sky directions for the selected location and instant.
- **Galactic and cosmological scales:** illustrative Milky Way, Local Group and cosmic-web representations, with source references in the object panels.

English uses IAU constellation names; Italian uses localized names. Search accepts aliases from either language. Dates, units, object descriptions, validation messages and VR controls follow the selected language.

## Navigation

Click a linked object or its label to enter its detailed map: **Local Group → Milky Way → Solar System**. The Sun in **Nearby stars** also opens the Solar System. A single click is sufficient; double-clicking works too. In PC preview and VR/MR, selecting the same markers opens the destination around you and preserves your viewer pose.

Drag to orbit and scroll or pinch to zoom. Select a planet or moon to inspect its surface; the camera's minimum distance scales with the body radius. The **Planets & moons** catalogue supports name/host search, category and parent-planet filters, and pagination. A planet's **Major moons** button lists its included satellites; **View moon system** frames the planet and its moons together. Moon cards show the parent planet, mean radius, orbital semimajor axis and mean orbital period. Close moon inspection hides reference guides; the system view restores them. This is a curated selection of moons with schematic orbits, not a live ephemeris.

**Stars** and **Nebulae** below the search control open the NASA catalogue filters; they are also available in **Catalogue sections** and the search dialog. Search accepts object names, aliases and catalogue identifiers. All matching results are paginated. **Catalogue data** opens the full scientific record. Existing HYG stars receive supplementary NASA information through HIP identity or an unambiguous positional match; their map coordinates retain HYG provenance.

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

Open **VR / MR**. The default **Combined map** loads planets, moons, catalogue stars and nebulae together. PC preview and headset modes start with their control panels hidden. The **Planets**, **Stars** and **Nebulae** switches are independent and remember their state; set them before entering or use the optional preview controls. Choose **Current map** to retain another reference view.

**Start desktop preview** provides a first-person view without a headset: W A S D to walk, Q / E to change height, drag to look around, click an object to travel to it, and use the wheel for fast zoom. **B** or **Backspace** returns to the overview; repeating it moves one reference level outward. A small restore control opens optional map, search and placement controls.

On Quest, choose **Enter mixed reality** for passthrough or **Enter VR atlas** for the virtual background. **Room scale** surrounds the viewer and keeps the map fixed in the session's floor coordinates while they walk. Navigation works with bare hands and no floating menu:

- Point and briefly pinch to travel to a body or enter a linked system.
- Hold a pinch to move and rotate the map.
- Pinch with both hands and spread or bring them together for fast zoom.
- Hold a closed left fist for about **0.65 seconds** to return to the overview; release and repeat to move one level outward.

VR/MR object jumps fade the virtual map out and back in at its destination, with no camera flight or sweeping map movement. Headset tracking and room passthrough remain continuous; reduced-motion mode jumps immediately.

Controllers remain supported, and the headset system gesture ends the session. **Tabletop** can be selected before entry. Choose constellations, their Earth or 3D perspective, and object layers in the desktop interface, then use **Current map** to enter that view. Earth sky views preserve their geometric horizon.

**Dim room in mixed reality** defaults to **56%** and can be set from **0–80%** before entry. It darkens the background through black alpha composition only when WebXR reports `alpha-blend`, without changing native passthrough settings. Additive sessions do not dim. The dimmer leaves nearer opaque objects unchanged and is removed on exit.

Catalogue stars and nebulae remain around the observer during close-ups. An anchored reference grid, moving tracers, floating particles and arrival pulses provide local depth and interaction feedback. The combined view uses schematic planetary spacing and an angular catalogue sky, not a common physical-distance scale. Effects do not change scientific coordinates; reduced-motion preferences provide a static presentation. See [Immersive views](IMMERSIVE.md) for the complete controls, rendering limits and headset setup.

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
npm run test:immersive
npm run test:immersive-surround
npm run test:immersive-navigation
npm run test:immersive-entry
npm run test:combined
npm run test:drilldown
npm run test:experiments
npm run test:desktop-startup
npm run test:gaia-stream
npm run test:realism
npm run audit:gaia
```

Browser checks require Playwright Chromium (`npx playwright install chromium` if needed). They cover layout at ten viewport sizes, both languages and explicit language persistence, planet navigation, the reported winter Orion case, immersion, and actual rendered camera transitions. Screenshots are written to `test-results/`.
