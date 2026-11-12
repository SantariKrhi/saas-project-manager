'use strict';

const root = document.getElementById('app');

// ---------------------------------------------------------------- utilitaires

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* stockage indisponible */ } },
};

let token = store.get('token');
let me = null;
let company = null;
let navSeq = 0; // ignore le rendu d'une navigation dépassée par une plus récente
let draggingId = null;

const PRIO = { high: 'Haute', medium: 'Moyenne', low: 'Basse' };

// Construit un élément DOM. Le texte passe toujours par append() : jamais d'innerHTML (pas de XSS).
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'selected', 'disabled', 'draggable'].includes(k)) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  }
  return el;
}

// Icônes SVG (tracés constants définis ici : aucune donnée utilisateur n'y passe).
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  checkSquare: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

let idCounter = 0;
const uid = (prefix = 'f') => `${prefix}${++idCounter}`;

// Champ de formulaire avec son libellé associé (for / id). `target` : élément focalisable visé par le libellé.
function field(label, control, hint, target = control) {
  if (!target.id) target.id = uid();
  return h('div', { class: 'field' }, h('label', { for: target.id }, label), control,
    hint ? h('div', { class: 'hint' }, hint) : null);
}

// Saisie d'étiquettes en pastilles : Entrée ou virgule pour ajouter, retour arrière pour retirer la dernière.
function tagInput(initial, placeholder) {
  const tags = [...initial];
  const input = h('input', { class: 'tag-entry', placeholder });
  const wrap = h('div', { class: 'tag-input', onclick: (e) => { if (e.target === wrap) input.focus(); } });
  const draw = () => {
    wrap.replaceChildren(...tags.map((t, i) => h('span', { class: 'chip tag removable' }, t,
      h('button', { type: 'button', 'aria-label': `Retirer l’étiquette ${t}`, onclick: () => { tags.splice(i, 1); draw(); input.focus(); } }, icon('x')))),
    input);
    input.placeholder = tags.length ? '' : placeholder;
  };
  const commit = () => {
    input.value.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => { if (!tags.includes(t)) tags.push(t); });
    input.value = '';
    draw();
  };
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) { e.preventDefault(); commit(); input.focus(); }
    else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); input.focus(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) commit(); });
  draw();
  return { el: wrap, input, values: () => { if (input.value.trim()) commit(); return [...tags]; } };
}

function toast(message, type = 'ok') {
  const t = h('div', { class: `toast${type === 'error' ? ' error' : ''}`, role: type === 'error' ? 'alert' : 'status' },
    icon(type === 'error' ? 'alert' : 'check'), h('span', {}, message));
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), type === 'error' ? 5000 : 3000);
}

// Requête authentifiée brute (fichiers) ; lève une erreur lisible si la réponse n'est pas un succès.
async function request(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`/api${path}`, {
    method, body, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...headers },
  });
  if (res.status === 401 && token) { logout(); throw new Error('Session expirée, reconnectez-vous'); }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try { const data = await res.json(); if (data && data.error) message = data.error; } catch { /* réponse non JSON */ }
    throw new Error(message);
  }
  return res;
}

async function api(method, path, body) {
  const res = await request(method, path,
    body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

// Exécute une action et affiche l'erreur éventuelle dans une notification.
async function safely(fn) {
  try { return await fn(); } catch (err) { toast(err.message, 'error'); }
}

// Désactive un bouton pendant l'action (évite les doubles envois).
async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await safely(fn); } finally { if (btn) btn.disabled = false; }
}

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}` : 'Utilisateur supprimé');
const initials = (u) => (u ? `${u.firstName[0]}${u.lastName[0]}`.toUpperCase() : '?');
// Les échéances sont des dates « calendaires » stockées à minuit UTC : on les lit en UTC pour ne jamais décaler d'un jour.
const fmtDue = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dueKey = (t) => (t.dueDate ? t.dueDate.slice(0, 10) : null);
const isLastColumn = (project, status) => status === project.columns[project.columns.length - 1];
const isOverdue = (t, done) => !!t.dueDate && !done && dueKey(t) < ymd(new Date());
const formatSize = (n) => (n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`);
const MAX_UPLOAD = 10 * 1024 * 1024;

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function relTime(d) {
  const sec = (new Date(d) - Date.now()) / 1000;
  for (const [unit, size] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  }
  return 'à l’instant';
}
function dayLabel(d) {
  const key = ymd(new Date(d));
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (key === ymd(new Date())) return 'Aujourd’hui';
  if (key === ymd(yesterday)) return 'Hier';
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Tableau masqué : équivalent textuel des graphiques pour les lecteurs d'écran.
const srTable = (headers, rows) => h('table', { class: 'sr-only' },
  h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
  h('tbody', {}, rows.map((r) => h('tr', {}, r.map((x) => h('td', {}, x))))));

async function downloadAttachment(a) {
  const blob = await (await request('GET', `/attachments/${a._id}`)).blob();
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: a.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const startOfToday = () => new Date(new Date().toDateString());
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

const avatar = (u, large = false) => h('span', { class: `avatar${large ? ' lg' : ''}`, title: fullName(u) }, initials(u));

// ---------------------------------------------------------------- thème (auto / clair / sombre)

const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Thème automatique', light: 'Thème clair', dark: 'Thème sombre' };
const THEME_ICON = { auto: 'monitor', light: 'sun', dark: 'moon' };
let theme = THEMES.includes(store.get('theme')) ? store.get('theme') : 'auto';

function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
applyTheme();

function themeButton() {
  const btn = h('button', { class: 'btn ghost icon-only', type: 'button' });
  const sync = () => {
    btn.replaceChildren(icon(THEME_ICON[theme]));
    btn.title = `${THEME_LABEL[theme]} (cliquer pour changer)`;
    btn.setAttribute('aria-label', btn.title);
  };
  btn.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('theme', theme);
    applyTheme();
    sync();
  });
  sync();
  return btn;
}

// ---------------------------------------------------------------- modale

function openModal({ title, sub, body, foot, variant, onClose }) {
  const previous = document.activeElement;
  const titleId = uid('title');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
    if (previous && previous.isConnected) previous.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: `overlay${variant ? ` ${variant}` : ''}`, onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal${variant ? ` ${variant}-panel` : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' },
        h('div', {}, h('h2', { id: titleId }, title), sub ? h('div', { class: 'sub' }, sub) : null),
        h('button', { class: 'btn ghost icon-only', type: 'button', 'aria-label': 'Fermer', onclick: () => close() }, icon('x'))),
      h('div', { class: 'modal-body' }, body),
      foot ? h('div', { class: 'modal-foot' }, foot) : null));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  const first = overlay.querySelector('.modal-body input, .modal-body textarea, .modal-body select');
  if (first) first.focus();
  return close;
}

// ---------------------------------------------------------------- authentification

function logout() {
  token = null; me = null; company = null;
  store.del('token');
  if (location.hash) location.hash = '';
  renderAuth();
}

function mount(node) { root.replaceChildren(node); }

function renderAuth() {
  let mode = 'login';
  const box = h('div', { class: 'panel' });

  function draw() {
    const isLogin = mode === 'login';
    const alert = h('div', { class: 'alert', role: 'alert' });
    const input = (name, type, extra = {}) => h('input', { name, type, required: true, ...extra });
    const i = isLogin
      ? {
        company: input('company', 'text', { placeholder: 'ex. acme', autocomplete: 'organization', autocapitalize: 'none', spellcheck: 'false' }),
        email: input('email', 'email', { autocomplete: 'username' }),
        password: input('password', 'password', { autocomplete: 'current-password' }),
      }
      : {
        companyName: input('companyName', 'text', { autocomplete: 'organization' }),
        firstName: input('firstName', 'text', { autocomplete: 'given-name' }),
        lastName: input('lastName', 'text', { autocomplete: 'family-name' }),
        email: input('email', 'email', { autocomplete: 'username' }),
        password: input('password', 'password', { minlength: 8, autocomplete: 'new-password' }),
      };
    const submit = h('button', { class: 'btn primary block', type: 'submit', style: 'margin-top:1.25rem' },
      isLogin ? 'Se connecter' : 'Créer l’entreprise');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        alert.replaceChildren();
        const f = Object.fromEntries(new FormData(e.target));
        submit.disabled = true;
        try {
          const data = isLogin
            ? await api('POST', '/auth/login', { company: f.company.trim().toLowerCase(), email: f.email, password: f.password })
            : await api('POST', '/auth/register-company', f);
          token = data.token;
          store.set('token', token);
          await boot();
        } catch (err) {
          alert.replaceChildren(icon('alert'), h('span', {}, err.message));
        } finally {
          submit.disabled = false;
        }
      },
    },
    isLogin
      ? [field('Entreprise', i.company, 'Identifiant donné à la création de l’entreprise'), field('Email', i.email), field('Mot de passe', i.password)]
      : [field('Nom de l’entreprise', i.companyName),
        h('div', { class: 'two' }, field('Prénom', i.firstName), field('Nom', i.lastName)),
        field('Email', i.email), field('Mot de passe', i.password, '8 caractères minimum')],
    alert, submit);

    const demo = isLogin && h('div', { class: 'demo' },
      h('div', {}, h('div', { style: 'font-weight:600' }, 'Compte de démonstration'), h('code', {}, 'acme · admin@acme.test · demo1234')),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        i.company.value = 'acme'; i.email.value = 'admin@acme.test'; i.password.value = 'demo1234'; submit.focus();
      } }, 'Remplir'));

    const tab = (key, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === key),
      onclick: () => { if (mode !== key) { mode = key; draw(); } } }, label);

    box.replaceChildren(h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Mode' },
      tab('login', 'Connexion'), tab('register', 'Nouvelle entreprise')), form, demo);
  }

  draw();
  mount(h('div', { class: 'auth' },
    h('div', { style: 'position:fixed;top:.75rem;right:.75rem' }, themeButton()),
    h('div', { class: 'auth-box' },
      h('div', { class: 'auth-head' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, 'PM'), h('h1', {}, 'Project Manager')),
      box)));
}

// ---------------------------------------------------------------- coque et routage

function shell(content, active) {
  const link = (label, href, key, iconName) => h('a', { href, title: label, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null },
    icon(iconName), h('span', { class: 'nav-label' }, label));
  return h('div', {},
    h('header', { class: 'topbar' },
      h('a', { href: '#/projects', class: 'brand' },
        h('span', { class: 'logo', 'aria-hidden': 'true' }, company.name[0].toUpperCase()), h('span', { class: 'brand-name' }, company.name)),
      h('nav', { 'aria-label': 'Navigation principale' },
        link('Projets', '#/projects', 'projects', 'columns'),
        link('Mes tâches', '#/my', 'my', 'userCheck'),
        link('Tableau de bord', '#/dashboard', 'dashboard', 'chart'),
        me.role === 'admin' ? link('Équipe', '#/team', 'team', 'users') : null),
      h('div', { class: 'user' },
        h('div', { class: 'user-name' }, h('span', {}, fullName(me)), h('small', {}, me.role === 'admin' ? 'Administrateur' : 'Membre')),
        avatar(me, true),
        themeButton(),
        h('button', { class: 'btn ghost icon-only', type: 'button', title: 'Se déconnecter', 'aria-label': 'Se déconnecter', onclick: logout }, icon('logout')))),
    h('main', {}, content));
}

async function route() {
  if (!token || !me) return;
  const seq = ++navSeq;
  const [page, id, sub] = location.hash.replace(/^#\/?/, '').split('/');
  await safely(async () => {
    let view;
    if (page === 'project' && id) view = shell(await viewBoard(id, sub === 'calendar' ? 'calendar' : 'kanban'), 'projects');
    else if (page === 'my') view = shell(await viewMyTasks(), 'my');
    else if (page === 'dashboard') view = shell(await viewDashboard(id), 'dashboard');
    else if (page === 'team' && me.role === 'admin') view = shell(await viewTeam(), 'team');
    else view = shell(await viewProjects(), 'projects');
    if (seq === navSeq) mount(view);
  });
}

async function boot() {
  try {
    [me, company] = await Promise.all([api('GET', '/auth/me'), api('GET', '/company')]);
  } catch { return logout(); }
  await route();
}

window.addEventListener('hashchange', route);

// ---------------------------------------------------------------- projets

async function viewProjects() {
  const [projects, users] = await Promise.all([api('GET', '/projects'), api('GET', '/users')]);
  const usersById = new Map(users.map((u) => [u._id, u]));

  const nameInput = h('input', { placeholder: 'Nom du nouveau projet', required: true, 'aria-label': 'Nom du nouveau projet' });
  const createBtn = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Créer le projet');
  const create = me.role === 'admin' && h('form', {
    class: 'create-row',
    onsubmit: (e) => {
      e.preventDefault();
      withBusy(createBtn, async () => {
        const p = await api('POST', '/projects', { name: nameInput.value });
        toast('Projet créé');
        location.hash = `#/project/${p._id}`;
      });
    },
  }, nameInput, createBtn);

  const card = (p) => {
    const members = p.memberIds.map((id) => usersById.get(id)).filter(Boolean);
    return h('a', { class: 'card project', href: `#/project/${p._id}` },
      h('h3', {}, p.name),
      h('p', {}, p.description || 'Aucune description'),
      h('div', { class: 'project-foot' },
        h('div', { class: 'avatars' }, members.slice(0, 5).map((u) => avatar(u)),
          members.length > 5 ? h('span', { class: 'avatar' }, `+${members.length - 5}`) : null),
        h('span', {}, `${plural(members.length, 'membre')} · ${plural(p.columns.length, 'colonne')}`)));
  };

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Projets'), h('span', { class: 'count' }, projects.length)),
    create,
    projects.length
      ? h('div', { class: 'grid' }, projects.map(card))
      : h('div', { class: 'empty' }, me.role === 'admin'
        ? 'Aucun projet pour le moment : créez le premier ci-dessus.'
        : 'Vous n’êtes membre d’aucun projet. Demandez à un administrateur de vous ajouter.'));
}

// ---------------------------------------------------------------- Kanban

async function viewBoard(projectId, mode = 'kanban') {
  const filters = { assigneeId: '', priority: '' };
  const [project, users] = await Promise.all([api('GET', `/projects/${projectId}`), api('GET', '/users')]);
  const usersById = new Map(users.map((u) => [u._id, u]));
  const members = project.memberIds.map((id) => usersById.get(id)).filter(Boolean);

  const boardEl = h('div', { class: 'board' });
  const indicator = h('div', { class: 'drop-indicator', 'aria-hidden': 'true' });
  let columns = {};

  async function loadBoard() {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const data = await api('GET', `/projects/${projectId}/board${qs ? `?${qs}` : ''}`);
    columns = data.columns;
    boardEl.replaceChildren(...project.columns.map(drawColumn));
  }

  function clearDrop() {
    indicator.remove();
    boardEl.querySelectorAll('.column.over').forEach((c) => c.classList.remove('over'));
  }

  // Index d'insertion : nombre de cartes (hors carte déplacée) dont le milieu est au-dessus du curseur.
  function dropIndex(body, y) {
    const cards = [...body.querySelectorAll('.task')].filter((c) => c.dataset.id !== draggingId);
    const idx = cards.filter((c) => { const r = c.getBoundingClientRect(); return y > r.top + r.height / 2; }).length;
    return { cards, idx };
  }

  // Position d'une carte déposée à l'index `idx` d'une colonne (sans la carte déplacée) :
  // moyenne des voisins, ce qui évite de renuméroter les autres cartes.
  function positionAt(list, idx) {
    const prev = list[idx - 1] && list[idx - 1].position;
    const next = list[idx] && list[idx].position;
    if (prev == null && next == null) return 1024;
    if (prev == null) return next / 2;
    if (next == null) return prev + 1024;
    return (prev + next) / 2;
  }

  function drawCard(task) {
    const assignee = usersById.get(task.assigneeId);
    const done = task.status === project.columns[project.columns.length - 1];
    const overdue = isOverdue(task, done);
    const open = () => openTaskModal(task, { project, members, usersById, reload: loadBoard });
    return h('article', {
      class: `task ${task.priority}`, draggable: true, tabindex: 0, 'data-id': task._id,
      'aria-label': `${task.title}. Priorité ${PRIO[task.priority].toLowerCase()}${assignee ? `, assignée à ${fullName(assignee)}` : ''}. Entrée pour ouvrir.`,
      onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
      ondragstart: (e) => {
        draggingId = task._id;
        e.dataTransfer.setData('text/plain', task._id);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
      },
      ondragend: (e) => { draggingId = null; e.currentTarget.classList.remove('dragging'); clearDrop(); },
    },
    h('div', { class: 'task-title' }, task.title),
    h('div', { class: 'task-foot' },
      h('div', { class: 'task-meta' },
        h('span', { class: `chip ${task.priority}` }, h('span', { class: 'dot' }), PRIO[task.priority]),
        task.dueDate
          ? h('span', { class: overdue ? 'chip overdue' : 'meta', title: overdue ? 'Échéance dépassée' : 'Échéance' },
            icon('calendar'), fmtDue(task.dueDate))
          : null,
        task.comments.length
          ? h('span', { class: 'meta', title: plural(task.comments.length, 'commentaire') }, icon('message'), task.comments.length)
          : null,
        checklistMeta(task),
        task.attachments && task.attachments.length
          ? h('span', { class: 'meta', title: `${task.attachments.length} pièce(s) jointe(s)` }, icon('paperclip'), task.attachments.length)
          : null,
        task.labels.map((l) => h('span', { class: 'chip tag' }, l))),
      assignee ? avatar(assignee) : null));
  }

  function drawColumn(status) {
    const tasks = columns[status] || [];
    const body = h('div', { class: 'column-body' },
      tasks.length ? tasks.map(drawCard) : h('div', { class: 'column-empty' }, 'Aucune tâche'));

    const addInput = h('input', {
      placeholder: 'Ajouter une tâche', 'aria-label': `Ajouter une tâche dans « ${status} »`, enterkeyhint: 'done',
      onkeydown: async (e) => {
        if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); return; }
        if (e.key !== 'Enter' || !e.target.value.trim()) return;
        const title = e.target.value;
        e.target.disabled = true;
        await safely(async () => {
          await api('POST', `/projects/${projectId}/tasks`, { title, status });
          await loadBoard();
          // Garde le focus dans la colonne pour enchaîner les saisies
          const next = boardEl.querySelector(`[data-status="${CSS.escape(status)}"] .add-task input`);
          if (next) next.focus();
        });
        e.target.disabled = false;
      },
    });

    const col = h('section', {
      class: 'column', 'data-status': status, 'aria-label': `Colonne ${status}`,
      ondragover: (e) => {
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!col.classList.contains('over')) {
          boardEl.querySelectorAll('.column.over').forEach((c) => c.classList.remove('over'));
          col.classList.add('over');
        }
        const { cards, idx } = dropIndex(body, e.clientY);
        if (cards[idx]) body.insertBefore(indicator, cards[idx]); else body.append(indicator);
      },
      ondragleave: (e) => {
        if (col.contains(e.relatedTarget)) return;
        col.classList.remove('over');
        if (indicator.parentNode === body) indicator.remove();
      },
      ondrop: (e) => {
        e.preventDefault();
        const id = draggingId || e.dataTransfer.getData('text/plain');
        const { idx } = dropIndex(body, e.clientY);
        clearDrop();
        if (!id) return;
        const list = columns[status] || [];
        const current = list.find((t) => t._id === id);
        if (current && list.indexOf(current) === idx) return; // déposée à sa place : rien à faire
        const others = list.filter((t) => t._id !== id);
        safely(async () => {
          await api('PATCH', `/tasks/${id}/move`, { status, position: positionAt(others, idx) });
          await loadBoard();
        });
      },
    },
    h('div', { class: 'column-head' }, h('h3', {}, status), h('span', { class: 'count' }, tasks.length)),
    body,
    h('div', { class: 'add-task' }, icon('plus'), addInput));
    return col;
  }

  const select = (label, options, onChange) => h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
    options.map(([v, l]) => h('option', { value: v }, l)));
  const assigneeSel = select('Filtrer par personne', [['', 'Tout le monde'], ...members.map((u) => [u._id, fullName(u)])],
    (v) => { filters.assigneeId = v; safely(refresh); });
  const prioSel = select('Filtrer par priorité', [['', 'Toute priorité'], ...Object.entries(PRIO)],
    (v) => { filters.priority = v; safely(refresh); });

  // Les filtres s'appliquent à la vue affichée (Kanban ou calendrier).
  let calendar = null;
  const refresh = () => (calendar ? calendar.load() : loadBoard());
  if (mode === 'calendar') {
    calendar = calendarView(project, { members, usersById, filters });
    await calendar.load();
  } else {
    await loadBoard();
  }

  const tab = (key, label, iconName, href) => h('a', { href, role: 'tab', 'aria-selected': String(mode === key), class: mode === key ? 'active' : '' }, icon(iconName), label);
  return h('div', {},
    h('a', { href: '#/projects', class: 'back' }, icon('arrowLeft'), 'Projets'),
    h('div', { class: 'page-head', style: 'margin-top:.5rem' },
      h('div', {}, h('h1', {}, project.name), project.description ? h('p', { class: 'muted', style: 'margin-top:.2rem' }, project.description) : null),
      h('span', { class: 'spacer' }),
      h('div', { class: 'filters' }, assigneeSel, prioSel,
        h('button', { class: 'btn', type: 'button', onclick: () => openActivity(project, { members, usersById, reload: refresh }) }, icon('history'), 'Activité'),
        me.role === 'admin' ? h('button', { class: 'btn', type: 'button', onclick: () => safely(() => openProjectModal(project, users)) }, icon('sliders'), 'Paramètres') : null)),
    h('div', { class: 'view-tabs', role: 'tablist', 'aria-label': 'Vue du projet' },
      tab('kanban', 'Kanban', 'columns', `#/project/${project._id}`),
      tab('calendar', 'Calendrier', 'calendar', `#/project/${project._id}/calendar`)),
    calendar ? calendar.el : boardEl);
}

// Avancement de la checklist sur une carte (vert quand tout est coché).
function checklistMeta(task) {
  const list = task.checklist || [];
  if (!list.length) return null;
  const done = list.filter((i) => i.done).length;
  return h('span', { class: `meta${done === list.length ? ' ok' : ''}`, title: `Checklist : ${done} sur ${list.length}` },
    icon('checkSquare'), `${done}/${list.length}`);
}

// ---------------------------------------------------------------- modale tâche

function openTaskModal(task, ctx) {
  const { project, members, usersById, reload } = ctx;
  const title = h('input', { value: task.title, required: true });
  const desc = h('textarea', { rows: 4, value: task.description || '', placeholder: 'Ajouter une description…' });
  const status = h('select', {}, project.columns.map((c) => h('option', { value: c, selected: c === task.status }, c)));
  const assignee = h('select', {}, h('option', { value: '' }, 'Non assignée'),
    members.map((u) => h('option', { value: u._id, selected: u._id === task.assigneeId }, fullName(u))));
  const prio = h('select', {}, Object.entries(PRIO).map(([v, l]) => h('option', { value: v, selected: v === task.priority }, l)));
  const due = h('input', { type: 'date', value: task.dueDate ? task.dueDate.slice(0, 10) : '' });
  const labels = tagInput(task.labels || [], 'Ajouter une étiquette puis Entrée');

  const commentsTitle = h('h3', {});
  const commentsList = h('div', {});
  const drawComments = (list) => {
    commentsTitle.textContent = `Commentaires (${list.length})`;
    commentsList.replaceChildren(...(list.length
      ? list.map((c) => {
        const u = usersById.get(c.userId);
        return h('div', { class: 'comment' }, avatar(u),
          h('div', { class: 'comment-body' },
            h('div', { class: 'comment-meta' }, h('b', {}, fullName(u)),
              ` · ${new Date(c.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`),
            h('div', { class: 'comment-text' }, c.text)));
      })
      : [h('p', { class: 'muted', style: 'margin-bottom:.75rem' }, 'Aucun commentaire pour le moment.')]));
  };
  drawComments(task.comments);

  const commentInput = h('input', { placeholder: 'Écrire un commentaire…', 'aria-label': 'Nouveau commentaire' });
  const sendBtn = h('button', { class: 'btn', type: 'submit' }, 'Envoyer');
  const commentForm = h('form', {
    class: 'comment-form',
    onsubmit: (e) => {
      e.preventDefault();
      if (!commentInput.value.trim()) return;
      withBusy(sendBtn, async () => {
        const updated = await api('POST', `/tasks/${task._id}/comments`, { text: commentInput.value });
        commentInput.value = '';
        task.comments = updated.comments;
        drawComments(updated.comments);
        await reload();
      });
    },
  }, commentInput, sendBtn);

  // Réponse partielle de l'API : on synchronise la modale puis le board.
  const sync = async (updated) => {
    task.checklist = updated.checklist;
    task.attachments = updated.attachments;
    drawChecklist();
    drawAttachments();
    await reload();
  };

  // --- Checklist
  const checklistBox = h('div', { class: 'section' });
  const itemInput = h('input', { placeholder: 'Nouvel élément…', 'aria-label': 'Nouvel élément de checklist' });
  const itemForm = h('form', {
    class: 'inline-form',
    onsubmit: (e) => {
      e.preventDefault();
      const text = itemInput.value.trim();
      if (!text) return;
      safely(async () => {
        await sync(await api('POST', `/tasks/${task._id}/checklist`, { text }));
        itemInput.value = '';
        itemInput.focus();
      });
    },
  }, itemInput, h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Ajouter'));

  function drawChecklist() {
    const list = task.checklist || [];
    const done = list.filter((i) => i.done).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    checklistBox.replaceChildren(
      h('div', { class: 'section-head' }, h('h3', {}, 'Checklist'), list.length ? h('span', { class: 'muted' }, `${done}/${list.length} · ${pct} %`) : null),
      list.length ? h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Avancement de la checklist', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
        h('span', { style: `width:${pct}%` })) : null,
      h('ul', { class: 'checklist' }, list.map((item) => h('li', { class: item.done ? 'done' : '' },
        h('label', {},
          h('input', { type: 'checkbox', checked: item.done,
            onchange: (e) => safely(async () => sync(await api('PATCH', `/tasks/${task._id}/checklist/${item._id}`, { done: e.target.checked }))) }),
          h('span', {}, item.text)),
        h('button', { class: 'btn ghost sm danger-ghost', type: 'button', title: 'Retirer', 'aria-label': `Retirer « ${item.text} »`,
          onclick: () => safely(async () => sync(await api('DELETE', `/tasks/${task._id}/checklist/${item._id}`))) }, icon('x'))))),
      itemForm);
  }

  // --- Pièces jointes (stockées dans GridFS)
  const previews = new Map();
  const attachBox = h('div', { class: 'section' });
  const uploadState = h('div', { class: 'hint', 'aria-live': 'polite' });
  const fileInput = h('input', { type: 'file', multiple: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true',
    onchange: (e) => { uploadFiles([...e.target.files]); e.target.value = ''; } });

  async function uploadFiles(files) {
    for (const f of files) {
      if (f.size > MAX_UPLOAD) { toast(`${f.name} : 10 Mo maximum`, 'error'); continue; }
      uploadState.textContent = `Envoi de ${f.name}…`;
      await safely(async () => {
        const res = await request('POST', `/tasks/${task._id}/attachments`, {
          body: f,
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name), 'X-File-Type': f.type || 'application/octet-stream' },
        });
        await sync(await res.json());
        toast(`${f.name} ajouté`);
      });
    }
    uploadState.textContent = '';
  }

  const dropzone = h('div', {
    class: 'dropzone',
    ondragover: (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dropzone.classList.add('over'); } },
    ondragleave: (e) => { if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('over'); },
    ondrop: (e) => { e.preventDefault(); dropzone.classList.remove('over'); uploadFiles([...e.dataTransfer.files]); },
  }, icon('paperclip'), h('span', {}, 'Glissez des fichiers ici ou'),
  h('button', { class: 'link-btn', type: 'button', onclick: () => fileInput.click() }, 'choisissez-les'),
  h('span', { class: 'muted' }, '· 10 Mo max.'), fileInput);

  // Aperçu des images (téléchargées avec le jeton, affichées via une URL locale libérée à la fermeture).
  async function preview(a, holder) {
    try {
      if (!previews.has(a._id)) {
        const blob = await (await request('GET', `/attachments/${a._id}`)).blob();
        previews.set(a._id, URL.createObjectURL(blob));
      }
      holder.replaceChildren(h('img', { src: previews.get(a._id), alt: '' }));
    } catch { /* aperçu facultatif */ }
  }

  function drawAttachments() {
    const list = task.attachments || [];
    attachBox.replaceChildren(
      h('div', { class: 'section-head' }, h('h3', {}, list.length ? `Pièces jointes (${list.length})` : 'Pièces jointes')),
      list.length ? h('ul', { class: 'files' }, list.map((a) => {
        const isImage = a.contentType.startsWith('image/');
        const thumb = h('span', { class: 'file-icon' }, icon(isImage ? 'image' : 'file'));
        if (isImage && a.size <= 3 * 1024 * 1024) preview(a, thumb);
        return h('li', {}, thumb,
          h('div', { class: 'file-info' },
            h('button', { class: 'link-btn file-name', type: 'button', title: `Télécharger ${a.name}`, onclick: () => safely(() => downloadAttachment(a)) }, a.name),
            h('div', { class: 'hint' }, `${formatSize(a.size)} · ${fullName(usersById.get(a.uploadedBy))} · ${relTime(a.at)}`)),
          h('button', { class: 'btn ghost sm', type: 'button', title: 'Télécharger', 'aria-label': `Télécharger ${a.name}`,
            onclick: () => safely(() => downloadAttachment(a)) }, icon('download')),
          h('button', { class: 'btn ghost sm danger-ghost', type: 'button', title: 'Supprimer', 'aria-label': `Supprimer ${a.name}`,
            onclick: () => safely(async () => {
              if (!confirm(`Supprimer « ${a.name} » ?`)) return;
              await sync(await api('DELETE', `/tasks/${task._id}/attachments/${a._id}`));
            }) }, icon('trash')));
      })) : null,
      dropzone, uploadState);
  }
  drawChecklist();
  drawAttachments();

  let close = () => {};
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(saveBtn, async () => {
    await api('PATCH', `/tasks/${task._id}`, {
      title: title.value, description: desc.value, assigneeId: assignee.value || null, priority: prio.value,
      dueDate: due.value || null, labels: labels.values(),
    });
    if (status.value !== task.status) await api('PATCH', `/tasks/${task._id}/move`, { status: status.value });
    close();
    toast('Tâche enregistrée');
    await reload();
  }) }, 'Enregistrer');
  const deleteBtn = h('button', { class: 'btn danger', type: 'button', 'aria-label': 'Supprimer la tâche', onclick: () => withBusy(deleteBtn, async () => {
    if (!confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
    await api('DELETE', `/tasks/${task._id}`);
    close();
    toast('Tâche supprimée');
    await reload();
  }) }, icon('trash'), h('span', { class: 'btn-label' }, 'Supprimer'));

  close = openModal({
    title: 'Modifier la tâche',
    sub: `${project.name} · ${task.status}`,
    body: [
      field('Titre', title),
      field('Description', desc),
      h('div', { class: 'two' }, field('Statut', status), field('Assignée à', assignee), field('Priorité', prio), field('Échéance', due)),
      field('Étiquettes', labels.el, null, labels.input),
      checklistBox,
      attachBox,
      h('div', { class: 'comments' }, commentsTitle, commentsList, commentForm),
    ],
    onClose: () => previews.forEach((url) => URL.revokeObjectURL(url)),
    foot: [deleteBtn, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Annuler'), saveBtn],
  });
}

// ---------------------------------------------------------------- modale projet (admin)

// Éditeur des colonnes du Kanban : une ligne par colonne (renommer, monter, descendre, supprimer).
// Chaque ligne garde son nom d'origine pour transmettre les renommages à l'API.
function columnEditor(columns, counts) {
  const rows = columns.map((c) => ({ original: c, value: c }));
  const list = h('div', { class: 'col-list' });

  const draw = (focusIndex) => {
    list.replaceChildren(...rows.map((row, i) => {
      const n = row.original ? counts[row.original] || 0 : 0;
      const input = h('input', { value: row.value, 'aria-label': `Nom de la colonne ${i + 1}`, placeholder: 'Nom de la colonne',
        oninput: (e) => { row.value = e.target.value; } });
      const move = (delta) => { [rows[i], rows[i + delta]] = [rows[i + delta], rows[i]]; draw(i + delta); };
      return h('div', { class: 'col-row' },
        h('span', { class: 'col-index', 'aria-hidden': 'true' }, i + 1),
        input,
        h('span', { class: 'col-count' }, row.original ? plural(n, 'tâche') : 'nouvelle'),
        h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': `Monter la colonne ${row.value}`, title: 'Monter', disabled: i === 0, onclick: () => move(-1) }, icon('arrowUp')),
        h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': `Descendre la colonne ${row.value}`, title: 'Descendre', disabled: i === rows.length - 1, onclick: () => move(1) }, icon('arrowDown')),
        h('button', { class: 'btn ghost sm danger-ghost', type: 'button', 'aria-label': `Supprimer la colonne ${row.value}`,
          title: n ? `Contient ${plural(n, 'tâche')} : déplacez-les d’abord` : 'Supprimer', disabled: n > 0 || rows.length === 1,
          onclick: () => { rows.splice(i, 1); draw(Math.min(i, rows.length - 1)); } }, icon('trash')));
    }));
    if (focusIndex != null) {
      const inputs = list.querySelectorAll('input');
      if (inputs[focusIndex]) inputs[focusIndex].focus();
    }
  };
  draw();

  const addBtn = h('button', { class: 'btn ghost add-col', type: 'button', onclick: () => { rows.push({ original: null, value: '' }); draw(rows.length - 1); } },
    icon('plus'), 'Ajouter une colonne');

  // Renvoie { columns, renamedColumns } ou lève une erreur lisible.
  const values = () => {
    const names = rows.map((r) => r.value.trim());
    if (names.some((n) => !n)) throw new Error('Chaque colonne doit avoir un nom');
    if (new Set(names).size !== names.length) throw new Error('Deux colonnes ne peuvent pas avoir le même nom');
    const renamedColumns = rows.filter((r) => r.original && r.original !== r.value.trim())
      .map((r) => ({ from: r.original, to: r.value.trim() }));
    return { columns: names, renamedColumns };
  };
  return { el: h('div', {}, list, addBtn), values };
}

async function openProjectModal(project, users) {
  const tasks = await api('GET', `/projects/${project._id}/tasks`);
  const counts = {};
  tasks.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });

  const name = h('input', { value: project.name, required: true });
  const desc = h('textarea', { rows: 3, value: project.description || '' });
  const editor = columnEditor(project.columns, counts);
  const boxes = users.map((u) => h('input', { type: 'checkbox', value: u._id, checked: project.memberIds.includes(u._id) }));
  const checks = h('div', { class: 'checks', role: 'group', 'aria-label': 'Membres du projet' },
    users.map((u, i) => h('label', {}, boxes[i], avatar(u), h('span', {}, fullName(u), ' ', h('small', {}, u.email)))));

  let close = () => {};
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(saveBtn, async () => {
    const { columns, renamedColumns } = editor.values();
    await api('PATCH', `/projects/${project._id}`, { name: name.value, description: desc.value, columns, renamedColumns });
    await api('PUT', `/projects/${project._id}/members`, { memberIds: boxes.filter((b) => b.checked).map((b) => b.value) });
    close();
    toast('Projet enregistré');
    await route();
  }) }, 'Enregistrer');
  const deleteBtn = h('button', { class: 'btn danger', type: 'button', 'aria-label': 'Supprimer le projet', onclick: () => withBusy(deleteBtn, async () => {
    if (!confirm(`Supprimer le projet « ${project.name} » et toutes ses tâches ?`)) return;
    await api('DELETE', `/projects/${project._id}`);
    close();
    toast('Projet supprimé');
    location.hash = '#/projects';
  }) }, icon('trash'), h('span', { class: 'btn-label' }, 'Supprimer le projet'));

  close = openModal({
    title: 'Paramètres du projet',
    body: [
      field('Nom', name),
      field('Description', desc),
      h('div', { class: 'field' }, h('span', { class: 'label-text' }, 'Colonnes du Kanban'),
        h('div', { class: 'hint', style: 'margin:0 0 .5rem' }, 'Dans l’ordre d’affichage. Renommer une colonne y conserve ses tâches.'),
        editor.el),
      h('div', { class: 'field' }, h('span', { class: 'label-text' }, 'Membres'), checks),
    ],
    foot: [deleteBtn, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Annuler'), saveBtn],
  });
}

// ---------------------------------------------------------------- calendrier

// Mois affiché sur 6 semaines (lundi -> dimanche). Glisser une tâche sur un jour change son échéance.
function calendarView(project, { members, usersById, filters }) {
  const DOW = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const RANK = { high: 0, medium: 1, low: 2 };
  const now = new Date();
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  let tasks = [];
  let undated = [];
  let dragId = null;
  const el = h('div', { class: 'calendar' });

  const gridStart = () => { const d = new Date(month); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  const matches = (t) => (!filters.assigneeId || t.assigneeId === filters.assigneeId) && (!filters.priority || t.priority === filters.priority);
  const sorted = (list) => list.filter(matches).sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.title.localeCompare(b.title));

  async function load() {
    const start = gridStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    [tasks, undated] = await Promise.all([
      api('GET', `/projects/${project._id}/tasks?dueFrom=${ymd(start)}&dueTo=${ymd(end)}`),
      api('GET', `/projects/${project._id}/tasks?noDue=true`),
    ]);
    draw();
  }

  async function setDue(id, key) {
    const t = [...tasks, ...undated].find((x) => x._id === id);
    if (!t || dueKey(t) === key) return;
    await safely(async () => {
      await api('PATCH', `/tasks/${id}`, { dueDate: key });
      toast(key ? `Échéance : ${fmtDue(key)}` : 'Échéance retirée');
      await load();
    });
  }

  function chip(t) {
    const done = isLastColumn(project, t.status);
    const late = isOverdue(t, done);
    const assignee = usersById.get(t.assigneeId);
    return h('button', {
      type: 'button', draggable: true, class: `cal-task ${t.priority}${done ? ' done' : ''}${late ? ' late' : ''}`,
      title: `${t.title} · ${t.status} · priorité ${PRIO[t.priority].toLowerCase()}${assignee ? ` · ${fullName(assignee)}` : ''}${late ? ' · en retard' : ''}`,
      onclick: () => openTaskModal(t, { project, members, usersById, reload: load }),
      ondragstart: (e) => { dragId = t._id; e.dataTransfer.setData('text/plain', t._id); e.dataTransfer.effectAllowed = 'move'; },
      ondragend: () => { dragId = null; el.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); },
    }, done ? icon('check') : late ? icon('alert') : null, h('span', { class: 'cal-task-title' }, t.title));
  }

  const dropTarget = (node, key) => {
    node.addEventListener('dragover', (e) => { if (!dragId) return; e.preventDefault(); node.classList.add('over'); });
    node.addEventListener('dragleave', (e) => { if (!node.contains(e.relatedTarget)) node.classList.remove('over'); });
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      node.classList.remove('over');
      const id = dragId || e.dataTransfer.getData('text/plain');
      if (id) setDue(id, key);
    });
  };

  function draw() {
    const todayKey = ymd(new Date());
    const byDay = {};
    sorted(tasks).forEach((t) => { (byDay[dueKey(t)] ||= []).push(t); });
    const start = gridStart();
    const cells = [];
    let visible = 0;
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = ymd(d);
      const list = byDay[key] || [];
      const inMonth = d.getMonth() === month.getMonth();
      if (inMonth) visible += list.length;
      const head = h('div', { class: 'cal-date' },
        h('span', { class: 'cal-dow' }, d.toLocaleDateString('fr-FR', { weekday: 'long' })),
        h('span', { class: 'cal-num', 'aria-label': d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) }, d.getDate()));
      const cell = h('div', { class: `cal-day${inMonth ? '' : ' other'}${key === todayKey ? ' today' : ''}${list.length ? ' has-tasks' : ''}` },
        head, list.slice(0, 3).map(chip),
        list.length > 3 ? h('button', { type: 'button', class: 'link-btn cal-more',
          onclick: () => cell.replaceChildren(head, ...list.map(chip)) }, `+ ${list.length - 3} autre${list.length > 4 ? 's' : ''}`) : null);
      dropTarget(cell, key);
      cells.push(cell);
    }

    const go = (n) => { month = new Date(month.getFullYear(), month.getMonth() + n, 1); safely(load); };
    const label = month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const noDue = sorted(undated);
    const side = h('aside', { class: 'card cal-side' },
      h('h3', {}, 'Sans échéance', h('span', { class: 'count' }, noDue.length)),
      h('p', { class: 'hint' }, 'Glissez une tâche sur un jour pour lui donner une échéance, ou ici pour la retirer.'),
      h('div', { class: 'cal-undated' }, noDue.length ? noDue.map(chip) : h('p', { class: 'muted' }, 'Aucune tâche.')));
    dropTarget(side, null);

    el.replaceChildren(
      h('div', { class: 'cal-toolbar' },
        h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Mois précédent', title: 'Mois précédent', onclick: () => go(-1) }, icon('chevronLeft')),
        h('h2', { class: 'cal-title', 'aria-live': 'polite' }, label[0].toUpperCase() + label.slice(1)),
        h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Mois suivant', title: 'Mois suivant', onclick: () => go(1) }, icon('chevronRight')),
        h('button', { class: 'btn', type: 'button', onclick: () => { month = new Date(new Date().getFullYear(), new Date().getMonth(), 1); safely(load); } }, 'Aujourd’hui')),
      h('div', { class: 'cal-layout' },
        h('div', {},
          h('div', { class: 'cal-grid' }, DOW.map((d) => h('div', { class: 'cal-head', 'aria-hidden': 'true' }, d)), cells),
          visible ? null : h('p', { class: 'cal-empty muted' }, 'Aucune échéance ce mois-ci.')),
        side));
  }

  return { el, load };
}

// ---------------------------------------------------------------- journal d'activité (tiroir)

const FIELD_LABELS = {
  title: 'le titre', description: 'la description', assigneeId: 'l’assignation', priority: 'la priorité',
  dueDate: 'l’échéance', labels: 'les étiquettes', name: 'le nom', columns: 'les colonnes',
};

function describeActivity(e, taskLink) {
  const d = e.data || {};
  const fields = (list) => (list || []).map((f) => FIELD_LABELS[f] || f).join(', ');
  const col = (name) => h('span', { class: 'chip' }, name);
  switch (e.type) {
    case 'task.created': return ['a créé ', taskLink(d)];
    case 'task.moved': return ['a déplacé ', taskLink(d), ' de ', col(d.from), ' vers ', col(d.to)];
    case 'task.updated': return ['a modifié ', fields(d.fields), ' de ', taskLink(d)];
    case 'task.deleted': return ['a supprimé ', h('b', {}, `« ${d.title} »`)];
    case 'comment.added': return ['a commenté ', taskLink(d)];
    case 'checklist.checked': return [`a coché « ${d.item} » dans `, taskLink(d)];
    case 'attachment.added': return [`a joint « ${d.name} » à `, taskLink(d)];
    case 'attachment.removed': return [`a retiré « ${d.name} » de `, taskLink(d)];
    case 'project.created': return ['a créé le projet'];
    case 'project.updated': return [`a modifié ${fields(d.fields)} du projet`];
    case 'project.members': return [`a modifié les membres du projet${d.added ? ` (+${d.added})` : ''}${d.removed ? ` (−${d.removed})` : ''}`];
    default: return [e.type];
  }
}

function openActivity(project, { members, usersById, reload }) {
  const PAGE = 25;
  const list = h('ol', { class: 'activity' });
  const more = h('button', { class: 'btn block', type: 'button', hidden: true }, 'Voir plus');
  let before = null;
  let lastDay = null;
  let close = () => {};

  const openTask = (id) => safely(async () => {
    let task;
    try { task = await api('GET', `/tasks/${id}`); } catch { throw new Error('Cette tâche n’existe plus'); }
    close();
    openTaskModal(task, { project, members, usersById, reload });
  });
  const taskLink = (d) => (d.taskId
    ? h('button', { class: 'link-btn', type: 'button', onclick: () => openTask(d.taskId) }, `« ${d.title} »`)
    : h('b', {}, `« ${d.title} »`));

  async function load() {
    const items = await api('GET', `/projects/${project._id}/activity?limit=${PAGE}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    for (const e of items) {
      const day = dayLabel(e.at);
      if (day !== lastDay) { list.append(h('li', { class: 'activity-day' }, day)); lastDay = day; }
      const u = usersById.get(e.userId);
      list.append(h('li', { class: 'activity-item' }, avatar(u),
        h('div', {},
          h('div', {}, h('b', {}, fullName(u)), ' ', describeActivity(e, taskLink)),
          h('time', { class: 'hint', datetime: e.at, title: new Date(e.at).toLocaleString('fr-FR') }, relTime(e.at)))));
    }
    if (items.length) before = items[items.length - 1].at;
    more.hidden = items.length < PAGE;
    if (!list.children.length) list.append(h('li', { class: 'muted' }, 'Aucune activité pour le moment.'));
  }
  more.addEventListener('click', () => withBusy(more, load));

  close = openModal({ title: 'Activité', sub: project.name, body: [list, more], variant: 'drawer' });
  safely(load);
}

// ---------------------------------------------------------------- mes tâches

async function viewMyTasks() {
  const [tasks, users] = await Promise.all([api('GET', '/me/tasks'), api('GET', '/users')]);
  const usersById = new Map(users.map((u) => [u._id, u]));
  const todayKey = ymd(new Date());
  const inAWeek = new Date();
  inAWeek.setDate(inAWeek.getDate() + 7);
  const weekKey = ymd(inAWeek);

  const groups = [
    ['late', 'En retard', (t) => !t.done && dueKey(t) && dueKey(t) < todayKey],
    ['today', 'Aujourd’hui', (t) => !t.done && dueKey(t) === todayKey],
    ['week', 'Dans les 7 jours', (t) => !t.done && dueKey(t) > todayKey && dueKey(t) <= weekKey],
    ['later', 'Plus tard', (t) => !t.done && dueKey(t) > weekKey],
    ['none', 'Sans échéance', (t) => !t.done && !dueKey(t)],
    ['done', 'Terminées', (t) => t.done],
  ];

  // L'agrégation renvoie une vue allégée : on recharge la tâche complète et son projet à l'ouverture.
  const open = (t) => safely(async () => {
    const [task, project] = await Promise.all([api('GET', `/tasks/${t._id}`), api('GET', `/projects/${t.projectId}`)]);
    const members = project.memberIds.map((id) => usersById.get(id)).filter(Boolean);
    openTaskModal(task, { project, members, usersById, reload: route });
  });

  const row = (t) => h('li', {}, h('button', { type: 'button', class: `mytask ${t.priority}${t.done ? ' done' : ''}`, onclick: () => open(t) },
    h('span', { class: 'mytask-main' },
      h('span', { class: 'mytask-title' }, t.title),
      h('span', { class: 'hint' }, `${t.project.name} · ${t.status}`)),
    h('span', { class: 'mytask-meta' },
      h('span', { class: `chip ${t.priority}` }, h('span', { class: 'dot' }), PRIO[t.priority]),
      checklistMeta(t),
      t.dueDate ? h('span', { class: `chip${isOverdue(t, t.done) ? ' overdue' : ''}` }, icon('calendar'), fmtDue(t.dueDate)) : null)));

  const sections = groups.map(([key, label, test]) => {
    const list = tasks.filter(test);
    if (!list.length) return null;
    const content = h('ul', { class: 'mytasks' }, list.map(row));
    if (key === 'done') {
      return h('details', { class: 'my-group' }, h('summary', {}, h('h2', {}, label), h('span', { class: 'count' }, list.length)), content);
    }
    return h('section', { class: `my-group ${key}` },
      h('div', { class: 'my-group-head' }, key === 'late' ? icon('alert') : null, h('h2', {}, label), h('span', { class: 'count' }, list.length)),
      content);
  });

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Mes tâches'), h('span', { class: 'count', title: 'Tâches en cours' }, tasks.filter((t) => !t.done).length)),
    tasks.length ? sections : h('div', { class: 'empty' }, 'Aucune tâche ne vous est assignée pour le moment.'));
}

// ---------------------------------------------------------------- tableau de bord

// Graduation « ronde » et paire, pour que la demi-graduation soit un entier.
function niceMax(m) {
  for (let mag = 1; ; mag *= 10) {
    for (const s of [2, 4, 6, 8, 10]) if (s * mag >= m) return s * mag;
  }
}

function statTile(label, value, sub, status) {
  return h('div', { class: 'card tile' },
    h('div', { class: 'tile-label' }, label),
    h('div', { class: 'tile-value' }, value),
    h('div', { class: `tile-sub${status ? ` ${status}` : ''}` },
      status === 'critical' ? icon('alert') : status === 'good' ? icon('check') : null, sub));
}

// Histogramme groupé (une colonne par série et par période) avec info-bulle au survol et au focus.
function columnChart(labels, series) {
  const top = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const tip = h('div', { class: 'tooltip', hidden: true });
  const groups = h('div', { class: 'col-groups' });
  const plot = h('div', { class: 'col-plot' },
    [0, top / 2, top].map((t) => h('div', { class: 'gridline', style: `bottom:${(t / top) * 100}%` }, h('span', {}, t))),
    groups, tip);
  labels.forEach((label, i) => {
    const g = h('div', { class: 'col-group', tabindex: '0', 'aria-label': `${label} : ${series.map((s) => `${s.name} ${s.values[i]}`).join(', ')}` },
      series.map((s) => h('span', { class: `col-bar ${s.cls}`, style: `height:${(s.values[i] / top) * 100}%` })));
    const show = () => {
      tip.replaceChildren(h('b', {}, label), ...series.map((s) => h('div', {}, h('span', { class: `swatch ${s.cls}` }), `${s.name} : ${s.values[i]}`)));
      tip.hidden = false;
      const r = g.getBoundingClientRect();
      const pr = plot.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(r.left - pr.left + r.width / 2, 70), pr.width - 70)}px`;
    };
    const hide = () => { tip.hidden = true; };
    g.addEventListener('mouseenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('mouseleave', hide);
    g.addEventListener('blur', hide);
    groups.append(g);
  });
  return h('div', { class: 'colchart' },
    h('div', { class: 'legend' }, series.map((s) => h('span', {}, h('span', { class: `swatch ${s.cls}` }), s.name))),
    plot,
    h('div', { class: 'col-labels', 'aria-hidden': 'true' }, labels.map((l) => h('span', {}, l))),
    srTable(['Semaine', ...series.map((s) => s.name)], labels.map((l, i) => [l, ...series.map((s) => s.values[i])])));
}

// Barres horizontales (empilées si plusieurs segments), valeur écrite en clair à droite.
function hbars(rows, legend) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return h('div', { class: 'hbars' },
    legend ? h('div', { class: 'legend' }, legend.map(([cls, name]) => h('span', {}, h('span', { class: `swatch ${cls}` }), name))) : null,
    rows.length
      ? rows.map((r) => h('div', { class: 'hbar-row' },
        h('div', { class: 'hbar-label', title: r.label }, r.label),
        h('div', { class: 'hbar-track', role: 'img', 'aria-label': `${r.label} : ${r.valueText}` },
          r.segments.filter((s) => s.value > 0).map((s) => h('span', {
            class: `hbar-seg ${s.cls}`, style: `width:${(s.value / max) * 100}%`, title: `${s.name ? `${s.name} : ` : ''}${s.value}`,
          }))),
        h('div', { class: 'hbar-value' }, r.valueText, r.note || null)))
      : h('p', { class: 'muted' }, 'Aucune donnée.'));
}

const overdueNote = (n) => (n ? h('span', { class: 'chip overdue', title: 'En retard' }, icon('alert'), n) : null);

async function viewDashboard(projectId) {
  const [projects, stats] = await Promise.all([api('GET', '/projects'), api('GET', `/stats${projectId ? `?projectId=${projectId}` : ''}`)]);
  const project = projectId ? projects.find((p) => p._id === projectId) : null;
  const { totals } = stats;
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  const scope = h('select', { 'aria-label': 'Périmètre du tableau de bord', style: 'width:auto',
    onchange: (e) => { location.hash = e.target.value ? `#/dashboard/${e.target.value}` : '#/dashboard'; } },
  h('option', { value: '' }, 'Tous mes projets'),
  projects.map((p) => h('option', { value: p._id, selected: p._id === projectId }, p.name)));

  // 8 dernières semaines (lundi), y compris la semaine en cours
  const monday = startOfToday();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() - 7 * (7 - i)); return d; });
  const perWeek = (list) => { const m = Object.fromEntries(list.map((w) => [ymd(new Date(w._id)), w.count])); return weeks.map((w) => m[ymd(w)] || 0); };
  const weekLabels = weeks.map((w) => w.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));

  const card = (title, hint, content, wide) => h('section', { class: `card chart-card${wide ? ' wide' : ''}` },
    h('h2', {}, title), hint ? h('p', { class: 'hint' }, hint) : null, content);

  const breakdown = project
    ? card('Répartition par colonne', 'Nombre de tâches dans chaque colonne du Kanban', hbars(project.columns.map((c) => {
      const n = (stats.byStatus.find((s) => s._id === c) || { count: 0 }).count;
      return { label: c, total: n, valueText: String(n), segments: [{ value: n, cls: 's1' }] };
    })))
    : card('Avancement par projet', 'Tâches terminées sur le total', hbars(stats.byProject.map((p) => ({
      label: p.name, total: p.total, valueText: `${p.done}/${p.total} · ${Math.round((p.done / p.total) * 100)} %`, note: overdueNote(p.overdue),
      segments: [{ value: p.done, cls: 's1', name: 'Terminées' }, { value: p.total - p.done, cls: 'rest', name: 'Restantes' }],
    })), [['s1', 'Terminées'], ['rest', 'Restantes']]));

  const people = card('Charge par personne', 'Tâches assignées, terminées ou en cours', hbars(stats.byAssignee.map((a) => ({
    label: a.user ? fullName(a.user) : 'Non assignées', total: a.total, valueText: String(a.total), note: overdueNote(a.overdue),
    segments: [{ value: a.done, cls: 's1', name: 'Terminées' }, { value: a.total - a.done, cls: 's2', name: 'En cours' }],
  })), [['s1', 'Terminées'], ['s2', 'En cours']]));

  const priorities = card('Par priorité', null, hbars(['high', 'medium', 'low'].map((k) => {
    const n = (stats.byPriority.find((s) => s._id === k) || { count: 0 }).count;
    return { label: PRIO[k], total: n, valueText: String(n), segments: [{ value: n, cls: 's1' }] };
  })));

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Tableau de bord'), h('span', { class: 'spacer' }), scope),
    h('div', { class: 'tiles' },
      statTile('Tâches', totals.total, project ? project.name : plural(stats.byProject.length, 'projet')),
      statTile('Terminées', totals.done, `${pct} % du total`),
      statTile('En retard', totals.overdue, totals.overdue ? 'échéance dépassée' : 'aucun retard', totals.overdue ? 'critical' : 'good'),
      statTile('Non assignées', totals.unassigned, totals.unassigned ? 'à répartir' : 'tout est réparti')),
    h('div', { class: 'dash-grid' },
      card('Tâches créées et terminées par semaine', 'Sur les 8 dernières semaines', columnChart(weekLabels, [
        { name: 'Créées', cls: 's1', values: perWeek(stats.createdPerWeek) },
        { name: 'Terminées', cls: 's2', values: perWeek(stats.completedPerWeek) },
      ]), true),
      breakdown, people, priorities));
}

// ---------------------------------------------------------------- équipe (admin)

async function viewTeam() {
  const users = await api('GET', '/users');
  const i = {
    firstName: h('input', { required: true, autocomplete: 'off' }),
    lastName: h('input', { required: true, autocomplete: 'off' }),
    email: h('input', { type: 'email', required: true, autocomplete: 'off' }),
    password: h('input', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password', placeholder: '8 caractères min.' }),
  };
  const role = h('select', {}, h('option', { value: 'member' }, 'Membre'), h('option', { value: 'admin' }, 'Administrateur'));
  const addBtn = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Ajouter');

  const form = h('form', {
    class: 'card add-member',
    onsubmit: (e) => {
      e.preventDefault();
      withBusy(addBtn, async () => {
        await api('POST', '/users', { ...Object.fromEntries(Object.entries(i).map(([k, el]) => [k, el.value])), role: role.value });
        toast('Utilisateur ajouté');
        await route();
      });
    },
  },
  h('h2', {}, 'Ajouter un membre'),
  h('div', { class: 'form-grid' },
    field('Prénom', i.firstName), field('Nom', i.lastName), field('Email', i.email), field('Mot de passe', i.password),
    field('Rôle', role), addBtn));

  const row = (u) => {
    const isMe = u._id === me.id;
    const roleSel = h('select', { 'aria-label': `Rôle de ${fullName(u)}`, onchange: (e) => safely(async () => {
      try {
        await api('PATCH', `/users/${u._id}`, { role: e.target.value });
        toast('Rôle mis à jour');
      } finally { await route(); }
    }) },
    h('option', { value: 'member', selected: u.role === 'member' }, 'Membre'),
    h('option', { value: 'admin', selected: u.role === 'admin' }, 'Administrateur'));
    const delBtn = !isMe && h('button', { class: 'btn danger', type: 'button', 'aria-label': `Supprimer ${fullName(u)}`, onclick: () => safely(async () => {
      if (!confirm(`Supprimer ${fullName(u)} ? Ses tâches seront désassignées.`)) return;
      await api('DELETE', `/users/${u._id}`);
      toast('Utilisateur supprimé');
      await route();
    }) }, icon('trash'), 'Supprimer');
    return h('tr', {},
      h('td', { class: 'person-cell' }, h('div', { class: 'person' }, avatar(u), h('span', {}, fullName(u)), isMe ? h('span', { class: 'chip' }, 'vous') : null)),
      h('td', { class: 'email' }, u.email),
      h('td', { class: 'role' }, roleSel),
      h('td', { class: 'actions' }, delBtn));
  };

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Équipe'), h('span', { class: 'count' }, users.length)),
    form,
    h('div', { class: 'table-card' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Nom'), h('th', {}, 'Email'), h('th', {}, 'Rôle'), h('th', {}, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', {}, users.map(row)))));
}

// ---------------------------------------------------------------- démarrage

if (token) boot(); else renderAuth();
