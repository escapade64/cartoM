// Contrôles de géolocalisation partagés entre CartoM et CartoPy : bouton
// "suivre ma position" (Leaflet map.locate en mode watch, avec flèche de cap)
// et bouton "garder l'écran allumé" (Wake Lock API). Générique, sans notion de
// marée ni de dénivelé — les extensions propres à une app passent par le
// callback onLocationFound de addLocateControl.

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

// Cap fourni directement par l'API de géolocalisation (degrés depuis le nord
// vrai, sens horaire) — disponible en général en mouvement. Masque la flèche
// si le cap est indisponible (à l'arrêt, ou appareil sans cette info) plutôt
// que d'afficher une direction non fiable.
function updateHeadingArrow(marker, headingDeg) {
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

// Bouton "suivre ma position". Premier clic : centre la carte et démarre le
// suivi continu (le point bleu se déplace avec vous sans reforcer le
// recentrage, pour ne pas gêner si vous consultez autre chose pendant que
// vous vous déplacez). Deuxième clic : arrête le suivi.
// options.onLocationFound(marker, latlng) est appelé à chaque mise à jour de
// position, pour les besoins propres à chaque app (ex. profondeur sous le
// bateau dans CartoM).
function addLocateControl(map, options = {}) {
  const { onLocationFound } = options;
  let marker = null;
  let accuracyCircle = null;
  let watching = false;
  let awaitingFirstFix = false;

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
        // d'autres points pendant le déplacement. On centre nous-même une seule
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
    updateHeadingArrow(marker, e.heading);
    if (onLocationFound) onLocationFound(marker, e.latlng);
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
      console.warn('Écran allumé refusé', err);
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

export { addLocateControl, addWakeLockControl };
