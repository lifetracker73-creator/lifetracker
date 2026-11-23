// 💸 money module screens.
// MON-1: add an expense (amount first), list grouped by day with each day's total, edit/delete with Undo.
// The 8 starter categories are saved once, the first time this screen opens (MON-2 lets you edit them).
// Each expense keeps its category's ID in `category`, so renaming a category never breaks old expenses.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import {
  add, update, remove, restore, list as listAll, getSettings, saveSettings,
} from '../core/storage.js';
import { today, formatDate } from '../core/dates.js';
import { formatMoney, parseMoney } from '../core/format.js';

const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: '🍔' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Transport', icon: '🚌' },
  { name: 'Bills', icon: '🧾' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Health', icon: '💊' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Other', icon: '📦' },
];
const METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];
const MAX_PAISE = 1_00_00_000 * 100; // ₹1,00,00,000 — anything bigger is almost surely a typo

const methodLabel = (value) => METHODS.find((m) => m.value === value)?.label || value || '';

// Saves the starter categories once. A flag in settings stops them coming back if all are deleted later.
async function loadCategories() {
  const settings = await getSettings('money', { categoriesSeeded: false });
  let categories = await listAll('categories');
  if (!settings.categoriesSeeded && !categories.length) {
    for (const cat of DEFAULT_CATEGORIES) {
      // one at a time, so they keep this order
      await add('categories', { name: cat.name, icon: cat.icon, monthlyBudgetPaise: null });
    }
    categories = await listAll('categories');
  }
  if (!settings.categoriesSeeded) await saveSettings('money', { categoriesSeeded: true });
  const starterIndex = (c) => {
    const i = DEFAULT_CATEGORIES.findIndex((d) => d.name === c.name);
    return i === -1 ? DEFAULT_CATEGORIES.length : i;
  };
  return categories.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || starterIndex(a) - starterIndex(b));
}

// Reads a typed amount. Gives back { paise } or { error }.
function checkAmount(text) {
  if (!String(text).trim()) return { error: 'Type the amount, e.g. 250' };
  const paise = parseMoney(text);
  if (paise === null) return { error: 'Type an amount like 250 or 99.50' };
  if (paise <= 0) return { error: 'The amount must be more than ₹0.' };
  if (paise > MAX_PAISE) return { error: 'That looks too big. Please check the amount.' };
  return { paise };
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Please pick a date.';
  if (date > today()) return "The date can't be in the future.";
  return '';
}

// The amount (as typed, e.g. "99.5"), category, payment method, date and note boxes. Used to add and to edit.
function expenseFields(categories, values = {}) {
  const amount = input({
    label: 'Amount (₹)', name: 'amount', type: 'text', inputmode: 'decimal',
    value: values.amount ?? '', placeholder: 'e.g. 250',
  });
  const catOptions = categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  // An expense whose category no longer exists keeps it until another is picked.
  if (values.category && !categories.some((c) => c.id === values.category)) {
    catOptions.push({ value: values.category, label: '❓ Unknown category' });
  }
  const category = input({
    label: 'Category', name: 'category', type: 'select',
    options: catOptions, value: values.category ?? catOptions[0]?.value ?? '',
  });
  const method = input({
    label: 'Paid by', name: 'paymentMethod', type: 'select', options: METHODS, value: values.method ?? 'UPI',
  });
  const date = input({ label: 'Date', name: 'date', type: 'date', value: values.date ?? today(), max: today() });
  const note = input({
    label: 'Note (optional)', name: 'note', type: 'text', value: values.note ?? '', placeholder: 'e.g. lunch',
  });
  amount.input.addEventListener('input', () => amount.setError(''));
  date.input.addEventListener('input', () => date.setError(''));

  return {
    amount, category, method, date, note,
    // Category and payment side by side, except in a (narrower) list row being edited.
    elements: values.amount
      ? [amount, category, method, date, note]
      : [amount, el('div', { className: 'btn-row' }, [category, method]), date, note],
    // Gives back the expense to save, or null after showing what's wrong.
    read() {
      const { paise, error } = checkAmount(amount.input.value);
      amount.setError(error || '');
      const dateError = checkDate(date.input.value);
      date.setError(dateError);
      if (error || dateError) return null;
      return {
        date: date.input.value,
        amountPaise: paise,
        category: category.input.value,
        paymentMethod: method.input.value,
        note: note.input.value.trim(),
      };
    },
  };
}

// Paise -> what goes back into the amount box: 25050 -> "250.5", 25000 -> "250".
const amountText = (paise) => String(paise / 100);

export async function render(root) {
  const categories = await loadCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const catText = (id) => {
    const c = catById.get(id);
    return c ? `${c.icon} ${c.name}` : '❓ Unknown category';
  };

  const listBox = el('div', { className: 'stack' });
  let editingId = null;

  // Add form: amount first. After saving, the amount and note clear; category, payment and date stay.
  const fields = expenseFields(categories);
  const form = el('form', { className: 'stack', novalidate: true }, [
    ...fields.elements,
    button({ label: 'Save', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const expense = fields.read();
    if (!expense) return;
    await add('expenses', expense);
    fields.amount.input.value = '';
    fields.note.input.value = '';
    toast({ message: `Saved ${formatMoney(expense.amountPaise)} · ${catText(expense.category)} ✨` });
    await refresh();
    fields.amount.input.focus();
  });

  // A row opened for editing: all five boxes with Cancel and Save.
  function editRow(expense) {
    const f = expenseFields(categories, {
      amount: amountText(expense.amountPaise),
      category: expense.category,
      method: expense.paymentMethod,
      date: expense.date,
      note: expense.note || '',
    });
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      ...f.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = f.read();
      if (!changes) return;
      await update('expenses', expense.id, changes);
      editingId = null;
      await refresh();
    });
    queueMicrotask(() => f.amount.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
  }

  function expenseRow(expense) {
    if (expense.id === editingId) return editRow(expense);
    const amount = formatMoney(expense.amountPaise);
    const details = [methodLabel(expense.paymentMethod), expense.note].filter(Boolean).join(' · ');
    return listItem({
      title: catText(expense.category),
      subtitle: details,
      meta: amount,
      onClick: () => { editingId = expense.id; refresh(); },
      actions: [
        button({
          icon: 'trash',
          variant: 'ghost',
          ariaLabel: `Delete ${amount} on ${formatDate(expense.date)}`,
          onClick: () => deleteExpense(expense),
        }),
      ],
    });
  }

  async function refresh() {
    const expenses = await listAll('expenses');
    if (!expenses.length) {
      listBox.replaceChildren(emptyState({
        emoji: '💸',
        title: 'No expenses yet',
        text: 'Type an amount above to add your first one.',
      }));
      return;
    }
    // Newest day first; inside a day, the latest added first.
    expenses.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const days = [];
    for (const expense of expenses) {
      const last = days[days.length - 1];
      if (last && last.date === expense.date) last.items.push(expense);
      else days.push({ date: expense.date, items: [expense] });
    }
    listBox.replaceChildren(...days.map(({ date, items }) => {
      const total = items.reduce((sum, x) => sum + x.amountPaise, 0);
      const label = date === today() ? `Today · ${formatDate(date)}` : formatDate(date);
      return el('div', { className: 'list-group' }, [
        el('h3', { className: 'list-group__title' }, [
          el('span', { text: label }),
          el('span', { text: formatMoney(total) }),
        ]),
        list(items.map(expenseRow)),
      ]);
    }));
  }

  async function deleteExpense(expense) {
    const removed = await remove('expenses', expense.id);
    if (editingId === expense.id) editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted ${formatMoney(removed.amountPaise)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('expenses', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  root.append(el('div', { className: 'mod-money stack' }, [
    card({ title: 'Add expense', module: 'money', children: [form] }),
    card({ title: 'Expenses', children: [listBox] }),
  ]));

  await refresh();
}
