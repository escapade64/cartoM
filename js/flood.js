// Calque : praticabilité en temps réel, à partir du MNT Litto3D (SHOM) fusionné en
// une seule grille (voir data/flood.json), convertie en hauteurs "zéro hydrographique".
// Une seule image continue (pas de découpage en tuiles) pour éviter les coutures
// visibles dues à la rotation d'environ 4,3° du quadrillage Lambert-93 par rapport
// au nord vrai à cette longitude.
// Chargement paresseux : les données (quelques Mo) ne sont récupérées que si
// l'utilisateur active le calque, pas à chaque ouverture de la carte.

const FLOOD_URL = 'data/flood.json';
const MIN_DEPTH_M = 0.5; // seuil de praticabilité, indépendant du tirant d'eau du bateau
const COLOR_TOO_SHALLOW = [217, 48, 37, 130]; // 0 < profondeur <= seuil
const COLOR_NAVIGABLE = [30, 142, 62, 130]; // profondeur > seuil

async function loadFloodTestLayer(map) {
  let manifestOk;
  try {
    const resp = await fetch(FLOOD_URL, { method: 'HEAD' });
    manifestOk = resp.ok;
  } catch {
    manifestOk = false;
  }
  if (!manifestOk) return null;

  let data = null;
  let canvas = null;
  let ctx = null;
  let overlay = null;
  let loaded = false;
  let loading = null;
  let lastHeight = null;

  function paint(currentHeightM) {
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
    overlay.setUrl(canvas.toDataURL());
  }

  function update(currentHeightM) {
    lastHeight = currentHeightM;
    if (currentHeightM === null || !loaded || !map.hasLayer(overlay)) return;
    paint(currentHeightM);
  }

  function ensureLoaded() {
    if (loading) return loading;
    loading = fetch(FLOOD_URL)
      .then((resp) => resp.json())
      .then((json) => {
        data = json;
        canvas = document.createElement('canvas');
        canvas.width = data.ncols;
        canvas.height = data.nrows;
        ctx = canvas.getContext('2d');
        const bounds = L.latLngBounds([data.south, data.west], [data.north, data.east]);
        overlay.setBounds(bounds);
        loaded = true;
        update(lastHeight);
      })
      .catch((err) => console.warn('Données de praticabilité non chargées', err));
    return loading;
  }

  // Overlay placeholder (image vide) tant que les données ne sont pas chargées,
  // pour pouvoir l'ajouter au sélecteur de calques dès l'initialisation de la carte.
  overlay = L.imageOverlay('', L.latLngBounds([0, 0], [0, 0]), { opacity: 0.6, interactive: false });

  map.on('overlayadd', (e) => {
    if (e.layer === overlay && !loaded) ensureLoaded();
  });

  return { overlay, update };
}

export { loadFloodTestLayer };
