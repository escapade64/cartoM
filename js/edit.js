import { POINTS } from './points.js';

const DEFAULT_TIDE_SOURCE = 'data/tidedata.json';
const DEFAULT_CENTER = [48.85, -3.0];

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
function uniqueIds(rows) {
  const used = new Map();
  return rows.map((row) => {
    const base = slugify(row.name);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}

function formatPointsFile(rows) {
  const ids = uniqueIds(rows);
  const entries = rows
    .map((row, i) => {
      const threshold = Number.isFinite(row.thresholdMin) ? row.thresholdMin : 0;
      return `  {
    id: '${ids[i]}',
    name: ${JSON.stringify(row.name || '')},
    lat: ${row.lat},
    lon: ${row.lon},
    tideSource: ${JSON.stringify(row.tideSource || DEFAULT_TIDE_SOURCE)},
    thresholdMin: ${threshold}, // mètres
    notes: ${JSON.stringify(row.notes || '')},
  },`;
    })
    .join('\n');

  return `// Configuration des points de passage.
// Peut être éditée à la main (dupliquer un objet ci-dessous) ou régénérée
// depuis edit.html (clic sur la carte + tableau), puis collée ici.

const POINTS = [
${entries}
];

export { POINTS };
`;
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

L.control
  .layers({ 'Photos aériennes à marée basse (2011-2014)': ortholittorale, 'Plan (OpenStreetMap)': osm })
  .addTo(map);

const tbody = document.getElementById('points-tbody');
const rows = [];

function fitToRows() {
  if (rows.length === 0) {
    map.setView(DEFAULT_CENTER, 12);
    return;
  }
  const bounds = L.latLngBounds(rows.map((r) => [r.lat, r.lon]));
  map.fitBounds(bounds.pad(0.3), { maxZoom: 15 });
}

function createRow(point, { focusName = false } = {}) {
  const row = {
    name: point.name || '',
    lat: point.lat,
    lon: point.lon,
    thresholdMin: point.thresholdMin ?? 0,
    notes: point.notes || '',
    tideSource: point.tideSource || DEFAULT_TIDE_SOURCE,
  };

  const marker = L.marker([row.lat, row.lon], { draggable: true }).addTo(map);
  marker.bindTooltip(() => row.name || 'Nouveau point');

  const tr = document.createElement('tr');

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = row.name;
  nameInput.placeholder = 'Nom du point';
  nameInput.addEventListener('input', () => {
    row.name = nameInput.value;
  });

  const latInput = document.createElement('input');
  latInput.type = 'number';
  latInput.step = 'any';
  latInput.value = row.lat;
  latInput.addEventListener('change', () => {
    const v = parseFloat(latInput.value);
    if (Number.isFinite(v)) {
      row.lat = v;
      marker.setLatLng([row.lat, row.lon]);
    }
  });

  const lonInput = document.createElement('input');
  lonInput.type = 'number';
  lonInput.step = 'any';
  lonInput.value = row.lon;
  lonInput.addEventListener('change', () => {
    const v = parseFloat(lonInput.value);
    if (Number.isFinite(v)) {
      row.lon = v;
      marker.setLatLng([row.lat, row.lon]);
    }
  });

  const thresholdInput = document.createElement('input');
  thresholdInput.type = 'number';
  thresholdInput.step = '0.01';
  thresholdInput.value = row.thresholdMin;
  thresholdInput.addEventListener('input', () => {
    const v = parseFloat(thresholdInput.value);
    row.thresholdMin = Number.isFinite(v) ? v : 0;
  });

  const notesInput = document.createElement('input');
  notesInput.type = 'text';
  notesInput.value = row.notes;
  notesInput.addEventListener('input', () => {
    row.notes = notesInput.value;
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Supprimer ce point';
  deleteBtn.addEventListener('click', () => {
    map.removeLayer(marker);
    const idx = rows.indexOf(row);
    if (idx !== -1) rows.splice(idx, 1);
    tr.remove();
  });

  marker.on('dragend', () => {
    const { lat, lng } = marker.getLatLng();
    row.lat = lat;
    row.lon = lng;
    latInput.value = lat.toFixed(6);
    lonInput.value = lng.toFixed(6);
  });

  for (const cell of [nameInput, latInput, lonInput, thresholdInput, notesInput]) {
    const td = document.createElement('td');
    td.appendChild(cell);
    tr.appendChild(td);
  }
  const actionTd = document.createElement('td');
  actionTd.appendChild(deleteBtn);
  tr.appendChild(actionTd);

  tbody.appendChild(tr);
  rows.push(row);

  if (focusName) nameInput.focus();
}

for (const point of POINTS) {
  createRow(point);
}
fitToRows();

map.on('click', (e) => {
  createRow(
    { name: '', lat: e.latlng.lat, lon: e.latlng.lng, thresholdMin: 0, notes: '' },
    { focusName: true }
  );
});

const exportBtn = document.getElementById('export-btn');
const exportPanel = document.getElementById('export-panel');
const exportText = document.getElementById('export-text');
const copyBtn = document.getElementById('copy-btn');
const downloadLink = document.getElementById('download-link');
const closeExportBtn = document.getElementById('close-export-btn');

exportBtn.addEventListener('click', () => {
  const content = formatPointsFile(rows);
  exportText.value = content;
  const blob = new Blob([content], { type: 'text/javascript' });
  downloadLink.href = URL.createObjectURL(blob);
  exportPanel.hidden = false;
  exportText.focus();
  exportText.select();
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportText.value);
    copyBtn.textContent = 'Copié !';
    setTimeout(() => {
      copyBtn.textContent = 'Copier';
    }, 1500);
  } catch {
    exportText.select();
  }
});

closeExportBtn.addEventListener('click', () => {
  exportPanel.hidden = true;
});
