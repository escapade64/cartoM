// Moteur commun aux pages de test de rendu 3D (backlog #1) : relief du fond
// marin sur une petite zone, à partir d'une sous-fenêtre Litto3D pré-découpée
// (voir data/*3d.json, générés hors-ligne à partir des tuiles MNT1m du Shom).
// Paramétré par point d'intérêt : voir js/tahiti3d.js et js/oscar3d.js.

import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import { sampleElevation } from './flood.js';
import { loadTideSeries, tideState } from './tide.js';

const BREHAT_TIDE_SOURCE = 'data/tidedata.json';
const VERTICAL_EXAGGERATION = 2;
const M_PER_DEG_LAT = 111320;

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

function buildTerrain(floodData, center, halfExtentM, gridN, mPerDegLon, orthoTexture) {
  const positions = new Float32Array(gridN * gridN * 3);
  const colors = new Float32Array(gridN * gridN * 3);
  const uvs = new Float32Array(gridN * gridN * 2);
  const valid = new Uint8Array(gridN * gridN);
  const { west, east, south, north } = floodData;

  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      const fx = -halfExtentM + (i / (gridN - 1)) * 2 * halfExtentM; // est (m)
      const fy = -halfExtentM + (j / (gridN - 1)) * 2 * halfExtentM; // nord (m)
      const lon = center.lon + fx / mPerDegLon;
      const lat = center.lat + fy / M_PER_DEG_LAT;
      const e = sampleElevation(floodData, lat, lon);
      const idx = j * gridN + i;
      const p = idx * 3;
      positions[p] = fx;
      positions[p + 1] = e === null ? 0 : e * VERTICAL_EXAGGERATION;
      positions[p + 2] = -fy;
      uvs[idx * 2] = (lon - west) / (east - west);
      uvs[idx * 2 + 1] = (lat - south) / (north - south);
      if (e !== null) {
        valid[idx] = 1;
        const [r, g, b] = colorForElevation(e);
        colors[p] = r / 255;
        colors[p + 1] = g / 255;
        colors[p + 2] = b / 255;
      }
    }
  }

  const indices = [];
  for (let j = 0; j < gridN - 1; j++) {
    for (let i = 0; i < gridN - 1; i++) {
      const a = j * gridN + i;
      const b = j * gridN + i + 1;
      const c = (j + 1) * gridN + i;
      const d = (j + 1) * gridN + i + 1;
      if (!valid[a] || !valid[b] || !valid[c] || !valid[d]) continue;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = orthoTexture
    ? new THREE.MeshStandardMaterial({ map: orthoTexture, side: THREE.DoubleSide, roughness: 1, metalness: 0 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });

  return { mesh: new THREE.Mesh(geometry, material), hasData: indices.length > 0 };
}

// Compose une texture à partir des tuiles orthophoto pré-téléchargées
// (tiles/ortholittorale/{z}/{x}/{y}.jpg, même source que le calque 2D de
// index.html), recadrée exactement sur l'emprise [west,south,east,north].
const ORTHO_MAX_ZOOM = 17;
const TILE_SIZE = 256;

function lon2tileX(lon, z) {
  return ((lon + 180) / 360) * 2 ** z;
}

function lat2tileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // tuile manquante : on laisse la zone transparente
    img.src = url;
  });
}

async function buildOrthoTexture(bounds, outputSize = 1024) {
  const { west, east, south, north } = bounds;
  const z = ORTHO_MAX_ZOOM;
  const xF0 = lon2tileX(west, z);
  const xF1 = lon2tileX(east, z);
  const yF0 = lat2tileY(north, z); // haut (nord)
  const yF1 = lat2tileY(south, z); // bas (sud)

  const txMin = Math.floor(xF0);
  const txMax = Math.floor(xF1);
  const tyMin = Math.floor(yF0);
  const tyMax = Math.floor(yF1);

  const mosaicCanvas = document.createElement('canvas');
  mosaicCanvas.width = (txMax - txMin + 1) * TILE_SIZE;
  mosaicCanvas.height = (tyMax - tyMin + 1) * TILE_SIZE;
  const mctx = mosaicCanvas.getContext('2d');

  const loads = [];
  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      loads.push(
        loadImage(`tiles/ortholittorale/${z}/${tx}/${ty}.jpg`).then((img) => {
          if (img) mctx.drawImage(img, (tx - txMin) * TILE_SIZE, (ty - tyMin) * TILE_SIZE);
        })
      );
    }
  }
  await Promise.all(loads);

  const sx = (xF0 - txMin) * TILE_SIZE;
  const sxEnd = (xF1 - txMin) * TILE_SIZE;
  const sy = (yF0 - tyMin) * TILE_SIZE;
  const syEnd = (yF1 - tyMin) * TILE_SIZE;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outputSize;
  outCanvas.height = outputSize;
  const octx = outCanvas.getContext('2d');
  octx.drawImage(mosaicCanvas, sx, sy, sxEnd - sx, syEnd - sy, 0, 0, outputSize, outputSize);

  const texture = new THREE.CanvasTexture(outCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// options: { terrainUrl, center: {lat,lon}, halfExtentM, gridN, notFoundLabel, orthophoto }
async function initTerrain3D(options) {
  const { terrainUrl, center, halfExtentM, gridN, notFoundLabel, orthophoto } = options;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);

  const canvas = document.getElementById('scene-canvas');
  const container = document.getElementById('scene-container');
  const loadingEl = document.getElementById('scene-loading');
  const legendEl = document.getElementById('scene-legend');
  const tideHeightEl = document.getElementById('scene-tide-height');
  const waterControlEl = document.getElementById('scene-water-control');
  const waterSlider = document.getElementById('water-slider');
  const waterValueEl = document.getElementById('water-value');
  const waterResetBtn = document.getElementById('water-reset');

  let floodData;
  try {
    const resp = await fetch(terrainUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    floodData = await resp.json();
  } catch (err) {
    showError(`Données de relief indisponibles (${terrainUrl} non chargé).`);
    return;
  }

  const orthoTexture = orthophoto ? await buildOrthoTexture(floodData) : null;

  const { mesh, hasData } = buildTerrain(floodData, center, halfExtentM, gridN, mPerDegLon, orthoTexture);
  if (!hasData) {
    showError(`Pas de donnée Litto3D exploitable autour de ${notFoundLabel}.`);
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe8f2);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  camera.position.set(0, halfExtentM * 0.75, halfExtentM * 1.4);

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

  const grid = new THREE.GridHelper(halfExtentM * 2, 12, 0x2a5d6e, 0x2a5d6e);
  grid.position.y = -0.01;
  grid.material.opacity = 0.15;
  grid.material.transparent = true;
  scene.add(grid);

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(-120, 200, 100);
  scene.add(ambient, sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 20;
  controls.maxDistance = halfExtentM * 4;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  loadingEl.hidden = true;
  legendEl.hidden = false;
  waterControlEl.hidden = false;
  if (orthoTexture) {
    legendEl.querySelectorAll('.elevation-legend-row').forEach((row) => {
      row.hidden = true;
    });
  }

  // Plan d'eau translucide, dont la hauteur peut être ajustée à la main via le
  // curseur (indépendamment de la marée réelle, pour explorer le relief à
  // différents niveaux d'immersion).
  const waterGeo = new THREE.PlaneGeometry(halfExtentM * 2.4, halfExtentM * 2.4);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4aa3d9,
    transparent: true,
    opacity: 0.45,
    roughness: 0.1,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  scene.add(water);

  let currentTideHeight = null;

  function setWaterHeight(h) {
    water.position.y = h * VERTICAL_EXAGGERATION;
    waterValueEl.textContent = `${h.toFixed(2)} m`;
    waterSlider.value = h;
  }

  setWaterHeight(3); // valeur de départ raisonnable en attendant la marée réelle
  waterSlider.addEventListener('input', () => setWaterHeight(parseFloat(waterSlider.value)));
  waterResetBtn.addEventListener('click', () => {
    if (currentTideHeight !== null) setWaterHeight(currentTideHeight);
  });

  // Marée courante : sert à afficher la référence dans la légende et à
  // initialiser le curseur, mais ne se rafraîchit pas en direct dans ce test.
  loadTideSeries(BREHAT_TIDE_SOURCE)
    .then((series) => {
      const { height } = tideState(series, Date.now());
      if (height === null) return;
      currentTideHeight = height;
      tideHeightEl.textContent = `${height.toFixed(2)} m`;
      setWaterHeight(height);
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

export { initTerrain3D };
