// CartoPy : carte des repères de randonnée en montagne (Pyrénées). Mêmes
// bases techniques que CartoM (Leaflet, données statiques éditables via une
// page d'édition dédiée) mais domaine différent : pas de marée ici.

import { CARTOPY_POINTS } from './cartopy-data.js';
import { CATEGORIES, CATEGORY_ORDER } from './cartopy-categories.js';

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
}).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
  marker.bindPopup(`<strong>${title}</strong>${point.notes ? `<br>${point.notes}` : ''}`);
  marker.addTo(group);
}

for (const category of CATEGORY_ORDER) layerGroups[category].addTo(map);

const overlays = {};
for (const category of CATEGORY_ORDER) {
  const cfg = CATEGORIES[category];
  const count = CARTOPY_POINTS.filter((p) => p.category === category).length;
  overlays[`<span class="legend-swatch" style="background:${cfg.color}"></span>${cfg.label} (${count})`] =
    layerGroups[category];
}

L.control
  .layers({ 'Plan topo (OpenTopoMap)': opentopomap, 'Plan (OpenStreetMap)': osm }, overlays)
  .addTo(map);

const pointsForFit = CARTOPY_POINTS.filter(isInPyrenees);
if (pointsForFit.length > 0) {
  map.fitBounds(L.latLngBounds(pointsForFit.map((p) => [p.lat, p.lon])).pad(0.1));
} else {
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
}
