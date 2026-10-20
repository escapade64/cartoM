// Lieux CartoPy (points + segments) : Supabase est la source, avec une copie locale
// pour consulter la carte hors ligne. Ce module est compilé par Vite vers
// js/places-store.js (nom stable) pour être importé par les pages CartoPy historiques.
import { supabase, isConfigured } from './supabase.js';

const CACHE_KEY = 'cartom-places-cache-v1';
const FETCH_TIMEOUT_MS = 6000;

// --- conversion base <-> objets CartoPy ---------------------------------------
const num = (v) => (v === null || v === undefined ? null : Number(v));

export function rowToPoint(r) {
  const p = { id: r.id, category: r.category, name: r.name, lat: r.lat, lon: r.lon, notes: r.notes || '' };
  if (r.altitude !== null && r.altitude !== undefined) p.altitude = Number(r.altitude);
  return p;
}
export function pointToRow(p) {
  return {
    id: p.id,
    category: p.category,
    name: p.name,
    altitude: Number.isFinite(p.altitude) ? p.altitude : null,
    lat: p.lat,
    lon: p.lon,
    notes: p.notes || '',
  };
}
export function rowToSegment(r) {
  return {
    id: r.id,
    name: r.name || '',
    fromId: r.from_id,
    toId: r.to_id,
    distanceKm: num(r.distance_km),
    dPlus: num(r.d_plus),
    dMinus: num(r.d_minus),
    notes: r.notes || '',
  };
}
export function segmentToRow(s) {
  return {
    id: s.id,
    name: s.name || '',
    from_id: s.fromId,
    to_id: s.toId,
    distance_km: Number.isFinite(s.distanceKm) ? s.distanceKm : null,
    d_plus: Number.isFinite(s.dPlus) ? s.dPlus : null,
    d_minus: Number.isFinite(s.dMinus) ? s.dMinus : null,
    notes: s.notes || '',
  };
}

// --- copie locale (effacée à la déconnexion) ----------------------------------
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && Array.isArray(c.points) && Array.isArray(c.segments) ? c : null;
  } catch {
    return null;
  }
}
function writeCache(points, segments) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ points, segments, fetchedAt: new Date().toISOString() }));
  } catch {
    /* stockage plein ou refusé : tant pis, pas de mode hors ligne */
  }
}
export function clearPlacesCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') clearPlacesCache();
  });
}

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS)),
  ]);
}

async function fetchAll() {
  const [p, s] = await withTimeout(
    Promise.all([
      supabase.from('places').select('id, category, name, altitude, lat, lon, notes').order('name'),
      supabase.from('place_segments').select('id, name, from_id, to_id, distance_km, d_plus, d_minus, notes'),
    ])
  );
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  return { points: p.data.map(rowToPoint), segments: s.data.map(rowToSegment) };
}

// Renvoie { points, segments, source: 'online' | 'cache', fetchedAt }.
// Lève une erreur avec .code : 'not-configured' | 'auth' | 'offline'.
export async function loadPlaces() {
  const fail = (code, message) => Object.assign(new Error(message), { code });
  if (!isConfigured) throw fail('not-configured', 'Supabase n’est pas configuré sur ce site.');

  let session = null;
  try {
    ({ data: { session } } = await withTimeout(supabase.auth.getSession()));
  } catch {
    /* hors ligne : on retombe sur la copie locale ci-dessous */
  }

  // Appareil en mode avion : inutile d'attendre les tentatives réseau, copie locale tout de suite.
  if (session && navigator.onLine !== false) {
    try {
      const data = await fetchAll();
      writeCache(data.points, data.segments);
      return { ...data, source: 'online', fetchedAt: new Date().toISOString() };
    } catch (err) {
      const authError = err && (err.status === 401 || err.status === 403 || err.code === 'PGRST301');
      if (authError) {
        clearPlacesCache();
        throw fail('auth', 'Session expirée : reconnecte-toi.');
      }
      // erreur réseau / timeout : copie locale si elle existe
    }
  } else if (!session && navigator.onLine !== false) {
    clearPlacesCache();
    throw fail('auth', 'Connexion requise.');
  }

  const cached = readCache();
  if (cached) return { points: cached.points, segments: cached.segments, source: 'cache', fetchedAt: cached.fetchedAt };
  throw fail('offline', 'Hors ligne et aucune copie locale : ouvre d’abord la carte avec du réseau.');
}

// Enregistre l'état de l'éditeur. Ne supprime que les éléments chargés à l'ouverture
// (loadedPointIds / loadedSegmentIds) : un point ajouté depuis un autre appareil entre
// temps n'est jamais effacé par erreur.
export async function savePlaces({ points, segments, loadedPointIds, loadedSegmentIds }) {
  const keepPoints = new Set(points.map((p) => p.id));
  const keepSegments = new Set(segments.map((s) => s.id));
  const delSegments = [...loadedSegmentIds].filter((id) => !keepSegments.has(id));
  const delPoints = [...loadedPointIds].filter((id) => !keepPoints.has(id));

  // Ordre imposé par les clés étrangères : segments retirés -> points -> segments -> points retirés.
  if (delSegments.length) {
    const { error } = await supabase.from('place_segments').delete().in('id', delSegments);
    if (error) throw error;
  }
  if (points.length) {
    const { error } = await supabase.from('places').upsert(points.map(pointToRow), { onConflict: 'user_id,id' });
    if (error) throw error;
  }
  if (segments.length) {
    const { error } = await supabase.from('place_segments').upsert(segments.map(segmentToRow), { onConflict: 'user_id,id' });
    if (error) throw error;
  }
  if (delPoints.length) {
    const { error } = await supabase.from('places').delete().in('id', delPoints);
    if (error) throw error;
  }
  writeCache(points, segments);
}
