import { POINTS } from './points.js';
import { NAV_LINES } from './navlines.js';
import { ROCKS } from './rocks.js';
import { LANDMARKS, DANGER_ZONES } from './landmarks.js';
import { loadTideSeries, tideState, statusAt, nextTransitions, dataRangeEndsWithin } from './tide.js';
import { loadFloodTestLayer, loadFloodData, sampleElevation, MIN_DEPTH_M } from './flood.js';
import { addLocateControl, addWakeLockControl } from './geolocation-controls.js';

const BREHAT_TIDE_SOURCE = 'data/tidedata.json';
const BOAT_DRAFT_M = 0.3; // tirant d'eau du bateau, ajouté au seuil requis de chaque point

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

const timeFmtShort = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTimeShort(ms) {
  return timeFmtShort.format(new Date(ms));
}

// Affiche/masque l'étiquette d'horaire à côté d'un marqueur de seuil (vide = masquée).
function setPointLabel(marker, html) {
  if (!html) {
    if (marker.getTooltip()) marker.unbindTooltip();
    return;
  }
  if (marker.getTooltip()) {
    marker.setTooltipContent(html);
  } else {
    marker.bindTooltip(html, { permanent: true, direction: 'right', offset: [14, 0], className: 'point-label' });
  }
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
      <div>Seuil requis : <strong>${point.thresholdMin.toFixed(2)} m + ${BOAT_DRAFT_M.toFixed(2)} m</strong> (tirant d'eau)</div>
      ${transitionsHtml}
      ${point.notes ? `<div class="notes">${point.notes}</div>` : ''}
      ${point.id === 'tahiti-express' ? '<div class="notes"><a href="tahiti3d.html">Vision 3D (test) →</a></div>' : ''}
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

// Profondeur sous le bateau : altitude Litto3D à la position GPS courante,
// comparée à la hauteur de marée courante à Bréhat. Hors de la zone relevée
// (voir data/flood.json), pas d'étiquette affichée. Spécifique à CartoM (voir
// geolocation-controls.js pour la partie générique du suivi de position).
function makeDepthTooltipHandler(brehatSeries) {
  let floodData = null;
  return (marker, latlng) => {
    function render() {
      const elevZH = floodData ? sampleElevation(floodData, latlng.lat, latlng.lng) : null;
      const brehat = elevZH !== null ? tideState(brehatSeries, Date.now()) : null;
      if (elevZH === null || !brehat || brehat.height === null) {
        if (marker.getTooltip()) marker.unbindTooltip();
        return;
      }
      const depth = brehat.height - elevZH;
      const color = depth <= MIN_DEPTH_M ? STATUS_COLOR.closed : STATUS_COLOR.open;
      const label = `<span style="color:${color}">Profondeur : ${depth.toFixed(2)} m</span>`;
      if (marker.getTooltip()) marker.setTooltipContent(label);
      else marker.bindTooltip(label, { permanent: true, direction: 'right', offset: [10, 0], className: 'depth-label' });
    }
    if (floodData) render();
    else loadFloodData().then((data) => {
      floodData = data;
      render();
    });
  };
}

async function init() {
  const map = L.map('map', { zoomControl: true });

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Photos aériennes prises à marée basse (2011-2014), utile pour voir l'estran découvert.
  // Tuiles pré-téléchargées et stockées dans le dépôt (zoom 12-17, zone Bréhat/Trégor) :
  // chargement instantané, plus besoin d'interroger le serveur WMS distant (lent).
  const ortholittorale = L.tileLayer('tiles/ortholittorale/{z}/{x}/{y}.jpg', {
    minZoom: 12,
    maxZoom: 19,
    maxNativeZoom: 17,
    bounds: L.latLngBounds([48.774, -3.096], [48.918, -2.963]),
    attribution: 'GéoLittoral / SHOM-IGN — orthophotos littorales 2011-2014 (marée basse)',
  });

  const seamarks = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>',
  });

  const layersControl = L.control
    .layers(
      { 'Plan (OpenStreetMap)': osm, 'Photos aériennes à marée basse (2011-2014)': ortholittorale },
      { 'Balisage marin (OpenSeaMap)': seamarks }
    )
    .addTo(map);

  // Zone immergée en temps réel (secteur couvert par le relevé Litto3D disponible).
  // Chargement des données au moment où le calque est activé, pas avant.
  const floodTest = await loadFloodTestLayer(map);
  if (floodTest) {
    layersControl.addOverlay(floodTest.overlay, 'Praticabilité (seuil 0,5 m — secteur relevé)');
  }

  // Tracés de navigation issus d'un relevé terrain (chenaux, passages, contournements).
  // Affichés par défaut, pas dans le sélecteur de calques.
  for (const line of NAV_LINES) {
    const polyline = L.polyline(line.path, {
      color: '#ffffff',
      weight: 3,
      opacity: 0.9,
      dashArray: '6 4',
    }).addTo(map);
    const label = line.notes ? `<strong>${line.name}</strong><br>${line.notes}` : `<strong>${line.name}</strong>`;
    polyline.bindTooltip(label, { sticky: true });
  }

  // Rochers repérés, avec leur nom affiché en permanence sur la carte.
  const rockIcon = L.divIcon({
    className: 'rock-marker',
    html: '<svg viewBox="0 0 16 16" width="14" height="14"><polygon points="8,1 15,14 1,14" fill="rgba(217,48,37,0.55)" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    iconSize: [14, 14],
    iconAnchor: [7, 12],
  });
  for (const rock of ROCKS) {
    const marker = L.marker([rock.lat, rock.lon], { icon: rockIcon }).addTo(map);
    marker.bindTooltip(rock.name, {
      permanent: true,
      direction: 'top',
      offset: [0, -10],
      className: 'map-label rock-label',
    });
    if (rock.name === 'Rocher en 8') {
      marker.bindPopup(`<strong>${rock.name}</strong><div class="notes"><a href="rocheren8-3d.html">Vision 3D (test) →</a></div>`);
    }
  }

  // Points de repère (plages, mouillages, lieux-dits).
  for (const landmark of LANDMARKS) {
    const marker = L.circleMarker([landmark.lat, landmark.lon], {
      radius: 5,
      weight: 1,
      color: '#0b5566',
      fillColor: '#3a8fa3',
      fillOpacity: 1,
    }).addTo(map);
    marker.bindTooltip(landmark.name, {
      permanent: true,
      direction: 'top',
      offset: [0, -5],
      className: 'map-label landmark-label',
    });
    const landmark3dLink = landmark.name === "Rocher d'Oscar" ? '<div class="notes"><a href="oscar3d.html">Vision 3D (test) →</a></div>' : '';
    if (landmark.notes || landmark3dLink) {
      marker.bindPopup(`<strong>${landmark.name}</strong>${landmark.notes ? `<br>${landmark.notes}` : ''}${landmark3dLink}`);
    }
  }

  // Zones de danger.
  for (const zone of DANGER_ZONES) {
    L.polygon(zone.path, {
      color: '#d93025',
      weight: 2,
      fillColor: '#d93025',
      fillOpacity: 0.25,
    })
      .addTo(map)
      .bindTooltip(zone.name, { sticky: true });
  }

  // Affiche/agrandit une catégorie d'étiquettes selon le zoom : masquée en
  // dessous de minZoom, taille interpolée entre minSize et maxSize au-delà.
  function bindZoomScaledLabels(sizeVar, opacityVar, { minZoom, maxZoom, minSize = 0.55, maxSize = 0.95 }) {
    function update() {
      const zoom = map.getZoom();
      if (zoom < minZoom) {
        document.documentElement.style.setProperty(sizeVar, '0rem');
        document.documentElement.style.setProperty(opacityVar, '0');
        return;
      }
      const t = Math.min(1, (zoom - minZoom) / (maxZoom - minZoom));
      const size = minSize + t * (maxSize - minSize);
      document.documentElement.style.setProperty(sizeVar, `${size.toFixed(2)}rem`);
      document.documentElement.style.setProperty(opacityVar, '1');
    }
    map.on('zoomend', update);
    return update;
  }

  // Rochers : uniquement à fort niveau de zoom.
  const updateRockLabels = bindZoomScaledLabels('--rock-label-size', '--rock-label-opacity', {
    minZoom: 15,
    maxZoom: 19,
  });
  // Points de repère : dès un zoom modéré, comme avant.
  const updateLandmarkLabels = bindZoomScaledLabels('--landmark-label-size', '--landmark-label-opacity', {
    minZoom: 13,
    maxZoom: 18,
  });
  // Horaires de passage sur les seuils : uniquement à fort niveau de zoom, taille fixe.
  const updatePointLabels = bindZoomScaledLabels('--point-label-size', '--point-label-opacity', {
    minZoom: 15,
    maxZoom: 19,
    minSize: 0.8,
    maxSize: 0.8,
  });
  function updateMapLabelScale() {
    updateRockLabels();
    updateLandmarkLabels();
    updatePointLabels();
  }

  addWakeLockControl(map);

  const initialPoint = POINTS.find((p) => p.id === 'mouillage-pescadou');
  if (initialPoint) {
    map.setView([initialPoint.lat, initialPoint.lon], 15);
  } else {
    const bounds = L.latLngBounds(POINTS.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds.pad(0.4), { maxZoom: 13 });
  }
  updateMapLabelScale();

  // Charge une seule fois chaque fichier de données de marée référencé (partagé entre points).
  const seriesByPoint = new Map();
  await Promise.all(
    POINTS.map(async (point) => {
      const series = await loadTideSeries(point.tideSource);
      seriesByPoint.set(point.id, series);
    })
  );

  const brehatSeries = await loadTideSeries(BREHAT_TIDE_SOURCE);
  addLocateControl(map, { onLocationFound: makeDepthTooltipHandler(brehatSeries) });

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

  // Taille des marqueurs de seuil proportionnelle au zoom.
  const POINT_RADIUS_MIN_ZOOM = 11;
  const POINT_RADIUS_MAX_ZOOM = 17;
  function updatePointRadius() {
    const zoom = map.getZoom();
    const t = Math.min(1, Math.max(0, (zoom - POINT_RADIUS_MIN_ZOOM) / (POINT_RADIUS_MAX_ZOOM - POINT_RADIUS_MIN_ZOOM)));
    const radius = 5 + t * (11 - 5);
    for (const marker of markers.values()) marker.setRadius(radius);
  }
  map.on('zoomend', updatePointRadius);
  updatePointRadius();

  function refresh() {
    const now = Date.now();
    let earliestWarningDays = null;

    const brehat = tideState(brehatSeries, now);
    const currentTideEl = document.getElementById('current-tide');
    if (brehat.height === null) {
      currentTideEl.innerHTML = '';
    } else {
      const arrow = brehat.direction === 'rising' ? '↗' : '↘';
      const directionLabel = brehat.direction === 'rising' ? 'montante' : 'descendante';
      const nextLabel = brehat.direction === 'rising' ? 'PM' : 'BM';
      const nextTimeTxt = brehat.nextExtremum ? formatTimeShort(brehat.nextExtremum.time) : '—';
      currentTideEl.innerHTML =
        `· ${brehat.height.toFixed(2)} m ` +
        `<span class="tide-extra">${arrow} ${directionLabel} · ${nextLabel} ${nextTimeTxt}</span>`;
    }
    if (floodTest) floodTest.update(brehat.height);

    for (const point of POINTS) {
      const series = seriesByPoint.get(point.id);
      const effectiveThreshold = point.thresholdMin + BOAT_DRAFT_M;
      const { status, height } = statusAt(series, now, effectiveThreshold);
      const transitions = status === 'unknown' ? [] : nextTransitions(series, now, effectiveThreshold, 2);
      const marker = markers.get(point.id);
      marker.setStyle({ fillColor: STATUS_COLOR[status] });
      marker.setPopupContent(buildPopupHtml(point, { status, height, transitions }));

      const nextChange = transitions[0];
      if (nextChange) {
        const arrow = nextChange.becomes === 'open' ? '↑' : '↓';
        const labelClass = nextChange.becomes === 'open' ? 'label-open' : 'label-closed';
        setPointLabel(marker, `<span class="${labelClass}">${arrow} ${formatTimeShort(nextChange.time)}</span>`);
      } else {
        setPointLabel(marker, '');
      }

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
