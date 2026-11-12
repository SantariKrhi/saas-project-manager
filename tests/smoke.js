// Test de bout en bout de l'API (isolation, droits, Kanban, cascades).
// Usage (Node 18+) : node tests/smoke.js [http://localhost:3000]
// Prérequis : application démarrée avec le seed de démo (acme / globex, mot de passe demo1234).
const assert = require('node:assert/strict');

const BASE = process.argv[2] || 'http://localhost:3000';
let passed = 0;

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// Envoi d'un fichier brut (pièces jointes GridFS)
async function upload(token, taskId, content, name, type = 'text/plain') {
  const res = await fetch(`${BASE}/api/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), 'X-File-Type': type },
    body: content,
  });
  return { status: res.status, body: await res.json() };
}

async function download(token, fileId) {
  const res = await fetch(`${BASE}/api/attachments/${fileId}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

const login = async (company, email) =>
  (await call(null, 'POST', '/api/auth/login', { company, email, password: 'demo1234' })).body;

(async () => {
  const acmeAdmin = await login('acme', 'admin@acme.test');
  const acmeBob = await login('acme', 'bob@acme.test');
  const globexAdmin = await login('globex', 'admin@globex.test');
  const A = acmeAdmin.token, B = acmeBob.token, G = globexAdmin.token;

  const acmeProject = (await call(A, 'GET', '/api/projects')).body.find((p) => p.name.startsWith('Projet démo'));
  const globexProject = (await call(G, 'GET', '/api/projects')).body[0];
  const globexTask = (await call(G, 'GET', `/api/projects/${globexProject._id}/tasks`)).body[0];
  const globexUser = (await call(G, 'GET', '/api/users')).body[0];

  console.log('Isolation entre entreprises');
  await test('liste des projets : uniquement ceux de son entreprise', async () => {
    const list = (await call(A, 'GET', '/api/projects')).body;
    assert.ok(list.length > 0 && list.every((p) => p.companyId === acmeAdmin.user.companyId));
  });
  await test('projet d\'une autre entreprise : 404', async () => {
    assert.equal((await call(A, 'GET', `/api/projects/${globexProject._id}`)).status, 404);
  });
  await test('modifier / supprimer un projet d\'une autre entreprise : 404', async () => {
    assert.equal((await call(A, 'PATCH', `/api/projects/${globexProject._id}`, { name: 'hack' })).status, 404);
    assert.equal((await call(A, 'DELETE', `/api/projects/${globexProject._id}`)).status, 404);
  });
  await test('tâche d\'une autre entreprise : 404 (lecture, modification, déplacement, suppression)', async () => {
    assert.equal((await call(A, 'GET', `/api/tasks/${globexTask._id}`)).status, 404);
    assert.equal((await call(A, 'PATCH', `/api/tasks/${globexTask._id}`, { title: 'hack' })).status, 404);
    assert.equal((await call(A, 'PATCH', `/api/tasks/${globexTask._id}/move`, { status: 'done' })).status, 404);
    assert.equal((await call(A, 'DELETE', `/api/tasks/${globexTask._id}`)).status, 404);
  });
  await test('créer une tâche / lire le board d\'un projet d\'une autre entreprise : 404', async () => {
    assert.equal((await call(A, 'POST', `/api/projects/${globexProject._id}/tasks`, { title: 'x' })).status, 404);
    assert.equal((await call(A, 'GET', `/api/projects/${globexProject._id}/board`)).status, 404);
  });
  await test('utilisateur d\'une autre entreprise : 404, et absent de la liste', async () => {
    assert.equal((await call(A, 'GET', `/api/users/${globexUser._id}`)).status, 404);
    assert.equal((await call(A, 'DELETE', `/api/users/${globexUser._id}`)).status, 404);
    assert.ok((await call(A, 'GET', '/api/users')).body.every((u) => u.companyId === acmeAdmin.user.companyId));
  });
  await test('companyId du body ignoré à la création', async () => {
    const res = await call(A, 'POST', '/api/projects', { name: 'Test isolation', companyId: globexAdmin.user.companyId });
    assert.equal(res.status, 201);
    assert.equal(res.body.companyId, acmeAdmin.user.companyId);
    await call(A, 'DELETE', `/api/projects/${res.body._id}`);
  });
  await test('assigner une tâche à un utilisateur d\'une autre entreprise : 400', async () => {
    const res = await call(A, 'POST', `/api/projects/${acmeProject._id}/tasks`, { title: 'x', assigneeId: globexUser._id });
    assert.equal(res.status, 400);
  });
  await test('mots de passe jamais renvoyés', async () => {
    const users = (await call(A, 'GET', '/api/users')).body;
    assert.ok(users.every((u) => !('passwordHash' in u)));
  });

  console.log('Droits');
  await test('sans token : 401', async () => {
    assert.equal((await call(null, 'GET', '/api/projects')).status, 401);
  });
  await test('un membre ne peut pas créer de projet ni d\'utilisateur : 403', async () => {
    assert.equal((await call(B, 'POST', '/api/projects', { name: 'x' })).status, 403);
    assert.equal((await call(B, 'POST', '/api/users', { email: 'a@b.fr', password: 'motdepasse1', firstName: 'a', lastName: 'b' })).status, 403);
  });
  await test('l\'admin ne peut pas supprimer son propre compte', async () => {
    assert.equal((await call(A, 'DELETE', `/api/users/${acmeAdmin.user.id}`)).status, 400);
  });
  await test('le dernier admin ne peut pas être rétrogradé', async () => {
    assert.equal((await call(A, 'PATCH', `/api/users/${acmeAdmin.user.id}`, { role: 'member' })).status, 409);
  });

  console.log('Kanban et tâches');
  let task;
  await test('création d\'une tâche (colonne par défaut, position)', async () => {
    const res = await call(B, 'POST', `/api/projects/${acmeProject._id}/tasks`, { title: 'Ma tâche', assigneeId: acmeBob.user.id, priority: 'high', dueDate: '2030-01-31' });
    assert.equal(res.status, 201);
    task = res.body;
    assert.equal(task.status, 'todo');
    assert.equal(task.assigneeId, acmeBob.user.id);
    assert.ok(task.position > 0);
  });
  await test('statut hors colonnes du projet : 400', async () => {
    assert.equal((await call(B, 'PATCH', `/api/tasks/${task._id}`, { status: 'inconnu' })).status, 400);
  });
  await test('déplacement dans le board', async () => {
    const res = await call(B, 'PATCH', `/api/tasks/${task._id}/move`, { status: 'doing', position: 1 });
    assert.equal(res.status, 200);
    const board = (await call(B, 'GET', `/api/projects/${acmeProject._id}/board`)).body;
    assert.equal(board.columns.doing[0]._id, task._id);
    assert.ok(!board.columns.todo.some((t) => t._id === task._id));
  });
  await test('filtre du board par priorité', async () => {
    const board = (await call(B, 'GET', `/api/projects/${acmeProject._id}/board?priority=high`)).body;
    const all = Object.values(board.columns).flat();
    assert.ok(all.length > 0 && all.every((t) => t.priority === 'high'));
  });
  await test('commentaire', async () => {
    const res = await call(B, 'POST', `/api/tasks/${task._id}/comments`, { text: 'Salut' });
    assert.equal(res.status, 201);
    assert.equal(res.body.comments.length, 1);
    assert.equal(res.body.comments[0].userId, acmeBob.user.id);
  });

  await test('renommer une colonne déplace ses tâches (y compris un échange de noms)', async () => {
    const p = (await call(A, 'POST', '/api/projects', { name: 'Renommage', columns: ['a', 'b'] })).body;
    const ta = (await call(A, 'POST', `/api/projects/${p._id}/tasks`, { title: 'ta', status: 'a' })).body;
    const tb = (await call(A, 'POST', `/api/projects/${p._id}/tasks`, { title: 'tb', status: 'b' })).body;
    // Renommer sans déclarer le renommage = supprimer une colonne non vide : refusé
    assert.equal((await call(A, 'PATCH', `/api/projects/${p._id}`, { columns: ['À faire', 'b'] })).status, 409);
    let res = await call(A, 'PATCH', `/api/projects/${p._id}`, { columns: ['À faire', 'b'], renamedColumns: [{ from: 'a', to: 'À faire' }] });
    assert.equal(res.status, 200);
    assert.equal((await call(A, 'GET', `/api/tasks/${ta._id}`)).body.status, 'À faire');
    // Échange : chaque tâche suit sa colonne
    res = await call(A, 'PATCH', `/api/projects/${p._id}`, { columns: ['b', 'À faire'], renamedColumns: [{ from: 'À faire', to: 'b' }, { from: 'b', to: 'À faire' }] });
    assert.equal(res.status, 200);
    assert.equal((await call(A, 'GET', `/api/tasks/${ta._id}`)).body.status, 'b');
    assert.equal((await call(A, 'GET', `/api/tasks/${tb._id}`)).body.status, 'À faire');
    // Fusion dans une colonne conservée : refusée
    assert.equal((await call(A, 'PATCH', `/api/projects/${p._id}`, { columns: ['b'], renamedColumns: [{ from: 'À faire', to: 'b' }] })).status, 400);
    await call(A, 'DELETE', `/api/projects/${p._id}`);
  });

  console.log('Checklist');
  await test('ajout, cochage ciblé (arrayFilters) et suppression d\'éléments', async () => {
    const t = (await call(B, 'POST', `/api/projects/${acmeProject._id}/tasks`, { title: 'Avec checklist' })).body;
    await call(B, 'POST', `/api/tasks/${t._id}/checklist`, { text: 'Étape 1' });
    const withTwo = (await call(B, 'POST', `/api/tasks/${t._id}/checklist`, { text: 'Étape 2' })).body;
    assert.equal(withTwo.checklist.length, 2);
    const [first, second] = withTwo.checklist;
    const checked = (await call(B, 'PATCH', `/api/tasks/${t._id}/checklist/${second._id}`, { done: true })).body;
    assert.deepEqual(checked.checklist.map((i) => i.done), [false, true]);
    assert.equal((await call(B, 'PATCH', `/api/tasks/${t._id}/checklist/${second._id}`, { done: 'oui' })).status, 400);
    const removed = (await call(B, 'DELETE', `/api/tasks/${t._id}/checklist/${first._id}`)).body;
    assert.deepEqual(removed.checklist.map((i) => i.text), ['Étape 2']);
    assert.equal((await call(G, 'POST', `/api/tasks/${t._id}/checklist`, { text: 'intrus' })).status, 404);
    await call(B, 'DELETE', `/api/tasks/${t._id}`);
  });

  console.log('Mes tâches');
  await test('uniquement les tâches assignées, enrichies du projet, non terminées d\'abord', async () => {
    const mine = (await call(B, 'GET', '/api/me/tasks')).body;
    assert.ok(mine.length > 0);
    assert.ok(mine.every((t) => t.assigneeId === acmeBob.user.id && t.companyId === acmeBob.user.companyId));
    assert.ok(mine.every((t) => typeof t.project.name === 'string'));
    const firstDone = mine.findIndex((t) => t.done);
    assert.ok(firstDone === -1 || mine.slice(firstDone).every((t) => t.done));
  });

  console.log('Date de fin et filtres d\'échéance');
  await test('completedAt posée à l\'arrivée dans la dernière colonne, retirée à la sortie', async () => {
    const t = (await call(B, 'POST', `/api/projects/${acmeProject._id}/tasks`, { title: 'Fin', dueDate: '2031-03-15' })).body;
    assert.equal(t.completedAt, null);
    const done = (await call(B, 'PATCH', `/api/tasks/${t._id}/move`, { status: 'done' })).body;
    assert.ok(done.completedAt);
    const back = (await call(B, 'PATCH', `/api/tasks/${t._id}`, { status: 'todo' })).body;
    assert.equal(back.completedAt, null);
    const march = (await call(B, 'GET', `/api/projects/${acmeProject._id}/tasks?dueFrom=2031-03-01&dueTo=2031-04-01`)).body;
    assert.deepEqual(march.map((x) => x._id), [t._id]);
    const noDue = (await call(B, 'GET', `/api/projects/${acmeProject._id}/tasks?noDue=true`)).body;
    assert.ok(noDue.length > 0 && noDue.every((x) => x.dueDate === null));
    await call(B, 'DELETE', `/api/tasks/${t._id}`);
  });

  console.log('Journal d\'activité');
  await test('les actions sont journalisées, du plus récent au plus ancien', async () => {
    const t = (await call(B, 'POST', `/api/projects/${acmeProject._id}/tasks`, { title: 'Journalisée' })).body;
    await call(B, 'PATCH', `/api/tasks/${t._id}/move`, { status: 'review' });
    const log = (await call(B, 'GET', `/api/projects/${acmeProject._id}/activity?limit=2`)).body;
    assert.equal(log.length, 2);
    assert.equal(log[0].type, 'task.moved');
    assert.deepEqual([log[0].data.from, log[0].data.to], ['todo', 'review']);
    assert.equal(log[1].type, 'task.created');
    assert.equal(log[0].userId, acmeBob.user.id);
    const older = (await call(B, 'GET', `/api/projects/${acmeProject._id}/activity?limit=5&before=${log[1].at}`)).body;
    assert.ok(older.every((e) => e.at < log[1].at));
    assert.equal((await call(G, 'GET', `/api/projects/${acmeProject._id}/activity`)).status, 404);
    await call(B, 'DELETE', `/api/tasks/${t._id}`);
  });

  console.log('Pièces jointes (GridFS)');
  await test('envoi, téléchargement identique, isolation, suppression en cascade', async () => {
    const t = (await call(B, 'POST', `/api/projects/${acmeProject._id}/tasks`, { title: 'Avec fichier' })).body;
    const content = 'Bonjour GridFS ✓\n'.repeat(1000);
    const up = await upload(B, t._id, content, 'note d’été.txt');
    assert.equal(up.status, 201);
    const meta = up.body.attachments[0];
    assert.equal(meta.name, 'note d’été.txt');
    assert.equal(meta.size, Buffer.byteLength(content));
    const dl = await download(B, meta._id);
    assert.equal(dl.status, 200);
    assert.equal(dl.text, content);
    assert.match(dl.headers.get('content-disposition'), /^attachment/);
    assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await download(G, meta._id)).status, 404, 'autre entreprise');
    assert.equal((await upload(G, t._id, 'x', 'x.txt')).status, 404, 'envoi sur la tâche d\'une autre entreprise');
    assert.equal((await upload(B, t._id, '', 'vide.txt')).status, 400);
    await call(B, 'DELETE', `/api/tasks/${t._id}`);
    assert.equal((await download(B, meta._id)).status, 404, 'fichier supprimé avec la tâche');
  });
  await test('suppression d\'une pièce jointe seule', async () => {
    const t = (await call(B, 'POST', `/api/projects/${acmeProject._id}/tasks`, { title: 'Avec fichier 2' })).body;
    const meta = (await upload(B, t._id, '{"a":1}', 'data.json', 'application/json')).body.attachments[0];
    assert.equal((await download(B, meta._id)).text, '{"a":1}', 'un fichier JSON n\'est pas interprété par le serveur');
    const after = (await call(B, 'DELETE', `/api/tasks/${t._id}/attachments/${meta._id}`)).body;
    assert.equal(after.attachments.length, 0);
    assert.equal((await download(B, meta._id)).status, 404);
    await call(B, 'DELETE', `/api/tasks/${t._id}`);
  });

  console.log('Tableau de bord');
  await test('statistiques cohérentes avec les tâches, et isolées', async () => {
    const tasks = (await call(A, 'GET', `/api/projects/${acmeProject._id}/tasks`)).body;
    const stats = (await call(A, 'GET', `/api/stats?projectId=${acmeProject._id}`)).body;
    assert.equal(stats.totals.total, tasks.length);
    assert.equal(stats.totals.done, tasks.filter((t) => t.status === 'done').length);
    assert.equal(stats.byStatus.reduce((n, s) => n + s.count, 0), tasks.length);
    assert.equal(stats.byAssignee.reduce((n, s) => n + s.total, 0), tasks.length);
    assert.ok(stats.byAssignee.filter((a) => a._id).every((a) => a.user && a.user.firstName));
    assert.ok(Array.isArray(stats.createdPerWeek) && Array.isArray(stats.completedPerWeek));
    assert.equal((await call(G, 'GET', `/api/stats?projectId=${acmeProject._id}`)).status, 404);
    const all = (await call(G, 'GET', '/api/stats')).body;
    assert.ok(all.byProject.every((p) => !p.name.includes('Acme')), 'aucun projet d\'Acme dans les stats de Globex');
  });

  console.log('Cascades');
  let extra, extraProject;
  await test('retirer un membre du projet le désassigne de ses tâches', async () => {
    const created = await call(A, 'POST', '/api/users', { email: 'carl@acme.test', password: 'motdepasse1', firstName: 'Carl', lastName: 'Acme' });
    assert.equal(created.status, 201);
    extra = created.body;
    const extraToken = (await call(null, 'POST', '/api/auth/login', { company: 'acme', email: 'carl@acme.test', password: 'motdepasse1' })).body.token;
    assert.equal((await call(extraToken, 'GET', '/api/projects')).status, 200);
    extra.token = extraToken;
    extraProject = (await call(A, 'POST', '/api/projects', { name: 'Cascade', memberIds: [extra._id] })).body;
    const t = (await call(A, 'POST', `/api/projects/${extraProject._id}/tasks`, { title: 'à Carl', assigneeId: extra._id })).body;
    await call(A, 'PUT', `/api/projects/${extraProject._id}/members`, { memberIds: [] });
    assert.equal((await call(A, 'GET', `/api/tasks/${t._id}`)).body.assigneeId, null);
    await call(A, 'PUT', `/api/projects/${extraProject._id}/members`, { memberIds: [extra._id] });
    await call(A, 'PATCH', `/api/tasks/${t._id}`, { assigneeId: extra._id });
    // Suppression de l'utilisateur : retiré des projets et désassigné.
    assert.equal((await call(A, 'DELETE', `/api/users/${extra._id}`)).status, 204);
    assert.equal((await call(extra.token, 'GET', '/api/projects')).status, 401, 'token d\'un utilisateur supprimé');
    assert.equal((await call(A, 'GET', `/api/tasks/${t._id}`)).body.assigneeId, null);
    assert.ok(!(await call(A, 'GET', `/api/projects/${extraProject._id}`)).body.memberIds.includes(extra._id));
  });
  await test('supprimer un projet supprime ses tâches', async () => {
    const t = (await call(A, 'POST', `/api/projects/${extraProject._id}/tasks`, { title: 'orpheline' })).body;
    assert.equal((await call(A, 'DELETE', `/api/projects/${extraProject._id}`)).status, 204);
    assert.equal((await call(A, 'GET', `/api/tasks/${t._id}`)).status, 404);
  });
  await test('suppression d\'une entreprise : confirmation requise puis cascade', async () => {
    const reg = (await call(null, 'POST', '/api/auth/register-company', { companyName: `Tmp ${Date.now()}`, email: 'x@y.fr', password: 'motdepasse1', firstName: 'X', lastName: 'Y' })).body;
    const T = reg.token;
    const p = (await call(T, 'POST', '/api/projects', { name: 'p' })).body;
    assert.equal((await call(T, 'DELETE', '/api/company', {})).status, 400);
    assert.equal((await call(T, 'DELETE', '/api/company', { confirm: reg.company.slug })).status, 204);
    assert.equal((await call(T, 'GET', `/api/projects/${p._id}`)).status, 401); // l'utilisateur n'existe plus
  });

  // Nettoyage de la tâche de test
  await call(B, 'DELETE', `/api/tasks/${task._id}`);

  console.log(`\n${passed} tests réussis${process.exitCode ? ', des échecs ont eu lieu' : ''}`);
})();
