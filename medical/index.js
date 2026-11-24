// 🩺 medical (Medical log) module screens.
// MED-1: People & visit types card: add, rename, remove (with Undo).
// Both lists live in the Medical log settings as [{ id, name }]. The starter lists ("Me" and 6 types)
// are saved once, the first time this screen opens; a flag stops them coming back if removed later.
// Visits keep the person's / type's id (not the name), so renaming changes every visit at once.
// A person or type that still has visits can't be removed, and at least one of each is always kept.
// MED-2: Add a visit (date, person, type, place with suggestions, cost, note), a simple list of visits
// (newest first) where a tap opens it for editing, and delete with Undo. Visits save personId / typeId.
// MED-3: Photos & PDFs on a visit. Photos are shrunk on the phone; files are saved in the storage "files"
// drawer and the visit keeps only a short list `attachments: [{ id, name, type, size, url }]`.
// sync.js uploads them to Drive and fills in `url` (the Sheet shows only the links).
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import {
  list as listAll, add, update, remove, restore, getSettings, saveSettings,
  saveFile, getFile, listFiles, removeFiles,
} from '../core/storage.js';
import { today, formatDate } from '../core/dates.js';
import { formatMoney, parseMoney } from '../core/format.js';

const DEFAULT_PEOPLE = ['Me'];
const DEFAULT_TYPES = [
  'Blood test', 'Dentist', 'Paediatrician', 'General physician', 'General check-up', 'Other',
];
const MAX_NAME = 30;

// Random id for a person or type. crypto.randomUUID only works on https/localhost.
function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const tidy = (text) => text.trim().replace(/\s+/g, ' ');

// Loads people and types, saving the starter lists the first time.
async function loadLists() {
  const settings = await getSettings('medical', { people: [], types: [], listsSeeded: false });
  if (settings.listsSeeded) return { people: settings.people, types: settings.types };
  const people = settings.people.length ? settings.people : DEFAULT_PEOPLE.map((name) => ({ id: newId(), name }));
  const types = settings.types.length ? settings.types : DEFAULT_TYPES.map((name) => ({ id: newId(), name }));
  await saveSettings('medical', { people, types, listsSeeded: true });
  return { people, types };
}

// How many visits use each person and each type.
async function countVisits() {
  const byPerson = new Map();
  const byType = new Map();
  for (const v of await listAll('visits')) {
    byPerson.set(v.personId, (byPerson.get(v.personId) || 0) + 1);
    byType.set(v.typeId, (byType.get(v.typeId) || 0) + 1);
  }
  return { byPerson, byType };
}

const visitsText = (n) => (n === 1 ? '1 visit' : `${n} visits`);

const MAX_PAISE = 100000000 * 100; // ₹10 crore: anything bigger is surely a typo.
const MAX_PLACE = 80;

// Reads the optional cost box. Gives back { paise } (null when blank) or { error }.
function checkCost(text) {
  if (!String(text).trim()) return { paise: null };
  const paise = parseMoney(text);
  if (paise === null) return { error: 'Type an amount like 500 or 99.50, or leave it blank.' };
  if (paise > MAX_PAISE) return { error: 'That looks too big. Please check the amount.' };
  return { paise };
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Please pick a date.';
  if (date > today()) return "The date can't be in the future.";
  return '';
}

// Paise -> what goes back into the cost box: 50050 -> "500.5".
const costText = (paise) => (paise == null ? '' : String(paise / 100));

// Places used before, most recent first, without repeats (ignoring capitals).
function placesFrom(visits) {
  const seen = new Set();
  const places = [];
  const newest = [...visits].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  for (const v of newest) {
    const p = (v.place || '').trim();
    if (p && !seen.has(p.toLowerCase())) { seen.add(p.toLowerCase()); places.push(p); }
  }
  return places;
}

// ---- Attachments (MED-3) ----
const MAX_FILES = 10;                  // per visit
const MAX_PDF = 15 * 1024 * 1024;      // the most Google will take
const PHOTO_MAX_SIDE = 1600;           // px: still sharp enough to read a report
const KEEP_UNUSED_MS = 10 * 60 * 1000; // unused files (e.g. from a deleted visit) are kept this long for Undo

const isPdf = (type) => type === 'application/pdf';

function sizeText(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "IMG 2031.HEIC" -> "IMG 2031.jpg" (short enough for Drive).
function cleanName(name, ext) {
  const base = String(name || '').replace(/\.[^.]*$/, '').trim().slice(0, 60);
  return `${base || 'file'}.${ext}`;
}

// Makes a photo smaller (longest side 1600 px, JPEG) so it saves and uploads quickly.
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error("couldn't read this photo. Try a JPG or PNG."); }
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // JPEG has no see-through parts: fill them with white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) throw new Error("couldn't shrink this photo.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Saves one picked file on the phone. Gives back the saved file row, or throws with a short reason.
async function keepFile(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF) throw new Error('too big (15 MB at most).');
    return saveFile({ name: cleanName(file.name, 'pdf'), type: 'application/pdf', data: await file.arrayBuffer() });
  }
  if (!file.type || file.type.startsWith('image/')) {
    const blob = await shrinkPhoto(file);
    return saveFile({ name: cleanName(file.name, 'jpg'), type: 'image/jpeg', data: await blob.arrayBuffer() });
  }
  throw new Error('only photos and PDFs can be added.');
}

// Shows one attachment in a sheet: the photo itself, plus buttons to open it and to open it in Drive.
async function openAttachment(att, fileRow) {
  const file = fileRow ? await getFile(att.id) : null;
  const blobUrl = file ? URL.createObjectURL(new Blob([file.data], { type: file.type })) : null;
  const link = (label, href) => el('a', {
    className: 'btn btn--secondary btn--block', href, target: '_blank', rel: 'noopener', text: label,
  });
  const dialog = el('dialog', { className: 'sheet', 'aria-label': att.name }, [
    el('div', { className: 'sheet__head' }, [
      el('h2', { className: 'sheet__title attach-title', text: att.name }),
      button({ icon: 'close', variant: 'ghost', ariaLabel: 'Close', onClick: () => dialog.close() }),
    ]),
    el('div', { className: 'stack' }, [
      blobUrl && !isPdf(att.type) ? el('img', { className: 'attach-view', src: blobUrl, alt: att.name }) : null,
      blobUrl ? link(isPdf(att.type) ? '📄 Open PDF' : '🔍 Open full size', blobUrl) : null,
      att.url ? link('☁️ Open in Google Drive', att.url) : null,
      !blobUrl && !att.url ? el('p', { className: 'muted', text: "This file isn't on this phone any more." }) : null,
    ]),
  ]);
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('close', () => {
    window.removeEventListener('hashchange', close);
    dialog.remove();
    // Kept a little longer so a PDF opened in another tab has time to load.
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  });
  window.addEventListener('hashchange', close);
  document.body.append(dialog);
  dialog.showModal();
}

// The "Photos & PDFs" part of the visit form. `fileRows` is the screen's Map of saved files (id -> row).
function attachField(initial, fileRows) {
  let atts = (initial || []).map((a) => ({ ...a }));
  const listBox = el('div');
  const errorEl = el('div', { className: 'field__error', hidden: true });
  const setError = (text) => { errorEl.textContent = text; errorEl.hidden = !text; };
  const picker = el('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, hidden: true });
  const addBtn = button({ label: '📎 Add photo or PDF', variant: 'secondary', block: true, onClick: () => picker.click() });
  const addLabel = addBtn.querySelector('span:last-child');

  function status(att) {
    const row = fileRows.get(att.id);
    if (att.url) return '☁️ In Google Drive';
    if (!row) return '❓ Not on this phone';
    if (row.failed) return "⚠️ Google couldn't take this file";
    return '⏳ Uploads when synced';
  }

  function thumb(att) {
    const box = el('span', { className: 'attach-thumb', 'aria-hidden': 'true', text: isPdf(att.type) ? '📄' : '🖼️' });
    if (!isPdf(att.type) && fileRows.has(att.id)) {
      getFile(att.id).then((file) => {
        if (!file) return;
        const src = URL.createObjectURL(new Blob([file.data], { type: file.type }));
        const img = el('img', { src, alt: '' });
        img.addEventListener('load', () => URL.revokeObjectURL(src));
        box.replaceChildren(img);
      });
    }
    return box;
  }

  function draw() {
    if (!atts.length) { listBox.replaceChildren(); return; }
    listBox.replaceChildren(list(atts.map((att) => {
      const row = listItem({
        title: att.name,
        subtitle: `${isPdf(att.type) ? 'PDF' : 'Photo'} · ${sizeText(att.size)} · ${status(att)}`,
        onClick: () => openAttachment(att, fileRows.get(att.id)),
        actions: [button({ icon: 'trash', variant: 'ghost', ariaLabel: `Remove ${att.name}`, onClick: () => removeAtt(att) })],
      });
      row.prepend(thumb(att));
      return row;
    })));
  }

  function removeAtt(att) {
    const index = atts.findIndex((a) => a.id === att.id);
    if (index < 0) return;
    atts.splice(index, 1);
    draw();
    toast({
      message: `Removed ${att.name}`,
      actionLabel: 'Undo',
      onAction: () => {
        if (atts.some((a) => a.id === att.id)) return;
        atts.splice(Math.min(index, atts.length), 0, att);
        draw();
      },
    });
  }

  picker.addEventListener('change', async () => {
    const picked = [...picker.files];
    picker.value = '';
    if (!picked.length) return;
    setError('');
    const room = MAX_FILES - atts.length;
    if (room <= 0) { setError(`A visit can have up to ${MAX_FILES} files.`); return; }
    addBtn.disabled = true;
    addLabel.textContent = 'Adding…';
    const problems = [];
    for (const file of picked.slice(0, room)) {
      try {
        const saved = await keepFile(file);
        const { data, ...rowInfo } = saved;
        fileRows.set(saved.id, rowInfo);
        atts.push({ id: saved.id, name: saved.name, type: saved.type, size: saved.size, url: '' });
      } catch (err) {
        problems.push(`${file.name}: ${err.message || "couldn't be added."}`);
      }
    }
    if (picked.length > room) problems.push(`A visit can have up to ${MAX_FILES} files, so some were left out.`);
    addBtn.disabled = false;
    addLabel.textContent = '📎 Add photo or PDF';
    setError(problems.join(' '));
    draw();
  });

  draw();
  const wrapper = el('div', { className: 'field' }, [
    el('div', { className: 'field__label', text: 'Photos & PDFs (optional)' }),
    listBox, addBtn, picker, errorEl,
  ]);
  wrapper.value = () => atts.map((a) => ({ ...a }));
  wrapper.clear = () => { atts = []; setError(''); draw(); };
  return wrapper;
}

let suggestCount = 0;

// The date, person, type, place, cost, note and attachment boxes. Used to add and to edit a visit.
function visitFields(lists, places, values = {}, fileRows = new Map()) {
  const option = (x) => ({ value: x.id, label: x.name });
  const date = input({ label: 'Date', name: 'date', type: 'date', value: values.date ?? today(), max: today() });
  const person = input({
    label: 'Who', name: 'personId', type: 'select', options: lists.people.map(option),
    value: values.personId ?? lists.people[0]?.id ?? '',
  });
  const type = input({
    label: 'Visit type', name: 'typeId', type: 'select', options: lists.types.map(option),
    value: values.typeId ?? lists.types[0]?.id ?? '',
  });
  const place = input({
    label: 'Doctor / clinic / lab (optional)', name: 'place', type: 'text',
    value: values.place ?? '', placeholder: 'e.g. Dr Rao, City Clinic',
  });
  // Names used before pop up while typing (the phone's own suggestion list).
  const suggestId = `med-places-${++suggestCount}`;
  place.input.setAttribute('list', suggestId);
  place.input.setAttribute('autocomplete', 'off');
  place.append(el('datalist', { id: suggestId }, places.map((p) => el('option', { value: p }))));
  const cost = input({
    label: 'Cost (₹, optional)', name: 'cost', type: 'text', inputmode: 'decimal',
    value: costText(values.costPaise), placeholder: 'e.g. 500',
  });
  const note = input({
    label: 'Note (optional)', name: 'note', type: 'textarea', value: values.note ?? '',
    placeholder: 'Reason, what the doctor said, medicines…',
  });
  for (const f of [date, place, cost]) f.input.addEventListener('input', () => f.setError(''));
  const attach = attachField(values.attachments, fileRows);

  return {
    date, person, type, place, cost, note, attach,
    elements: [date, el('div', { className: 'btn-row' }, [person, type]), place, cost, note, attach],
    // Gives back the visit to save, or null after showing what's wrong.
    read() {
      const dateError = checkDate(date.input.value);
      date.setError(dateError);
      const placeText = tidy(place.input.value);
      const placeError = placeText.length > MAX_PLACE ? `Keep it to ${MAX_PLACE} letters or fewer.` : '';
      place.setError(placeError);
      const { paise, error } = checkCost(cost.input.value);
      cost.setError(error || '');
      const personError = person.input.value ? '' : 'Add a person first (see below).';
      person.setError(personError);
      const typeError = type.input.value ? '' : 'Add a visit type first (see below).';
      type.setError(typeError);
      if (dateError || placeError || error || personError || typeError) return null;
      return {
        date: date.input.value,
        personId: person.input.value,
        typeId: type.input.value,
        place: placeText,
        costPaise: paise,
        note: note.input.value.trim(),
        attachments: attach.value(),
      };
    },
  };
}

export async function render(root) {
  let lists = await loadLists();
  let counts = await countVisits();

  // One section (people or types) of the card. Each has its own add form, list and edit row.
  function section({ key, title, emoji, singular, example, countsOf }) {
    const box = el('div', { className: 'stack' });
    let editingId = null;

    // Checks a typed name. Gives back the tidy name, or null after showing what's wrong.
    function readName(field, ownId) {
      const text = tidy(field.input.value);
      let error = '';
      if (!text) error = `Type a name, e.g. ${example}`;
      else if (text.length > MAX_NAME) error = `Keep the name to ${MAX_NAME} letters or fewer.`;
      else if (lists[key].some((x) => x.id !== ownId && x.name.toLowerCase() === text.toLowerCase())) {
        error = `You already have a ${singular} with this name.`;
      }
      field.setError(error);
      return error ? null : text;
    }

    async function save(items) {
      const saved = await saveSettings('medical', { [key]: items });
      lists = { people: saved.people, types: saved.types };
      listsChanged(); // MED-2: update the visit form choices and the names in the visit list
    }

    const addField = input({ label: `New ${singular}`, name: `${key}Name`, type: 'text', placeholder: `e.g. ${example}` });
    addField.input.addEventListener('input', () => addField.setError(''));
    const addForm = el('form', { className: 'stack', novalidate: true }, [
      addField,
      button({ label: `Add ${singular}`, icon: 'plus', variant: 'primary', type: 'submit', block: true }),
    ]);
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = readName(addField);
      if (!name) return;
      await save([...lists[key], { id: newId(), name }]);
      addField.input.value = '';
      toast({ message: `Added ${name} ✨` });
      refresh();
    });

    function editRow(item) {
      const field = input({ label: 'Name', name: `${key}Rename`, type: 'text', value: item.name });
      field.input.addEventListener('input', () => field.setError(''));
      const form = el('form', { className: 'stack', novalidate: true }, [
        field,
        el('div', { className: 'btn-row' }, [
          button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
          button({ label: 'Save', variant: 'primary', type: 'submit' }),
        ]),
      ]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = readName(field, item.id);
        if (!name) return;
        await save(lists[key].map((x) => (x.id === item.id ? { ...x, name } : x)));
        editingId = null;
        refresh();
      });
      queueMicrotask(() => field.input.focus());
      return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
    }

    async function removeItem(item) {
      counts = await countVisits();
      const used = countsOf().get(item.id) || 0;
      if (used) {
        toast({ message: `${item.name} still has ${visitsText(used)}, so it can't be removed. You can rename it instead.` });
        refresh();
        return;
      }
      if (lists[key].length <= 1) {
        toast({ message: `Keep at least one ${singular}. You can rename this one instead.` });
        return;
      }
      const before = lists[key];
      const index = before.findIndex((x) => x.id === item.id);
      if (editingId === item.id) editingId = null;
      await save(before.filter((x) => x.id !== item.id));
      refresh();
      toast({
        message: `Removed ${item.name}`,
        actionLabel: 'Undo',
        onAction: async () => {
          const items = [...lists[key]];
          if (items.some((x) => x.id === item.id)) return;
          items.splice(Math.min(index, items.length), 0, item);
          await save(items);
          refresh();
        },
      });
    }

    function row(item) {
      if (item.id === editingId) return editRow(item);
      const used = countsOf().get(item.id) || 0;
      const open = () => { editingId = item.id; refresh(); };
      return listItem({
        title: item.name,
        subtitle: used ? visitsText(used) : 'No visits yet',
        onClick: open,
        actions: [
          button({ icon: 'edit', variant: 'ghost', ariaLabel: `Rename ${item.name}`, onClick: open }),
          button({ icon: 'trash', variant: 'ghost', ariaLabel: `Remove ${item.name}`, onClick: () => removeItem(item) }),
        ],
      });
    }

    function refresh() {
      box.replaceChildren(lists[key].length
        ? list(lists[key].map(row))
        : emptyState({ emoji, title: `No ${title.toLowerCase()} yet`, text: 'Add one above.' }));
    }
    refresh();

    const wrapper = el('div', { className: 'stack' }, [
      el('h3', { className: 'list-group__title' }, [el('span', { text: `${emoji} ${title}` })]),
      addForm,
      box,
    ]);
    wrapper.refresh = refresh;
    return wrapper;
  }

  // ---- Visits (MED-2) ----
  let visits = await listAll('visits');
  let editingVisitId = null;

  // Saved photos/PDFs (MED-3). Files no visit uses any more (removed, or from a deleted visit) are
  // tidied away here once they're older than 10 minutes, so Undo still works meanwhile.
  const fileRows = new Map((await listFiles()).map((f) => [f.id, f]));
  const usedFiles = new Set(visits.flatMap((v) => (v.attachments || []).map((a) => a.id)));
  const unused = [...fileRows.values()]
    .filter((f) => !usedFiles.has(f.id) && Date.now() - Date.parse(f.createdAt) > KEEP_UNUSED_MS)
    .map((f) => f.id);
  await removeFiles(unused);
  for (const id of unused) fileRows.delete(id);
  const nameOf = (items, id, fallback) => items.find((x) => x.id === id)?.name ?? fallback;
  const personName = (id) => nameOf(lists.people, id, 'Unknown person');
  const typeName = (id) => nameOf(lists.types, id, 'Unknown type');

  const formBox = el('div', { className: 'stack' });
  const visitBox = el('div', { className: 'stack' });
  let fields;

  // Builds the add form. Keeps what was already typed when the people / type lists change.
  function buildForm() {
    const kept = fields ? {
      date: fields.date.input.value, personId: fields.person.input.value, typeId: fields.type.input.value,
      place: fields.place.input.value, note: fields.note.input.value, attachments: fields.attach.value(),
    } : {};
    const keptCost = fields?.cost.input.value ?? '';
    if (kept.personId && !lists.people.some((x) => x.id === kept.personId)) delete kept.personId;
    if (kept.typeId && !lists.types.some((x) => x.id === kept.typeId)) delete kept.typeId;
    fields = visitFields(lists, placesFrom(visits), kept, fileRows);
    fields.cost.input.value = keptCost;
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...fields.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => showAddForm(false) }),
        button({ label: 'Save visit', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const visit = fields.read();
      if (!visit) return;
      await add('visits', visit);
      fields.place.input.value = '';
      fields.cost.input.value = '';
      fields.note.input.value = '';
      fields.attach.clear();
      toast({ message: `Saved ${typeName(visit.typeId)} · ${personName(visit.personId)} ✨` });
      showAddForm(false); // MED-4: the form tucks away again after saving
      await visitsChanged();
    });
    formBox.replaceChildren(form);
  }

  function visitEditRow(visit) {
    const f = visitFields(lists, placesFrom(visits), visit, fileRows);
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      ...f.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingVisitId = null; refreshVisits(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
      button({ label: 'Delete visit', icon: 'trash', variant: 'danger', block: true, onClick: () => deleteVisit(visit) }),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = f.read();
      if (!changes) return;
      await update('visits', visit.id, changes);
      editingVisitId = null;
      toast({ message: 'Visit updated ✨' });
      await visitsChanged();
    });
    queueMicrotask(() => f.date.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
  }

  function visitRow(visit) {
    if (visit.id === editingVisitId) return visitEditRow(visit);
    const title = `${typeName(visit.typeId)} · ${personName(visit.personId)}`;
    const files = visit.attachments?.length || 0;
    const details = [formatDate(visit.date), visit.place, visit.note, files ? `📎 ${files}` : '']
      .filter(Boolean).join(' · ');
    return listItem({
      title,
      subtitle: details,
      meta: visit.costPaise == null ? '' : formatMoney(visit.costPaise),
      onClick: () => { editingVisitId = visit.id; refreshVisits(); },
      actions: [
        button({
          icon: 'trash', variant: 'ghost',
          ariaLabel: `Delete ${title} on ${formatDate(visit.date)}`,
          onClick: () => deleteVisit(visit),
        }),
      ],
    });
  }

  // ---- Log screen (MED-4): add button, filters and search ----
  const filters = { personId: '', typeId: '', year: '', search: '' };
  const filterSelects = el('div', { className: 'stack' });
  const filterNote = el('p', { className: 'progress-note' });
  const searchField = input({
    label: 'Search', name: 'visitSearch', type: 'search', placeholder: 'Doctor, clinic or words in a note',
  });
  searchField.input.setAttribute('autocomplete', 'off');
  searchField.input.addEventListener('input', () => {
    filters.search = searchField.input.value;
    refreshVisits();
  });

  // Person, type and year choices. Rebuilt when names change or a new year appears.
  function buildFilters() {
    const option = (x) => ({ value: x.id, label: x.name });
    if (!lists.people.some((x) => x.id === filters.personId)) filters.personId = '';
    if (!lists.types.some((x) => x.id === filters.typeId)) filters.typeId = '';
    const years = [...new Set(visits.map((v) => v.date.slice(0, 4)))].sort().reverse();
    if (!years.includes(filters.year)) filters.year = '';
    const choice = (label, key, options) => {
      const f = input({ label, name: `filter-${key}`, type: 'select', options, value: filters[key] });
      f.input.addEventListener('change', () => { filters[key] = f.input.value; refreshVisits(); });
      return f;
    };
    filterSelects.replaceChildren(
      el('div', { className: 'btn-row' }, [
        choice('Person', 'personId', [{ value: '', label: 'Everyone' }, ...lists.people.map(option)]),
        choice('Type', 'typeId', [{ value: '', label: 'All types' }, ...lists.types.map(option)]),
      ]),
      choice('Year', 'year', [{ value: '', label: 'All years' }, ...years.map((y) => ({ value: y, label: y }))]),
    );
  }

  function clearFilters() {
    Object.assign(filters, { personId: '', typeId: '', year: '', search: '' });
    searchField.input.value = '';
    buildFilters();
    refreshVisits();
  }

  function matches(visit) {
    if (filters.personId && visit.personId !== filters.personId) return false;
    if (filters.typeId && visit.typeId !== filters.typeId) return false;
    if (filters.year && !visit.date.startsWith(filters.year)) return false;
    const words = tidy(filters.search).toLowerCase();
    if (!words) return true;
    const text = `${visit.place || ''} ${visit.note || ''}`.toLowerCase();
    return words.split(' ').every((w) => text.includes(w));
  }

  function refreshVisits() {
    if (!visits.length) {
      filterNote.hidden = true;
      visitBox.replaceChildren(emptyState({
        emoji: '🩺', title: 'No visits yet', text: 'Tap "+ Add visit" above to add your first one.',
      }));
      return;
    }
    const filtering = filters.personId || filters.typeId || filters.year || tidy(filters.search);
    // Newest date first; on the same date, the latest added first.
    const shown = visits.filter(matches)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    filterNote.hidden = !filtering;
    filterNote.textContent = `Showing ${shown.length} of ${visitsText(visits.length)}`;
    if (!shown.length) {
      visitBox.replaceChildren(emptyState({
        emoji: '🔍', title: 'No visits match', text: 'Try other filters or search words.',
        action: button({ label: 'Clear filters', variant: 'secondary', onClick: clearFilters }),
      }));
      return;
    }
    visitBox.replaceChildren(list(shown.map(visitRow)));
  }

  // After a visit is added, changed or deleted: reload, update suggestions, list and visit counts.
  async function visitsChanged() {
    visits = await listAll('visits');
    counts = await countVisits();
    if (!formBox.isConnected && fields) return;
    buildForm();
    buildFilters();
    refreshVisits();
    people.refresh();
    types.refresh();
  }

  async function deleteVisit(visit) {
    const removed = await remove('visits', visit.id);
    if (editingVisitId === visit.id) editingVisitId = null;
    await visitsChanged();
    if (!removed) return;
    toast({
      message: `Deleted ${typeName(removed.typeId)} · ${formatDate(removed.date)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('visits', removed);
        await visitsChanged();
      },
    });
  }

  // People or types were added, renamed or removed (MED-1 card).
  function listsChanged() {
    buildForm();
    buildFilters();
    refreshVisits();
  }

  const people = section({
    key: 'people', title: 'People', emoji: '👪', singular: 'person', example: 'Mom',
    countsOf: () => counts.byPerson,
  });
  const types = section({
    key: 'types', title: 'Visit types', emoji: '🏥', singular: 'visit type', example: 'Eye check-up',
    countsOf: () => counts.byType,
  });

  buildForm();
  buildFilters();
  refreshVisits();

  // The big "+ Add visit" button opens the add form; Cancel or Save tucks it away again.
  const addCard = card({ title: 'Add a visit', module: 'medical', children: [formBox] });
  const addButton = button({
    label: 'Add visit', icon: 'plus', variant: 'primary', block: true, onClick: () => showAddForm(true),
  });
  function showAddForm(open) {
    addCard.hidden = !open;
    addButton.hidden = open;
    if (open) {
      addCard.scrollIntoView({ block: 'start', behavior: 'smooth' });
      queueMicrotask(() => fields.date.input.focus());
    }
  }
  showAddForm(false);

  root.append(el('div', { className: 'mod-medical stack' }, [
    addButton,
    addCard,
    card({ title: 'Visits', children: [el('div', { className: 'stack' }, [searchField, filterSelects, filterNote, visitBox])] }),
    card({
      title: 'People & visit types',
      module: 'medical',
      children: [el('div', { className: 'stack' }, [
        el('p', { className: 'progress-note', text: 'Who the visits are for, and the kinds of visit. Renaming one updates all its visits.' }),
        people,
        types,
      ])],
    }),
  ]));
}
