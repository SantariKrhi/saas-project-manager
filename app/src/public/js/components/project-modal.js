// Paramètres d'un projet (admin) : nom, description, colonnes du Kanban et membres.
import { h, field } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { fullName, plural } from '../format.js';
import { toast, withBusy, avatar } from '../ui.js';
import { openModal } from './modal.js';
import { route } from '../router.js';

// Éditeur des colonnes : une ligne par colonne (renommer, monter, descendre, supprimer).
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

export async function openProjectModal(project, users) {
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
        h('div', { class: 'hint field-intro' }, 'Dans l’ordre d’affichage. Renommer une colonne y conserve ses tâches.'),
        editor.el),
      h('div', { class: 'field' }, h('span', { class: 'label-text' }, 'Membres'), checks),
    ],
    foot: [deleteBtn, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Annuler'), saveBtn],
  });
}
