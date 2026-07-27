// Configuration des points de passage.
// Pour ajouter un vrai point : dupliquer un objet ci-dessous et adapter
// id / name / lat / lon / thresholdMin. `tideSource` peut être partagé entre
// plusieurs points (même référence de marée) ou pointer vers un autre fichier
// data/xxx.json si un jour un point utilise une autre référence.

const POINTS = [
  {
    id: 'mouillage-pescadou',
    name: 'Mouillage Pescadou',
    lat: 48.852639,
    lon: -3.006868,
    tideSource: 'data/tidedata.json',
    thresholdMin: 4.1, // mètres
    notes: '',
  },
  {
    id: 'kerpont',
    name: 'Kerpont',
    lat: 48.846582,
    lon: -3.013984,
    tideSource: 'data/tidedata.json',
    thresholdMin: 2.6, // mètres
    notes: '',
  },
];

export { POINTS };
