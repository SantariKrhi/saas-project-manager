// « Mes tâches » : tâches assignées, tous projets confondus, regroupées par échéance.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { api, loadUsers, projectMembers } from '../api.js';
import { PRIO, fmtDue, ymd, dueKey, isOverdue } from '../format.js';
import { safely, checklistMeta } from '../ui.js';
import { openTaskModal } from '../components/task-modal.js';
import { route } from '../router.js';

export async function viewMyTasks() {
  const [tasks, { usersById }] = await Promise.all([api('GET', '/me/tasks'), loadUsers()]);
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
    openTaskModal(task, { project, members: projectMembers(project, usersById), usersById, reload: route });
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
