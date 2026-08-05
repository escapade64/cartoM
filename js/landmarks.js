// Points de repère (plages, mouillages, lieux-dits) et zones de danger,
// issus d'un relevé terrain. Régénéré depuis edit.html, puis collé dans
// js/landmarks.js. (Les zones de danger ne sont pas éditables depuis cet
// outil ; reproduites telles quelles pour ne pas les perdre à l'export.)

const LANDMARKS = [
  { name: "Baie Sainte-Anne", lat: 48.8638289, lon: -3.0366977, notes: "Magnifique" },
  { name: "Baie du dentier", lat: 48.8632819, lon: -3.0336004, notes: "" },
  { name: "Tahiti", lat: 48.8687763, lon: -3.0363471, notes: "" },
  { name: "Kerpont du chien", lat: 48.8522369, lon: -3.0223132, notes: "" },
  { name: "Plage carré du phoque", lat: 48.8501603, lon: -3.0275291, notes: "" },
  { name: "Sud Maudez", lat: 48.8595585, lon: -3.0442819, notes: "" },
  { name: "Grève du Rosedo", lat: 48.8593473, lon: -3.0051324, notes: "" },
  { name: "Grève douce", lat: 48.8535979, lon: -3.006128, notes: "" },
  { name: "Grève distillerie", lat: 48.8573685, lon: -3.0790067, notes: "" },
  { name: "Corps Mort Crouezen", lat: 48.8509361, lon: -2.9940811, notes: "" },
  { name: "Cale Couezen", lat: 48.8500015, lon: -2.9971323, notes: "" },
  { name: "Baies des amandes", lat: 48.8737543, lon: -3.0428222, notes: "" },
  { name: "Le Paradis blanc", lat: 48.8870821, lon: -3.0555197, notes: "" },
  { name: "Surface Land", lat: 48.86474783100325, lon: -3.054084267845765, notes: "" },
  { name: "Ile Vierge", lat: 48.8670469359267, lon: -3.0566622994162866, notes: "" },
];

// Polygones de danger : { name, path: [[lat, lon], ...] }.
const DANGER_ZONES = [
  {
    name: "Danger",
    path: [
      [48.8636076, -3.0331807],
      [48.8634487, -3.0330144],
      [48.8635123, -3.0328749],
      [48.8636746, -3.0329393],
      [48.8638334, -3.0326389],
      [48.8638793, -3.0325209],
      [48.8639499, -3.0326067],
      [48.8639463, -3.0328052],
      [48.8638228, -3.0330949],
      [48.8636922, -3.0332504],
    ],
  },
];

export { LANDMARKS, DANGER_ZONES };
