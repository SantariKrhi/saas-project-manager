// Calendrier d'un projet : mois affiché sur 6 semaines (lundi -> dimanche).
// Glisser une tâche sur un jour change son échéance ; sur le panneau latéral, la retire.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { PRIO, PRIO_RANK, fullName, fmtDue, ymd, dueKey, isLastColumn, isOverdue } from '../format.js';
import { toast, safely } from '../ui.js';
import { openTaskModal } from '../components/task-modal.js';

const DOW = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

export function calendarView(project, { members, usersById, filters }) {
  let month = firstOfMonth(new Date());
  let tasks = [];
  let undated = [];
  let dragId = null;
  const el = h('div', { class: 'calendar' });

  const gridStart = () => { const d = new Date(month); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  const matches = (t) => (!filters.assigneeId || t.assigneeId === filters.assigneeId) && (!filters.priority || t.priority === filters.priority);
  const sorted = (list) => list.filter(matches).sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.title.localeCompare(b.title));

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

    const go = (target) => { month = target; safely(load); };
    const label = month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const noDue = sorted(undated);
    const side = h('aside', { class: 'card cal-side' },
      h('h3', {}, 'Sans échéance', h('span', { class: 'count' }, noDue.length)),
      h('p', { class: 'hint' }, 'Glissez une tâche sur un jour pour lui donner une échéance, ou ici pour la retirer.'),
      h('div', { class: 'cal-undated' }, noDue.length ? noDue.map(chip) : h('p', { class: 'muted' }, 'Aucune tâche.')));
    dropTarget(side, null);

    el.replaceChildren(
      h('div', { class: 'cal-toolbar' },
        h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Mois précédent', title: 'Mois précédent',
          onclick: () => go(new Date(month.getFullYear(), month.getMonth() - 1, 1)) }, icon('chevronLeft')),
        h('h2', { class: 'cal-title', 'aria-live': 'polite' }, label[0].toUpperCase() + label.slice(1)),
        h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Mois suivant', title: 'Mois suivant',
          onclick: () => go(new Date(month.getFullYear(), month.getMonth() + 1, 1)) }, icon('chevronRight')),
        h('button', { class: 'btn', type: 'button', onclick: () => go(firstOfMonth(new Date())) }, 'Aujourd’hui')),
      h('div', { class: 'cal-layout' },
        h('div', {},
          h('div', { class: 'cal-grid' }, DOW.map((d) => h('div', { class: 'cal-head', 'aria-hidden': 'true' }, d)), cells),
          visible ? null : h('p', { class: 'cal-empty muted' }, 'Aucune échéance ce mois-ci.')),
        side));
  }

  return { el, load };
}
