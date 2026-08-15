// Calque de test : zone immergée en temps réel, à partir d'un MNT Litto3D (SHOM)
// pré-converti en hauteurs "zéro hydrographique" (voir data/flood-test-pescadou.json).
// Limité à une seule tuile de 1km² (Mouillage Pescadou) le temps de valider l'approche.

async function loadFloodTestLayer(map) {
  let data;
  try {
    const resp = await fetch('data/flood-test-pescadou.json');
    if (!resp.ok) return null;
    data = await resp.json();
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = data.ncols;
  canvas.height = data.nrows;
  const ctx = canvas.getContext('2d');

  const bounds = L.latLngBounds([data.south, data.west], [data.north, data.east]);
  const overlay = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 0.6, interactive: false });

  function update(currentHeightM) {
    if (currentHeightM === null) return;
    const imgData = ctx.createImageData(data.ncols, data.nrows);
    for (let row = 0; row < data.nrows; row++) {
      for (let col = 0; col < data.ncols; col++) {
        const h = data.heights[row][col];
        const idx = (row * data.ncols + col) * 4;
        if (h !== null && h < currentHeightM) {
          imgData.data[idx] = 26;
          imgData.data[idx + 1] = 115;
          imgData.data[idx + 2] = 232;
          imgData.data[idx + 3] = 190;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    overlay.setUrl(canvas.toDataURL());
  }

  return { overlay, update };
}

export { loadFloodTestLayer };
