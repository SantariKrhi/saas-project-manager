// Fenêtre modale (ou tiroir latéral avec variant: 'drawer'). Renvoie la fonction de fermeture.
import { h, uid } from '../dom.js';
import { icon } from '../icons.js';

export function openModal({ title, sub, body, foot, variant, onClose }) {
  const previous = document.activeElement;
  const titleId = uid('title');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
    if (previous && previous.isConnected) previous.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: `overlay${variant ? ` ${variant}` : ''}`, onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal${variant ? ` ${variant}-panel` : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' },
        h('div', {}, h('h2', { id: titleId }, title), sub ? h('div', { class: 'sub' }, sub) : null),
        h('button', { class: 'btn ghost icon-only', type: 'button', 'aria-label': 'Fermer', onclick: () => close() }, icon('x'))),
      h('div', { class: 'modal-body' }, body),
      foot ? h('div', { class: 'modal-foot' }, foot) : null));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  const first = overlay.querySelector('.modal-body input, .modal-body textarea, .modal-body select');
  if (first) first.focus();
  return close;
}
