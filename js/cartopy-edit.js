import { CARTOPY_POINTS } from './cartopy-data.js';
import { CATEGORIES, CATEGORY_ORDER } from './cartopy-categories.js';
import { CARTOPY_SEGMENTS } from './cartopy-segments.js';

const DEFAULT_CENTER = [42.9, -0.3];
const DEFAULT_ZOOM = 9;

// Emprise approximative des Pyrénées, pour ignorer les quelques repères hors
// zone (ex. lieux de prière relevés ailleurs) dans le calcul du cadrage
// initial — ils restent affichés sur la carte, juste pas pris en compte ici.
const PYRENEES_BOUNDS = { minLat: 42, maxLat: 43.6, minLon: -2.2, maxLon: 2.2 };
function isInPyrenees(p) {
  return p.lat >= PYRENEES_BOUNDS.minLat && p.lat <= PYRENEES_BOUNDS.maxLat && p.lon >= PYRENEES_BOUNDS.minLon && p.lon <= PYRENEES_BOUNDS.maxLon;
}

const GITHUB_OWNER = 'escapade64';
const GITHUB_REPO = 'cartoM';
const GITHUB_BRANCH = 'main';
const TOKEN_STORAGE_KEY = 'cartom-edit-gh-token'; // partagé avec edit.html (même dépôt, même jeton)

const FIELD_DEFS = [
  { key: 'name', label: 'Nom', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'text' },
];

function slugify(name) {
  const base = (name || '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'point';
}

// Les segments référencent les points par id : contrairement aux autres
// données CartoM (où l'id est régénéré à chaque export depuis le nom), l'id
// d'un point CartoPy est fixé une fois à sa création et ne change plus,
// même si le nom est modifié ensuite — sinon un renommage casserait
// silencieusement les segments qui pointent vers lui.
function uniqueId(base, existingIds) {
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  existingIds.add(id);
  return id;
}

function formatCartopyDataFile(items) {
  const entries = items
    .map((item) => {
      const name = (item.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const notes = (item.notes || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const altitude = Number.isFinite(item.altitude) ? ` altitude: ${item.altitude},` : '';
      return `  { id: '${item.id}', category: '${item.category}', name: '${name}',${altitude} lat: ${item.lat}, lon: ${item.lon}, notes: '${notes}' },`;
    })
    .join('\n');

  return `// Données CartoPy : repères pour la randonnée en montagne (Pyrénées).
// Chaque entrée : { id, category, name, altitude?, lat, lon, notes }.
// id : stable, ne pas régénérer depuis le nom (référencé par cartopy-segments.js).
// altitude (m, optionnelle) : récupérée via l'API d'altitude d'Open-Meteo
// depuis cartopy-edit.html, ou renseignée à la main.
// category : 'parking' | 'col' | 'sommet' | 'refuge' | 'cabane' | 'bivouac' | 'priere'.
// Éditable à la main ou depuis cartopy-edit.html.

const CARTOPY_POINTS = [
${entries}
];

export { CARTOPY_POINTS };
`;
}

function formatCartopySegmentsFile(segments) {
  const entries = segments
    .map((seg) => {
      const id = seg.id;
      const name = (seg.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const notes = (seg.notes || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const distance = Number.isFinite(seg.distanceKm) ? seg.distanceKm : 'null';
      const dPlus = Number.isFinite(seg.dPlus) ? seg.dPlus : 'null';
      const dMinus = Number.isFinite(seg.dMinus) ? seg.dMinus : 'null';
      return `  { id: '${id}', name: '${name}', fromId: '${seg.fromId}', toId: '${seg.toId}', distanceKm: ${distance}, dPlus: ${dPlus}, dMinus: ${dMinus}, notes: '${notes}' },`;
    })
    .join('\n');

  return `// Segments CartoPy : relient deux points (voir cartopy-data.js) sans tracé
// précis, avec les infos connues du terrain (distance, dénivelé).
// Chaque entrée : { id, name, fromId, toId, distanceKm, dPlus, dMinus, notes }.
// fromId/toId référencent l'id (stable) d'un point de cartopy-data.js.
// Éditable à la main ou depuis cartopy-edit.html.

const CARTOPY_SEGMENTS = [
${entries}
];

export { CARTOPY_SEGMENTS };
`;
}

// IGN RGE ALTI (1-5 m, LIDAR/photogrammétrie française) : bien plus précis
// que les modèles globaux, mais ne couvre que le territoire français — les
// Pyrénées espagnoles/andorranes (ex. Aneto) retombent sur Open-Meteo
// (Copernicus DEM 90 m, la même source qu'avant, beaucoup moins précise en
// relief marqué).
const IGN_ELEVATION_API = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const OPEN_METEO_ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';

async function fetchElevationIGN(lat, lon) {
  const resp = await fetch(`${IGN_ELEVATION_API}?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&indent=false`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const z = data.elevations && data.elevations[0] && data.elevations[0].z;
  if (typeof z !== 'number' || z <= -9999) return null; // hors couverture France
  return Math.round(z * 10) / 10;
}

async function fetchElevationOpenMeteo(lat, lon) {
  const resp = await fetch(`${OPEN_METEO_ELEVATION_API}?latitude=${lat}&longitude=${lon}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const value = data.elevation && data.elevation[0];
  if (typeof value !== 'number') throw new Error('réponse inattendue');
  return Math.round(value);
}

async function fetchElevation(lat, lon) {
  try {
    const ign = await fetchElevationIGN(lat, lon);
    if (ign !== null) return { value: ign, source: 'IGN RGE ALTI (précis)' };
  } catch (err) {
    // IGN indisponible (réseau, hors service...) : on retente avec Open-Meteo.
  }
  const value = await fetchElevationOpenMeteo(lat, lon);
  return { value, source: 'Open-Meteo (estimation, hors France ou IGN indisponible)' };
}

function coloredIcon(color, badge) {
  return L.divIcon({
    className: 'cartopy-edit-marker',
    html: `<span style="background:${color}">${badge || ''}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

const map = L.map('map');

const opentopomap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  subdomains: 'abc',
  attribution:
    'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
});

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
});

L.control.layers({ 'Plan topo (OpenTopoMap)': opentopomap, 'Plan (OpenStreetMap)': osm }).addTo(map);

// Bascule automatique de fond de carte selon le zoom : OpenStreetMap à
// fort dézoom (rendu OpenTopoMap peu lisible sur une grande étendue),
// OpenTopoMap à partir d'un zoom "randonnée" (courbes de niveau utiles).
const BASE_LAYER_SWITCH_ZOOM = 12;
let currentBase = null;
function updateBaseLayer() {
  const wanted = map.getZoom() >= BASE_LAYER_SWITCH_ZOOM ? opentopomap : osm;
  if (currentBase === wanted) return;
  if (currentBase) map.removeLayer(currentBase);
  wanted.addTo(map);
  currentBase = wanted;
}
map.on('zoomend', updateBaseLayer);
map.on('baselayerchange', (e) => {
  currentBase = e.layer;
});

// --- Données ---
const cartopyData = CARTOPY_POINTS.map((p) => ({ ...p }));
const segmentsData = CARTOPY_SEGMENTS.map((s) => ({ ...s }));

const usedPointIds = new Set(cartopyData.map((p) => p.id));
const usedSegmentIds = new Set(segmentsData.map((s) => s.id).filter(Boolean));
function pointById(id) {
  return cartopyData.find((p) => p.id === id);
}
function segmentsReferencing(pointId) {
  return segmentsData.filter((s) => s.fromId === pointId || s.toId === pointId);
}

// --- État d'interaction ---
// uiState.mode : 'idle' | 'picking-category' | 'edit-item' | 'edit-segment'
let uiState = { mode: 'idle' };
let pendingMarker = null;

const editorPanel = document.getElementById('editor-panel');

// --- Suivi des modifications non publiées ---
let dirty = false;
function markDirty() {
  dirty = true;
  updateDirtyState();
}
function clearDirty() {
  dirty = false;
  updateDirtyState();
}
function updateDirtyState() {
  const btn = document.getElementById('publish-all-btn');
  if (btn) btn.classList.toggle('dirty', dirty);
}

function createItemMarker(item) {
  const cfg = CATEGORIES[item.category] || { color: '#5f6368', badge: '?' };
  const marker = L.marker([item.lat, item.lon], {
    draggable: true,
    icon: coloredIcon(cfg.color, cfg.badge),
  }).addTo(map);
  marker.bindTooltip(() => item.name || '(sans nom)');
  marker.on('click', () => selectItem(item));
  marker.on('dragend', () => {
    const { lat, lng } = marker.getLatLng();
    item.lat = lat;
    item.lon = lng;
    markDirty();
    for (const seg of segmentsReferencing(item.id)) updateSegmentLine(seg);
    if (uiState.mode === 'edit-item' && uiState.item === item) renderEditor();
  });
  item._marker = marker;
}

// --- Segments (liens abstraits entre 2 points, sans tracé précis) ---

function segmentLatLngs(seg) {
  const from = pointById(seg.fromId);
  const to = pointById(seg.toId);
  if (!from || !to) return null;
  return [
    [from.lat, from.lon],
    [to.lat, to.lon],
  ];
}

function createSegmentLine(seg) {
  const latlngs = segmentLatLngs(seg) || [];
  const line = L.polyline(latlngs, { color: '#c2410c', weight: 3, opacity: 0.85, dashArray: '8 6' }).addTo(map);
  line.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    selectSegment(seg);
  });
  seg._line = line;
}

function updateSegmentLine(seg) {
  const latlngs = segmentLatLngs(seg);
  if (latlngs) seg._line.setLatLngs(latlngs);
}

for (const item of cartopyData) createItemMarker(item);
for (const seg of segmentsData) createSegmentLine(seg);

const pointsForFit = cartopyData.filter(isInPyrenees);
if (pointsForFit.length > 0) {
  map.fitBounds(L.latLngBounds(pointsForFit.map((p) => [p.lat, p.lon])).pad(0.1));
} else {
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
}
updateBaseLayer();

// --- Sélection ---

function deselectCurrent() {
  if (uiState.mode === 'picking-category' && pendingMarker) {
    map.removeLayer(pendingMarker);
    pendingMarker = null;
  }
}

function selectItem(item) {
  deselectCurrent();
  uiState = { mode: 'edit-item', item };
  renderEditor();
}

function selectSegment(seg) {
  deselectCurrent();
  uiState = { mode: 'edit-segment', segment: seg };
  renderEditor();
}

function deleteItem(item) {
  const refs = segmentsReferencing(item.id);
  if (refs.length > 0) {
    const names = refs.map((s) => s.name || '(sans nom)').join(', ');
    alert(`Impossible de supprimer : ${refs.length} segment(s) relié(s) à ce point (${names}). Supprime d'abord ces segments.`);
    return;
  }
  map.removeLayer(item._marker);
  const idx = cartopyData.indexOf(item);
  if (idx !== -1) cartopyData.splice(idx, 1);
  usedPointIds.delete(item.id);
  markDirty();
  uiState = { mode: 'idle' };
  renderEditor();
}

function deleteSegment(seg) {
  map.removeLayer(seg._line);
  const idx = segmentsData.indexOf(seg);
  if (idx !== -1) segmentsData.splice(idx, 1);
  if (seg.id) usedSegmentIds.delete(seg.id);
  markDirty();
  uiState = { mode: 'idle' };
  renderEditor();
}

function createNewSegment() {
  if (cartopyData.length < 2) {
    alert('Il faut au moins 2 repères sur la carte pour créer un segment.');
    return;
  }
  deselectCurrent();
  const seg = {
    id: uniqueId(slugify(''), usedSegmentIds),
    name: '',
    fromId: cartopyData[0].id,
    toId: cartopyData[1].id,
    distanceKm: undefined,
    dPlus: undefined,
    dMinus: undefined,
    notes: '',
  };
  segmentsData.push(seg);
  createSegmentLine(seg);
  markDirty();
  selectSegment(seg);
}

// --- Nouveau repère (clic dans le vide) ---

function createNewItem(category) {
  const latlng = uiState.latlng;
  if (pendingMarker) {
    map.removeLayer(pendingMarker);
    pendingMarker = null;
  }
  const item = { id: uniqueId(slugify(''), usedPointIds), category, name: '', lat: latlng.lat, lon: latlng.lng, notes: '' };
  cartopyData.push(item);
  createItemMarker(item);
  markDirty();
  uiState = { mode: 'edit-item', item };
  renderEditor();
  editorPanel.querySelector('input')?.focus();
}

map.on('click', (e) => {
  deselectCurrent();
  pendingMarker = L.marker(e.latlng, { icon: coloredIcon('#5f6368', '?') }).addTo(map);
  uiState = { mode: 'picking-category', latlng: e.latlng };
  renderEditor();
});

// --- Rendu du panneau d'édition ---

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.appendChild(child);
  return node;
}

function renderItemForm(item) {
  const cfg = CATEGORIES[item.category];
  const nodes = [el('h2', { textContent: cfg ? cfg.label : item.category })];

  for (const field of FIELD_DEFS) {
    const input = el('input', { type: field.type, value: item[field.key] });
    input.addEventListener('input', () => {
      item[field.key] = input.value;
      markDirty();
      if (field.key === 'name') item._marker.setTooltipContent(input.value || '(sans nom)');
    });
    nodes.push(el('label', { textContent: field.label }, [input]));
  }

  const altInput = el('input', {
    type: 'number',
    step: '1',
    value: Number.isFinite(item.altitude) ? item.altitude : '',
    placeholder: 'non renseignée',
  });
  altInput.addEventListener('change', () => {
    const v = parseFloat(altInput.value);
    item.altitude = Number.isFinite(v) ? Math.round(v) : undefined;
    markDirty();
  });
  const altHint = el('p', {
    className: 'hint',
    textContent: item.altitudeSource ? `Source : ${item.altitudeSource}` : 'IGN (France) en priorité, Open-Meteo sinon.',
  });
  const altBtn = el('button', { type: 'button', textContent: '📍 Récupérer sur la carte' });
  altBtn.addEventListener('click', async () => {
    altBtn.disabled = true;
    altBtn.textContent = 'Récupération…';
    try {
      const { value, source } = await fetchElevation(item.lat, item.lon);
      item.altitude = value;
      item.altitudeSource = source;
      altInput.value = value;
      altHint.textContent = `Source : ${source}`;
      markDirty();
    } catch (err) {
      alert(`Altitude indisponible : ${err.message}`);
    }
    altBtn.disabled = false;
    altBtn.textContent = '📍 Récupérer sur la carte';
  });
  nodes.push(el('label', { textContent: 'Altitude (m)' }, [altInput]), altHint, altBtn);

  const deleteBtn = el('button', { type: 'button', className: 'delete-btn', textContent: 'Supprimer' });
  deleteBtn.addEventListener('click', () => deleteItem(item));
  const closeBtn = el('button', { type: 'button', textContent: 'Fermer' });
  closeBtn.addEventListener('click', () => {
    uiState = { mode: 'idle' };
    renderEditor();
  });
  nodes.push(el('div', { className: 'editor-actions' }, [deleteBtn, closeBtn]));

  return nodes;
}

function pointSelect(selectedId, onChange) {
  const select = el('select');
  for (const p of cartopyData) {
    const cfg = CATEGORIES[p.category];
    const opt = el('option', { value: p.id, textContent: `${cfg ? cfg.label : p.category} — ${p.name || '(sans nom)'}` });
    if (p.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function renderSegmentForm(seg) {
  const nodes = [el('h2', { textContent: 'Segment' })];

  const nameInput = el('input', { type: 'text', value: seg.name, placeholder: 'Nom du segment' });
  nameInput.addEventListener('input', () => {
    seg.name = nameInput.value;
    markDirty();
  });
  nodes.push(el('label', { textContent: 'Nom' }, [nameInput]));

  const fromSelect = pointSelect(seg.fromId, (id) => {
    seg.fromId = id;
    updateSegmentLine(seg);
    markDirty();
  });
  const toSelect = pointSelect(seg.toId, (id) => {
    seg.toId = id;
    updateSegmentLine(seg);
    markDirty();
  });
  nodes.push(el('label', { textContent: 'Départ' }, [fromSelect]), el('label', { textContent: 'Arrivée' }, [toSelect]));

  const numberField = (label, key) => {
    const input = el('input', { type: 'number', step: '0.01', value: Number.isFinite(seg[key]) ? seg[key] : '' });
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      seg[key] = Number.isFinite(v) ? v : undefined;
      markDirty();
    });
    return el('label', { textContent: label }, [input]);
  };
  nodes.push(numberField('Distance (km)', 'distanceKm'), numberField('D+ (m)', 'dPlus'), numberField('D- (m)', 'dMinus'));

  const notesInput = el('input', { type: 'text', value: seg.notes, placeholder: 'Notes' });
  notesInput.addEventListener('input', () => {
    seg.notes = notesInput.value;
    markDirty();
  });
  nodes.push(el('label', { textContent: 'Notes' }, [notesInput]));

  const deleteBtn = el('button', { type: 'button', className: 'delete-btn', textContent: 'Supprimer' });
  deleteBtn.addEventListener('click', () => deleteSegment(seg));
  const closeBtn = el('button', { type: 'button', textContent: 'Fermer' });
  closeBtn.addEventListener('click', () => {
    uiState = { mode: 'idle' };
    renderEditor();
  });
  nodes.push(el('div', { className: 'editor-actions' }, [deleteBtn, closeBtn]));

  return nodes;
}

function renderEditor() {
  editorPanel.innerHTML = '';
  let nodes = [];

  if (uiState.mode === 'idle') {
    const newSegmentBtn = el('button', { type: 'button', textContent: '+ Nouveau segment' });
    newSegmentBtn.addEventListener('click', createNewSegment);
    nodes = [
      el('p', {
        textContent: "Clique sur un repère ou un segment de la carte pour l'éditer, ou sur un endroit vide pour créer un repère.",
      }),
      newSegmentBtn,
    ];
  } else if (uiState.mode === 'picking-category') {
    const buttons = CATEGORY_ORDER.map((category) => {
      const btn = el('button', { type: 'button', textContent: CATEGORIES[category].label });
      btn.addEventListener('click', () => createNewItem(category));
      return btn;
    });
    const cancelBtn = el('button', { type: 'button', textContent: 'Annuler' });
    cancelBtn.addEventListener('click', () => {
      deselectCurrent();
      uiState = { mode: 'idle' };
      renderEditor();
    });
    nodes = [
      el('p', { textContent: 'Nouveau repère — quelle catégorie ?' }),
      el('div', { className: 'type-picker-buttons' }, buttons),
      cancelBtn,
    ];
  } else if (uiState.mode === 'edit-item') {
    nodes = renderItemForm(uiState.item);
  } else if (uiState.mode === 'edit-segment') {
    nodes = renderSegmentForm(uiState.segment);
  }

  for (const node of nodes) editorPanel.appendChild(node);
}

renderEditor();

// --- Jeton GitHub (stocké uniquement dans ce navigateur) ---

const tokenStatusEl = document.getElementById('token-status');
const tokenEditBtn = document.getElementById('token-edit-btn');

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function updateTokenStatus() {
  tokenStatusEl.textContent = getToken() ? 'Jeton GitHub : configuré' : 'Jeton GitHub : non configuré';
}

tokenEditBtn.addEventListener('click', () => {
  const next = prompt(
    'Colle ton jeton GitHub (fine-grained, permission "Contents: Read and write" sur ce dépôt uniquement).\n' +
      'Laisse vide et valide pour l’oublier.',
    getToken()
  );
  if (next === null) return;
  if (next.trim() === '') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } else {
    localStorage.setItem(TOKEN_STORAGE_KEY, next.trim());
  }
  updateTokenStatus();
});

updateTokenStatus();

// --- Publication directe sur GitHub (API contents) ---

async function publishFile(path, content, message) {
  const token = getToken();
  if (!token) {
    throw new Error('Jeton GitHub non configuré (bouton "Configurer" en haut de la page).');
  }
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

  const getResp = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
  if (!getResp.ok) {
    throw new Error(`Lecture du fichier actuel impossible (HTTP ${getResp.status}).`);
  }
  const current = await getResp.json();

  const putResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      sha: current.sha,
      branch: GITHUB_BRANCH,
    }),
  });
  if (!putResp.ok) {
    const err = await putResp.json().catch(() => ({}));
    throw new Error(err.message || `Échec de la publication (HTTP ${putResp.status}).`);
  }
}

const publishAllBtn = document.getElementById('publish-all-btn');
const publishAllStatus = document.getElementById('publish-all-status');

const EXPORTERS = {
  'cartopy-data.js': () => formatCartopyDataFile(cartopyData),
  'cartopy-segments.js': () => formatCartopySegmentsFile(segmentsData),
};

publishAllBtn.addEventListener('click', async () => {
  publishAllBtn.disabled = true;
  const results = [];
  for (const filename of Object.keys(EXPORTERS)) {
    publishAllStatus.textContent = `Publication de ${filename}…`;
    try {
      await publishFile(`js/${filename}`, EXPORTERS[filename](), `Édition ${filename} depuis cartopy-edit.html`);
      results.push(`${filename} ✓`);
    } catch (err) {
      results.push(`${filename} ✗ (${err.message})`);
    }
  }
  publishAllStatus.textContent = results.join(' · ');
  if (results.every((r) => r.includes('✓'))) clearDirty();
  publishAllBtn.disabled = false;
});
