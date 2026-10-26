// Carte du formulaire « Mes sorties » : choisir un lieu CartoPy existant ou en créer un.
// Leaflet est chargé à la demande depuis vendor/ (même fichier que les cartes historiques).
import { CATEGORIES, CATEGORY_ORDER } from '../js/cartopy-categories.js';

const PYRENEES = { minLat: 42, maxLat: 43.6, minLon: -2.2, maxLon: 2.2 };
const DEFAULT_MOUNTAIN = { center: [42.9, -0.3], zoom: 9 };
const DEFAULT_SEA = { center: [43.45, -1.6], zoom: 10 }; // côte basque
const NO_ANIM = { animate: false };

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'vendor/leaflet/leaflet.js';
      js.onload = () => resolve(window.L);
      js.onerror = () => reject(new Error('Carte indisponible (Leaflet non chargé).'));
      document.head.appendChild(js);
    });
  }
  return leafletPromise;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function categoryLabel(category) {
  return CATEGORIES[category]?.label || category;
}

// options : { element, onPick(place|null), onEmptyClick(latlng) }
export async function createPlacePicker({ element, onPick, onEmptyClick }) {
  const L = await loadLeaflet();
  const map = L.map(element, { zoomControl: true, attributionControl: true });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    subdomains: 'abc',
    attribution: '© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)',
  });
  topo.addTo(map);
  map.setView(DEFAULT_MOUNTAIN.center, DEFAULT_MOUNTAIN.zoom);

  let places = [];
  let selectedId = null;
  const markers = new Map();
  const layer = L.layerGroup().addTo(map);
  let draft = null; // marqueur temporaire d'un lieu en cours de création

  function icon(place) {
    const cfg = CATEGORIES[place.category] || { color: '#5f6368', badge: '?' };
    const selected = place.id === selectedId;
    return L.divIcon({
      className: `cartopy-marker${selected ? ' is-selected' : ''}`,
      html: `<span style="background:${cfg.color}">${cfg.badge}</span>`,
      iconSize: selected ? [30, 30] : [22, 22],
      iconAnchor: selected ? [15, 15] : [11, 11],
    });
  }

  function render() {
    layer.clearLayers();
    markers.clear();
    for (const p of places) {
      const m = L.marker([p.lat, p.lon], { icon: icon(p), title: p.name, zIndexOffset: p.id === selectedId ? 1000 : 0 });
      m.bindTooltip(`${escapeHtml(p.name)} <small>(${escapeHtml(categoryLabel(p.category))})</small>`, { direction: 'top', offset: [0, -10] });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        clearDraft();
        select(p.id);
        onPick(p);
      });
      m.addTo(layer);
      markers.set(p.id, m);
    }
  }

  function select(id) {
    selectedId = id;
    render();
  }

  function clearDraft() {
    if (draft) {
      map.removeLayer(draft);
      draft = null;
    }
  }

  map.on('click', (e) => {
    clearDraft();
    draft = L.circleMarker(e.latlng, { radius: 9, color: '#d97706', weight: 3, fillOpacity: 0.3 }).addTo(map);
    onEmptyClick(e.latlng);
  });

  function inBounds(p, b) {
    return p.lat >= b.minLat && p.lat <= b.maxLat && p.lon >= b.minLon && p.lon <= b.maxLon;
  }

  return {
    setPlaces(list) {
      places = list.filter((p) => CATEGORY_ORDER.includes(p.category));
      render();
    },
    addPlace(place) {
      places.push(place);
      clearDraft();
      select(place.id);
    },
    select(id) {
      select(id);
    },
    selectedId: () => selectedId,
    clearDraft,
    // Centre la carte : sur le lieu choisi, sinon selon l'activité (mer ou montagne).
    // Sans animation : une animation de zoom en cours écraserait un recentrage suivant.
    focus(isSea) {
      map.invalidateSize();
      const sel = places.find((p) => p.id === selectedId);
      if (sel) return map.setView([sel.lat, sel.lon], Math.max(map.getZoom(), 13), NO_ANIM);
      const pool = isSea
        ? places.filter((p) => p.category === 'surf' || p.category === 'windsurf')
        : places.filter((p) => inBounds(p, PYRENEES) && p.category !== 'surf' && p.category !== 'windsurf');
      if (pool.length > 1) return map.fitBounds(L.latLngBounds(pool.map((p) => [p.lat, p.lon])).pad(0.15), NO_ANIM);
      if (pool.length === 1) return map.setView([pool[0].lat, pool[0].lon], 12, NO_ANIM);
      const d = isSea ? DEFAULT_SEA : DEFAULT_MOUNTAIN;
      return map.setView(d.center, d.zoom, NO_ANIM);
    },
    locate() {
      map.locate({ setView: true, maxZoom: 14 });
    },
    invalidate() {
      map.invalidateSize();
    },
  };
}
