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

async function loadGear() {
  const { data, error } = await supabase.from('gear').select('id, name').order('name');
  if (error) throw error;
  return data;
}

// Lectures simples de tables, assemblées côté navigateur (pas de jointures
// imbriquées PostgREST : plus robuste, et les listes routes/friends sont déjà en mémoire).
async function loadOutings() {
  const { data: outings, error } = await supabase
    .from('outings')
    .select(
      'id, outing_date, title, activities, route_id, distance_km, elevation_gain_m, elevation_loss_m, duration_min, start_point, notes'
    )
    .order('outing_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!outings.length) return [];

  const outingIds = outings.map((o) => o.id);
  const [friendLinks, gearLinks] = await Promise.all([
    supabase.from('outing_friends').select('outing_id, friend_id').in('outing_id', outingIds),
    supabase.from('outing_gear').select('outing_id, gear_id').in('outing_id', outingIds),
  ]);
  if (friendLinks.error) throw friendLinks.error;
  if (gearLinks.error) throw gearLinks.error;

  const routeName = new Map(state.routes.map((r) => [r.id, r.name]));
  const friendName = new Map(state.friends.map((f) => [f.id, f.name]));
  const gearName = new Map(state.gear.map((g) => [g.id, g.name]));
  return outings.map((o) => {
    const friendIds = friendLinks.data.filter((l) => l.outing_id === o.id).map((l) => l.friend_id);
    const gearIds = gearLinks.data.filter((l) => l.outing_id === o.id).map((l) => l.gear_id);
    return {
      ...o,
      routeName: routeName.get(o.route_id) || null,
      friendIds,
      friendNames: friendIds.map((id) => friendName.get(id)).filter(Boolean),
      gearIds,
      gearNames: gearIds.map((id) => gearName.get(id)).filter(Boolean),
    };
  });
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
const state = {
  routes: [],
  friends: [],
  gear: [],
  outings: [], // dernière liste affichée (sert à pré-remplir le formulaire d'édition)
  editing: null, // { id, friendIds, gearIds, extraActivities } quand une sortie est en cours de modification
};

function renderActivityChips() {
  $('activity-chips').innerHTML = ACTIVITIES.map(
    (a) => `<label class="chip"><input type="checkbox" name="activity" value="${escapeHtml(a)}" /><span>${escapeHtml(a)}</span></label>`
  ).join('');
}

function renderDatalists() {
  $('routes-list').innerHTML = state.routes.map((r) => `<option value="${escapeHtml(r.name)}"></option>`).join('');
  $('friends-list').innerHTML = state.friends.map((f) => `<option value="${escapeHtml(f.name)}"></option>`).join('');
  $('gear-list').innerHTML = state.gear.map((g) => `<option value="${escapeHtml(g.name)}"></option>`).join('');
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
      const gear = o.gearNames || [];
      const editing = state.editing?.id === o.id;
      return `<li class="outing${editing ? ' is-editing' : ''}" data-id="${o.id}" tabindex="0" aria-label="Modifier la sortie ${escapeHtml(o.title)}">
        <div class="outing-head">
          <strong>${escapeHtml(o.title)}</strong>
          <button type="button" class="link-btn" data-delete="${o.id}" aria-label="Supprimer cette sortie">Supprimer</button>
        </div>
        <div class="outing-meta">${escapeHtml(date)}${o.activities?.length ? ` · ${escapeHtml(o.activities.join(', '))}` : ''}</div>
        ${o.routeName ? `<div class="outing-meta">Itinéraire : ${escapeHtml(o.routeName)}</div>` : ''}
        ${stats ? `<div class="outing-meta">${escapeHtml(stats)}</div>` : ''}
        ${friends.length ? `<div class="outing-meta">Avec : ${escapeHtml(friends.join(', '))}</div>` : ''}
        ${gear.length ? `<div class="outing-meta">Matériel : ${escapeHtml(gear.join(', '))}</div>` : ''}
        ${o.notes ? `<div class="outing-notes">${escapeHtml(o.notes)}</div>` : ''}
      </li>`;
    })
    .join('');
}

async function refreshOutings() {
  state.outings = await loadOutings();
  renderOutings(state.outings);
}

// Noms séparés par des virgules, sans doublon (casse ignorée, première graphie conservée).
function uniqueNames(value) {
  const names = [];
  for (const name of String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

// Aligne une table de liaison (outing_friends / outing_gear) sur la nouvelle liste :
// ne supprime que les liens retirés et n'ajoute que les nouveaux.
async function syncLinks(table, column, outingId, previousIds, newIds) {
  const removed = previousIds.filter((id) => !newIds.includes(id));
  const added = newIds.filter((id) => !previousIds.includes(id));
  if (removed.length) {
    const { error } = await supabase.from(table).delete().eq('outing_id', outingId).in(column, removed);
    if (error) throw error;
  }
  if (added.length) {
    const { error } = await supabase.from(table).insert(added.map((id) => ({ outing_id: outingId, [column]: id })));
    if (error) throw error;
  }
}

// Lit le formulaire ; lève une Error lisible si un champ est invalide.
function readForm(form) {
  const fd = new FormData(form);
  const title = String(fd.get('title')).trim();
  const date = String(fd.get('date'));
  if (!title) throw new Error('Le titre est obligatoire.');
  if (!date) throw new Error('La date est obligatoire.');

  // En modification, les activités absentes de la liste proposée (ex. saisies
  // autrement) sont conservées telles quelles au lieu d'être effacées en silence.
  const activities = [...fd.getAll('activity').map(String), ...(state.editing?.extraActivities || [])];
  return {
    routeName: String(fd.get('route')).trim(),
    friendNames: uniqueNames(fd.get('friends')),
    gearNames: uniqueNames(fd.get('gear')),
    payload: {
      outing_date: date,
      title,
      activities,
      distance_km: numberOrNull(fd.get('distance'), 'Distance'),
      elevation_gain_m: numberOrNull(fd.get('gain'), 'D+'),
      elevation_loss_m: numberOrNull(fd.get('loss'), 'D-'),
      duration_min: parseDuration(String(fd.get('duration'))),
      start_point: String(fd.get('start_point')).trim() || null,
      notes: String(fd.get('notes')).trim() || null,
    },
  };
}

async function saveOuting(form) {
  const { routeName, friendNames, gearNames, payload } = readForm(form);
  // Itinéraire vidé en modification => la sortie est détachée de son itinéraire.
  payload.route_id = routeName ? await getOrCreateByName('routes', routeName, state.routes) : null;
  const friendIds = [];
  for (const name of friendNames) friendIds.push(await getOrCreateByName('friends', name, state.friends));
  const gearIds = [];
  for (const name of gearNames) gearIds.push(await getOrCreateByName('gear', name, state.gear));

  let outingId;
  let previousFriendIds = [];
  let previousGearIds = [];
  if (state.editing) {
    outingId = state.editing.id;
    previousFriendIds = state.editing.friendIds;
    previousGearIds = state.editing.gearIds;
    const { data, error } = await supabase.from('outings').update(payload).eq('id', outingId).select('id');
    if (error) throw error;
    // La sécurité (RLS) renvoie "0 ligne" plutôt qu'une erreur si la sortie n'est plus accessible.
    if (!data?.length) throw new Error('Sortie introuvable (supprimée depuis un autre appareil ?).');
  } else {
    const { data, error } = await supabase.from('outings').insert(payload).select('id').single();
    if (error) throw error;
    outingId = data.id;
  }

  await syncLinks('outing_friends', 'friend_id', outingId, previousFriendIds, friendIds);
  await syncLinks('outing_gear', 'gear_id', outingId, previousGearIds, gearIds);
  renderDatalists();
}

// ------------------------------------------------------------ mode modification
function setFormMode(editing) {
  $('form-title').textContent = editing ? 'Modifier la sortie' : 'Nouvelle sortie';
  $('save-btn').textContent = editing ? 'Enregistrer les modifications' : 'Enregistrer la sortie';
  $('cancel-btn').hidden = !editing;
}

function resetForm(form) {
  form.reset();
  form.elements.date.value = todayIso();
}

function stopEditing(form) {
  state.editing = null;
  setFormMode(false);
  resetForm(form);
  renderOutings(state.outings);
}

function startEditing(form, outing) {
  state.editing = {
    id: outing.id,
    friendIds: outing.friendIds || [],
    gearIds: outing.gearIds || [],
    extraActivities: (outing.activities || []).filter((a) => !ACTIVITIES.includes(a)),
  };
  setFormMode(true);
  setMessage('form-msg', '');
  const el = form.elements;
  el.date.value = outing.outing_date;
  el.title.value = outing.title;
  el.route.value = outing.routeName || '';
  el.distance.value = outing.distance_km ?? '';
  el.gain.value = outing.elevation_gain_m ?? '';
  el.loss.value = outing.elevation_loss_m ?? '';
  el.duration.value = formatDuration(outing.duration_min);
  el.start_point.value = outing.start_point || '';
  el.friends.value = (outing.friendNames || []).join(', ');
  el.gear.value = (outing.gearNames || []).join(', ');
  el.notes.value = outing.notes || '';
  form.querySelectorAll('input[name=activity]').forEach((box) => {
    box.checked = (outing.activities || []).includes(box.value);
  });
  renderOutings(state.outings);
  $('outing-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.title.focus({ preventScroll: true });
}

function initForm() {
  const form = $('outing-form');
  renderActivityChips();
  resetForm(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage('form-msg', '');
    $('save-btn').disabled = true;
    const wasEditing = Boolean(state.editing);
    try {
      await saveOuting(form);
      state.editing = null;
      setFormMode(false);
      resetForm(form);
      setMessage('form-msg', wasEditing ? 'Sortie modifiée.' : 'Sortie enregistrée.');
      await refreshOutings();
    } catch (err) {
      setMessage('form-msg', err.message || 'Enregistrement impossible.', true);
    } finally {
      $('save-btn').disabled = false;
    }
  });

  $('cancel-btn').addEventListener('click', () => {
    setMessage('form-msg', '');
    stopEditing(form);
  });

  const list = $('outings-list');
  list.addEventListener('click', async (e) => {
    const deleteId = e.target.closest('[data-delete]')?.dataset.delete;
    if (deleteId) {
      if (!window.confirm('Supprimer cette sortie ?')) return;
      const { error } = await supabase.from('outings').delete().eq('id', deleteId);
      if (error) return setMessage('form-msg', `Suppression impossible : ${error.message}`, true);
      if (state.editing?.id === deleteId) {
        state.editing = null;
        setFormMode(false);
        resetForm(form);
      }
      return refreshOutings();
    }
    const id = e.target.closest('.outing')?.dataset.id;
    const outing = state.outings.find((o) => o.id === id);
    if (outing) startEditing(form, outing);
  });
  // Clavier : Entrée ou Espace sur une sortie ouvre la modification.
  list.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.classList.contains('outing')) return;
    e.preventDefault();
    const outing = state.outings.find((o) => o.id === e.target.dataset.id);
    if (outing) startEditing(form, outing);
  });
}

async function showApp(session) {
  show('login-view', false);
  show('app-view', true);
  $('user-email').textContent = session.user.email;
  try {
    [state.routes, state.friends, state.gear] = await Promise.all([loadRoutes(), loadFriends(), loadGear()]);
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
