// Liste des projets visibles (tous pour un admin, les siens pour un membre) et création (admin).
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { api, loadUsers, projectMembers } from '../api.js';
import { isAdmin } from '../state.js';
import { plural } from '../format.js';
import { toast, withBusy, avatar } from '../ui.js';

export async function viewProjects() {
  const [projects, { usersById }] = await Promise.all([api('GET', '/projects'), loadUsers()]);

  const nameInput = h('input', { placeholder: 'Nom du nouveau projet', required: true, 'aria-label': 'Nom du nouveau projet' });
  const createBtn = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Créer le projet');
  const create = isAdmin() && h('form', {
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
    const members = projectMembers(p, usersById);
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
      : h('div', { class: 'empty' }, isAdmin()
        ? 'Aucun projet pour le moment : créez le premier ci-dessus.'
        : 'Vous n’êtes membre d’aucun projet. Demandez à un administrateur de vous ajouter.'));
}
