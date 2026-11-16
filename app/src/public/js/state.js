// État de la session (seul état global du front) et accès protégé au stockage local.

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* stockage indisponible */ } },
};

export const session = {
  token: store.get('token'),
  me: null,
  company: null,
};

export const isAdmin = () => session.me?.role === 'admin';
