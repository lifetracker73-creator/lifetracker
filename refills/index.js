// 🔄 refills (Refills) module screens.
// REF-1: items (name, unit incl. my own, Money category): add / edit / delete (Undo).
// REF-2: log a refill ("#/refills/item/<id>"): date, quantity, price per unit, live total, vendor with
//        suggestions, payment method, note; refills list per item; edit / delete (Undo).
// REF-3: each refill saves one matching 💸 Money expense (source 'refill', refillId), kept in step on
//        edit / delete; a quick repair check runs every time Refills opens. "#/refills/refill/<id>"
//        opens that refill for editing (the button on a refill expense in Money).
// REF-4: per item: average days a refill lasts, cost per day, price change (with a small chart), next refill.
// REF-5: optional reminder per item, kept as a task in ✅ Tasks.
// REF-6: "Daily cost of living" card.
// The maths lives in core/refills.js (shared with Home and Money). Nothing calculated is stored.
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import { list as listAll, add, update, remove, restore } from '../core/storage.js';
import { today, formatDate, addDays, nowDateTime } from '../core/dates.js';
import { formatMoney, formatNumber, parseMoney } from '../core/format.js';
import { lineChart } from '../core/charts.js';
import { navigate } from '../core/router.js';
import { refillTotal, byDate, itemStats, dailyCost, dueText } from '../core/refills.js';

const UNITS = ['can', 'kg', 'litre', 'pack', 'month'];
const OWN_UNIT = '__own__';
const METHODS = [['UPI', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['other', 'Other']]; // same as 💸 Money
const MAX_NAME = 40;
const MAX_UNIT = 15;
const MAX_NOTE = 500;
const MAX_VENDOR = 60;
const MAX_PAISE = 10_00_000 * 100; // ₹10,00,000 per unit: anything bigger is almost surely a typo
const DEFAULT_DAYS_BEFORE = 1;

const tidy = (text) => String(text || '').trim().replace(/\s+/g, ' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (paise) => formatMoney(Math.round(paise));
const rupees = (paise) => formatMoney(Math.round(paise / 100) * 100); // whole rupees, for monthly figures
const qtyText = (q, unit) => `${formatNumber(q, 3)} ${unit}`;
const methodLabel = (v) => METHODS.find(([value]) => value === v)?.[1] || v || '';
const amountText = (paise) => (paise == null ? '' : String(paise / 100));
const newestFirst = (a, b) => byDate(b, a);

// ---------- loading ----------

async function loadAll() {
  const [items, refills, categories, expenses, tasks] = await Promise.all([
    listAll('refillItems'), listAll('refills'), listAll('categories'), listAll('expenses'), listAll('tasks'),
  ]);
  categories.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const d = { items, refills, categories, expenses, tasks };
  d.itemById = new Map(items.map((x) => [x.id, x]));
  d.catById = new Map(categories.map((c) => [c.id, c]));
  d.refillsOf = (itemId) => refills.filter((r) => r.itemId === itemId).sort(byDate);
  d.statsOf = (itemId) => itemStats(d.refillsOf(itemId));
  d.catText = (id) => {
    const c = d.catById.get(id);
    return c ? `${c.icon} ${c.name}` : '❓ No category';
  };
  d.vendors = [...new Set(refills.map((r) => tidy(r.vendor)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return d;
}

// ---------- link to Money (REF-3) ----------

// The expense a refill should have in Money.
function expenseFor(item, r) {
  return {
    date: r.date,
    amountPaise: refillTotal(r) || 0,
    category: item.categoryId || '',
    paymentMethod: r.paymentMethod || 'UPI',
    note: `🔄 Refill: ${item.name} (${qtyText(r.quantity, item.unit)})`,
    source: 'refill',
    refillId: r.id,
  };
}
const differs = (e, want) => Object.keys(want).some((k) => e[k] !== want[k]);

// Makes or updates the matching expense for one refill. Returns the expense id.
async function linkExpense(item, r, expenses) {
  const want = expenseFor(item, r);
  const e = r.expenseId ? expenses.find((x) => x.id === r.expenseId) : null;
  if (e) {
    if (differs(e, want)) await update('expenses', e.id, want);
    return e.id;
  }
  const made = await add('expenses', want);
  await update('refills', r.id, { expenseId: made.id });
  return made.id;
}

// Repair check, run every time Refills opens: makes any missing expense, fixes any that differ,
// and removes refill expenses that no refill points to (extra copies). Returns true if it changed anything.
async function repairLinks(d) {
  let changed = false;
  const claimed = new Set();
  for (const r of d.refills) {
    const item = d.itemById.get(r.itemId);
    if (!item) continue;
    const before = d.expenses.find((x) => x.id === r.expenseId);
    if (!before || differs(before, expenseFor(item, r))) changed = true;
    claimed.add(await linkExpense(item, r, d.expenses));
  }
  for (const e of d.expenses) {
    if (e.source === 'refill' && !claimed.has(e.id)) {
      await remove('expenses', e.id);
      changed = true;
    }
  }
  for (const item of d.items) if (await syncReminder(item, d)) changed = true;
  return changed;
}

// ---------- reminder task (REF-5) ----------

const reminderTitle = (item) => `🔄 Refill ${item.name}`;

/**
 * Keeps an item's reminder task in step. The task belongs to the newest refill (its taskId):
 * older refills' open tasks are ticked done; with the reminder off (or not enough data) it is removed.
 * `reopen` un-ticks the newest refill's task (after the refill logged after it was deleted).
 * Returns true if anything changed.
 */
async function syncReminder(item, d, { reopen = false } = {}) {
  const refills = d.refillsOf(item.id);
  const taskById = new Map(d.tasks.map((t) => [t.id, t]));
  let changed = false;
  const newest = refills[refills.length - 1];
  for (const r of refills) {
    if (r === newest || !r.taskId) continue;
    const t = taskById.get(r.taskId);
    if (t && !t.done) { await update('tasks', t.id, { done: true, doneAt: nowDateTime() }); changed = true; }
  }
  if (!newest) return changed;
  const task = newest.taskId ? taskById.get(newest.taskId) : null;
  const stats = itemStats(refills);
  if (!item.remind || !stats) {
    if (task && !task.done) { await remove('tasks', task.id); changed = true; }
    if (newest.taskId && (!task || !task.done)) { await update('refills', newest.id, { taskId: null }); changed = true; }
    return changed;
  }
  const days = Number.isInteger(item.remindDaysBefore) ? item.remindDaysBefore : DEFAULT_DAYS_BEFORE;
  const want = { title: reminderTitle(item), dueDate: addDays(stats.expected, -days) };
  if (!newest.taskId) {
    const t = await add('tasks', {
      ...want, notes: 'From 🔄 Refills. Logging the refill ticks this off by itself.', dueTime: null,
      priority: 'normal', repeat: 'none', reminderAt: null, done: false, doneAt: null,
    });
    await update('refills', newest.id, { taskId: t.id });
    return true;
  }
  if (!task) return changed; // removed in ✅ Tasks: leave it gone until the next refill
  const changes = {};
  if (task.title !== want.title) changes.title = want.title;
  if (task.dueDate !== want.dueDate) changes.dueDate = want.dueDate;
  if (reopen && task.done) Object.assign(changes, { done: false, doneAt: null });
  if (Object.keys(changes).length) { await update('tasks', task.id, changes); changed = true; }
  return changed;
}

// ---------- small form helpers ----------

function readNumber(field, { min, max, decimals = 0, example }) {
  const text = String(field.input.value).trim().replace(/,/g, '');
  if (text === '') return { error: `Please type a number, e.g. ${example}` };
  const v = Number(text);
  if (!Number.isFinite(v)) return { error: `Please type a number, e.g. ${example}` };
  const factor = 10 ** decimals;
  const value = Math.round(v * factor) / factor;
  if (value < min) return { error: min > 0 && value <= 0 ? 'It must be more than 0.' : `Please type at least ${min}` };
  if (value > max) return { error: `That's a lot! Please type ${max} or less` };
  return { value };
}

function choicePills(options, value, ariaLabel, onChange) {
  let current = value;
  const group = el('div', { className: 'pill-wrap', role: 'group', 'aria-label': ariaLabel });
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
  Object.defineProperty(group, 'value', { get: () => current });
  group.set(value);
  return group;
}

const field = (label, child) => el('div', { className: 'field' }, [el('div', { className: 'field__label', text: label }), child]);

// ---------- item form (REF-1) ----------

function itemFields(d, values = {}) {
  const name = input({ label: 'Name', type: 'text', value: values.name ?? '', placeholder: 'e.g. Gas cylinder' });
  const isOwn = values.unit && !UNITS.includes(values.unit);
  const unit = input({
    label: 'Unit', type: 'select',
    options: [...UNITS.map((u) => ({ value: u, label: u })), { value: OWN_UNIT, label: 'My own…' }],
    value: isOwn ? OWN_UNIT : values.unit ?? 'can',
  });
  const ownUnit = input({ label: 'Your unit', type: 'text', value: isOwn ? values.unit : '', placeholder: 'e.g. bottle' });
  ownUnit.hidden = !isOwn;
  unit.input.addEventListener('change', () => { ownUnit.hidden = unit.input.value !== OWN_UNIT; ownUnit.setError(''); });
  const cats = d.categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  if (values.categoryId && !d.catById.has(values.categoryId)) cats.push({ value: values.categoryId, label: '❓ Deleted category' });
  const category = input({
    label: 'Money category', type: 'select', options: cats,
    value: values.categoryId ?? (d.categories.find((c) => c.name === 'Bills') || d.categories[0])?.id ?? '',
  });
  name.input.addEventListener('input', () => name.setError(''));
  ownUnit.input.addEventListener('input', () => ownUnit.setError(''));
  const noCats = d.categories.length ? null : el('p', { className: 'muted' }, [
    el('span', { text: 'No Money categories yet. ' }),
    el('a', { href: '#/money', text: 'Open 💸 Money once' }),
    el('span', { text: ' to set them up, then come back.' }),
  ]);
  return {
    name,
    elements: [name, el('div', { className: 'field-row' }, [unit, category]), ownUnit, noCats],
    read(ownId) {
      const text = tidy(name.input.value);
      let nameError = '';
      if (!text) nameError = 'Type a name, e.g. Gas cylinder';
      else if (text.length > MAX_NAME) nameError = `Keep the name to ${MAX_NAME} letters or fewer.`;
      else if (d.items.some((x) => x.id !== ownId && x.name.toLowerCase() === text.toLowerCase())) nameError = 'You already have an item with this name.';
      name.setError(nameError);
      let u = unit.input.value;
      let unitError = '';
      if (u === OWN_UNIT) {
        u = tidy(ownUnit.input.value);
        if (!u) unitError = 'Type your unit, e.g. bottle';
        else if (u.length > MAX_UNIT) unitError = `Keep the unit to ${MAX_UNIT} letters or fewer.`;
      }
      ownUnit.setError(unitError);
      const catError = category.input.value ? '' : 'Pick a Money category (open 💸 Money once to get them).';
      category.setError(catError);
      if (nameError || unitError || catError) return null;
      return { name: text, unit: u, categoryId: category.input.value };
    },
  };
}

// Deletes an item with its refills, their Money expenses and its open reminder (Undo brings all back).
async function deleteItem(d, item, after) {
  const refills = d.refillsOf(item.id);
  const removedItem = await remove('refillItems', item.id);
  const back = { refills: [], expenses: [], tasks: [] };
  for (const r of refills) {
    back.refills.push(await remove('refills', r.id));
    if (r.expenseId) back.expenses.push(await remove('expenses', r.expenseId));
    const t = r.taskId ? d.tasks.find((x) => x.id === r.taskId) : null;
    if (t && !t.done) back.tasks.push(await remove('tasks', t.id));
  }
  await after();
  if (!removedItem) return;
  toast({
    message: `Deleted ${removedItem.name}${refills.length ? ` and ${plural(refills.length, 'refill')}` : ''}`,
    actionLabel: 'Undo',
    onAction: async () => {
      await restore('refillItems', removedItem);
      for (const r of back.refills.filter(Boolean)) await restore('refills', r);
      for (const e of back.expenses.filter(Boolean)) await restore('expenses', e);
      for (const t of back.tasks.filter(Boolean)) await restore('tasks', t);
      await after(true);
    },
  });
}

// ---------- routes ----------

export async function render(root, { path = [] } = {}) {
  // REF-3: quick repair check every time Refills opens.
  let d = await loadAll();
  try {
    if (await repairLinks(d)) d = await loadAll();
  } catch (err) {
    console.error(err);
  }
  if (path[0] === 'item' && path[1]) return itemScreen(root, path[1], null, d);
  if (path[0] === 'refill' && path[1]) {
    const r = d.refills.find((x) => x.id === path[1]);
    if (r) return itemScreen(root, r.itemId, r.id, d);
    root.append(el('div', { className: 'mod-refills stack' }, [
      el('a', { className: 'btn btn--ghost split-back', href: '#/refills' }, [el('span', { text: '◀ Refills' })]),
      emptyState({ emoji: '🔄', title: 'This refill isn’t here', text: 'It may have been deleted.' }),
    ]));
    return;
  }
  return mainScreen(root, d);
}

// ---------- main screen: daily cost, items ----------

async function mainScreen(root, first) {
  let d = first;
  const costBox = el('div', { className: 'stack' });
  const itemsBox = el('div', { className: 'stack' });
  const formBox = el('div', { className: 'stack' });

  async function reload() {
    d = await loadAll();
    draw();
  }

  // ---- Daily cost of living (REF-6) ----
  function drawCost() {
    const cost = dailyCost(d.items, d.refills);
    if (!cost.items.length) {
      costBox.replaceChildren(emptyState({
        emoji: '🧮', title: 'Not enough data yet',
        text: 'Log at least 2 refills of an item to see what your regular things cost per day.',
      }));
      return;
    }
    costBox.replaceChildren(
      el('p', { className: 'progress-stats' }, [
        el('span', { className: 'progress-stats__amount', text: `${money(cost.perDayPaise)} a day` }),
      ]),
      el('p', { className: 'progress-note', text: `About ${rupees(cost.perMonthPaise)} a month (× 30 days).` }),
      el('div', { className: 'stack' }, cost.items.map(({ item, perDayPaise }) => {
        const share = cost.perDayPaise > 0 ? Math.round((perDayPaise / cost.perDayPaise) * 100) : 0;
        return el('div', { className: 'stack' }, [
          el('div', { className: 'row' }, [
            el('strong', { text: item.name }),
            el('span', { className: 'muted', text: `· ${money(perDayPaise)} a day · ${share}%` }),
          ]),
          progressBar({ value: perDayPaise, max: cost.perDayPaise, label: `${item.name}: ${share}% of the daily cost` }),
        ]);
      })),
    );
  }

  // ---- Items list ----
  function drawItems() {
    if (!d.items.length) {
      itemsBox.replaceChildren(emptyState({
        emoji: '🔄', title: 'No items yet',
        text: 'Add the things you buy again and again, like a gas cylinder, rice or a water can.',
      }));
      return;
    }
    const rows = d.items.map((item) => ({ item, stats: d.statsOf(item.id), count: d.refillsOf(item.id).length }))
      .sort((a, b) => {
        if (a.stats && b.stats) return a.stats.expected.localeCompare(b.stats.expected) || a.item.name.localeCompare(b.item.name);
        if (a.stats || b.stats) return a.stats ? -1 : 1;
        return a.item.name.localeCompare(b.item.name);
      })
      .map(({ item, stats, count }) => {
        const newest = d.refillsOf(item.id).at(-1);
        const subtitle = stats
          ? `Next refill ${dueText(stats.daysLeft)} · ${money(stats.perDayPaise)} a day`
          : `${count ? plural(count, 'refill') : 'No refills yet'} · ${item.unit} · ${d.catText(item.categoryId)}`;
        return listItem({
          title: `${stats && stats.daysLeft < 0 ? '⏰ ' : ''}${item.name}`,
          subtitle,
          meta: newest ? `${money(newest.pricePerUnitPaise)}/${item.unit}` : '',
          onClick: () => navigate(`refills/item/${item.id}`),
        });
      });
    itemsBox.replaceChildren(list(rows));
  }

  // ---- Add an item (REF-1) ----
  const addCard = card({ title: 'Add an item', module: 'refills', children: [formBox] });
  const addButton = button({ label: 'Add item', icon: 'plus', variant: 'primary', block: true, onClick: () => showAddForm(true) });
  function showAddForm(open) {
    addCard.hidden = !open;
    addButton.hidden = open;
    if (!open) return;
    const f = itemFields(d);
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...f.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => showAddForm(false) }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = f.read();
      if (!values) return;
      const item = await add('refillItems', { ...values, remind: false, remindDaysBefore: DEFAULT_DAYS_BEFORE });
      toast({ message: `Added ${item.name} ✨ Now log its last refill.` });
      navigate(`refills/item/${item.id}`);
    });
    formBox.replaceChildren(form);
    addCard.scrollIntoView({ block: 'start', behavior: 'smooth' });
    queueMicrotask(() => f.name.input.focus());
  }

  function draw() {
    drawCost();
    drawItems();
  }

  showAddForm(false);
  draw();
  root.append(el('div', { className: 'mod-refills stack' }, [
    card({ title: '🧮 Daily cost of living', module: 'refills', children: [costBox] }),
    addButton,
    addCard,
    card({ title: 'Your items', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'progress-note', text: 'Soonest refill first. Tap an item to log a refill or see its numbers.' }),
      itemsBox,
    ])] }),
    el('p', { className: 'muted', text: '💸 Each refill is also saved in Money as one expense, so it is counted once.' }),
  ]));
}

// ---------- one item: refills, numbers, reminder ----------

async function itemScreen(root, itemId, openRefillId, first) {
  let d = first;
  const page = el('div', { className: 'mod-refills stack' });
  root.append(page);
  const back = el('a', { className: 'btn btn--ghost split-back', href: '#/refills' }, [el('span', { text: '◀ Refills' })]);
  let item = d.itemById.get(itemId);
  if (!item) {
    page.append(back, emptyState({ emoji: '🔄', title: 'This item isn’t here', text: 'It may have been deleted.' }));
    return;
  }

  let editingItem = false;
  let adding = false;
  let editingRefillId = openRefillId;
  let chart = null;

  async function reload() {
    d = await loadAll();
    item = d.itemById.get(itemId);
    if (!item) { navigate('refills'); return; }
    draw();
  }

  // Saves a change to refills, then keeps Money and the reminder in step.
  async function afterRefillChange({ reopen = false } = {}) {
    d = await loadAll();
    item = d.itemById.get(itemId);
    for (const r of d.refillsOf(itemId)) await linkExpense(item, r, d.expenses);
    d = await loadAll();
    await syncReminder(item, d, { reopen });
    await reload();
  }

  // ---- header + item edit (REF-1) ----
  const headBox = el('div');
  function drawHead() {
    if (editingItem) {
      const f = itemFields(d, item);
      const form = el('form', { className: 'stack', novalidate: true }, [
        ...f.elements,
        el('div', { className: 'btn-row' }, [
          button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingItem = false; drawHead(); } }),
          button({ label: 'Save', variant: 'primary', type: 'submit' }),
        ]),
        // Waits for the move to the Refills list, so the Undo message isn't hidden by the screen change.
        button({ label: 'Delete item', icon: 'trash', variant: 'danger', block: true, onClick: () => deleteItem(d, item, (undone) => new Promise((resolve) => {
          window.addEventListener('hashchange', () => resolve(), { once: true });
          navigate(undone ? `refills/item/${itemId}` : 'refills');
        })) }),
      ]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = f.read(item.id);
        if (!values) return;
        await update('refillItems', item.id, values);
        editingItem = false;
        toast({ message: 'Item updated ✨' });
        await afterRefillChange(); // new name / unit / category flows into Money and the reminder
      });
      headBox.replaceChildren(card({ title: `Edit ${item.name}`, module: 'refills', children: [form] }));
      queueMicrotask(() => f.name.input.focus());
      return;
    }
    headBox.replaceChildren(card({ title: `🔄 ${item.name}`, module: 'refills', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'muted', text: `Unit: ${item.unit} · Money: ${d.catText(item.categoryId)}` }),
      button({ label: 'Edit item', icon: 'edit', variant: 'secondary', block: true, onClick: () => { editingItem = true; drawHead(); } }),
    ])] }));
  }

  // ---- refill form (REF-2) ----
  function refillForm(values, { submitLabel, onCancel, onSave }) {
    const date = input({ label: 'Date', type: 'date', value: values.date ?? today(), max: today() });
    const qty = input({ label: `Quantity (${item.unit})`, type: 'text', inputmode: 'decimal', value: values.quantity == null ? '' : String(values.quantity), placeholder: 'e.g. 1' });
    const price = input({ label: `Price per ${item.unit} (₹)`, type: 'text', inputmode: 'decimal', value: amountText(values.pricePerUnitPaise), placeholder: 'e.g. 950' });
    const total = el('p', { className: 'progress-stats', 'aria-live': 'polite' });
    const listId = `refill-vendors-${Math.random().toString(36).slice(2, 8)}`;
    const vendor = input({ label: 'Vendor (optional)', type: 'text', value: values.vendor ?? '', placeholder: 'e.g. HP Gas agency' });
    vendor.input.setAttribute('list', listId);
    vendor.input.setAttribute('autocomplete', 'off');
    vendor.append(el('datalist', { id: listId }, d.vendors.map((v) => el('option', { value: v }))));
    const method = choicePills(METHODS, values.paymentMethod ?? 'UPI', 'Paid by');
    const note = input({ label: 'Note (optional)', type: 'text', value: values.note ?? '', placeholder: 'e.g. booked online' });

    function showTotal() {
      const q = Number(String(qty.input.value).replace(/,/g, ''));
      const p = parseMoney(price.input.value);
      const t = Number.isFinite(q) && q > 0 && p ? Math.round(q * p) : null;
      total.replaceChildren(el('span', { className: 'progress-stats__amount', text: t == null ? 'Total: —' : `Total: ${formatMoney(t)}` }));
    }
    for (const f of [qty, price]) f.input.addEventListener('input', () => { f.setError(''); showTotal(); });
    date.input.addEventListener('input', () => date.setError(''));
    showTotal();

    const form = el('form', { className: 'stack', novalidate: true }, [
      el('div', { className: 'field-row' }, [qty, price]),
      total,
      date,
      vendor,
      field('Paid by', method),
      note,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: onCancel }),
        button({ label: submitLabel, variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dv = date.input.value;
      const dateError = !/^\d{4}-\d{2}-\d{2}$/.test(dv) ? 'Please pick a date.' : dv > today() ? "The date can't be in the future." : '';
      date.setError(dateError);
      const q = readNumber(qty, { min: 0.001, max: 100000, decimals: 3, example: 1 });
      qty.setError(q.error || '');
      const p = parseMoney(price.input.value);
      let priceError = '';
      if (!String(price.input.value).trim()) priceError = 'Type the price, e.g. 950';
      else if (p === null) priceError = 'Type a price like 950 or 49.50';
      else if (p <= 0) priceError = 'The price must be more than ₹0.';
      else if (p > MAX_PAISE) priceError = 'That looks too big. Please check the price.';
      price.setError(priceError);
      const v = tidy(vendor.input.value);
      const vendorError = v.length > MAX_VENDOR ? `Keep the vendor to ${MAX_VENDOR} letters or fewer.` : '';
      vendor.setError(vendorError);
      const n = note.input.value.trim();
      const noteError = n.length > MAX_NOTE ? `Keep the note to ${MAX_NOTE} letters or fewer.` : '';
      note.setError(noteError);
      if (dateError || q.error || priceError || vendorError || noteError) return;
      await onSave({ itemId: item.id, date: dv, quantity: q.value, pricePerUnitPaise: p, vendor: v, paymentMethod: method.value, note: n });
    });
    queueMicrotask(() => qty.input.focus());
    return form;
  }

  const addBox = el('div');
  function drawAdd() {
    if (!adding) {
      addBox.replaceChildren(button({ label: 'Log a refill', icon: 'plus', variant: 'primary', block: true, onClick: () => { adding = true; editingRefillId = null; drawAdd(); drawList(); } }));
      return;
    }
    // Starts from the last refill's numbers, since they're usually the same.
    const last = d.refillsOf(item.id).at(-1) || {};
    const form = refillForm({
      quantity: last.quantity ?? 1, pricePerUnitPaise: last.pricePerUnitPaise, vendor: last.vendor, paymentMethod: last.paymentMethod,
    }, {
      submitLabel: 'Save refill',
      onCancel: () => { adding = false; drawAdd(); },
      onSave: async (values) => {
        const r = await add('refills', { ...values, expenseId: null, taskId: null });
        adding = false;
        toast({ message: `Saved ${item.name} · ${formatMoney(refillTotal(r))} ✨ Also added to 💸 Money.` });
        await afterRefillChange();
      },
    });
    addBox.replaceChildren(card({ title: 'Log a refill', module: 'refills', children: [form] }));
  }

  // ---- refills list (REF-2) ----
  const listBox = el('div', { className: 'stack' });
  async function deleteRefill(r) {
    const task = r.taskId ? d.tasks.find((t) => t.id === r.taskId) : null;
    const removed = await remove('refills', r.id);
    const removedExpense = r.expenseId ? await remove('expenses', r.expenseId) : null;
    const removedTask = task && !task.done ? await remove('tasks', task.id) : null;
    if (editingRefillId === r.id) editingRefillId = null;
    await afterRefillChange({ reopen: true });
    if (!removed) return;
    toast({
      message: `Deleted refill · ${formatDate(removed.date)} (and its expense)`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('refills', removed);
        if (removedExpense) await restore('expenses', removedExpense);
        if (removedTask) await restore('tasks', removedTask);
        await afterRefillChange();
      },
    });
  }

  function drawList() {
    const refills = d.refillsOf(item.id).sort(newestFirst);
    if (!refills.length) {
      listBox.replaceChildren(emptyState({ emoji: '🧾', title: 'No refills yet', text: 'Tap "+ Log a refill" above. Logging your last one or two refills gets the numbers going.' }));
      return;
    }
    listBox.replaceChildren(list(refills.map((r) => {
      if (r.id === editingRefillId) {
        const form = refillForm(r, {
          submitLabel: 'Save',
          onCancel: () => { editingRefillId = null; drawList(); },
          onSave: async (values) => {
            await update('refills', r.id, values);
            editingRefillId = null;
            toast({ message: 'Refill updated ✨ Money updated too.' });
            await afterRefillChange();
          },
        });
        return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main stack' }, [
          form,
          button({ label: 'Delete refill', icon: 'trash', variant: 'danger', block: true, onClick: () => deleteRefill(r) }),
        ])]);
      }
      return listItem({
        title: formatDate(r.date),
        subtitle: [
          `${qtyText(r.quantity, item.unit)} × ${formatMoney(r.pricePerUnitPaise)}`,
          r.vendor, methodLabel(r.paymentMethod), r.note,
        ].filter(Boolean).join(' · '),
        meta: formatMoney(refillTotal(r)),
        onClick: () => { editingRefillId = r.id; adding = false; drawAdd(); drawList(); },
        actions: [button({ icon: 'trash', variant: 'ghost', ariaLabel: `Delete refill on ${formatDate(r.date)}`, onClick: () => deleteRefill(r) })],
      });
    })));
    if (editingRefillId) queueMicrotask(() => listBox.querySelector('form')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  // ---- numbers (REF-4) ----
  const numbersBox = el('div', { className: 'stack' });
  const chartBox = el('div', { className: 'chart-box' });
  function change(now, then) {
    const diff = now - then;
    const pct = then ? (diff / then) * 100 : 0;
    if (!diff) return 'same';
    return `${diff > 0 ? '▲ +' : '▼ −'}${formatMoney(Math.abs(diff))} (${diff > 0 ? '+' : '−'}${formatNumber(Math.abs(pct), 1)}%)`;
  }
  function drawNumbers() {
    chart?.then?.((c) => c?.destroy?.());
    chart = null;
    const refills = d.refillsOf(item.id);
    const stats = itemStats(refills);
    if (!stats) {
      numbersBox.replaceChildren(emptyState({
        emoji: '📈', title: 'Not enough data yet',
        text: refills.length ? 'Log one more refill (on another day) to see how long it lasts and what it costs per day.' : 'Log 2 refills to see how long one lasts and what it costs per day.',
      }));
      return;
    }
    const highlight = (emoji, text) => el('div', { className: 'highlight' }, [
      el('span', { className: 'highlight__emoji', 'aria-hidden': 'true', text: emoji }),
      el('p', { className: 'highlight__text', text }),
    ]);
    const unitPrice = (p) => `${formatMoney(p)}/${item.unit}`;
    const now = stats.newest.pricePerUnitPaise;
    numbersBox.replaceChildren(
      highlight(stats.daysLeft < 0 ? '⏰' : '📅', `Next refill expected ${formatDate(stats.expected)} · ${dueText(stats.daysLeft)}`),
      highlight('⏳', `A refill lasts about ${formatNumber(stats.avgDays, 1)} day${stats.avgDays === 1 ? '' : 's'} (last ${Math.min(refills.length, 6)} refills)`),
      highlight('💸', `Costs ${money(stats.perDayPaise)} a day · about ${rupees(stats.perDayPaise * 30)} a month`),
      highlight('🏷️', `Price now ${unitPrice(now)} · vs first: ${change(now, stats.first.pricePerUnitPaise)} · vs previous: ${change(now, stats.previous.pricePerUnitPaise)}`),
      el('h3', { className: 'list-group__title' }, [el('span', { text: `Price per ${item.unit}` })]),
      chartBox,
    );
    chart = lineChart(chartBox, {
      module: 'refills', labels: refills.map((r) => r.date),
      series: [{ label: `Price per ${item.unit}`, values: refills.map((r) => r.pricePerUnitPaise / 100) }],
      beginAtZero: false, format: (v) => formatMoney(Math.round(v * 100)), height: 180,
    });
    chart.catch?.((err) => console.error(err));
  }

  // ---- reminder (REF-5) ----
  const reminderBox = el('div', { className: 'stack' });
  function drawReminder() {
    const days = Number.isInteger(item.remindDaysBefore) ? item.remindDaysBefore : DEFAULT_DAYS_BEFORE;
    const daysBox = input({ label: 'Remind me this many days before', type: 'text', inputmode: 'numeric', value: String(days), placeholder: 'e.g. 1' });
    daysBox.hidden = !item.remind;
    const pills = choicePills([['off', 'Off'], ['on', 'On']], item.remind ? 'on' : 'off', 'Next-refill reminder', (v) => { daysBox.hidden = v !== 'on'; });
    const stats = d.statsOf(item.id);
    const newest = d.refillsOf(item.id).at(-1);
    const task = newest?.taskId ? d.tasks.find((t) => t.id === newest.taskId) : null;
    let status = 'A task “' + reminderTitle(item) + '” is kept in ✅ Tasks. Logging the refill ticks it off and makes the next one.';
    if (item.remind && !stats) status = 'The reminder starts after your 2nd refill (it needs to know how long one lasts).';
    else if (item.remind && task && !task.done) status = `In ✅ Tasks, due ${formatDate(task.dueDate)}.`;
    else if (item.remind && task?.done) status = 'This reminder is ticked off in ✅ Tasks. The next refill makes a new one.';
    const form = el('form', { className: 'stack', novalidate: true }, [
      field('Next-refill reminder', pills),
      daysBox,
      el('p', { className: 'progress-note', text: status }),
      button({ label: 'Save reminder', variant: 'primary', type: 'submit', block: true }),
    ]);
    daysBox.input.addEventListener('input', () => daysBox.setError(''));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const on = pills.value === 'on';
      let before = days;
      if (on) {
        const r = readNumber(daysBox, { min: 0, max: 30, example: 1 });
        daysBox.setError(r.error || '');
        if (r.error) return;
        before = r.value;
      }
      const turnedOn = on && !item.remind;
      await update('refillItems', item.id, { remind: on, remindDaysBefore: before });
      d = await loadAll();
      item = d.itemById.get(itemId);
      await syncReminder(item, d, { reopen: turnedOn });
      toast({ message: on ? 'Reminder on ⏰' : 'Reminder off' });
      await reload();
    });
    reminderBox.replaceChildren(form);
  }

  function draw() {
    drawHead();
    drawAdd();
    drawNumbers();
    drawReminder();
    drawList();
  }

  draw();
  page.append(
    back,
    headBox,
    addBox,
    card({ title: '📊 Numbers', module: 'refills', children: [numbersBox] }),
    card({ title: '⏰ Reminder', module: 'refills', children: [reminderBox] }),
    card({ title: '🧾 Refills', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'progress-note', text: 'Newest first. Tap one to change or delete it; its 💸 Money expense follows.' }),
      listBox,
    ])] }),
  );
}
