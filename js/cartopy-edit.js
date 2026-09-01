import { CARTOPY_POINTS } from './cartopy-data.js';
import { CATEGORIES, CATEGORY_ORDER } from './cartopy-categories.js';

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

function formatCartopyDataFile(items) {
  const ids = uniqueIds(items);
  const entries = items
    .map((item, i) => {
      const name = (item.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const notes = (item.notes || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `  { id: '${ids[i]}', category: '${item.category}', name: '${name}', lat: ${item.lat}, lon: ${item.lon}, notes: '${notes}' },`;
    })
    .join('\n');

  return `// Données CartoPy : repères pour la randonnée en montagne (Pyrénées).
// Chaque entrée : { id, category, name, lat, lon, notes }.
// category : 'parking' | 'col' | 'sommet' | 'refuge' | 'cabane' | 'priere'.
// Éditable à la main ou depuis cartopy-edit.html.

const CARTOPY_POINTS = [
${entries}
];

export { CARTOPY_POINTS };
`;
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
}).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
});

L.control.layers({ 'Plan topo (OpenTopoMap)': opentopomap, 'Plan (OpenStreetMap)': osm }).addTo(map);

// --- Données ---
const cartopyData = CARTOPY_POINTS.map((p) => ({ ...p }));

// --- État d'interaction ---
// uiState.mode : 'idle' | 'picking-category' | 'edit-item'
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
    if (uiState.mode === 'edit-item' && uiState.item === item) renderEditor();
  });
  item._marker = marker;
}

for (const item of cartopyData) createItemMarker(item);

const pointsForFit = cartopyData.filter(isInPyrenees);
if (pointsForFit.length > 0) {
  map.fitBounds(L.latLngBounds(pointsForFit.map((p) => [p.lat, p.lon])).pad(0.1));
} else {
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
}

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

function deleteItem(item) {
  map.removeLayer(item._marker);
  const idx = cartopyData.indexOf(item);
  if (idx !== -1) cartopyData.splice(idx, 1);
  markDirty();
  uiState = { mode: 'idle' };
  renderEditor();
}

// --- Nouveau repère (clic dans le vide) ---

function createNewItem(category) {
  const latlng = uiState.latlng;
  if (pendingMarker) {
    map.removeLayer(pendingMarker);
    pendingMarker = null;
  }
  const item = { category, name: '', lat: latlng.lat, lon: latlng.lng, notes: '' };
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

function renderEditor() {
  editorPanel.innerHTML = '';
  let nodes = [];

  if (uiState.mode === 'idle') {
    nodes = [
      el('p', {
        textContent: "Clique sur un repère de la carte pour l'éditer, ou sur un endroit vide pour en créer un nouveau.",
      }),
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

publishAllBtn.addEventListener('click', async () => {
  publishAllBtn.disabled = true;
  publishAllStatus.textContent = 'Publication de cartopy-data.js…';
  try {
    const content = formatCartopyDataFile(cartopyData);
    await publishFile('js/cartopy-data.js', content, 'Édition cartopy-data.js depuis cartopy-edit.html');
    publishAllStatus.textContent = 'cartopy-data.js ✓';
    clearDirty();
  } catch (err) {
    publishAllStatus.textContent = `cartopy-data.js ✗ (${err.message})`;
  }
  publishAllBtn.disabled = false;
});
