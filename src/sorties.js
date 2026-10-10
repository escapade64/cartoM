import { supabase, isConfigured } from './supabase.js';

const ACTIVITIES = [
  'Randonnée',
  'Course',
  'Escalade',
  'Ski',
  'Ski de rando',
  'Alpinisme',
  'Surf',
  'Voile',
  'Pêche',
  'Vélo',
  'Autre',
];

const $ = (id) => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function show(id, visible) {
  $(id).hidden = !visible;
}

function setMessage(id, text, isError = false) {
  const el = $(id);
  el.textContent = text || '';
  el.hidden = !text;
  el.classList.toggle('is-error', Boolean(isError));
}

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// "1:30" ou "90" (minutes) ou "1h30" -> minutes ; vide -> null
function parseDuration(value) {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  let m = v.match(/^(\d+)\s*[:h]\s*(\d{0,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  m = v.match(/^(\d+)$/);
  if (m) return Number(m[1]);
  throw new Error('Durée invalide : utilise 1:30, 1h30 ou un nombre de minutes.');
}

function formatDuration(min) {
  if (min == null) return '';
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

function numberOrNull(value, label) {
  const v = String(value).trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} invalide.`);
  return n;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ------------------------------------------------------------------ connexion
async function sendMagicLink(email) {
  const redirect = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Les inscriptions sont fermées côté Supabase ; ici on refuse aussi de créer un compte.
    options: { emailRedirectTo: redirect, shouldCreateUser: false },
  });
  if (error) throw error;
}

async function verifyCode(email, token) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

function initLogin() {
  $('code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const token = $('login-code').value.trim();
    if (!email || !token) return;
    setMessage('login-msg', '');
    $('code-btn').disabled = true;
    try {
      await verifyCode(email, token);
    } catch (err) {
      setMessage('login-msg', `Code refusé : ${err.message}`, true);
    } finally {
      $('code-btn').disabled = false;
    }
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    if (!email) return;
    setMessage('login-msg', '');
    $('login-btn').disabled = true;
    try {
      await sendMagicLink(email);
      setMessage('login-msg', 'Lien envoyé : clique dessus dans le mail. Si le lien ne s’ouvre pas dans cette appli, saisis le code à 6 chiffres du mail ci-dessous.');
      show('code-form', true);
    } catch (err) {
      setMessage('login-msg', `Envoi impossible : ${err.message}`, true);
    } finally {
      $('login-btn').disabled = false;
    }
  });
}

// ----------------------------------------------------------------------- données
async function loadRoutes() {
  const { data, error } = await supabase.from('routes').select('id, name').order('name');
  if (error) throw error;
  return data;
}

async function loadFriends() {
  const { data, error } = await supabase.from('friends').select('id, name').order('name');
  if (error) throw error;
  return data;
}

// Lectures simples de tables, assemblées côté navigateur (pas de jointures
// imbriquées PostgREST : plus robuste, et les listes routes/friends sont déjà en mémoire).
async function loadOutings() {
  const { data: outings, error } = await supabase
    .from('outings')
    .select('id, outing_date, title, activities, route_id, distance_km, elevation_gain_m, duration_min, notes')
    .order('outing_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!outings.length) return [];

  const { data: links, error: linksError } = await supabase
    .from('outing_friends')
    .select('outing_id, friend_id')
    .in('outing_id', outings.map((o) => o.id));
  if (linksError) throw linksError;

  const routeName = new Map(state.routes.map((r) => [r.id, r.name]));
  const friendName = new Map(state.friends.map((f) => [f.id, f.name]));
  return outings.map((o) => ({
    ...o,
    routeName: routeName.get(o.route_id) || null,
    friendNames: links.filter((l) => l.outing_id === o.id).map((l) => friendName.get(l.friend_id)).filter(Boolean),
  }));
}

// Retrouve (ou crée) une ligne par nom dans une table "routes" / "friends".
async function getOrCreateByName(table, name, cache) {
  const key = name.toLowerCase();
  const existing = cache.find((r) => r.name.toLowerCase() === key);
  if (existing) return existing.id;
  const { data, error } = await supabase.from(table).insert({ name }).select('id, name').single();
  if (error) throw error;
  cache.push(data);
  return data.id;
}

// ------------------------------------------------------------------------ vue
const state = { routes: [], friends: [] };

function renderActivityChips() {
  $('activity-chips').innerHTML = ACTIVITIES.map(
    (a) => `<label class="chip"><input type="checkbox" name="activity" value="${escapeHtml(a)}" /><span>${escapeHtml(a)}</span></label>`
  ).join('');
}

function renderDatalists() {
  $('routes-list').innerHTML = state.routes.map((r) => `<option value="${escapeHtml(r.name)}"></option>`).join('');
  $('friends-list').innerHTML = state.friends.map((f) => `<option value="${escapeHtml(f.name)}"></option>`).join('');
}

function renderOutings(outings) {
  const list = $('outings-list');
  $('outings-count').textContent = outings.length ? `(${outings.length})` : '';
  if (!outings.length) {
    list.innerHTML = '<li class="empty">Aucune sortie enregistrée pour l’instant.</li>';
    return;
  }
  list.innerHTML = outings
    .map((o) => {
      const date = dateFmt.format(new Date(`${o.outing_date}T12:00:00`));
      const stats = [
        o.distance_km != null ? `${Number(o.distance_km)} km` : null,
        o.elevation_gain_m != null ? `D+ ${o.elevation_gain_m} m` : null,
        o.duration_min != null ? formatDuration(o.duration_min) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const friends = o.friendNames || [];
      return `<li class="outing" data-id="${o.id}">
        <div class="outing-head">
          <strong>${escapeHtml(o.title)}</strong>
          <button type="button" class="link-btn" data-delete="${o.id}" aria-label="Supprimer cette sortie">Supprimer</button>
        </div>
        <div class="outing-meta">${escapeHtml(date)}${o.activities?.length ? ` · ${escapeHtml(o.activities.join(', '))}` : ''}</div>
        ${o.routeName ? `<div class="outing-meta">Itinéraire : ${escapeHtml(o.routeName)}</div>` : ''}
        ${stats ? `<div class="outing-meta">${escapeHtml(stats)}</div>` : ''}
        ${friends.length ? `<div class="outing-meta">Avec : ${escapeHtml(friends.join(', '))}</div>` : ''}
        ${o.notes ? `<div class="outing-notes">${escapeHtml(o.notes)}</div>` : ''}
      </li>`;
    })
    .join('');
}

async function refreshOutings() {
  renderOutings(await loadOutings());
}

async function submitOuting(form) {
  const fd = new FormData(form);
  const title = String(fd.get('title')).trim();
  const date = String(fd.get('date'));
  if (!title) throw new Error('Le titre est obligatoire.');
  if (!date) throw new Error('La date est obligatoire.');

  const activities = fd.getAll('activity').map(String);
  const routeName = String(fd.get('route')).trim();
  const friendNames = String(fd.get('friends'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    outing_date: date,
    title,
    activities,
    distance_km: numberOrNull(fd.get('distance'), 'Distance'),
    elevation_gain_m: numberOrNull(fd.get('gain'), 'D+'),
    elevation_loss_m: numberOrNull(fd.get('loss'), 'D-'),
    duration_min: parseDuration(String(fd.get('duration'))),
    start_point: String(fd.get('start_point')).trim() || null,
    notes: String(fd.get('notes')).trim() || null,
  };
  if (routeName) payload.route_id = await getOrCreateByName('routes', routeName, state.routes);

  const { data: outing, error } = await supabase.from('outings').insert(payload).select('id').single();
  if (error) throw error;

  if (friendNames.length) {
    const unique = [...new Set(friendNames.map((n) => n.toLowerCase()))].map((k) => friendNames.find((n) => n.toLowerCase() === k));
    const friendIds = [];
    for (const name of unique) friendIds.push(await getOrCreateByName('friends', name, state.friends));
    const { error: linkError } = await supabase
      .from('outing_friends')
      .insert(friendIds.map((friend_id) => ({ outing_id: outing.id, friend_id })));
    if (linkError) throw linkError;
  }
  renderDatalists();
}

function initForm() {
  const form = $('outing-form');
  renderActivityChips();
  form.elements.date.value = todayIso();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage('form-msg', '');
    $('save-btn').disabled = true;
    try {
      await submitOuting(form);
      form.reset();
      form.elements.date.value = todayIso();
      setMessage('form-msg', 'Sortie enregistrée.');
      await refreshOutings();
    } catch (err) {
      setMessage('form-msg', err.message || 'Enregistrement impossible.', true);
    } finally {
      $('save-btn').disabled = false;
    }
  });

  $('outings-list').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-delete]')?.dataset.delete;
    if (!id) return;
    if (!window.confirm('Supprimer cette sortie ?')) return;
    const { error } = await supabase.from('outings').delete().eq('id', id);
    if (error) return setMessage('form-msg', `Suppression impossible : ${error.message}`, true);
    await refreshOutings();
  });
}

async function showApp(session) {
  show('login-view', false);
  show('app-view', true);
  $('user-email').textContent = session.user.email;
  try {
    [state.routes, state.friends] = await Promise.all([loadRoutes(), loadFriends()]);
    renderDatalists();
    await refreshOutings();
  } catch (err) {
    setMessage('form-msg', `Chargement impossible : ${err.message}`, true);
  }
}

function showLogin() {
  show('app-view', false);
  show('login-view', true);
}

async function main() {
  if (!isConfigured) {
    show('login-view', false);
    show('setup-view', true);
    return;
  }
  initLogin();
  initForm();
  $('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  // Une seule inscription : réagit à la connexion, au renouvellement et à la déconnexion.
  let shownFor = null;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      shownFor = null;
      return showLogin();
    }
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      if (shownFor === session.user.id) return; // SIGNED_IN est ré-émis au retour sur l'onglet
      shownFor = session.user.id;
      showApp(session);
    }
  });
}

main();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => console.warn('Service worker non enregistré', err));
  });
}
