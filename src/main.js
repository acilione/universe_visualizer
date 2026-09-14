import { getLanguage, setLanguage, t, locale } from './i18n.js';
import './style.css';
import { createIcons, Orbit, Search, Glasses, Maximize2, Minimize2, Plus, Minus, RotateCcw, Move, MousePointer2, Hand, Play, Pause, Volume2, VolumeX, Settings2, CircleHelp, X, ArrowUpRight, ArrowRight, Focus, Sparkles, Grid3X3, Tags, Layers, Info, Globe2, Star, Telescope, Check, ExternalLink } from 'lucide';
import { catalog, scales } from './data.js';
import { Universe } from './universe.js';
import { exoplanets, planetCatalogMetadata, findPlanet } from './planets.js';
import { solarMoons, moonsForPlanet, findMoon, moonCatalogMetadata } from './moons.js';
import { loadConstellations } from './constellation-catalog.js';
import { loadCelestialCatalog, normalizeCelestialSearch, findNasaStarForObject } from './celestial-catalog.js';
import { celestialMeasurements, celestialSourceLinks } from './celestial-info.js';
import { parseCoordinate, dateInputInZone, zonedDateInputToIso } from './observer-input.js';

document.documentElement.lang = getLanguage();
document.title = t('\u00c6THER \u2014 Scientific cosmic atlas', '\u00c6THER \u2014 Atlante cosmico scientifico');
document.querySelector('meta[name="description"]').content = t('Interactive astronomical catalogues: planets, stars, galaxies, 3D constellations and Earth sky views with WebXR.', 'Cataloghi astronomici interattivi: pianeti, stelle, galassie, costellazioni 3D e cielo terrestre con WebXR.');

const icons = { Orbit, Search, Glasses, Maximize2, Minimize2, Plus, Minus, RotateCcw, Move, MousePointer2, Hand, Play, Pause, Volume2, VolumeX, Settings2, CircleHelp, X, ArrowUpRight, ArrowRight, Focus, Sparkles, Grid3X3, Tags, Layers, Info, Globe2, Star, Telescope, Check, ExternalLink };
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const $ = selector => document.querySelector(selector);
const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden':'true' } });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const preferences = (() => { try { return JSON.parse(localStorage.getItem('aether.preferences') || '{}') || {}; } catch { return {}; } })();
const state = {
  scale: 0, context: null, object: catalog.solar[0], labels: preferences.labels !== false,
  grid: preferences.grid !== false, particles: preferences.particles !== false,
  autoRotate: typeof preferences.autoRotate === 'boolean' ? preferences.autoRotate : !reducedMotion,
  quality: preferences.quality === 'low' ? 'low' : 'high',
  tour: false, sound: false, cinematic: false
};
let universe = null;
let tourTimer = null;
let toastTimer = null;
let immersionTimer = null;
let immersionRevealTimer = null;
const searchBrowser = { query: '', scope: 'all', page: 0, loading: false, error: '' };
let nasaCatalogue = null;
let nasaSearchEntries = [];
const nasaEnrichments = new Set();
const planetBrowser = { query: '', filter: 'all', parentId: '', page: 0 };
const constellationBrowser = {
  query: '', mode: 'space', id: 'Ori', data: null, busy: false, earthVisible: true, timeZone: 'Europe/Rome',
  observer: { latitude: 41.9028, longitude: 12.4964, dateIso: new Date().toISOString() }
};
let constellationModalRequest = 0;
let returnFocus = null;
let xrSupported = false;
let mrSupported = false;
let spatialLayout = 'room';
let previewClean = false;
let xrChecked = false;
let audioContext = null;
let audioGain = null;
let audioSuspendTimer = null;

$('#app').innerHTML = `
  <main class="app-shell">
    <canvas id="universe" aria-label="${t("Three-dimensional cosmic atlas. Drag to orbit and scroll to zoom.","Atlante cosmico tridimensionale. Trascina per orbitare e usa la rotellina per avvicinarti.")}" tabindex="0"></canvas>
    <div class="vignette" aria-hidden="true"></div>
    <div class="labels" id="map-labels" aria-label="${t("Celestial objects on the map","Oggetti celesti sulla mappa")}"></div>
    <header class="topbar">
      <a class="brand" href="#esplora" aria-label="${t("Æther, cosmic atlas","Æther, atlante cosmico")}"><img src="/favicon.svg" alt=""/><div><div class="brand-word">ÆTHER</div><div class="brand-sub">${t("COSMIC ATLAS","ATLANTE COSMICO")}</div></div></a>
      <nav class="topnav" aria-label="${t("Main navigation","Navigazione principale")}">
        <button class="active" data-action="explore" aria-current="page">${t("Explore","Esplora")}</button>
        <button data-action="collections">${t("Catalogue sections","Sezioni del catalogo")}</button>
        <button data-action="about">${t("The project","Il progetto")} ${icon('arrow-up-right')}</button>
      </nav>
      <div class="top-actions"><button class="constellation-browser-button" data-action="constellations" aria-label="${t("Browse constellations","Esplora le costellazioni")}" title="${t("Constellations","Costellazioni")}">${icon('sparkles')}<span>${t("Constellations","Costellazioni")}</span></button><button class="planet-browser-button" data-action="planets" aria-label="${t("Browse planets and moons","Esplora pianeti e satelliti")}" title="${t("Planets & moons","Pianeti e satelliti")}">${icon('globe-2')}<span>${t("Planets & moons","Pianeti e satelliti")}</span></button><span class="live"><span class="status-dot"></span><span id="renderer-status">${t("3D RENDERER ACTIVE","RENDERER 3D ATTIVO")}</span></span><button class="vr-button" data-action="vr">${icon('glasses')} VR / MR</button></div>
    </header>
    <section class="intro" aria-label="${t("Selected region","Regione esplorata")}">
      <div class="eyebrow">${t("ASTRONOMICAL CATALOGUES","CATALOGHI ASTRONOMICI")}</div>
      <h1 id="scale-title">${scales[0].title}</h1>
      <div class="subtitle" id="scale-subtitle">${scales[0].subtitle}</div>
    </section>
    <aside class="left-panel" aria-label="${t("Map scale and layers","Scala e livelli della mappa")}">
      <div class="section-heading">${t("REFERENCE FRAME","SISTEMA DI RIFERIMENTO")} ${icon('layers')}</div>
      <section class="constellation-controls" id="constellation-controls" aria-label="${t("Constellation perspective","Prospettiva della costellazione")}" hidden>
        <button class="constellation-change" data-action="constellations"><span id="constellation-current">${t("Constellations","Costellazioni")}</span>${icon('search')}</button>
        <div class="constellation-mode" role="group" aria-label="${t("Observer position","Punto di osservazione")}">
          <button data-constellation-mode="space">${icon('orbit')}${t("3D space","Nello spazio 3D")}</button>
          <button data-constellation-mode="earth">${icon('globe-2')}${t("Earth view","Dalla Terra")}</button>
        </div>
        <div id="earth-space-controls" class="earth-space-controls" hidden>
          <div class="layer-row"><span>${icon('globe-2')}${t("Show Earth","Mostra la Terra")}</span><button class="toggle" role="switch" aria-label="${t("Show Earth","Mostra la Terra")}" aria-checked="true" data-action="earth-visible"></button></div>
          <button class="earth-perspective-button" data-action="earth-perspective">${icon('focus')}${t("View from Earth","Guarda dalla Terra")}</button>
          <button class="earth-perspective-button" data-action="earth-orbit" hidden>${icon('orbit')}${t("Return to orbit","Torna a orbitare")}</button>
          <small>${t("Earth shown at enlarged size at the map origin.","Terra ingrandita all'origine della mappa.")}</small>
        </div>
        <p id="constellation-status" class="constellation-status" aria-live="polite"></p>
        <button class="observer-adjust" data-action="constellation-observer">${icon('settings-2')}${t("Location and time","Luogo e orario")}</button>
      </section>
      <div class="scale-list" role="group" aria-label="${t("Select reference scale","Seleziona scala di riferimento")}">
        ${scales.map((scale, i) => `<button class="scale-button${i === 0 ? ' active' : ''}" data-scale="${i}" aria-pressed="${i === 0}"><span class="node" aria-hidden="true"></span><span>${scale.short}<small>${scale.extent}</small></span><span class="number">0${i + 1}</span></button>`).join('')}
      </div>
      <div class="layers"><div class="section-heading">${t("MAP LAYERS","LIVELLI DELLA MAPPA")}</div>
        ${[['labels',t("Labels","Etichette"),'tags'],['grid',t("Reference grid","Griglia di riferimento"),'grid-3x3'],['particles',t("Particle effects","Effetti particellari"),'sparkles']].map(([name,label,glyph]) => `<div class="layer-row"><span>${icon(glyph)}${label}</span><button class="toggle" role="switch" aria-label="${label}" aria-checked="${state[name]}" data-layer="${name}"></button></div>`).join('')}
      </div>
    </aside>
    <aside class="right-panel" aria-label="${t("Selected object information","Informazioni sull’oggetto selezionato")}">
      <button class="search-button" data-action="search">${icon('search')}<span>${t("Search catalogue","Cerca nel catalogo")}</span><kbd>/</kbd></button>
      <div class="catalogue-shortcuts"><button data-action="nasa-stars">${t("Stars","Stelle")}</button><button data-action="nasa-nebulae">${t("Nebulae","Nebulose")}</button></div>
      <article class="object-card" id="object-card"></article>
      <div class="coordinates"><span>${t("J2000 · REFERENCE","J2000 · RIFERIMENTO")}</span><span>${t("ILLUSTRATIVE MAP","MAPPA ILLUSTRATIVA")}</span></div>
    </aside>
    <div class="center-caption" aria-hidden="true"><div class="galaxy-name" id="region-name">${t("SOLAR SYSTEM","SISTEMA SOLARE")}</div><div class="galaxy-type" id="region-type">${t("SUN, PLANETS AND MAJOR MOONS","SOLE, PIANETI E SATELLITI PRINCIPALI")}</div></div>
    <div class="view-controls" role="group" aria-label="${t("View controls","Controlli di visualizzazione")}">
      <button class="icon-button mobile-info" data-action="object" title="${t("Object information","Informazioni sull’oggetto")}" aria-label="${t("Object information","Informazioni sull’oggetto")}">${icon('info')}</button>
      <button class="icon-button" data-action="zoom-in" title="${t("Zoom in","Avvicina")}" aria-label="${t("Zoom in","Avvicina")}">${icon('plus')}</button>
      <button class="icon-button" data-action="zoom-out" title="${t("Zoom out","Allontana")}" aria-label="${t("Zoom out","Allontana")}">${icon('minus')}</button>
      <div class="separator"></div>
      <button class="icon-button" data-action="reset" title="${t("Reset view · R","Ripristina vista · R")}" aria-label="${t("Reset view","Ripristina vista")}">${icon('rotate-ccw')}</button>
      <button class="icon-button${state.autoRotate ? ' active' : ''}" data-action="rotate" aria-pressed="${state.autoRotate}" title="${t("Auto-rotate · Space","Rotazione automatica · Spazio")}" aria-label="${t("Auto-rotate","Rotazione automatica")}">${icon('orbit')}</button>
      <button class="immersion-button" data-action="cinema" title="${t("Hide all text · Esc to restore","Nasconde tutte le scritte · Esc per tornare")}" aria-label="${t("Immersive view, hide all text","Vista immersiva, nascondi tutte le scritte")}" aria-pressed="false">${icon('maximize-2')}<span>${t("Immersive view","Vista immersiva")}</span></button>
    </div>
    <section class="bottom-panel" aria-label="${t("Reference scale navigation","Navigazione delle scale")}">
      <div class="scale-readout"><div class="readout-title">${t("REFERENCE SCALE","SCALA DI RIFERIMENTO")}</div><div class="readout-value" id="scale-readout">${scales[0].extent}</div></div>
      <div class="journey">
        <div class="journey-top"><span>${t("Reference scale navigation","Navigazione fra scale di riferimento")}</span><small id="scale-step">01 / 05</small></div>
        <input id="scale-slider" type="range" min="0" max="4" step="1" value="0" aria-label="${t("Reference scale","Scala di riferimento")}" aria-valuetext="${t("Solar System","Sistema Solare")}"/>
        <div class="journey-labels"><span>${t("SOLAR SYSTEM","SISTEMA SOLARE")}</span><span>${t("OBSERVABLE UNIVERSE","UNIVERSO OSSERVABILE")}</span></div>
        <button class="cosmic-return" data-action="cosmic-scales" hidden>${icon('arrow-right')}${t("Return to reference scales","Torna alle scale di riferimento")}</button>
      </div>
      <div class="play-area"><button class="play-button" data-action="tour" aria-label="${t("Start scale sequence","Avvia sequenza delle scale")}" aria-pressed="false">${icon('play')}</button><div><strong id="tour-title">${t("Automatic sequence","Sequenza automatica")}</strong><small id="tour-caption">${t("Cycle through five reference scales","Scorri le cinque scale di riferimento")}</small></div></div>
    </section>
    <footer class="footer">
      <div class="footer-controls"><span>${icon('mouse-pointer-2')} ${t("Drag to orbit","Trascina per orbitare")}</span><span>${icon('move')} ${t("Scroll to zoom","Scorri per ingrandire")}</span><span>${icon('hand')} ${t("Hand tracking in VR","Tracciamento mani in VR")}</span></div>
      <div class="footer-right"><span>${t("J2000 · CATALOGUE COORDINATES","J2000 · COORDINATE DI CATALOGO")}</span><button data-action="sound" aria-pressed="false" aria-label="${t("Enable ambient audio","Attiva suono ambiente")}">${icon('volume-x')}<span id="sound-label">${t("Audio off","Suono off")}</span></button><button data-action="settings" title="${t("Settings","Impostazioni")}" aria-label="${t("Settings","Impostazioni")}">${icon('settings-2')}</button><button data-action="help" title="${t("Controls guide","Guida ai comandi")}" aria-label="${t("Controls guide","Guida ai comandi")}">${icon('circle-help')}</button></div>
    </footer>
    <button class="exit-cinema" data-action="cinema" aria-label="${t("Show interface","Mostra interfaccia")}">${icon('minimize-2')}</button>
    <section id="preview-hud" class="preview-hud" aria-label="${t("Desktop VR preview controls","Controlli anteprima VR su PC")}" hidden>
      <div class="preview-top">
        <div class="preview-heading"><strong>${t("Desktop VR preview","Anteprima VR su PC")}</strong><span id="preview-space-note"></span></div>
        <div class="preview-actions"><button data-action="preview-clean" title="${t("Hide controls","Nascondi comandi")}">${icon('maximize-2')}<span>${t("Hide controls","Nascondi comandi")}</span></button><button data-action="exit-preview">${icon('x')}${t("Exit preview","Esci dall'anteprima")}</button></div>
      </div>
      <div class="preview-bottom">
        <div class="preview-controls">
          <div class="preview-fields"><label>${t("Map","Mappa")}<select id="preview-scale">${scales.map((scale,i)=>`<option value="${i}">${scale.name}</option>`).join('')}</select></label><label>${t("Layout","Disposizione")}<select id="preview-layout"><option value="room">${t("Room scale","Scala ambiente")}</option><option value="tabletop">${t("Tabletop","Mappa ridotta")}</option></select></label></div>
          <div class="preview-actions preview-map-actions" role="group" aria-label="${t("Transform the map","Trasforma la mappa")}"><button data-action="preview-scale-down" aria-label="${t("Reduce map size","Riduci dimensione mappa")}" title="${t("Reduce map size","Riduci dimensione mappa")}">${icon('minus')}</button><button data-action="preview-scale-up" aria-label="${t("Increase map size","Aumenta dimensione mappa")}" title="${t("Increase map size","Aumenta dimensione mappa")}">${icon('plus')}</button><button data-action="preview-rotate-left" aria-label="${t("Rotate map left","Ruota mappa a sinistra")}" title="${t("Rotate map left","Ruota mappa a sinistra")}">${icon('rotate-ccw')}</button><button data-action="preview-rotate-right" aria-label="${t("Rotate map right","Ruota mappa a destra")}" title="${t("Rotate map right","Ruota mappa a destra")}">${icon('rotate-cw')}</button><button data-action="recenter-preview">${t("Reset placement","Ripristina posizione")}</button><button data-action="preview-replay" aria-label="${t("Replay map opening","Ripeti apertura della mappa")}" title="${t("Replay map opening","Ripeti apertura della mappa")}">${icon('play')}${t("Replay opening","Ripeti apertura")}</button><button data-action="preview-search">${icon('search')}${t("Search","Cerca")}</button></div>
          <button class="preview-object" data-action="preview-object"><span id="preview-selection"></span>${icon('info')}</button>
        </div>
        <div class="preview-help"><p>${t("W A S D: walk · Q / E: down / up · Shift: faster","W A S D: cammina · Q / E: scendi / sali · Shift: più veloce")}</p><p>${t("Drag: look around · Click: select · Esc: exit","Trascina: guarda intorno · Clic: seleziona · Esc: esci")}</p><button data-action="preview-pointer-lock">${t("Enable mouse look","Attiva visuale con mouse")}</button></div>
      </div>
    </section>
    <button id="preview-restore" data-action="preview-clean" title="${t("Show controls","Mostra comandi")}" aria-label="${t("Show preview controls","Mostra comandi anteprima")}" hidden>${icon('minimize-2')}</button>
    <span class="preview-reticle" aria-hidden="true"></span>
    <div class="toast" role="status" aria-live="polite"></div>
    <div class="loading" role="status"><img src="/favicon.svg" alt=""/><span>${t("LOADING CATALOGUES","CARICAMENTO CATALOGHI")}</span></div>
  </main>
  <dialog id="modal" aria-labelledby="modal-title"><div class="dialog-head"><h2 id="modal-title"></h2><button data-action="close" aria-label="${t("Close dialog","Chiudi finestra")}">${icon('x')}</button></div><div id="modal-body"></div></dialog>
`;

function savePreferences() {
  const { labels, grid, particles, autoRotate, quality } = state;
  try { localStorage.setItem('aether.preferences', JSON.stringify({ labels, grid, particles, autoRotate, quality })); } catch { /* Storage can be unavailable in private browsers. */ }
}

function notify(message) {
  if (state.cinematic) return;
  const toast = $('.toast');
  toast.textContent = String(message);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}

const isPlanet = object => object?.isPlanet || object?.bodyKind === 'exoplanet' || catalog.solar.slice(1).some(planet => planet.id === object?.id);
const isMoon = object => object?.isMoon || object?.bodyKind === 'moon';
const number = (value, unit = '') => Number.isFinite(value) ? `${value.toLocaleString(locale(), { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}` : t("Not available","Non disponibile");
const currentScale = () => scales[state.scale] || {
  id: state.scale === 8 ? 'nasa-sky' : state.scale >= 6 ? 'constellations' : 'exoplanets',
  name: state.context?.name || state.object?.host || t("Exoplanet system","Sistema esoplanetario"),
  source: state.scale >= 6 ? 'https://github.com/astronexus/HYG-Database' : 'https://exoplanetarchive.ipac.caltech.edu/',
  extent: state.scale >= 6 ? t("HYG star catalogue","Catalogo stellare HYG") : t("Exoplanet system","Sistema esoplanetario"),
  ...state.context
};

function objectMarkup(object, isModal = false) {
  const scale = currentScale();
  const planet = isPlanet(object);
  const moon = isMoon(object);
  const nasa = object.nasaCatalogue || object.nasaInfo;
  const nebula = object.bodyKind === 'nebula';
  const moons = planet ? moonsForPlanet(object.id) : [];
  const exoplanet = object.bodyKind === 'exoplanet';
  const isOverview = object.id === catalog[scale.id]?.[0]?.id || object.id === state.context?.overview?.id;
  const catalogStar = !nebula && (object.bodyKind === 'catalog-star' || state.scale >= 6 && Number.isFinite(object.raDeg) && Number.isFinite(object.decDeg));
  const canDive = Number.isInteger(object.targetScale) && scales[object.targetScale];
  const measurements = nasa ? celestialMeasurements(object, isModal) : moon ? `<div class="planet-measurements moon-measurements">
    <div><span>${t("MEAN RADIUS","RAGGIO MEDIO")}</span><strong>${number(object.radiusKm, 'km')}</strong></div>
    <div><span>${t("ORBITAL SEMI-MAJOR AXIS","SEMIASSE MAGGIORE ORBITALE")}</span><strong>${number(object.semiMajorAxisKm, 'km')}</strong></div>
    <div><span>${t("MEAN ORBITAL PERIOD","PERIODO ORBITALE MEDIO")}</span><strong>${number(object.periodDays, t("days","giorni"))}</strong></div>
    <div><span>${t("ORBIT DIRECTION","DIREZIONE ORBITALE")}</span><strong>${object.retrograde ? t("Retrograde","Retrograda") : t("Prograde","Prograda")}</strong></div>
    </div>` : exoplanet ? `<div class="planet-measurements">
    <div><span>${t("RADIUS","RAGGIO")}</span><strong>${number(object.radiusEarth, 'R⊕')}</strong></div>
    <div><span>${t("ORBITAL PERIOD","PERIODO ORBITALE")}</span><strong>${number(object.periodDays, t("days","giorni"))}</strong></div>
    ${isModal ? `<div><span>${t("CATALOGUE MASS","MASSA DA CATALOGO")}${object.massProvenance ? ' · ' + escape(object.massProvenance) : ''}</span><strong>${number(object.massEarth, 'M⊕')}</strong></div><div><span>${t("EQUILIBRIUM TEMPERATURE","TEMPERATURA DI EQUILIBRIO")}</span><strong>${number(object.temperatureK, 'K')}</strong></div><div><span>${t("SEMI-MAJOR AXIS","SEMIASSE MAGGIORE")}</span><strong>${number(object.semiMajorAxisAu, t("AU","UA"))}</strong></div><div><span>${t("DISCOVERY YEAR","ANNO DI SCOPERTA")}</span><strong>${Number.isFinite(object.discoveryYear) ? object.discoveryYear : t("Not available","Non disponibile")}</strong></div>` : ''}
    </div>` : catalogStar ? `<div class="planet-measurements star-measurements">
      <div><span>${t("RIGHT ASCENSION · J2000","ASCENSIONE RETTA · J2000")}</span><strong>${number(object.raDeg, '°')}</strong></div>
      <div><span>${t("DECLINATION · J2000","DECLINAZIONE · J2000")}</span><strong>${number(object.decDeg, '°')}</strong></div>
      ${isModal ? `<div><span>${t("APPARENT MAGNITUDE","MAGNITUDINE APPARENTE")}</span><strong>${number(object.mag)}</strong></div><div><span>${t("HIPPARCOS IDENTIFIER","IDENTIFICATORE HIPPARCOS")}</span><strong>${object.hip ? 'HIP ' + escape(object.hip) : t("Not available","Non disponibile")}</strong></div>${state.scale === 7 ? `<div><span>${t("ALTITUDE ABOVE HORIZON","ALTEZZA SULL'ORIZZONTE")}</span><strong>${number(object.altitudeDeg, '°')}</strong></div>` : ''}` : ''}
    </div>` : '';
  return `<div class="card-top"><span>${nebula ? t("NEBULA DATA","DATI DELLA NEBULOSA") : nasa ? t("STAR DATA","DATI STELLARI") : moon ? t("MOON DATA","DATI DEL SATELLITE") : planet ? t("PLANET DATA","DATI DEL PIANETA") : isOverview ? t("CATALOGUE OVERVIEW","PANORAMICA DEL CATALOGO") : t("CELESTIAL OBJECT","OGGETTO CELESTE")}</span>${icon(planet || moon ? 'globe-2' : 'sparkles')}</div>
    <div class="card-content${planet || moon ? ' planet-card-content' : ''}"><h2>${escape(object.name)}</h2><div class="object-type">${escape(moon ? t("Natural satellite","Satellite naturale") : object.type || t("Catalogue star","Stella da catalogo"))}${exoplanet ? ' · ' + escape(object.host) : ''}</div>
      <p class="card-description">${escape(object.detail || state.context?.description || '')}</p>
      <div class="card-stats"><span>${moon ? t("PARENT PLANET","PIANETA PRINCIPALE") : isOverview ? escape(scale.metric) : exoplanet ? t("DISTANCE FROM EARTH","DISTANZA DALLA TERRA") : t("DISTANCE / EXTENT","DISTANZA / ESTENSIONE")}</span><strong>${escape(moon ? object.parentName : isOverview ? scale.count : object.distance || t("Not available","Non disponibile"))}</strong></div>
      ${isOverview ? `<div class="card-stats"><span>${t("EXTENT","ESTENSIONE")}</span><strong>${escape(scale.extent)}</strong></div>` : ''}
      ${measurements}
      ${catalogStar && !object.nasaCatalogue ? `<p class="illustration-note">${state.scale === 7 ? (object.altitudeDeg < 0 ? t("Below the horizon at the selected location and time.","Sotto l’orizzonte nel luogo e all’orario scelti.") : t("Sky direction at the selected location and time.","Direzione nel cielo dal luogo e all’orario scelti.")) : Number.isFinite(object.distanceLy) ? t("3D position from catalogue coordinates and distance.","Posizione 3D da coordinate e distanza di catalogo.") : t("Distance unavailable; included in the Earth sky view.","Distanza non disponibile: visibile nella vista dalla Terra.")}</p>${!isModal ? `<button class="planet-details-button" data-action="object">${t("Star data","Dati della stella")} ${icon('arrow-up-right')}</button>` : ''}` : ''}
      ${object.nasaCatalogue && !isModal ? `<button class="planet-details-button" data-action="object">${t("Catalogue data","Dati di catalogo")} ${icon('arrow-up-right')}</button>` : ''}
      ${isModal && object.positionNote ? `<p class="illustration-note">${escape(object.positionNote)}</p>` : ''}
      ${exoplanet ? `<p class="illustration-note">${t("Illustrative appearance. Measurements and estimates from the NASA catalogue.","Aspetto illustrativo. Misure e stime dal catalogo NASA.")}</p>` : ''}
      ${(planet || moon) && !isModal ? `<button class="planet-details-button" data-action="object">${moon ? t("Moon data","Dati del satellite") : t("Planet data","Dati del pianeta")} ${icon('arrow-up-right')}</button>` : ''}
      ${moons.length ? `<div class="moon-system-actions"><button class="moon-catalog-button" data-action="moons" data-parent="${escape(object.id)}">${t("Major moons","Satelliti principali")} (${moons.length}) ${icon('arrow-up-right')}</button><button class="moon-system-button" data-action="moon-system" data-parent="${escape(object.id)}">${icon('orbit')}${t("View moon system","Osserva il sistema di satelliti")}</button></div>` : ''}
      <button class="focus-button" data-action="focus"${object.nasaCatalogue && (!Number.isFinite(object.raDeg) || !Number.isFinite(object.decDeg)) ? ' disabled' : ''}>${icon(canDive ? 'arrow-right' : 'focus')}${object.nasaCatalogue ? t("Locate in sky","Localizza nel cielo") : moon ? t("Inspect moon","Osserva il satellite") : planet ? t("Inspect planet","Osserva il pianeta") : canDive ? t("Open ","Apri ") + escape(scales[object.targetScale].name) : t("Focus","Metti a fuoco")}</button>
      ${moon ? `<button class="moon-parent-button" data-object="${escape(object.parentId)}" data-object-scale="0">${icon('arrow-right')}${t("Return to ","Torna a ")}${escape(object.parentName)}</button>` : ''}
      ${nasa ? celestialSourceLinks(object) : ''}
      <a class="object-source" href="${escape(object.source || scale.source)}" target="_blank" rel="noopener noreferrer">${t("Scientific source ↗","Fonte scientifica ↗")}</a>
    </div>`;
}

function renderObject(object) {
  if (!object || !object.name) return;
  state.object = object;
  updatePreviewHud();
  $('#object-card').innerHTML = objectMarkup(object);
  $('.coordinates').innerHTML = `<span>${state.scale === 8 ? t("EQUATORIAL SKY DIRECTIONS","DIREZIONI CELESTI EQUATORIALI") : state.scale === 7 ? t("LOCAL HORIZON","ORIZZONTE LOCALE") : state.scale === 6 ? t("J2000 · HYG DISTANCES","J2000 · DISTANZE HYG") : ['stars','local'].includes(currentScale().id) ? t("J2000 · APPROXIMATE","J2000 · APPROSSIMATA") : t("SCHEMATIC VIEW","VISTA SCHEMATICA")}</span><span>${state.scale === 8 ? 'NASA HEASARC' : state.scale >= 6 ? t("HYG 4.1 CATALOGUE","CATALOGO HYG 4.1") : t("COSMIC ATLAS","ATLANTE COSMICO")}</span>`;
  if ($('#modal').open && $('#modal').dataset.kind === 'object') $('#modal-body').innerHTML = objectMarkup(object, true);
  refreshIcons();
  enrichStellarInformation(object);
}

function enrichStellarInformation(object) {
  if (object.nasaCatalogue || object.nasaInfo || nasaEnrichments.has(object.id) || !(object.bodyKind === 'catalog-star' || object.measured && Number.isFinite(object.raDeg))) return;
  nasaEnrichments.add(object.id);
  loadCelestialCatalog().then(data => {
    const info = findNasaStarForObject(data, object);
    if (!info) return;
    object.nasaInfo = info;
    if (state.object.id === object.id) renderObject(object);
  }).catch(() => { nasaEnrichments.delete(object.id); });
}

function updateScale(index, context = null) {
  index = Number(index);
  if (!Number.isInteger(index) || ![5, 6, 7, 8].includes(index) && !scales[index]) return;
  if (index !== state.scale) { clearTimeout(toastTimer); $('.toast').classList.remove('visible'); }
  state.scale = index;
  state.context = index >= 5 ? context || state.context : null;
  const scale = currentScale();
  updatePreviewHud();
  const hostView = index === 5;
  const constellationView = index === 6 || index === 7;
  const nasaView = index === 8;
  const detached = index >= 5;
  if (constellationView) {
    constellationBrowser.id = context?.constellationId || constellationBrowser.id;
    constellationBrowser.mode = index === 7 ? 'earth' : 'space';
    if (typeof context?.earthVisible === 'boolean') constellationBrowser.earthVisible = context.earthVisible;
    if (context?.observer) constellationBrowser.observer = { ...constellationBrowser.observer, ...context.observer };
  }
  $('#scale-title').textContent = nasaView ? scale.name : constellationView ? `${scale.name}.` : hostView ? `${t("Host star: ","Stella ospite: ")}${scale.name}.` : scale.title;
  $('#scale-subtitle').textContent = nasaView ? t("NASA catalogue sky positions; radial distance is not represented.","Posizioni celesti dai cataloghi NASA; la distanza radiale non viene rappresentata.") : constellationView ? index === 7 ? t("Local sky coordinates for the selected observer and time.","Coordinate del cielo per l’osservatore e l’istante selezionati.") : t("J2000 stellar positions and catalogue distances.","Posizioni stellari J2000 e distanze di catalogo.") : hostView ? t("Confirmed planets around the selected host star.","Pianeti confermati intorno alla stella selezionata.") : scale.subtitle;
  $('#scale-readout').textContent = scale.extent;
  $('#scale-step').textContent = nasaView ? 'NASA HEASARC' : constellationView ? index === 7 ? t("EARTH VIEW","DALLA TERRA") : t("CONSTELLATIONS","COSTELLAZIONI") : hostView ? t("EXOPLANETS","ESOPIANETI") : `0${index + 1} / 05`;
  $('#region-name').textContent = scale.name.toLocaleUpperCase(locale());
  $('#region-type').textContent = nasaView ? t("STARS AND NEBULAE","STELLE E NEBULOSE") : constellationView ? index === 7 ? t("LOCAL SKY · GEOMETRIC HORIZON","CIELO LOCALE · ORIZZONTE GEOMETRICO") : t("HYG STELLAR COORDINATES","COORDINATE STELLARI HYG") : hostView ? t("EXOPLANET SYSTEM · SCHEMATIC ORBITS","SISTEMA ESOPLANETARIO · ORBITE ILLUSTRATIVE") : index === 0 ? t("SUN, PLANETS AND MAJOR MOONS","SOLE, PIANETI E SATELLITI PRINCIPALI") : index === 4 ? t("CONCEPTUAL MODEL","RICOSTRUZIONE CONCETTUALE") : catalog[scale.id][0].type.toLocaleUpperCase(locale());
  const slider = $('#scale-slider');
  slider.disabled = detached;
  slider.hidden = detached;
  if (!detached) slider.value = index;
  slider.setAttribute('aria-valuetext', detached ? t("Select a reference scale.","Seleziona una scala di riferimento.") : scale.name);
  slider.style.background = `linear-gradient(90deg,#ac8c5d ${detached ? 0 : index * 25}%,#37434a ${detached ? 0 : index * 25}%)`;
  $('.journey-labels').hidden = detached;
  $('.cosmic-return').hidden = !detached;
  $('.journey-top > span').textContent = detached ? t("Reference scale navigation","Navigazione fra scale di riferimento") : t("Reference scale navigation","Navigazione fra scale di riferimento");
  $('.app-shell').classList.toggle('constellation-view', constellationView);
  $('.app-shell').classList.toggle('nasa-sky-view', nasaView);
  $('.app-shell').classList.toggle('earth-sky-view', index === 7);
  $('.app-shell').classList.toggle('earth-perspective-view', index === 6 && Boolean(context?.earthPerspective));
  $('#constellation-controls').hidden = !constellationView;
  $('#constellation-current').textContent = scale.name;
  document.querySelectorAll('#constellation-controls [data-constellation-mode]').forEach(button => {
    const selected = button.dataset.constellationMode === constellationBrowser.mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected);
  });
  $('#constellation-controls .observer-adjust').hidden = index !== 7;
  $('#earth-space-controls').hidden = index !== 6;
  $('[data-action="earth-visible"]').setAttribute('aria-checked', constellationBrowser.earthVisible);
  $('[data-action="earth-perspective"]').hidden = Boolean(context?.earthPerspective);
  $('[data-action="earth-orbit"]').hidden = !context?.earthPerspective;
  if (constellationView) {
    const observer = constellationBrowser.observer;
    const date = new Date(observer.dateIso);
    const when = Number.isFinite(date.getTime()) ? date.toLocaleString(locale(), { timeZone: constellationBrowser.timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }) : '';
    const visible = Number.isFinite(context?.visibleStarCount) ? `${context.visibleStarCount}${t(context.visibleStarCount === 1 ? " figure star above the horizon. " : " figure stars above the horizon. ", context.visibleStarCount === 1 ? " stella della figura sopra l’orizzonte. " : " stelle della figura sopra l’orizzonte. ")}` : '';
    $('#constellation-status').textContent = index === 7
      ? `${visible}${number(observer.latitude, '°')}, ${number(observer.longitude, '°')} · ${when}`
      : `${Number.isFinite(context?.starCount) ? context.starCount + t(" stars in the figure. "," stelle nella figura. ") : ''}${context?.earthPerspective ? t("Earth origin · 3D view without horizon clipping. Drag to look around. ","Origine terrestre · vista 3D senza orizzonte. Trascina per orientarti. ") : ''}${t("Stellar distances use a common linear scale.","Le distanze stellari usano una scala lineare comune.")}${context?.unknownDistanceCount ? t(" Some distances are unavailable."," Alcune distanze non sono disponibili.") : ''}`;
    if (index === 7) $('#constellation-status').innerHTML = `${escape(visible)}${escape(number(observer.latitude, '°'))}, ${escape(number(observer.longitude, '°'))} · <time datetime="${escape(observer.dateIso)}">${escape(when)}</time>`;
  }
  $('.footer-controls span:first-child').innerHTML = `${icon('mouse-pointer-2')} ${index === 7 || context?.earthPerspective ? t("Drag to look around","Trascina per guardarti intorno") : t("Drag to orbit","Trascina per orbitare")}`;
  $('#universe').setAttribute('aria-label', index === 6 && context?.earthPerspective ? t("3D stars viewed from Earth’s position. Drag to look around and scroll to zoom.","Stelle nello spazio 3D viste dalla posizione della Terra. Trascina per guardarti intorno e usa la rotellina per ingrandire.") : index === 7 ? t("Sky from Earth’s surface. Drag to look around and scroll to zoom.","Cielo dalla superficie terrestre. Trascina per guardarti intorno e usa la rotellina per ingrandire.") : t("Three-dimensional cosmic atlas. Drag to orbit and scroll to zoom.","Atlante cosmico tridimensionale. Trascina per orbitare e usa la rotellina per avvicinarti."));
  document.querySelectorAll('[data-scale]').forEach(button => {
    const selected = Number(button.dataset.scale) === index;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected);
  });
  if (!detached) renderObject(catalog[scale.id][0]);
  refreshIcons();
}

function changeScale(index, manual = true) {
  index = Number(index);
  if (!Number.isInteger(index) || !scales[index]) return;
  if (manual) stopTour();
  if (index === state.scale) return;
  updateScale(index);
  universe?.setScale(index);
}

function pickObject(index, object) {
  if (index === 8 || object.nasaCatalogue) { selectNasaObject(object); return; }
  stopTour();
  closeModal();
  if (object.bodyKind === 'exoplanet') {
    if (universe) universe.focusObject(object);
    else updateScale(5, { name: object.host });
    renderObject(object);
    return;
  }
  if (index !== state.scale) changeScale(index);
  renderObject(object);
  universe?.selectObject(object);
  universe?.focusObject(object);
}

function setLayer(name, enabled) {
  if (!['labels','grid','particles'].includes(name)) return;
  state[name] = enabled;
  document.querySelectorAll(`[data-layer="${name}"]`).forEach(button => button.setAttribute('aria-checked', enabled));
  universe?.setLayer(name, enabled);
  savePreferences();
}

function setRotation(enabled) {
  state.autoRotate = enabled;
  universe?.setAutoRotate(enabled);
  document.querySelectorAll('[data-action="rotate"]').forEach(button => {
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', enabled);
  });
  savePreferences();
}

function revealImmersionControl() {
  if (!state.cinematic) return;
  $('.exit-cinema').classList.add('revealed');
  clearTimeout(immersionRevealTimer);
  immersionRevealTimer = setTimeout(() => $('.exit-cinema').classList.remove('revealed'), 2200);
}

function setCinematic(enabled) {
  clearTimeout(immersionTimer);
  immersionTimer = null;
  if (enabled === state.cinematic) return;
  state.cinematic = enabled;
  closeModal();
  $('.toast').classList.remove('visible');
  $('.toast').textContent = '';
  $('.app-shell').classList.toggle('cinematic', enabled);
  const selectors = '.topbar,.intro,.left-panel,.right-panel,.bottom-panel,.footer,.view-controls,.center-caption,.labels,.toast,.webgl-error';
  document.querySelectorAll(selectors).forEach(element => { element.inert = enabled; });
  universe?.setImmersive(enabled);
  document.querySelectorAll('[data-action="cinema"]').forEach(button => button.setAttribute('aria-pressed', enabled));
  if (enabled) {
    $('#universe').focus();
    revealImmersionControl();
  } else {
    clearTimeout(immersionRevealTimer);
    $('.exit-cinema').classList.remove('revealed');
    $('.immersion-button').focus();
  }
}

function toggleCinematic() {
  if (state.cinematic) return setCinematic(false);
  if (immersionTimer) { clearTimeout(immersionTimer); immersionTimer = null; $('.toast').classList.remove('visible'); return; }
  notify(t("Immersive view hides all text. Press Esc or use the top-right icon to restore controls.","La vista immersiva nasconde il testo. Premi Esc o usa l’icona in alto a destra per ripristinare i comandi."));
  immersionTimer = setTimeout(() => setCinematic(true), reducedMotion ? 1200 : 1800);
}

function renderTour() {
  const button = $('[data-action="tour"]');
  button.innerHTML = icon(state.tour ? 'pause' : 'play');
  button.setAttribute('aria-pressed', state.tour);
  button.setAttribute('aria-label', state.tour ? t("Stop scale sequence","Ferma sequenza delle scale") : t("Start scale sequence","Avvia sequenza delle scale"));
  $('#tour-title').textContent = state.tour ? t("Scale sequence active","Sequenza delle scale attiva") : t("Automatic sequence","Sequenza automatica");
  $('#tour-caption').textContent = state.tour ? t("Next scale every 12 s","Scala successiva ogni 12 s") : t("Cycle through five reference scales","Scorri le cinque scale di riferimento");
  refreshIcons();
}

function stopTour() {
  clearInterval(tourTimer);
  tourTimer = null;
  if (!state.tour) return;
  state.tour = false;
  renderTour();
}

function toggleTour() {
  if (state.tour) return stopTour();
  state.tour = true;
  changeScale(0, false);
  renderTour();
  notify(t("Scale sequence started: Solar System to observable universe.","Sequenza avviata: dal Sistema Solare all’universo osservabile."));
  tourTimer = setInterval(() => {
    if (state.scale >= 4) {
      stopTour();
      notify(t("Scale sequence complete.","Sequenza delle scale completata."));
      return;
    }
    changeScale(state.scale + 1, false);
  }, 12000);
}

async function toggleSound() {
  try {
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return notify(t("Audio is not supported by this browser.","Il suono non è supportato da questo browser."));
      audioContext = new Audio();
      audioGain = audioContext.createGain();
      audioGain.gain.value = 0;
      audioGain.connect(audioContext.destination);
      [55, 82.4069, 110.1, 164.8138].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? 0.45 : 0.13;
        oscillator.connect(gain).connect(audioGain);
        oscillator.start();
      });
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 6, audioContext.sampleRate);
      const channel = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < channel.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * 0.02) / 1.02;
        channel[i] = previous * 0.3;
      }
      const noise = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      noise.buffer = buffer;
      noise.loop = true;
      filter.type = 'lowpass';
      filter.frequency.value = 450;
      noise.connect(filter).connect(audioGain);
      noise.start();
    }
    clearTimeout(audioSuspendTimer);
    const enabled = !state.sound;
    await audioContext.resume();
    state.sound = enabled;
    audioGain.gain.cancelScheduledValues(audioContext.currentTime);
    audioGain.gain.setTargetAtTime(enabled ? 0.12 : 0, audioContext.currentTime, 0.25);
    if (!enabled) audioSuspendTimer = setTimeout(() => { if (!state.sound) audioContext.suspend().catch(() => {}); }, 1200);
    const button = $('[data-action="sound"]');
    button.innerHTML = `${icon(enabled ? 'volume-2' : 'volume-x')}<span id="sound-label">${t("Audio ","Suono ")}${enabled ? 'on' : 'off'}</span>`;
    button.setAttribute('aria-pressed', enabled);
    button.setAttribute('aria-label', `${enabled ? t("Disable","Disattiva") : t("Enable","Attiva")}${t(" ambient audio"," suono ambiente")}`);
    refreshIcons();
  } catch {
    notify(t("Unable to start audio. Check your browser audio settings.","Impossibile avviare il suono. Verifica le impostazioni audio del browser."));
  }
}

function openModal(kind, title, content) {
  if (document.pointerLockElement) document.exitPointerLock();
  if (state.cinematic) setCinematic(false);
  clearTimeout(immersionTimer);
  immersionTimer = null;
  const modal = $('#modal');
  stopTour();
  if (!modal.open) returnFocus = document.activeElement;
  modal.dataset.kind = kind;
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = content;
  if (!modal.open) modal.showModal();
  refreshIcons();
}

function closeModal() {
  if ($('#modal').open) $('#modal').close();
}

function normalized(value) { return String(value).toLocaleLowerCase(locale()).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
const solarPlanets = catalog.solar.filter(isPlanet);
const searchEntries = [
  ...scales.flatMap((scale, index) => catalog[scale.id].map(object => ({ index, object, scaleName: scale.name }))),
  ...solarMoons.map(object => ({ index: 0, object, scaleName: object.parentName })),
  ...exoplanets.map(object => ({ index: 5, object, scaleName: object.host }))
].map(entry => ({ ...entry, searchText: normalized(`${entry.object.name} ${entry.object.englishName || ''} ${entry.object.italianName || ''} ${entry.object.type} ${entry.scaleName} ${entry.object.parentId || ''} ${entry.object.host || ''}`) }));
const planetEntries = [
  ...solarPlanets.map(object => ({ index: 0, object, category: 'solar' })),
  ...solarMoons.map(object => ({ index: 0, object, category: 'moon' })),
  ...exoplanets.map(object => ({ index: 5, object, category: 'exoplanet' }))
].map(entry => ({ ...entry, searchText: normalized(`${entry.object.name} ${entry.object.englishName || ''} ${entry.object.italianName || ''} ${entry.object.parentName || ''} ${entry.object.parentId || ''} ${entry.object.host || t("Solar System Sun","Sistema Solare Sole")} ${entry.object.type}`) }));
const catalogDate = (() => {
  const date = new Date(planetCatalogMetadata.retrievedAt);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale(), { timeZone:'Europe/Rome', day:'numeric', month:'long', year:'numeric' }) : t("date unavailable","data non disponibile");
})();

async function ensureNasaSearch() {
  if (nasaCatalogue) return nasaCatalogue;
  searchBrowser.loading = true; searchBrowser.error = '';
  try {
    const data = await loadCelestialCatalog();
    nasaCatalogue = data;
    nasaSearchEntries = data.objects.map(object => ({ index: 8, object, searchText: object.searchText, scaleName: object.nasaCatalogue === 'ngc2000' ? 'NGC2000 \u00b7 NASA HEASARC' : object.nasaCatalogue === 'hipparcos' ? 'Hipparcos \u00b7 NASA HEASARC' : 'Bright Star Catalogue \u00b7 NASA HEASARC' }));
    return data;
  } catch (error) { searchBrowser.error = error.message; throw error; }
  finally {
    searchBrowser.loading = false;
    if ($('#modal').open && $('#modal').dataset.kind === 'search') renderSearch();
  }
}
function renderSearch(query = searchBrowser.query) {
  if (query !== searchBrowser.query) { searchBrowser.query = query; searchBrowser.page = 0; }
  const needle = normalizeCelestialSearch(query), tokens = needle.split(' ').filter(Boolean);
  const { scope } = searchBrowser;
  const candidates = scope === 'stars' ? nasaSearchEntries.filter(entry => entry.object.bodyKind === 'catalog-star')
    : scope === 'nebulae' ? nasaSearchEntries.filter(entry => entry.object.bodyKind === 'nebula')
    : scope === 'planets' ? searchEntries.filter(entry => isPlanet(entry.object) || isMoon(entry.object))
    : [...searchEntries, ...nasaSearchEntries];
  const matches = candidates.filter(entry => {
    const haystack = entry.index === 8 ? entry.searchText : normalizeCelestialSearch(entry.searchText);
    if (needle === 'sheab') return /\bscheat\b|\bsheliak\b/.test(haystack);
    return tokens.every(token => haystack.includes(token));
  });
  const pageSize = 80, pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  searchBrowser.page = Math.min(Math.max(0, searchBrowser.page), pageCount - 1);
  const entries = matches.slice(searchBrowser.page * pageSize, (searchBrowser.page + 1) * pageSize);
  $('#search-results').innerHTML = entries.length ? entries.map(({ object, index, scaleName }) => `<button class="search-result" data-object="${escape(object.id)}" data-object-scale="${index}"><span><strong>${escape(object.name)}</strong><small>${escape(scaleName)} \u00b7 ${escape(object.type)}</small></span>${icon('arrow-up-right')}</button>`).join('') : `<p>${searchBrowser.loading ? t('Loading NASA catalogues\u2026','Caricamento dei cataloghi NASA\u2026') : t('No objects found. Try a name or a HIP, HR, HD, NGC, IC or Messier identifier.','Nessun oggetto trovato. Prova un nome o un identificatore HIP, HR, HD, NGC, IC o Messier.')}</p>`;
  $('#search-count').textContent = `${matches.length.toLocaleString(locale())} ${t(matches.length === 1 ? 'object found' : 'objects found', matches.length === 1 ? 'oggetto trovato' : 'oggetti trovati')}`;
  $('#search-page').textContent = `${t('Page ','Pagina ')}${searchBrowser.page + 1}${t(' of ',' di ')}${pageCount}`;
  $('[data-search-page="previous"]').disabled = searchBrowser.page === 0;
  $('[data-search-page="next"]').disabled = searchBrowser.page >= pageCount - 1;
  $('#search-status').textContent = searchBrowser.error || (searchBrowser.loading ? t('Loading complete NASA archive snapshots\u2026','Caricamento degli archivi NASA completi\u2026') : nasaCatalogue ? t('NASA HEASARC: complete Hipparcos, Bright Star and NGC2000 nebular records. Unknown measurements are preserved.','NASA HEASARC: cataloghi Hipparcos e Bright Star completi e voci nebulari NGC2000. Le misure mancanti restano non disponibili.') : '');
  $('[data-action="retry-nasa"]').hidden = !searchBrowser.error;
  $('#search-results').setAttribute('aria-busy', String(searchBrowser.loading));
  document.querySelectorAll('[data-search-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.searchScope === scope)));
  refreshIcons();
}
function openSearch(scope = 'all') {
  Object.assign(searchBrowser, { scope, query: '', page: 0 });
  openModal('search', t('Search catalogues','Cerca nei cataloghi'), `<label for="search-input" class="readout-title">${t('STARS, NEBULAE, PLANETS, MOONS AND GALAXIES','STELLE, NEBULOSE, PIANETI, SATELLITI E GALASSIE')}</label><input id="search-input" class="search-input" type="search" placeholder="${t('Name or catalogue identifier','Nome o identificatore di catalogo')}" autocomplete="off" spellcheck="false" aria-controls="search-results"/>
    <div class="catalog-filter search-filters" role="group" aria-label="${t('Object category','Categoria di oggetto')}"><button data-search-scope="all">${t('All','Tutti')}</button><button data-search-scope="stars">${t('Stars','Stelle')}</button><button data-search-scope="nebulae">${t('Nebulae','Nebulose')}</button><button data-search-scope="planets">${t('Planets & moons','Pianeti e satelliti')}</button></div>
    <p id="search-status" class="catalog-provenance" role="status"></p><button class="planet-details-button" data-action="retry-nasa" hidden>${t('Retry catalogue loading','Riprova a caricare il catalogo')}</button>
    <div id="search-count" class="result-count" role="status"></div><div id="search-results" class="search-results"></div>
    <div class="catalog-pagination"><button data-search-page="previous">${t('Previous','Precedente')}</button><span id="search-page"></span><button data-search-page="next">${t('Next','Successiva')}</button></div>`);
  renderSearch();
  $('#search-input').addEventListener('input', event => renderSearch(event.target.value));
  $('#search-input').focus();
  ensureNasaSearch().catch(() => {});
  renderSearch();
}
async function selectNasaObject(object) {
  if (!object || !universe) return;
  stopTour();
  if (!Number.isFinite(object.raDeg) || !Number.isFinite(object.decDeg)) {
    openModal('object', object.name, objectMarkup(object, true)); return;
  }
  try {
    const data = await ensureNasaSearch();
    closeModal();
    await universe.showCatalogueObject(object, data);
  } catch (error) { notify(error.message); }
}

function renderPlanets() {
  const needle = normalized(planetBrowser.query.trim());
  const matches = planetEntries.filter(entry => (planetBrowser.filter === 'all' || entry.category === planetBrowser.filter) && (!planetBrowser.parentId || entry.object.parentId === planetBrowser.parentId) && entry.searchText.includes(needle));
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  planetBrowser.page = Math.min(Math.max(0, planetBrowser.page), pageCount - 1);
  const start = planetBrowser.page * pageSize;
  const entries = matches.slice(start, start + pageSize);
  $('#planet-results').innerHTML = entries.length ? entries.map(({ object, index }) => `<button class="planet-result" data-object="${escape(object.id)}" data-object-scale="${index}">
    <span class="planet-result-copy"><strong>${escape(object.name)}</strong><small>${escape(object.parentName || object.host || t("Solar System","Sistema Solare"))}</small><span>${escape(object.type)}</span></span>${icon('arrow-up-right')}</button>`).join('') : `<p class="planet-empty">${t("No objects found. Search for a planet, moon or host star.","Nessun oggetto trovato. Cerca un pianeta, un satellite o una stella ospite.")}</p>`;
  const moonCount = matches.filter(entry => entry.category === 'moon').length;
  const planetCount = matches.length - moonCount;
  const counts = [
    planetCount ? `${planetCount.toLocaleString(locale())} ${t(planetCount === 1 ? "planet" : "planets", planetCount === 1 ? "pianeta" : "pianeti")}` : '',
    moonCount ? `${moonCount.toLocaleString(locale())} ${t(moonCount === 1 ? "moon" : "moons", moonCount === 1 ? "satellite" : "satelliti")}` : ''
  ].filter(Boolean).join(' · ');
  $('#planet-count').textContent = matches.length ? `${counts} · ${start + 1}–${Math.min(start + pageSize, matches.length)}` : t("0 objects","0 oggetti");
  $('#moon-parent-field').hidden = planetBrowser.filter !== 'moon';
  $('#moon-parent').value = planetBrowser.parentId;
  $('#planet-page').textContent = `${t("Page ","Pagina ")}${planetBrowser.page + 1}${t(" of "," di ")}${pageCount}`;
  $('[data-catalog-page="previous"]').disabled = planetBrowser.page === 0;
  $('[data-catalog-page="next"]').disabled = planetBrowser.page >= pageCount - 1;
  document.querySelectorAll('[data-catalog-filter]').forEach(button => {
    const active = button.dataset.catalogFilter === planetBrowser.filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  refreshIcons();
}

function openPlanets(parentId = '') {
  if (parentId) Object.assign(planetBrowser, { filter: 'moon', parentId, query: '', page: 0 });
  openModal('planets', t("Planet and moon catalogue","Catalogo di pianeti e satelliti"), `
    <p class="catalog-introduction"><strong>${t("8 Solar System planets + ","8 pianeti del Sistema Solare + ")}${exoplanets.length.toLocaleString(locale())}${t(" confirmed exoplanets"," esopianeti confermati")} + ${solarMoons.length}${t(" major moons."," satelliti principali.")}</strong>${t(" Select an object to inspect."," Seleziona un oggetto per osservarlo.")}</p>
    <div class="solar-shortcuts" role="group" aria-label="${t("The eight Solar System planets","Gli otto pianeti del Sistema Solare")}">${solarPlanets.map(object => `<button data-object="${escape(object.id)}" data-object-scale="0"><span>${escape(object.name)}</span></button>`).join('')}</div>
    <label for="planet-search" class="readout-title">${t("SEARCH BY OBJECT OR PARENT NAME","CERCA PER NOME O CORPO PRINCIPALE")}</label>
    <input id="planet-search" class="search-input" type="search" placeholder="${t("Earth, Moon, Titan, TRAPPIST-1…","Terra, Luna, Titano, TRAPPIST-1…")}" autocomplete="off" spellcheck="false" value="${escape(planetBrowser.query)}" aria-controls="planet-results"/>
    <div class="catalog-filter" role="group" aria-label="${t("Object category","Categoria di oggetto")}"><button data-catalog-filter="all">${t("All","Tutti")}</button><button data-catalog-filter="solar">${t("Solar planets","Pianeti solari")}</button><button data-catalog-filter="exoplanet">${t("Exoplanets","Esopianeti")}</button><button data-catalog-filter="moon">${t("Moons","Satelliti")}</button></div>
    <div id="moon-parent-field" class="moon-parent-filter" hidden><label for="moon-parent">${t("Parent planet","Pianeta principale")}</label><select id="moon-parent" aria-controls="planet-results"><option value="">${t("All planets","Tutti i pianeti")}</option>${solarPlanets.filter(object => moonsForPlanet(object.id).length).map(object => `<option value="${escape(object.id)}">${escape(object.name)}</option>`).join('')}</select></div>
    <div id="planet-count" class="result-count" role="status"></div>
    <div id="planet-results" class="planet-results"></div>
    <div class="catalog-pagination"><button data-catalog-page="previous" aria-label="${t("Previous page","Pagina precedente")}">${t("← Previous","← Precedenti")}</button><span id="planet-page"></span><button data-catalog-page="next" aria-label="${t("Next page","Pagina successiva")}">${t("Next →","Successivi →")}</button></div>
    <p class="catalog-provenance"><a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noopener noreferrer">NASA Exoplanet Archive</a>${t(" · Catalogue retrieved "," · Catalogo del ")}${escape(catalogDate)}${t(". All confirmed exoplanets in PSCompPars at retrieval. Unconfirmed candidates are excluded. Exoplanet surfaces are illustrative.",". Tutti gli esopianeti confermati nella tabella PSCompPars alla data di acquisizione. I candidati non confermati non sono inclusi. Gli esopianeti hanno un aspetto illustrativo.")}</p>
    <p class="catalog-provenance"><a href="${escape(moonCatalogMetadata.sources[0])}" target="_blank" rel="noopener noreferrer">NASA / JPL</a>${t(" · Selected major natural satellites. Schematic orbital separations, display sizes and phases."," · Selezione dei principali satelliti naturali. Separazioni orbitali, dimensioni e fasi schematiche.")}</p>`);
  renderPlanets();
  $('#planet-search').addEventListener('input', event => { planetBrowser.query = event.target.value; planetBrowser.page = 0; renderPlanets(); });
  $('#moon-parent').addEventListener('change', event => { planetBrowser.parentId = event.target.value; planetBrowser.page = 0; renderPlanets(); });
}

function localDateInput(iso) {
  return dateInputInZone(iso, constellationBrowser.timeZone);
}

function constellationModeButtons() {
  return `<div class="constellation-mode modal-constellation-mode" role="group" aria-label="${t("Constellation perspective","Prospettiva della costellazione")}">
    <button data-constellation-mode="space" aria-pressed="${constellationBrowser.mode === 'space'}" class="${constellationBrowser.mode === 'space' ? 'active' : ''}">${icon('orbit')}<span>${t("3D space","Nello spazio 3D")}</span><small>${t("Measured stellar distances","Distanze stellari misurate")}</small></button>
    <button data-constellation-mode="earth" aria-pressed="${constellationBrowser.mode === 'earth'}" class="${constellationBrowser.mode === 'earth' ? 'active' : ''}">${icon('globe-2')}<span>${t("Earth surface","Dalla superficie terrestre")}</span><small>${t("Local sky coordinates","Coordinate del cielo locale")}</small></button>
  </div>`;
}

function observerFormMarkup() {
  const observer = constellationBrowser.observer;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const zones = [...new Set(['Europe/Rome', 'UTC', deviceZone])];
  return `<fieldset id="observer-fields" class="observer-fields" ${constellationBrowser.mode === 'earth' ? '' : 'hidden'}>
    <legend>${t("Observer coordinates","Coordinate dell’osservatore")}</legend>
    <label for="observer-latitude">${t("Latitude","Latitudine")} <small>${t("North + / South −","Nord + / Sud −")}</small><input id="observer-latitude" type="text" inputmode="text" required autocomplete="off" spellcheck="false" aria-describedby="observer-coordinate-help" value="${observer.latitude}"/></label>
    <label for="observer-longitude">${t("Longitude","Longitudine")} <small>${t("East + / West −","Est + / Ovest −")}</small><input id="observer-longitude" type="text" inputmode="text" required autocomplete="off" spellcheck="false" aria-describedby="observer-coordinate-help" value="${observer.longitude}"/></label>
    <label for="observer-datetime" class="observer-date">${t("Date and time","Data e ora")} <small>${t("Selected timezone · 1900–2100","Nel fuso scelto · 1900–2100")}</small><input id="observer-datetime" type="datetime-local" min="1900-01-02T00:00" max="2100-12-30T23:59" required value="${localDateInput(observer.dateIso)}"/></label>
    <p id="observer-coordinate-help">${t("Decimal degrees (38.1144) or degrees, minutes and seconds (38°06′51.98″N).","Accetta decimali (38,1144) o gradi, primi e secondi (38°06′51.98″N).")}</p>
    <label for="observer-timezone" class="observer-zone">${t("Timezone","Fuso orario")}<select id="observer-timezone">${zones.map(zone => `<option value="${escape(zone)}" ${zone === constellationBrowser.timeZone ? 'selected' : ''}>${zone === 'Europe/Rome' ? t("Italy · Europe/Rome (CET / CEST)","Italia · Europe/Rome (CET / CEST)") : zone === 'UTC' ? 'UTC' : escape(zone) + t(" · device"," · dispositivo")}</option>`).join('')}</select></label>
    <div class="observer-actions"><button data-action="observer-now">${icon('rotate-ccw')}${t("Now","Adesso")}</button><button id="constellation-apply" data-action="apply-observer">${t("Update ","Aggiorna ")}${escape(constellationBrowser.data?.constellations.find(item => item.id === constellationBrowser.id)?.name || t("sky","il cielo"))}${icon('arrow-right')}</button></div>
    <button class="observer-preset" data-action="observer-orion-winter">${icon('sparkles')}${t("Orion example · 11 Dec 2026, 20:00 Italy","Esempio Orione · 11 dic 2026, 20:00 Italia")}<small>38°06′51.98″N · 15°39′00″E</small></button>
    <p>${t("The timezone determines the instant: 20:00 in winter in Italy is 19:00 UTC. The sky remains fixed at the selected time. Stars below the horizon are hidden. Daylight, refraction and light pollution are not simulated.","Il fuso scelto determina l'istante: in Italia, 20:00 in inverno corrisponde a 19:00 UTC. Il cielo resta fermo all'istante scelto; le stelle sotto l'orizzonte non sono visibili. La luminosità diurna, la rifrazione e l'inquinamento luminoso non sono simulati.")}</p>
  </fieldset>`;
}

function renderConstellationResults() {
  const results = $('#constellation-results');
  if (!results || !constellationBrowser.data) return;
  const query = normalized(constellationBrowser.query.trim());
  const matches = constellationBrowser.data.constellations.filter(item => normalized(`${item.name} ${item.englishName || ''} ${item.italianName || ''} ${item.latinName} ${item.abbr} ${item.id}`).includes(query)).sort((a, b) => a.name.localeCompare(b.name, locale()));
  results.innerHTML = matches.map(item => {
    const starCount = new Set(item.segments.flat()).size;
    return `<button class="constellation-result${item.id === constellationBrowser.id ? ' selected' : ''}" data-constellation="${escape(item.id)}" ${constellationBrowser.busy ? 'disabled' : ''}>
      <span class="constellation-monogram" aria-hidden="true">${icon('sparkles')}<small>${escape(item.abbr)}</small></span><span><strong>${escape(item.name)}</strong><small>${escape(item.latinName)} · ${starCount}${t(" stars in the figure"," stelle nella figura")}</small></span>${icon('arrow-up-right')}</button>`;
  }).join('') || `<p class="constellation-empty">${t("No constellations found. Try “Orion”, “Ursa” or “Cassiopeia”.","Nessuna costellazione trovata. Prova “Orione”, “Orsa” o “Cassiopea”.")}</p>`;
  $('#constellation-count').textContent = `${matches.length}${t(matches.length === 1 ? " constellation" : " constellations", matches.length === 1 ? " costellazione" : " costellazioni")}${matches.length !== constellationBrowser.data.constellations.length ? t(" found", matches.length === 1 ? " trovata" : " trovate") : t(" · select a constellation"," · seleziona una costellazione")}`;
  refreshIcons();
}

function renderConstellationModal() {
  const stars = constellationBrowser.data.metadata?.starCount || constellationBrowser.data.metadata?.catalogStarCount;
  $('#modal-body').innerHTML = `
    <p class="catalog-introduction"><strong>${t("88 constellations · 3D and local sky views.","88 costellazioni · viste 3D e cielo locale.")}</strong> ${stars ? number(stars) : t("Over 119,000","Oltre 119.000")}${t(" HYG catalogue stars with equatorial coordinates and measured distances where available."," stelle HYG con coordinate equatoriali e distanze misurate quando disponibili.")}</p>
    ${constellationModeButtons()}
    ${observerFormMarkup()}
    <label for="constellation-search" class="readout-title">${t("SEARCH CONSTELLATIONS","CERCA UNA COSTELLAZIONE")}</label>
    <input id="constellation-search" class="search-input" type="search" value="${escape(constellationBrowser.query)}" placeholder="${t("Orion, Cassiopeia, Ursa Major…","Orione, Cassiopea, Orsa Maggiore…")}" autocomplete="off" spellcheck="false" aria-controls="constellation-results"/>
    <div id="constellation-count" class="result-count" role="status"></div>
    <div id="constellation-results" class="constellation-results"></div>
    <div id="constellation-progress" class="constellation-progress" role="status" aria-live="polite"></div>
    <p class="catalog-provenance">${t("Stars without a measured distance appear in the Earth sky view. HYG is an observational catalogue with limited coverage. ","Le stelle prive di distanza misurata sono presenti nella vista del cielo terrestre. HYG è un catalogo osservativo con copertura limitata. ")}<a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener noreferrer">${t("HYG 4.1 · source and licence","HYG 4.1 · fonte e licenza")}</a></p>`;
  renderConstellationResults();
  $('#constellation-search').addEventListener('input', event => { constellationBrowser.query = event.target.value; renderConstellationResults(); });
  $('#observer-fields').addEventListener('input', event => event.target.setCustomValidity?.(''));
  $('#observer-timezone').addEventListener('change', event => {
    constellationBrowser.timeZone = event.target.value;
    $('#observer-datetime').setCustomValidity('');
  });
  refreshIcons();
}

async function openConstellations({ observer = false } = {}) {
  if (observer) constellationBrowser.mode = 'earth';
  const request = ++constellationModalRequest;
  openModal('constellations', t("Constellations","Costellazioni"), `<p class="constellation-loading" role="status">${t("Loading 88 constellations…","Caricamento delle 88 costellazioni…")}</p>`);
  try {
    constellationBrowser.data ||= await loadConstellations();
    if (request !== constellationModalRequest || !$('#modal').open || $('#modal').dataset.kind !== 'constellations') return;
    renderConstellationModal();
    $(observer ? '#observer-latitude' : '#constellation-search').focus();
  } catch (error) {
    if (request !== constellationModalRequest || !$('#modal').open || $('#modal').dataset.kind !== 'constellations') return;
    $('#modal-body').innerHTML = `<p role="alert">${t("Unable to load the constellation catalogue. Try again.","Il catalogo delle costellazioni non è stato caricato. Riprova tra un momento.")}</p><button class="focus-button" data-action="constellations">${t("Retry","Riprova")}</button>`;
  }
}

function readObserverForm() {
  if (!$('#modal').open || $('#modal').dataset.kind !== 'constellations' || !$('#observer-fields') || constellationBrowser.mode !== 'earth') return true;
  const fields = ['#observer-latitude', '#observer-longitude', '#observer-datetime'].map($);
  const values = [];
  for (const [index, field] of fields.entries()) {
    field.setCustomValidity('');
    if (!field.reportValidity()) return false;
    try {
      values[index] = index < 2 ? parseCoordinate(field.value, index === 0 ? 'latitude' : 'longitude') : zonedDateInputToIso(field.value, $('#observer-timezone').value);
    } catch (error) {
      field.setCustomValidity(error.message);
      field.reportValidity();
      return false;
    }
  }
  constellationBrowser.timeZone = $('#observer-timezone').value;
  constellationBrowser.observer = { latitude: values[0], longitude: values[1], dateIso: values[2] };
  return true;
}

async function selectConstellation(id, mode = constellationBrowser.mode) {
  if (constellationBrowser.busy) return;
  if (!readObserverForm()) return;
  if (!universe) return notify(t("Constellation views require WebGL. Enable hardware acceleration and reload.","La vista delle costellazioni richiede il motore grafico WebGL. Attiva l’accelerazione grafica e ricarica."));
  stopTour();
  constellationBrowser.busy = true;
  const lastMode = state.scale === 7 ? 'earth' : 'space';
  constellationBrowser.mode = mode;
  const pending = document.querySelectorAll('[data-constellation], [data-constellation-mode], #constellation-apply');
  pending.forEach(button => { button.disabled = true; });
  if ($('#constellation-progress')) $('#constellation-progress').textContent = t("Loading stars and constellation geometry…","Caricamento di stelle e geometria delle costellazioni…");
  else notify(t("Loading stars…","Caricamento delle stelle…"));
  $('#constellation-controls').setAttribute('aria-busy', 'true');
  try {
    const shown = await universe.showConstellation(id, { mode, observer: { ...constellationBrowser.observer } });
    if (shown === false) return;
    constellationBrowser.id = id;
    if ($('#modal').dataset.kind === 'constellations') closeModal();
  } catch (error) {
    constellationBrowser.mode = lastMode;
    const message = error?.message || t("Unable to open this constellation. Try again.","Impossibile aprire questa costellazione. Riprova tra un momento.");
    if ($('#constellation-progress')) $('#constellation-progress').textContent = message;
    else notify(message);
  } finally {
    constellationBrowser.busy = false;
    pending.forEach(button => { button.disabled = false; });
    $('#constellation-controls').removeAttribute('aria-busy');
  }
}

async function chooseConstellationMode(mode, button) {
  if (button.closest('#modal')) {
    if (!readObserverForm()) return;
    constellationBrowser.mode = mode;
    document.querySelectorAll('#modal [data-constellation-mode]').forEach(item => {
      const selected = item.dataset.constellationMode === mode;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', selected);
    });
    $('#observer-fields').hidden = mode !== 'earth';
    return;
  }
  if ((state.scale === 7 ? 'earth' : 'space') !== mode) await selectConstellation(constellationBrowser.id, mode);
}

function openCollections() {
  const featured = [
    { scale:0, id:'earth', icon:'globe-2', name:t("Solar System","Sistema Solare"), subtitle:t("Sun and eight planets","Sole e otto pianeti") },
    { scale:1, id:'proxima', icon:'star', name:t("Nearby stars","Stelle vicine"), subtitle:t("Local stellar distances and coordinates","Distanze e coordinate delle stelle vicine") },
    { scale:3, id:'andromeda', icon:'orbit', name:t("Local Group","Gruppo Locale"), subtitle:t("Milky Way, Andromeda and satellite galaxies","Via Lattea, Andromeda e galassie satelliti") },
    { scale:4, id:'laniakea', icon:'sparkles', name:t("Large-scale structure","Struttura a grande scala"), subtitle:t("Galaxy clusters and cosmic web","Ammassi galattici e rete cosmica") }
  ];
  openModal('collections', t("Catalogue sections","Sezioni del catalogo"), `<p>${t("Browse objects by astronomical scale.","Consulta gli oggetti per scala astronomica.")}</p><div class="collection-grid"><button class="collection-item" data-action="nasa-stars">${icon('star')}<strong>${t("NASA star catalogues","Cataloghi stellari NASA")}</strong><small>Hipparcos · Bright Star Catalogue</small></button><button class="collection-item" data-action="nasa-nebulae">${icon('sparkles')}<strong>${t("Nebulae","Nebulose")}</strong><small>NGC2000 · NASA HEASARC</small></button>${featured.map(item => `<button class="collection-item" data-object="${item.id}" data-object-scale="${item.scale}">${icon(item.icon)}<strong>${item.name}</strong><small>${item.subtitle}</small></button>`).join('')}</div>`);
}

function openAbout() {
  openModal('about', t("About the project","Il progetto"), `
    <p>${t("Æther is an interactive astronomical atlas with 3D, Earth sky and WebXR views.","Æther è un atlante astronomico interattivo con viste 3D, cielo terrestre e WebXR.")}</p>
    <h3>${t("DATA AND REPRESENTATION","DATI E RAPPRESENTAZIONE")}</h3>
    <p>${t("The planetary catalogue includes the eight Solar System planets and all ","Il catalogo planetario comprende gli otto pianeti del Sistema Solare e tutti i ")}${exoplanets.length.toLocaleString(locale())}${t(" confirmed exoplanets in the NASA Exoplanet Archive PSCompPars table, retrieved "," esopianeti confermati nella tabella PSCompPars del NASA Exoplanet Archive, acquisita il ")}${escape(catalogDate)}${t(". Other objects form a selected astronomical catalogue.",". Gli altri oggetti costituiscono una selezione di catalogo.")}</p><p>${t("Exoplanetary orbits are schematic and surfaces are illustrative. Measurements and estimates come from the archive; missing data remain unavailable.","I sistemi esoplanetari mostrano orbite schematiche; gli aspetti dei pianeti sono illustrativi. Misure e stime provengono dall’archivio; i dati mancanti restano indicati come non disponibili.")}</p><p>${t("Planetary textures: ","Texture planetarie: ")}<a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope</a>${t(", licence ",", licenza ")}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>${t(". Based on NASA imagery with artistic additions.",". Basate su immagini NASA con integrazioni artistiche.")}</p>
    <p>${t("Orbital distances are compressed and planet sizes enlarged. Nearby stars use approximate J2000 equatorial coordinates. The Milky Way is an illustrative model; galaxy sizes in the Local Group are enlarged.","Le distanze orbitali sono compresse e le dimensioni planetarie amplificate. Le stelle vicine usano coordinate equatoriali J2000 approssimate. La Via Lattea è una ricostruzione illustrativa; nel Gruppo Locale le dimensioni galattiche sono amplificate.")}</p>
    <p>${t("Cosmic web geometry and particle effects are generated procedurally. Cluster positions are schematic. Five reference scales are available.","La rete cosmica e le particelle decorative sono generate proceduralmente. Le posizioni dei suoi ammassi sono schematiche: non sono un catalogo osservativo. La navigazione collega cinque rappresentazioni con scale differenti.")}</p>
    <h3>${t("STELLAR CATALOGUES","CATALOGHI STELLARI")}</h3>
    <p>${t("NASA HEASARC supplies the complete Hipparcos and Bright Star archive entries and the nebular subset of NGC2000. Search names or HIP, HR, HD, NGC, IC and Messier identifiers. The NASA sky view represents angular directions, with catalogue measurements in the object panels.","NASA HEASARC fornisce i cataloghi Hipparcos e Bright Star completi e il sottoinsieme nebulare NGC2000. Cerca nomi o identificatori HIP, HR, HD, NGC, IC e Messier. La vista NASA rappresenta direzioni angolari; le schede riportano le misure di catalogo.")}</p>
    <p>${t("The nearby-star view includes 156 stars within 25 light-years from ","La vista stellare include 156 stelle entro 25 anni luce estratte da ")}<a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener noreferrer">HYG 4.1 · David Nash</a>${t(", in addition to the principal reference stars. The subset retains coordinates, distances and identifiers; selection, unit conversion and display names are atlas adaptations. Data licence: ",", oltre ai riferimenti principali. Il sottoinsieme conserva coordinate, distanze e identificatori: selezione, conversione in anni luce e nomi di visualizzazione sono adattamenti dell’atlante. Dati distribuiti con licenza ")}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.</p>
    <p>${t("Constellation views contain 119,625 HYG stars and all 88 constellations. The 3D view preserves measured stellar depth. The Earth view calculates sky directions and the geometric horizon for the selected location and time. HYG data: CC BY-SA 4.0.","Le viste delle costellazioni contengono 119.625 stelle HYG e tutte le 88 costellazioni. La vista 3D conserva la profondità stellare misurata. La vista terrestre calcola direzioni e orizzonte geometrico per luogo e istante selezionati. Dati HYG: CC BY-SA 4.0.")}</p>
    <p>${t('Constellation geometry: ', 'Geometria delle costellazioni: ')}<a href="https://github.com/Stellarium/stellarium/tree/master/skycultures/modern" target="_blank" rel="noopener noreferrer">Stellarium modern skyculture</a> ${t('by the Stellarium team, CC BY-SA 4.0.', 'del team Stellarium, CC BY-SA 4.0.')}</p>
    <h3>${t("DATA SOURCES","FONTI DEI DATI")}</h3>
    <ul><li><a href="${scales[0].source}" target="_blank" rel="noopener noreferrer">${t("NASA · Solar System sizes and distances","NASA · Dimensioni e distanze del Sistema Solare")}</a></li>
    <li><a href="${scales[1].source}" target="_blank" rel="noopener noreferrer">NASA / Hubble · Proxima Centauri</a></li>
    <li><a href="${scales[2].source}" target="_blank" rel="noopener noreferrer">${t("NASA · Galaxies and the Milky Way","NASA · Galassie e Via Lattea")}</a></li>
    <li><a href="${scales[4].source}" target="_blank" rel="noopener noreferrer">${t("NASA · Observable universe","NASA · L’universo osservabile")}</a></li></ul>`);
}

function openHelp() {
  openModal('help', t("Controls and navigation","Comandi e navigazione"), `
    <div class="help-keys"><div><strong>${t("Drag","Trascina")}</strong>${t("Orbit the map","Orbita intorno alla mappa")}</div><div><strong>${t("Scroll / two fingers","Rotellina / due dita")}</strong>${t("Zoom in and out","Avvicina e allontana")}</div><div><strong>${t("Click / tap a planet or moon","Clic / tocco su un pianeta o satellite")}</strong>${t("Inspect the selected body","Osserva il corpo selezionato")}</div><div><strong>${t("Planets & moons","Pianeti e satelliti")}</strong>${t("Browse eight planets, confirmed exoplanets and major natural satellites","Sfoglia otto pianeti, esopianeti confermati e satelliti naturali principali")}</div><div><strong>${t("Constellations","Costellazioni")}</strong>${t("Select a constellation in 3D or Earth sky view. Location and time are configurable","Seleziona una costellazione in 3D o nel cielo terrestre. Luogo e orario sono configurabili")}</div><div><strong>${t("Immersive view","Vista immersiva")}</strong>${t("Hide all text. Press Esc or use the top-right icon to restore controls","Nasconde tutte le scritte. Esc o l’icona in alto a destra per tornare")}</div><div><strong>1 — 5</strong>${t("Change reference scale","Cambia scala di riferimento")}</div><div><strong>/</strong>${t("Search stars, planets and moons","Cerca stelle, pianeti e satelliti")}</div><div><strong>${t("Space","Spazio")}</strong>${t("Pause or resume rotation","Ferma o riprendi la rotazione")}</div><div><strong>R</strong>${t("Reset the camera","Ripristina l’inquadratura")}</div><div><strong>Esc</strong>${t("Close dialogs and immersive view","Chiudi finestre e vista immersiva")}</div></div>
    <h3>${t("VIRTUAL REALITY","NELLA REALTÀ VIRTUALE")}</h3><p>${t("Desktop preview provides a first-person view without a headset. WebXR supports room-scale VR and mixed reality with a compatible headset. Hand tracking requires device and browser support; controllers are also supported.","L’anteprima PC offre una visuale in prima persona senza visore. Un visore WebXR compatibile permette di usare VR e realtà mista alla scala dell’ambiente. Il tracciamento delle mani richiede un visore e un browser che lo supportino. Anche i controller sono utilizzabili.")}</p><button class="focus-button" data-action="vr">${icon('glasses')}${t("VR controls","Comandi VR")}</button>`);
}

function openSettings() {
  openModal('settings', t("Settings","Impostazioni"), `
    <h3>${t('LANGUAGE', 'LINGUA')}</h3>
    <label class="readout-title" for="language-setting">${t('Interface language', 'Lingua dell\u2019interfaccia')}</label>
    <select id="language-setting" class="search-input" aria-label="${t('Interface language', 'Lingua dell\u2019interfaccia')}">
      <option value="en" ${getLanguage() === 'en' ? 'selected' : ''}>English</option>
      <option value="it" ${getLanguage() === 'it' ? 'selected' : ''}>Italiano</option>
    </select>
    <h3>${t("GRAPHICS QUALITY","QUALITÀ GRAFICA")}</h3><div class="quality" role="group" aria-label="${t("Graphics quality","Qualità grafica")}"><button data-quality="low" class="${state.quality === 'low' ? 'active' : ''}" aria-pressed="${state.quality === 'low'}">${t("Low","Bassa")}</button><button data-quality="high" class="${state.quality === 'high' ? 'active' : ''}" aria-pressed="${state.quality === 'high'}">${t("High","Alta")}</button></div><p>${t("Low detail reduces particle count and rendering load.","Il dettaglio basso riduce particelle e carico grafico.")}</p>
    <h3>${t("MOTION AND LAYERS","MOVIMENTO E LIVELLI")}</h3>
    <div class="layer-row"><span>${t("Auto-rotate","Rotazione automatica")}</span><button class="toggle" role="switch" data-action="settings-rotate" aria-label="${t("Auto-rotate","Rotazione automatica")}" aria-checked="${state.autoRotate}"></button></div>
    ${[['labels',t("Labels","Etichette")],['grid',t("Reference grid","Griglia di riferimento")],['particles',t("Particle effects","Effetti particellari")]].map(([name,label]) => `<div class="layer-row"><span>${label}</span><button class="toggle" role="switch" aria-label="${label}" aria-checked="${state[name]}" data-layer="${name}"></button></div>`).join('')}
    <p>${reducedMotion ? t("Reduced motion detected: rotation is off by default unless you have saved another preference.","Riduzione del movimento rilevata: la rotazione parte disattivata, salvo una tua preferenza salvata.") : t("Preferences are saved on this device.","Le preferenze vengono salvate su questo dispositivo.")}</p>`);
}

function vrContent() {
  const status = !universe ? t("3D rendering is unavailable. Enable browser hardware acceleration and reload.","Il rendering 3D non è disponibile. Attiva l'accelerazione hardware del browser e ricarica.")
    : !window.isSecureContext ? t("Headset modes require HTTPS or localhost. Desktop preview is available here.","Le modalità visore richiedono HTTPS o localhost. L'anteprima PC è disponibile qui.")
    : !navigator.xr ? t("No WebXR device is available in this browser. Use Desktop preview, or open this page in Meta Quest Browser for headset modes.","Nessun dispositivo WebXR disponibile in questo browser. Usa l'anteprima PC oppure apri la pagina in Meta Quest Browser per le modalità visore.")
    : !xrChecked ? t("Checking VR and mixed reality support…","Verifica supporto VR e realtà mista…")
    : !xrSupported && !mrSupported ? t("No immersive headset session is available. Desktop preview works without a headset.","Nessuna sessione immersiva per visore disponibile. L'anteprima PC funziona senza visore.")
    : t("Available headset modes are enabled below.","Le modalità visore disponibili sono attive qui sotto.");
  return `<p>${t("Walk inside a map placed in the room. Objects keep their positions as you move; grabbing, rotating and resizing the map changes its placement explicitly.","Cammina dentro una mappa collocata nell'ambiente. Gli oggetti mantengono la posizione mentre ti muovi; presa, rotazione e ridimensionamento modificano esplicitamente la mappa.")}</p>
    <label class="xr-layout-setting" for="xr-layout">${t("Initial map layout","Disposizione iniziale della mappa")}<select id="xr-layout"><option value="room" ${spatialLayout==='room'?'selected':''}>${t("Room scale · map surrounds you","Scala ambiente · mappa intorno a te")}</option><option value="tabletop" ${spatialLayout==='tabletop'?'selected':''}>${t("Tabletop · small map in front","Mappa ridotta · davanti a te")}</option></select></label>
    <div class="xr-mode-options">
      <article class="xr-mode-card"><h3>${t("DESKTOP PREVIEW","ANTEPRIMA PC")}</h3><p>${t("View the same spatial layout on your PC. Walk with W A S D, change height with Q / E and drag to look around. No headset required.","Osserva la stessa disposizione spaziale sul PC. Cammina con W A S D, cambia altezza con Q / E e trascina per guardarti intorno. Non serve un visore.")}</p><button class="focus-button" data-action="start-preview" ${universe?'':'disabled'}>${icon('monitor')}${t("Start desktop preview","Avvia anteprima PC")}</button></article>
      <article class="xr-mode-card"><h3>${t("META QUEST MIXED REALITY","REALTÀ MISTA META QUEST")}</h3><p>${t("See your room through passthrough, with the map fixed around you. Walk between objects and use hands or controllers to interact.","Vedi il tuo ambiente attraverso il passthrough, con la mappa fissa intorno a te. Cammina tra gli oggetti e interagisci con mani o controller.")}</p><button class="focus-button" data-action="start-mr" ${mrSupported&&universe?'':'disabled'}>${icon('scan')}${t("Enter mixed reality","Entra in realtà mista")}</button><small>${mrSupported?t("Passthrough session supported.","Sessione passthrough supportata."):t("Requires an immersive AR session in a compatible headset browser.","Richiede una sessione AR immersiva nel browser di un visore compatibile.")}</small></article>
      <article class="xr-mode-card"><h3>${t("VIRTUAL REALITY","REALTÀ VIRTUALE")}</h3><p>${t("Enter the spatial map with a fully virtual background. Room-scale walking and the same map interactions are available.","Entra nella mappa spaziale con uno sfondo interamente virtuale. Puoi camminare nell'ambiente e usare gli stessi comandi della mappa.")}</p><button class="focus-button" data-action="start-vr" ${xrSupported&&universe?'':'disabled'}>${icon('glasses')}${t("Enter VR atlas","Entra nell'atlante VR")}</button></article>
    </div>
    <p id="xr-status" role="status">${status}</p>
    <h3>${t("HANDS AND CONTROLLERS","MANI E CONTROLLER")}</h3><p>${t("Brief pinch or trigger: select. Hold a pinch or grip: move and rotate the map. Two hands: resize. Release to fix the map in its new position. The spatial panel provides scale navigation, reset and exit.","Pizzico breve o grilletto: seleziona. Pizzico mantenuto o presa: sposta e ruota la mappa. Due mani: ridimensiona. Rilascia per fissare la nuova posizione. Il pannello spaziale permette di cambiare scala, ripristinare ed uscire.")}</p>
    <p>${t("Enable hand tracking in the headset settings. Earth and catalogue sky views retain their angular projection; their sky cannot be grabbed or walked through.","Attiva il tracciamento delle mani nelle impostazioni del visore. Le viste del cielo terrestre e del catalogo mantengono la proiezione angolare; il cielo non può essere afferrato o attraversato.")}</p>`;
}

function openVR() { openModal('vr', t("Immersive views","Viste immersive"), vrContent()); }

async function checkVR() {
  const supports = async mode => { try { return Boolean(window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported(mode)); } catch { return false; } };
  [xrSupported, mrSupported] = await Promise.all([supports('immersive-vr'),supports('immersive-ar')]);
  xrChecked = true;
  if ($('#modal').open && $('#modal').dataset.kind === 'vr') { $('#modal-body').innerHTML = vrContent(); refreshIcons(); }
}

async function startVR(button, mode='immersive-vr') {
  if (!universe || !(mode==='immersive-ar'?mrSupported:xrSupported)) return;
  button.disabled = true;
  try {
    const started = await universe.enterVR({mode,layout:spatialLayout});
    if (started) closeModal();
  } catch (error) { notify(error?.message || t("Unable to start the immersive session.","Impossibile avviare la sessione immersiva.")); }
  finally { button.disabled = false; }
}

function updatePreviewHud() {
  if (!$('#preview-hud')) return;
  $('#preview-selection').textContent = state.object?.name || '';
  const sky = state.scale===7 || state.scale===8 || state.context?.earthPerspective;
  $('#preview-space-note').textContent = sky ? t("Angular sky projection · look around and select","Proiezione celeste angolare · osserva e seleziona") : t("Map fixed in room coordinates","Mappa fissa nelle coordinate dell'ambiente");
  $('#preview-scale').querySelector('[data-context]')?.remove();
  if (state.scale>=5) { const option=document.createElement('option');option.value=state.scale;option.textContent=currentScale().name;option.dataset.context='true';$('#preview-scale').append(option); }
  $('#preview-scale').value=state.scale;
  $('#preview-layout').value=spatialLayout;
  document.querySelectorAll('.preview-map-actions button').forEach(button=>{button.disabled=Boolean(sky && /preview-(scale|rotate)/.test(button.dataset.action));});
}

function setPreviewClean(value) {
  previewClean=Boolean(value);
  $('.app-shell').classList.toggle('preview-clean',previewClean);
  $('#preview-hud').inert=previewClean;
  $('#preview-restore').hidden=!previewClean;
  if(previewClean) $('#universe').focus();
}

function onPreviewChange(active, details={}) {
  $('.app-shell').classList.toggle('preview-active',active);
  $('.app-shell').classList.toggle('preview-pointer-locked',active && Boolean(details.pointerLocked));
  $('#preview-hud').hidden=!active;
  if(details.layout)spatialLayout=details.layout;
  if(!active)setPreviewClean(false);
  const selectors='.topbar,.intro,.left-panel,.right-panel,.bottom-panel,.footer,.view-controls,.center-caption,.labels,.exit-cinema';
  document.querySelectorAll(selectors).forEach(element=>{element.inert=active || state.cinematic;});
  $('#universe').setAttribute('aria-label',active?t("Desktop VR preview. W A S D to walk, Q and E to change height, drag to look and click to select.","Anteprima VR su PC. W A S D per camminare, Q ed E per cambiare altezza, trascina per guardare e clicca per selezionare."):t("Three-dimensional cosmic atlas. Drag to orbit and scroll to zoom.","Atlante cosmico tridimensionale. Trascina per orbitare e usa la rotellina per avvicinarti."));
  updatePreviewHud();
}

function startPreview() {
  if(!universe)return;
  stopTour();if(state.cinematic)setCinematic(false);closeModal();
  universe.enterPreview({layout:spatialLayout});
  $('#universe').focus();
}

document.addEventListener('change', event => {
  if(event.target.id==='xr-layout'||event.target.id==='preview-layout'){spatialLayout=event.target.value==='tabletop'?'tabletop':'room';if(universe?.preview.isActive)universe.preview.setLayout(spatialLayout);return;}
  if(event.target.id==='preview-scale'){changeScale(event.target.value);$('#universe').focus();return;}
  if (event.target.id !== 'language-setting' || event.target.value === getLanguage()) return;
  try {
    sessionStorage.setItem('aether.languageView', JSON.stringify({
      scale: state.scale, objectId: state.object.id, host: state.object.host,
      constellationId: constellationBrowser.id, mode: constellationBrowser.mode,
      observer: constellationBrowser.observer, timeZone: constellationBrowser.timeZone,
      earthVisible: constellationBrowser.earthVisible, earthPerspective: state.context?.earthPerspective
    }));
  } catch { /* Language selection remains available without session storage. */ }
  setLanguage(event.target.value);
  location.reload();
});

document.addEventListener('click', async event => {
  const button = event.target.closest('button, a.brand');
  if (!button || button.disabled) return;
  if (button.matches('a.brand')) { event.preventDefault(); closeModal(); changeScale(0); universe?.resetView(); return; }
  if (button.dataset.scale !== undefined) return changeScale(button.dataset.scale);
  if (button.dataset.layer) return setLayer(button.dataset.layer, !state[button.dataset.layer]);
  if (button.dataset.quality) {
    state.quality = button.dataset.quality;
    universe?.setQuality(state.quality);
    document.querySelectorAll('[data-quality]').forEach(item => {
      const selected = item.dataset.quality === state.quality;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', selected);
    });
    savePreferences();
    return;
  }
  if (button.dataset.constellationMode) return chooseConstellationMode(button.dataset.constellationMode, button);
  if (button.dataset.constellation) return selectConstellation(button.dataset.constellation);
  if (button.dataset.searchScope) { searchBrowser.scope = button.dataset.searchScope; searchBrowser.page = 0; renderSearch(); return; }
  if (button.dataset.searchPage) { searchBrowser.page += button.dataset.searchPage === 'next' ? 1 : -1; renderSearch(); $('#search-results').scrollTop = 0; return; }
  if (button.dataset.catalogFilter) {
    planetBrowser.filter = button.dataset.catalogFilter;
    planetBrowser.parentId = '';
    planetBrowser.page = 0;
    renderPlanets();
    return;
  }
  if (button.dataset.catalogPage) {
    planetBrowser.page += button.dataset.catalogPage === 'next' ? 1 : -1;
    renderPlanets();
    $('#planet-results').scrollTop = 0;
    return;
  }
  if (button.dataset.object) {
    const index = Number(button.dataset.objectScale);
    const object = index === 8 ? nasaCatalogue?.byId.get(button.dataset.object) : index === 5 ? findPlanet(button.dataset.object) : catalog[scales[index]?.id]?.find(item => item.id === button.dataset.object) || (index === 0 ? findMoon(button.dataset.object) : null);
    if (object) pickObject(index, object);
    return;
  }
  switch (button.dataset.action) {
    case 'explore': closeModal(); $('#universe').focus(); break;
    case 'collections': openCollections(); break;
    case 'planets': openPlanets(); break;
    case 'moons': openPlanets(button.dataset.parent); break;
    case 'moon-system': {
      const parent = solarPlanets.find(object => object.id === button.dataset.parent);
      if (parent) {
        stopTour();
        closeModal();
        if (state.scale !== 0) changeScale(0);
        renderObject(parent);
        universe?.focusMoonSystem(parent);
      }
      break;
    }
    case 'constellations': await openConstellations(); break;
    case 'constellation-observer': await openConstellations({ observer: true }); break;
    case 'earth-visible': universe?.setEarthVisible(!constellationBrowser.earthVisible); break;
    case 'earth-perspective': universe?.viewFromEarth(); break;
    case 'earth-orbit': universe?.resetView(); break;
    case 'observer-orion-winter':
      constellationBrowser.timeZone = 'Europe/Rome';
      $('#observer-timezone').value = 'Europe/Rome';
      $('#observer-latitude').value = '38\u00b006\u203251.98\u2033N';
      $('#observer-longitude').value = '15\u00b039\u203200\u2033E';
      $('#observer-datetime').value = '2026-12-11T20:00';
      $('#observer-fields').querySelectorAll('input').forEach(field => field.setCustomValidity(''));
      await selectConstellation('Ori', 'earth');
      break;
    case 'cosmic-scales': changeScale(1); break;
    case 'apply-observer': await selectConstellation(constellationBrowser.id); break;
    case 'observer-now':
      $('#observer-datetime').value = localDateInput(new Date().toISOString());
      $('#observer-datetime').setCustomValidity('');
      break;
    case 'about': openAbout(); break;
    case 'search': openSearch(); break;
    case 'nasa-stars': openSearch('stars'); break;
    case 'nasa-nebulae': openSearch('nebulae'); break;
    case 'retry-nasa': ensureNasaSearch().catch(() => {}); break;
    case 'help': openHelp(); break;
    case 'settings': openSettings(); break;
    case 'vr': openVR(); break;
    case 'start-vr': await startVR(button); break;
    case 'start-mr': await startVR(button,'immersive-ar'); break;
    case 'start-preview': startPreview(); break;
    case 'exit-preview': universe?.exitPreview(); break;
    case 'preview-clean': setPreviewClean(!previewClean); break;
    case 'recenter-preview': universe?.preview.recenter(); break;
    case 'preview-replay': universe?.replayImmersiveOpening(); break;
    case 'preview-scale-up': universe?.preview.scaleMap(1.2); break;
    case 'preview-scale-down': universe?.preview.scaleMap(1/1.2); break;
    case 'preview-rotate-left': universe?.preview.rotateMap(Math.PI/12); break;
    case 'preview-rotate-right': universe?.preview.rotateMap(-Math.PI/12); break;
    case 'preview-pointer-lock': universe?.preview.lockPointer(); break;
    case 'preview-search': openSearch(); break;
    case 'preview-object': openModal('object',t("Object data","Dati dell'oggetto"),objectMarkup(state.object,true)); break;
    case 'close': closeModal(); break;
    case 'zoom-in': universe?.zoom(0.8); break;
    case 'zoom-out': universe?.zoom(1.25); break;
    case 'reset': universe?.resetView(); notify(t("View reset.","Vista ripristinata.")); break;
    case 'rotate': setRotation(!state.autoRotate); break;
    case 'settings-rotate': setRotation(!state.autoRotate); button.setAttribute('aria-checked', state.autoRotate); break;
    case 'cinema': toggleCinematic(); break;
    case 'sound': await toggleSound(); break;
    case 'tour': toggleTour(); break;
    case 'object': openModal('object', t("Object data","Dati dell’oggetto"), objectMarkup(state.object, true)); break;
    case 'focus':
      if (Number.isInteger(state.object.targetScale)) changeScale(state.object.targetScale);
      else { universe?.focusObject(state.object); notify(`${t("Focus: ","Messa a fuoco: ")}${state.object.name}.`); }
      closeModal();
      break;
  }
});

$('#scale-slider').addEventListener('input', event => changeScale(event.target.value));
$('#modal').addEventListener('click', event => {
  if (event.target !== $('#modal')) return;
  const rect = $('#modal').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal();
});
$('#modal').addEventListener('close', () => {
  if (returnFocus instanceof HTMLElement && returnFocus.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if ($('#modal').open) return;
    if(universe?.preview.isActive){if(document.pointerLockElement)return;if(previewClean)setPreviewClean(false);else universe.exitPreview();return;}
    if (state.cinematic) setCinematic(false);
    if (immersionTimer) { clearTimeout(immersionTimer); immersionTimer = null; $('.toast').classList.remove('visible'); }
    stopTour();
    return;
  }
  if (event.target.matches('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey || $('#modal').open) return;
  if (event.key === '/') { event.preventDefault(); openSearch(); }
  else if (/^[1-5]$/.test(event.key)) { event.preventDefault(); changeScale(Number(event.key) - 1); }
  else if (event.key.toLowerCase() === 'r') { universe?.resetView(); }
  else if (event.code === 'Space' && !universe?.preview.isActive && !event.target.closest('button, a')) { event.preventDefault(); setRotation(!state.autoRotate); }
});
document.addEventListener('pointermove', revealImmersionControl, { passive: true });
document.addEventListener('pointerdown', revealImmersionControl, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopTour(); audioContext?.suspend().catch(() => {}); }
  else if (state.sound) audioContext?.resume().catch(() => {});
});
window.addEventListener('pagehide', () => { clearInterval(tourTimer); audioContext?.suspend().catch(() => {}); });
navigator.xr?.addEventListener('devicechange', checkVR);

renderObject(state.object);
refreshIcons();

try {
  universe = new Universe({
    canvas: $('#universe'),
    labelContainer: $('#map-labels'),
    onSelect: renderObject,
    onScale: updateScale,
    onMessage: notify,
    onImmersiveChange: setCinematic,
    onPreviewChange
  });
  ['labels','grid','particles'].forEach(name => universe.setLayer(name, state[name]));
  universe.setAutoRotate(state.autoRotate);
  universe.setQuality(state.quality);
} catch (error) {
  console.error('Aether renderer:', error);
  $('#renderer-status').textContent = t("CATALOGUE AVAILABLE","CATALOGO DISPONIBILE");
  const fallback = document.createElement('div');
  fallback.className = 'webgl-error';
  fallback.setAttribute('role','alert');
  fallback.innerHTML = `<strong>${t("3D rendering is unavailable.","Il cielo 3D non è disponibile.")}</strong><p>${t("Enable browser hardware acceleration and reload. Catalogue objects and sources remain available.","Attiva l’accelerazione grafica del browser e ricarica la pagina. Puoi già esplorare gli oggetti e le fonti dal catalogo.")}</p><button class="focus-button" data-action="search">${t("Open catalogue","Apri il catalogo")}</button>`;
  $('.app-shell').append(fallback);
  document.querySelectorAll('[data-action="zoom-in"],[data-action="zoom-out"],[data-action="reset"],[data-action="rotate"]').forEach(button => { button.disabled = true; });
}
requestAnimationFrame(() => requestAnimationFrame(() => {
  $('.loading').classList.add('done');
  setTimeout(() => $('.loading')?.remove(), 650);
}));
checkVR();

async function restoreLanguageView() {
  let saved;
  try {
    const value = sessionStorage.getItem('aether.languageView');
    sessionStorage.removeItem('aether.languageView');
    saved = value ? JSON.parse(value) : null;
  } catch { return; }
  if (!saved || !universe) return;
  try {
    if (saved.scale === 8) {
      const data = await ensureNasaSearch();
      const object = data.byId.get(saved.objectId);
      if (object) await universe.showCatalogueObject(object, data);
    } else if (saved.scale >= 6) {
      constellationBrowser.timeZone = saved.timeZone || 'Europe/Rome';
      universe.setEarthVisible(saved.earthVisible !== false);
      await universe.showConstellation(saved.constellationId, { mode: saved.mode, observer: saved.observer });
      if (saved.earthPerspective) universe.viewFromEarth();
    } else if (saved.scale === 5) {
      const planet = findPlanet(saved.objectId) || exoplanets.find(item => item.host === saved.host);
      if (planet) universe.focusObject(planet);
    } else if (scales[saved.scale]) {
      changeScale(saved.scale);
      const object = catalog[scales[saved.scale].id].find(item => item.id === saved.objectId) || (saved.scale === 0 ? findMoon(saved.objectId) : null);
      if (object) {
        universe.selectObject(object);
        if (isMoon(object)) universe.focusObject(object);
      }
    }
  } catch (error) { notify(error.message); }
}
restoreLanguageView();
