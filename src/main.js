import './style.css';
import { createIcons, Orbit, Search, Glasses, Maximize2, Minimize2, Plus, Minus, RotateCcw, Move, MousePointer2, Hand, Play, Pause, Volume2, VolumeX, Settings2, CircleHelp, X, ArrowUpRight, ArrowRight, Focus, Sparkles, Grid3X3, Tags, Compass, Layers, Info, Globe2, Star, Telescope, Check, ExternalLink } from 'lucide';
import { catalog, scales } from './data.js';
import { Universe } from './universe.js';
import { exoplanets, planetCatalogMetadata, findPlanet } from './planets.js';
import { loadConstellations } from './constellation-catalog.js';

const icons = { Orbit, Search, Glasses, Maximize2, Minimize2, Plus, Minus, RotateCcw, Move, MousePointer2, Hand, Play, Pause, Volume2, VolumeX, Settings2, CircleHelp, X, ArrowUpRight, ArrowRight, Focus, Sparkles, Grid3X3, Tags, Compass, Layers, Info, Globe2, Star, Telescope, Check, ExternalLink };
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
const planetBrowser = { query: '', filter: 'all', page: 0 };
const constellationBrowser = {
  query: '', mode: 'space', id: 'Ori', data: null, busy: false,
  observer: { latitude: 41.9028, longitude: 12.4964, dateIso: new Date().toISOString() }
};
let constellationModalRequest = 0;
let returnFocus = null;
let xrSupported = false;
let xrChecked = false;
let audioContext = null;
let audioGain = null;
let audioSuspendTimer = null;

$('#app').innerHTML = `
  <main class="app-shell">
    <canvas id="universe" aria-label="Atlante cosmico tridimensionale. Trascina per orbitare e usa la rotellina per avvicinarti." tabindex="0"></canvas>
    <div class="vignette" aria-hidden="true"></div>
    <div class="labels" id="map-labels" aria-label="Oggetti celesti sulla mappa"></div>
    <header class="topbar">
      <a class="brand" href="#esplora" aria-label="Æther, atlante cosmico"><img src="/favicon.svg" alt=""/><div><div class="brand-word">ÆTHER</div><div class="brand-sub">ATLANTE COSMICO</div></div></a>
      <nav class="topnav" aria-label="Navigazione principale">
        <button class="active" data-action="explore" aria-current="page">Esplora</button>
        <button data-action="collections">Collezioni</button>
        <button data-action="about">Il progetto ${icon('arrow-up-right')}</button>
      </nav>
      <div class="top-actions"><button class="constellation-browser-button" data-action="constellations" aria-label="Esplora le costellazioni" title="Costellazioni">${icon('sparkles')}<span>Costellazioni</span></button><button class="planet-browser-button" data-action="planets" aria-label="Esplora i pianeti" title="Pianeti">${icon('globe-2')}<span>Pianeti</span></button><span class="live"><span class="status-dot"></span><span id="renderer-status">UNIVERSO IN MOVIMENTO</span></span><button class="vr-button" data-action="vr">${icon('glasses')} Entra in VR</button></div>
    </header>
    <section class="intro" aria-label="Regione esplorata">
      <div class="eyebrow">UN VIAGGIO ATTRAVERSO L’INFINITO</div>
      <h1 id="scale-title">${scales[0].title}</h1>
      <div class="subtitle" id="scale-subtitle">${scales[0].subtitle}</div>
    </section>
    <aside class="left-panel" aria-label="Scala e livelli della mappa">
      <div class="section-heading">LA TUA PROSPETTIVA ${icon('layers')}</div>
      <section class="constellation-controls" id="constellation-controls" aria-label="Prospettiva della costellazione" hidden>
        <button class="constellation-change" data-action="constellations"><span id="constellation-current">Costellazioni</span>${icon('search')}</button>
        <div class="constellation-mode" role="group" aria-label="Punto di osservazione">
          <button data-constellation-mode="space">${icon('orbit')}Nello spazio 3D</button>
          <button data-constellation-mode="earth">${icon('globe-2')}Dalla Terra</button>
        </div>
        <p id="constellation-status" class="constellation-status" aria-live="polite"></p>
        <button class="observer-adjust" data-action="constellation-observer">${icon('settings-2')}Luogo e orario</button>
      </section>
      <div class="scale-list" role="group" aria-label="Seleziona la scala cosmica">
        ${scales.map((scale, i) => `<button class="scale-button${i === 0 ? ' active' : ''}" data-scale="${i}" aria-pressed="${i === 0}"><span class="node" aria-hidden="true"></span><span>${scale.short}<small>${scale.extent}</small></span><span class="number">0${i + 1}</span></button>`).join('')}
      </div>
      <div class="layers"><div class="section-heading">LIVELLI DELLA MAPPA</div>
        ${[['labels','Etichette','tags'],['grid','Griglia orbitale','grid-3x3'],['particles','Polvere stellare','sparkles']].map(([name,label,glyph]) => `<div class="layer-row"><span>${icon(glyph)}${label}</span><button class="toggle" role="switch" aria-label="${label}" aria-checked="${state[name]}" data-layer="${name}"></button></div>`).join('')}
      </div>
    </aside>
    <aside class="right-panel" aria-label="Informazioni sull’oggetto selezionato">
      <button class="search-button" data-action="search">${icon('search')}<span>Cerca nell’universo</span><kbd>/</kbd></button>
      <article class="object-card" id="object-card"></article>
      <div class="coordinates"><span>J2000 · RIFERIMENTO</span><span>MAPPA ILLUSTRATIVA</span></div>
    </aside>
    <div class="center-caption" aria-hidden="true"><div class="galaxy-name" id="region-name">SISTEMA SOLARE</div><div class="galaxy-type" id="region-type">OTTO MONDI DA ESPLORARE</div></div>
    <div class="compass" aria-hidden="true"><small>N</small><span>✧</span></div>
    <div class="view-controls" role="group" aria-label="Controlli di visualizzazione">
      <button class="icon-button mobile-info" data-action="object" title="Informazioni sull’oggetto" aria-label="Informazioni sull’oggetto">${icon('info')}</button>
      <button class="icon-button" data-action="zoom-in" title="Avvicina" aria-label="Avvicina">${icon('plus')}</button>
      <button class="icon-button" data-action="zoom-out" title="Allontana" aria-label="Allontana">${icon('minus')}</button>
      <div class="separator"></div>
      <button class="icon-button" data-action="reset" title="Ripristina vista · R" aria-label="Ripristina vista">${icon('rotate-ccw')}</button>
      <button class="icon-button${state.autoRotate ? ' active' : ''}" data-action="rotate" aria-pressed="${state.autoRotate}" title="Rotazione automatica · Spazio" aria-label="Rotazione automatica">${icon('orbit')}</button>
      <button class="immersion-button" data-action="cinema" title="Nasconde tutte le scritte · Esc per tornare" aria-label="Spazio libero, nascondi tutte le scritte" aria-pressed="false">${icon('maximize-2')}<span>Spazio libero</span></button>
    </div>
    <section class="bottom-panel" aria-label="Viaggio e scala">
      <div class="scale-readout"><div class="readout-title">SCALA DI RIFERIMENTO</div><div class="readout-value" id="scale-readout">${scales[0].extent}</div></div>
      <div class="journey">
        <div class="journey-top"><span>Ogni viaggio inizia con la curiosità.</span><small id="scale-step">01 / 05</small></div>
        <input id="scale-slider" type="range" min="0" max="4" step="1" value="0" aria-label="Scala cosmica" aria-valuetext="Sistema Solare"/>
        <div class="journey-labels"><span>IL NOSTRO SISTEMA</span><span>L’UNIVERSO OSSERVABILE</span></div>
        <button class="cosmic-return" data-action="cosmic-scales" hidden>${icon('arrow-right')}Torna alle scale cosmiche</button>
      </div>
      <div class="play-area"><button class="play-button" data-action="tour" aria-label="Avvia viaggio guidato" aria-pressed="false">${icon('play')}</button><div><strong id="tour-title">Lasciati trasportare</strong><small id="tour-caption">Inizia un viaggio guidato</small></div></div>
    </section>
    <footer class="footer">
      <div class="footer-controls"><span>${icon('mouse-pointer-2')} Trascina per orbitare</span><span>${icon('move')} Scroll per esplorare</span><span>${icon('hand')} Mani libere, in VR</span></div>
      <div class="footer-right"><span>ISPIRATO ALLA MERAVIGLIA. RADICATO NELLA SCIENZA.</span><button data-action="sound" aria-pressed="false" aria-label="Attiva suono ambiente">${icon('volume-x')}<span id="sound-label">Suono off</span></button><button data-action="settings" title="Impostazioni" aria-label="Impostazioni">${icon('settings-2')}</button><button data-action="help" title="Guida ai comandi" aria-label="Guida ai comandi">${icon('circle-help')}</button></div>
    </footer>
    <button class="exit-cinema" data-action="cinema" aria-label="Mostra interfaccia">${icon('minimize-2')}</button>
    <div class="toast" role="status" aria-live="polite"></div>
    <div class="loading" role="status"><img src="/favicon.svg" alt=""/><span>TRACCIANDO LE STELLE</span></div>
  </main>
  <dialog id="modal" aria-labelledby="modal-title"><div class="dialog-head"><h2 id="modal-title"></h2><button data-action="close" aria-label="Chiudi finestra">${icon('x')}</button></div><div id="modal-body"></div></dialog>
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
const number = (value, unit = '') => Number.isFinite(value) ? `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}` : 'Non disponibile';
const currentScale = () => scales[state.scale] || {
  id: state.scale >= 6 ? 'constellations' : 'exoplanets',
  name: state.context?.name || state.object?.host || 'Sistema esoplanetario',
  source: state.scale >= 6 ? 'https://github.com/astronexus/HYG-Database' : 'https://exoplanetarchive.ipac.caltech.edu/',
  extent: state.scale >= 6 ? 'Catalogo stellare HYG' : 'Sistema esoplanetario',
  ...state.context
};

function objectMarkup(object, isModal = false) {
  const scale = currentScale();
  const planet = isPlanet(object);
  const exoplanet = object.bodyKind === 'exoplanet';
  const isOverview = object.id === catalog[scale.id]?.[0]?.id || object.id === state.context?.overview?.id;
  const catalogStar = state.scale >= 6 && Number.isFinite(object.raDeg) && Number.isFinite(object.decDeg);
  const canDive = Number.isInteger(object.targetScale) && scales[object.targetScale];
  const art = isModal ? '' : planet
    ? `<div class="planet-art${object.id === 'saturn' ? ' planet-art-saturn' : ''}" style="--planet-color:${escape(object.color || '#a6c7d4')};${solarTextures[object.id] ? `--planet-texture:url('/textures/${solarTextures[object.id]}')` : ''}" aria-hidden="true"><span></span></div>`
    : `<div class="galaxy-art" data-scene="${escape(scale.id)}" aria-hidden="true"></div>`;
  const measurements = exoplanet ? `<div class="planet-measurements">
    <div><span>RAGGIO</span><strong>${number(object.radiusEarth, 'R⊕')}</strong></div>
    <div><span>PERIODO ORBITALE</span><strong>${number(object.periodDays, 'giorni')}</strong></div>
    ${isModal ? `<div><span>MASSA DA CATALOGO${object.massProvenance ? ' · ' + escape(object.massProvenance) : ''}</span><strong>${number(object.massEarth, 'M⊕')}</strong></div><div><span>TEMPERATURA DI EQUILIBRIO</span><strong>${number(object.temperatureK, 'K')}</strong></div><div><span>SEMIASSE MAGGIORE</span><strong>${number(object.semiMajorAxisAu, 'UA')}</strong></div><div><span>ANNO DI SCOPERTA</span><strong>${Number.isFinite(object.discoveryYear) ? object.discoveryYear : 'Non disponibile'}</strong></div>` : ''}
    </div>` : catalogStar ? `<div class="planet-measurements star-measurements">
      <div><span>ASCENSIONE RETTA · J2000</span><strong>${number(object.raDeg, '°')}</strong></div>
      <div><span>DECLINAZIONE · J2000</span><strong>${number(object.decDeg, '°')}</strong></div>
      ${isModal ? `<div><span>MAGNITUDINE APPARENTE</span><strong>${number(object.mag)}</strong></div><div><span>IDENTIFICATORE HIPPARCOS</span><strong>${object.hip ? 'HIP ' + escape(object.hip) : 'Non disponibile'}</strong></div>${state.scale === 7 ? `<div><span>ALTEZZA SULL'ORIZZONTE</span><strong>${number(object.altitudeDeg, '°')}</strong></div>` : ''}` : ''}
    </div>` : '';
  return `<div class="card-top"><span>${planet ? 'UN MONDO DA ESPLORARE' : isOverview ? 'TACCUINO DI ESPLORAZIONE' : 'OGGETTO CELESTE'}</span>${icon(planet ? 'globe-2' : 'sparkles')}</div>${art}
    <div class="card-content${planet ? ' planet-card-content' : ''}"><h2>${escape(object.name)}</h2><div class="object-type">${escape(object.type || 'Stella da catalogo')}${exoplanet ? ' · ' + escape(object.host) : ''}</div>
      <p class="card-description">${escape(object.detail || state.context?.description || '')}</p>
      <div class="card-stats"><span>${isOverview ? escape(scale.metric) : exoplanet ? 'DISTANZA DALLA TERRA' : 'DISTANZA / ESTENSIONE'}</span><strong>${escape(isOverview ? scale.count : object.distance || 'Non disponibile')}</strong></div>
      ${isOverview ? `<div class="card-stats"><span>ESTENSIONE</span><strong>${escape(scale.extent)}</strong></div>` : ''}
      ${measurements}
      ${catalogStar ? `<p class="illustration-note">${state.scale === 7 ? (object.altitudeDeg < 0 ? 'Sotto l’orizzonte nel luogo e all’orario scelti.' : 'Direzione nel cielo dal luogo e all’orario scelti.') : Number.isFinite(object.distanceLy) ? 'Posizione 3D da coordinate e distanza di catalogo.' : 'Distanza non disponibile: visibile nella vista dalla Terra.'}</p>${!isModal ? `<button class="planet-details-button" data-action="object">Dati della stella ${icon('arrow-up-right')}</button>` : ''}` : ''}
      ${isModal && object.positionNote ? `<p class="illustration-note">${escape(object.positionNote)}</p>` : ''}
      ${exoplanet ? '<p class="illustration-note">Aspetto illustrativo. Misure e stime dal catalogo NASA.</p>' : ''}
      ${planet && !isModal ? `<button class="planet-details-button" data-action="object">Dati del pianeta ${icon('arrow-up-right')}</button>` : ''}
      <button class="focus-button" data-action="focus">${icon(canDive ? 'arrow-right' : 'focus')}${planet ? 'Avvicinati al pianeta' : canDive ? 'Esplora ' + escape(scales[object.targetScale].name) : 'Metti a fuoco'}</button>
      <a class="object-source" href="${escape(object.source || scale.source)}" target="_blank" rel="noopener noreferrer">Fonte scientifica ↗</a>
    </div>`;
}

function renderObject(object) {
  if (!object || !object.name) return;
  state.object = object;
  $('#object-card').innerHTML = objectMarkup(object);
  $('.coordinates').innerHTML = `<span>${state.scale === 7 ? 'ORIZZONTE LOCALE' : state.scale === 6 ? 'J2000 · DISTANZE HYG' : ['stars','local'].includes(currentScale().id) ? 'J2000 · APPROSSIMATA' : 'VISTA SCHEMATICA'}</span><span>${state.scale >= 6 ? 'CATALOGO HYG 4.1' : 'ATLANTE COSMICO'}</span>`;
  if ($('#modal').open && $('#modal').dataset.kind === 'object') $('#modal-body').innerHTML = objectMarkup(object, true);
  refreshIcons();
}

function updateScale(index, context = null) {
  index = Number(index);
  if (!Number.isInteger(index) || ![5, 6, 7].includes(index) && !scales[index]) return;
  state.scale = index;
  state.context = index >= 5 ? context || state.context : null;
  const scale = currentScale();
  const hostView = index === 5;
  const constellationView = index >= 6;
  const detached = index >= 5;
  if (constellationView) {
    constellationBrowser.id = context?.constellationId || constellationBrowser.id;
    constellationBrowser.mode = index === 7 ? 'earth' : 'space';
    if (context?.observer) constellationBrowser.observer = { ...constellationBrowser.observer, ...context.observer };
  }
  $('#scale-title').textContent = constellationView ? `${scale.name}.` : hostView ? `Intorno a ${scale.name}.` : scale.title;
  $('#scale-subtitle').textContent = constellationView ? index === 7 ? 'Il cielo sopra di te. Una prospettiva terrestre.' : 'Le stelle di una figura. La profondità dello spazio.' : hostView ? 'Un altro sole. Nuovi mondi da avvicinare.' : scale.subtitle;
  $('#scale-readout').textContent = scale.extent;
  $('#scale-step').textContent = constellationView ? index === 7 ? 'DALLA TERRA' : 'COSTELLAZIONI' : hostView ? 'ESOPIANETI' : `0${index + 1} / 05`;
  $('#region-name').textContent = scale.name.toLocaleUpperCase('it-IT');
  $('#region-type').textContent = constellationView ? index === 7 ? 'CIELO LOCALE · ORIZZONTE GEOMETRICO' : 'STELLE REALI · FIGURE CONVENZIONALI' : hostView ? 'SISTEMA ESOPLANETARIO · ORBITE ILLUSTRATIVE' : index === 4 ? 'RICOSTRUZIONE CONCETTUALE' : catalog[scale.id][0].type.toLocaleUpperCase('it-IT');
  const slider = $('#scale-slider');
  slider.disabled = detached;
  slider.hidden = detached;
  if (!detached) slider.value = index;
  slider.setAttribute('aria-valuetext', detached ? 'Seleziona una scala cosmica per riprendere il viaggio.' : scale.name);
  slider.style.background = `linear-gradient(90deg,#ac8c5d ${detached ? 0 : index * 25}%,#37434a ${detached ? 0 : index * 25}%)`;
  $('.journey-labels').hidden = detached;
  $('.cosmic-return').hidden = !detached;
  $('.journey-top > span').textContent = detached ? 'Continua a esplorare l’atlante.' : 'Ogni viaggio inizia con la curiosità.';
  $('.app-shell').classList.toggle('constellation-view', constellationView);
  $('.app-shell').classList.toggle('earth-sky-view', index === 7);
  $('#constellation-controls').hidden = !constellationView;
  $('#constellation-current').textContent = scale.name;
  document.querySelectorAll('#constellation-controls [data-constellation-mode]').forEach(button => {
    const selected = button.dataset.constellationMode === constellationBrowser.mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected);
  });
  $('#constellation-controls .observer-adjust').hidden = index !== 7;
  if (constellationView) {
    const observer = constellationBrowser.observer;
    const date = new Date(observer.dateIso);
    const when = Number.isFinite(date.getTime()) ? date.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const visible = Number.isFinite(context?.visibleStarCount) ? `${context.visibleStarCount} stelle della figura sopra l’orizzonte. ` : '';
    $('#constellation-status').textContent = index === 7
      ? `${visible}${number(observer.latitude, '°')}, ${number(observer.longitude, '°')} · ${when}`
      : `${Number.isFinite(context?.starCount) ? context.starCount + ' stelle nella figura. ' : ''}Le linee collegano stelle a distanze differenti.${context?.unknownDistanceCount ? ' Alcune distanze non sono disponibili.' : ''}`;
  }
  $('.footer-controls span:first-child').innerHTML = `${icon('mouse-pointer-2')} ${index === 7 ? 'Trascina per guardarti intorno' : 'Trascina per orbitare'}`;
  $('#universe').setAttribute('aria-label', index === 7 ? 'Cielo dalla superficie terrestre. Trascina per guardarti intorno e usa la rotellina per ingrandire.' : 'Atlante cosmico tridimensionale. Trascina per orbitare e usa la rotellina per avvicinarti.');
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
  const selectors = '.topbar,.intro,.left-panel,.right-panel,.bottom-panel,.footer,.view-controls,.compass,.center-caption,.labels,.toast,.webgl-error';
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
  notify('Spazio libero: tutte le scritte scompaiono. Esc o l’icona in alto a destra per tornare.');
  immersionTimer = setTimeout(() => setCinematic(true), reducedMotion ? 1200 : 1800);
}

function renderTour() {
  const button = $('[data-action="tour"]');
  button.innerHTML = icon(state.tour ? 'pause' : 'play');
  button.setAttribute('aria-pressed', state.tour);
  button.setAttribute('aria-label', state.tour ? 'Ferma viaggio guidato' : 'Avvia viaggio guidato');
  $('#tour-title').textContent = state.tour ? 'Il tuo viaggio è iniziato' : 'Lasciati trasportare';
  $('#tour-caption').textContent = state.tour ? 'Una nuova prospettiva ogni 12 s' : 'Inizia un viaggio guidato';
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
  notify('Dal Sole all’universo osservabile. Il viaggio comincia.');
  tourTimer = setInterval(() => {
    if (state.scale >= 4) {
      stopTour();
      notify('Hai raggiunto l’universo osservabile. Continua a esplorare.');
      return;
    }
    changeScale(state.scale + 1, false);
  }, 12000);
}

async function toggleSound() {
  try {
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return notify('Il suono non è supportato da questo browser.');
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
    button.innerHTML = `${icon(enabled ? 'volume-2' : 'volume-x')}<span id="sound-label">Suono ${enabled ? 'on' : 'off'}</span>`;
    button.setAttribute('aria-pressed', enabled);
    button.setAttribute('aria-label', `${enabled ? 'Disattiva' : 'Attiva'} suono ambiente`);
    refreshIcons();
  } catch {
    notify('Impossibile avviare il suono. Verifica le impostazioni audio del browser.');
  }
}

function openModal(kind, title, content) {
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

function normalized(value) { return String(value).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
const solarPlanets = catalog.solar.filter(isPlanet);
const solarTextures = { mercury:'2k_mercury.jpg', venus:'2k_venus_atmosphere.jpg', earth:'2k_earth_daymap.jpg', mars:'2k_mars.jpg', jupiter:'2k_jupiter.jpg', saturn:'2k_saturn.jpg', uranus:'2k_uranus.jpg', neptune:'2k_neptune.jpg' };
const searchEntries = [
  ...scales.flatMap((scale, index) => catalog[scale.id].map(object => ({ index, object, scaleName: scale.name }))),
  ...exoplanets.map(object => ({ index: 5, object, scaleName: object.host }))
].map(entry => ({ ...entry, searchText: normalized(`${entry.object.name} ${entry.object.type} ${entry.scaleName} ${entry.object.host || ''}`) }));
const planetEntries = [
  ...solarPlanets.map(object => ({ index: 0, object, category: 'solar' })),
  ...exoplanets.map(object => ({ index: 5, object, category: 'exoplanet' }))
].map(entry => ({ ...entry, searchText: normalized(`${entry.object.name} ${entry.object.host || 'Sistema Solare Sole'} ${entry.object.type}`) }));
const catalogDate = (() => {
  const date = new Date(planetCatalogMetadata.retrievedAt);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('it-IT', { timeZone:'Europe/Rome', day:'numeric', month:'long', year:'numeric' }) : 'data non disponibile';
})();
const planetColor = object => escape(object.color || '#a8c7d8');

function renderSearch(query = '') {
  const needle = normalized(query.trim());
  const matches = searchEntries.filter(entry => entry.searchText.includes(needle));
  const entries = matches.slice(0, 80);
  $('#search-results').innerHTML = entries.length ? entries.map(({ object, index, scaleName }) => `<button class="search-result" data-object="${escape(object.id)}" data-object-scale="${index}"><span><strong>${escape(object.name)}</strong><small>${escape(scaleName)} · ${escape(object.type)}</small></span>${icon('arrow-up-right')}</button>`).join('') : '<p>Nessun oggetto trovato. Prova “Terra”, “TRAPPIST-1” o “Andromeda”.</p>';
  $('#search-count').textContent = matches.length > 80 ? `${matches.length.toLocaleString('it-IT')} oggetti trovati · primi 80 risultati. Affina la ricerca per vedere gli altri.` : `${matches.length.toLocaleString('it-IT')} oggetti trovati`;
  refreshIcons();
}

function openSearch() {
  openModal('search', 'Cerca nell’universo', '<label for="search-input" class="readout-title">STELLE, PIANETI E GALASSIE</label><input id="search-input" class="search-input" type="search" placeholder="Dove vuoi andare?" autocomplete="off" spellcheck="false" aria-controls="search-results"/><div id="search-count" class="result-count" role="status"></div><div id="search-results" class="search-results"></div>');
  renderSearch();
  $('#search-input').addEventListener('input', event => renderSearch(event.target.value));
  $('#search-input').focus();
}

function planetPreview(object, className = 'planet-preview') {
  const texture = solarTextures[object.id];
  return `<span class="${className}${object.id === 'saturn' ? ' saturn-preview' : ''}" style="--planet-color:${planetColor(object)};${texture ? `--planet-texture:url('/textures/${texture}')` : ''}" aria-hidden="true"></span>`;
}

function renderPlanets() {
  const needle = normalized(planetBrowser.query.trim());
  const matches = planetEntries.filter(entry => (planetBrowser.filter === 'all' || entry.category === planetBrowser.filter) && entry.searchText.includes(needle));
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  planetBrowser.page = Math.min(Math.max(0, planetBrowser.page), pageCount - 1);
  const start = planetBrowser.page * pageSize;
  const entries = matches.slice(start, start + pageSize);
  $('#planet-results').innerHTML = entries.length ? entries.map(({ object, index }) => `<button class="planet-result" data-object="${escape(object.id)}" data-object-scale="${index}">
    ${planetPreview(object)}<span class="planet-result-copy"><strong>${escape(object.name)}</strong><small>${escape(object.host || 'Sistema Solare')}</small><span>${escape(object.type)}</span></span>${icon('arrow-up-right')}</button>`).join('') : '<p class="planet-empty">Nessun pianeta trovato. Cerca il nome di un pianeta o della sua stella.</p>';
  $('#planet-count').textContent = matches.length ? `${matches.length.toLocaleString('it-IT')} pianeti · ${start + 1}–${Math.min(start + pageSize, matches.length)}` : '0 pianeti';
  $('#planet-page').textContent = `Pagina ${planetBrowser.page + 1} di ${pageCount}`;
  $('[data-catalog-page="previous"]').disabled = planetBrowser.page === 0;
  $('[data-catalog-page="next"]').disabled = planetBrowser.page >= pageCount - 1;
  document.querySelectorAll('[data-catalog-filter]').forEach(button => {
    const active = button.dataset.catalogFilter === planetBrowser.filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  refreshIcons();
}

function openPlanets() {
  openModal('planets', 'Mondi da esplorare', `
    <p class="catalog-introduction"><strong>8 pianeti del Sistema Solare + ${exoplanets.length.toLocaleString('it-IT')} esopianeti confermati.</strong> Scegli un mondo per avvicinarti.</p>
    <div class="solar-shortcuts" role="group" aria-label="Gli otto pianeti del Sistema Solare">${solarPlanets.map(object => `<button data-object="${escape(object.id)}" data-object-scale="0">${planetPreview(object)}<span>${escape(object.name)}</span></button>`).join('')}</div>
    <label for="planet-search" class="readout-title">CERCA UN PIANETA O LA SUA STELLA</label>
    <input id="planet-search" class="search-input" type="search" placeholder="Terra, TRAPPIST-1, Kepler…" autocomplete="off" spellcheck="false" value="${escape(planetBrowser.query)}" aria-controls="planet-results"/>
    <div class="catalog-filter" role="group" aria-label="Tipo di pianeta"><button data-catalog-filter="all">Tutti</button><button data-catalog-filter="solar">Sistema Solare</button><button data-catalog-filter="exoplanet">Esopianeti</button></div>
    <div id="planet-count" class="result-count" role="status"></div>
    <div id="planet-results" class="planet-results"></div>
    <div class="catalog-pagination"><button data-catalog-page="previous" aria-label="Pagina precedente">← Precedenti</button><span id="planet-page"></span><button data-catalog-page="next" aria-label="Pagina successiva">Successivi →</button></div>
    <p class="catalog-provenance"><a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noopener noreferrer">NASA Exoplanet Archive</a> · Catalogo del ${escape(catalogDate)}. Tutti gli esopianeti confermati nella tabella PSCompPars alla data di acquisizione. I candidati non confermati non sono inclusi. Gli esopianeti hanno un aspetto illustrativo.</p>`);
  renderPlanets();
  $('#planet-search').addEventListener('input', event => { planetBrowser.query = event.target.value; planetBrowser.page = 0; renderPlanets(); });
}

function localDateInput(iso) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function constellationModeButtons() {
  return `<div class="constellation-mode modal-constellation-mode" role="group" aria-label="Prospettiva della costellazione">
    <button data-constellation-mode="space" aria-pressed="${constellationBrowser.mode === 'space'}" class="${constellationBrowser.mode === 'space' ? 'active' : ''}">${icon('orbit')}Nello spazio 3D<small>Scopri le distanze reali</small></button>
    <button data-constellation-mode="earth" aria-pressed="${constellationBrowser.mode === 'earth'}" class="${constellationBrowser.mode === 'earth' ? 'active' : ''}">${icon('globe-2')}Dalla superficie terrestre<small>Ritrova la figura nel cielo</small></button>
  </div>`;
}

function observerFormMarkup() {
  const observer = constellationBrowser.observer;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'locale';
  return `<fieldset id="observer-fields" class="observer-fields" ${constellationBrowser.mode === 'earth' ? '' : 'hidden'}>
    <legend>Il tuo punto di osservazione</legend>
    <label for="observer-latitude">Latitudine <small>Nord + / Sud \u2212</small><input id="observer-latitude" type="number" min="-90" max="90" step="any" required value="${observer.latitude}"/></label>
    <label for="observer-longitude">Longitudine <small>Est + / Ovest \u2212</small><input id="observer-longitude" type="number" min="-180" max="180" step="any" required value="${observer.longitude}"/></label>
    <label for="observer-datetime" class="observer-date">Data e ora <small>${escape(timezone)} \u00b7 1900\u20132100</small><input id="observer-datetime" type="datetime-local" min="1900-01-02T00:00" max="2100-12-30T23:59" required value="${localDateInput(observer.dateIso)}"/></label>
    <div class="observer-actions"><button data-action="observer-now">${icon('rotate-ccw')}Adesso</button><button id="constellation-apply" data-action="apply-observer">Aggiorna ${escape(constellationBrowser.data?.constellations.find(item => item.id === constellationBrowser.id)?.name || 'il cielo')}${icon('arrow-right')}</button></div>
    <p>Coordinate iniziali: Roma. L\u2019orario segue il fuso del dispositivo. Il cielo resta fermo all\u2019istante scelto; le stelle sotto l\u2019orizzonte non sono visibili. La luminosit\u00e0 diurna, la rifrazione e l\u2019inquinamento luminoso non sono simulati.</p>
  </fieldset>`;
}

function renderConstellationResults() {
  const results = $('#constellation-results');
  if (!results || !constellationBrowser.data) return;
  const query = normalized(constellationBrowser.query.trim());
  const matches = constellationBrowser.data.constellations.filter(item => normalized(`${item.name} ${item.latinName} ${item.abbr} ${item.id}`).includes(query)).sort((a, b) => a.name.localeCompare(b.name, 'it-IT'));
  results.innerHTML = matches.map(item => {
    const starCount = new Set(item.segments.flat()).size;
    return `<button class="constellation-result${item.id === constellationBrowser.id ? ' selected' : ''}" data-constellation="${escape(item.id)}" ${constellationBrowser.busy ? 'disabled' : ''}>
      <span class="constellation-monogram" aria-hidden="true">${icon('sparkles')}<small>${escape(item.abbr)}</small></span><span><strong>${escape(item.name)}</strong><small>${escape(item.latinName)} \u00b7 ${starCount} stelle nella figura</small></span>${icon('arrow-up-right')}</button>`;
  }).join('') || '<p class="constellation-empty">Nessuna costellazione trovata. Prova \u201cOrione\u201d, \u201cOrsa\u201d o \u201cCassiopea\u201d.</p>';
  $('#constellation-count').textContent = `${matches.length} costellazioni${matches.length !== constellationBrowser.data.constellations.length ? ' trovate' : ' \u00b7 scegli una figura da esplorare'}`;
  refreshIcons();
}

function renderConstellationModal() {
  const stars = constellationBrowser.data.metadata?.starCount || constellationBrowser.data.metadata?.catalogStarCount;
  $('#modal-body').innerHTML = `
    <p class="catalog-introduction"><strong>Le 88 costellazioni. Due modi di guardarle.</strong> ${stars ? number(stars) : 'Oltre 119.000'} stelle del catalogo HYG, dalle figure familiari alla loro profondit\u00e0 nello spazio.</p>
    ${constellationModeButtons()}
    ${observerFormMarkup()}
    <label for="constellation-search" class="readout-title">CERCA UNA COSTELLAZIONE</label>
    <input id="constellation-search" class="search-input" type="search" value="${escape(constellationBrowser.query)}" placeholder="Orione, Cassiopea, Orsa Maggiore\u2026" autocomplete="off" spellcheck="false" aria-controls="constellation-results"/>
    <div id="constellation-count" class="result-count" role="status"></div>
    <div id="constellation-results" class="constellation-results"></div>
    <div id="constellation-progress" class="constellation-progress" role="status" aria-live="polite"></div>
    <p class="catalog-provenance">Le linee sono figure convenzionali della tradizione occidentale. Uniscono stelle spesso molto lontane tra loro. Le distanze mancanti restano escluse dalla vista 3D. Il catalogo HYG \u00e8 una selezione osservativa: non comprende tutte le stelle conosciute. <a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener noreferrer">HYG 4.1 \u00b7 fonte e licenza</a></p>`;
  renderConstellationResults();
  $('#constellation-search').addEventListener('input', event => { constellationBrowser.query = event.target.value; renderConstellationResults(); });
  refreshIcons();
}

async function openConstellations({ observer = false } = {}) {
  if (observer) constellationBrowser.mode = 'earth';
  const request = ++constellationModalRequest;
  openModal('constellations', 'Figure tra le stelle', '<p class="constellation-loading" role="status">Caricamento delle 88 costellazioni\u2026</p>');
  try {
    constellationBrowser.data ||= await loadConstellations();
    if (request !== constellationModalRequest || !$('#modal').open || $('#modal').dataset.kind !== 'constellations') return;
    renderConstellationModal();
    $(observer ? '#observer-latitude' : '#constellation-search').focus();
  } catch (error) {
    if (request !== constellationModalRequest || !$('#modal').open || $('#modal').dataset.kind !== 'constellations') return;
    $('#modal-body').innerHTML = '<p role="alert">Il catalogo delle costellazioni non \u00e8 stato caricato. Riprova tra un momento.</p><button class="focus-button" data-action="constellations">Riprova</button>';
  }
}

function readObserverForm() {
  if (!$('#modal').open || $('#modal').dataset.kind !== 'constellations' || !$('#observer-fields') || constellationBrowser.mode !== 'earth') return true;
  const fields = ['#observer-latitude', '#observer-longitude', '#observer-datetime'].map($);
  for (const field of fields) {
    if (!field.reportValidity()) return false;
  }
  const date = new Date(fields[2].value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) {
    fields[2].setCustomValidity('Scegli una data compresa tra il 1900 e il 2100.');
    fields[2].reportValidity();
    fields[2].addEventListener('input', () => fields[2].setCustomValidity(''), { once: true });
    return false;
  }
  constellationBrowser.observer = { latitude: Number(fields[0].value), longitude: Number(fields[1].value), dateIso: date.toISOString() };
  return true;
}

async function selectConstellation(id, mode = constellationBrowser.mode) {
  if (constellationBrowser.busy) return;
  if (!readObserverForm()) return;
  if (!universe) return notify('La vista delle costellazioni richiede il motore grafico WebGL. Attiva l\u2019accelerazione grafica e ricarica.');
  stopTour();
  constellationBrowser.busy = true;
  const lastMode = state.scale === 7 ? 'earth' : 'space';
  constellationBrowser.mode = mode;
  const pending = document.querySelectorAll('[data-constellation], [data-constellation-mode], #constellation-apply');
  pending.forEach(button => { button.disabled = true; });
  if ($('#constellation-progress')) $('#constellation-progress').textContent = 'Tracciando le stelle e le loro connessioni\u2026';
  else notify('Tracciando le stelle\u2026');
  $('#constellation-controls').setAttribute('aria-busy', 'true');
  try {
    const shown = await universe.showConstellation(id, { mode, observer: { ...constellationBrowser.observer } });
    if (shown === false) return;
    constellationBrowser.id = id;
    if ($('#modal').dataset.kind === 'constellations') closeModal();
  } catch (error) {
    constellationBrowser.mode = lastMode;
    const message = error?.message || 'Impossibile aprire questa costellazione. Riprova tra un momento.';
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
    { scale:0, id:'earth', icon:'globe-2', name:'Il nostro angolo di cosmo', subtitle:'Dal Sole agli otto pianeti' },
    { scale:1, id:'proxima', icon:'star', name:'Le luci più vicine', subtitle:'Incontra le stelle del vicinato' },
    { scale:3, id:'andromeda', icon:'orbit', name:'Isole nell’oscurità', subtitle:'Un viaggio tra le galassie' },
    { scale:4, id:'laniakea', icon:'sparkles', name:'La grande trama', subtitle:'Alla scoperta della rete cosmica' }
  ];
  openModal('collections', 'Sentieri tra le stelle', `<p>Quattro punti di partenza. Infinite ragioni per guardare più lontano.</p><div class="collection-grid">${featured.map(item => `<button class="collection-item" data-object="${item.id}" data-object-scale="${item.scale}">${icon(item.icon)}<strong>${item.name}</strong><small>${item.subtitle}</small></button>`).join('')}</div>`);
}

function openAbout() {
  openModal('about', 'Un atlante per la meraviglia', `
    <p>Æther trasforma l’esplorazione del cosmo in un gesto. Una mappa luminosa, ispirata agli strumenti degli antichi navigatori e ai mondi della fantascienza.</p>
    <h3>IL CIELO REALE, UNA MAPPA INTERPRETATA</h3>
    <p>Gli oggetti selezionabili sono reali. Il catalogo planetario include gli otto pianeti del Sistema Solare e tutti i ${exoplanets.length.toLocaleString('it-IT')} esopianeti confermati nella tabella PSCompPars del NASA Exoplanet Archive, acquisita il ${escape(catalogDate)}. Gli altri oggetti sono una selezione dell’universo conosciuto.</p><p>I sistemi esoplanetari mostrano orbite schematiche; gli aspetti dei pianeti sono illustrativi. Misure e stime provengono dall’archivio; i dati mancanti restano indicati come non disponibili.</p><p>Texture planetarie: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope</a>, licenza <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Basate su immagini NASA con integrazioni artistiche.</p>
    <p>Le distanze orbitali sono compresse e le dimensioni planetarie amplificate. Le stelle vicine usano coordinate equatoriali J2000 approssimate. La Via Lattea è una ricostruzione illustrativa; nel Gruppo Locale le dimensioni galattiche sono amplificate.</p>
    <p>La rete cosmica e le particelle decorative sono generate proceduralmente. Le posizioni dei suoi ammassi sono schematiche: non sono un catalogo osservativo. La navigazione collega cinque rappresentazioni con scale differenti.</p>
    <h3>STELLE DA CATALOGO</h3>
    <p>La vista stellare include 156 stelle entro 25 anni luce estratte da <a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener noreferrer">HYG 4.1 · David Nash</a>, oltre ai riferimenti principali. Il sottoinsieme conserva coordinate, distanze e identificatori: selezione, conversione in anni luce e nomi di visualizzazione sono adattamenti dell’atlante. Dati distribuiti con licenza <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.</p>
    <p>La sezione Costellazioni amplia il cielo a oltre 119.000 stelle HYG e alle 88 figure occidentali. Nello spazio 3D, le stelle con distanza misurata mantengono la profondità relativa; la vista dalla Terra ricostruisce le direzioni nel cielo per luogo e orario, con un orizzonte geometrico. Le linee sono convenzioni visive, non legami fisici tra le stelle. I dati HYG sono distribuiti con licenza CC BY-SA 4.0.</p>
    <h3>FONTI E APPROFONDIMENTI</h3>
    <ul><li><a href="${scales[0].source}" target="_blank" rel="noopener noreferrer">NASA · Dimensioni e distanze del Sistema Solare</a></li>
    <li><a href="${scales[1].source}" target="_blank" rel="noopener noreferrer">NASA / Hubble · Proxima Centauri</a></li>
    <li><a href="${scales[2].source}" target="_blank" rel="noopener noreferrer">NASA · Galassie e Via Lattea</a></li>
    <li><a href="${scales[4].source}" target="_blank" rel="noopener noreferrer">NASA · L’universo osservabile</a></li></ul>`);
}

function openHelp() {
  openModal('help', 'Impara a navigare', `
    <div class="help-keys"><div><strong>Trascina</strong>Orbita intorno alla mappa</div><div><strong>Rotellina / due dita</strong>Avvicina e allontana</div><div><strong>Clic / tocco su un pianeta</strong>Vola vicino alla sua superficie</div><div><strong>Pianeti</strong>Sfoglia tutti gli otto pianeti e gli esopianeti confermati</div><div><strong>Costellazioni</strong>Scegli una figura, osserva la sua profondità in 3D o il cielo dalla Terra. Luogo e orario sono modificabili</div><div><strong>Spazio libero</strong>Nasconde tutte le scritte. Esc o l’icona in alto a destra per tornare</div><div><strong>1 — 5</strong>Cambia scala cosmica</div><div><strong>/</strong>Cerca stelle e pianeti</div><div><strong>Spazio</strong>Ferma o riprendi la rotazione</div><div><strong>R</strong>Ripristina l’inquadratura</div><div><strong>Esc</strong>Chiudi finestre e vista immersiva</div></div>
    <h3>NELLA REALTÀ VIRTUALE</h3><p>Con un visore WebXR compatibile puoi osservare la mappa davanti a te. Il tracciamento delle mani richiede un visore e un browser che lo supportino. Anche i controller sono utilizzabili.</p><button class="focus-button" data-action="vr">${icon('glasses')}Scopri i comandi VR</button>`);
}

function openSettings() {
  openModal('settings', 'La tua esperienza', `
    <h3>DETTAGLIO DELLA MAPPA</h3><div class="quality" role="group" aria-label="Qualità grafica"><button data-quality="low" class="${state.quality === 'low' ? 'active' : ''}" aria-pressed="${state.quality === 'low'}">Essenziale</button><button data-quality="high" class="${state.quality === 'high' ? 'active' : ''}" aria-pressed="${state.quality === 'high'}">Ricco di stelle</button></div><p>Il dettaglio essenziale riduce il numero di particelle e il carico grafico.</p>
    <h3>MOVIMENTO E LIVELLI</h3>
    <div class="layer-row"><span>Rotazione automatica</span><button class="toggle" role="switch" data-action="settings-rotate" aria-label="Rotazione automatica" aria-checked="${state.autoRotate}"></button></div>
    ${[['labels','Etichette'],['grid','Griglia orbitale'],['particles','Polvere stellare']].map(([name,label]) => `<div class="layer-row"><span>${label}</span><button class="toggle" role="switch" aria-label="${label}" aria-checked="${state[name]}" data-layer="${name}"></button></div>`).join('')}
    <p>${reducedMotion ? 'Riduzione del movimento rilevata: la rotazione parte disattivata, salvo una tua preferenza salvata.' : 'Le preferenze vengono salvate su questo dispositivo.'}</p>`);
}

function vrContent() {
  const supported = xrSupported && universe;
  const status = !window.isSecureContext ? 'Per attivare WebXR apri questa pagina via HTTPS o su localhost.' : !navigator.xr ? 'Questo browser non espone WebXR. Apri l’atlante nel browser di un visore compatibile.' : !xrChecked ? 'Verifica della compatibilità del visore in corso…' : !xrSupported ? 'Nessun visore VR disponibile in questo browser. Apri l’atlante dal visore oppure collega un dispositivo compatibile.' : !universe ? 'La realtà virtuale richiede una sessione grafica WebGL funzionante.' : 'Visore disponibile. Sei pronto a entrare.';
  return `<p>Il cosmo diventa un ologramma davanti a te. Muoviti intorno alla mappa, avvicinati e segui le sue stelle.</p>
    <div class="help-keys"><div><strong>Pizzico breve</strong>Seleziona un oggetto sulla mappa</div><div><strong>Pizzico mantenuto</strong>Sposta e ruota; con due mani cambia anche dimensione</div><div><strong>Controller · grilletto</strong>Seleziona un oggetto puntandolo</div><div><strong>Pannello nell’ologramma</strong>Cambia scala, ripristina la vista o esci</div><div><strong>LIBERA</strong>Nasconde scritte e pannelli; tocca la piccola sfera luminosa per ripristinarli</div></div>
    <p>Attiva il tracciamento delle mani nelle impostazioni del visore. La disponibilità dipende dal dispositivo e dal browser. Con i controller, usa il tasto di presa per afferrare la mappa. Puoi uscire anche dal menu di sistema del visore.</p>
    <p id="xr-status" role="status">${status}</p><button class="focus-button" data-action="start-vr" ${supported ? '' : 'disabled'}>${icon('glasses')}Entra nell’atlante VR</button>`;
}

function openVR() { openModal('vr', 'L’universo, tra le tue mani', vrContent()); }

async function checkVR() {
  try { xrSupported = Boolean(window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch { xrSupported = false; }
  xrChecked = true;
  if ($('#modal').open && $('#modal').dataset.kind === 'vr') {
    $('#modal-body').innerHTML = vrContent();
    refreshIcons();
  }
}

async function startVR(button) {
  if (!universe || !xrSupported) return;
  button.disabled = true;
  try {
    const started = await universe.enterVR();
    if (started) closeModal();
    else notify('La sessione VR non è stata avviata. Controlla il visore.');
  } catch (error) {
    notify(error?.message || 'Impossibile avviare la sessione VR.');
  } finally {
    button.disabled = false;
  }
}

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
  if (button.dataset.catalogFilter) {
    planetBrowser.filter = button.dataset.catalogFilter;
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
    const object = index === 5 ? findPlanet(button.dataset.object) : catalog[scales[index]?.id]?.find(item => item.id === button.dataset.object);
    if (object) pickObject(index, object);
    return;
  }
  switch (button.dataset.action) {
    case 'explore': closeModal(); $('#universe').focus(); break;
    case 'collections': openCollections(); break;
    case 'planets': openPlanets(); break;
    case 'constellations': await openConstellations(); break;
    case 'constellation-observer': await openConstellations({ observer: true }); break;
    case 'cosmic-scales': changeScale(1); break;
    case 'apply-observer': await selectConstellation(constellationBrowser.id); break;
    case 'observer-now':
      $('#observer-datetime').value = localDateInput(new Date().toISOString());
      $('#observer-datetime').setCustomValidity('');
      break;
    case 'about': openAbout(); break;
    case 'search': openSearch(); break;
    case 'help': openHelp(); break;
    case 'settings': openSettings(); break;
    case 'vr': openVR(); break;
    case 'start-vr': await startVR(button); break;
    case 'close': closeModal(); break;
    case 'zoom-in': universe?.zoom(0.8); break;
    case 'zoom-out': universe?.zoom(1.25); break;
    case 'reset': universe?.resetView(); notify('La rotta è di nuovo al centro.'); break;
    case 'rotate': setRotation(!state.autoRotate); break;
    case 'settings-rotate': setRotation(!state.autoRotate); button.setAttribute('aria-checked', state.autoRotate); break;
    case 'cinema': toggleCinematic(); break;
    case 'sound': await toggleSound(); break;
    case 'tour': toggleTour(); break;
    case 'object': openModal('object', 'Nel tuo campo visivo', objectMarkup(state.object, true)); break;
    case 'focus':
      if (Number.isInteger(state.object.targetScale)) changeScale(state.object.targetScale);
      else { universe?.focusObject(state.object); notify(`Rotta verso ${state.object.name}.`); }
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
    if (state.cinematic) setCinematic(false);
    if (immersionTimer) { clearTimeout(immersionTimer); immersionTimer = null; $('.toast').classList.remove('visible'); }
    stopTour();
    return;
  }
  if (event.target.matches('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey || $('#modal').open) return;
  if (event.key === '/') { event.preventDefault(); openSearch(); }
  else if (/^[1-5]$/.test(event.key)) { event.preventDefault(); changeScale(Number(event.key) - 1); }
  else if (event.key.toLowerCase() === 'r') { universe?.resetView(); }
  else if (event.code === 'Space' && !event.target.closest('button, a')) { event.preventDefault(); setRotation(!state.autoRotate); }
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
    onImmersiveChange: setCinematic
  });
  ['labels','grid','particles'].forEach(name => universe.setLayer(name, state[name]));
  universe.setAutoRotate(state.autoRotate);
  universe.setQuality(state.quality);
} catch (error) {
  console.error('Aether renderer:', error);
  $('#renderer-status').textContent = 'CATALOGO DISPONIBILE';
  const fallback = document.createElement('div');
  fallback.className = 'webgl-error';
  fallback.setAttribute('role','alert');
  fallback.innerHTML = '<strong>Il cielo 3D non è disponibile.</strong><p>Attiva l’accelerazione grafica del browser e ricarica la pagina. Puoi già esplorare gli oggetti e le fonti dal catalogo.</p><button class="focus-button" data-action="search">Apri il catalogo</button>';
  $('.app-shell').append(fallback);
  document.querySelectorAll('[data-action="zoom-in"],[data-action="zoom-out"],[data-action="reset"],[data-action="rotate"]').forEach(button => { button.disabled = true; });
}
requestAnimationFrame(() => requestAnimationFrame(() => {
  $('.loading').classList.add('done');
  setTimeout(() => $('.loading')?.remove(), 650);
}));
checkVR();
