// Configuration des points de passage.
// Peut être éditée à la main (dupliquer un objet ci-dessous) ou régénérée
// depuis edit.html (clic sur la carte), puis collée ici.

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
    lat: 48.86640858003744,
    lon: -3.0337930108136613,
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
    lat: 48.84608524663024,
    lon: -3.014094568191359,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.6, // mètres
    notes: "le seuil est assez étendu vers le Sud",
  },
  {
    id: 'beniguet',
    name: "Beniguet",
    lat: 48.84578203342697,
    lon: -3.0214118001295236,
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
  {
    id: 'kervarec-express',
    name: "Kervarec express",
    lat: 48.854609094739104,
    lon: -3.0137141722099057,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.45, // mètres
    notes: "",
  },
  {
    id: 'milieu-express',
    name: "Milieu express",
    lat: 48.85164890780442,
    lon: -3.022919478987323,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.54, // mètres
    notes: "Beaucoup de courant",
  },
  {
    id: 'chien-vers-trieux',
    name: "Chien vers Trieux",
    lat: 48.848898277916625,
    lon: -3.0237189539224967,
    tideSource: "data/tidedata.json",
    thresholdMin: 1.9, // mètres
    notes: "",
  },
  {
    id: 'daddy-express',
    name: "Daddy Express",
    lat: 48.848573342662576,
    lon: -3.027451697947152,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.7, // mètres
    notes: "Parc à huitres",
  },
  {
    id: 'phoque-express',
    name: "Phoque express",
    lat: 48.84983068911272,
    lon: -3.027167451634925,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.45, // mètres
    notes: "",
  },
  {
    id: 'port-express',
    name: "Port express",
    lat: 48.78800255433153,
    lon: -3.012251282326735,
    tideSource: "data/tidedata.json",
    thresholdMin: 4.2, // mètres
    notes: "Attention au pavé à l'ouest",
  },
  {
    id: 'ponton-cras',
    name: "Ponton Cras",
    lat: 48.78542768981338,
    lon: -3.0442912647352287,
    tideSource: "data/tidedata.json",
    thresholdMin: 4.85, // mètres
    notes: "",
  },
  {
    id: 'passage-beniguet',
    name: "Passage Béniguet",
    lat: 48.83819287976765,
    lon: -3.0210874552395177,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.9, // mètres
    notes: "",
  },
  {
    id: 'passage-est-la-chevre',
    name: "Passage Est La Chèvre",
    lat: 48.834464718625576,
    lon: -3.025454180763372,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.6, // mètres
    notes: "",
  },
  {
    id: 'seuil-1-kerpont-kerpont-du-chien',
    name: "Seuil 1 Kerpont / Kerpont du Chien",
    lat: 48.848249056445596,
    lon: -3.0164406070097316,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.4, // mètres
    notes: "",
  },
  {
    id: 'pecherie-du-fond',
    name: "Pêcherie du fond",
    lat: 48.864891239641224,
    lon: -3.052825328500513,
    tideSource: "data/tidedata.json",
    thresholdMin: 1.5, // mètres
    notes: "",
  },
  {
    id: 'seuil-du-passage-vers-pomelin',
    name: "Seuil du passage vers Pomelin",
    lat: 48.861482182251734,
    lon: -3.063168602193749,
    tideSource: "data/tidedata.json",
    thresholdMin: 4, // mètres
    notes: "",
  },
  {
    id: 'seuil-nord',
    name: "Seuil Nord",
    lat: 48.8681870980839,
    lon: -3.0542637320125725,
    tideSource: "data/tidedata.json",
    thresholdMin: 4, // mètres
    notes: "Pas très net",
  },
  {
    id: 'pecherie',
    name: "Pêcherie",
    lat: 48.869673178001236,
    lon: -3.0557390712799264,
    tideSource: "data/tidedata.json",
    thresholdMin: 3, // mètres
    notes: "",
  },
  {
    id: 'passage',
    name: "Passage",
    lat: 48.86992767184768,
    lon: -3.0508858507329855,
    tideSource: "data/tidedata.json",
    thresholdMin: 4.7, // mètres
    notes: "",
  },
  {
    id: 'cale-de-la-distillerie',
    name: "Cale de la distillerie",
    lat: 48.856168259198824,
    lon: -3.076411492046825,
    tideSource: "data/tidedata.json",
    thresholdMin: 6, // mètres
    notes: "",
  },
  {
    id: 'raccourci-vers-platier',
    name: "Raccourci vers platier",
    lat: 48.85803392935861,
    lon: -2.9791707342321248,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.4, // mètres
    notes: "",
  },
  {
    id: 'passage-gilos',
    name: "Passage Gilos",
    lat: 48.85518574398022,
    lon: -2.980524276029609,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.9, // mètres
    notes: "",
  },
  {
    id: 'seuil-sud-maudez',
    name: "Seuil Sud Maudez",
    lat: 48.85975992379425,
    lon: -3.053673531282404,
    tideSource: "data/tidedata.json",
    thresholdMin: 4.5, // mètres
    notes: "",
  },
  {
    id: 'corps-mort-delafarge',
    name: "Corps-mort Delafarge",
    lat: 48.85361300957708,
    lon: -3.0116427520130555,
    tideSource: "data/tidedata.json",
    thresholdMin: 2.2, // mètres
    notes: "",
  },
  {
    id: 'seuil',
    name: "Seuil",
    lat: 48.86214068057547,
    lon: -3.0469563475849153,
    tideSource: "data/tidedata.json",
    thresholdMin: 4.4, // mètres
    notes: "",
  },
];

export { POINTS };
