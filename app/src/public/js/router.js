// Session (démarrage, déconnexion), coque de l'application et routage par l'ancre de l'URL (#/...).
import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { session, store, isAdmin } from './state.js';
import { fullName } from './format.js';
import { safely, avatar } from './ui.js';
import { themeButton } from './components/theme.js';
import { searchBox } from './components/search.js';
import { renderAuth } from './views/auth.js';
import { viewProjects } from './views/projects.js';
import { viewBoard } from './views/board.js';
import { viewMyTasks } from './views/my-tasks.js';
import { viewDashboard } from './views/dashboard.js';
import { viewTeam } from './views/team.js';

let navSeq = 0; // ignore le rendu d'une navigation dépassée par une plus récente

export function logout() {
  session.token = null;
  session.me = null;
  session.company = null;
  store.del('token');
  if (location.hash) location.hash = '';
  renderAuth();
}

// Charge l'utilisateur et son entreprise, puis affiche la page demandée.
export async function boot() {
  try {
    [session.me, session.company] = await Promise.all([api('GET', '/auth/me'), api('GET', '/company')]);
  } catch { return logout(); }
  await route();
}

function shell(content, active) {
  const { me, company } = session;
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
        isAdmin() ? link('Équipe', '#/team', 'team', 'users') : null),
      searchBox(),
      h('div', { class: 'user' },
        h('div', { class: 'user-name' }, h('span', {}, fullName(me)), h('small', {}, isAdmin() ? 'Administrateur' : 'Membre')),
        avatar(me, true),
        themeButton(),
        h('button', { class: 'btn ghost icon-only', type: 'button', title: 'Se déconnecter', 'aria-label': 'Se déconnecter', onclick: logout }, icon('logout')))),
    h('main', {}, content));
}

// #/projects | #/project/:id[/calendar] | #/my | #/dashboard[/:projectId] | #/team (admin)
export async function route() {
  if (!session.token || !session.me) return;
  const seq = ++navSeq;
  const [page, id, sub] = location.hash.replace(/^#\/?/, '').split('/');
  await safely(async () => {
    let view;
    if (page === 'project' && id) view = shell(await viewBoard(id, sub === 'calendar' ? 'calendar' : 'kanban'), 'projects');
    else if (page === 'my') view = shell(await viewMyTasks(), 'my');
    else if (page === 'dashboard') view = shell(await viewDashboard(id), 'dashboard');
    else if (page === 'team' && isAdmin()) view = shell(await viewTeam(), 'team');
    else view = shell(await viewProjects(), 'projects');
    if (seq === navSeq) mount(view);
  });
}
