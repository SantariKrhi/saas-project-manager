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

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* réponse non JSON */ }
  if (res.status === 401 && token) { logout(); throw new Error('Session expirée, reconnectez-vous'); }
  if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
  return data;
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
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
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

function openModal({ title, sub, body, foot }) {
  const previous = document.activeElement;
  const titleId = uid('title');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (previous && previous.isConnected) previous.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
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
  const link = (label, href, key) => h('a', { href, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null }, label);
  return h('div', {},
    h('header', { class: 'topbar' },
      h('a', { href: '#/projects', class: 'brand' },
        h('span', { class: 'logo', 'aria-hidden': 'true' }, company.name[0].toUpperCase()), h('span', { class: 'brand-name' }, company.name)),
      h('nav', { 'aria-label': 'Navigation principale' },
        link('Projets', '#/projects', 'projects'), me.role === 'admin' ? link('Équipe', '#/team', 'team') : null),
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
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/');
  await safely(async () => {
    let view;
    if (page === 'project' && id) view = shell(await viewBoard(id), 'projects');
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

async function viewBoard(projectId) {
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
    const overdue = task.dueDate && !done && new Date(task.dueDate) < startOfToday();
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
            icon('calendar'), fmtDate(task.dueDate))
          : null,
        task.comments.length
          ? h('span', { class: 'meta', title: plural(task.comments.length, 'commentaire') }, icon('message'), task.comments.length)
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
    (v) => { filters.assigneeId = v; safely(loadBoard); });
  const prioSel = select('Filtrer par priorité', [['', 'Toute priorité'], ...Object.entries(PRIO)],
    (v) => { filters.priority = v; safely(loadBoard); });

  await loadBoard();
  return h('div', {},
    h('a', { href: '#/projects', class: 'back' }, icon('arrowLeft'), 'Projets'),
    h('div', { class: 'page-head', style: 'margin-top:.5rem' },
      h('div', {}, h('h1', {}, project.name), project.description ? h('p', { class: 'muted', style: 'margin-top:.2rem' }, project.description) : null),
      h('span', { class: 'spacer' }),
      h('div', { class: 'filters' }, assigneeSel, prioSel,
        me.role === 'admin' ? h('button', { class: 'btn', type: 'button', onclick: () => safely(() => openProjectModal(project, users)) }, icon('sliders'), 'Paramètres') : null)),
    boardEl);
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
      h('div', { class: 'comments' }, commentsTitle, commentsList, commentForm),
    ],
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
