// Page d'un projet : Kanban (glisser-déposer) ou calendrier, avec filtres communs.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { api, loadUsers, projectMembers } from '../api.js';
import { isAdmin } from '../state.js';
import { PRIO, fullName, fmtDue, plural, isLastColumn, isOverdue } from '../format.js';
import { safely, avatar, checklistMeta } from '../ui.js';
import { openTaskModal } from '../components/task-modal.js';
import { openProjectModal } from '../components/project-modal.js';
import { openActivity } from '../components/activity.js';
import { calendarView } from './calendar.js';

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

function kanbanView(project, { members, usersById, filters }) {
  const el = h('div', { class: 'board' });
  const indicator = h('div', { class: 'drop-indicator', 'aria-hidden': 'true' });
  let columns = {};
  let draggingId = null;

  async function load() {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const data = await api('GET', `/projects/${project._id}/board${qs ? `?${qs}` : ''}`);
    columns = data.columns;
    el.replaceChildren(...project.columns.map(drawColumn));
  }

  function clearDrop() {
    indicator.remove();
    el.querySelectorAll('.column.over').forEach((c) => c.classList.remove('over'));
  }

  // Index d'insertion : nombre de cartes (hors carte déplacée) dont le milieu est au-dessus du curseur.
  function dropIndex(body, y) {
    const cards = [...body.querySelectorAll('.task')].filter((c) => c.dataset.id !== draggingId);
    const idx = cards.filter((c) => { const r = c.getBoundingClientRect(); return y > r.top + r.height / 2; }).length;
    return { cards, idx };
  }

  function drawCard(task) {
    const assignee = usersById.get(task.assigneeId);
    const overdue = isOverdue(task, isLastColumn(project, task.status));
    const open = () => openTaskModal(task, { project, members, usersById, reload: load });
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
          await api('POST', `/projects/${project._id}/tasks`, { title, status });
          await load();
          // Garde le focus dans la colonne pour enchaîner les saisies
          const next = el.querySelector(`[data-status="${CSS.escape(status)}"] .add-task input`);
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
          el.querySelectorAll('.column.over').forEach((c) => c.classList.remove('over'));
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
          await load();
        });
      },
    },
    h('div', { class: 'column-head' }, h('h3', {}, status), h('span', { class: 'count' }, tasks.length)),
    body,
    h('div', { class: 'add-task' }, icon('plus'), addInput));
    return col;
  }

  return { el, load };
}

export async function viewBoard(projectId, mode = 'kanban') {
  const filters = { assigneeId: '', priority: '' };
  const [project, { users, usersById }] = await Promise.all([api('GET', `/projects/${projectId}`), loadUsers()]);
  const members = projectMembers(project, usersById);

  // Les filtres s'appliquent à la vue affichée (Kanban ou calendrier) : les deux exposent { el, load }.
  const view = mode === 'calendar'
    ? calendarView(project, { members, usersById, filters })
    : kanbanView(project, { members, usersById, filters });
  await view.load();
  const refresh = () => view.load();

  const select = (label, options, onChange) => h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
    options.map(([v, l]) => h('option', { value: v }, l)));
  const assigneeSel = select('Filtrer par personne', [['', 'Tout le monde'], ...members.map((u) => [u._id, fullName(u)])],
    (v) => { filters.assigneeId = v; safely(refresh); });
  const prioSel = select('Filtrer par priorité', [['', 'Toute priorité'], ...Object.entries(PRIO)],
    (v) => { filters.priority = v; safely(refresh); });

  const tab = (key, label, iconName, href) => h('a', { href, role: 'tab', 'aria-selected': String(mode === key), class: mode === key ? 'active' : '' }, icon(iconName), label);
  return h('div', {},
    h('a', { href: '#/projects', class: 'back' }, icon('arrowLeft'), 'Projets'),
    h('div', { class: 'page-head project-head' },
      h('div', {}, h('h1', {}, project.name), project.description ? h('p', { class: 'muted project-desc' }, project.description) : null),
      h('span', { class: 'spacer' }),
      h('div', { class: 'filters' }, assigneeSel, prioSel,
        h('button', { class: 'btn', type: 'button', onclick: () => openActivity(project, { members, usersById, reload: refresh }) }, icon('history'), 'Activité'),
        isAdmin() ? h('button', { class: 'btn', type: 'button', onclick: () => safely(() => openProjectModal(project, users)) }, icon('sliders'), 'Paramètres') : null)),
    h('div', { class: 'view-tabs', role: 'tablist', 'aria-label': 'Vue du projet' },
      tab('kanban', 'Kanban', 'columns', `#/project/${project._id}`),
      tab('calendar', 'Calendrier', 'calendar', `#/project/${project._id}/calendar`)),
    view.el);
}
