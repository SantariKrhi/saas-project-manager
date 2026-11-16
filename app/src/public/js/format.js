// Formatage des noms, dates, tailles et règles d'affichage partagées par les vues.

export const PRIO = { high: 'Haute', medium: 'Moyenne', low: 'Basse' };
export const PRIO_RANK = { high: 0, medium: 1, low: 2 };

export const fullName = (u) => (u ? `${u.firstName} ${u.lastName}` : 'Utilisateur supprimé');
export const initials = (u) => (u ? `${u.firstName[0]}${u.lastName[0]}`.toUpperCase() : '?');
export const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
export const formatSize = (n) => (n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`);

// Les échéances sont des dates « calendaires » stockées à minuit UTC : on les lit en UTC pour ne jamais décaler d'un jour.
export const fmtDue = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dueKey = (t) => (t.dueDate ? t.dueDate.slice(0, 10) : null);
export const startOfToday = () => new Date(new Date().toDateString());

// Une tâche est terminée quand elle est dans la dernière colonne du projet.
export const isLastColumn = (project, status) => status === project.columns[project.columns.length - 1];
export const isOverdue = (t, done) => !!t.dueDate && !done && dueKey(t) < ymd(new Date());

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
export function relTime(d) {
  const sec = (new Date(d) - Date.now()) / 1000;
  for (const [unit, size] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  }
  return 'à l’instant';
}

export function dayLabel(d) {
  const key = ymd(new Date(d));
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (key === ymd(new Date())) return 'Aujourd’hui';
  if (key === ymd(yesterday)) return 'Hier';
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
