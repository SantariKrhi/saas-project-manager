// Construction du DOM sans innerHTML : le texte passe toujours par append() (pas de XSS).

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'selected', 'disabled', 'draggable'].includes(k)) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  }
  return el;
}

// Remplace les enfants d'un élément en ignorant null / false (replaceChildren les écrirait en texte).
export function setChildren(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

let idCounter = 0;
export const uid = (prefix = 'f') => `${prefix}${++idCounter}`;

// Champ de formulaire avec son libellé associé (for / id). `target` : élément focalisable visé par le libellé.
export function field(label, control, hint, target = control) {
  if (!target.id) target.id = uid();
  return h('div', { class: 'field' }, h('label', { for: target.id }, label), control,
    hint ? h('div', { class: 'hint' }, hint) : null);
}

// Remplace le contenu de la page.
export function mount(node) {
  document.getElementById('app').replaceChildren(node);
}
