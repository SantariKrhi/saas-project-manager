// Journal d'activité d'un projet, affiché dans un tiroir latéral avec pagination « Voir plus ».
import { h } from '../dom.js';
import { api } from '../api.js';
import { fullName, relTime, dayLabel } from '../format.js';
import { safely, withBusy, avatar } from '../ui.js';
import { openModal } from './modal.js';
import { openTaskModal } from './task-modal.js';

const PAGE = 25;

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

// ctx : { members, usersById, reload }, transmis à la fenêtre d'une tâche ouverte depuis le journal.
export function openActivity(project, ctx) {
  const { usersById } = ctx;
  const list = h('ol', { class: 'activity' });
  const more = h('button', { class: 'btn block', type: 'button', hidden: true }, 'Voir plus');
  let before = null;
  let lastDay = null;
  let close = () => {};

  const openTask = (id) => safely(async () => {
    let task;
    try { task = await api('GET', `/tasks/${id}`); } catch { throw new Error('Cette tâche n’existe plus'); }
    close();
    openTaskModal(task, { ...ctx, project });
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
