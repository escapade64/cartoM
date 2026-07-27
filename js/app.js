import { POINTS } from './points.js';
import { loadTideSeries, heightAt, statusAt, nextTransitions, dataRangeEndsWithin } from './tide.js';

const BREHAT_TIDE_SOURCE = 'data/tidedata.json';

const REFRESH_MS = 60 * 1000;
const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTime(ms) {
  return dateFmt.format(new Date(ms));
}

const STATUS_COLOR = { open: '#1e8e3e', closed: '#d93025', unknown: '#9aa0a6' };
const STATUS_LABEL = { open: 'Ouvert', closed: 'Fermé', unknown: 'Données indisponibles' };

function buildPopupHtml(point, info) {
  const { status, height } = info;
  const heightTxt = height === null ? '—' : `${height.toFixed(2)} m`;
  let transitionsHtml = '';
  if (status !== 'unknown') {
    const nextChange = info.transitions[0];
    if (nextChange) {
      const verb = nextChange.becomes === 'open' ? 'Ouverture' : 'Fermeture';
      transitionsHtml += `<div>${verb} prévue : <strong>${formatTime(nextChange.time)}</strong></div>`;
    }
    const following = info.transitions[1];
    if (following) {
      const verb = following.becomes === 'open' ? 'ouvrira' : 'fermera';
      transitionsHtml += `<div>Puis ${verb} à nouveau : <strong>${formatTime(following.time)}</strong></div>`;
    }
  }
  return `
    <div class="popup">
      <h3>${point.name}</h3>
      <div class="status-line" style="color:${STATUS_COLOR[status]}">
        ● ${STATUS_LABEL[status]}
      </div>
      <div>Hauteur d'eau actuelle : <strong>${heightTxt}</strong></div>
      <div>Seuil requis : <strong>${point.thresholdMin.toFixed(2)} m</strong></div>
      ${transitionsHtml}
      ${point.notes ? `<div class="notes">${point.notes}</div>` : ''}
    </div>
  `;
}

function showDataWarning(message) {
  const el = document.getElementById('data-warning');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

// Bouton "centrer sur ma position", basé sur l'API de géolocalisation native de
// Leaflet (map.locate) — pas de dépendance externe.
function addLocateControl(map) {
  let marker = null;
  let accuracyCircle = null;

  const LocateControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-locate');
      const link = L.DomUtil.create('a', 'leaflet-control-locate-btn', container);
      link.href = '#';
      link.title = 'Centrer sur ma position';
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', 'Centrer sur ma position');
      link.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v1.06A8.01 8.01 0 0 1 19.94 11H21a1 1 0 1 1 0 2h-1.06A8.01 8.01 0 0 1 13 19.94V21a1 1 0 1 1-2 0v-1.06A8.01 8.01 0 0 1 4.06 13H3a1 1 0 1 1 0-2h1.06A8.01 8.01 0 0 1 11 4.06V3a1 1 0 0 1 1-1zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 3.5A2.5 2.5 0 1 1 9.5 12 2.5 2.5 0 0 1 12 9.5z"/></svg>';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', (e) => {
        L.DomEvent.stop(e);
        container.classList.add('locating');
        map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
      });

      return container;
    },
  });

  map.addControl(new LocateControl());

  map.on('locationfound', (e) => {
    document.querySelector('.leaflet-control-locate')?.classList.remove('locating');
    if (marker) {
      marker.setLatLng(e.latlng);
      accuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
    } else {
      marker = L.circleMarker(e.latlng, {
        radius: 7,
        weight: 2,
        color: '#ffffff',
        fillColor: '#1a73e8',
        fillOpacity: 1,
      }).addTo(map);
      accuracyCircle = L.circle(e.latlng, {
        radius: e.accuracy,
        weight: 1,
        color: '#1a73e8',
        fillColor: '#1a73e8',
        fillOpacity: 0.12,
      }).addTo(map);
    }
  });

  map.on('locationerror', (e) => {
    document.querySelector('.leaflet-control-locate')?.classList.remove('locating');
    alert(`Impossible d'obtenir votre position : ${e.message}`);
  });
}

async function init() {
  const map = L.map('map', { zoomControl: true });

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Photos aériennes prises à marée basse (2011-2014), utile pour voir l'estran découvert.
  const ortholittorale = L.tileLayer.wms('https://geolittoral.din.developpement-durable.gouv.fr/wxs', {
    layers: 'ortholittorale_v2_rvb',
    format: 'image/png',
    version: '1.3.0',
    maxZoom: 19,
    attribution: 'GéoLittoral / SHOM-IGN — orthophotos littorales 2011-2014 (marée basse)',
  });

  const seamarks = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>',
  });

  L.control
    .layers(
      { 'Plan (OpenStreetMap)': osm, 'Photos aériennes à marée basse (2011-2014)': ortholittorale },
      { 'Balisage marin (OpenSeaMap)': seamarks }
    )
    .addTo(map);

  addLocateControl(map);

  const bounds = L.latLngBounds(POINTS.map((p) => [p.lat, p.lon]));
  map.fitBounds(bounds.pad(0.4), { maxZoom: 13 });

  // Charge une seule fois chaque fichier de données de marée référencé (partagé entre points).
  const seriesByPoint = new Map();
  await Promise.all(
    POINTS.map(async (point) => {
      const series = await loadTideSeries(point.tideSource);
      seriesByPoint.set(point.id, series);
    })
  );

  const brehatSeries = await loadTideSeries(BREHAT_TIDE_SOURCE);

  const markers = new Map();
  for (const point of POINTS) {
    const marker = L.circleMarker([point.lat, point.lon], {
      radius: 11,
      weight: 2,
      color: '#ffffff',
      fillOpacity: 0.95,
    }).addTo(map);
    marker.bindPopup('', { minWidth: 220 });
    markers.set(point.id, marker);
  }

  function refresh() {
    const now = Date.now();
    let earliestWarningDays = null;

    const brehatHeight = heightAt(brehatSeries, now);
    document.getElementById('current-tide').textContent =
      brehatHeight === null ? '' : `· ${brehatHeight.toFixed(2)} m`;

    for (const point of POINTS) {
      const series = seriesByPoint.get(point.id);
      const { status, height } = statusAt(series, now, point.thresholdMin);
      const transitions = status === 'unknown' ? [] : nextTransitions(series, now, point.thresholdMin, 2);
      const marker = markers.get(point.id);
      marker.setStyle({ fillColor: STATUS_COLOR[status] });
      marker.setPopupContent(buildPopupHtml(point, { status, height, transitions }));

      if (dataRangeEndsWithin(series, now, 7)) {
        const lastTs = series[series.length - 1][0];
        const daysLeft = Math.max(0, Math.round((lastTs - now) / (24 * 3600 * 1000)));
        if (earliestWarningDays === null || daysLeft < earliestWarningDays) earliestWarningDays = daysLeft;
      }
    }

    if (earliestWarningDays !== null) {
      showDataWarning(
        `⚠ Les données de marée arrivent à échéance dans ${earliestWarningDays} jour(s) — pensez à mettre à jour data/tidedata.json.`
      );
    } else {
      showDataWarning(null);
    }

    document.getElementById('last-update').textContent = `Dernière mise à jour : ${formatTime(now)}`;
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init().catch((err) => {
  console.error(err);
  showDataWarning(`Erreur de chargement des données de marée : ${err.message}`);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Échec de l’enregistrement du service worker', err);
    });
  });
}
