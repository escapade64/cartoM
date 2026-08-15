import { POINTS } from './points.js';
import { loadTideSeries, statusAt, nextTransitions, dataRangeEndsWithin } from './tide.js';

const BREHAT_TIDE_SOURCE = 'data/tidedata.json';
const BOAT_DRAFT_M = 0.3; // même valeur que index.html — tirant d'eau du bateau
const DAYS_AHEAD = 14;

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(ms) {
  return dateFmt.format(new Date(ms));
}

function formatTime(ms) {
  return timeFmt.format(new Date(ms));
}

function showDataWarning(message) {
  const el = document.getElementById('data-warning');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

// Calcule les fenêtres où la hauteur d'eau est >= seuil sur [dayStart, dayEnd).
// Retourne null si hors plage de données, sinon un tableau de [debut, fin] (ms).
function computeOpenWindows(series, dayStart, dayEnd, thresholdMin) {
  const startInfo = statusAt(series, dayStart, thresholdMin);
  if (startInfo.status === 'unknown') return null;

  const windows = [];
  let segStart = dayStart;
  let segOpen = startInfo.status === 'open';
  let t = dayStart;

  while (true) {
    const next = nextTransitions(series, t, thresholdMin, 1)[0];
    if (!next || next.time >= dayEnd) break;
    if (segOpen) windows.push([segStart, next.time]);
    segStart = next.time;
    segOpen = !segOpen;
    t = next.time + 1000;
  }
  if (segOpen) windows.push([segStart, dayEnd]);
  return windows;
}

// Traduit les fenêtres d'ouverture en phrase (« ouvert de 06h12 à 10h45 et à partir de 18h30 »).
function formatPassage(series, dayStart, dayEnd, thresholdMin) {
  const windows = computeOpenWindows(series, dayStart, dayEnd, thresholdMin);
  if (windows === null) return 'donnée indisponible';
  if (windows.length === 0) return 'fermé toute la journée';
  if (windows.length === 1 && windows[0][0] <= dayStart && windows[0][1] >= dayEnd) {
    return 'ouvert toute la journée';
  }
  const parts = windows.map(([start, end]) => {
    const startsAtDayStart = start <= dayStart;
    const endsAtDayEnd = end >= dayEnd;
    if (startsAtDayStart) return `jusqu'à ${formatTime(end)}`;
    if (endsAtDayEnd) return `à partir de ${formatTime(start)}`;
    return `de ${formatTime(start)} à ${formatTime(end)}`;
  });
  return `ouvert ${parts.join(' et ')}`;
}

function buildDayBlock(series, pescadou, dayStartMs, dayEndMs) {
  const section = document.createElement('section');
  section.className = 'day-block';

  const h2 = document.createElement('h2');
  h2.textContent = formatDate(dayStartMs);
  section.appendChild(h2);

  if (pescadou) {
    const threshold = pescadou.thresholdMin + BOAT_DRAFT_M;
    const p = document.createElement('p');
    p.className = 'passage-line';
    p.innerHTML =
      `<strong>${pescadou.name}</strong> (seuil ${pescadou.thresholdMin.toFixed(2)} m + ${BOAT_DRAFT_M.toFixed(2)} m tirant d'eau) : ` +
      formatPassage(series, dayStartMs, dayEndMs, threshold);
    section.appendChild(p);
  }

  const ul = document.createElement('ul');
  ul.className = 'tide-list';
  let found = false;
  for (let i = 0; i < series.length; i++) {
    const [t, h] = series[i];
    if (t < dayStartMs) continue;
    if (t >= dayEndMs) break;
    found = true;
    const prevH = i > 0 ? series[i - 1][1] : null;
    const isHigh = prevH === null ? null : h > prevH;
    const typeLabel = isHigh === null ? 'Marée' : isHigh ? 'Pleine mer' : 'Basse mer';
    const typeClass = isHigh === null ? '' : isHigh ? 'high' : 'low';
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="tide-type ${typeClass}">${typeLabel}</span>` +
      `<span class="tide-time">${formatTime(t)}</span>` +
      `<span class="tide-height">${h.toFixed(2)} m</span>`;
    ul.appendChild(li);
  }
  if (!found) {
    const li = document.createElement('li');
    li.textContent = 'Donnée indisponible pour ce jour.';
    ul.appendChild(li);
  }
  section.appendChild(ul);

  return section;
}

async function init() {
  const series = await loadTideSeries(BREHAT_TIDE_SOURCE);
  const pescadou = POINTS.find((p) => p.id === 'mouillage-pescadou');

  const container = document.getElementById('planning');
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + d);
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayStartMs + 24 * 3600 * 1000;
    container.appendChild(buildDayBlock(series, pescadou, dayStartMs, dayEndMs));
  }

  if (dataRangeEndsWithin(series, Date.now(), 7)) {
    const lastTs = series[series.length - 1][0];
    const daysLeft = Math.max(0, Math.round((lastTs - Date.now()) / (24 * 3600 * 1000)));
    showDataWarning(
      `⚠ Les données de marée arrivent à échéance dans ${daysLeft} jour(s) — pensez à mettre à jour data/tidedata.json.`
    );
  }

  document.getElementById('last-update').textContent = `Généré le ${formatDate(Date.now())} à ${formatTime(Date.now())}`;
}

init().catch((err) => {
  console.error(err);
  showDataWarning(`Erreur de chargement des données de marée : ${err.message}`);
});
