// Recherche plein texte (index texte MongoDB) : suggestions au fil de la frappe, navigation au clavier.
import { h, uid } from '../dom.js';
import { icon } from '../icons.js';
import { api, loadUsers, projectMembers } from '../api.js';
import { PRIO } from '../format.js';
import { safely } from '../ui.js';
import { openTaskModal } from './task-modal.js';
import { route } from '../router.js';

// Surligne les mots cherchés, sans tenir compte des accents (« ecrire » surligne « Écrire »).
const ACCENTS = { a: 'aàâä', c: 'cç', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', y: 'yÿ' };
function highlight(text, query) {
  const words = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length > 1);
  if (!words.length || !text) return text;
  const pattern = words.map((w) => [...w].map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join(''));
  return text.split(new RegExp(`(${pattern.join('|')})`, 'gi')).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

// Ouvre la fenêtre d'une tâche trouvée, quelle que soit la page affichée.
async function openTaskById(taskId) {
  await safely(async () => {
    const task = await api('GET', `/tasks/${taskId}`);
    const [project, { usersById }] = await Promise.all([api('GET', `/projects/${task.projectId}`), loadUsers()]);
    openTaskModal(task, { project, members: projectMembers(project, usersById), usersById, reload: route });
  });
}

// Place le curseur dans la recherche (raccourci « / » ou bouton sur mobile).
export function focusSearch() {
  const input = document.querySelector('.search input');
  if (!input) return false;
  input.closest('.topbar').classList.add('searching');
  input.focus();
  return true;
}

export function searchBox() {
  const listId = uid('results');
  const input = h('input', {
    type: 'search', placeholder: 'Rechercher une tâche…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Rechercher une tâche',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-autocomplete': 'list',
  });
  const results = h('ul', { class: 'search-results', id: listId, role: 'listbox', 'aria-label': 'Résultats', hidden: true });
  const toggle = h('button', { class: 'btn ghost icon-only search-toggle', type: 'button', 'aria-label': 'Rechercher', title: 'Rechercher',
    onclick: focusSearch }, icon('search'));
  const wrap = h('div', { class: 'search', role: 'search' }, toggle, icon('search'), input,
    h('kbd', { class: 'search-kbd', 'aria-hidden': 'true', title: 'Raccourci' }, '/'), results);

  let timer = null;
  let seq = 0;
  let items = [];
  let active = -1;

  const close = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const select = (i) => {
    active = i;
    [...results.querySelectorAll('[role=option]')].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    const current = results.querySelector(`[data-index="${i}"]`);
    if (current) { input.setAttribute('aria-activedescendant', current.id); current.scrollIntoView({ block: 'nearest' }); }
  };
  const choose = (r) => {
    close();
    input.value = '';
    items = [];
    input.blur();
    openTaskById(r._id);
  };

  async function run() {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) { items = []; close(); return; }
    let list = [];
    try { list = await api('GET', `/search?q=${encodeURIComponent(q)}`); } catch { /* recherche indisponible : aucun résultat */ }
    if (mine !== seq) return; // une frappe plus récente a déjà relancé la recherche
    items = list;
    results.replaceChildren(...(list.length
      ? list.map((r, i) => h('li', {
        role: 'option', id: `${listId}-${i}`, 'data-index': i, 'aria-selected': 'false',
        onmousedown: (e) => { e.preventDefault(); choose(r); }, onmousemove: () => { if (active !== i) select(i); },
      },
      h('span', { class: `dot-prio ${r.priority}`, title: `Priorité ${PRIO[r.priority].toLowerCase()}` }),
      h('span', { class: 'sr-main' },
        h('span', { class: 'sr-title' }, highlight(r.title, q)),
        h('span', { class: 'hint' }, `${r.project.name} · ${r.status}`),
        r.excerpt ? h('span', { class: 'sr-excerpt' }, highlight(r.excerpt, q)) : null)))
      : [h('li', { class: 'search-empty' }, `Aucune tâche ne correspond à « ${q} »`)]));
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    select(list.length ? 0 : -1);
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); select((active + 1) % items.length); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); select((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) choose(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); if (!results.hidden) close(); else { input.value = ''; input.blur(); } }
  });
  input.addEventListener('focus', () => { if (items.length || input.value.trim().length >= 2) { results.hidden = false; input.setAttribute('aria-expanded', 'true'); } });
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    if (!input.value) { const bar = wrap.closest('.topbar'); if (bar) bar.classList.remove('searching'); }
  }, 120));
  return wrap;
}
