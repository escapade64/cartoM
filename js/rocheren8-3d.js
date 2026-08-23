// Test de rendu 3D (backlog #1) autour du Rocher en 8. Voir js/terrain3d.js
// pour le moteur commun (Three.js + Litto3D).
//
// Ce rocher est tout proche de la limite nord de la zone relevée par le Shom :
// le relief manque sur une frange au nord immédiat du point (~60-70 m), le
// reste de la zone au sud est bien couvert.

import { initTerrain3D } from './terrain3d.js';

initTerrain3D({
  terrainUrl: 'data/rocheren8-3d.json',
  center: { lat: 48.8679916, lon: -3.0423392 },
  halfExtentM: 340,
  gridN: 220,
  notFoundLabel: 'Rocher en 8',
}).catch((err) => {
  console.error(err);
  document.getElementById('scene-loading').hidden = false;
  document.getElementById('scene-loading').textContent = 'Erreur lors du chargement de la scène 3D.';
});
