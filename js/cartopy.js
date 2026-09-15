// CartoPy : carte des repères de randonnée en montagne (Pyrénées). Mêmes
// bases techniques que CartoM (Leaflet, données statiques éditables via une
// page d'édition dédiée) mais domaine différent : pas de marée ici.

import { CARTOPY_POINTS } from './cartopy-data.js';
import { CATEGORIES, CATEGORY_ORDER } from './cartopy-categories.js';
import { CARTOPY_SEGMENTS } from './cartopy-segments.js';

const DEFAULT_CENTER = [42.9, -0.3]; // Pyrénées centrales
const DEFAULT_ZOOM = 9;

// Emprise approximative des Pyrénées, pour ignorer les quelques repères hors
// zone (ex. lieux de prière relevés ailleurs) dans le calcul du cadrage
// initial — ils restent affichés sur la carte, juste pas pris en compte ici.
const PYRENEES_BOUNDS = { minLat: 42, maxLat: 43.6, minLon: -2.2, maxLon: 2.2 };
function isInPyrenees(p) {
  return p.lat >= PYRENEES_BOUNDS.minLat && p.lat <= PYRENEES_BOUNDS.maxLat && p.lon >= PYRENEES_BOUNDS.minLon && p.lon <= PYRENEES_BOUNDS.maxLon;
}

const map = L.map('map');

const opentopomap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  subdomains: 'abc',
  attribution:
    'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
});

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
});

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

function categoryIcon(category) {
  const cfg = CATEGORIES[category] || { color: '#5f6368', badge: '?' };
  return L.divIcon({
    className: 'cartopy-marker',
    html: `<span style="background:${cfg.color}">${cfg.badge}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

const layerGroups = {};
for (const category of CATEGORY_ORDER) layerGroups[category] = L.layerGroup();

for (const point of CARTOPY_POINTS) {
  const group = layerGroups[point.category];
  if (!group) continue;
  const marker = L.marker([point.lat, point.lon], { icon: categoryIcon(point.category) });
  const title = point.name || '(sans nom)';
  const altitude = Number.isFinite(point.altitude) ? `<br>Altitude : ${point.altitude} m` : '';
  marker.bindPopup(`<strong>${title}</strong>${altitude}${point.notes ? `<br>${point.notes}` : ''}`);
  marker.addTo(group);
}

for (const category of CATEGORY_ORDER) layerGroups[category].addTo(map);

// Segments : liens indicatifs (trait droit) entre deux points, avec distance/dénivelé.
const pointById = new Map(CARTOPY_POINTS.map((p) => [p.id, p]));
const segmentsGroup = L.layerGroup();
for (const seg of CARTOPY_SEGMENTS) {
  const from = pointById.get(seg.fromId);
  const to = pointById.get(seg.toId);
  if (!from || !to) continue;
  const line = L.polyline(
    [
      [from.lat, from.lon],
      [to.lat, to.lon],
    ],
    { color: '#c2410c', weight: 3, opacity: 0.85, dashArray: '8 6' }
  );
  const details = [
    Number.isFinite(seg.distanceKm) ? `${seg.distanceKm} km` : null,
    Number.isFinite(seg.dPlus) ? `D+ ${seg.dPlus} m` : null,
    Number.isFinite(seg.dMinus) ? `D- ${seg.dMinus} m` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  line.bindPopup(
    `<strong>${seg.name || '(sans nom)'}</strong><br>${from.name || '?'} → ${to.name || '?'}${details ? `<br>${details}` : ''}${seg.notes ? `<br>${seg.notes}` : ''}`
  );
  line.addTo(segmentsGroup);
}
segmentsGroup.addTo(map);

const overlays = {};
for (const category of CATEGORY_ORDER) {
  const cfg = CATEGORIES[category];
  const count = CARTOPY_POINTS.filter((p) => p.category === category).length;
  overlays[`<span class="legend-swatch" style="background:${cfg.color}"></span>${cfg.label} (${count})`] =
    layerGroups[category];
}
overlays[`<span class="legend-swatch" style="background:#c2410c"></span>Segments (${CARTOPY_SEGMENTS.length})`] =
  segmentsGroup;

L.control
  .layers({ 'Plan topo (OpenTopoMap)': opentopomap, 'Plan (OpenStreetMap)': osm }, overlays)
  .addTo(map);

const pointsForFit = CARTOPY_POINTS.filter(isInPyrenees);
if (pointsForFit.length > 0) {
  map.fitBounds(L.latLngBounds(pointsForFit.map((p) => [p.lat, p.lon])).pad(0.1));
} else {
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
}
updateBaseLayer();
