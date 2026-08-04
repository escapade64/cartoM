import { POINTS } from './points.js';
import { ROCKS } from './rocks.js';
import { LANDMARKS, DANGER_ZONES } from './landmarks.js';
import { NAV_LINES } from './navlines.js';

const DEFAULT_TIDE_SOURCE = 'data/tidedata.json';
const DEFAULT_CENTER = [48.85, -3.0];

const GITHUB_OWNER = 'escapade64';
const GITHUB_REPO = 'cartoM';
const GITHUB_BRANCH = 'main';
const TOKEN_STORAGE_KEY = 'cartom-edit-gh-token';

const MARKER_COLORS = {
  points: '#1a73e8',
  rocks: '#8d7355',
  landmarks: '#3a8fa3',
};

const TYPE_LABELS = {
  points: 'Point de passage',
  rocks: 'Rocher',
  landmarks: 'Point de repère',
};

const FIELD_DEFS = {
  points: [
    { key: 'name', label: 'Nom', type: 'text' },
    { key: 'thresholdMin', label: "Seuil (m)", type: 'number', step: '0.01' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ],
  rocks: [{ key: 'name', label: 'Nom', type: 'text' }],
  landmarks: [
    { key: 'name', label: 'Nom', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ],
};

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

// Génère des id uniques à partir des noms, en dédupliquant à l'export
// plutôt qu'en les stockant sur chaque ligne (évite le "churn" d'id pendant la saisie).
function uniqueIds(items) {
  const used = new Map();
  return items.map((item) => {
    const base = slugify(item.name);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}

function formatPointsFile(items) {
  const ids = uniqueIds(items);
  const entries = items
    .map((item, i) => {
      const threshold = Number.isFinite(item.thresholdMin) ? item.thresholdMin : 0;
      return `  {
    id: '${ids[i]}',
    name: ${JSON.stringify(item.name || '')},
    lat: ${item.lat},
    lon: ${item.lon},
    tideSource: ${JSON.stringify(item.tideSource || DEFAULT_TIDE_SOURCE)},
    thresholdMin: ${threshold}, // mètres
    notes: ${JSON.stringify(item.notes || '')},
  },`;
    })
    .join('\n');

  return `// Configuration des points de passage.
// Peut être éditée à la main (dupliquer un objet ci-dessous) ou régénérée
// depuis edit.html (clic sur la carte), puis collée ici.

const POINTS = [
${entries}
];

export { POINTS };
`;
}

function formatRocksFile(items) {
  const entries = items
    .map((item) => `  { name: ${JSON.stringify(item.name || '')}, lat: ${item.lat}, lon: ${item.lon} },`)
    .join('\n');
  return `// Rochers repérés (nom + position), issus d'un relevé terrain.
// Régénéré depuis edit.html, puis collé dans js/rocks.js.

const ROCKS = [
${entries}
];

export { ROCKS };
`;
}

function formatLandmarksFile(items) {
  const landmarkEntries = items
    .map(
      (item) =>
        `  { name: ${JSON.stringify(item.name || '')}, lat: ${item.lat}, lon: ${item.lon}, notes: ${JSON.stringify(item.notes || '')} },`
    )
    .join('\n');
  const zoneEntries = DANGER_ZONES.map((zone) => {
    const pathLines = zone.path.map(([lat, lon]) => `      [${lat}, ${lon}],`).join('\n');
    return `  {
    name: ${JSON.stringify(zone.name || '')},
    path: [
${pathLines}
    ],
  },`;
  }).join('\n');

  return `// Points de repère (plages, mouillages, lieux-dits) et zones de danger,
// issus d'un relevé terrain. Régénéré depuis edit.html, puis collé dans
// js/landmarks.js. (Les zones de danger ne sont pas éditables depuis cet
// outil ; reproduites telles quelles pour ne pas les perdre à l'export.)

const LANDMARKS = [
${landmarkEntries}
];

// Polygones de danger : { name, path: [[lat, lon], ...] }.
const DANGER_ZONES = [
${zoneEntries}
];

export { LANDMARKS, DANGER_ZONES };
`;
}

function formatNavlinesFile(lines) {
  const entries = lines
    .map((line) => {
      const pathLines = line.path.map(([lat, lon]) => `      [${lat}, ${lon}],`).join('\n');
      return `  {
    name: ${JSON.stringify(line.name || '')},
    notes: ${JSON.stringify(line.notes || '')},
    path: [
${pathLines}
    ],
  },`;
    })
    .join('\n');

  return `// Tracés de navigation (chenaux, passages, contournements) issus d'un relevé
// terrain. Chaque entrée : { name, notes, path: [[lat, lon], ...] }.
// Régénéré depuis edit.html, puis collé dans js/navlines.js.

const NAV_LINES = [
${entries}
];

export { NAV_LINES };
`;
}

function coloredIcon(color) {
  return L.divIcon({
    className: 'edit-marker',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function vertexIcon() {
  return coloredIcon('#f4511e');
}

const map = L.map('map');

const ortholittorale = L.tileLayer.wms('https://geolittoral.din.developpement-durable.gouv.fr/wxs', {
  layers: 'ortholittorale_v2_rvb',
  format: 'image/png',
  version: '1.3.0',
  maxZoom: 19,
  attribution: 'GéoLittoral / SHOM-IGN — orthophotos littorales 2011-2014 (marée basse)',
}).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
});

const seamarks = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>',
});

L.control
  .layers(
    { 'Photos aériennes à marée basse (2011-2014)': ortholittorale, 'Plan (OpenStreetMap)': osm },
    { 'Balisage marin (OpenSeaMap)': seamarks }
  )
  .addTo(map);

// --- Données (toutes catégories chargées et affichées ensemble) ---
const pointsData = POINTS.map((p) => ({ ...p }));
const rocksData = ROCKS.map((r) => ({ ...r }));
const landmarksData = LANDMARKS.map((l) => ({ ...l }));
const navlinesData = NAV_LINES.map((l) => ({ name: l.name, notes: l.notes || '', path: l.path.map(([lat, lon]) => [lat, lon]) }));

const STORES = { points: pointsData, rocks: rocksData, landmarks: landmarksData };

// --- État d'interaction ---
// uiState.mode : 'idle' | 'picking-type' | 'edit-item' | 'edit-navline' | 'drawing-navline'
let uiState = { mode: 'idle' };
let pendingMarker = null; // marqueur temporaire pendant le choix du type d'un nouveau point
let drawingPath = null; // sommets (L.LatLng) pendant la création d'une nouvelle ligne
let drawingPolyline = null;

const editorPanel = document.getElementById('editor-panel');

function createItemMarker(type, item) {
  const marker = L.marker([item.lat, item.lon], {
    draggable: true,
    icon: coloredIcon(MARKER_COLORS[type]),
  }).addTo(map);
  marker.bindTooltip(() => item.name || '(sans nom)');
  marker.on('click', () => {
    if (uiState.mode === 'drawing-navline') return;
    selectItem(type, item);
  });
  marker.on('dragend', () => {
    const { lat, lng } = marker.getLatLng();
    item.lat = lat;
    item.lon = lng;
    if (uiState.mode === 'edit-item' && uiState.item === item) renderEditor();
  });
  item._marker = marker;
}

function createNavlinePolyline(line) {
  const polyline = L.polyline(line.path, { color: '#f4511e', weight: 3, opacity: 0.85, dashArray: '6 4' }).addTo(
    map
  );
  polyline.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    if (uiState.mode === 'drawing-navline') return;
    selectNavline(line);
  });
  line._polyline = polyline;
  line._vertexMarkers = [];
}

for (const item of pointsData) createItemMarker('points', item);
for (const item of rocksData) createItemMarker('rocks', item);
for (const item of landmarksData) createItemMarker('landmarks', item);
for (const line of navlinesData) createNavlinePolyline(line);

// Même vue initiale que index.html, pour se retrouver directement en zone connue.
const initialPoint = pointsData.find((p) => p.id === 'mouillage-pescadou');
if (initialPoint) {
  map.setView([initialPoint.lat, initialPoint.lon], 15);
} else if (pointsData.length + rocksData.length + landmarksData.length + navlinesData.length > 0) {
  const allLatLngs = [
    ...pointsData.map((p) => [p.lat, p.lon]),
    ...rocksData.map((p) => [p.lat, p.lon]),
    ...landmarksData.map((p) => [p.lat, p.lon]),
    ...navlinesData.flatMap((l) => l.path),
  ];
  map.fitBounds(L.latLngBounds(allLatLngs).pad(0.1), { maxZoom: 15 });
} else {
  map.setView(DEFAULT_CENTER, 12);
}

// --- Sélection ---

function deselectCurrent() {
  if (uiState.mode === 'edit-navline') {
    clearVertices(uiState.line);
  }
  if (uiState.mode === 'picking-type' && pendingMarker) {
    map.removeLayer(pendingMarker);
    pendingMarker = null;
  }
}

function selectItem(type, item) {
  deselectCurrent();
  uiState = { mode: 'edit-item', type, item };
  renderEditor();
}

function selectNavline(line) {
  deselectCurrent();
  uiState = { mode: 'edit-navline', line, addingVertex: false };
  renderEditor();
  renderVertices(line);
}

function deleteItem(type, item) {
  map.removeLayer(item._marker);
  const arr = STORES[type];
  const idx = arr.indexOf(item);
  if (idx !== -1) arr.splice(idx, 1);
  uiState = { mode: 'idle' };
  renderEditor();
}

// --- Lignes de navigation : sommets ---

function clearVertices(line) {
  for (const vm of line._vertexMarkers) map.removeLayer(vm);
  line._vertexMarkers = [];
}

function renderVertices(line) {
  clearVertices(line);
  line.path.forEach((latlon, vi) => {
    const vm = L.marker(latlon, { draggable: true, icon: vertexIcon() }).addTo(map);
    vm.on('drag', () => {
      const { lat, lng } = vm.getLatLng();
      line.path[vi] = [lat, lng];
      line._polyline.setLatLngs(line.path);
    });
    vm.on('click', () => {
      if (line.path.length <= 2) {
        alert('Une ligne doit garder au moins 2 sommets.');
        return;
      }
      line.path.splice(vi, 1);
      line._polyline.setLatLngs(line.path);
      renderVertices(line);
      renderEditor();
    });
    line._vertexMarkers.push(vm);
  });
}

function deleteNavline(line) {
  map.removeLayer(line._polyline);
  clearVertices(line);
  const idx = navlinesData.indexOf(line);
  if (idx !== -1) navlinesData.splice(idx, 1);
  uiState = { mode: 'idle' };
  renderEditor();
}

// --- Nouvelle ligne (dessin) ---

function startNewNavline() {
  deselectCurrent();
  drawingPath = [];
  drawingPolyline = L.polyline([], { color: '#f4511e', weight: 3, dashArray: '4 4' }).addTo(map);
  uiState = { mode: 'drawing-navline' };
  renderEditor();
}

function cancelNewNavline() {
  if (drawingPolyline) map.removeLayer(drawingPolyline);
  drawingPath = null;
  drawingPolyline = null;
  uiState = { mode: 'idle' };
  renderEditor();
}

function finishNewNavline() {
  if (!drawingPath || drawingPath.length < 2) {
    alert('Il faut au moins 2 sommets pour créer une ligne.');
    return;
  }
  const line = { name: '', notes: '', path: drawingPath.map((ll) => [ll.lat, ll.lng]) };
  navlinesData.push(line);
  createNavlinePolyline(line);
  map.removeLayer(drawingPolyline);
  drawingPath = null;
  drawingPolyline = null;
  selectNavline(line);
  editorPanel.querySelector('input')?.focus();
}

// --- Nouveau point (clic dans le vide) ---

function createNewItem(type) {
  const latlng = uiState.latlng;
  if (pendingMarker) {
    map.removeLayer(pendingMarker);
    pendingMarker = null;
  }
  const item =
    type === 'points'
      ? { name: '', lat: latlng.lat, lon: latlng.lng, tideSource: DEFAULT_TIDE_SOURCE, thresholdMin: 0, notes: '' }
      : type === 'rocks'
        ? { name: '', lat: latlng.lat, lon: latlng.lng }
        : { name: '', lat: latlng.lat, lon: latlng.lng, notes: '' };
  STORES[type].push(item);
  createItemMarker(type, item);
  uiState = { mode: 'edit-item', type, item };
  renderEditor();
  editorPanel.querySelector('input')?.focus();
}

// --- Clic sur la carte ---

map.on('click', (e) => {
  if (uiState.mode === 'drawing-navline') {
    drawingPath.push(e.latlng);
    drawingPolyline.setLatLngs(drawingPath);
    renderEditor();
    return;
  }
  if (uiState.mode === 'edit-navline' && uiState.addingVertex) {
    uiState.line.path.push([e.latlng.lat, e.latlng.lng]);
    uiState.line._polyline.setLatLngs(uiState.line.path);
    renderVertices(uiState.line);
    renderEditor();
    return;
  }
  deselectCurrent();
  pendingMarker = L.marker(e.latlng, { icon: coloredIcon('#5f6368') }).addTo(map);
  uiState = { mode: 'picking-type', latlng: e.latlng };
  renderEditor();
});

// --- Rendu du panneau d'édition ---

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.appendChild(child);
  return node;
}

function renderItemForm(type, item) {
  const nodes = [el('h2', { textContent: TYPE_LABELS[type] })];

  for (const field of FIELD_DEFS[type]) {
    const input = el('input', { type: field.type, value: item[field.key] });
    if (field.step) input.step = field.step;
    if (field.type === 'number') {
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        item[field.key] = Number.isFinite(v) ? v : 0;
        if (field.key === 'lat' || field.key === 'lon') item._marker.setLatLng([item.lat, item.lon]);
      });
    } else {
      input.addEventListener('input', () => {
        item[field.key] = input.value;
      });
    }
    nodes.push(el('label', { textContent: field.label }, [input]));
  }

  const deleteBtn = el('button', { type: 'button', className: 'delete-btn', textContent: 'Supprimer' });
  deleteBtn.addEventListener('click', () => deleteItem(type, item));
  const closeBtn = el('button', { type: 'button', textContent: 'Fermer' });
  closeBtn.addEventListener('click', () => {
    uiState = { mode: 'idle' };
    renderEditor();
  });
  nodes.push(el('div', { className: 'editor-actions' }, [deleteBtn, closeBtn]));

  return nodes;
}

function renderNavlineForm(line) {
  const nameInput = el('input', { type: 'text', value: line.name, placeholder: 'Nom de la ligne' });
  nameInput.addEventListener('input', () => {
    line.name = nameInput.value;
  });
  const notesInput = el('input', { type: 'text', value: line.notes, placeholder: 'Notes' });
  notesInput.addEventListener('input', () => {
    line.notes = notesInput.value;
  });

  const addVertexBtn = el('button', {
    type: 'button',
    textContent: uiState.addingVertex ? 'Clique sur la carte…' : '+ Sommet',
    className: uiState.addingVertex ? 'active' : '',
  });
  addVertexBtn.addEventListener('click', () => {
    uiState.addingVertex = !uiState.addingVertex;
    renderEditor();
  });

  const deleteBtn = el('button', { type: 'button', className: 'delete-btn', textContent: 'Supprimer la ligne' });
  deleteBtn.addEventListener('click', () => deleteNavline(line));
  const closeBtn = el('button', { type: 'button', textContent: 'Fermer' });
  closeBtn.addEventListener('click', () => {
    clearVertices(line);
    uiState = { mode: 'idle' };
    renderEditor();
  });

  return [
    el('h2', { textContent: 'Ligne de navigation' }),
    el('label', { textContent: 'Nom' }, [nameInput]),
    el('label', { textContent: 'Notes' }, [notesInput]),
    el('p', { className: 'navline-meta', textContent: `${line.path.length} sommets` }),
    el('p', { className: 'hint', textContent: 'Glisse un sommet pour le déplacer, clique dessus pour le supprimer.' }),
    addVertexBtn,
    el('div', { className: 'editor-actions' }, [deleteBtn, closeBtn]),
  ];
}

function renderEditor() {
  editorPanel.innerHTML = '';
  let nodes = [];

  if (uiState.mode === 'idle') {
    const newLineBtn = el('button', { type: 'button', textContent: '+ Nouvelle ligne de navigation' });
    newLineBtn.addEventListener('click', startNewNavline);
    nodes = [
      el('p', {
        textContent: "Clique sur un élément de la carte pour l'éditer, ou sur un endroit vide pour en créer un nouveau.",
      }),
      newLineBtn,
    ];
  } else if (uiState.mode === 'picking-type') {
    const buttons = ['points', 'rocks', 'landmarks'].map((type) => {
      const btn = el('button', { type: 'button', textContent: TYPE_LABELS[type] });
      btn.addEventListener('click', () => createNewItem(type));
      return btn;
    });
    const cancelBtn = el('button', { type: 'button', textContent: 'Annuler' });
    cancelBtn.addEventListener('click', () => {
      deselectCurrent();
      uiState = { mode: 'idle' };
      renderEditor();
    });
    nodes = [
      el('p', { textContent: 'Nouvel élément — quel type ?' }),
      el('div', { className: 'type-picker-buttons' }, buttons),
      cancelBtn,
    ];
  } else if (uiState.mode === 'edit-item') {
    nodes = renderItemForm(uiState.type, uiState.item);
  } else if (uiState.mode === 'edit-navline') {
    nodes = renderNavlineForm(uiState.line);
  } else if (uiState.mode === 'drawing-navline') {
    const finishBtn = el('button', { type: 'button', textContent: 'Terminer la ligne' });
    finishBtn.addEventListener('click', finishNewNavline);
    const cancelBtn = el('button', { type: 'button', textContent: 'Annuler' });
    cancelBtn.addEventListener('click', cancelNewNavline);
    nodes = [
      el('p', { textContent: `Clique sur la carte pour poser les sommets (${drawingPath.length} posé(s)).` }),
      finishBtn,
      cancelBtn,
    ];
  }

  for (const node of nodes) editorPanel.appendChild(node);
}

renderEditor();

// --- Export ---

const EXPORTERS = {
  points: () => [formatPointsFile(pointsData), 'points.js'],
  rocks: () => [formatRocksFile(rocksData), 'rocks.js'],
  landmarks: () => [formatLandmarksFile(landmarksData), 'landmarks.js'],
  navlines: () => [formatNavlinesFile(navlinesData), 'navlines.js'],
};

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

// --- Publier tout (toujours accessible depuis l'en-tête, quel que soit le
// type d'élément modifié) ---

const publishAllBtn = document.getElementById('publish-all-btn');
const publishAllStatus = document.getElementById('publish-all-status');

publishAllBtn.addEventListener('click', async () => {
  publishAllBtn.disabled = true;
  const results = [];
  for (const key of Object.keys(EXPORTERS)) {
    const [content, filename] = EXPORTERS[key]();
    publishAllStatus.textContent = `Publication de ${filename}…`;
    try {
      await publishFile(`js/${filename}`, content, `Édition ${filename} depuis edit.html`);
      results.push(`${filename} ✓`);
    } catch (err) {
      results.push(`${filename} ✗ (${err.message})`);
    }
  }
  publishAllStatus.textContent = results.join(' · ');
  publishAllBtn.disabled = false;
});
