// 📒 Lent & borrowed (REFINE-5): a simple log book, opened from the button at the end of 💸 Money
// ("#/money/lent"). Works on its own: nothing here touches your expenses, budgets or the Home screen.
// Saved in the `loans` drawer:
//   { direction: 'lent' | 'borrowed', person, amountPaise, date, dueDate ('' = none), note,
//     repayments: [{ date, amountPaise }] }
// Still open = less paid back than the amount. Money is whole paise.

import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll } from '../core/storage.js';
import { today, formatDate } from '../core/dates.js';
import { formatMoney, parseMoney } from '../core/format.js';
import { buddyMood } from '../core/buddy.js';

const MAX_PAISE = 1_00_00_000 * 100;
const MAX_NAME = 30;
const DIRECTIONS = [
  { key: 'lent', label: '↗️ I lent' },
  { key: 'borrowed', label: '↙️ I borrowed' },
];

const cleanText = (t) => String(t ?? '').trim().replace(/\s+/g, ' ');
const amountText = (paise) => String(paise / 100);
const paidBack = (loan) => (loan.repayments || []).reduce((s, r) => s + r.amountPaise, 0);
const left = (loan) => loan.amountPaise - paidBack(loan);
const isOverdue = (loan) => left(loan) > 0 && loan.dueDate && loan.dueDate < today();

function checkAmount(text, max = MAX_PAISE) {
  if (!String(text).trim()) return { error: 'Type the amount, e.g. 500' };
  const paise = parseMoney(text);
  if (paise === null) return { error: 'Type an amount like 500 or 99.50' };
  if (paise <= 0) return { error: 'The amount must be more than ₹0.' };
  if (paise > max) return { error: max < MAX_PAISE ? `That's more than the ${formatMoney(max)} still left.` : 'That looks too big. Please check the amount.' };
  return { paise };
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Please pick a date.';
  if (date > today()) return "The date can't be in the future.";
  return '';
}

// "Ravi owes you" / "You owe Ravi"
const headline = (loan) => (loan.direction === 'borrowed' ? `You owe ${loan.person}` : `${loan.person} owes you`);

// REFINE-6: how the money moved. Saved as `paymentMode` on an entry and on each repayment
// (entries saved before REFINE-6 have none, and simply show no mode).
const PAY_MODES = [
  { key: 'cash', label: '💵 Cash' },
  { key: 'online', label: '📱 Online' },
];
const modeText = (key) => PAY_MODES.find((m) => m.key === key)?.label || '';

// Two pill buttons: I lent / I borrowed (or, with `options`, Cash / Online).
function directionPick(selected, onChange, options = DIRECTIONS, label = 'Lent or borrowed') {
  let chosen = selected;
  const box = el('div', { className: 'btn-row', role: 'group', 'aria-label': label });
  const paint = () => box.querySelectorAll('.btn').forEach((b) => {
    const on = b.dataset.key === chosen;
    b.classList.toggle('btn--primary', on);
    b.classList.toggle('btn--secondary', !on);
    b.setAttribute('aria-pressed', String(on));
  });
  for (const d of options) {
    const b = button({ label: d.label, variant: 'secondary', onClick: () => { chosen = d.key; paint(); onChange?.(chosen); } });
    b.dataset.key = d.key;
    box.append(b);
  }
  paint();
  box.value = () => chosen;
  return box;
}

// The boxes for one entry. Used to add and to edit. read() gives the entry, or null after showing what's wrong.
function loanFields(values = {}, peopleListId) {
  let direction = values.direction || 'lent';
  const personLabel = () => (direction === 'lent' ? 'Lent to' : 'Borrowed from');
  const dirPick = directionPick(direction, (d) => { direction = d; person.querySelector('label').textContent = personLabel(); });
  const person = input({ label: personLabel(), name: 'person', value: values.person ?? '', placeholder: 'e.g. Ravi' });
  person.input.maxLength = MAX_NAME;
  if (peopleListId) person.input.setAttribute('list', peopleListId);
  person.input.setAttribute('autocomplete', 'off');
  const amount = input({ label: 'Amount (₹)', name: 'amount', inputmode: 'decimal', value: values.amount ?? '', placeholder: 'e.g. 500' });
  const payPick = directionPick(values.paymentMode || 'online', null, PAY_MODES, 'Paid by');
  const date = input({ label: 'Date', name: 'date', type: 'date', value: values.date ?? today(), max: today() });
  const due = input({ label: 'Back by (optional)', name: 'dueDate', type: 'date', value: values.dueDate ?? '' });
  const note = input({ label: 'Note (optional)', name: 'note', value: values.note ?? '', placeholder: 'e.g. train tickets' });
  note.input.maxLength = 80;
  for (const f of [person, amount, date, due]) f.input.addEventListener('input', () => f.setError(''));

  return {
    person, amount,
    elements: [
      dirPick, person, amount,
      el('div', { className: 'field' }, [el('div', { className: 'field__label', text: 'Paid by' }), payPick]),
      el('div', { className: 'field-grid' }, [date, due]), note,
    ],
    read(minAmount = 0) {
      const name = cleanText(person.input.value);
      person.setError(name ? '' : 'Type a name, e.g. Ravi');
      let { paise, error } = checkAmount(amount.input.value);
      if (!error && paise < minAmount) error = `${formatMoney(minAmount)} is already paid back, so the amount can't be less.`;
      amount.setError(error || '');
      const dateError = checkDate(date.input.value);
      date.setError(dateError);
      const dueError = due.input.value && due.input.value < date.input.value ? "Back by can't be before the date." : '';
      due.setError(dueError);
      if (!name || error || dateError || dueError) return null;
      return {
        direction, person: name, amountPaise: paise, paymentMode: payPick.value(), date: date.input.value,
        dueDate: due.input.value || '', note: cleanText(note.input.value),
      };
    },
  };
}

export async function render(root) {
  let loans = [];
  let openId = null; // the row opened to record money back / edit / delete
  let editingId = null;
  const peopleListId = 'lent-people';
  const peopleList = el('datalist', { id: peopleListId });
  const summaryBox = el('div', { className: 'stack' });
  const openBox = el('div');
  const closedBox = el('div');

  // ---------- Add ----------
  const fields = loanFields({}, peopleListId);
  const form = el('form', { className: 'stack', novalidate: true }, [
    ...fields.elements,
    button({ label: 'Save', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loan = fields.read();
    if (!loan) return;
    await add('loans', { ...loan, repayments: [] });
    fields.person.input.value = '';
    fields.amount.input.value = '';
    form.querySelector('[name=note]').value = '';
    form.querySelector('[name=dueDate]').value = '';
    toast({ message: `Saved: ${headline(loan)} ${formatMoney(loan.amountPaise)} 📒` });
    await refresh();
  });

  // ---------- One entry ----------
  function backForm(loan) {
    const word = loan.direction === 'lent' ? 'Got back' : 'Paid back';
    const amt = input({ label: `${word} (₹)`, name: 'backAmount', inputmode: 'decimal', value: amountText(left(loan)) });
    const day = input({ label: 'On', name: 'backDate', type: 'date', value: today(), max: today() });
    const payPick = directionPick(loan.paymentMode || 'online', null, PAY_MODES, 'Paid by');
    const f = el('form', { className: 'stack', novalidate: true }, [
      el('div', { className: 'field-grid' }, [amt, day]),
      el('div', { className: 'field' }, [el('div', { className: 'field__label', text: 'Paid by' }), payPick]),
      button({ label: loan.direction === 'lent' ? '✅ Got it back' : '✅ Paid it back', variant: 'primary', type: 'submit', block: true }),
    ]);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { paise, error } = checkAmount(amt.input.value, left(loan));
      amt.setError(error || '');
      let dateError = checkDate(day.input.value);
      if (!dateError && day.input.value < loan.date) dateError = `Pick ${formatDate(loan.date)} or later.`;
      day.setError(dateError);
      if (error || dateError) return;
      const before = loan.repayments || [];
      const saved = await update('loans', loan.id, { repayments: [...before, { date: day.input.value, amountPaise: paise, paymentMode: payPick.value() }] });
      const done = left(saved) === 0;
      if (done) openId = null;
      await refresh();
      toast({
        message: done ? `All settled with ${loan.person} 🎉` : `${formatMoney(paise)} back · ${formatMoney(left(saved))} left`,
        actionLabel: 'Undo',
        onAction: async () => { await update('loans', loan.id, { repayments: before }); await refresh(); },
      });
    });
    return f;
  }

  function editForm(loan) {
    const f = loanFields({
      direction: loan.direction, person: loan.person, amount: amountText(loan.amountPaise),
      date: loan.date, dueDate: loan.dueDate, note: loan.note, paymentMode: loan.paymentMode,
    }, peopleListId);
    const formEl = el('form', { className: 'stack', novalidate: true }, [
      ...f.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; draw(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = f.read(paidBack(loan));
      if (!changes) return;
      await update('loans', loan.id, changes);
      editingId = null;
      await refresh();
      toast({ message: 'Saved ✨' });
    });
    queueMicrotask(() => f.amount.input.focus());
    return formEl;
  }

  async function deleteLoan(loan) {
    const removed = await remove('loans', loan.id);
    openId = null;
    editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted: ${headline(removed)} ${formatMoney(removed.amountPaise)}`,
      actionLabel: 'Undo',
      onAction: async () => { await restore('loans', removed); await refresh(); },
    });
  }

  function subtitle(loan) {
    const back = paidBack(loan);
    const parts = [formatDate(loan.date)];
    if (loan.paymentMode) parts.push(modeText(loan.paymentMode));
    if (loan.note) parts.push(loan.note);
    if (left(loan) === 0) {
      const last = (loan.repayments || []).map((r) => r.date).sort().pop();
      parts.push(`✅ ${loan.direction === 'lent' ? 'Got it all back' : 'Paid it all back'}${last ? ` on ${formatDate(last)}` : ''}`);
    } else {
      if (back) parts.push(`${formatMoney(back)} of ${formatMoney(loan.amountPaise)} back`);
      if (loan.dueDate) parts.push(isOverdue(loan) ? `⏰ was due ${formatDate(loan.dueDate)}` : `back by ${formatDate(loan.dueDate)}`);
    }
    return parts.join(' · ');
  }

  function row(loan) {
    const open = loan.id === openId;
    const item = listItem({
      title: `${loan.direction === 'lent' ? '↗️' : '↙️'} ${headline(loan)}`,
      subtitle: subtitle(loan),
      meta: formatMoney(left(loan) || loan.amountPaise),
      onClick: () => { openId = open ? null : loan.id; editingId = null; draw(); },
    });
    if (isOverdue(loan)) item.classList.add('loan--overdue');
    if (!open) return item;
    // Opened: money back, past repayments (each can be removed), edit and delete.
    const panel = el('div', { className: 'stack loan-panel' });
    if (editingId === loan.id) panel.append(editForm(loan));
    else {
      if (left(loan) > 0) panel.append(backForm(loan));
      if ((loan.repayments || []).length) {
        panel.append(
          el('div', { className: 'list-group__title' }, [el('span', { text: loan.direction === 'lent' ? 'Money back' : 'Paid back' })]),
          list(loan.repayments.map((r, i) => listItem({
            title: formatMoney(r.amountPaise),
            subtitle: [modeText(r.paymentMode), formatDate(r.date)].filter(Boolean).join(' · '),
            actions: [button({
              icon: 'trash', variant: 'ghost', ariaLabel: `Remove ${formatMoney(r.amountPaise)} on ${formatDate(r.date)}`,
              onClick: async () => {
                const before = loan.repayments;
                await update('loans', loan.id, { repayments: before.filter((_, k) => k !== i) });
                await refresh();
                toast({
                  message: `Removed ${formatMoney(r.amountPaise)}`,
                  actionLabel: 'Undo',
                  onAction: async () => { await update('loans', loan.id, { repayments: before }); await refresh(); },
                });
              },
            })],
          }))),
        );
      }
      panel.append(el('div', { className: 'btn-row' }, [
        button({ label: 'Edit', icon: 'edit', variant: 'secondary', onClick: () => { editingId = loan.id; draw(); } }),
        button({ label: 'Delete', icon: 'trash', variant: 'danger', onClick: () => deleteLoan(loan) }),
      ]));
    }
    panel.addEventListener('click', (e) => e.stopPropagation()); // taps inside don't close the row
    item.append(panel);
    item.classList.add('loan--open');
    return item;
  }

  // ---------- Summary ----------
  function drawSummary() {
    const open = loans.filter((l) => left(l) > 0);
    const owedToYou = open.filter((l) => l.direction === 'lent');
    const youOwe = open.filter((l) => l.direction === 'borrowed');
    const sum = (arr) => arr.reduce((s, l) => s + left(l), 0);
    const people = (arr) => new Set(arr.map((l) => l.person.toLowerCase())).size;
    const count = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
    // Net per person (names match whatever the capitals): + they owe you, − you owe them.
    const byPerson = new Map();
    for (const l of open) {
      const key = l.person.toLowerCase();
      const cur = byPerson.get(key) || { name: l.person, net: 0 };
      cur.net += l.direction === 'lent' ? left(l) : -left(l);
      byPerson.set(key, cur);
    }
    const rows = [...byPerson.values()].filter((p) => p.net).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    if (!loans.length) {
      summaryBox.replaceChildren(el('p', { className: 'progress-note', text: 'Note down money you lend or borrow, and tick it off when it comes back.' }));
      buddyMood('calm', '{name} keeps the log book tidy 📒');
      return;
    }
    summaryBox.replaceChildren(
      el('div', { className: 'split-totals' }, [
        el('div', {}, [
          el('div', { className: 'muted', text: 'Others owe you' }),
          el('div', { className: 'progress-stats__amount', text: formatMoney(sum(owedToYou)) }),
          el('div', { className: 'muted', text: owedToYou.length ? count(people(owedToYou)) : 'nobody' }),
        ]),
        el('div', {}, [
          el('div', { className: 'muted', text: 'You owe others' }),
          el('div', { className: 'progress-stats__amount', text: formatMoney(sum(youOwe)) }),
          el('div', { className: 'muted', text: youOwe.length ? count(people(youOwe)) : 'nobody' }),
        ]),
      ]),
      rows.length ? list(rows.map((p) => listItem({
        title: p.net > 0 ? `${p.name} owes you` : `You owe ${p.name}`,
        meta: formatMoney(Math.abs(p.net)),
      }))) : el('p', { className: 'progress-note', text: 'All settled up 🎉' }),
    );
    if (open.some(isOverdue)) buddyMood('worried', 'Some money is past its "back by" date ⏰ {name} noticed');
    else if (!open.length) buddyMood('happy', 'All settled! {name} is happy 🎉');
    else buddyMood('content', '{name} is keeping track for you 📒');
  }

  function draw() {
    const open = loans.filter((l) => left(l) > 0)
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const closed = loans.filter((l) => left(l) === 0)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    drawSummary();
    openBox.replaceChildren(open.length
      ? list(open.map(row))
      : emptyState({ emoji: '📒', title: 'Nothing open', text: 'Add money you lent or borrowed above.' }));
    closedBox.replaceChildren(closed.length
      ? el('details', { className: 'settings-details', open: closed.some((l) => l.id === openId) }, [
        el('summary', { text: `Settled (${closed.length})` }),
        list(closed.map(row)),
      ])
      : '');
    // Names you've used before, offered while typing a name.
    const names = [...new Map(loans.map((l) => [l.person.toLowerCase(), l.person])).values()].sort();
    peopleList.replaceChildren(...names.map((n) => el('option', { value: n })));
  }

  async function refresh() {
    loans = await listAll('loans');
    draw();
  }

  root.append(el('div', { className: 'mod-money stack' }, [
    el('a', { className: 'btn btn--ghost split-back', href: '#/money' }, [el('span', { text: '◀ Back to Money' })]),
    card({ title: '📒 Lent & borrowed', children: [summaryBox] }),
    card({ title: '➕ Add', children: [form, peopleList] }),
    card({ title: '⏳ Still open', children: [el('p', { className: 'muted', text: 'Tap one to note money back, edit or delete it.' }), openBox, closedBox] }),
  ]));
  await refresh();
}
