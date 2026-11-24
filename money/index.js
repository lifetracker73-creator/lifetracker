// 💸 money module screens.
// MON-1: add an expense (amount first), list grouped by day with each day's total, edit/delete with Undo.
// MON-2: Categories card: add, edit (name + emoji icon), delete with Undo.
// MON-3: This month card: month total, per-category totals, compare to last month (◀ ▶ to look back).
// MON-4: Charts card: spend by category for the month shown above, and spend over time
//        (each day of that month, or the 12 months up to it).
// MON-5: Budgets card: a monthly budget per category (same every month) with "spent / left" bars.
// MON-6: Export card: the month chosen above, or any dates picked, as an Excel file (a colourful Summary tab + all Expenses).
// The 8 starter categories are saved once, the first time this screen opens (MON-2 lets you edit them).
// Each expense keeps its category's ID in `category`, so renaming a category never breaks old expenses.
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import {
  add, update, remove, restore, list as listAll, getSettings, saveSettings,
} from '../core/storage.js';
import {
  today, formatDate, formatMonth, addDays, monthStart, monthEnd, dateRange, daysBetween,
} from '../core/dates.js';
import { formatMoney, parseMoney } from '../core/format.js';
import { barChart } from '../core/charts.js';
import { makeXlsx, saveFile } from '../core/xlsx.js';
import { buddyMood } from '../core/buddy.js';

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

// ---- Export (MON-6): one month as an Excel file, made to be understood at a glance ----
// Summary tab: big total, compare to last month, daily average, biggest expense, then coloured
// tables with text bars (█) for categories, budgets and payment methods. Expenses tab: every expense.
const BAR_WIDTH = 16;
const textBar = (part, whole) => {
  if (!whole || part <= 0) return '';
  return '█'.repeat(Math.max(1, Math.round(Math.min(part / whole, 1) * BAR_WIDTH)));
};

// Works for a whole month or any custom dates. `title` e.g. "Nov 2026" or "1 Nov 2026 – 15 Nov 2026";
// `prevItems` / `prevLabel` = the period just before, of the same length, to compare with.
// Budgets are monthly, so they're only shown for a whole month (`budgets: true`).
// Ranges longer than one month also get a "Month by month" table.
function expensesWorkbook({ title, from, to, items, prevItems, prevLabel, categories, catText, budgets }) {
  const lastItems = prevItems;
  const lastMonth = prevLabel;
  const rupees = (paise) => paise / 100;
  const sum = (list) => list.reduce((s, x) => s + x.amountPaise, 0);
  const total = sum(items);
  const lastTotal = sum(lastItems);

  // Styles (colours come from core/styles.css via the PALETTE in core/xlsx.js)
  const S = {
    title: { bold: true, size: 18, fill: 'money' },
    sub: { italic: true, size: 10, color: 'muted' },
    label: { bold: true, color: 'muted' },
    big: { bold: true, size: 16, num: 'money', align: 'left' },
    text: { align: 'left' },
    money: { num: 'money' },
    moneyBold: { num: 'money', bold: true },
    pct: { num: 'percent', align: 'right' },
    int: { num: 'int', align: 'center' },
    good: { bold: true, color: 'success', align: 'left' },
    bad: { bold: true, color: 'error', align: 'left' },
    muted: { italic: true, color: 'muted', align: 'left' },
    section: { bold: true, size: 13, fill: 'money' },
    head: { bold: true, fill: 'lilac' },
    headRight: { bold: true, fill: 'lilac', align: 'right' },
    headCenter: { bold: true, fill: 'lilac', align: 'center' },
    bar: { color: 'warning' },
    barGood: { color: 'success' },
    barBad: { color: 'error' },
    totalLabel: { bold: true, fill: 'cream' },
    totalMoney: { bold: true, fill: 'cream', num: 'money' },
    totalPct: { bold: true, fill: 'cream', num: 'percent', align: 'right' },
    totalInt: { bold: true, fill: 'cream', num: 'int', align: 'center' },
    totalBlank: { fill: 'cream' },
    date: { num: 'date', align: 'left' },
  };
  const c = (v, s) => ({ v, s });

  const rows = [];
  const merges = [];
  const heights = {};
  const wide = (text, style) => { // a label in A and a value across B:E
    rows.push([c(text, S.label), style]);
    merges.push(`B${rows.length}:E${rows.length}`);
  };
  const section = (text) => {
    rows.push([]);
    rows.push([c(text, S.section), c('', S.section), c('', S.section), c('', S.section), c('', S.section)]);
    merges.push(`A${rows.length}:E${rows.length}`);
    heights[rows.length - 1] = 24;
  };

  rows.push([c(`💸 Spending · ${title}`, S.title), c('', S.title), c('', S.title), c('', S.title), c('', S.title)]);
  merges.push('A1:E1');
  heights[0] = 34;
  rows.push([c(`From Lifetracker · made ${formatDate(today())}`, S.sub)]);
  merges.push('A2:E2');
  rows.push([]);

  // Key numbers
  wide('Total spent', c(rupees(total), S.big));
  heights[rows.length - 1] = 26;
  wide('Expenses', c(countText(items.length), S.text));
  const diff = total - lastTotal;
  wide(lastMonth.length > 14 ? 'Compared with before' : `Compared with ${lastMonth}`, !lastItems.length
    ? c(`No expenses in ${lastMonth} to compare`, S.muted)
    : diff === 0 ? c('➖ The same', S.text)
      : diff < 0 ? c(`📉 ${formatMoney(-diff)} less (${lastMonth}: ${formatMoney(lastTotal)})`, S.good)
        : c(`📈 ${formatMoney(diff)} more (${lastMonth}: ${formatMoney(lastTotal)})`, S.bad));
  const days = daysBetween(from, to < today() ? to : today()) + 1;
  wide('Daily average', c(rupees(Math.round(total / days)), { ...S.money, align: 'left' }));
  const biggest = [...items].sort((a, b) => b.amountPaise - a.amountPaise)[0];
  wide('Biggest expense', c([formatMoney(biggest.amountPaise), catText(biggest.category),
    formatDate(biggest.date), biggest.note].filter(Boolean).join(' · '), S.text));

  // Per category, biggest first
  const byCat = new Map();
  for (const x of items) {
    const g = byCat.get(x.category) || { paise: 0, count: 0 };
    g.paise += x.amountPaise;
    g.count += 1;
    byCat.set(x.category, g);
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1].paise - a[1].paise);
  const [topId, top] = catRows[0];
  wide('Top category', c(`${catText(topId)} · ${Math.round((top.paise / total) * 100)}% of spending`, S.text));

  const spentBy = new Map(catRows.map(([id, g]) => [id, g.paise]));
  const budgeted = budgets ? categories.filter((cat) => cat.monthlyBudgetPaise) : [];
  if (budgeted.length) {
    const budget = budgeted.reduce((s, cat) => s + cat.monthlyBudgetPaise, 0);
    const spent = budgeted.reduce((s, cat) => s + (spentBy.get(cat.id) || 0), 0);
    wide('Budgets', spent <= budget
      ? c(`✅ ${formatMoney(budget - spent)} left of ${formatMoney(budget)}`, S.good)
      : c(`⚠️ ${formatMoney(spent - budget)} over ${formatMoney(budget)}`, S.bad));
  }

  section('🏷️ Where the money went');
  rows.push([c('Category', S.head), c('Amount', S.headRight), c('Share', S.headRight), c('Count', S.headCenter), c('', S.head)]);
  for (const [id, g] of catRows) {
    rows.push([c(catText(id), S.text), c(rupees(g.paise), S.money), c(g.paise / total, S.pct),
      c(g.count, S.int), c(textBar(g.paise, top.paise), S.bar)]);
  }
  rows.push([c('Total', S.totalLabel), c(rupees(total), S.totalMoney), c(1, S.totalPct),
    c(items.length, S.totalInt), c('', S.totalBlank)]);

  // Month by month (only when the dates cover more than one month)
  const months = [];
  for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = nextMonth(ym)) months.push(ym);
  if (months.length > 1) {
    section('📅 Month by month');
    rows.push([c('Month', S.head), c('Amount', S.headRight), c('Share', S.headRight), c('Count', S.headCenter), c('', S.head)]);
    const perMonth = months.map((ym) => {
      const list = items.filter((x) => x.date.slice(0, 7) === ym);
      return { ym, paise: sum(list), count: list.length };
    });
    const most = Math.max(...perMonth.map((m) => m.paise));
    for (const m of perMonth) {
      rows.push([c(formatMonth(m.ym), S.text), c(rupees(m.paise), S.money), c(m.paise / total, S.pct),
        c(m.count, S.int), c(textBar(m.paise, most), S.bar)]);
    }
  }

  if (budgeted.length) {
    section('🎯 Budgets');
    rows.push([c('Category', S.head), c('Budget', S.headRight), c('Spent', S.headRight), c('Used', S.headRight), c('Left', S.head)]);
    for (const cat of budgeted) {
      const spent = spentBy.get(cat.id) || 0;
      const left = cat.monthlyBudgetPaise - spent;
      const used = spent / cat.monthlyBudgetPaise;
      const bar = '█'.repeat(Math.round(Math.min(used, 1) * 10)).padEnd(10, '░');
      rows.push([
        c(`${cat.icon} ${cat.name}`, S.text), c(rupees(cat.monthlyBudgetPaise), S.money), c(rupees(spent), S.money),
        c(used, S.pct),
        left >= 0 ? c(`${bar} ${formatMoney(left)} left`, S.barGood) : c(`${bar} ⚠️ ${formatMoney(-left)} over`, S.barBad),
      ]);
    }
  }

  section('💳 How you paid');
  rows.push([c('Paid by', S.head), c('Amount', S.headRight), c('Share', S.headRight), c('Count', S.headCenter), c('', S.head)]);
  const byMethod = new Map();
  for (const x of items) {
    const g = byMethod.get(x.paymentMethod) || { paise: 0, count: 0 };
    g.paise += x.amountPaise;
    g.count += 1;
    byMethod.set(x.paymentMethod, g);
  }
  const methodRows = [...byMethod.entries()].sort((a, b) => b[1].paise - a[1].paise);
  for (const [m, g] of methodRows) {
    rows.push([c(methodLabel(m), S.text), c(rupees(g.paise), S.money), c(g.paise / total, S.pct),
      c(g.count, S.int), c(textBar(g.paise, methodRows[0][1].paise), S.bar)]);
  }

  // Every expense, oldest first, with filter buttons on the header row.
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const expenseRows = [
    [c('Date', S.head), c('Amount', S.headRight), c('Category', S.head), c('Paid by', S.head), c('Note', S.head)],
    ...sorted.map((x) => [c(x.date, S.date), c(rupees(x.amountPaise), S.money), c(catText(x.category), S.text),
      c(methodLabel(x.paymentMethod), S.text), c(x.note || '', S.text)]),
    [c('Total', S.totalLabel), c(rupees(total), S.totalMoney), c(countText(items.length), S.totalLabel),
      c('', S.totalBlank), c('', S.totalBlank)],
  ];

  return makeXlsx([
    { name: 'Summary', cols: [26, 15, 10, 10, 34], rows, merges, heights, gridLines: false },
    {
      name: 'Expenses', cols: [14, 14, 22, 10, 36], rows: expenseRows, frozenRows: 1,
      filter: `A1:E${sorted.length + 1}`,
    },
  ]);
}

export async function render(root, { path = [] } = {}) {
  // REFINE-5: 🤝 Split bills ("#/money/split…") and 📒 Lent & borrowed ("#/money/lent") are their own pages.
  if (path[0] === 'split') return (await import('./split.js')).render(root, path.slice(1));
  if (path[0] === 'lent') return (await import('./lent.js')).render(root);

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
    await refreshCharts(all);
    refreshBudgets(items);
    refreshExport(items, lastItems);
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

  // ---- Budgets (MON-5): the same budget every month, compared with the month chosen above ----
  // The budget lives on the category (`monthlyBudgetPaise`, null = no budget). Tap a row to set or change it.
  const budgetSummary = el('div');
  const budgetListBox = el('div');
  let editingBudgetId = null;
  let budgetItems = [];

  async function saveBudget(cat, paise) {
    await update('categories', cat.id, { monthlyBudgetPaise: paise });
    editingBudgetId = null;
    await categoriesChanged();
  }

  function budgetEditRow(cat) {
    const box = input({
      label: `Monthly budget for ${cat.icon} ${cat.name} (₹)`, name: 'budget', type: 'text', inputmode: 'decimal',
      value: cat.monthlyBudgetPaise ? amountText(cat.monthlyBudgetPaise) : '', placeholder: 'e.g. 5000',
    });
    box.input.addEventListener('input', () => box.setError(''));
    const buttons = [
      button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingBudgetId = null; refreshBudgets(); } }),
      button({ label: 'Save', variant: 'primary', type: 'submit' }),
    ];
    const editForm = el('form', { className: 'stack', novalidate: true }, [box, el('div', { className: 'btn-row' }, buttons)]);
    if (cat.monthlyBudgetPaise) {
      editForm.append(button({
        label: 'Remove budget', variant: 'ghost', block: true,
        onClick: async () => {
          const before = cat.monthlyBudgetPaise;
          await saveBudget(cat, null);
          toast({
            message: `Removed the budget for ${cat.icon} ${cat.name}`,
            actionLabel: 'Undo',
            onAction: async () => {
              await update('categories', cat.id, { monthlyBudgetPaise: before });
              await categoriesChanged();
            },
          });
        },
      }));
    }
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      // An empty box means "no budget".
      if (!box.input.value.trim()) {
        await saveBudget(cat, null);
        return;
      }
      const { paise, error } = checkAmount(box.input.value);
      if (error) {
        box.setError(error.replace('Type the amount, e.g. 250', 'Type a budget, e.g. 5000'));
        return;
      }
      await saveBudget(cat, paise);
      toast({ message: `Budget for ${cat.icon} ${cat.name}: ${formatMoney(paise)} a month ✨` });
    });
    queueMicrotask(() => box.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
  }

  function budgetRow(cat, spent) {
    if (cat.id === editingBudgetId) return budgetEditRow(cat);
    const budget = cat.monthlyBudgetPaise;
    const open = () => { editingBudgetId = cat.id; refreshBudgets(); };
    if (!budget) {
      return listItem({
        title: `${cat.icon} ${cat.name}`,
        subtitle: `No budget · tap to set one${spent ? ` · ${formatMoney(spent)} spent` : ''}`,
        onClick: open,
      });
    }
    const left = budget - spent;
    const row = listItem({
      title: `${cat.icon} ${cat.name}`,
      subtitle: left >= 0
        ? `${formatMoney(spent)} spent of ${formatMoney(budget)} · ${formatMoney(left)} left`
        : `${formatMoney(spent)} spent of ${formatMoney(budget)} · ⚠️ ${formatMoney(-left)} over budget`,
      onClick: open,
      actions: [button({ icon: 'edit', variant: 'ghost', ariaLabel: `Change the budget for ${cat.name}`, onClick: open })],
    });
    const bar = progressBar({ value: spent, max: budget, label: `${cat.name}: spent of budget` });
    bar.classList.toggle('progress--over', left < 0);
    row.querySelector('.list-item__main').append(bar);
    return row;
  }

  // `items` = this month's expenses (kept so tapping a row can redraw without reloading).
  function refreshBudgets(items = budgetItems) {
    budgetItems = items;
    const month = formatMonth(shownMonth);
    if (!categories.length) {
      budgetSummary.replaceChildren();
      budgetListBox.replaceChildren(emptyState({
        emoji: '🎯', title: 'No categories yet', text: 'Add a category below, then give it a budget here.',
      }));
      return;
    }
    const spentBy = new Map();
    for (const x of items) spentBy.set(x.category, (spentBy.get(x.category) || 0) + x.amountPaise);
    const budgeted = categories.filter((c) => c.monthlyBudgetPaise);
    // 🍄 This month only: happy inside every budget, worried when one goes over (REFINE-3).
    if (shownMonth === today().slice(0, 7)) {
      const over = budgeted.filter((c) => (spentBy.get(c.id) || 0) > c.monthlyBudgetPaise);
      if (!budgeted.length) buddyMood('calm', '{name} is keeping an eye on the coins 💸');
      else if (over.length) buddyMood('worried', `Uh-oh, ${over[0].icon} ${over[0].name} is over budget. {name} is a bit worried 😟`);
      else buddyMood('happy', 'Inside every budget! {name} is happy 💰');
    }
    if (budgeted.length) {
      const total = budgeted.reduce((s, c) => s + c.monthlyBudgetPaise, 0);
      const spent = budgeted.reduce((s, c) => s + (spentBy.get(c.id) || 0), 0);
      const left = total - spent;
      const bar = progressBar({ value: spent, max: total, label: `All budgets in ${month}` });
      bar.classList.toggle('progress--over', left < 0);
      budgetSummary.replaceChildren(
        el('div', { className: 'progress-stats__amount', text: left >= 0 ? `${formatMoney(left)} left` : `${formatMoney(-left)} over` }),
        el('p', { className: 'progress-note', text: `${formatMoney(spent)} spent of ${formatMoney(total)} budget in ${month}` }),
        el('div', { className: 'progress-note' }, [bar]),
      );
    } else {
      budgetSummary.replaceChildren(el('p', { className: 'progress-note', text: 'Tap a category to give it a monthly budget. 🎯' }));
    }
    // Categories with a budget first, then the rest, each in the usual order.
    const rows = [...budgeted, ...categories.filter((c) => !c.monthlyBudgetPaise)];
    budgetListBox.replaceChildren(list(rows.map((c) => budgetRow(c, spentBy.get(c.id) || 0))));
  }

  // ---- Export (MON-6): the month chosen in "This month", or any dates I pick, as an Excel file ----
  const exportBox = el('div', { className: 'stack' });
  let exportMode = 'month';
  const download = (workbook, fileName) => {
    saveFile(workbook, fileName);
    toast({ message: `Saved ${fileName} to Downloads ✨` });
  };
  const modeButtons = [['month', 'Month'], ['custom', 'Pick dates']].map(([mode, label]) => {
    const btn = button({
      label,
      variant: mode === exportMode ? 'primary' : 'secondary',
      onClick: () => {
        exportMode = mode;
        modeButtons.forEach((b) => {
          const on = b.dataset.mode === mode;
          b.classList.toggle('btn--primary', on);
          b.classList.toggle('btn--secondary', !on);
          b.setAttribute('aria-pressed', String(on));
        });
        monthExport.hidden = mode !== 'month';
        customExport.hidden = mode !== 'custom';
      },
    });
    btn.dataset.mode = mode;
    btn.setAttribute('aria-pressed', String(mode === exportMode));
    return btn;
  });
  const monthExport = el('div');
  function refreshExport(items, lastItems) {
    const ym = shownMonth;
    const month = formatMonth(ym);
    const btn = button({
      label: `⬇️ Download ${month} (Excel)`,
      variant: 'primary',
      block: true,
      onClick: () => download(expensesWorkbook({
        title: month, from: `${ym}-01`, to: monthEnd(`${ym}-01`), items, prevItems: lastItems,
        prevLabel: formatMonth(prevMonth(ym)), categories, catText, budgets: true,
      }), `lifetracker-expenses-${ym}.xlsx`),
    });
    btn.disabled = !items.length;
    monthExport.replaceChildren(el('div', { className: 'stack' }, [
      el('p', {
        className: 'progress-note',
        text: items.length
          ? `A colourful summary of ${month} first, then every expense. Opens in Excel or Google Sheets.`
          : `No expenses in ${month} to export.`,
      }),
      btn,
    ]));
  }

  // Custom dates: From and To (this month so far to start with), compared with the same number of days before.
  const fromBox = input({ label: 'From', name: 'exportFrom', type: 'date', value: monthStart(today()), max: today() });
  const toBox = input({ label: 'To', name: 'exportTo', type: 'date', value: today(), max: today() });
  [fromBox, toBox].forEach((b) => b.input.addEventListener('input', () => { fromBox.setError(''); toBox.setError(''); }));
  const customForm = el('form', { className: 'stack', novalidate: true }, [
    el('p', { className: 'progress-note', text: 'Pick any dates. Compared with the same number of days just before.' }),
    fromBox,
    toBox,
    button({ label: '⬇️ Download (Excel)', variant: 'primary', type: 'submit', block: true }),
  ]);
  const customExport = el('div', { hidden: true }, [customForm]);
  customForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const from = fromBox.input.value;
    const to = toBox.input.value;
    const fromError = checkDate(from);
    const toError = checkDate(to) || (!fromError && to < from ? 'The "To" date must be on or after "From".' : '');
    fromBox.setError(fromError);
    toBox.setError(toError);
    if (fromError || toError) return;
    const all = await listAll('expenses');
    const between = (a, b) => all.filter((x) => x.date >= a && x.date <= b);
    const items = between(from, to);
    if (!items.length) {
      toBox.setError(`No expenses from ${formatDate(from)} to ${formatDate(to)}.`);
      return;
    }
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(from, -(daysBetween(from, to) + 1));
    const range = (a, b) => (a === b ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`);
    download(expensesWorkbook({
      title: range(from, to), from, to, items, prevItems: between(prevFrom, prevTo),
      prevLabel: range(prevFrom, prevTo), categories, catText, budgets: false,
    }), `lifetracker-expenses-${from}-to-${to}.xlsx`);
  });
  exportBox.append(
    el('div', { className: 'btn-row', role: 'group', 'aria-label': 'What to export' }, modeButtons),
    monthExport,
    customExport,
  );

  // ---- Charts (MON-4): follow the month chosen in "This month" ----
  const catTitle = el('span');
  const catChartBox = el('div');
  const catEmpty = el('p', { className: 'progress-note' });
  let catChart = null;
  let timeView = 'days';
  let timeChart = null;
  const timeChartBox = el('div');
  const timeNote = el('p', { className: 'progress-note' });
  const viewButtons = [['days', 'Days'], ['months', 'Months']].map(([view, label]) => {
    const btn = button({
      label,
      variant: view === timeView ? 'primary' : 'secondary',
      onClick: async () => {
        timeView = view;
        viewButtons.forEach((b) => {
          const on = b.dataset.view === view;
          b.classList.toggle('btn--primary', on);
          b.classList.toggle('btn--secondary', !on);
          b.setAttribute('aria-pressed', String(on));
        });
        await refreshCharts();
      },
    });
    btn.dataset.view = view;
    btn.setAttribute('aria-pressed', String(view === timeView));
    return btn;
  });

  // Draws a chart the first time, then only updates it (the promise is kept so quick taps never draw two).
  async function drawChart(current, box, config) {
    if (current) {
      (await current).update(config);
      return current;
    }
    const made = barChart(box, { module: 'money', format: (v) => formatMoney(v), ...config });
    await made;
    return made;
  }

  async function refreshCharts(all) {
    if (!catChartBox.isConnected) return;
    const expenses = all || await listAll('expenses');
    const sumOf = (from, to) => expenses
      .filter((x) => x.date >= from && x.date <= to)
      .reduce((s, x) => s + x.amountPaise, 0);
    const start = monthStart(`${shownMonth}-01`);
    const end = monthEnd(`${shownMonth}-01`);

    // By category: one sideways bar each, biggest first.
    catTitle.textContent = `By category · ${formatMonth(shownMonth)}`;
    const byCat = new Map();
    for (const x of expenses) {
      if (x.date < start || x.date > end) continue;
      byCat.set(x.category, (byCat.get(x.category) || 0) + x.amountPaise);
    }
    const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    catEmpty.hidden = rows.length > 0;
    catChartBox.hidden = !rows.length;
    catEmpty.textContent = `No expenses in ${formatMonth(shownMonth)} to show yet.`;
    if (rows.length) {
      catChart = await drawChart(catChart, catChartBox, {
        horizontal: true,
        labels: rows.map(([id]) => catText(id)),
        values: rows.map(([, paise]) => paise),
        height: 60 + rows.length * 36,
      });
    }

    // Over time: each day of the month (up to today), or the 12 months ending with it.
    let labels;
    let values;
    if (timeView === 'days') {
      labels = dateRange(start, end < today() ? end : today());
      const perDay = new Map();
      for (const x of expenses) perDay.set(x.date, (perDay.get(x.date) || 0) + x.amountPaise);
      values = labels.map((d) => perDay.get(d) || 0);
      timeNote.textContent = `Each day of ${formatMonth(shownMonth)}. Tap a bar to see its total.`;
    } else {
      labels = [shownMonth];
      while (labels.length < 12) labels.unshift(prevMonth(labels[0]));
      values = labels.map((ym) => sumOf(monthStart(`${ym}-01`), monthEnd(`${ym}-01`)));
      timeNote.textContent = `12 months up to ${formatMonth(shownMonth)}. Tap a bar to see its total.`;
    }
    timeChart = await drawChart(timeChart, timeChartBox, { labels, values });
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
    card({ title: 'Budgets', module: 'money', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'progress-note', text: 'The same budget every month. Follows the month chosen above.' }),
      budgetSummary,
      budgetListBox,
    ])] }),
    card({ title: 'Charts', module: 'money', children: [el('div', { className: 'stack' }, [
      el('h3', { className: 'list-group__title' }, [catTitle]),
      catChartBox,
      catEmpty,
      el('h3', { className: 'list-group__title' }, [el('span', { text: 'Over time' })]),
      el('div', { className: 'btn-row', role: 'group', 'aria-label': 'Show spending by' }, viewButtons),
      timeChartBox,
      timeNote,
    ])] }),
    card({ title: 'Export', module: 'money', children: [exportBox] }),
    card({ title: 'Expenses', children: [listBox] }),
    card({ title: 'Categories', module: 'money', children: [catForm, catListBox] }),
    // REFINE-5: just two buttons; everything about them shows only on their own pages.
    card({ title: 'More money tools', module: 'money', children: [el('div', { className: 'stack money-tools' }, [
      el('a', { className: 'btn btn--secondary btn--block', href: '#/money/split' }, [el('span', { text: '🤝 Split bills' })]),
      el('a', { className: 'btn btn--secondary btn--block', href: '#/money/lent' }, [el('span', { text: '📒 Lent & borrowed' })]),
    ])] }),
  ]));

  await refreshAll();
}
