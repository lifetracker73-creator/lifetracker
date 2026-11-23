// 💸 money module screens.
// MON-1: add an expense (amount first), list grouped by day with each day's total, edit/delete with Undo.
// MON-2: Categories card: add, edit (name + emoji icon), delete with Undo.
// MON-3: This month card: month total, per-category totals, compare to last month (◀ ▶ to look back).
// The 8 starter categories are saved once, the first time this screen opens (MON-2 lets you edit them).
// Each expense keeps its category's ID in `category`, so renaming a category never breaks old expenses.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import {
  add, update, remove, restore, list as listAll, getSettings, saveSettings,
} from '../core/storage.js';
import { today, formatDate, formatMonth, addDays, monthStart, monthEnd } from '../core/dates.js';
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

// Ready-made emoji to tap when choosing a category's icon (MON-2). Any other emoji can be typed.
const EMOJI_CHOICES = [
  '🍔', '🛒', '🚌', '🧾', '🛍️', '💊', '🎬', '📦', '🏠', '⛽', '🚕', '✈️',
  '📱', '💡', '🎁', '👕', '📚', '🎓', '🐶', '💇', '☕', '🍕', '🏋️', '💰',
];
const MAX_NAME = 30;

const methodLabel = (value) => METHODS.find((m) => m.value === value)?.label || value || '';

// True if the text is exactly one emoji (e.g. "🐶", "🏋️", "🇮🇳").
function isOneEmoji(text) {
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text)) return false;
  if (typeof Intl.Segmenter !== 'function') return text.length <= 8;
  return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length === 1;
}

// The category choices for an expense's Category box.
function categoryOptions(categories, current) {
  const options = categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  // An expense whose category no longer exists keeps it until another is picked.
  if (current && !categories.some((c) => c.id === current)) {
    options.push({ value: current, label: '❓ Unknown category' });
  }
  return options;
}

// Name box plus emoji picker for a category. Used to add and to edit.
function categoryFields(values = {}) {
  const name = input({
    label: 'Name', name: 'catName', type: 'text', value: values.name ?? '', placeholder: 'e.g. Pets',
  });
  let chosen = values.icon ?? '📦';
  const own = input({
    label: 'Or type your own emoji', name: 'catEmoji', type: 'text',
    value: EMOJI_CHOICES.includes(chosen) ? '' : chosen, placeholder: 'e.g. 🦜',
  });
  const grid = el('div', { className: 'emoji-grid', role: 'group', 'aria-label': 'Choose an icon' });
  const paint = () => grid.querySelectorAll('.btn').forEach((b) => {
    const on = b.dataset.emoji === chosen && !own.input.value.trim();
    b.classList.toggle('btn--primary', on);
    b.classList.toggle('btn--secondary', !on);
    b.setAttribute('aria-pressed', String(on));
  });
  for (const emoji of EMOJI_CHOICES) {
    const b = button({
      label: emoji,
      variant: 'secondary',
      ariaLabel: `Icon ${emoji}`,
      onClick: () => { chosen = emoji; own.input.value = ''; own.setError(''); paint(); },
    });
    b.dataset.emoji = emoji;
    grid.append(b);
  }
  name.input.addEventListener('input', () => name.setError(''));
  own.input.addEventListener('input', () => { own.setError(''); paint(); });
  paint();

  return {
    name,
    elements: [name, el('div', { className: 'field' }, [
      el('div', { className: 'field__label', text: 'Icon' }), grid,
    ]), own],
    // Gives back { name, icon } to save, or null after showing what's wrong.
    // `categories` is the current list (to stop two with the same name); `ownId` is the one being edited.
    read(categories, ownId) {
      const text = name.input.value.trim().replace(/\s+/g, ' ');
      let nameError = '';
      if (!text) nameError = 'Type a name, e.g. Pets';
      else if (text.length > MAX_NAME) nameError = `Keep the name to ${MAX_NAME} letters or fewer.`;
      else if (categories.some((c) => c.id !== ownId && c.name.toLowerCase() === text.toLowerCase())) {
        nameError = 'You already have a category with this name.';
      }
      name.setError(nameError);
      const typed = own.input.value.trim();
      const emojiError = typed && !isOneEmoji(typed) ? 'Type just one emoji, e.g. 🦜' : '';
      own.setError(emojiError);
      if (nameError || emojiError) return null;
      return { name: text, icon: typed || chosen };
    },
  };
}

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
  const catOptions = categoryOptions(categories, values.category);
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
      const catError = category.input.value ? '' : 'Add a category first (see Categories below).';
      category.setError(catError);
      if (error || dateError || catError) return null;
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

// Months as 'YYYY-MM' (MON-3).
const prevMonth = (ym) => addDays(`${ym}-01`, -1).slice(0, 7);
const nextMonth = (ym) => addDays(monthEnd(`${ym}-01`), 1).slice(0, 7);
const countText = (n) => (n === 1 ? '1 expense' : `${n} expenses`);

// "📉 ₹1,200 less than Oct 2026" and friends.
function compareText(thisPaise, lastPaise, lastCount, lastYm) {
  const last = formatMonth(lastYm);
  if (!lastCount) return `No expenses in ${last} to compare with.`;
  const diff = thisPaise - lastPaise;
  if (diff === 0) return `➖ Same as ${last}`;
  return diff < 0
    ? `📉 ${formatMoney(-diff)} less than ${last}`
    : `📈 ${formatMoney(diff)} more than ${last}`;
}

export async function render(root) {
  // `categories` and `catById` are replaced whenever a category is added, changed or deleted (MON-2).
  let categories = await loadCategories();
  let catById = new Map(categories.map((c) => [c.id, c]));
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
    await refreshAll();
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
      await refreshAll();
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

  // ---- This month (MON-3): worked out on screen from saved expenses ----
  let shownMonth = today().slice(0, 7);
  const monthTitle = el('div', { className: 'month-nav__title', 'aria-live': 'polite' });
  const prevBtn = button({
    label: '◀', variant: 'secondary', ariaLabel: 'Previous month',
    onClick: () => { shownMonth = prevMonth(shownMonth); refreshMonth(); },
  });
  const nextBtn = button({
    label: '▶', variant: 'secondary', ariaLabel: 'Next month',
    onClick: () => { shownMonth = nextMonth(shownMonth); refreshMonth(); },
  });
  const monthTotal = el('div', { className: 'progress-stats__amount' });
  const monthCount = el('p', { className: 'progress-note' });
  const monthCompare = el('p', { className: 'progress-note' });
  const monthCats = el('div');

  async function refreshMonth() {
    const atNow = shownMonth >= today().slice(0, 7);
    nextBtn.disabled = atNow;
    monthTitle.textContent = formatMonth(shownMonth);
    const all = await listAll('expenses');
    const inMonth = (ym) => all.filter((x) => x.date >= monthStart(`${ym}-01`) && x.date <= monthEnd(`${ym}-01`));
    const sum = (items) => items.reduce((s, x) => s + x.amountPaise, 0);
    const items = inMonth(shownMonth);
    const lastItems = inMonth(prevMonth(shownMonth));
    const total = sum(items);
    monthTotal.textContent = formatMoney(total);
    monthCount.textContent = items.length
      ? `${countText(items.length)} in ${formatMonth(shownMonth)}`
      : `No expenses in ${formatMonth(shownMonth)}${atNow ? ' yet' : ''}`;
    monthCompare.textContent = compareText(total, sum(lastItems), lastItems.length, prevMonth(shownMonth));
    if (!items.length) {
      monthCats.replaceChildren();
      return;
    }
    const byCat = new Map();
    for (const x of items) {
      const c = byCat.get(x.category) || { paise: 0, count: 0 };
      c.paise += x.amountPaise;
      c.count += 1;
      byCat.set(x.category, c);
    }
    const rows = [...byCat.entries()].sort((a, b) => b[1].paise - a[1].paise);
    monthCats.replaceChildren(list(rows.map(([id, c]) => listItem({
      title: catText(id),
      subtitle: `${Math.round((c.paise / total) * 100)}% · ${countText(c.count)}`,
      meta: formatMoney(c.paise),
    }))));
  }

  // Everything: expenses, the month summary, then categories (their "N expenses" counts change with expenses).
  async function refreshAll() {
    await refresh();
    await refreshMonth();
    await refreshCategories();
  }

  async function deleteExpense(expense) {
    const removed = await remove('expenses', expense.id);
    if (editingId === expense.id) editingId = null;
    await refreshAll();
    if (!removed) return;
    toast({
      message: `Deleted ${formatMoney(removed.amountPaise)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('expenses', removed);
        if (listBox.isConnected) await refreshAll();
      },
    });
  }

  // ---- Categories (MON-2) ----
  const catListBox = el('div', { className: 'stack' });
  let editingCatId = null;

  // After any category change: reload them, update the Add expense choices, both lists.
  async function categoriesChanged() {
    categories = await loadCategories();
    catById = new Map(categories.map((c) => [c.id, c]));
    const select = fields.category.input;
    const current = select.value;
    const options = categoryOptions(categories, null);
    select.replaceChildren(...options.map((o) => el('option', { value: o.value, text: o.label })));
    select.value = catById.has(current) ? current : (options[0]?.value ?? '');
    fields.category.setError('');
    if (!catListBox.isConnected) return;
    await refreshAll();
  }

  // Add-category form at the top of the Categories card.
  const catFields = categoryFields();
  const catForm = el('form', { className: 'stack', novalidate: true }, [
    ...catFields.elements,
    button({ label: 'Add category', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  catForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cat = catFields.read(categories);
    if (!cat) return;
    await add('categories', { ...cat, monthlyBudgetPaise: null });
    catFields.name.input.value = '';
    toast({ message: `Added ${cat.icon} ${cat.name} ✨` });
    await categoriesChanged();
  });

  function catEditRow(cat) {
    const f = categoryFields({ name: cat.name, icon: cat.icon });
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      ...f.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingCatId = null; refreshCategories(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = f.read(categories, cat.id);
      if (!changes) return;
      await update('categories', cat.id, changes);
      editingCatId = null;
      await categoriesChanged();
    });
    queueMicrotask(() => f.name.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
  }

  function catRow(cat, count) {
    if (cat.id === editingCatId) return catEditRow(cat);
    const label = `${cat.icon} ${cat.name}`;
    return listItem({
      title: label,
      subtitle: count === 1 ? '1 expense' : `${count} expenses`,
      onClick: () => { editingCatId = cat.id; refreshCategories(); },
      actions: [
        button({
          icon: 'edit', variant: 'ghost', ariaLabel: `Edit ${cat.name}`,
          onClick: () => { editingCatId = cat.id; refreshCategories(); },
        }),
        button({
          icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${cat.name}`,
          onClick: () => deleteCategory(cat, count),
        }),
      ],
    });
  }

  async function refreshCategories() {
    if (!categories.length) {
      catListBox.replaceChildren(emptyState({
        emoji: '🏷️',
        title: 'No categories yet',
        text: 'Add one above to start sorting your spending.',
      }));
      return;
    }
    const counts = new Map();
    for (const x of await listAll('expenses')) counts.set(x.category, (counts.get(x.category) || 0) + 1);
    catListBox.replaceChildren(list(categories.map((c) => catRow(c, counts.get(c.id) || 0))));
  }

  async function deleteCategory(cat, count) {
    const removed = await remove('categories', cat.id);
    if (editingCatId === cat.id) editingCatId = null;
    await categoriesChanged();
    if (!removed) return;
    const used = count ? ` (used by ${count === 1 ? '1 expense' : `${count} expenses`})` : '';
    toast({
      message: `Deleted ${removed.icon} ${removed.name}${used}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('categories', removed);
        await categoriesChanged();
      },
    });
  }

  root.append(el('div', { className: 'mod-money stack' }, [
    card({ title: 'Add expense', module: 'money', children: [form] }),
    card({ title: 'This month', module: 'money', children: [el('div', { className: 'stack' }, [
      el('div', { className: 'month-nav' }, [prevBtn, monthTitle, nextBtn]),
      el('div', {}, [monthTotal, monthCount, monthCompare]),
      monthCats,
    ])] }),
    card({ title: 'Expenses', children: [listBox] }),
    card({ title: 'Categories', module: 'money', children: [catForm, catListBox] }),
  ]));

  await refreshAll();
}
