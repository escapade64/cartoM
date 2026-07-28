// Moteur de calcul de marée à partir d'une série d'extrema (pleine mer / basse mer alternés).
// Chaque série est un tableau [ [timestamp_ms, hauteur_m], ... ] trié par timestamp croissant.

const tideSeriesCache = new Map();

async function loadTideSeries(url) {
  if (tideSeriesCache.has(url)) return tideSeriesCache.get(url);
  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Impossible de charger ${url} (${res.status})`);
      return res.json();
    })
    .then((series) => series.slice().sort((a, b) => a[0] - b[0]));
  tideSeriesCache.set(url, promise);
  return promise;
}

// Trouve l'index i tel que series[i][0] <= t < series[i+1][0]. Retourne -1 si t est avant le début.
function findSegment(series, t) {
  if (t < series[0][0]) return -1;
  if (t >= series[series.length - 1][0]) return series.length - 1;
  let lo = 0;
  let hi = series.length - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= t && t < series[mid + 1][0]) return mid;
    if (series[mid][0] > t) hi = mid - 1;
    else lo = mid + 1;
  }
  return -1;
}

// Interpolation en cosinus entre deux extrema consécutifs, approximation standard
// d'une courbe de marée semi-diurne entre une pleine mer et une basse mer.
function cosineHeight(t1, h1, t2, h2, t) {
  const x = (t - t1) / (t2 - t1);
  return h1 + (h2 - h1) * (1 - Math.cos(Math.PI * x)) / 2;
}

// Hauteur d'eau à l'instant t (ms epoch). Retourne null si t est hors de la plage de données.
function heightAt(series, t) {
  const i = findSegment(series, t);
  if (i === -1 || i === series.length - 1) return null;
  const [t1, h1] = series[i];
  const [t2, h2] = series[i + 1];
  return cosineHeight(t1, h1, t2, h2, t);
}

// État complet de la marée à l'instant t : hauteur, sens (montante/descendante)
// et prochain extremum (heure + hauteur de la prochaine pleine/basse mer).
// Retourne des valeurs null si t est hors de la plage de données.
function tideState(series, t) {
  const i = findSegment(series, t);
  if (i === -1 || i === series.length - 1) {
    return { height: null, direction: null, nextExtremum: null };
  }
  const [t1, h1] = series[i];
  const [t2, h2] = series[i + 1];
  return {
    height: cosineHeight(t1, h1, t2, h2, t),
    direction: h2 > h1 ? 'rising' : 'falling',
    nextExtremum: { time: t2, height: h2 },
  };
}

// Statut au seuil donné : "open" (>= seuil), "closed" (< seuil), ou "unknown" (hors plage).
function statusAt(series, t, thresholdMin) {
  const h = heightAt(series, t);
  if (h === null) return { status: 'unknown', height: null };
  return { status: h >= thresholdMin ? 'open' : 'closed', height: h };
}

// Résout l'instant de franchissement du seuil dans un segment monotone [t1,h1]-[t2,h2], si présent.
function crossingInSegment(t1, h1, t2, h2, thresholdMin) {
  if (h1 === h2) return null;
  const lo = Math.min(h1, h2);
  const hi = Math.max(h1, h2);
  if (thresholdMin <= lo || thresholdMin > hi) return null;
  // h(t) = h1 + (h2-h1)*(1-cos(pi*x))/2  =>  cos(pi*x) = 1 - 2*(threshold-h1)/(h2-h1)
  const cosVal = 1 - (2 * (thresholdMin - h1)) / (h2 - h1);
  const clamped = Math.max(-1, Math.min(1, cosVal));
  const x = Math.acos(clamped) / Math.PI;
  return t1 + x * (t2 - t1);
}

// Calcule les prochaines transitions d'état (ouverture/fermeture) à partir de l'instant t.
// Retourne un tableau de { time, becomes: 'open'|'closed' }, au plus `count` éléments.
function nextTransitions(series, t, thresholdMin, count = 2) {
  const results = [];
  const startIdx = findSegment(series, t);
  if (startIdx === -1) return results; // avant le début des données
  for (let i = Math.max(startIdx, 0); i < series.length - 1 && results.length < count; i++) {
    const [t1, h1] = series[i];
    const [t2, h2] = series[i + 1];
    const crossing = crossingInSegment(t1, h1, t2, h2, thresholdMin);
    if (crossing !== null && crossing > t) {
      results.push({ time: crossing, becomes: h2 > h1 ? 'open' : 'closed' });
    }
  }
  return results;
}

function dataRangeEndsWithin(series, t, days) {
  const lastTs = series[series.length - 1][0];
  return lastTs - t < days * 24 * 3600 * 1000;
}

export { loadTideSeries, heightAt, tideState, statusAt, nextTransitions, dataRangeEndsWithin };
