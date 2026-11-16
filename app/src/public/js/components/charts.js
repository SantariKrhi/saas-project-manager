// Graphiques du tableau de bord, en HTML/CSS (sans bibliothèque), avec équivalent textuel accessible.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { srTable } from '../ui.js';

// Graduation « ronde » et paire, pour que la demi-graduation soit un entier.
function niceMax(m) {
  for (let mag = 1; ; mag *= 10) {
    for (const s of [2, 4, 6, 8, 10]) if (s * mag >= m) return s * mag;
  }
}

export function statTile(label, value, sub, status) {
  return h('div', { class: 'card tile' },
    h('div', { class: 'tile-label' }, label),
    h('div', { class: 'tile-value' }, value),
    h('div', { class: `tile-sub${status ? ` ${status}` : ''}` },
      status === 'critical' ? icon('alert') : status === 'good' ? icon('check') : null, sub));
}

// Histogramme groupé (une colonne par série et par période) avec info-bulle au survol et au focus.
export function columnChart(labels, series) {
  const top = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const tip = h('div', { class: 'tooltip', hidden: true });
  const groups = h('div', { class: 'col-groups' });
  const plot = h('div', { class: 'col-plot' },
    [0, top / 2, top].map((t) => h('div', { class: 'gridline', style: `bottom:${(t / top) * 100}%` }, h('span', {}, t))),
    groups, tip);
  labels.forEach((label, i) => {
    const g = h('div', { class: 'col-group', tabindex: '0', 'aria-label': `${label} : ${series.map((s) => `${s.name} ${s.values[i]}`).join(', ')}` },
      series.map((s) => h('span', { class: `col-bar ${s.cls}`, style: `height:${(s.values[i] / top) * 100}%` })));
    const show = () => {
      tip.replaceChildren(h('b', {}, label), ...series.map((s) => h('div', {}, h('span', { class: `swatch ${s.cls}` }), `${s.name} : ${s.values[i]}`)));
      tip.hidden = false;
      const r = g.getBoundingClientRect();
      const pr = plot.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(r.left - pr.left + r.width / 2, 70), pr.width - 70)}px`;
    };
    const hide = () => { tip.hidden = true; };
    g.addEventListener('mouseenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('mouseleave', hide);
    g.addEventListener('blur', hide);
    groups.append(g);
  });
  return h('div', { class: 'colchart' },
    h('div', { class: 'legend' }, series.map((s) => h('span', {}, h('span', { class: `swatch ${s.cls}` }), s.name))),
    plot,
    h('div', { class: 'col-labels', 'aria-hidden': 'true' }, labels.map((l) => h('span', {}, l))),
    srTable(['Semaine', ...series.map((s) => s.name)], labels.map((l, i) => [l, ...series.map((s) => s.values[i])])));
}

// Barres horizontales (empilées si plusieurs segments), valeur écrite en clair à droite.
export function hbars(rows, legend) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return h('div', { class: 'hbars' },
    legend ? h('div', { class: 'legend' }, legend.map(([cls, name]) => h('span', {}, h('span', { class: `swatch ${cls}` }), name))) : null,
    rows.length
      ? rows.map((r) => h('div', { class: 'hbar-row' },
        h('div', { class: 'hbar-label', title: r.label }, r.label),
        h('div', { class: 'hbar-track', role: 'img', 'aria-label': `${r.label} : ${r.valueText}` },
          r.segments.filter((s) => s.value > 0).map((s) => h('span', {
            class: `hbar-seg ${s.cls}`, style: `width:${(s.value / max) * 100}%`, title: `${s.name ? `${s.name} : ` : ''}${s.value}`,
          }))),
        h('div', { class: 'hbar-value' }, r.valueText, r.note || null)))
      : h('p', { class: 'muted' }, 'Aucune donnée.'));
}
