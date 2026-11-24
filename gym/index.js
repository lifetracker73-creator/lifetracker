// 🏋️ gym (Gym log) module screens.
// GYM-1: workout types (defaults + my own, kept in the "gym" settings like Medical log's types),
//        add / edit / delete a workout session (Undo), sessions list newest first.
// GYM-2: exercises inside a session ("#/gym/session/<id>"): exercise library with name suggestions,
//        strength (sets, reps, kg) or cardio (min, km), add / edit / delete / reorder.
// GYM-3: "Last time" hint while adding an exercise.
// GYM-4: personal record 🏆 (heaviest kg / longest km), worked out on screen, shown on save and in lists.
// GYM-5: routines: save a session as a routine, edit / delete, start a new session from one in one tap.
// GYM-6: insights: workouts per week (last 12 weeks), gym streak vs weekly goal, most-trained exercises.
// Everything calculated (records, streaks, counts) is worked out on screen, never stored.
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import { list as listAll, add, update, remove, restore, getSettings, saveSettings } from '../core/storage.js';
import { today, formatDate, addDays, weekStart } from '../core/dates.js';
import { formatNumber } from '../core/format.js';
import { barChart } from '../core/charts.js';
import { navigate } from '../core/router.js';
import { celebrate } from '../core/buddy.js';

const DEFAULT_TYPES = ['Strength', 'Cardio', 'Yoga', 'Sports', 'Other'];
const DEFAULT_GOAL = 3;
const MAX_NAME = 40;
const MAX_NOTE = 500;
const WEEKS_SHOWN = 12;

// Random id for a workout type. crypto.randomUUID only works on https/localhost.
function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const tidy = (text) => String(text || '').trim().replace(/\s+/g, ' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (d) => formatDate(d).split(' ').slice(0, 2).join(' '); // "21 Nov"
const kgText = (kg) => `${formatNumber(kg, 1)} kg`;
const kmText = (km) => `${formatNumber(km, 2)} km`;

// ---------- loading ----------

// Gym settings, saving the starter workout types the first time.
async function loadSettings() {
  const s = await getSettings('gym', { types: [], typesSeeded: false, weeklyGoal: DEFAULT_GOAL });
  if (!s.typesSeeded) {
    s.types = s.types.length ? s.types : DEFAULT_TYPES.map((name) => ({ id: newId(), name }));
    s.typesSeeded = true;
    await saveSettings('gym', { types: s.types, typesSeeded: true });
  }
  if (!(s.weeklyGoal > 0)) s.weeklyGoal = DEFAULT_GOAL;
  return s;
}

async function loadAll() {
  const [settings, sessions, sets, exercises, routines] = await Promise.all([
    loadSettings(), listAll('gymSessions'), listAll('gymSets'), listAll('gymExercises'), listAll('gymRoutines'),
  ]);
  return makeData({ settings, sessions, sets, exercises, routines });
}

function makeData(d) {
  d.sessionById = new Map(d.sessions.map((s) => [s.id, s]));
  d.exerciseById = new Map(d.exercises.map((x) => [x.id, x]));
  d.typeName = (id) => d.settings.types.find((t) => t.id === id)?.name ?? 'Workout';
  d.exerciseName = (id) => d.exerciseById.get(id)?.name ?? 'Deleted exercise';
  d.kindOf = (exerciseId) => d.exerciseById.get(exerciseId)?.kind ?? 'strength';
  d.setsOf = (sessionId) => d.sets.filter((s) => s.sessionId === sessionId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  d.records = recordIds(d);
  return d;
}

// Newest first (date, then the latest added).
const newestFirst = (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

// ---------- records (GYM-4) and "last time" (GYM-3) ----------

// What a record is measured by: heaviest kg for strength, longest km for cardio.
function bestValue(set, kind) {
  const v = kind === 'cardio' ? set.distanceKm : set.weightKg;
  return typeof v === 'number' && v > 0 ? v : null;
}

// Ids of the entries that beat every earlier entry of the same exercise (the very first one doesn't count).
function recordIds(d) {
  const when = (s) => {
    const session = d.sessionById.get(s.sessionId);
    return [session.date, session.createdAt, String(s.order ?? 0).padStart(6, '0'), s.createdAt];
  };
  const ordered = d.sets.filter((s) => d.sessionById.has(s.sessionId))
    .map((s) => ({ s, key: when(s) }))
    .sort((a, b) => {
      for (let i = 0; i < 4; i++) { const c = a.key[i].localeCompare(b.key[i]); if (c) return c; }
      return 0;
    });
  const best = new Map();
  const ids = new Set();
  for (const { s } of ordered) {
    const v = bestValue(s, d.kindOf(s.exerciseId));
    if (v === null) continue;
    const before = best.get(s.exerciseId);
    if (before !== undefined && v > before) ids.add(s.id);
    if (before === undefined || v > before) best.set(s.exerciseId, v);
  }
  return ids;
}

/** "3 × 10 @ 40 kg", "3 × 12 · bodyweight", "25 min, 4.2 km". */
function setText(s, kind) {
  if (kind === 'cardio') {
    return [s.durationMin ? `${formatNumber(s.durationMin)} min` : '', s.distanceKm ? kmText(s.distanceKm) : '']
      .filter(Boolean).join(', ') || 'Cardio';
  }
  return `${s.sets ?? '?'} × ${s.reps ?? '?'}${s.weightKg ? ` @ ${kgText(s.weightKg)}` : ' · bodyweight'}`;
}

// The most recent earlier session (before `session`) where this exercise was done.
function lastTime(d, exerciseId, session) {
  const earlier = (x) => x.date < session.date || (x.date === session.date && x.createdAt < session.createdAt);
  const past = d.sessions.filter((x) => x.id !== session.id && earlier(x)).sort(newestFirst);
  for (const x of past) {
    const done = d.setsOf(x.id).filter((s) => s.exerciseId === exerciseId);
    if (done.length) return { session: x, sets: done };
  }
  return null;
}

// ---------- weeks and streak (GYM-6) ----------

function workoutsPerWeek(sessions) {
  const counts = new Map();
  for (const s of sessions) {
    const w = weekStart(s.date);
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return counts;
}

// Weeks in a row that reached the goal. This week counts once it's reached; until then the streak
// is counted from last week, so it isn't lost before the week is over.
function gymStreak(sessions, goal, day = today()) {
  const counts = workoutsPerWeek(sessions);
  let w = weekStart(day);
  if ((counts.get(w) || 0) < goal) w = addDays(w, -7);
  let streak = 0;
  while ((counts.get(w) || 0) >= goal) { streak += 1; w = addDays(w, -7); }
  return streak;
}

// ---------- number boxes ----------

// Reads a number box. Gives back { value } (null when blank and optional) or { error }.
function readNumber(field, { min, max, decimals = 0, optional = false, example }) {
  const text = String(field.input.value).trim().replace(/,/g, '');
  if (text === '') return optional ? { value: null } : { error: `Please type a number, e.g. ${example}` };
  const v = Number(text);
  if (!Number.isFinite(v)) return { error: `Please type a number, e.g. ${example}` };
  const factor = 10 ** decimals;
  const value = Math.round(v * factor) / factor;
  if (value < min) return { error: `Please type at least ${min}${optional ? ', or leave it empty' : ''}` };
  if (value > max) return { error: `That's a lot! Please type ${max} or less` };
  return { value };
}

function numberBox(label, value, { decimal = false, placeholder, hint } = {}) {
  const f = input({
    label, type: 'text', inputmode: decimal ? 'decimal' : 'numeric',
    value: value == null ? '' : String(value), placeholder, hint,
  });
  f.input.addEventListener('input', () => f.setError(''));
  return f;
}

// Pill buttons to pick one choice. Returns the group with .value / .set(value) / .setDisabled(bool).
function choicePills(options, value, onChange, ariaLabel) {
  let current = value;
  const group = el('div', { className: 'btn-row', role: 'group', 'aria-label': ariaLabel });
  const buttons = options.map(([v, label]) => {
    const b = button({ label, variant: 'secondary', onClick: () => { group.set(v); onChange?.(v); } });
    b.dataset.value = v;
    return b;
  });
  group.append(...buttons);
  group.set = (v) => {
    current = v;
    for (const b of buttons) {
      const on = b.dataset.value === v;
      b.classList.toggle('btn--primary', on);
      b.classList.toggle('btn--secondary', !on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  group.setDisabled = (off) => { for (const b of buttons) b.disabled = off; };
  Object.defineProperty(group, 'value', { get: () => current });
  group.set(value);
  return group;
}

// ---------- session details form (GYM-1) ----------

function sessionFields(d, values = {}) {
  const date = input({ label: 'Date', type: 'date', value: values.date ?? today(), max: today() });
  const type = input({
    label: 'Type of workout', type: 'select',
    options: d.settings.types.map((t) => ({ value: t.id, label: t.name })),
    value: values.typeId ?? d.settings.types[0]?.id ?? '',
  });
  const duration = numberBox('Duration (min, optional)', values.durationMin, { placeholder: 'e.g. 45' });
  const note = input({ label: 'Note (optional)', type: 'textarea', value: values.note ?? '', placeholder: 'How it felt, where you trained…' });
  date.input.addEventListener('input', () => date.setError(''));
  return {
    date,
    elements: [el('div', { className: 'field-row' }, [date, duration]), type, note],
    read() {
      const dv = date.input.value;
      const dateError = !/^\d{4}-\d{2}-\d{2}$/.test(dv) ? 'Please pick a date.' : dv > today() ? "The date can't be in the future." : '';
      date.setError(dateError);
      const dur = readNumber(duration, { min: 1, max: 600, optional: true, example: 45 });
      duration.setError(dur.error || '');
      const typeError = type.input.value ? '' : 'Add a workout type first (see below).';
      type.setError(typeError);
      const noteText = note.input.value.trim();
      const noteError = noteText.length > MAX_NOTE ? `Keep the note to ${MAX_NOTE} letters or fewer.` : '';
      note.setError(noteError);
      if (dateError || dur.error || typeError || noteError) return null;
      return { date: dv, typeId: type.input.value, durationMin: dur.value, note: noteText };
    },
  };
}

// Deletes a session and its exercises, with Undo bringing both back.
async function deleteSession(d, session, after) {
  const sets = d.setsOf(session.id);
  const removed = await remove('gymSessions', session.id);
  for (const s of sets) await remove('gymSets', s.id);
  await after();
  if (!removed) return;
  toast({
    message: `Deleted ${d.typeName(removed.typeId)} · ${formatDate(removed.date)}`,
    actionLabel: 'Undo',
    onAction: async () => {
      await restore('gymSessions', removed);
      for (const s of sets) await restore('gymSets', s);
      await after(true);
    },
  });
}

// Starts a new session today from a routine, with all its exercises filled in (GYM-5).
async function startRoutine(d, routine) {
  const typeId = d.settings.types.some((t) => t.id === routine.typeId) ? routine.typeId : d.settings.types[0]?.id;
  const session = await add('gymSessions', { date: today(), typeId, durationMin: null, note: '' });
  let order = 1;
  for (const item of routine.items || []) {
    if (!d.exerciseById.has(item.exerciseId)) continue;
    const kind = d.kindOf(item.exerciseId);
    const values = kind === 'cardio'
      ? { durationMin: item.durationMin ?? null, distanceKm: item.distanceKm ?? null }
      : { sets: item.sets ?? null, reps: item.reps ?? null, weightKg: item.weightKg ?? null };
    await add('gymSets', { sessionId: session.id, exerciseId: item.exerciseId, order: order++, ...values });
  }
  toast({ message: `Started “${routine.name}” 💪 Change any numbers you need.` });
  navigate(`gym/session/${session.id}`);
}

// ---------- editable name lists (workout types, exercise library) ----------

function nameList({ items, singular, emoji, example, usedText, canAdd, onSave, onRemoveCheck, describe }) {
  const box = el('div', { className: 'stack' });
  let editingId = null;
  let current = items();

  function readName(field, ownId) {
    const text = tidy(field.input.value);
    let error = '';
    if (!text) error = `Type a name, e.g. ${example}`;
    else if (text.length > MAX_NAME) error = `Keep the name to ${MAX_NAME} letters or fewer.`;
    else if (current.some((x) => x.id !== ownId && x.name.toLowerCase() === text.toLowerCase())) {
      error = `You already have a ${singular} with this name.`;
    }
    field.setError(error);
    return error ? null : text;
  }

  let addForm = null;
  if (canAdd) {
    const addField = input({ label: `New ${singular}`, type: 'text', placeholder: `e.g. ${example}` });
    addField.input.addEventListener('input', () => addField.setError(''));
    addForm = el('form', { className: 'stack', novalidate: true }, [
      addField,
      button({ label: `Add ${singular}`, icon: 'plus', variant: 'primary', type: 'submit', block: true }),
    ]);
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = readName(addField);
      if (!name) return;
      await onSave({ op: 'add', name });
      addField.input.value = '';
      toast({ message: `Added ${name} ✨` });
    });
  }

  function editRow(item) {
    const field = input({ label: 'Name', type: 'text', value: item.name });
    field.input.addEventListener('input', () => field.setError(''));
    const form = el('form', { className: 'stack', novalidate: true }, [
      field,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; draw(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = readName(field, item.id);
      if (!name) return;
      editingId = null;
      await onSave({ op: 'rename', item, name });
    });
    queueMicrotask(() => field.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
  }

  async function removeItem(item) {
    const problem = onRemoveCheck(item);
    if (problem) { toast({ message: problem }); return; }
    if (editingId === item.id) editingId = null;
    await onSave({ op: 'remove', item });
  }

  function draw() {
    current = items();
    box.replaceChildren(current.length
      ? list(current.map((item) => {
        if (item.id === editingId) return editRow(item);
        const open = () => { editingId = item.id; draw(); };
        return listItem({
          title: item.name,
          subtitle: describe(item),
          onClick: open,
          actions: [
            button({ icon: 'edit', variant: 'ghost', ariaLabel: `Rename ${item.name}`, onClick: open }),
            button({ icon: 'trash', variant: 'ghost', ariaLabel: `Remove ${item.name}`, onClick: () => removeItem(item) }),
          ],
        });
      }))
      : emptyState({ emoji, title: `No ${singular}s yet`, text: usedText }));
  }
  draw();
  const wrapper = el('div', { className: 'stack' }, [addForm, box]);
  wrapper.draw = draw;
  return wrapper;
}

// ---------- main screen: Log / Routines / Insights ----------

export async function render(root, { path = [] } = {}) {
  if (path[0] === 'session' && path[1]) return sessionScreen(root, path[1]);
  return mainScreen(root);
}

async function mainScreen(root) {
  let d = await loadAll();

  async function reload() {
    d = await loadAll();
    drawLog();
    drawRoutines();
    if (!insightsView.hidden) drawInsights();
  }

  // ---- Add a workout ----
  const formBox = el('div', { className: 'stack' });
  let fields;
  function buildForm() {
    fields = sessionFields(d);
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...fields.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => showAddForm(false) }),
        button({ label: 'Save & add exercises', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = fields.read();
      if (!values) return;
      const session = await add('gymSessions', values);
      toast({ message: `Saved ${d.typeName(values.typeId)} · ${formatDate(values.date)} ✨` });
      navigate(`gym/session/${session.id}`);
    });
    formBox.replaceChildren(form);
  }
  const addCard = card({ title: 'Add a workout', module: 'gym', children: [formBox] });
  const addButton = button({ label: 'Add workout', icon: 'plus', variant: 'primary', block: true, onClick: () => showAddForm(true) });
  function showAddForm(open) {
    if (open) buildForm();
    addCard.hidden = !open;
    addButton.hidden = open;
    if (open) {
      addCard.scrollIntoView({ block: 'start', behavior: 'smooth' });
      queueMicrotask(() => fields.date.input.focus());
    }
  }

  // ---- Quick start from a routine (GYM-5) ----
  const quickStart = el('div');
  function drawQuickStart() {
    if (!d.routines.length) { quickStart.replaceChildren(); return; }
    const routines = [...d.routines].sort((a, b) => a.name.localeCompare(b.name));
    quickStart.replaceChildren(card({
      title: '▶️ Start a routine',
      children: [el('div', { className: 'pill-wrap', role: 'group', 'aria-label': 'Start a routine' },
        routines.map((r) => button({ label: `▶ ${r.name}`, variant: 'secondary', onClick: () => startRoutine(d, r) })))],
    }));
  }

  // ---- Sessions list ----
  const sessionsBox = el('div', { className: 'stack' });
  function drawSessions() {
    if (!d.sessions.length) {
      sessionsBox.replaceChildren(emptyState({ emoji: '🏋️', title: 'No workouts yet', text: 'Tap "+ Add workout" above to log your first one.' }));
      return;
    }
    const rows = [...d.sessions].sort(newestFirst).map((s) => {
      const sets = d.setsOf(s.id);
      const records = sets.filter((x) => d.records.has(x.id)).length;
      const subtitle = [
        formatDate(s.date),
        sets.length ? plural(sets.length, 'exercise') : 'No exercises yet',
        s.durationMin ? `${formatNumber(s.durationMin)} min` : '',
        s.note,
      ].filter(Boolean).join(' · ');
      const title = d.typeName(s.typeId);
      return listItem({
        title,
        subtitle,
        meta: records ? `🏆 ${records}` : '',
        onClick: () => navigate(`gym/session/${s.id}`),
        actions: [button({
          icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${title} on ${formatDate(s.date)}`,
          onClick: () => deleteSession(d, s, reload),
        })],
      });
    });
    sessionsBox.replaceChildren(list(rows));
  }

  // ---- Workout types (GYM-1) ----
  const typeUse = (id) => d.sessions.filter((s) => s.typeId === id).length
    + d.routines.filter((r) => r.typeId === id).length;
  const types = nameList({
    items: () => d.settings.types,
    singular: 'workout type', emoji: '🏷️', example: 'Swimming', canAdd: true,
    usedText: 'Add one above.',
    describe: (t) => {
      const n = d.sessions.filter((s) => s.typeId === t.id).length;
      return n ? plural(n, 'workout') : 'No workouts yet';
    },
    onRemoveCheck: (t) => {
      if (typeUse(t.id)) return `${t.name} is still used by a workout or routine, so it can't be removed. You can rename it instead.`;
      if (d.settings.types.length <= 1) return 'Keep at least one workout type. You can rename this one instead.';
      return '';
    },
    onSave: async ({ op, item, name }) => {
      const before = d.settings.types;
      let next = before;
      if (op === 'add') next = [...before, { id: newId(), name }];
      if (op === 'rename') next = before.map((t) => (t.id === item.id ? { ...t, name } : t));
      if (op === 'remove') next = before.filter((t) => t.id !== item.id);
      await saveSettings('gym', { types: next });
      await reload();
      if (op === 'remove') {
        const index = before.findIndex((t) => t.id === item.id);
        toast({
          message: `Removed ${item.name}`, actionLabel: 'Undo',
          onAction: async () => {
            const now = [...d.settings.types];
            if (now.some((t) => t.id === item.id)) return;
            now.splice(Math.min(index, now.length), 0, item);
            await saveSettings('gym', { types: now });
            await reload();
          },
        });
      }
    },
  });

  // ---- Exercise library (GYM-2) ----
  const exerciseUse = (id) => d.sets.filter((s) => s.exerciseId === id).length;
  const library = nameList({
    items: () => [...d.exercises].sort((a, b) => a.name.localeCompare(b.name)),
    singular: 'exercise', emoji: '📖', example: 'Squat', canAdd: false,
    usedText: 'Exercises you log are saved here, so their names are suggested next time.',
    describe: (x) => `${x.kind === 'cardio' ? '🏃 Cardio' : '🏋️ Strength'} · ${exerciseUse(x.id) ? `done ${plural(exerciseUse(x.id), 'time')}` : 'not done yet'}`,
    onRemoveCheck: (x) => {
      if (exerciseUse(x.id)) return `${x.name} is in your workouts, so it can't be removed. You can rename it instead.`;
      if (d.routines.some((r) => (r.items || []).some((i) => i.exerciseId === x.id))) return `${x.name} is in a routine, so it can't be removed. You can rename it instead.`;
      return '';
    },
    onSave: async ({ op, item, name }) => {
      if (op === 'rename') {
        await update('gymExercises', item.id, { name });
        await reload();
      }
      if (op === 'remove') {
        const removed = await remove('gymExercises', item.id);
        await reload();
        if (removed) {
          toast({
            message: `Removed ${removed.name}`, actionLabel: 'Undo',
            onAction: async () => { await restore('gymExercises', removed); await reload(); },
          });
        }
      }
    },
  });

  function drawLog() {
    drawQuickStart();
    drawSessions();
    types.draw();
    library.draw();
  }

  const logView = el('div', { className: 'stack' }, [
    addButton,
    addCard,
    quickStart,
    card({ title: 'Workouts', children: [sessionsBox] }),
    card({
      title: 'Workout types', module: 'gym',
      children: [el('div', { className: 'stack' }, [
        el('p', { className: 'progress-note', text: 'The kinds of workout you do. Renaming one updates all its workouts.' }),
        types,
      ])],
    }),
    card({
      title: '📖 Exercise library',
      children: [el('div', { className: 'stack' }, [
        el('p', { className: 'progress-note', text: 'Each exercise has one name, so "last time" and records 🏆 find it. Renaming one updates everywhere.' }),
        library,
      ])],
    }),
  ]);

  // ---- Routines (GYM-5) ----
  const routinesView = el('div', { className: 'stack' });
  let editingRoutineId = null;

  function routineEditor(routine) {
    let items = (routine.items || []).map((i) => ({ ...i }));
    const name = input({ label: 'Routine name', type: 'text', value: routine.name });
    name.input.addEventListener('input', () => name.setError(''));
    const type = input({
      label: 'Type of workout', type: 'select',
      options: d.settings.types.map((t) => ({ value: t.id, label: t.name })),
      value: d.settings.types.some((t) => t.id === routine.typeId) ? routine.typeId : d.settings.types[0]?.id ?? '',
    });
    const itemsBox = el('div', { className: 'stack' });
    let itemFields = [];

    function drawItems() {
      itemFields = items.map((item, i) => {
        const kind = d.kindOf(item.exerciseId);
        const boxes = kind === 'cardio'
          ? { durationMin: numberBox('Min', item.durationMin), distanceKm: numberBox('Km', item.distanceKm, { decimal: true }) }
          : { sets: numberBox('Sets', item.sets), reps: numberBox('Reps', item.reps), weightKg: numberBox('Kg', item.weightKg, { decimal: true }) };
        const move = (by) => {
          readInto();
          [items[i], items[i + by]] = [items[i + by], items[i]];
          drawItems();
        };
        const up = button({ label: '↑', variant: 'ghost', ariaLabel: `Move ${d.exerciseName(item.exerciseId)} up`, disabled: i === 0, onClick: () => move(-1) });
        const down = button({ label: '↓', variant: 'ghost', ariaLabel: `Move ${d.exerciseName(item.exerciseId)} down`, disabled: i === items.length - 1, onClick: () => move(1) });
        up.classList.add('menu-arrow');
        down.classList.add('menu-arrow');
        const row = el('li', { className: 'list-item' }, [
          el('div', { className: 'list-item__main stack' }, [
            el('div', { className: 'list-item__title', text: d.exerciseName(item.exerciseId) }),
            el('div', { className: 'field-grid' }, Object.values(boxes)),
          ]),
          el('div', { className: 'list-item__actions' }, [
            up, down,
            button({
              icon: 'trash', variant: 'ghost', ariaLabel: `Remove ${d.exerciseName(item.exerciseId)}`,
              onClick: () => { readInto(); items.splice(i, 1); drawItems(); },
            }),
          ]),
        ]);
        return { row, boxes, kind };
      });
      itemsBox.replaceChildren(items.length
        ? list(itemFields.map((f) => f.row))
        : el('p', { className: 'muted', text: 'No exercises left. Save to keep the routine empty, or Cancel.' }));
    }

    // Copies what's typed into `items` (keeps typing when rows move). Returns false if something is wrong.
    function readInto() {
      let ok = true;
      itemFields.forEach(({ boxes, kind }, i) => {
        const rules = kind === 'cardio'
          ? { durationMin: { min: 1, max: 600, optional: true, example: 25 }, distanceKm: { min: 0.01, max: 500, decimals: 2, optional: true, example: '4.2' } }
          : { sets: { min: 1, max: 50, optional: true, example: 3 }, reps: { min: 1, max: 500, optional: true, example: 10 }, weightKg: { min: 0.1, max: 500, decimals: 1, optional: true, example: 40 } };
        for (const [key, field] of Object.entries(boxes)) {
          const r = readNumber(field, rules[key]);
          field.setError(r.error || '');
          if (r.error) ok = false;
          else items[i][key] = r.value;
        }
      });
      return ok;
    }

    drawItems();
    const form = el('form', { className: 'stack', novalidate: true }, [
      name, type,
      el('p', { className: 'field__label', text: 'Exercises' }),
      itemsBox,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingRoutineId = null; drawRoutines(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
      button({ label: 'Delete routine', icon: 'trash', variant: 'danger', block: true, onClick: () => deleteRoutine(routine) }),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = tidy(name.input.value);
      let error = '';
      if (!text) error = 'Type a name, e.g. Leg day';
      else if (text.length > MAX_NAME) error = `Keep the name to ${MAX_NAME} letters or fewer.`;
      else if (d.routines.some((r) => r.id !== routine.id && r.name.toLowerCase() === text.toLowerCase())) error = 'You already have a routine with this name.';
      name.setError(error);
      if (!readInto() || error) return;
      await update('gymRoutines', routine.id, { name: text, typeId: type.input.value, items });
      editingRoutineId = null;
      toast({ message: 'Routine updated ✨' });
      await reload();
    });
    queueMicrotask(() => name.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
  }

  async function deleteRoutine(routine) {
    const removed = await remove('gymRoutines', routine.id);
    editingRoutineId = null;
    await reload();
    if (!removed) return;
    toast({
      message: `Deleted routine ${removed.name}`, actionLabel: 'Undo',
      onAction: async () => { await restore('gymRoutines', removed); await reload(); },
    });
  }

  function drawRoutines() {
    const intro = el('p', { className: 'progress-note', text: 'Open a workout and tap "Save as routine" to make one. Then start it here in one tap.' });
    if (!d.routines.length) {
      routinesView.replaceChildren(card({ title: 'Routines', module: 'gym', children: [el('div', { className: 'stack' }, [
        intro,
        emptyState({ emoji: '📝', title: 'No routines yet', text: 'Save a workout you like as a routine to repeat it in one tap.' }),
      ])] }));
      return;
    }
    const rows = [...d.routines].sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
      if (r.id === editingRoutineId) return routineEditor(r);
      const names = (r.items || []).map((i) => d.exerciseName(i.exerciseId));
      return listItem({
        title: r.name,
        subtitle: [d.typeName(r.typeId), plural(names.length, 'exercise'), names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '')]
          .filter(Boolean).join(' · '),
        onClick: () => { editingRoutineId = r.id; drawRoutines(); },
        actions: [button({ label: '▶ Start', variant: 'primary', ariaLabel: `Start ${r.name}`, onClick: () => startRoutine(d, r) })],
      });
    });
    routinesView.replaceChildren(card({ title: 'Routines', module: 'gym', children: [el('div', { className: 'stack' }, [
      intro,
      el('p', { className: 'muted', text: 'Tap a routine to change its name, type, numbers or order.' }),
      list(rows),
    ])] }));
  }

  // ---- Insights (GYM-6) ----
  const insightsView = el('div', { className: 'stack' });
  let chart = null;
  function drawInsights() {
    chart?.then?.((c) => c?.destroy?.());
    chart = null;
    const goal = d.settings.weeklyGoal;
    const thisWeek = weekStart(today());
    const counts = workoutsPerWeek(d.sessions);
    const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => addDays(thisWeek, (i - WEEKS_SHOWN + 1) * 7));
    const done = counts.get(thisWeek) || 0;
    const streak = gymStreak(d.sessions, goal);

    const goalCard = card({ title: 'Gym streak', module: 'gym', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'progress-stats' }, [
        el('span', { className: 'progress-stats__amount', text: `${done} of ${goal} workouts this week` }),
      ]),
      progressBar({ value: done, max: goal, label: 'Workouts this week' }),
      el('p', { className: 'progress-note', text: done >= goal ? 'Weekly goal reached! 🎉' : `${plural(goal - done, 'more workout')} to reach your goal.` }),
      el('p', { className: 'home-message', text: streak
        ? `🔥 ${plural(streak, 'week')} in a row at your goal`
        : 'Reach your weekly goal to start a streak 💪' }),
      el('a', { className: 'btn btn--secondary btn--block', href: '#/settings' }, [el('span', { text: `🎯 Weekly goal: ${goal} (change in Settings)` })]),
    ])] });

    const chartBox = el('div', { className: 'chart-box' });
    const chartCard = card({ title: '📊 Workouts per week', children: [
      el('p', { className: 'muted', text: `Last ${WEEKS_SHOWN} weeks (each bar starts on a Monday).` }),
      chartBox,
    ] });

    // Most-trained exercises: how many times each one was done.
    const timesDone = new Map();
    for (const s of d.sets) if (d.sessionById.has(s.sessionId)) timesDone.set(s.exerciseId, (timesDone.get(s.exerciseId) || 0) + 1);
    const top = [...timesDone].sort((a, b) => b[1] - a[1] || d.exerciseName(a[0]).localeCompare(d.exerciseName(b[0]))).slice(0, 5);
    const most = top[0]?.[1] || 1;
    const topCard = card({ title: '⭐ Most-trained exercises', children: [top.length
      ? el('div', { className: 'stack' }, top.map(([id, n]) => el('div', { className: 'stack' }, [
        el('div', { className: 'row' }, [
          el('strong', { text: d.exerciseName(id) }),
          el('span', { className: 'muted', text: `· ${plural(n, 'time')}` }),
        ]),
        progressBar({ value: n, max: most, label: `${d.exerciseName(id)}: ${plural(n, 'time')}` }),
      ])))
      : emptyState({ emoji: '⭐', title: 'Nothing yet', text: 'Add exercises to your workouts to see your favourites here.' })] });

    insightsView.replaceChildren(goalCard, chartCard, topCard);
    chart = barChart(chartBox, {
      module: 'gym', labels: weeks, values: weeks.map((w) => counts.get(w) || 0),
      goal, goalLabel: 'Goal', format: (v) => formatNumber(v),
    });
    chart.catch?.((err) => console.error(err));
  }

  // ---- Tabs ----
  const tabs = [['log', '📋 Log'], ['routines', '📝 Routines'], ['insights', '📊 Insights']].map(([key, label]) => {
    const b = button({ label, variant: 'secondary', onClick: () => showTab(key) });
    b.dataset.tab = key;    return b;
  });
  function showTab(key) {
    tabs.forEach((b) => {
      const on = b.dataset.tab === key;
      b.classList.toggle('btn--primary', on);
      b.classList.toggle('btn--secondary', !on);
      b.setAttribute('aria-pressed', String(on));
    });
    logView.hidden = key !== 'log';
    routinesView.hidden = key !== 'routines';
    insightsView.hidden = key !== 'insights';
    if (key === 'insights') drawInsights();
  }

  showAddForm(false);
  drawLog();
  drawRoutines();
  showTab('log');
  root.append(el('div', { className: 'mod-gym stack' }, [
    // Tabs sized to their words, so all three fit on one line on a 360px phone.
    el('div', { className: 'btn-row', role: 'group', 'aria-label': 'Gym log view', style: 'grid-auto-columns: auto' }, tabs),
    logView, routinesView, insightsView,
  ]));
}

// ---------- one workout session (GYM-2, 3, 4, 5) ----------

async function sessionScreen(root, sessionId) {
  let d = await loadAll();
  const page = el('div', { className: 'mod-gym stack' });
  root.append(page);
  const back = el('a', { className: 'btn btn--ghost split-back', href: '#/gym' }, [el('span', { text: '◀ Gym log' })]);

  let session = d.sessionById.get(sessionId);
  if (!session) {
    page.append(back, emptyState({ emoji: '🏋️', title: 'This workout isn’t here', text: 'It may have been deleted.' }));
    return;
  }

  let editingDetails = false;
  let editingSetId = null;
  let adding = false;
  let savingRoutine = false;

  const detailsBox = el('div');
  const setsBox = el('div', { className: 'stack' });
  const addBox = el('div', { className: 'stack' });
  const routineBox = el('div', { className: 'stack' });

  async function reload() {
    d = await loadAll();
    session = d.sessionById.get(sessionId);
    if (!session) { navigate('gym'); return; }
    draw();
  }

  // ---- details ----
  function drawDetails() {
    if (editingDetails) {
      const f = sessionFields(d, session);
      const form = el('form', { className: 'stack', novalidate: true }, [
        ...f.elements,
        el('div', { className: 'btn-row' }, [
          button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingDetails = false; drawDetails(); } }),
          button({ label: 'Save', variant: 'primary', type: 'submit' }),
        ]),
      ]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = f.read();
        if (!values) return;
        await update('gymSessions', session.id, values);
        editingDetails = false;
        toast({ message: 'Workout updated ✨' });
        await reload();
      });
      detailsBox.replaceChildren(card({ title: 'Edit workout', module: 'gym', children: [form] }));
      queueMicrotask(() => f.date.input.focus());
      return;
    }
    const lines = [
      formatDate(session.date, { weekday: true }),
      session.durationMin ? `⏱️ ${formatNumber(session.durationMin)} min` : '',
      session.note ? `📝 ${session.note}` : '',
    ].filter(Boolean);
    detailsBox.replaceChildren(card({
      title: d.typeName(session.typeId), module: 'gym',
      children: [el('div', { className: 'stack' }, [
        ...lines.map((t) => el('p', { className: 'muted', text: t })),
        el('div', { className: 'btn-row' }, [
          button({ label: 'Edit details', icon: 'edit', variant: 'secondary', onClick: () => { editingDetails = true; drawDetails(); } }),
          button({ label: 'Delete', icon: 'trash', variant: 'danger', onClick: () => deleteSession(d, session, async (undone) => {
            if (undone) navigate(`gym/session/${session.id}`); else navigate('gym');
          }) }),
        ]),
      ])],
    }));
  }

  // ---- exercise form (add and edit) ----
  let suggestCount = 0;
  function exerciseForm(values = {}, { onCancel, onSaved, submitLabel }) {
    const existing = values.exerciseId ? d.exerciseById.get(values.exerciseId) : null;
    const name = input({ label: 'Exercise', type: 'text', value: existing?.name ?? '', placeholder: 'e.g. Squat, Running' });
    const listId = `gym-ex-${sessionId.slice(0, 8)}-${++suggestCount}`;
    name.input.setAttribute('list', listId);
    name.input.setAttribute('autocomplete', 'off');
    name.append(el('datalist', { id: listId }, [...d.exercises].sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => el('option', { value: x.name }))));

    const hint = el('div', { className: 'highlight', style: 'display: none' }, [
      el('span', { className: 'highlight__emoji', 'aria-hidden': 'true', text: '🕒' }),
      el('p', { className: 'highlight__text' }),
    ]);
    const hintText = hint.querySelector('.highlight__text');
    const kindNote = el('p', { className: 'field__hint' });

    const strength = {
      sets: numberBox('Sets', values.sets, { placeholder: 'e.g. 3' }),
      reps: numberBox('Reps', values.reps, { placeholder: 'e.g. 10' }),
      weightKg: numberBox('Weight (kg)', values.weightKg, { decimal: true, placeholder: 'e.g. 40', hint: 'Empty = bodyweight' }),
    };
    const cardio = {
      durationMin: numberBox('Minutes', values.durationMin, { placeholder: 'e.g. 25' }),
      distanceKm: numberBox('Distance (km)', values.distanceKm, { decimal: true, placeholder: 'optional' }),
    };
    const strengthBox = el('div', { className: 'field-grid' }, Object.values(strength));
    const cardioBox = el('div', { className: 'field-grid' }, Object.values(cardio));

    const kind = choicePills([['strength', '🏋️ Strength'], ['cardio', '🏃 Cardio']],
      existing?.kind ?? 'strength', () => showKind(), 'Kind of exercise');
    function showKind() {
      strengthBox.style.display = kind.value === 'strength' ? '' : 'none';
      cardioBox.style.display = kind.value === 'cardio' ? '' : 'none';
    }

    const match = () => {
      const text = tidy(name.input.value).toLowerCase();
      return text ? d.exercises.find((x) => x.name.toLowerCase() === text) : null;
    };
    function onName() {
      name.setError('');
      const found = match();
      if (found) kind.set(found.kind);
      kind.setDisabled(Boolean(found));
      kindNote.textContent = found ? 'From your library.' : tidy(name.input.value) ? 'New exercise: pick its kind. It will be saved to your library.' : '';
      showKind();
      // GYM-3: "Last time" for this exercise.
      const last = found ? lastTime(d, found.id, session) : null;
      hint.style.display = last ? '' : 'none';
      if (last) {
        hintText.textContent = `Last time, ${shortDate(last.session.date)}: ${last.sets.map((s) => setText(s, found.kind)).join(' + ')}`;
      }
    }
    name.input.addEventListener('input', onName);
    name.input.addEventListener('change', onName);
    onName();

    const form = el('form', { className: 'stack', novalidate: true }, [
      name, hint,
      el('div', { className: 'field' }, [el('span', { className: 'field__label', text: 'Kind' }), kind, kindNote]),
      strengthBox, cardioBox,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: onCancel }),
        button({ label: submitLabel, variant: 'primary', type: 'submit' }),
      ]),
    ]);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = tidy(name.input.value);
      let nameError = '';
      if (!text) nameError = 'Type the exercise, e.g. Squat';
      else if (text.length > MAX_NAME) nameError = `Keep the name to ${MAX_NAME} letters or fewer.`;
      name.setError(nameError);
      const k = kind.value;
      let ok = !nameError;
      const read = (field, rules) => {
        const r = readNumber(field, rules);
        field.setError(r.error || '');
        if (r.error) ok = false;
        return r.value;
      };
      let numbers;
      if (k === 'cardio') {
        numbers = {
          durationMin: read(cardio.durationMin, { min: 1, max: 600, example: 25 }),
          distanceKm: read(cardio.distanceKm, { min: 0.01, max: 500, decimals: 2, optional: true, example: '4.2' }),
        };
      } else {
        numbers = {
          sets: read(strength.sets, { min: 1, max: 50, example: 3 }),
          reps: read(strength.reps, { min: 1, max: 500, example: 10 }),
          weightKg: read(strength.weightKg, { min: 0.1, max: 500, decimals: 1, optional: true, example: 40 }),
        };
      }
      if (!ok) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
      let exercise = match();
      if (!exercise) exercise = await add('gymExercises', { name: text, kind: k });
      await onSaved({ exerciseId: exercise.id, kind: exercise.kind, numbers, name: exercise.name });
    });
    showKind();
    form.focusFirst = () => name.input.focus();
    return form;
  }

  // Celebrates when the saved entry beats the best (GYM-4).
  function cheerIfRecord(setId, name, kind) {
    if (!d.records.has(setId)) return false;
    const s = d.sets.find((x) => x.id === setId);
    celebrate(`New record! 🏆 ${name}: ${kind === 'cardio' ? kmText(s.distanceKm) : kgText(s.weightKg)}`);
    return true;
  }

  // Fields of the other kind are cleared when an entry switches between strength and cardio.
  const OTHER = { strength: { durationMin: null, distanceKm: null }, cardio: { sets: null, reps: null, weightKg: null } };

  function drawAdd() {
    if (!adding) {
      addBox.replaceChildren(button({ label: 'Add exercise', icon: 'plus', variant: 'primary', block: true, onClick: () => { adding = true; drawAdd(); } }));
      return;
    }
    const form = exerciseForm({}, {
      submitLabel: 'Save exercise',
      onCancel: () => { adding = false; drawAdd(); },
      onSaved: async ({ exerciseId, kind, numbers, name }) => {
        const order = Math.max(0, ...d.setsOf(session.id).map((s) => s.order ?? 0)) + 1;
        const saved = await add('gymSets', { sessionId: session.id, exerciseId, order, ...numbers });
        await reload();
        if (!cheerIfRecord(saved.id, name, kind)) toast({ message: `Saved ${name} ✨` });
        // The form stays open for the next exercise.
      },
    });
    addBox.replaceChildren(card({ title: 'Add an exercise', module: 'gym', children: [form] }));
    queueMicrotask(() => { form.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); form.focusFirst(); });
  }

  async function deleteSet(s) {
    const removed = await remove('gymSets', s.id);
    if (editingSetId === s.id) editingSetId = null;
    await reload();
    if (!removed) return;
    toast({
      message: `Deleted ${d.exerciseName(removed.exerciseId)}`, actionLabel: 'Undo',
      onAction: async () => { await restore('gymSets', removed); await reload(); },
    });
  }

  async function moveSet(sets, i, by) {
    const a = sets[i];
    const b = sets[i + by];
    // Renumber the whole list first, so entries with the same number can't get stuck.
    const order = sets.map((s) => s.id);
    [order[i], order[i + by]] = [order[i + by], order[i]];
    for (const [n, id] of order.entries()) {
      const s = sets.find((x) => x.id === id);
      if (s.order !== n + 1) await update('gymSets', id, { order: n + 1 });
    }
    await reload();
    setsBox.querySelector(`[data-set="${(by < 0 ? a : b).id}"] .${by < 0 ? 'gym-up' : 'gym-down'}`)?.focus();
  }

  function drawSets() {
    const sets = d.setsOf(session.id);
    if (!sets.length) {
      setsBox.replaceChildren(emptyState({ emoji: '💪', title: 'No exercises yet', text: 'Tap "+ Add exercise" to log what you did.' }));
      return;
    }
    setsBox.replaceChildren(list(sets.map((s, i) => {
      const kind = d.kindOf(s.exerciseId);
      const name = d.exerciseName(s.exerciseId);
      if (s.id === editingSetId) {
        const form = exerciseForm(s, {
          submitLabel: 'Save',
          onCancel: () => { editingSetId = null; drawSets(); },
          onSaved: async ({ exerciseId, kind: k, numbers, name: n }) => {
            await update('gymSets', s.id, { exerciseId, ...numbers, ...(k !== kind ? OTHER[k] : {}) });
            editingSetId = null;
            await reload();
            if (!cheerIfRecord(s.id, n, k)) toast({ message: 'Exercise updated ✨' });
          },
        });
        form.append(button({ label: 'Delete exercise', icon: 'trash', variant: 'danger', block: true, onClick: () => deleteSet(s) }));
        queueMicrotask(() => form.focusFirst());
        return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
      }
      const up = button({ label: '↑', variant: 'ghost', ariaLabel: `Move ${name} up`, disabled: i === 0, onClick: () => moveSet(sets, i, -1) });
      const down = button({ label: '↓', variant: 'ghost', ariaLabel: `Move ${name} down`, disabled: i === sets.length - 1, onClick: () => moveSet(sets, i, 1) });
      up.classList.add('menu-arrow', 'gym-up');
      down.classList.add('menu-arrow', 'gym-down');
      const record = d.records.has(s.id);
      const row = listItem({
        title: `${record ? '🏆 ' : ''}${name}`,
        subtitle: `${setText(s, kind)}${record ? ' · New record!' : ''}`,
        onClick: () => { editingSetId = s.id; drawSets(); },
        actions: [up, down],
      });
      row.dataset.set = s.id;
      return row;
    })));
  }

  // ---- save as routine (GYM-5) ----
  function drawRoutine() {
    const sets = d.setsOf(session.id);
    if (!sets.length) { routineBox.replaceChildren(); return; }
    if (!savingRoutine) {
      routineBox.replaceChildren(button({ label: '📝 Save as routine', variant: 'secondary', block: true, onClick: () => { savingRoutine = true; drawRoutine(); } }));
      return;
    }
    let suggested = d.typeName(session.typeId);
    for (let n = 2; d.routines.some((r) => r.name.toLowerCase() === suggested.toLowerCase()); n++) suggested = `${d.typeName(session.typeId)} ${n}`;
    const name = input({ label: 'Routine name', type: 'text', value: suggested, placeholder: 'e.g. Leg day' });
    name.input.addEventListener('input', () => name.setError(''));
    const form = el('form', { className: 'stack', novalidate: true }, [
      el('p', { className: 'muted', text: `Saves these ${plural(sets.length, 'exercise')} with their numbers, so you can start them again in one tap.` }),
      name,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { savingRoutine = false; drawRoutine(); } }),
        button({ label: 'Save routine', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = tidy(name.input.value);
      let error = '';
      if (!text) error = 'Type a name, e.g. Leg day';
      else if (text.length > MAX_NAME) error = `Keep the name to ${MAX_NAME} letters or fewer.`;
      else if (d.routines.some((r) => r.name.toLowerCase() === text.toLowerCase())) error = 'You already have a routine with this name.';
      name.setError(error);
      if (error) return;
      const items = sets.map((s) => ({
        exerciseId: s.exerciseId,
        sets: s.sets ?? null, reps: s.reps ?? null, weightKg: s.weightKg ?? null,
        durationMin: s.durationMin ?? null, distanceKm: s.distanceKm ?? null,
      }));
      await add('gymRoutines', { name: text, typeId: session.typeId, items });
      savingRoutine = false;
      toast({ message: `Saved routine “${text}” 📝 Start it from 🏋️ Gym log.` });
      await reload();
    });
    routineBox.replaceChildren(card({ title: 'Save as routine', module: 'gym', children: [form] }));
    queueMicrotask(() => name.input.select());
  }

  function draw() {
    drawDetails();
    drawSets();
    drawAdd();
    drawRoutine();
  }

  page.append(
    back,
    detailsBox,
    card({ title: '💪 Exercises', children: [el('div', { className: 'stack' }, [setsBox, addBox])] }),
    routineBox,
  );
  draw();
  // A new workout opens straight on "Add exercise".
  if (!d.setsOf(session.id).length) { adding = true; drawAdd(); }
}
