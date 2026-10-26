import { supabase, isConfigured } from './supabase.js';
import { loadPlaces, isReadOnlyViewer } from './places-store.js';
import {
  ACTIVITIES,
  SEA_ACTIVITIES,
  DEFAULT_PLACE_CATEGORY,
  FIELDS,
  KNOWN_EXTRA_KEYS,
  fieldsFor,
  parseField,
  formatField,
  storedValue,
  summarize,
} from './activities.js';
import { createPlacePicker, categoryLabel } from './place-picker.js';
import { CATEGORY_ORDER } from '../js/cartopy-categories.js';

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
      'id, outing_date, title, activity, activities, route_id, distance_km, elevation_gain_m, elevation_loss_m, duration_min, start_point, start_place_id, notes, extra'
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
  readOnly: false, // compte famille : journal partagé en lecture seule
  places: [], // lieux CartoPy (carte du formulaire)
  selectedPlace: null, // lieu choisi sur la carte
  picker: null, // carte du formulaire (créée à la demande)
  newPlaceLatLng: null, // point touché sur la carte pour créer un lieu
  fieldDraft: {}, // valeurs saisies conservées quand on change d'activité
  outings: [], // dernière liste affichée (sert à pré-remplir le formulaire d'édition)
  editing: null, // { id, friendIds, gearIds, extra } quand une sortie est en cours de modification
};

function renderActivityChips() {
  $('activity-chips').innerHTML = ACTIVITIES.map(
    (a) => `<label class="chip"><input type="radio" name="activity" value="${escapeHtml(a)}" required /><span>${escapeHtml(a)}</span></label>`
  ).join('');
}

function currentActivity(form) {
  return form.querySelector('input[name=activity]:checked')?.value || null;
}

function fieldInput(key) {
  const f = FIELDS[key];
  const id = `x-${key}`;
  const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
  let control;
  if (f.type === 'select') {
    control = `<select id="${id}" name="${id}">${f.options.map((o) => `<option value="${o}">${o || '—'}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea id="${id}" name="${id}" rows="2"${ph}></textarea>`;
  } else {
    const mode = f.type === 'decimal' ? ' inputmode="decimal"' : f.type === 'int' ? ' inputmode="numeric"' : '';
    control = `<input id="${id}" name="${id}" type="text"${mode}${ph} />`;
  }
  return `<div class="${f.wide ? 'wide' : ''}"><label for="${id}">${escapeHtml(f.label)}</label>${control}</div>`;
}

// Garde en mémoire ce qui est saisi, pour ne rien perdre en changeant d'activité.
function saveFieldDraft() {
  document.querySelectorAll('#activity-fields [name^="x-"]').forEach((el) => {
    state.fieldDraft[el.name.slice(2)] = el.value;
  });
}

function renderActivityFields(form) {
  saveFieldDraft();
  const activity = currentActivity(form);
  const box = $('activity-fields');
  if (!activity) {
    box.innerHTML = '';
    return;
  }
  const keys = fieldsFor(activity);
  const short = keys.filter((k) => !FIELDS[k].wide);
  const wide = keys.filter((k) => FIELDS[k].wide);
  box.innerHTML = `${short.length ? `<div class="row">${short.map(fieldInput).join('')}</div>` : ''}${wide.map(fieldInput).join('')}`;
  for (const k of keys) {
    const el = form.elements[`x-${k}`];
    if (el && state.fieldDraft[k] != null) el.value = state.fieldDraft[k];
  }
}

function renderDatalists() {
  $('routes-list').innerHTML = state.routes.map((r) => `<option value="${escapeHtml(r.name)}"></option>`).join('');
  $('friends-list').innerHTML = state.friends.map((f) => `<option value="${escapeHtml(f.name)}"></option>`).join('');
  $('places-list').innerHTML = state.places.map((p) => `<option value="${escapeHtml(p.name)}"></option>`).join('');
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
      const { stats, lines } = summarize(o);
      const friends = o.friendNames || [];
      const gear = o.gearNames || [];
      const editing = state.editing?.id === o.id;
      const attrs = state.readOnly ? '' : ` tabindex="0" aria-label="Modifier la sortie ${escapeHtml(o.title)}"`;
      return `<li class="outing${editing ? ' is-editing' : ''}${state.readOnly ? ' is-readonly' : ''}" data-id="${o.id}"${attrs}>
        <div class="outing-head">
          <strong>${escapeHtml(o.title)}</strong>
          ${state.readOnly ? '' : `<button type="button" class="link-btn" data-delete="${o.id}" aria-label="Supprimer cette sortie">Supprimer</button>`}
        </div>
        <div class="outing-meta">${escapeHtml(date)}${o.activity ? ` · <span class="activity-tag">${escapeHtml(o.activity)}</span>` : ''}</div>
        ${o.start_point ? `<div class="outing-meta">Lieu : ${escapeHtml(o.start_point)}</div>` : ''}
        ${o.routeName ? `<div class="outing-meta">Itinéraire : ${escapeHtml(o.routeName)}</div>` : ''}
        ${stats ? `<div class="outing-meta">${escapeHtml(stats)}</div>` : ''}
        ${lines.map((l) => `<div class="outing-meta">${escapeHtml(l)}</div>`).join('')}
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
  const activity = currentActivity(form);
  if (!activity) throw new Error('Choisis une activité.');
  if (!date) throw new Error('La date est obligatoire.');
  if (!title) throw new Error('Le titre est obligatoire.');

  const keys = fieldsFor(activity);
  const payload = {
    outing_date: date,
    title,
    activity,
    activities: [activity], // ancienne colonne, gardée cohérente
    start_point: String(fd.get('start_point')).trim() || null,
    notes: String(fd.get('notes')).trim() || null,
  };
  // Clés "extra" inconnues du formulaire : conservées telles quelles.
  const extra = Object.fromEntries(
    Object.entries(state.editing?.extra || {}).filter(([k]) => !KNOWN_EXTRA_KEYS.includes(k))
  );
  for (const [key, f] of Object.entries(FIELDS)) {
    const value = keys.includes(key) ? parseField(key, fd.get(`x-${key}`)) : null;
    if (f.col) payload[f.col] = value;
    else if (value != null) extra[f.extra] = value;
  }
  payload.extra = extra;
  return {
    routeName: String(fd.get('route')).trim(),
    friendNames: uniqueNames(fd.get('friends')),
    gearNames: uniqueNames(fd.get('gear')),
    payload,
  };
}

// Lieu de la sortie : celui choisi sur la carte, sinon un lieu dont le nom correspond au texte.
function placeIdFor(startPoint) {
  if (state.selectedPlace && state.selectedPlace.name === startPoint) return state.selectedPlace.id;
  const key = (startPoint || '').toLowerCase();
  return (key && state.places.find((p) => p.name.toLowerCase() === key)?.id) || null;
}

async function saveOuting(form) {
  const { routeName, friendNames, gearNames, payload } = readForm(form);
  payload.start_place_id = placeIdFor(payload.start_point);
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

// ------------------------------------------------------------------ lieu (carte)
function setSelectedPlace(place) {
  state.selectedPlace = place;
  $('place-selected').innerHTML = place
    ? `📍 <strong>${escapeHtml(place.name)}</strong> <small>(${escapeHtml(categoryLabel(place.category))})</small> <button type="button" id="place-clear" class="link-btn" aria-label="Retirer ce lieu">retirer</button>`
    : '';
  state.picker?.select(place?.id ?? null);
}

function hideNewPlace() {
  $('new-place').hidden = true;
  state.newPlaceLatLng = null;
  state.picker?.clearDraft();
}

function focusMap(form) {
  state.picker?.focus(SEA_ACTIVITIES.includes(currentActivity(form)));
}

async function initPicker(form) {
  if (state.picker) return;
  try {
    state.picker = await createPlacePicker({
      element: $('place-map'),
      onPick(place) {
        hideNewPlace();
        setSelectedPlace(place);
        form.elements.start_point.value = place.name;
      },
      onEmptyClick(latlng) {
        state.newPlaceLatLng = latlng;
        const cat = DEFAULT_PLACE_CATEGORY[currentActivity(form)] || 'parking';
        $('np-category').value = cat;
        $('np-name').value = '';
        $('new-place').hidden = false;
        $('np-name').focus({ preventScroll: true });
      },
    });
    state.picker.setPlaces(state.places);
    if (state.selectedPlace) state.picker.select(state.selectedPlace.id);
    focusMap(form);
  } catch (err) {
    $('place-map').hidden = true;
    setMessage('form-msg', err.message, true);
  }
}

async function createPlace(form) {
  const name = $('np-name').value.trim();
  if (!name) throw new Error('Donne un nom au nouveau lieu.');
  const { lat, lng } = state.newPlaceLatLng;
  // Identifiant aléatoire : aucun risque de collision avec ceux créés par l'éditeur CartoPy.
  const id = `lieu-${crypto.randomUUID().slice(0, 8)}`;
  const row = { id, category: $('np-category').value, name, lat, lon: lng, notes: '' };
  const { error } = await supabase.from('places').insert(row);
  if (error) throw error;
  state.places.push(row);
  state.picker.addPlace(row);
  renderDatalists();
  hideNewPlace();
  setSelectedPlace(row);
  form.elements.start_point.value = row.name;
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
  state.fieldDraft = {};
  renderActivityFields(form);
  hideNewPlace();
  setSelectedPlace(null);
  focusMap(form);
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
    extra: outing.extra || {},
  };
  setFormMode(true);
  setMessage('form-msg', '');
  hideNewPlace();
  const el = form.elements;
  const activity = ACTIVITIES.includes(outing.activity) ? outing.activity : 'Autre';
  form.querySelectorAll('input[name=activity]').forEach((r) => {
    r.checked = r.value === activity;
  });
  state.fieldDraft = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, formatField(k, storedValue(outing, k))]));
  $('activity-fields').innerHTML = ''; // évite de reprendre les valeurs de la sortie précédente
  renderActivityFields(form);
  el.date.value = outing.outing_date;
  el.title.value = outing.title;
  el.route.value = outing.routeName || '';
  el.start_point.value = outing.start_point || '';
  el.friends.value = (outing.friendNames || []).join(', ');
  el.gear.value = (outing.gearNames || []).join(', ');
  el.notes.value = outing.notes || '';
  setSelectedPlace(state.places.find((p) => p.id === outing.start_place_id) || null);
  focusMap(form);
  renderOutings(state.outings);
  $('outing-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.title.focus({ preventScroll: true });
}

function initForm() {
  const form = $('outing-form');
  renderActivityChips();
  $('np-category').innerHTML = CATEGORY_ORDER.map((c) => `<option value="${c}">${escapeHtml(categoryLabel(c))}</option>`).join('');
  resetForm(form);

  $('activity-chips').addEventListener('change', () => {
    renderActivityFields(form);
    if (!state.selectedPlace) focusMap(form);
  });
  // Texte du lieu modifié à la main : il ne correspond plus au repère choisi.
  form.elements.start_point.addEventListener('input', () => {
    if (state.selectedPlace && form.elements.start_point.value !== state.selectedPlace.name) setSelectedPlace(null);
  });
  $('place-selected').addEventListener('click', (e) => {
    if (e.target.id !== 'place-clear') return;
    setSelectedPlace(null);
    form.elements.start_point.value = '';
  });
  $('locate-btn').addEventListener('click', () => state.picker?.locate());
  $('np-cancel').addEventListener('click', hideNewPlace);
  $('np-create').addEventListener('click', async () => {
    $('np-create').disabled = true;
    setMessage('form-msg', '');
    try {
      await createPlace(form);
    } catch (err) {
      setMessage('form-msg', `Création du lieu impossible : ${err.message}`, true);
    } finally {
      $('np-create').disabled = false;
    }
  });

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
    if (state.readOnly) return;
    const id = e.target.closest('.outing')?.dataset.id;
    const outing = state.outings.find((o) => o.id === id);
    if (outing) startEditing(form, outing);
  });
  // Clavier : Entrée ou Espace sur une sortie ouvre la modification.
  list.addEventListener('keydown', (e) => {
    if (state.readOnly || (e.key !== 'Enter' && e.key !== ' ') || !e.target.classList.contains('outing')) return;
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
    state.readOnly = await isReadOnlyViewer();
    $('outing-form').closest('.card').hidden = state.readOnly;
    $('list-hint').textContent = state.readOnly ? 'Journal partagé en lecture seule.' : 'Touche une sortie pour la modifier.';
    [state.routes, state.friends, state.gear] = await Promise.all([loadRoutes(), loadFriends(), loadGear()]);
    // Lieux CartoPy : facultatif, une erreur ici ne bloque pas le journal.
    state.places = await loadPlaces()
      .then((p) => p.points.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')))
      .catch(() => []);
    renderDatalists();
    if (!state.readOnly) await initPicker($('outing-form'));
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
