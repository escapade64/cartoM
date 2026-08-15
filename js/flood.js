// Calque : zone immergée en temps réel, à partir de tuiles MNT Litto3D (SHOM)
// pré-converties en hauteurs "zéro hydrographique" (voir data/flood/*.json).
// Chargement paresseux : les données (plusieurs Mo) ne sont récupérées que si
// l'utilisateur active le calque, pas à chaque ouverture de la carte.

const FLOOD_DIR = 'data/flood';
const MIN_DEPTH_M = 0.5; // seuil de praticabilité, indépendant du tirant d'eau du bateau
const COLOR_TOO_SHALLOW = [217, 48, 37, 130]; // 0 < profondeur <= seuil
const COLOR_NAVIGABLE = [30, 142, 62, 130]; // profondeur > seuil

async function loadFloodTestLayer(map) {
  let manifest;
  try {
    const resp = await fetch(`${FLOOD_DIR}/manifest.json`);
    if (!resp.ok) return null;
    manifest = await resp.json();
  } catch {
    return null;
  }
  if (!manifest.length) return null;

  const group = L.layerGroup();
  const tiles = [];
  let loaded = false;
  let loading = null;
  let lastHeight = null;

  function paintTile(tile, currentHeightM) {
    const { data, ctx, overlay } = tile;
    const imgData = ctx.createImageData(data.ncols, data.nrows);
    for (let row = 0; row < data.nrows; row++) {
      for (let col = 0; col < data.ncols; col++) {
        const h = data.heights[row][col];
        if (h === null) continue;
        const depth = currentHeightM - h;
        if (depth <= 0) continue; // à sec, pas d'eau du tout
        const color = depth <= MIN_DEPTH_M ? COLOR_TOO_SHALLOW : COLOR_NAVIGABLE;
        const idx = (row * data.ncols + col) * 4;
        imgData.data[idx] = color[0];
        imgData.data[idx + 1] = color[1];
        imgData.data[idx + 2] = color[2];
        imgData.data[idx + 3] = color[3];
      }
    }
    ctx.putImageData(imgData, 0, 0);
    overlay.setUrl(tile.canvas.toDataURL());
  }

  function update(currentHeightM) {
    lastHeight = currentHeightM;
    if (currentHeightM === null || !map.hasLayer(group)) return;
    for (const tile of tiles) paintTile(tile, currentHeightM);
  }

  function ensureLoaded() {
    if (loading) return loading;
    loading = Promise.all(
      manifest.map(async (entry) => {
        try {
          const resp = await fetch(`${FLOOD_DIR}/${entry.id}.json`);
          if (!resp.ok) return;
          const data = await resp.json();
          const canvas = document.createElement('canvas');
          canvas.width = data.ncols;
          canvas.height = data.nrows;
          const ctx = canvas.getContext('2d');
          const bounds = L.latLngBounds([data.south, data.west], [data.north, data.east]);
          const overlay = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 0.6, interactive: false });
          overlay.addTo(group);
          tiles.push({ overlay, canvas, ctx, data });
        } catch (err) {
          console.warn(`Tuile immersion ${entry.id} non chargée`, err);
        }
      })
    ).then(() => {
      loaded = true;
      update(lastHeight);
    });
    return loading;
  }

  map.on('overlayadd', (e) => {
    if (e.layer === group && !loaded) ensureLoaded();
  });

  return { group, update };
}

export { loadFloodTestLayer };
