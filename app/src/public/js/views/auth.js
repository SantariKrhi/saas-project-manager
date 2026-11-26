// Écran de connexion / création d'entreprise.
import { h, field, mount, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { session, store } from '../state.js';
import { themeButton } from '../components/theme.js';
import { boot } from '../router.js';

export function renderAuth() {
  let mode = 'login';
  const box = h('div', { class: 'panel' });

  function draw() {
    const isLogin = mode === 'login';
    const alert = h('div', { class: 'alert', role: 'alert' });
    const input = (name, type, extra = {}) => h('input', { name, type, required: true, ...extra });
    const i = isLogin
      ? {
        company: input('company', 'text', { placeholder: 'ex. acme', autocomplete: 'organization', autocapitalize: 'none', spellcheck: 'false' }),
        email: input('email', 'email', { autocomplete: 'username' }),
        password: input('password', 'password', { autocomplete: 'current-password' }),
      }
      : {
        companyName: input('companyName', 'text', { autocomplete: 'organization' }),
        firstName: input('firstName', 'text', { autocomplete: 'given-name' }),
        lastName: input('lastName', 'text', { autocomplete: 'family-name' }),
        email: input('email', 'email', { autocomplete: 'username' }),
        password: input('password', 'password', { minlength: 8, autocomplete: 'new-password' }),
      };
    const submit = h('button', { class: 'btn primary block auth-submit', type: 'submit' },
      isLogin ? 'Se connecter' : 'Créer l’entreprise');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        alert.replaceChildren();
        const f = Object.fromEntries(new FormData(e.target));
        submit.disabled = true;
        try {
          const data = isLogin
            ? await api('POST', '/auth/login', { company: f.company, email: f.email, password: f.password })
            : await api('POST', '/auth/register-company', f);
          session.token = data.token;
          store.set('token', data.token);
          await boot();
        } catch (err) {
          alert.replaceChildren(icon('alert'), h('span', {}, err.message));
        } finally {
          submit.disabled = false;
        }
      },
    },
    isLogin
      ? [field('Entreprise', i.company, 'Identifiant donné à la création de l’entreprise'), field('Email', i.email), field('Mot de passe', i.password)]
      : [field('Nom de l’entreprise', i.companyName),
        h('div', { class: 'two' }, field('Prénom', i.firstName), field('Nom', i.lastName)),
        field('Email', i.email), field('Mot de passe', i.password, '8 caractères minimum')],
    alert, submit);

    const demo = isLogin && h('div', { class: 'demo' },
      h('div', {}, h('div', { class: 'demo-title' }, 'Compte de démonstration'), h('code', {}, 'acme · admin@acme.test · demo1234')),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        i.company.value = 'acme'; i.email.value = 'admin@acme.test'; i.password.value = 'demo1234'; submit.focus();
      } }, 'Remplir'));

    const tab = (key, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === key),
      onclick: () => { if (mode !== key) { mode = key; draw(); } } }, label);

    setChildren(box, h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Mode' },
      tab('login', 'Connexion'), tab('register', 'Nouvelle entreprise')), form, demo);
  }

  draw();
  mount(h('div', { class: 'auth' },
    h('div', { class: 'auth-theme' }, themeButton()),
    h('div', { class: 'auth-box' },
      h('div', { class: 'auth-head' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, 'PM'), h('h1', {}, 'Project Manager')),
      box)));
}
