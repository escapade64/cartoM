// Test de rendu 3D (backlog #1) : relief du fond marin sur une petite zone autour
// du point "Tahiti Express", à partir de la même grille Litto3D fusionnée que le
// calque de praticabilité (data/flood.json, déjà en hauteurs zéro hydrographique).
// Réutilise flood.js (sampleElevation) et tide.js (marée courante) sans dupliquer
// de logique.

import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { loadFloodData, sampleElevation } from './flood.js';
import { loadTideSeries, tideState } from './tide.js';

const BREHAT_TIDE_SOURCE = 'data/tidedata.json';
const CENTER = { lat: 48.86640858003744, lon: -3.0337930108136613 }; // Tahiti Express
const HALF_EXTENT_M = 180; // zone de 360 x 360 m autour du point
const GRID_N = 96; // échantillons par côté
const VERTICAL_EXAGGERATION = 2;

const M_PER_DEG_LAT = 111320;
const mPerDegLon = M_PER_DEG_LAT * Math.cos((CENTER.lat * Math.PI) / 180);

function showError(message) {
  const el = document.getElementById('scene-loading');
  if (el) {
    el.textContent = message;
    el.hidden = false;
  }
}

// Couleur par élévation (zéro hydrographique) : bleu profond -> bleu clair ->
// estran (sable) -> hors d'eau (vert/gris). Interpolation linéaire par paliers.
const COLOR_STOPS = [
  [-6, [0x0b, 0x3d, 0x6b]],
  [-1, [0x2f, 0x8f, 0xc2]],
  [0.2, [0xd9, 0xb3, 0x6c]],
  [3, [0xb9, 0xa0, 0x6a]],
  [6, [0x6b, 0x8f, 0x5a]],
];

function colorForElevation(e) {
  if (e <= COLOR_STOPS[0][0]) return COLOR_STOPS[0][1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [e0, c0] = COLOR_STOPS[i];
    const [e1, c1] = COLOR_STOPS[i + 1];
    if (e <= e1) {
      const t = (e - e0) / (e1 - e0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
}

function buildTerrain(floodData) {
  const positions = new Float32Array(GRID_N * GRID_N * 3);
  const colors = new Float32Array(GRID_N * GRID_N * 3);
  const valid = new Uint8Array(GRID_N * GRID_N);
  let minE = Infinity;
  let maxE = -Infinity;

  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      const fx = -HALF_EXTENT_M + (i / (GRID_N - 1)) * 2 * HALF_EXTENT_M; // est (m)
      const fy = -HALF_EXTENT_M + (j / (GRID_N - 1)) * 2 * HALF_EXTENT_M; // nord (m)
      const lon = CENTER.lon + fx / mPerDegLon;
      const lat = CENTER.lat + fy / M_PER_DEG_LAT;
      const e = sampleElevation(floodData, lat, lon);
      const idx = j * GRID_N + i;
      const p = idx * 3;
      positions[p] = fx;
      positions[p + 1] = e === null ? 0 : e * VERTICAL_EXAGGERATION;
      positions[p + 2] = -fy;
      if (e !== null) {
        valid[idx] = 1;
        minE = Math.min(minE, e);
        maxE = Math.max(maxE, e);
        const [r, g, b] = colorForElevation(e);
        colors[p] = r / 255;
        colors[p + 1] = g / 255;
        colors[p + 2] = b / 255;
      }
    }
  }

  const indices = [];
  for (let j = 0; j < GRID_N - 1; j++) {
    for (let i = 0; i < GRID_N - 1; i++) {
      const a = j * GRID_N + i;
      const b = j * GRID_N + i + 1;
      const c = (j + 1) * GRID_N + i;
      const d = (j + 1) * GRID_N + i + 1;
      if (!valid[a] || !valid[b] || !valid[c] || !valid[d]) continue;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.95,
    metalness: 0,
  });

  return { mesh: new THREE.Mesh(geometry, material), minE, maxE, hasData: indices.length > 0 };
}

async function init() {
  const canvas = document.getElementById('scene-canvas');
  const container = document.getElementById('scene-container');
  const loadingEl = document.getElementById('scene-loading');
  const legendEl = document.getElementById('scene-legend');
  const tideHeightEl = document.getElementById('scene-tide-height');

  const floodData = await loadFloodData();
  if (!floodData) {
    showError('Données de relief indisponibles (data/flood.json non chargé).');
    return;
  }

  const { mesh, hasData } = buildTerrain(floodData);
  if (!hasData) {
    showError("Pas de donnée Litto3D exploitable dans cette zone autour de Tahiti Express.");
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe8f2);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  camera.position.set(0, 140, 260);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  scene.add(mesh);

  const grid = new THREE.GridHelper(HALF_EXTENT_M * 2, 12, 0x2a5d6e, 0x2a5d6e);
  grid.position.y = -0.01;
  grid.material.opacity = 0.15;
  grid.material.transparent = true;
  scene.add(grid);

  // Repère nord (la grille locale est alignée est/nord vrai, comme flood.js).
  const north = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 2, HALF_EXTENT_M - 10),
    30,
    0xd93025,
    10,
    6
  );
  scene.add(north);

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(-120, 200, 100);
  scene.add(ambient, sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 20;
  controls.maxDistance = 900;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  loadingEl.hidden = true;
  legendEl.hidden = false;

  // Marée courante : simple plan translucide donnant le niveau d'eau actuel, en
  // repère sur le relief statique (pas de rafraîchissement temps réel dans ce test).
  loadTideSeries(BREHAT_TIDE_SOURCE)
    .then((series) => {
      const { height } = tideState(series, Date.now());
      if (height === null) return;
      tideHeightEl.textContent = `${height.toFixed(2)} m`;
      const waterGeo = new THREE.PlaneGeometry(HALF_EXTENT_M * 2.4, HALF_EXTENT_M * 2.4);
      waterGeo.rotateX(-Math.PI / 2);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x4aa3d9,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
      });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.y = height * VERTICAL_EXAGGERATION;
      scene.add(water);
    })
    .catch(() => {
      tideHeightEl.textContent = 'indisponible';
    });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

init().catch((err) => {
  console.error(err);
  showError('Erreur lors du chargement de la scène 3D.');
});
