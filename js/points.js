// Configuration des points de passage.
// Pour ajouter un vrai point : dupliquer un objet ci-dessous et adapter
// id / name / lat / lon / thresholdMin. `tideSource` peut être partagé entre
// plusieurs points (même référence de marée) ou pointer vers un autre fichier
// data/xxx.json si un jour un point utilise une autre référence.

const POINTS = [
  {
    id: 'demo-brehat',
    name: 'Point de démo – Île de Bréhat (à adapter)',
    lat: 48.8419,
    lon: -2.9895,
    tideSource: 'data/tidedata.json',
    thresholdMin: 5.0, // mètres — seuil arbitraire, à remplacer par le vrai seuil du passage
    notes: 'Point d’exemple : dupliquez cette entrée pour vos vrais points de passage.',
  },
];

export { POINTS };
