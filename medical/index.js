// 🩺 medical (Medical log) module screens.
// MED-1: People & visit types card: add, rename, remove (with Undo).
// Both lists live in the Medical log settings as [{ id, name }]. The starter lists ("Me" and 6 types)
// are saved once, the first time this screen opens; a flag stops them coming back if removed later.
// Visits keep the person's / type's id (not the name), so renaming changes every visit at once.
// A person or type that still has visits can't be removed, and at least one of each is always kept.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { list as listAll, getSettings, saveSettings } from '../core/storage.js';

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

    return el('div', { className: 'stack' }, [
      el('h3', { className: 'list-group__title' }, [el('span', { text: `${emoji} ${title}` })]),
      addForm,
      box,
    ]);
  }

  const people = section({
    key: 'people', title: 'People', emoji: '👪', singular: 'person', example: 'Mom',
    countsOf: () => counts.byPerson,
  });
  const types = section({
    key: 'types', title: 'Visit types', emoji: '🏥', singular: 'visit type', example: 'Eye check-up',
    countsOf: () => counts.byType,
  });

  root.append(el('div', { className: 'mod-medical stack' }, [
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
