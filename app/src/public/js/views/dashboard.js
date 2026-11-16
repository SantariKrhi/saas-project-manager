// Tableau de bord : statistiques calculées par MongoDB (aggregation $facet), tous projets ou un seul.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { PRIO, fullName, plural, ymd, startOfToday } from '../format.js';
import { statTile, columnChart, hbars } from '../components/charts.js';

const WEEKS = 8;

const overdueNote = (n) => (n ? h('span', { class: 'chip overdue', title: 'En retard' }, icon('alert'), n) : null);
const countOf = (list, id) => (list.find((s) => s._id === id) || { count: 0 }).count;

// Lundis des WEEKS dernières semaines, y compris la semaine en cours.
function lastMondays() {
  const monday = startOfToday();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: WEEKS }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() - 7 * (WEEKS - 1 - i)); return d; });
}

export async function viewDashboard(projectId) {
  const [projects, stats] = await Promise.all([api('GET', '/projects'), api('GET', `/stats${projectId ? `?projectId=${projectId}` : ''}`)]);
  const project = projectId ? projects.find((p) => p._id === projectId) : null;
  const { totals } = stats;
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  const scope = h('select', { 'aria-label': 'Périmètre du tableau de bord', class: 'auto-width',
    onchange: (e) => { location.hash = e.target.value ? `#/dashboard/${e.target.value}` : '#/dashboard'; } },
  h('option', { value: '' }, 'Tous mes projets'),
  projects.map((p) => h('option', { value: p._id, selected: p._id === projectId }, p.name)));

  const weeks = lastMondays();
  const perWeek = (list) => { const m = Object.fromEntries(list.map((w) => [ymd(new Date(w._id)), w.count])); return weeks.map((w) => m[ymd(w)] || 0); };
  const weekLabels = weeks.map((w) => w.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));

  const card = (title, hint, content, wide) => h('section', { class: `card chart-card${wide ? ' wide' : ''}` },
    h('h2', {}, title), hint ? h('p', { class: 'hint' }, hint) : null, content);

  const breakdown = project
    ? card('Répartition par colonne', 'Nombre de tâches dans chaque colonne du Kanban', hbars(project.columns.map((c) => {
      const n = countOf(stats.byStatus, c);
      return { label: c, total: n, valueText: String(n), segments: [{ value: n, cls: 's1' }] };
    })))
    : card('Avancement par projet', 'Tâches terminées sur le total', hbars(stats.byProject.map((p) => ({
      label: p.name, total: p.total, valueText: `${p.done}/${p.total} · ${Math.round((p.done / p.total) * 100)} %`, note: overdueNote(p.overdue),
      segments: [{ value: p.done, cls: 's1', name: 'Terminées' }, { value: p.total - p.done, cls: 'rest', name: 'Restantes' }],
    })), [['s1', 'Terminées'], ['rest', 'Restantes']]));

  const people = card('Charge par personne', 'Tâches assignées, terminées ou en cours', hbars(stats.byAssignee.map((a) => ({
    label: a.user ? fullName(a.user) : 'Non assignées', total: a.total, valueText: String(a.total), note: overdueNote(a.overdue),
    segments: [{ value: a.done, cls: 's1', name: 'Terminées' }, { value: a.total - a.done, cls: 's2', name: 'En cours' }],
  })), [['s1', 'Terminées'], ['s2', 'En cours']]));

  const priorities = card('Par priorité', null, hbars(['high', 'medium', 'low'].map((k) => {
    const n = countOf(stats.byPriority, k);
    return { label: PRIO[k], total: n, valueText: String(n), segments: [{ value: n, cls: 's1' }] };
  })));

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Tableau de bord'), h('span', { class: 'spacer' }), scope),
    h('div', { class: 'tiles' },
      statTile('Tâches', totals.total, project ? project.name : plural(stats.byProject.length, 'projet')),
      statTile('Terminées', totals.done, `${pct} % du total`),
      statTile('En retard', totals.overdue, totals.overdue ? 'échéance dépassée' : 'aucun retard', totals.overdue ? 'critical' : 'good'),
      statTile('Non assignées', totals.unassigned, totals.unassigned ? 'à répartir' : 'tout est réparti')),
    h('div', { class: 'dash-grid' },
      card('Tâches créées et terminées par semaine', `Sur les ${WEEKS} dernières semaines`, columnChart(weekLabels, [
        { name: 'Créées', cls: 's1', values: perWeek(stats.createdPerWeek) },
        { name: 'Terminées', cls: 's2', values: perWeek(stats.completedPerWeek) },
      ]), true),
      breakdown, people, priorities));
}
