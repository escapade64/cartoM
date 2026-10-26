// Activités du journal et champs propres à chacune.
// Les champs "col" sont des colonnes de la table outings ; les champs "extra" vont dans
// la colonne jsonb outings.extra (clé indiquée).

export const ACTIVITIES = [
  'Randonnée',
  'Course',
  'Running',
  'Ski',
  'Ski de rando',
  'Escalade',
  'Surf',
  'Windsurf',
  'Pêche',
  'Vélo',
  'Autre',
];

// Activités "mer" : la carte se centre sur les spots, et un nouveau lieu est proposé
// dans la catégorie correspondante.
export const SEA_ACTIVITIES = ['Surf', 'Windsurf', 'Pêche'];
export const DEFAULT_PLACE_CATEGORY = { Surf: 'surf', Windsurf: 'windsurf' };

const WIND_DIRS = ['', 'N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export const FIELDS = {
  distance: { label: 'Dist. (km)', col: 'distance_km', type: 'decimal' },
  gain: { label: 'D+ (m)', col: 'elevation_gain_m', type: 'int' },
  loss: { label: 'D- (m)', col: 'elevation_loss_m', type: 'int' },
  duration: { label: 'Durée', col: 'duration_min', type: 'duration', placeholder: '1h30' },
  grade: { label: 'Cotation', extra: 'grade', type: 'text', placeholder: 'F, PD, AD…' },
  avalanche: { label: 'Risque aval.', extra: 'avalanche_risk', type: 'select', options: ['', '1', '2', '3', '4', '5'] },
  snow: { label: 'Neige', extra: 'snow', type: 'text', placeholder: 'poudre, moquette, croûte…', wide: true },
  grade_max: { label: 'Cotation max', extra: 'grade_max', type: 'text', placeholder: '6a' },
  climbs: { label: 'Voies réalisées', extra: 'climbs', type: 'textarea', wide: true },
  swell: { label: 'Houle (m)', extra: 'swell_m', type: 'decimal' },
  period: { label: 'Période (s)', extra: 'swell_period_s', type: 'int' },
  wind_dir: { label: 'Vent (dir.)', extra: 'wind_dir', type: 'select', options: WIND_DIRS },
  wind_kt: { label: 'Vent (nds)', extra: 'wind_kt', type: 'int' },
  sail: { label: 'Voile (m²)', extra: 'sail_m2', type: 'decimal' },
  tide_coef: { label: 'Coef. marée', extra: 'tide_coef', type: 'int' },
  baits: { label: 'Appâts', extra: 'baits', type: 'text', wide: true },
  catches: { label: 'Prises', extra: 'catches', type: 'textarea', placeholder: '2 bars de 45 cm, 1 lieu jaune…', wide: true },
};

export const ACTIVITY_FIELDS = {
  Randonnée: ['distance', 'gain', 'loss', 'duration', 'grade'],
  Course: ['distance', 'gain', 'loss', 'duration'],
  Running: ['distance', 'gain', 'loss', 'duration'],
  Ski: ['duration', 'snow'],
  'Ski de rando': ['distance', 'gain', 'loss', 'duration', 'avalanche', 'snow'],
  Escalade: ['grade_max', 'duration', 'climbs'],
  Surf: ['swell', 'period', 'wind_dir', 'wind_kt', 'duration'],
  Windsurf: ['wind_kt', 'wind_dir', 'sail', 'duration'],
  Pêche: ['tide_coef', 'duration', 'baits', 'catches'],
  Vélo: ['distance', 'gain', 'duration'],
  Autre: ['duration'],
};

export function fieldsFor(activity) {
  return ACTIVITY_FIELDS[activity] || ACTIVITY_FIELDS.Autre;
}

// Clés "extra" gérées par le formulaire (les autres clés éventuelles sont conservées).
export const KNOWN_EXTRA_KEYS = Object.values(FIELDS)
  .map((f) => f.extra)
  .filter(Boolean);

// ------------------------------------------------------------------ conversions
export function parseDuration(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  let m = v.match(/^(\d+)\s*[:h]\s*(\d{0,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  m = v.match(/^(\d+)$/);
  if (m) return Number(m[1]);
  throw new Error('Durée invalide : utilise 1:30, 1h30 ou un nombre de minutes.');
}

export function formatDuration(min) {
  if (min == null) return '';
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

function parseNumber(value, label, integer) {
  const v = String(value ?? '').trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) throw new Error(`${label} invalide.`);
  return n;
}

// Valeur saisie (texte) -> valeur stockée.
export function parseField(key, raw) {
  const f = FIELDS[key];
  const label = f.label.replace(/\s*\(.*\)$/, '');
  if (f.type === 'duration') return parseDuration(raw);
  if (f.type === 'decimal') return parseNumber(raw, label, false);
  if (f.type === 'int') return parseNumber(raw, label, true);
  if (f.type === 'select' && FIELDS[key].options.every((o) => o === '' || /^\d+$/.test(o))) {
    return raw ? Number(raw) : null;
  }
  const t = String(raw ?? '').trim();
  return t || null;
}

// Valeur stockée -> texte du champ.
export function formatField(key, value) {
  if (value == null) return '';
  if (FIELDS[key].type === 'duration') return formatDuration(value);
  return String(value);
}

export function storedValue(outing, key) {
  const f = FIELDS[key];
  return f.col ? outing[f.col] : outing.extra?.[f.extra];
}

const num = (v) => String(Number(v)).replace('.', ',');

// Résumé d'une sortie pour la liste : une ligne de chiffres + lignes de texte.
export function summarize(outing) {
  const keys = fieldsFor(outing.activity);
  const has = (k) => keys.includes(k) && storedValue(outing, k) != null && storedValue(outing, k) !== '';
  const v = (k) => storedValue(outing, k);
  const stats = [];
  if (has('swell')) stats.push(`Houle ${num(v('swell'))} m`);
  if (has('period')) stats.push(`${v('period')} s`);
  if (has('wind_dir') || has('wind_kt')) {
    stats.push(['Vent', has('wind_dir') ? v('wind_dir') : null, has('wind_kt') ? `${v('wind_kt')} nds` : null].filter(Boolean).join(' '));
  }
  if (has('sail')) stats.push(`Voile ${num(v('sail'))} m²`);
  if (has('tide_coef')) stats.push(`Coef ${v('tide_coef')}`);
  if (has('distance')) stats.push(`${num(v('distance'))} km`);
  if (has('gain')) stats.push(`D+ ${v('gain')} m`);
  if (has('loss')) stats.push(`D- ${v('loss')} m`);
  if (has('duration')) stats.push(formatDuration(v('duration')));
  if (has('grade')) stats.push(v('grade'));
  if (has('grade_max')) stats.push(`max ${v('grade_max')}`);
  if (has('avalanche')) stats.push(`Risque ${v('avalanche')}`);
  const lines = [];
  if (has('snow')) lines.push(`Neige : ${v('snow')}`);
  if (has('climbs')) lines.push(`Voies : ${v('climbs')}`);
  if (has('baits')) lines.push(`Appâts : ${v('baits')}`);
  if (has('catches')) lines.push(`Prises : ${v('catches')}`);
  return { stats: stats.join(' · '), lines };
}
