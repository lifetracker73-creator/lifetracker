// 🩺 medical (Medical log) module screens.
// MED-1: People & visit types card: add, rename, remove (with Undo).
// Both lists live in the Medical log settings as [{ id, name }]. The starter lists ("Me" and 6 types)
// are saved once, the first time this screen opens; a flag stops them coming back if removed later.
// Visits keep the person's / type's id (not the name), so renaming changes every visit at once.
// A person or type that still has visits can't be removed, and at least one of each is always kept.
// MED-2: Add a visit (date, person, type, place with suggestions, cost, note), a simple list of visits
// (newest first) where a tap opens it for editing, and delete with Undo. Visits save personId / typeId.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import {
  list as listAll, add, update, remove, restore, getSettings, saveSettings,
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

let suggestCount = 0;

// The date, person, type, place, cost and note boxes. Used to add and to edit a visit.
function visitFields(lists, places, values = {}) {
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

  return {
    date, person, type, place, cost, note,
    elements: [date, el('div', { className: 'btn-row' }, [person, type]), place, cost, note],
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
      place: fields.place.input.value, note: fields.note.input.value,
    } : {};
    const keptCost = fields?.cost.input.value ?? '';
    if (kept.personId && !lists.people.some((x) => x.id === kept.personId)) delete kept.personId;
    if (kept.typeId && !lists.types.some((x) => x.id === kept.typeId)) delete kept.typeId;
    fields = visitFields(lists, placesFrom(visits), kept);
    fields.cost.input.value = keptCost;
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...fields.elements,
      button({ label: 'Save visit', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const visit = fields.read();
      if (!visit) return;
      await add('visits', visit);
      fields.place.input.value = '';
      fields.cost.input.value = '';
      fields.note.input.value = '';
      toast({ message: `Saved ${typeName(visit.typeId)} · ${personName(visit.personId)} ✨` });
      await visitsChanged();
    });
    formBox.replaceChildren(form);
  }

  function visitEditRow(visit) {
    const f = visitFields(lists, placesFrom(visits), visit);
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
    const details = [formatDate(visit.date), visit.place, visit.note].filter(Boolean).join(' · ');
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

  function refreshVisits() {
    if (!visits.length) {
      visitBox.replaceChildren(emptyState({
        emoji: '🩺', title: 'No visits yet', text: 'Add your first visit above.',
      }));
      return;
    }
    // Newest date first; on the same date, the latest added first.
    const newest = [...visits].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    visitBox.replaceChildren(list(newest.map(visitRow)));
  }

  // After a visit is added, changed or deleted: reload, update suggestions, list and visit counts.
  async function visitsChanged() {
    visits = await listAll('visits');
    counts = await countVisits();
    if (!formBox.isConnected && fields) return;
    buildForm();
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
  refreshVisits();

  root.append(el('div', { className: 'mod-medical stack' }, [
    card({ title: 'Add a visit', module: 'medical', children: [formBox] }),
    card({ title: 'Visits', children: [visitBox] }),
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
