// Gestion de l'équipe (admin) : ajout, changement de rôle, suppression.
import { h, field } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { session } from '../state.js';
import { fullName } from '../format.js';
import { toast, safely, withBusy, avatar } from '../ui.js';
import { route } from '../router.js';

const roleOptions = (current) => [
  h('option', { value: 'member', selected: current === 'member' }, 'Membre'),
  h('option', { value: 'admin', selected: current === 'admin' }, 'Administrateur'),
];

export async function viewTeam() {
  const users = await api('GET', '/users');
  const i = {
    firstName: h('input', { required: true, autocomplete: 'off' }),
    lastName: h('input', { required: true, autocomplete: 'off' }),
    email: h('input', { type: 'email', required: true, autocomplete: 'off' }),
    password: h('input', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password', placeholder: '8 caractères min.' }),
  };
  const role = h('select', {}, roleOptions('member'));
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
    const isMe = u._id === session.me.id;
    const roleSel = h('select', { 'aria-label': `Rôle de ${fullName(u)}`, onchange: (e) => safely(async () => {
      try {
        await api('PATCH', `/users/${u._id}`, { role: e.target.value });
        toast('Rôle mis à jour');
      } finally { await route(); }
    }) }, roleOptions(u.role));
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
