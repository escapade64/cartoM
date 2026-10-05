// Segments CartoPy : relient deux points (voir cartopy-data.js) sans tracé
// précis, avec les infos connues du terrain (distance, dénivelé).
// Chaque entrée : { id, name, fromId, toId, distanceKm, dPlus, dMinus, notes }.
// fromId/toId référencent l'id (stable) d'un point de cartopy-data.js.
// Éditable à la main ou depuis cartopy-edit.html.

const CARTOPY_SEGMENTS = [
  { id: 'point', name: '', fromId: 'point-20', toId: 'point-22', distanceKm: null, dPlus: 200, dMinus: 200, notes: '' },
];

export { CARTOPY_SEGMENTS };
