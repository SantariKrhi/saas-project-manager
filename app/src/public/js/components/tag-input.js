// Saisie d'étiquettes en pastilles : Entrée ou virgule pour ajouter, retour arrière pour retirer la dernière.
import { h } from '../dom.js';
import { icon } from '../icons.js';

export function tagInput(initial, placeholder) {
  const tags = [...initial];
  const input = h('input', { class: 'tag-entry', placeholder });
  const wrap = h('div', { class: 'tag-input', onclick: (e) => { if (e.target === wrap) input.focus(); } });
  const draw = () => {
    wrap.replaceChildren(...tags.map((t, i) => h('span', { class: 'chip tag removable' }, t,
      h('button', { type: 'button', 'aria-label': `Retirer l’étiquette ${t}`, onclick: () => { tags.splice(i, 1); draw(); input.focus(); } }, icon('x')))),
    input);
    input.placeholder = tags.length ? '' : placeholder;
  };
  const commit = () => {
    input.value.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => { if (!tags.includes(t)) tags.push(t); });
    input.value = '';
    draw();
  };
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) { e.preventDefault(); commit(); input.focus(); }
    else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); input.focus(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) commit(); });
  draw();
  return { el: wrap, input, values: () => { if (input.value.trim()) commit(); return [...tags]; } };
}
