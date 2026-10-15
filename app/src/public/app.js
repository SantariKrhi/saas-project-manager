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

function toast(message, isError = false) {
  const t = h('div', { class: `toast${isError ? ' error' : ''}` }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 4000);
}

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401 && token) { logout(); throw new Error('Session expirée'); }
  if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
  return data;
}

// Exécute une action et affiche l'erreur éventuelle dans un toast.
async function safely(fn) {
  try { return await fn(); } catch (err) { toast(err.message, true); }
}

const fullName = (u) => (u ? `${u.firstName} ${u.lastName}` : '—');
const initials = (u) => (u ? `${u.firstName[0]}${u.lastName[0]}`.toUpperCase() : '?');
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR');

function logout() {
  token = null; me = null; company = null;
  store.del('token');
  location.hash = '';
  renderAuth();
}

function mount(node) { root.replaceChildren(node); }

function openModal(title, content) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'ghost', 'aria-label': 'Fermer', onclick: close }, '✕')),
      content));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return close;
}

// ---------------------------------------------------------------- authentification

function renderAuth() {
  let mode = 'login';
  const error = h('p', { class: 'error', role: 'alert' });
  const box = h('div', { class: 'panel' });

  const field = (label, name, type = 'text', extra = {}) => [
    h('label', { for: name }, label), h('input', { id: name, name, type, required: true, ...extra }),
  ];

  function draw() {
    const isLogin = mode === 'login';
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        const f = Object.fromEntries(new FormData(e.target));
        try {
          const data = isLogin
            ? await api('POST', '/auth/login', { company: f.company.trim().toLowerCase(), email: f.email, password: f.password })
            : await api('POST', '/auth/register-company', f);
          token = data.token;
          store.set('token', token);
          await boot();
        } catch (err) { error.textContent = err.message; }
      },
    },
    isLogin ? field('Entreprise (identifiant)', 'company', 'text', { placeholder: 'acme', autocomplete: 'organization' })
      : field('Nom de l\'entreprise', 'companyName'),
    isLogin ? [] : [field('Prénom', 'firstName'), field('Nom', 'lastName')],
    field('Email', 'email', 'email', { autocomplete: 'username' }),
    field('Mot de passe', 'password', 'password', { minlength: 8, autocomplete: isLogin ? 'current-password' : 'new-password' }),
    error,
    h('button', { class: 'primary', style: 'width:100%;margin-top:.8rem', type: 'submit' }, isLogin ? 'Se connecter' : 'Créer l\'entreprise'));

    box.replaceChildren(
      h('h1', {}, 'Project Manager'),
      h('div', { class: 'tabs' },
        h('button', { class: mode === 'login' ? 'active' : '', onclick: () => { mode = 'login'; error.textContent = ''; draw(); } }, 'Connexion'),
        h('button', { class: mode === 'register' ? 'active' : '', onclick: () => { mode = 'register'; error.textContent = ''; draw(); } }, 'Nouvelle entreprise')),
      form,
      isLogin ? h('p', { class: 'muted' }, h('small', {}, 'Démo : acme / admin@acme.test / demo1234')) : null);
  }
  draw();
  mount(h('div', { class: 'auth' }, box));
}

// ---------------------------------------------------------------- coque et routage

function shell(content, active) {
  const link = (label, href, key) => h('a', { href, class: active === key ? 'active' : '' }, label);
  return h('div', {},
    h('header', { class: 'topbar' },
      h('a', { href: '#/projects', class: 'brand' }, company.name),
      h('nav', {}, link('Projets', '#/projects', 'projects'), me.role === 'admin' ? link('Équipe', '#/team', 'team') : null),
      h('div', { class: 'user' }, `${fullName(me)} · ${me.role === 'admin' ? 'admin' : 'membre'}`,
        h('button', { class: 'ghost', onclick: logout }, 'Déconnexion'))),
    h('main', {}, content));
}

async function route() {
  if (!token || !me) return;
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/');
  await safely(async () => {
    if (page === 'project' && id) mount(shell(await viewBoard(id), 'projects'));
    else if (page === 'team' && me.role === 'admin') mount(shell(await viewTeam(), 'team'));
    else mount(shell(await viewProjects(), 'projects'));
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
  const projects = await api('GET', '/projects');
  const nameInput = h('input', { placeholder: 'Nom du nouveau projet', required: true });
  const create = me.role === 'admin' && h('form', {
    class: 'form-row',
    onsubmit: (e) => safely(async () => {
      e.preventDefault();
      const p = await api('POST', '/projects', { name: nameInput.value });
      location.hash = `#/project/${p._id}`;
    }),
  }, nameInput, h('button', { class: 'primary', type: 'submit' }, '+ Créer un projet'));

  return h('div', {},
    h('h1', {}, 'Projets'), create,
    projects.length
      ? h('div', { class: 'grid' }, projects.map((p) => h('a', { class: 'card project', href: `#/project/${p._id}` },
        h('h3', {}, p.name), h('p', { class: 'muted' }, p.description || 'Aucune description'),
        h('small', { class: 'muted' }, `${p.memberIds.length} membre(s) · ${p.columns.length} colonnes`))))
      : h('p', { class: 'muted' }, me.role === 'admin' ? 'Aucun projet : créez le premier.' : 'Vous n\'êtes membre d\'aucun projet.'));
}

// ---------------------------------------------------------------- Kanban

async function viewBoard(projectId) {
  const filters = { assigneeId: '', priority: '' };
  const [project, users] = await Promise.all([api('GET', `/projects/${projectId}`), api('GET', '/users')]);
  const usersById = new Map(users.map((u) => [u._id, u]));
  const members = project.memberIds.map((id) => usersById.get(id)).filter(Boolean);

  const boardEl = h('div', { class: 'board' });
  let columns = {};

  async function loadBoard() {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const data = await api('GET', `/projects/${projectId}/board${qs ? `?${qs}` : ''}`);
    columns = data.columns;
    drawBoard();
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
    const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== project.columns[project.columns.length - 1];
    return h('div', {
      class: `task ${task.priority}`, draggable: true, tabindex: 0, 'data-id': task._id,
      onclick: () => openTaskModal(task, { project, members, usersById, reload: loadBoard }),
      onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); },
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', task._id); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); },
      ondragend: (e) => e.currentTarget.classList.remove('dragging'),
    },
    h('div', { class: 'task-title' }, task.title),
    h('div', { class: 'task-meta' },
      task.labels.map((l) => h('span', { class: 'label' }, l)),
      task.dueDate ? h('span', { class: overdue ? 'overdue' : '' }, `📅 ${fmtDate(task.dueDate)}`) : null,
      task.comments.length ? h('span', {}, `💬 ${task.comments.length}`) : null,
      h('span', { class: 'grow' }),
      assignee ? h('span', { class: 'avatar', title: fullName(assignee) }, initials(assignee)) : null));
  }

  function drawColumn(status) {
    const tasks = columns[status] || [];
    const body = h('div', { class: 'column-body' }, tasks.map(drawCard));
    const col = h('section', {
      class: 'column',
      ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); },
      ondragleave: (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); },
      ondrop: (e) => safely(async () => {
        e.preventDefault();
        col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        // Index d'insertion : nombre de cartes (hors carte déplacée) dont le milieu est au-dessus du curseur.
        const cards = [...body.querySelectorAll('.task')].filter((c) => c.dataset.id !== id);
        const idx = cards.filter((c) => { const r = c.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; }).length;
        const others = (columns[status] || []).filter((t) => t._id !== id);
        await api('PATCH', `/tasks/${id}/move`, { status, position: positionAt(others, idx) });
        await loadBoard();
      }),
    },
    h('h3', {}, status, h('span', {}, tasks.length)),
    body,
    h('input', {
      class: 'add-task', placeholder: '+ Ajouter une tâche', 'aria-label': `Ajouter une tâche dans ${status}`,
      onkeydown: (e) => {
        if (e.key !== 'Enter' || !e.target.value.trim()) return;
        const title = e.target.value;
        safely(async () => { await api('POST', `/projects/${projectId}/tasks`, { title, status }); await loadBoard(); });
      },
    }));
    return col;
  }

  function drawBoard() { boardEl.replaceChildren(...project.columns.map(drawColumn)); }

  const assigneeSel = h('select', { 'aria-label': 'Filtrer par assigné', onchange: (e) => { filters.assigneeId = e.target.value; safely(loadBoard); } },
    h('option', { value: '' }, 'Tous les assignés'), members.map((u) => h('option', { value: u._id }, fullName(u))));
  const prioSel = h('select', { 'aria-label': 'Filtrer par priorité', onchange: (e) => { filters.priority = e.target.value; safely(loadBoard); } },
    h('option', { value: '' }, 'Toutes priorités'), h('option', { value: 'high' }, 'Haute'), h('option', { value: 'medium' }, 'Moyenne'), h('option', { value: 'low' }, 'Basse'));

  await loadBoard();
  return h('div', {},
    h('div', { class: 'toolbar' },
      h('a', { href: '#/projects', class: 'muted' }, '← Projets'),
      h('h1', { style: 'margin:0' }, project.name),
      h('span', { class: 'spacer' }), assigneeSel, prioSel,
      me.role === 'admin' ? h('button', { onclick: () => openProjectModal(project, users) }, '⚙ Paramètres') : null),
    project.description ? h('p', { class: 'muted' }, project.description) : null,
    boardEl);
}

// ---------------------------------------------------------------- modale tâche

function openTaskModal(task, ctx) {
  const { project, members, usersById, reload } = ctx;
  const title = h('input', { value: task.title, required: true });
  const desc = h('textarea', { rows: 4, value: task.description || '' });
  const status = h('select', {}, project.columns.map((c) => h('option', { value: c, selected: c === task.status }, c)));
  const assignee = h('select', {}, h('option', { value: '' }, 'Non assignée'),
    members.map((u) => h('option', { value: u._id, selected: u._id === task.assigneeId }, fullName(u))));
  const prio = h('select', {}, [['high', 'Haute'], ['medium', 'Moyenne'], ['low', 'Basse']]
    .map(([v, l]) => h('option', { value: v, selected: v === task.priority }, l)));
  const due = h('input', { type: 'date', value: task.dueDate ? task.dueDate.slice(0, 10) : '' });
  const labels = h('input', { value: (task.labels || []).join(', '), placeholder: 'bug, urgent' });

  const commentsEl = h('div', { class: 'comments' });
  const drawComments = (t) => commentsEl.replaceChildren(
    h('h3', {}, `Commentaires (${t.comments.length})`),
    t.comments.map((c) => h('div', { class: 'comment' },
      h('b', {}, `${fullName(usersById.get(c.userId))} · ${new Date(c.at).toLocaleString('fr-FR')}`), h('div', {}, c.text))));
  drawComments(task);
  const commentInput = h('input', { placeholder: 'Ajouter un commentaire…' });

  const close = openModal('Tâche', h('div', {},
    h('label', {}, 'Titre'), title,
    h('label', {}, 'Description'), desc,
    h('div', { class: 'two' },
      h('div', {}, h('label', {}, 'Statut'), status), h('div', {}, h('label', {}, 'Assignée à'), assignee),
      h('div', {}, h('label', {}, 'Priorité'), prio), h('div', {}, h('label', {}, 'Échéance'), due)),
    h('label', {}, 'Étiquettes (séparées par des virgules)'), labels,
    h('div', { class: 'modal-actions' },
      h('button', { class: 'danger', onclick: () => safely(async () => {
        if (!confirm('Supprimer cette tâche ?')) return;
        await api('DELETE', `/tasks/${task._id}`); close(); await reload();
      }) }, 'Supprimer'),
      h('span', { class: 'spacer' }),
      h('button', { onclick: () => close() }, 'Annuler'),
      h('button', { class: 'primary', onclick: () => safely(async () => {
        await api('PATCH', `/tasks/${task._id}`, {
          title: title.value, description: desc.value, assigneeId: assignee.value || null, priority: prio.value,
          dueDate: due.value || null, labels: labels.value.split(',').map((l) => l.trim()).filter(Boolean),
        });
        if (status.value !== task.status) await api('PATCH', `/tasks/${task._id}/move`, { status: status.value });
        close(); await reload();
      }) }, 'Enregistrer')),
    commentsEl,
    h('form', { class: 'form-row', style: 'margin-top:.5rem', onsubmit: (e) => safely(async () => {
      e.preventDefault();
      if (!commentInput.value.trim()) return;
      const updated = await api('POST', `/tasks/${task._id}/comments`, { text: commentInput.value });
      commentInput.value = '';
      task.comments = updated.comments; // garde la modale cohérente
      drawComments(updated);
      await reload();
    }) }, commentInput, h('button', { type: 'submit' }, 'Envoyer'))));
}

// ---------------------------------------------------------------- modale projet (admin)

function openProjectModal(project, users) {
  const name = h('input', { value: project.name, required: true });
  const desc = h('textarea', { rows: 3, value: project.description || '' });
  const cols = h('input', { value: project.columns.join(', ') });
  const checks = users.map((u) => h('label', {},
    h('input', { type: 'checkbox', value: u._id, checked: project.memberIds.includes(u._id) }), `${fullName(u)} (${u.email})`));

  const close = openModal('Paramètres du projet', h('div', {},
    h('label', {}, 'Nom'), name,
    h('label', {}, 'Description'), desc,
    h('label', {}, 'Colonnes du Kanban (séparées par des virgules)'), cols,
    h('label', {}, 'Membres'), h('div', { class: 'checks' }, checks),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'danger', onclick: () => safely(async () => {
        if (!confirm(`Supprimer le projet « ${project.name} » et toutes ses tâches ?`)) return;
        await api('DELETE', `/projects/${project._id}`); close(); location.hash = '#/projects';
      }) }, 'Supprimer le projet'),
      h('span', { class: 'spacer' }),
      h('button', { onclick: () => close() }, 'Annuler'),
      h('button', { class: 'primary', onclick: () => safely(async () => {
        await api('PATCH', `/projects/${project._id}`, {
          name: name.value, description: desc.value, columns: cols.value.split(',').map((c) => c.trim()).filter(Boolean),
        });
        const memberIds = checks.map((l) => l.firstChild).filter((i) => i.checked).map((i) => i.value);
        await api('PUT', `/projects/${project._id}/members`, { memberIds });
        close(); await route();
      }) }, 'Enregistrer'))));
}

// ---------------------------------------------------------------- équipe (admin)

async function viewTeam() {
  const users = await api('GET', '/users');
  const f = { firstName: h('input', { placeholder: 'Prénom', required: true }), lastName: h('input', { placeholder: 'Nom', required: true }),
    email: h('input', { type: 'email', placeholder: 'Email', required: true }),
    password: h('input', { type: 'password', placeholder: 'Mot de passe (8 car. min.)', required: true, minlength: 8 }) };
  const role = h('select', { style: 'width:auto' }, h('option', { value: 'member' }, 'Membre'), h('option', { value: 'admin' }, 'Admin'));

  const form = h('form', { class: 'form-row', onsubmit: (e) => safely(async () => {
    e.preventDefault();
    await api('POST', '/users', { ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])), role: role.value });
    await route();
  }) }, Object.values(f), role, h('button', { class: 'primary', type: 'submit' }, '+ Ajouter'));

  const rows = users.map((u) => h('tr', {},
    h('td', {}, fullName(u)), h('td', {}, u.email),
    h('td', {}, h('select', { 'aria-label': `Rôle de ${fullName(u)}`, onchange: (e) => safely(async () => {
      try { await api('PATCH', `/users/${u._id}`, { role: e.target.value }); } finally { await route(); }
    }) }, h('option', { value: 'member', selected: u.role === 'member' }, 'Membre'), h('option', { value: 'admin', selected: u.role === 'admin' }, 'Admin'))),
    h('td', {}, u._id === me.id ? h('span', { class: 'muted' }, 'vous') : h('button', { class: 'danger', onclick: () => safely(async () => {
      if (!confirm(`Supprimer ${fullName(u)} ?`)) return;
      await api('DELETE', `/users/${u._id}`); await route();
    }) }, 'Supprimer'))));

  return h('div', {}, h('h1', {}, 'Équipe'), form,
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Nom', 'Email', 'Rôle', ''].map((t) => h('th', {}, t)))), h('tbody', {}, rows))));
}

// ---------------------------------------------------------------- démarrage

if (token) boot(); else renderAuth();
