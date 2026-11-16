// Petits composants et aides d'interface partagés par toutes les vues.
import { h } from './dom.js';
import { icon } from './icons.js';
import { fullName, initials } from './format.js';

export function toast(message, type = 'ok') {
  const t = h('div', { class: `toast${type === 'error' ? ' error' : ''}`, role: type === 'error' ? 'alert' : 'status' },
    icon(type === 'error' ? 'alert' : 'check'), h('span', {}, message));
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), type === 'error' ? 5000 : 3000);
}

// Exécute une action et affiche l'erreur éventuelle dans une notification.
export async function safely(fn) {
  try { return await fn(); } catch (err) { toast(err.message, 'error'); }
}

// Désactive un bouton pendant l'action (évite les doubles envois).
export async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await safely(fn); } finally { if (btn) btn.disabled = false; }
}

export const avatar = (u, large = false) => h('span', { class: `avatar${large ? ' lg' : ''}`, title: fullName(u) }, initials(u));

// Tableau masqué : équivalent textuel des graphiques pour les lecteurs d'écran.
export const srTable = (headers, rows) => h('table', { class: 'sr-only' },
  h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
  h('tbody', {}, rows.map((r) => h('tr', {}, r.map((x) => h('td', {}, x))))));

// Avancement de la checklist sur une carte (vert quand tout est coché).
export function checklistMeta(task) {
  const list = task.checklist || [];
  if (!list.length) return null;
  const done = list.filter((i) => i.done).length;
  return h('span', { class: `meta${done === list.length ? ' ok' : ''}`, title: `Checklist : ${done} sur ${list.length}` },
    icon('checkSquare'), `${done}/${list.length}`);
}
