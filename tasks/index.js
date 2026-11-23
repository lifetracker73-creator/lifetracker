// ✅ tasks module screens.
// TSK-1: add, edit, complete, delete tasks; lists for Today (incl. overdue), Upcoming, No date, Done.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll } from '../core/storage.js';
import { today, addDays, formatDate, nowDateTime, formatDateTime } from '../core/dates.js';

const MAX_TITLE = 200;
const MAX_NOTES = 2000;

const VIEWS = [
  { key: 'today', label: 'Today', empty: ['🌤️', 'Nothing due today', 'Add a task above, or enjoy the free time ✨'] },
  { key: 'upcoming', label: 'Upcoming', empty: ['📅', 'Nothing coming up', 'Tasks with a later due date show here.'] },
  { key: 'nodate', label: 'No date', empty: ['🗂️', 'No undated tasks', 'Tasks without a due date show here.'] },
  { key: 'done', label: 'Done', empty: ['🎉', 'Nothing done yet', 'Tap the circle next to a task to tick it off.'] },
];

// Which list a task belongs in.
function viewOf(task, now) {
  if (task.done) return 'done';
  if (!task.dueDate) return 'nodate';
  return task.dueDate <= now ? 'today' : 'upcoming';
}

// Checks the typed fields. Gives back { values } or { errors }.
function readForm(fields) {
  const title = fields.title.input.value.trim();
  const notes = fields.notes.input.value.trim();
  const dueDate = fields.dueDate.input.value || null;
  const errors = {};
  if (!title) errors.title = 'Give the task a name, e.g. "Pay electricity bill"';
  else if (title.length > MAX_TITLE) errors.title = `Please keep the name under ${MAX_TITLE} letters.`;
  if (notes.length > MAX_NOTES) errors.notes = `Please keep notes under ${MAX_NOTES} letters.`;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) errors.dueDate = 'Pick a date, or leave it empty.';
  return Object.keys(errors).length ? { errors } : { values: { title, notes, dueDate } };
}

// Title, notes and due date boxes, used by the add form and the edit row.
function taskFields(task = {}) {
  const fields = {
    title: input({ label: 'Task', name: 'title', value: task.title || '', placeholder: 'e.g. Pay electricity bill' }),
    notes: input({ label: 'Notes (optional)', name: 'notes', type: 'textarea', value: task.notes || '' }),
    dueDate: input({ label: 'Due date (optional)', name: 'dueDate', type: 'date', value: task.dueDate || '' }),
  };
  Object.values(fields).forEach((f) => f.input.addEventListener('input', () => f.setError('')));
  return fields;
}

function showErrors(fields, errors) {
  for (const [name, f] of Object.entries(fields)) f.setError(errors[name] || '');
  const first = Object.keys(fields).find((name) => errors[name]);
  if (first) fields[first].input.focus();
}

// Quick pills that fill the due date box.
function datePills(dateField) {
  const set = (value) => { dateField.input.value = value; dateField.setError(''); };
  return el('div', { className: 'btn-row', role: 'group', 'aria-label': 'Quick due date' }, [
    button({ label: 'Today', variant: 'secondary', onClick: () => set(today()) }),
    button({ label: 'Tomorrow', variant: 'secondary', onClick: () => set(addDays(today(), 1)) }),
    button({ label: 'No date', variant: 'secondary', onClick: () => set('') }),
  ]);
}

export async function render(root) {
  let view = 'today';
  let editingId = null;
  const listBox = el('div');

  // Add form
  const addFields = taskFields();
  const addForm = el('form', { className: 'stack', novalidate: true }, [
    addFields.title,
    addFields.dueDate,
    datePills(addFields.dueDate),
    addFields.notes,
    button({ label: 'Add task', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { values, errors } = readForm(addFields);
    if (errors) { showErrors(addFields, errors); return; }
    const task = await add('tasks', { ...values, done: false, doneAt: null });
    addFields.title.input.value = '';
    addFields.notes.input.value = '';
    addFields.dueDate.input.value = '';
    view = viewOf(task, today()); // jump to the list it went into, so it's seen
    toast({ message: `Added "${task.title}" ✨` });
    await refresh();
  });

  // List switcher
  const viewButtons = VIEWS.map(({ key, label }) => {
    const btn = button({ label, variant: 'secondary', onClick: () => { view = key; editingId = null; refresh(); } });
    btn.dataset.view = key;
    return btn;
  });
  const countNote = el('p', { className: 'progress-note' });

  function showViewButtons(counts) {
    viewButtons.forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('btn--primary', on);
      b.classList.toggle('btn--secondary', !on);
      b.setAttribute('aria-pressed', String(on));
      const { label } = VIEWS.find((v) => v.key === b.dataset.view);
      const n = counts[b.dataset.view];
      b.setAttribute('aria-label', `${label}: ${n} ${n === 1 ? 'task' : 'tasks'}`);
    });
  }

  function subtitleOf(task, now) {
    if (task.done) return task.doneAt ? `Done ${formatDateTime(task.doneAt)}` : 'Done';
    if (!task.dueDate) return task.notes ? '📝 Has notes' : '';
    const overdue = task.dueDate < now;
    let when;
    if (overdue) when = `⚠️ Overdue · ${formatDate(task.dueDate)}`;
    else if (task.dueDate === now) when = `Due today · ${formatDate(task.dueDate)}`;
    else if (task.dueDate === addDays(now, 1)) when = `Due tomorrow · ${formatDate(task.dueDate)}`;
    else when = `Due ${formatDate(task.dueDate)}`;
    return task.notes ? `${when} · 📝` : when;
  }

  function taskRow(task, now) {
    const tick = button({
      icon: task.done ? 'check' : 'circle',
      variant: 'ghost',
      ariaLabel: task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`,
      onClick: () => toggleDone(task),
    });
    tick.setAttribute('aria-pressed', String(!!task.done));
    const row = listItem({
      title: task.title,
      subtitle: subtitleOf(task, now),
      onClick: () => { editingId = task.id; refresh(); },
      actions: [button({
        icon: 'trash',
        variant: 'ghost',
        ariaLabel: `Delete "${task.title}"`,
        onClick: () => deleteTask(task),
      })],
    });
    row.setAttribute('aria-label', `Edit "${task.title}"`);
    row.prepend(el('div', { className: 'list-item__actions' }, [tick]));
    row.classList.add('list-item--wrap');
    if (task.done) row.classList.add('list-item--done');
    return row;
  }

  // A row opened for editing: all boxes with Cancel and Save.
  function editRow(task) {
    const fields = taskFields(task);
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      fields.title,
      fields.dueDate,
      datePills(fields.dueDate),
      fields.notes,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { values, errors } = readForm(fields);
      if (errors) { showErrors(fields, errors); return; }
      const saved = await update('tasks', task.id, values);
      editingId = null;
      await refresh();
      if (saved && viewOf(saved, today()) !== view) {
        const moved = VIEWS.find((v) => v.key === viewOf(saved, today())).label;
        toast({ message: `Saved · moved to ${moved}` });
      }
    });
    queueMicrotask(() => fields.title.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
  }

  async function toggleDone(task) {
    const nowDone = !task.done;
    await update('tasks', task.id, { done: nowDone, doneAt: nowDone ? nowDateTime() : null });
    if (editingId === task.id) editingId = null;
    await refresh();
    toast({
      message: nowDone ? `Done! 🎉 "${task.title}"` : `"${task.title}" is back on your list`,
      actionLabel: 'Undo',
      onAction: async () => {
        await update('tasks', task.id, { done: task.done, doneAt: task.doneAt ?? null });
        if (listBox.isConnected) await refresh();
      },
    });
  }

  async function deleteTask(task) {
    const removed = await remove('tasks', task.id);
    if (editingId === task.id) editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted "${removed.title}"`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('tasks', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  async function refresh() {
    const now = today();
    const tasks = await listAll('tasks');
    const groups = { today: [], upcoming: [], nodate: [], done: [] };
    for (const task of tasks) groups[viewOf(task, now)].push(task);
    // Soonest due first; undated oldest first; done newest first.
    const byDue = (a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt);
    groups.today.sort(byDue);
    groups.upcoming.sort(byDue);
    groups.nodate.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    groups.done.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '') || b.updatedAt.localeCompare(a.updatedAt));

    const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
    showViewButtons(counts);
    const overdue = groups.today.filter((t) => t.dueDate < now).length;
    const shown = groups[view];
    if (view === 'today' && shown.length) {
      countNote.textContent = `${shown.length} to do${overdue ? ` · ${overdue} overdue` : ''}`;
    } else if (view === 'done') {
      countNote.textContent = shown.length ? `${shown.length} done · tap the tick to bring one back` : '';
    } else {
      countNote.textContent = shown.length ? `${shown.length} to do` : '';
    }
    countNote.hidden = !countNote.textContent;

    if (!shown.length) {
      const [emoji, title, text] = VIEWS.find((v) => v.key === view).empty;
      listBox.replaceChildren(emptyState({ emoji, title, text }));
      return;
    }
    listBox.replaceChildren(list(shown.map((task) => (task.id === editingId ? editRow(task) : taskRow(task, now)))));
  }

  root.append(el('div', { className: 'mod-tasks stack' }, [
    card({ title: 'Add a task', module: 'tasks', children: [addForm] }),
    card({ title: 'My tasks', module: 'tasks', children: [el('div', { className: 'stack' }, [
      el('div', { className: 'btn-row btn-row--grid', role: 'group', 'aria-label': 'Which tasks to show' }, viewButtons),
      countNote,
      listBox,
    ])] }),
  ]));

  await refresh();
}
