// Point d'entrée du front (modules ES natifs, sans étape de build).
//   state / api / dom / icons / format / ui : briques de base
//   components/ : éléments réutilisables (modales, recherche, graphiques…)
//   views/      : une page par fichier, choisie par le routeur
import { setUnauthorizedHandler } from './api.js';
import { session } from './state.js';
import { applyTheme } from './components/theme.js';
import { focusSearch } from './components/search.js';
import { renderAuth } from './views/auth.js';
import { boot, logout, route } from './router.js';

applyTheme();
setUnauthorizedHandler(logout);
window.addEventListener('hashchange', route);

// Raccourci « / » : place le curseur dans la recherche (sauf pendant une saisie ou une fenêtre ouverte).
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.overlay')) return;
  if (focusSearch()) e.preventDefault();
});

if (session.token) boot(); else renderAuth();
