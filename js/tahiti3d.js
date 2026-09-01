// Test de rendu 3D (backlog #1) autour de Tahiti Express. Voir js/terrain3d.js
// pour le moteur commun (Three.js + Litto3D).

import { initTerrain3D } from './terrain3d.js';

initTerrain3D({
  terrainUrl: 'data/tahiti3d.json',
  center: { lat: 48.86640858003744, lon: -3.0337930108136613 },
  halfExtentM: 340, // zone de 680 x 680 m (donnée source : 700 x 700 m à 1 m/px)
  gridN: 220,
  notFoundLabel: 'Tahiti Express',
  orthophoto: true,
}).catch((err) => {
  console.error(err);
  document.getElementById('scene-loading').hidden = false;
  document.getElementById('scene-loading').textContent = 'Erreur lors du chargement de la scène 3D.';
});
