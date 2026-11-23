// ⚖️ weight module screens.
// WGT-1: log today's weight (one per day; saving again replaces it), list of entries, edit/delete with Undo.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll, listByDate } from '../core/storage.js';
import { today, formatDate } from '../core/dates.js';
import { formatKg } from '../core/format.js';

const MIN_KG = 20;
const MAX_KG = 300;

// Reads a typed weight. Gives back { kg } rounded to 1 decimal, or { error }.
function parseKg(text) {
  const clean = String(text).trim().replace(',', '.');
  const kg = Number(clean);
  if (!clean || !Number.isFinite(kg)) return { error: 'Type your weight in kg, e.g. 72.4' };
  if (kg < MIN_KG || kg > MAX_KG) return { error: `Please enter a weight between ${MIN_KG} and ${MAX_KG} kg.` };
  return { kg: Math.round(kg * 10) / 10 };
}

function weightField(value = '') {
  return input({
    label: "Today's weight (kg)",
    name: 'weightKg',
    type: 'number',
    inputmode: 'decimal',
    min: MIN_KG,
    max: MAX_KG,
    step: 0.1,
    value,
    placeholder: 'e.g. 72.4',
  });
}

export async function render(root) {
  const listBox = el('div');
  let editingId = null; // the entry whose row is open for editing

  // Today's log form
  const todayField = weightField();
  const saveBtn = button({ label: 'Save', icon: 'plus', variant: 'primary', type: 'submit', block: true });
  const todayNote = el('p', { className: 'progress-note' });
  const form = el('form', { className: 'stack', novalidate: true }, [todayField, saveBtn, todayNote]);
  todayField.input.addEventListener('input', () => todayField.setError(''));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { kg, error } = parseKg(todayField.input.value);
    if (error) {
      todayField.setError(error);
      return;
    }
    todayField.setError('');
    const [existing] = await listByDate('weight', today());
    if (existing) await update('weight', existing.id, { weightKg: kg });
    else await add('weight', { date: today(), weightKg: kg });
    await refresh();
  });

  function showToday(entry) {
    todayField.input.value = entry ? String(entry.weightKg) : '';
    saveBtn.querySelector('span:last-child').textContent = entry ? 'Update' : 'Save';
    todayNote.textContent = entry
      ? `Saved for today: ${formatKg(entry.weightKg)} ✨ Saving again replaces it.`
      : 'One weight per day. Weighing at the same time each day works best.';
  }

  // A row opened for editing: weight box with Save and Cancel.
  function editRow(entry) {
    const field = weightField(String(entry.weightKg));
    field.querySelector('label').textContent = `Weight on ${formatDate(entry.date)} (kg)`;
    field.input.addEventListener('input', () => field.setError(''));
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      field,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { kg, error } = parseKg(field.input.value);
      if (error) {
        field.setError(error);
        return;
      }
      await update('weight', entry.id, { weightKg: kg });
      editingId = null;
      await refresh();
    });
    const row = el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
    queueMicrotask(() => field.input.focus());
    return row;
  }

  async function refresh() {
    const entries = await listAll('weight');
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    showToday(entries.find((entry) => entry.date === today()));
    if (!entries.length) {
      listBox.replaceChildren(emptyState({
        emoji: '⚖️',
        title: 'No weights yet',
        text: "Type today's weight above to start.",
      }));
      return;
    }
    listBox.replaceChildren(list(entries.map((entry) => (entry.id === editingId ? editRow(entry) : listItem({
      title: formatKg(entry.weightKg),
      subtitle: entry.date === today() ? `Today · ${formatDate(entry.date)}` : formatDate(entry.date),
      actions: [
        button({
          icon: 'edit',
          variant: 'ghost',
          ariaLabel: `Edit ${formatKg(entry.weightKg)} on ${formatDate(entry.date)}`,
          onClick: () => { editingId = entry.id; refresh(); },
        }),
        button({
          icon: 'trash',
          variant: 'ghost',
          ariaLabel: `Delete ${formatKg(entry.weightKg)} on ${formatDate(entry.date)}`,
          onClick: () => deleteEntry(entry),
        }),
      ],
    })))));
  }

  async function deleteEntry(entry) {
    const removed = await remove('weight', entry.id);
    if (editingId === entry.id) editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted ${formatKg(removed.weightKg)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        // One per day: if that day got a new weight meanwhile, keep the new one.
        const [sameDay] = await listByDate('weight', removed.date);
        if (sameDay) {
          toast({ message: `${formatDate(removed.date)} already has a new weight` });
          return;
        }
        await restore('weight', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  root.append(el('div', { className: 'mod-weight stack' }, [
    card({ title: 'Log weight', module: 'weight', children: [form] }),
    card({ title: 'Entries', children: [listBox] }),
  ]));

  await refresh();
}
