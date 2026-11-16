// Thème auto / clair / sombre, mémorisé dans le stockage local.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { store } from '../state.js';

const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Thème automatique', light: 'Thème clair', dark: 'Thème sombre' };
const THEME_ICON = { auto: 'monitor', light: 'sun', dark: 'moon' };
let theme = THEMES.includes(store.get('theme')) ? store.get('theme') : 'auto';

export function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function themeButton() {
  const btn = h('button', { class: 'btn ghost icon-only', type: 'button' });
  const sync = () => {
    btn.replaceChildren(icon(THEME_ICON[theme]));
    btn.title = `${THEME_LABEL[theme]} (cliquer pour changer)`;
    btn.setAttribute('aria-label', btn.title);
  };
  btn.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('theme', theme);
    applyTheme();
    sync();
  });
  sync();
  return btn;
}
