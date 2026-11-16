// Appels à l'API REST. Le jeton est ajouté automatiquement ; une réponse 401 déclenche la déconnexion.
import { session } from './state.js';

let onUnauthorized = () => {};

// Le routeur fournit l'action de déconnexion (évite que l'API dépende des vues).
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

// Requête authentifiée brute (fichiers) ; lève une erreur lisible si la réponse n'est pas un succès.
export async function request(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`/api${path}`, {
    method, body, headers: { ...(session.token && { Authorization: `Bearer ${session.token}` }), ...headers },
  });
  if (res.status === 401 && session.token) { onUnauthorized(); throw new Error('Session expirée, reconnectez-vous'); }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try { const data = await res.json(); if (data && data.error) message = data.error; } catch { /* réponse non JSON */ }
    throw new Error(message);
  }
  return res;
}

// Requête JSON.
export async function api(method, path, body) {
  const res = await request(method, path,
    body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

// Contenu d'une pièce jointe (téléchargement et aperçu des images).
export async function fetchAttachment(id) {
  return (await request('GET', `/attachments/${id}`)).blob();
}

// Utilisateurs de l'entreprise, indexés par identifiant, et membres d'un projet.
export async function loadUsers() {
  const users = await api('GET', '/users');
  return { users, usersById: new Map(users.map((u) => [u._id, u])) };
}

export const projectMembers = (project, usersById) => project.memberIds.map((id) => usersById.get(id)).filter(Boolean);
