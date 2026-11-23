// ✅ tasks module screens.
// TSK-1: add, edit, complete, delete tasks; lists for Today (incl. overdue), Upcoming, No date, Done.
// TSK-2: due time, priority (low / normal / high) and repeating tasks (daily / weekly / monthly).
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll } from '../core/storage.js';
import { today, addDays, formatDate, formatTime, nowDateTime, formatDateTime, monthEnd } from '../core/dates.js';

const MAX_TITLE = 200;
const MAX_NOTES = 2000;

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];
const REPEATS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];
const REPEAT_WORD = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

// Tasks saved before TSK-2 have no priority or repeat: they count as Normal, no repeat.
const priorityOf = (task) => task.priority || 'normal';
const repeatOf = (task) => task.repeat || 'none';

// One step of a repeat: the day after, a week after, or the same day next month
// (the 31st becomes the last day of a shorter month).
function stepDate(ymd, repeat) {
  if (repeat === 'daily') return addDays(ymd, 1);
  if (repeat === 'weekly') return addDays(ymd, 7);
  const [y, m, d] = ymd.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const first = `${ny}-${String(nm).padStart(2, '0')}-01`;
  const last = monthEnd(first);
  return `${first.slice(0, 8)}${String(Math.min(d, Number(last.slice(8)))).padStart(2, '0')}`;
}

// The next due date of a repeating task: stepped from its due date (or today if it has none)
// until it is after today, so ticking off an old overdue task doesn't make another overdue one.
function nextDueDate(task, now) {
  let next = stepDate(task.dueDate || now, repeatOf(task));
  while (next <= now) next = stepDate(next, repeatOf(task));
  return next;
}

// A row of pill buttons where one is picked (priority, repeat). The picked value is at group.value.
function pillGroup({ label, options, value, grid = false }) {
  const group = el('div', { className: 'field' });
  const buttons = options.map((opt) => {
    const btn = button({ label: opt.label, variant: 'secondary', onClick: () => pick(opt.value) });
    btn.dataset.value = opt.value;
    return btn;
  });
  function pick(v) {
    group.value = v;
    buttons.forEach((b) => {
      const on = b.dataset.value === v;
      b.classList.toggle('btn--primary', on);
      b.classList.toggle('btn--secondary', !on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  group.append(
    el('div', { className: 'field__label', text: label }),
    el('div', { className: grid ? 'btn-row btn-row--grid' : 'btn-row', role: 'group', 'aria-label': label }, buttons),
  );
  group.pick = pick;
  pick(value);
  return group;
}

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
  let dueDate = fields.dueDate.input.value || null;
  const dueTime = fields.dueTime.input.value || null;
  const priority = fields.priority.value;
  const repeat = fields.repeat.value;
  const errors = {};
  if (!title) errors.title = 'Give the task a name, e.g. "Pay electricity bill"';
  else if (title.length > MAX_TITLE) errors.title = `Please keep the name under ${MAX_TITLE} letters.`;
  if (notes.length > MAX_NOTES) errors.notes = `Please keep notes under ${MAX_NOTES} letters.`;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) errors.dueDate = 'Pick a date, or leave it empty.';
  if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) errors.dueTime = 'Pick a time, or leave it empty.';
  else if (dueTime && !dueDate) errors.dueTime = 'Pick a due date too, or clear the time.';
  // A repeating task needs a date to repeat from; with none, it starts today.
  if (repeat !== 'none' && !dueDate && !errors.dueDate) dueDate = today();
  return Object.keys(errors).length
    ? { errors }
    : { values: { title, notes, dueDate, dueTime, priority, repeat } };
}

// Title, notes, due date and time boxes plus priority and repeat pills,
// used by the add form and the edit row.
function taskFields(task = {}) {
  const fields = {
    title: input({ label: 'Task', name: 'title', value: task.title || '', placeholder: 'e.g. Pay electricity bill' }),
    dueDate: input({ label: 'Due date (optional)', name: 'dueDate', type: 'date', value: task.dueDate || '' }),
    dueTime: input({ label: 'Time', name: 'dueTime', type: 'time', value: task.dueTime || '' }),
    notes: input({ label: 'Notes (optional)', name: 'notes', type: 'textarea', value: task.notes || '' }),
  };
  Object.values(fields).forEach((f) => f.input.addEventListener('input', () => f.setError('')));
  fields.priority = pillGroup({ label: 'Priority', options: PRIORITIES, value: priorityOf(task) });
  fields.repeat = pillGroup({ label: 'Repeat', options: REPEATS, value: repeatOf(task), grid: true });
  return fields;
}

function showErrors(fields, errors) {
  for (const [name, f] of Object.entries(fields)) f.setError?.(errors[name] || '');
  const first = Object.keys(fields).find((name) => errors[name]);
  if (first) fields[first].input.focus();
}

// The boxes in the order they appear in a form. In the narrower edit row,
// date and time go on separate lines so neither is cut off.
function formParts(fields, { narrow = false } = {}) {
  return [
    fields.title,
    ...(narrow ? [fields.dueDate, fields.dueTime] : [el('div', { className: 'field-row' }, [fields.dueDate, fields.dueTime])]),
    datePills(fields.dueDate, fields.dueTime),
    fields.priority,
    fields.repeat,
    fields.notes,
  ];
}

// Quick pills that fill the due date box ("No date" also clears the time).
function datePills(dateField, timeField) {
  const set = (value) => {
    dateField.input.value = value;
    dateField.setError('');
    if (!value) { timeField.input.value = ''; timeField.setError(''); }
  };
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
    ...formParts(addFields),
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
    addFields.dueTime.input.value = '';
    addFields.priority.pick('normal');
    addFields.repeat.pick('none');
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
    const parts = [];
    if (priorityOf(task) === 'high') parts.push('🔴 High');
    if (priorityOf(task) === 'low') parts.push('Low');
    if (task.dueDate) {
      const at = task.dueTime ? ` · ${formatTime(task.dueTime)}` : '';
      if (task.dueDate < now) parts.push(`⚠️ Overdue · ${formatDate(task.dueDate)}${at}`);
      else if (task.dueDate === now) parts.push(`Due today${at}`);
      else if (task.dueDate === addDays(now, 1)) parts.push(`Due tomorrow${at}`);
      else parts.push(`Due ${formatDate(task.dueDate)}${at}`);
    }
    if (repeatOf(task) !== 'none') parts.push(`🔁 ${REPEAT_WORD[repeatOf(task)]}`);
    if (task.notes) parts.push(parts.length ? '📝' : '📝 Has notes');
    return parts.join(' · ');
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
      ...formParts(fields, { narrow: true }),
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

  // Ticking off a repeating task also adds the next one. If that next one already exists
  // (e.g. ticked, unticked, ticked again), it isn't added twice.
  async function addNextRepeat(task) {
    const now = today();
    const dueDate = nextDueDate(task, now);
    const all = await listAll('tasks');
    const already = all.some((t) => !t.done && t.id !== task.id && t.title === task.title
      && repeatOf(t) === repeatOf(task) && t.dueDate === dueDate);
    if (already) return null;
    return add('tasks', {
      title: task.title,
      notes: task.notes || '',
      dueDate,
      dueTime: task.dueTime || null,
      priority: priorityOf(task),
      repeat: repeatOf(task),
      done: false,
      doneAt: null,
    });
  }

  async function toggleDone(task) {
    const nowDone = !task.done;
    await update('tasks', task.id, { done: nowDone, doneAt: nowDone ? nowDateTime() : null });
    const next = nowDone && repeatOf(task) !== 'none' ? await addNextRepeat(task) : null;
    if (editingId === task.id) editingId = null;
    await refresh();
    let message = nowDone ? `Done! 🎉 "${task.title}"` : `"${task.title}" is back on your list`;
    if (next) message = `Done! 🎉 Next one: ${formatDate(next.dueDate)}`;
    toast({
      message,
      actionLabel: 'Undo',
      onAction: async () => {
        await update('tasks', task.id, { done: task.done, doneAt: task.doneAt ?? null });
        if (next) await remove('tasks', next.id);
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
    // High priority first, then soonest due (tasks with a time before those without, earliest first);
    // undated: high priority first, then oldest first; done newest first.
    const byPriority = (a, b) => PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)];
    const byTime = (a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
    const byDue = (a, b) => byPriority(a, b) || a.dueDate.localeCompare(b.dueDate) || byTime(a, b)
      || a.createdAt.localeCompare(b.createdAt);
    groups.today.sort(byDue);
    groups.upcoming.sort(byDue);
    groups.nodate.sort((a, b) => byPriority(a, b) || a.createdAt.localeCompare(b.createdAt));
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
