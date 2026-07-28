// Configuration des points de passage.
// Peut être éditée à la main (dupliquer un objet ci-dessous) ou régénérée
// depuis edit.html (clic sur la carte + tableau), puis collée ici.

const POINTS = [
  {
    id: 'mouillage-pescadou',
    name: "Mouillage Pescadou",
    lat: 48.852639,
    lon: -3.006868,
    tideSource: "data/tidedata.json",
    thresholdMin: 4.1, // mètres
    notes: "",
  },
  {
    id: 'sainte-anne-express',
    name: "Sainte-Anne Express",
    lat: 48.864408,
    lon: -3.031777,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.8, // mètres
    notes: "",
  },
  {
    id: 'tahiti-express',
    name: "Tahiti Express",
    lat: 48.866513,
    lon: -3.03373,
    tideSource: "data/tidedata.json",
    thresholdMin: 5.4, // mètres
    notes: "",
  },
  {
    id: 'nord-maudez',
    name: "Nord Maudez",
    lat: 48.8647564,
    lon: -3.037588,
    tideSource: "data/tidedata.json",
    thresholdMin: 7.7, // mètres
    notes: "",
  },
  {
    id: 'nord-maudez-2',
    name: "Nord Maudez",
    lat: 48.8647706,
    lon: -3.038981,
    tideSource: "data/tidedata.json",
    thresholdMin: 8, // mètres
    notes: "",
  },
  {
    id: 'ouest-maudez',
    name: "Ouest Maudez",
    lat: 48.8613293,
    lon: -3.0462761,
    tideSource: "data/tidedata.json",
    thresholdMin: 6, // mètres
    notes: "",
  },
  {
    id: 'kerpont',
    name: "Kerpont",
    lat: 48.8471952,
    lon: -3.0145399,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.6, // mètres
    notes: "le seuil est assez étendu vers le Sud",
  },
  {
    id: 'beniguet',
    name: "Beniguet",
    lat: 48.8457761,
    lon: -3.0215696,
    tideSource: "data/tidedata.json",
    thresholdMin: 4.2, // mètres
    notes: "Permet de contourner le Kerpont à marée haute",
  },
  {
    id: 'seuil-morbic',
    name: "Seuil Morbic",
    lat: 48.8603269,
    lon: -2.9847506,
    tideSource: "data/tidedata.json",
    thresholdMin: 7.17, // mètres
    notes: "",
  },
  {
    id: 'point-bas-cale',
    name: "Point bas cale",
    lat: 48.8238911,
    lon: -3.0121605,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.6, // mètres
    notes: "permet de remonter le long de la cale mieux que les vedettes",
  },
  {
    id: 'cale-des-heaux-de-brehat',
    name: "Cale des Héaux de Bréhat",
    lat: 48.9083073,
    lon: -3.0860267,
    tideSource: "data/tidedata.json",
    thresholdMin: 7.5, // mètres
    notes: "Hauteur estimée",
  },
];

export { POINTS };
