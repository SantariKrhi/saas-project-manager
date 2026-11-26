// Fenêtre d'édition d'une tâche : champs principaux, puis trois sections indépendantes
// (checklist, pièces jointes, commentaires) qui enregistrent chacune leurs changements immédiatement.
import { h, field, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { api, request, fetchAttachment } from '../api.js';
import { PRIO, fullName, formatSize, relTime } from '../format.js';
import { toast, safely, withBusy, avatar } from '../ui.js';
import { openModal } from './modal.js';
import { tagInput } from './tag-input.js';

const MAX_UPLOAD = 10 * 1024 * 1024;
const MAX_PREVIEW = 3 * 1024 * 1024;

// ctx : { project, members, usersById, reload } — reload() rafraîchit la page sous la fenêtre.
export function openTaskModal(task, ctx) {
  const { project, members, reload } = ctx;
  const title = h('input', { value: task.title, required: true });
  const desc = h('textarea', { rows: 4, value: task.description || '', placeholder: 'Ajouter une description…' });
  const status = h('select', {}, project.columns.map((c) => h('option', { value: c, selected: c === task.status }, c)));
  const assignee = h('select', {}, h('option', { value: '' }, 'Non assignée'),
    members.map((u) => h('option', { value: u._id, selected: u._id === task.assigneeId }, fullName(u))));
  const prio = h('select', {}, Object.entries(PRIO).map(([v, l]) => h('option', { value: v, selected: v === task.priority }, l)));
  const due = h('input', { type: 'date', value: task.dueDate ? task.dueDate.slice(0, 10) : '' });
  const labels = tagInput(task.labels || [], 'Ajouter une étiquette puis Entrée');

  const checklist = checklistSection(task, ctx);
  const attachments = attachmentsSection(task, ctx);
  const comments = commentsSection(task, ctx);

  let close = () => {};
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => withBusy(saveBtn, async () => {
    await api('PATCH', `/tasks/${task._id}`, {
      title: title.value, description: desc.value, assigneeId: assignee.value || null, priority: prio.value,
      dueDate: due.value || null, labels: labels.values(),
    });
    // Le changement de colonne passe par /move, qui place aussi la carte en bas de sa nouvelle colonne.
    if (status.value !== task.status) await api('PATCH', `/tasks/${task._id}/move`, { status: status.value });
    close();
    toast('Tâche enregistrée');
    await reload();
  }) }, 'Enregistrer');
  const deleteBtn = h('button', { class: 'btn danger', type: 'button', 'aria-label': 'Supprimer la tâche', onclick: () => withBusy(deleteBtn, async () => {
    if (!confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
    await api('DELETE', `/tasks/${task._id}`);
    close();
    toast('Tâche supprimée');
    await reload();
  }) }, icon('trash'), h('span', { class: 'btn-label' }, 'Supprimer'));

  close = openModal({
    title: 'Modifier la tâche',
    sub: `${project.name} · ${task.status}`,
    body: [
      field('Titre', title),
      field('Description', desc),
      h('div', { class: 'two' }, field('Statut', status), field('Assignée à', assignee), field('Priorité', prio), field('Échéance', due)),
      field('Étiquettes', labels.el, null, labels.input),
      checklist,
      attachments.el,
      comments,
    ],
    onClose: attachments.dispose,
    foot: [deleteBtn, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Annuler'), saveBtn],
  });
}

// --- Checklist : chaque action renvoie la tâche à jour, dont on redessine la liste.
function checklistSection(task, { reload }) {
  const box = h('div', { class: 'section' });
  const apply = async (updated) => { task.checklist = updated.checklist; draw(); await reload(); };

  const itemInput = h('input', { placeholder: 'Nouvel élément…', 'aria-label': 'Nouvel élément de checklist' });
  const itemForm = h('form', {
    class: 'inline-form',
    onsubmit: (e) => {
      e.preventDefault();
      const text = itemInput.value.trim();
      if (!text) return;
      safely(async () => {
        await apply(await api('POST', `/tasks/${task._id}/checklist`, { text }));
        itemInput.value = '';
        itemInput.focus();
      });
    },
  }, itemInput, h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Ajouter'));

  function draw() {
    const list = task.checklist || [];
    const done = list.filter((i) => i.done).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    setChildren(box,
      h('div', { class: 'section-head' }, h('h3', {}, 'Checklist'), list.length ? h('span', { class: 'muted' }, `${done}/${list.length} · ${pct} %`) : null),
      list.length ? h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Avancement de la checklist', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
        h('span', { style: `width:${pct}%` })) : null,
      h('ul', { class: 'checklist' }, list.map((item) => h('li', { class: item.done ? 'done' : '' },
        h('label', {},
          h('input', { type: 'checkbox', checked: item.done,
            onchange: (e) => safely(async () => apply(await api('PATCH', `/tasks/${task._id}/checklist/${item._id}`, { done: e.target.checked }))) }),
          h('span', {}, item.text)),
        h('button', { class: 'btn ghost sm danger-ghost', type: 'button', title: 'Retirer', 'aria-label': `Retirer « ${item.text} »`,
          onclick: () => safely(async () => apply(await api('DELETE', `/tasks/${task._id}/checklist/${item._id}`))) }, icon('x'))))),
      itemForm);
  }
  draw();
  return box;
}

async function downloadAttachment(a) {
  const url = URL.createObjectURL(await fetchAttachment(a._id));
  const link = h('a', { href: url, download: a.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- Pièces jointes (stockées dans GridFS). dispose() libère les aperçus d'images à la fermeture.
function attachmentsSection(task, { usersById, reload }) {
  const box = h('div', { class: 'section' });
  const previews = new Map();
  const apply = async (updated) => { task.attachments = updated.attachments; draw(); await reload(); };
  const uploadState = h('div', { class: 'hint', 'aria-live': 'polite' });
  const fileInput = h('input', { type: 'file', multiple: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true',
    onchange: (e) => { uploadFiles([...e.target.files]); e.target.value = ''; } });

  async function uploadFiles(files) {
    for (const f of files) {
      if (f.size > MAX_UPLOAD) { toast(`${f.name} : 10 Mo maximum`, 'error'); continue; }
      uploadState.textContent = `Envoi de ${f.name}…`;
      await safely(async () => {
        const res = await request('POST', `/tasks/${task._id}/attachments`, {
          body: f,
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name), 'X-File-Type': f.type || 'application/octet-stream' },
        });
        await apply(await res.json());
        toast(`${f.name} ajouté`);
      });
    }
    uploadState.textContent = '';
  }

  const dropzone = h('div', {
    class: 'dropzone',
    ondragover: (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dropzone.classList.add('over'); } },
    ondragleave: (e) => { if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('over'); },
    ondrop: (e) => { e.preventDefault(); dropzone.classList.remove('over'); uploadFiles([...e.dataTransfer.files]); },
  }, icon('paperclip'), h('span', {}, 'Glissez des fichiers ici ou'),
  h('button', { class: 'link-btn', type: 'button', onclick: () => fileInput.click() }, 'choisissez-les'),
  h('span', { class: 'muted' }, '· 10 Mo max.'), fileInput);

  // Aperçu des images (téléchargées avec le jeton, affichées via une URL locale).
  async function preview(a, holder) {
    try {
      if (!previews.has(a._id)) previews.set(a._id, URL.createObjectURL(await fetchAttachment(a._id)));
      holder.replaceChildren(h('img', { src: previews.get(a._id), alt: '' }));
    } catch { /* aperçu facultatif */ }
  }

  function draw() {
    const list = task.attachments || [];
    setChildren(box,
      h('div', { class: 'section-head' }, h('h3', {}, list.length ? `Pièces jointes (${list.length})` : 'Pièces jointes')),
      list.length ? h('ul', { class: 'files' }, list.map((a) => {
        const isImage = a.contentType.startsWith('image/');
        const thumb = h('span', { class: 'file-icon' }, icon(isImage ? 'image' : 'file'));
        if (isImage && a.size <= MAX_PREVIEW) preview(a, thumb);
        return h('li', {}, thumb,
          h('div', { class: 'file-info' },
            h('button', { class: 'link-btn file-name', type: 'button', title: `Télécharger ${a.name}`, onclick: () => safely(() => downloadAttachment(a)) }, a.name),
            h('div', { class: 'hint' }, `${formatSize(a.size)} · ${fullName(usersById.get(a.uploadedBy))} · ${relTime(a.at)}`)),
          h('button', { class: 'btn ghost sm', type: 'button', title: 'Télécharger', 'aria-label': `Télécharger ${a.name}`,
            onclick: () => safely(() => downloadAttachment(a)) }, icon('download')),
          h('button', { class: 'btn ghost sm danger-ghost', type: 'button', title: 'Supprimer', 'aria-label': `Supprimer ${a.name}`,
            onclick: () => safely(async () => {
              if (!confirm(`Supprimer « ${a.name} » ?`)) return;
              await apply(await api('DELETE', `/tasks/${task._id}/attachments/${a._id}`));
            }) }, icon('trash')));
      })) : null,
      dropzone, uploadState);
  }
  draw();
  return { el: box, dispose: () => previews.forEach((url) => URL.revokeObjectURL(url)) };
}

// --- Commentaires
function commentsSection(task, { usersById, reload }) {
  const heading = h('h3', {});
  const list = h('div', {});
  const draw = () => {
    heading.textContent = `Commentaires (${task.comments.length})`;
    list.replaceChildren(...(task.comments.length
      ? task.comments.map((c) => {
        const u = usersById.get(c.userId);
        return h('div', { class: 'comment' }, avatar(u),
          h('div', { class: 'comment-body' },
            h('div', { class: 'comment-meta' }, h('b', {}, fullName(u)),
              ` · ${new Date(c.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`),
            h('div', { class: 'comment-text' }, c.text)));
      })
      : [h('p', { class: 'muted empty-comments' }, 'Aucun commentaire pour le moment.')]));
  };

  const input = h('input', { placeholder: 'Écrire un commentaire…', 'aria-label': 'Nouveau commentaire' });
  const sendBtn = h('button', { class: 'btn', type: 'submit' }, 'Envoyer');
  const form = h('form', {
    class: 'comment-form',
    onsubmit: (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      withBusy(sendBtn, async () => {
        const updated = await api('POST', `/tasks/${task._id}/comments`, { text: input.value });
        input.value = '';
        task.comments = updated.comments;
        draw();
        await reload();
      });
    },
  }, input, sendBtn);

  draw();
  return h('div', { class: 'comments' }, heading, list, form);
}
