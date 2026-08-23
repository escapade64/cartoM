import { POINTS } from './points.js';
import { NAV_LINES } from './navlines.js';
import { ROCKS } from './rocks.js';
import { LANDMARKS, DANGER_ZONES } from './landmarks.js';
import { loadTideSeries, tideState, statusAt, nextTransitions, dataRangeEndsWithin } from './tide.js';
import { loadFloodTestLayer, loadFloodData, sampleElevation, MIN_DEPTH_M } from './flood.js';

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

// Bouton "suivre ma position", basé sur l'API de géolocalisation native de
// Leaflet (map.locate en mode watch) — pas de dépendance externe. Premier clic :
// centre la carte et démarre le suivi continu (le point bleu se déplace avec
// vous sans reforcer le recentrage, pour ne pas gêner si vous consultez
// d'autres points pendant que vous naviguez). Deuxième clic : arrête le suivi.
function addLocateControl(map, brehatSeries) {
  let marker = null;
  let accuracyCircle = null;
  let watching = false;
  let awaitingFirstFix = false;
  let floodData = null;

  // Icône position : point + petite flèche de cap, orientée via une simple
  // rotation CSS plutôt que de faire tourner toute la carte (Leaflet ne
  // supporte pas nativement la rotation de carte).
  function positionIcon() {
    return L.divIcon({
      className: 'position-marker',
      html:
        '<svg viewBox="0 0 24 24" width="24" height="24">' +
        '<polygon class="heading-arrow" points="12,1 18,12 6,12" style="transform-origin:12px 14px; opacity:0;" fill="#1a73e8" stroke="#fff" stroke-width="1"/>' +
        '<circle cx="12" cy="14" r="5" fill="#1a73e8" stroke="#fff" stroke-width="2"/>' +
        '</svg>',
      iconSize: [24, 24],
      iconAnchor: [12, 14],
    });
  }

  // Cap fourni directement par l'API de géolocalisation (degrés depuis le
  // nord vrai, sens horaire) — disponible en général en mouvement sur l'eau.
  // Masque la flèche si le cap est indisponible (à l'arrêt, ou appareil sans
  // cette info) plutôt que d'afficher une direction non fiable.
  function updateHeadingArrow(headingDeg) {
    if (!marker || !marker._icon) return;
    const arrow = marker._icon.querySelector('.heading-arrow');
    if (!arrow) return;
    if (headingDeg === null || headingDeg === undefined || Number.isNaN(headingDeg)) {
      arrow.style.opacity = '0';
    } else {
      arrow.style.opacity = '1';
      arrow.style.transform = `rotate(${headingDeg}deg)`;
    }
  }

  // Profondeur sous le bateau : altitude Litto3D à la position GPS courante,
  // comparée à la hauteur de marée courante à Bréhat. Hors de la zone relevée
  // (voir data/flood.json), pas d'étiquette affichée.
  function updateDepthTooltip(latlng) {
    if (!marker) return;
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

  const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-locate');

  function setState(state) {
    container.classList.remove('locating', 'tracking');
    if (state) container.classList.add(state);
  }

  const LocateControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const link = L.DomUtil.create('a', 'leaflet-control-locate-btn', container);
      link.href = '#';
      link.title = 'Suivre ma position';
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', 'Suivre ma position');
      link.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v1.06A8.01 8.01 0 0 1 19.94 11H21a1 1 0 1 1 0 2h-1.06A8.01 8.01 0 0 1 13 19.94V21a1 1 0 1 1-2 0v-1.06A8.01 8.01 0 0 1 4.06 13H3a1 1 0 1 1 0-2h1.06A8.01 8.01 0 0 1 11 4.06V3a1 1 0 0 1 1-1zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 3.5A2.5 2.5 0 1 1 9.5 12 2.5 2.5 0 0 1 12 9.5z"/></svg>';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', (e) => {
        L.DomEvent.stop(e);
        if (watching) {
          map.stopLocate();
          watching = false;
          setState(null);
          return;
        }
        watching = true;
        awaitingFirstFix = true;
        setState('locating');
        // setView volontairement omis : avec watch:true, Leaflet recentrerait la
        // carte à CHAQUE mise à jour de position, ce qui gênerait la consultation
        // d'autres points pendant la navigation. On centre nous-même une seule
        // fois, au premier fix (voir 'locationfound' ci-dessous).
        map.locate({ watch: true, enableHighAccuracy: true });
      });

      return container;
    },
  });

  map.addControl(new LocateControl());

  map.on('locationfound', (e) => {
    if (awaitingFirstFix) {
      awaitingFirstFix = false;
      setState('tracking');
      const zoom = Math.max(map.getZoom(), 16);
      map.setView(e.latlng, zoom);
    }
    if (marker) {
      marker.setLatLng(e.latlng);
      accuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
    } else {
      marker = L.marker(e.latlng, { icon: positionIcon(), interactive: false }).addTo(map);
      accuracyCircle = L.circle(e.latlng, {
        radius: e.accuracy,
        weight: 1,
        color: '#1a73e8',
        fillColor: '#1a73e8',
        fillOpacity: 0.12,
      }).addTo(map);
    }
    updateHeadingArrow(e.heading);

    loadFloodData().then((data) => {
      floodData = data;
      updateDepthTooltip(e.latlng);
    });
  });

  map.on('locationerror', (e) => {
    watching = false;
    awaitingFirstFix = false;
    setState(null);
    alert(`Impossible d'obtenir votre position : ${e.message}`);
  });
}

// Bouton "garder l'écran allumé" (Screen Wake Lock API — Safari iOS 16.4+).
// Le verrou est automatiquement relâché par le navigateur si l'onglet passe en
// arrière-plan ; on le redemande au retour si l'utilisateur l'avait activé.
function addWakeLockControl(map) {
  if (!('wakeLock' in navigator)) return;

  let sentinel = null;
  let enabled = false;
  const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-wakelock');

  async function acquire() {
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch (err) {
      console.warn("Écran allumé refusé", err);
    }
  }

  const WakeLockControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const link = L.DomUtil.create('a', 'leaflet-control-wakelock-btn', container);
      link.href = '#';
      link.title = "Garder l'écran allumé";
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', "Garder l'écran allumé");
      link.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM4.22 4.22a1 1 0 0 1 1.42 0l1.41 1.42a1 1 0 1 1-1.41 1.41L4.22 5.64a1 1 0 0 1 0-1.42zm14.14 0a1 1 0 0 1 0 1.42l-1.41 1.41a1 1 0 1 1-1.42-1.41l1.42-1.42a1 1 0 0 1 1.41 0zM2 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm17 0a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1zM6.63 16.95a1 1 0 0 1 1.41 1.41L6.63 19.78a1 1 0 1 1-1.41-1.41l1.41-1.42zm10.74 0 1.41 1.41a1 1 0 1 1-1.41 1.42l-1.42-1.42a1 1 0 0 1 1.42-1.41zM12 19a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1z"/></svg>';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', async (e) => {
        L.DomEvent.stop(e);
        enabled = !enabled;
        container.classList.toggle('active', enabled);
        if (enabled) {
          await acquire();
        } else if (sentinel) {
          await sentinel.release();
        }
      });

      return container;
    },
  });

  map.addControl(new WakeLockControl());

  document.addEventListener('visibilitychange', async () => {
    if (enabled && document.visibilityState === 'visible' && !sentinel) {
      await acquire();
    }
  });
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
  addLocateControl(map, brehatSeries);

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
