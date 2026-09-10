import './style.css';
import { createIcons, Orbit, Search, Glasses, Maximize2, Minimize2, Plus, Minus, RotateCcw, Move, MousePointer2, Hand, Play, Pause, Volume2, VolumeX, Settings2, CircleHelp, X, ArrowUpRight, ArrowRight, Focus, Sparkles, Grid3X3, Tags, Compass, Layers, Info, Globe2, Star, Telescope, Check, ExternalLink } from 'lucide';
import { catalog, scales } from './data.js';
import { Universe } from './universe.js';

const icons = { Orbit, Search, Glasses, Maximize2, Minimize2, Plus, Minus, RotateCcw, Move, MousePointer2, Hand, Play, Pause, Volume2, VolumeX, Settings2, CircleHelp, X, ArrowUpRight, ArrowRight, Focus, Sparkles, Grid3X3, Tags, Compass, Layers, Info, Globe2, Star, Telescope, Check, ExternalLink };
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const $ = selector => document.querySelector(selector);
const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden':'true' } });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const preferences = (() => { try { return JSON.parse(localStorage.getItem('aether.preferences') || '{}') || {}; } catch { return {}; } })();
const state = {
  scale: 2, object: catalog.galaxy[0], labels: preferences.labels !== false,
  grid: preferences.grid !== false, particles: preferences.particles !== false,
  autoRotate: typeof preferences.autoRotate === 'boolean' ? preferences.autoRotate : !reducedMotion,
  quality: preferences.quality === 'low' ? 'low' : 'high',
  tour: false, sound: false, cinematic: false
};
let universe = null;
let tourTimer = null;
let toastTimer = null;
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
      <div class="top-actions"><span class="live"><span class="status-dot"></span><span id="renderer-status">UNIVERSO IN MOVIMENTO</span></span><button class="vr-button" data-action="vr">${icon('glasses')} Entra in VR</button></div>
    </header>
    <section class="intro" aria-label="Regione esplorata">
      <div class="eyebrow">UN VIAGGIO ATTRAVERSO L’INFINITO</div>
      <h1 id="scale-title">${scales[2].title}</h1>
      <div class="subtitle" id="scale-subtitle">${scales[2].subtitle}</div>
    </section>
    <aside class="left-panel" aria-label="Scala e livelli della mappa">
      <div class="section-heading">LA TUA PROSPETTIVA ${icon('layers')}</div>
      <div class="scale-list" role="group" aria-label="Seleziona la scala cosmica">
        ${scales.map((scale, i) => `<button class="scale-button${i === 2 ? ' active' : ''}" data-scale="${i}" aria-pressed="${i === 2}"><span class="node" aria-hidden="true"></span><span>${scale.short}<small>${scale.extent}</small></span><span class="number">0${i + 1}</span></button>`).join('')}
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
    <div class="center-caption" aria-hidden="true"><div class="galaxy-name" id="region-name">VIA LATTEA</div><div class="galaxy-type" id="region-type">GALASSIA A SPIRALE BARRATA</div></div>
    <div class="compass" aria-hidden="true"><small>N</small><span>✧</span></div>
    <div class="view-controls" role="group" aria-label="Controlli di visualizzazione">
      <button class="icon-button mobile-info" data-action="object" title="Informazioni sull’oggetto" aria-label="Informazioni sull’oggetto">${icon('info')}</button>
      <button class="icon-button" data-action="zoom-in" title="Avvicina" aria-label="Avvicina">${icon('plus')}</button>
      <button class="icon-button" data-action="zoom-out" title="Allontana" aria-label="Allontana">${icon('minus')}</button>
      <div class="separator"></div>
      <button class="icon-button" data-action="reset" title="Ripristina vista · R" aria-label="Ripristina vista">${icon('rotate-ccw')}</button>
      <button class="icon-button${state.autoRotate ? ' active' : ''}" data-action="rotate" aria-pressed="${state.autoRotate}" title="Rotazione automatica · Spazio" aria-label="Rotazione automatica">${icon('orbit')}</button>
      <button class="icon-button" data-action="cinema" title="Vista immersiva" aria-label="Vista immersiva">${icon('maximize-2')}</button>
    </div>
    <section class="bottom-panel" aria-label="Viaggio e scala">
      <div class="scale-readout"><div class="readout-title">SCALA DI RIFERIMENTO</div><div class="readout-value" id="scale-readout">${scales[2].extent}</div></div>
      <div class="journey">
        <div class="journey-top"><span>Ogni viaggio inizia con la curiosità.</span><small id="scale-step">03 / 05</small></div>
        <input id="scale-slider" type="range" min="0" max="4" step="1" value="2" aria-label="Scala cosmica" aria-valuetext="Via Lattea"/>
        <div class="journey-labels"><span>IL NOSTRO SISTEMA</span><span>L’UNIVERSO OSSERVABILE</span></div>
      </div>
      <div class="play-area"><button class="play-button" data-action="tour" aria-label="Avvia viaggio guidato" aria-pressed="false">${icon('play')}</button><div><strong id="tour-title">Lasciati trasportare</strong><small id="tour-caption">Inizia un viaggio guidato</small></div></div>
    </section>
    <footer class="footer">
      <div class="footer-controls"><span>${icon('mouse-pointer-2')} Trascina per orbitare</span><span>${icon('move')} Scroll per esplorare</span><span>${icon('hand')} Mani libere, in VR</span></div>
      <div class="footer-right"><span>ISPIRATO ALLA MERAVIGLIA. RADICATO NELLA SCIENZA.</span><button data-action="sound" aria-pressed="false" aria-label="Attiva suono ambiente">${icon('volume-x')}<span id="sound-label">Suono off</span></button><button data-action="settings" title="Impostazioni" aria-label="Impostazioni">${icon('settings-2')}</button><button data-action="help" title="Guida ai comandi" aria-label="Guida ai comandi">${icon('circle-help')}</button></div>
    </footer>
    <button class="exit-cinema" data-action="cinema">${icon('minimize-2')} Mostra interfaccia · Esc</button>
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
  const toast = $('.toast');
  toast.textContent = String(message);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}

function objectMarkup(object, isModal = false) {
  const scale = scales[state.scale];
  const isOverview = object.id === catalog[scale.id][0].id;
  const canDive = Number.isInteger(object.targetScale);
  const art = isModal ? '' : '<div class="galaxy-art" data-scene="' + scale.id + '" aria-hidden="true"></div>';
  return `<div class="card-top"><span>${isOverview ? 'TACCUINO DI ESPLORAZIONE' : 'OGGETTO CELESTE'}</span>${icon('sparkles')}</div>${art}
    <div class="card-content"><h2>${escape(object.name)}</h2><div class="object-type">${escape(object.type)}</div>
      <p class="card-description">${escape(object.detail)}</p>
      <div class="card-stats"><span>${isOverview ? escape(scale.metric) : 'DISTANZA / ESTENSIONE'}</span><strong>${escape(isOverview ? scale.count : object.distance)}</strong></div>
      ${isOverview ? `<div class="card-stats"><span>ESTENSIONE</span><strong>${escape(scale.extent)}</strong></div>` : ''}
      <button class="focus-button" data-action="focus">${icon(canDive ? 'arrow-right' : 'focus')}${canDive ? 'Esplora ' + escape(scales[object.targetScale].name) : 'Metti a fuoco'}</button>
      <a class="object-source" href="${escape(object.source || scale.source)}" target="_blank" rel="noopener noreferrer">Fonte scientifica ↗</a>
    </div>`;
}

function renderObject(object) {
  if (!object || !object.name) return;
  state.object = object;
  $('#object-card').innerHTML = objectMarkup(object);
  $('.coordinates').innerHTML = '<span>' + (['stars','local'].includes(scales[state.scale].id) ? 'J2000 · APPROSSIMATA' : 'VISTA SCHEMATICA') + '</span><span>ATLANTE COSMICO</span>';
  if ($('#modal').open && $('#modal').dataset.kind === 'object') $('#modal-body').innerHTML = objectMarkup(object, true);
  refreshIcons();
}

function updateScale(index) {
  index = Number(index);
  if (!Number.isInteger(index) || !scales[index]) return;
  state.scale = index;
  const scale = scales[index];
  $('#scale-title').textContent = scale.title;
  $('#scale-subtitle').textContent = scale.subtitle;
  $('#scale-readout').textContent = scale.extent;
  $('#scale-step').textContent = `0${index + 1} / 05`;
  $('#region-name').textContent = scale.name.toLocaleUpperCase('it-IT');
  $('#region-type').textContent = index === 4 ? 'RICOSTRUZIONE CONCETTUALE' : catalog[scale.id][0].type.toLocaleUpperCase('it-IT');
  const slider = $('#scale-slider');
  slider.value = index;
  slider.setAttribute('aria-valuetext', scale.name);
  slider.style.background = `linear-gradient(90deg,#ac8c5d ${index * 25}%,#37434a ${index * 25}%)`;
  document.querySelectorAll('[data-scale]').forEach(button => {
    const selected = Number(button.dataset.scale) === index;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected);
  });
  renderObject(catalog[scale.id][0]);
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
  if (index !== state.scale) changeScale(index);
  renderObject(object);
  universe?.selectObject(object);
  universe?.focusObject(object);
  closeModal();
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

function setCinematic(enabled) {
  state.cinematic = enabled;
  $('.app-shell').classList.toggle('cinematic', enabled);
  const selectors = '.topbar,.left-panel,.right-panel,.bottom-panel,.footer,.view-controls';
  document.querySelectorAll(selectors).forEach(element => { element.inert = enabled; });
  if (enabled) $('.exit-cinema').focus();
  else $('[data-action="cinema"]').focus();
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

const searchEntries = scales.flatMap((scale, index) => catalog[scale.id].map(object => ({ index, object, scale })));
function normalized(value) { return value.toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function renderSearch(query = '') {
  const needle = normalized(query.trim());
  const entries = searchEntries.filter(({ object, scale }) => normalized(`${object.name} ${object.type} ${scale.name}`).includes(needle)).slice(0, 24);
  $('#search-results').innerHTML = entries.length ? entries.map(({ object, index, scale }) => `<button class="search-result" data-object="${escape(object.id)}" data-object-scale="${index}"><span><strong>${escape(object.name)}</strong><small>${escape(scale.name)} · ${escape(object.type)}</small></span>${icon('arrow-up-right')}</button>`).join('') : '<p role="status">Nessun oggetto trovato. Prova “Terra”, “Sirio” o “Andromeda”.</p>';
  refreshIcons();
}

function openSearch() {
  openModal('search', 'Cerca nell’universo', '<label for="search-input" class="readout-title">STELLE, PIANETI E GALASSIE</label><input id="search-input" class="search-input" type="search" placeholder="Dove vuoi andare?" autocomplete="off" spellcheck="false" aria-controls="search-results"/><div id="search-results" class="search-results"></div>');
  renderSearch();
  $('#search-input').addEventListener('input', event => renderSearch(event.target.value));
  $('#search-input').focus();
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
    <p>Gli oggetti selezionabili sono reali; il catalogo è una selezione, non una rappresentazione completa di tutto l’universo conosciuto. Distanze e proprietà sono approssimate.</p>
    <p>Le distanze orbitali sono compresse e le dimensioni planetarie amplificate. Le stelle vicine usano coordinate equatoriali J2000 approssimate. La Via Lattea è una ricostruzione illustrativa; nel Gruppo Locale le dimensioni galattiche sono amplificate.</p>
    <p>La rete cosmica e le particelle decorative sono generate proceduralmente. Le posizioni dei suoi ammassi sono schematiche: non sono un catalogo osservativo. La navigazione collega cinque rappresentazioni con scale differenti.</p>
    <h3>STELLE DA CATALOGO</h3>
    <p>La vista stellare include 156 stelle entro 25 anni luce estratte da <a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener noreferrer">HYG 4.1 · David Nash</a>, oltre ai riferimenti principali. Il sottoinsieme conserva coordinate, distanze e identificatori: selezione, conversione in anni luce e nomi di visualizzazione sono adattamenti dell’atlante. Dati distribuiti con licenza <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.</p>
    <h3>FONTI E APPROFONDIMENTI</h3>
    <ul><li><a href="${scales[0].source}" target="_blank" rel="noopener noreferrer">NASA · Dimensioni e distanze del Sistema Solare</a></li>
    <li><a href="${scales[1].source}" target="_blank" rel="noopener noreferrer">NASA / Hubble · Proxima Centauri</a></li>
    <li><a href="${scales[2].source}" target="_blank" rel="noopener noreferrer">NASA · Galassie e Via Lattea</a></li>
    <li><a href="${scales[4].source}" target="_blank" rel="noopener noreferrer">NASA · L’universo osservabile</a></li></ul>`);
}

function openHelp() {
  openModal('help', 'Impara a navigare', `
    <div class="help-keys"><div><strong>Trascina</strong>Orbita intorno alla mappa</div><div><strong>Rotellina / due dita</strong>Avvicina e allontana</div><div><strong>Clic / tocco</strong>Seleziona un oggetto</div><div><strong>1 — 5</strong>Cambia scala cosmica</div><div><strong>/</strong>Cerca stelle e pianeti</div><div><strong>Spazio</strong>Ferma o riprendi la rotazione</div><div><strong>R</strong>Ripristina l’inquadratura</div><div><strong>Esc</strong>Chiudi finestre e vista immersiva</div></div>
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
    <div class="help-keys"><div><strong>Pizzico breve</strong>Seleziona un oggetto sulla mappa</div><div><strong>Pizzico mantenuto</strong>Sposta e ruota; con due mani cambia anche dimensione</div><div><strong>Controller · grilletto</strong>Seleziona un oggetto puntandolo</div><div><strong>Pannello nell’ologramma</strong>Cambia scala, ripristina la vista o esci</div></div>
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
  if (button.matches('a.brand')) { event.preventDefault(); closeModal(); changeScale(2); universe?.resetView(); return; }
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
  if (button.dataset.object) {
    const index = Number(button.dataset.objectScale);
    const object = catalog[scales[index].id].find(item => item.id === button.dataset.object);
    if (object) pickObject(index, object);
    return;
  }
  switch (button.dataset.action) {
    case 'explore': closeModal(); $('#universe').focus(); break;
    case 'collections': openCollections(); break;
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
    case 'cinema': setCinematic(!state.cinematic); break;
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
    stopTour();
    return;
  }
  if (event.target.matches('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey || $('#modal').open) return;
  if (event.key === '/') { event.preventDefault(); openSearch(); }
  else if (/^[1-5]$/.test(event.key)) { event.preventDefault(); changeScale(Number(event.key) - 1); }
  else if (event.key.toLowerCase() === 'r') { universe?.resetView(); }
  else if (event.code === 'Space' && !event.target.closest('button, a')) { event.preventDefault(); setRotation(!state.autoRotate); }
});
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
    onMessage: notify
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





