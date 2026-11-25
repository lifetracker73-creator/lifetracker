// 🤝 Split bills (REFINE-5): opened from the button at the end of 💸 Money ("#/money/split").
// Works on its own: nothing here touches your expenses, budgets or the Home screen.
//   "#/money/split"       → your groups, with what you get back / owe overall, and "New group"
//   "#/money/split/<id>"  → one group: add a bill, balances, who pays whom, settle up, history, settings
// Saved in two drawers:
//   splitGroups: { name, emoji, people: [{ id, name }], archived }   ("me" = You, always in every group)
//   splitItems:  a bill    { groupId, kind: 'bill', date, title, amountPaise, paidBy, splitMode,
//                            shares: [{ member, sharePaise, typed }] }  (typed = what was typed for that person)
//                a payment { groupId, kind: 'payment', date, amountPaise, paidBy, paidTo }
// Money is whole paise; a bill's shares always add up exactly to its amount.

import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll, get } from '../core/storage.js';
import { today, formatDate } from '../core/dates.js';
import { formatMoney, parseMoney, formatNumber } from '../core/format.js';
import { navigate } from '../core/router.js';
import { buddyMood } from '../core/buddy.js';

const ME = 'me';
const MAX_PAISE = 1_00_00_000 * 100; // ₹1,00,00,000
const MAX_NAME = 30;
const GROUP_EMOJI = ['👫', '🏠', '🏖️', '🍕', '✈️', '🎉', '🚗', '🛒', '🎬', '💼'];
const MODES = [
  { key: 'equal', label: 'Equally' },
  { key: 'exact', label: 'Exact ₹' },
  { key: 'percent', label: 'Percent %' },
  { key: 'shares', label: 'Shares' },
];

const cleanText = (t) => String(t ?? '').trim().replace(/\s+/g, ' ');
const amountText = (paise) => String(paise / 100);
const sortItems = (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

function checkAmount(text) {
  if (!String(text).trim()) return { error: 'Type the amount, e.g. 900' };
  const paise = parseMoney(text);
  if (paise === null) return { error: 'Type an amount like 900 or 99.50' };
  if (paise <= 0) return { error: 'The amount must be more than ₹0.' };
  if (paise > MAX_PAISE) return { error: 'That looks too big. Please check the amount.' };
  return { paise };
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Please pick a date.';
  if (date > today()) return "The date can't be in the future.";
  return '';
}

/** Shares `total` paise out by `weights` so the parts add up exactly (spare paise go to the biggest leftovers). */
function splitByWeights(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = raw.map((r, i) => [r - parts[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length) { parts[order[k][1]] += 1; left -= 1; }
  return parts;
}

const members = (group) => [{ id: ME, name: 'You' }, ...(group.people || [])];
function nameOf(group, id) {
  if (id === ME) return 'You';
  return (group.people || []).find((p) => p.id === id)?.name || 'Removed person';
}

/** Each person's balance in paise: more than 0 = gets money back, less than 0 = owes. */
function balancesOf(group, items) {
  const bal = new Map(members(group).map((m) => [m.id, 0]));
  const addTo = (id, v) => bal.set(id, (bal.get(id) || 0) + v);
  for (const it of items) {
    if (it.kind === 'payment') {
      addTo(it.paidBy, it.amountPaise);
      addTo(it.paidTo, -it.amountPaise);
    } else {
      addTo(it.paidBy, it.amountPaise);
      for (const s of it.shares || []) addTo(s.member, -s.sharePaise);
    }
  }
  return bal;
}

/** The fewest payments that settle everyone: [{ from, to, amount }]. */
function whoPaysWhom(bal) {
  const owes = [...bal].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const gets = [...bal].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < owes.length && j < gets.length) {
    const amount = Math.min(owes[i].v, gets[j].v);
    out.push({ from: owes[i].id, to: gets[j].id, amount });
    owes[i].v -= amount;
    gets[j].v -= amount;
    if (!owes[i].v) i += 1;
    if (!gets[j].v) j += 1;
  }
  return out;
}

// "You pay Ravi" / "Ravi pays You"
const paysText = (group, from, to) => `${nameOf(group, from)} ${from === ME ? 'pay' : 'pays'} ${nameOf(group, to)}`;

function youText(paise) {
  if (paise > 0) return `You get back ${formatMoney(paise)}`;
  if (paise < 0) return `You owe ${formatMoney(-paise)}`;
  return 'All settled up ✅';
}

// Pill buttons where one (or several) can be picked.
function pills(options, { selected, multi = false, onChange, grid = false }) {
  let chosen = multi ? new Set(selected) : selected;
  const box = el('div', { className: grid ? 'btn-row btn-row--grid' : 'pill-wrap', role: 'group' });
  const paint = () => box.querySelectorAll('.btn').forEach((b) => {
    const on = multi ? chosen.has(b.dataset.key) : chosen === b.dataset.key;
    b.classList.toggle('btn--primary', on);
    b.classList.toggle('btn--secondary', !on);
    b.setAttribute('aria-pressed', String(on));
  });
  for (const opt of options) {
    const b = button({
      label: opt.label,
      variant: 'secondary',
      onClick: () => {
        if (multi) { if (chosen.has(opt.key)) chosen.delete(opt.key); else chosen.add(opt.key); } else chosen = opt.key;
        paint();
        onChange?.(multi ? new Set(chosen) : chosen);
      },
    });
    b.dataset.key = opt.key;
    box.append(b);
  }
  paint();
  box.value = () => (multi ? new Set(chosen) : chosen);
  box.set = (v) => { chosen = multi ? new Set(v) : v; paint(); };
  return box;
}

function backButton(label, path) {
  return el('a', { className: 'btn btn--ghost split-back', href: `#/${path}` }, [el('span', { text: `◀ ${label}` })]);
}

// Reads "Ravi, Priya , Sam" into clean unique names (not "You").
function readPeople(text, taken = []) {
  const names = String(text).split(',').map(cleanText).filter(Boolean);
  const seen = new Set(taken.map((n) => n.toLowerCase()));
  for (const n of names) {
    const low = n.toLowerCase();
    if (low === 'you' || low === 'me') return { error: '"You" is already in every group. Type the other people.' };
    if (n.length > MAX_NAME) return { error: `Keep each name to ${MAX_NAME} letters or fewer.` };
    if (seen.has(low)) return { error: `"${n}" is in the list twice. Use a different name, e.g. ${n} K.` };
    seen.add(low);
  }
  return { names };
}

const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(16).slice(2)}`);

// ======================= All groups =======================

async function groupsScreen(root) {
  buddyMood('calm', '{name} will do the maths for you 🧮');
  const summary = el('div', { className: 'stack' });
  const groupBox = el('div');
  const archivedBox = el('div');

  async function refresh() {
    const [groups, items] = await Promise.all([listAll('splitGroups'), listAll('splitItems')]);
    groups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const active = groups.filter((g) => !g.archived);
    const archived = groups.filter((g) => g.archived);
    const mine = new Map(groups.map((g) => [g.id, balancesOf(g, items.filter((x) => x.groupId === g.id)).get(ME) || 0]));
    const getBack = active.reduce((s, g) => s + Math.max(0, mine.get(g.id)), 0);
    const owe = active.reduce((s, g) => s + Math.max(0, -mine.get(g.id)), 0);

    summary.replaceChildren(active.length
      ? el('div', { className: 'split-totals' }, [
        el('div', {}, [el('div', { className: 'muted', text: 'You get back' }), el('div', { className: 'progress-stats__amount', text: formatMoney(getBack) })]),
        el('div', {}, [el('div', { className: 'muted', text: 'You owe' }), el('div', { className: 'progress-stats__amount', text: formatMoney(owe) })]),
      ])
      : el('p', { className: 'progress-note', text: 'Make a group for a trip, your flat or a friend, then add bills. The app works out who owes whom.' }));

    const row = (g) => {
      const me = mine.get(g.id);
      return listItem({
        title: `${g.emoji} ${g.name}`,
        subtitle: members(g).map((m) => m.name).join(', '),
        meta: me > 0 ? `+${formatMoney(me)}` : me < 0 ? `−${formatMoney(-me)}` : 'Settled ✅',
        onClick: () => navigate(`money/split/${g.id}`),
      });
    };
    groupBox.replaceChildren(active.length
      ? list(active.map(row))
      : emptyState({ emoji: '🤝', title: 'No groups yet', text: 'Start one below. It takes a few seconds.' }));
    archivedBox.replaceChildren(archived.length
      ? el('details', { className: 'settings-details' }, [
        el('summary', { text: `Archived groups (${archived.length})` }),
        list(archived.map(row)),
      ])
      : '');
  }

  // New group: name, emoji and the people (besides you), separated by commas.
  const nameField = input({ label: 'Group name', name: 'groupName', placeholder: 'e.g. Goa trip' });
  nameField.input.maxLength = MAX_NAME;
  const emojiPick = pills(GROUP_EMOJI.map((e) => ({ key: e, label: e })), { selected: GROUP_EMOJI[0] });
  const peopleField = input({
    label: "Who's in it, besides you?", name: 'people', placeholder: 'e.g. Ravi, Priya, Sam',
    hint: 'Separate names with commas. Just one name works too, for splitting with a friend.',
  });
  nameField.input.addEventListener('input', () => nameField.setError(''));
  peopleField.input.addEventListener('input', () => peopleField.setError(''));
  const form = el('form', { className: 'stack', novalidate: true }, [
    nameField,
    el('div', { className: 'field' }, [el('div', { className: 'field__label', text: 'Emoji' }), emojiPick]),
    peopleField,
    button({ label: 'Create group', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = cleanText(nameField.input.value);
    nameField.setError(name ? '' : 'Type a name, e.g. Goa trip');
    const { names, error } = readPeople(peopleField.input.value);
    const peopleError = error || (names.length ? '' : 'Add at least one person, e.g. Ravi');
    peopleField.setError(peopleError);
    if (!name || peopleError) return;
    const group = await add('splitGroups', {
      name, emoji: emojiPick.value(), people: names.map((n) => ({ id: newId(), name: n })), archived: false,
    });
    toast({ message: `Made ${group.emoji} ${group.name} ✨ Add your first bill.` });
    navigate(`money/split/${group.id}`);
  });

  root.append(el('div', { className: 'mod-money stack' }, [
    backButton('Back to Money', 'money'),
    card({ title: '🤝 Split bills', children: [el('div', { className: 'stack' }, [summary, groupBox, archivedBox])] }),
    card({ title: '➕ New group', children: [form] }),
  ]));
  await refresh();
}

// ======================= One group =======================

async function groupScreen(root, id) {
  let group = await get('splitGroups', id);
  if (!group) {
    root.append(el('div', { className: 'mod-money stack' }, [
      backButton('All groups', 'money/split'),
      card({ children: [emptyState({ emoji: '🤝', title: 'This group is gone', text: 'It may have been deleted.' })] }),
    ]));
    return;
  }
  let items = [];
  let editingId = null; // a bill being edited in the form
  let settlingKey = null; // the "who pays whom" row with its settle-up form open

  const headTitle = el('span');
  const headPeople = el('p', { className: 'muted split-people' });
  const headYou = el('div', { className: 'progress-stats__amount' });
  const balanceBox = el('div', { className: 'stack' });
  const historyBox = el('div');
  const settingsBox = el('div', { className: 'stack' });

  // ---------- Add / edit a bill ----------
  const formTitle = el('span', { text: 'Add a bill' });
  const what = input({ label: 'What for?', name: 'title', placeholder: 'e.g. Dinner' });
  what.input.maxLength = 60;
  const amount = input({ label: 'Amount (₹)', name: 'amount', inputmode: 'decimal', placeholder: 'e.g. 900' });
  const date = input({ label: 'Date', name: 'date', type: 'date', value: today(), max: today() });
  let paidBy = ME;
  let mode = 'equal';
  let included = new Set(members(group).map((m) => m.id));
  const typed = new Map(); // member id → what was typed for exact / percent / shares
  const paidPick = el('div');
  const modePick = pills(MODES, { selected: mode, grid: true, onChange: (m) => { mode = m; drawSplit(); } });
  const splitBox = el('div', { className: 'split-rows' });
  const splitNote = el('p', { className: 'progress-note', 'aria-live': 'polite' });
  const splitError = el('div', { className: 'field__error', hidden: true });
  const cancelEdit = button({ label: 'Cancel', variant: 'secondary', onClick: () => resetForm() });
  const saveBill = button({ label: 'Save bill', icon: 'plus', variant: 'primary', type: 'submit' });
  const formButtons = el('div', { className: 'btn-row' }, [saveBill]);

  function drawPaidBy() {
    const pick = pills(members(group).map((m) => ({ key: m.id, label: m.name })), {
      selected: paidBy, onChange: (v) => { paidBy = v; },
    });
    paidPick.replaceChildren(el('div', { className: 'field' }, [el('div', { className: 'field__label', text: 'Who paid?' }), pick]));
  }

  // Works out each person's share from what's on screen. Gives { shares, note, error }.
  function workOut() {
    const total = parseMoney(amount.input.value) || 0;
    const people = members(group);
    if (mode === 'equal') {
      const ids = people.filter((m) => included.has(m.id)).map((m) => m.id);
      if (!ids.length) return { error: 'Pick at least one person to split between.' };
      const parts = splitByWeights(total, ids.map(() => 1));
      const each = total ? `${formatMoney(parts[0])} each${parts[0] !== parts[parts.length - 1] ? ' (a paisa more for some)' : ''}` : '';
      return { shares: ids.map((m, i) => ({ member: m, sharePaise: parts[i], typed: 1 })), note: `${ids.length} ${ids.length === 1 ? 'person' : 'people'}${each ? ` · ${each}` : ''}` };
    }
    const entries = [];
    for (const m of people) {
      const raw = String(typed.get(m.id) ?? '').trim();
      if (!raw) continue;
      if (mode === 'exact') {
        const p = parseMoney(raw);
        if (p === null) return { error: `Type an amount like 250 for ${m.name}.` };
        if (p > 0) entries.push([m.id, p, p / 100]);
      } else {
        const n = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) return { error: `Type a number for ${m.name}, e.g. ${mode === 'percent' ? '50' : '1'}.` };
        if (n > 0) entries.push([m.id, n, n]);
      }
    }
    if (!entries.length) return { error: 'Type a value for at least one person.' };
    if (mode === 'exact') {
      const sum = entries.reduce((s, e) => s + e[1], 0);
      const shares = entries.map(([member, p, t]) => ({ member, sharePaise: p, typed: t }));
      if (!total) return { shares, note: `Shared out: ${formatMoney(sum)}` };
      if (sum === total) return { shares, note: 'Adds up ✅' };
      return { shares, note: sum < total ? `${formatMoney(total - sum)} still to share out` : `${formatMoney(sum - total)} too much`, error: sum < total ? `${formatMoney(total - sum)} still to share out.` : `That's ${formatMoney(sum - total)} more than the bill.` };
    }
    const sum = entries.reduce((s, e) => s + e[1], 0);
    const parts = splitByWeights(total, entries.map((e) => e[1]));
    const shares = entries.map(([member, , t], i) => ({ member, sharePaise: parts[i], typed: t }));
    if (mode === 'percent') {
      const pct = Math.round(sum * 100) / 100;
      if (Math.abs(pct - 100) <= 0.011) return { shares, note: '100% ✅' }; // 33.33 × 3 counts as 100
      return { shares, note: pct < 100 ? `${formatNumber(100 - pct, 2)}% still to share out` : `${formatNumber(pct - 100, 2)}% too much`, error: 'The percents need to add up to 100%.' };
    }
    return { shares, note: `${formatNumber(sum, 2)} shares${total ? ` · ${formatMoney(Math.round(total / sum))} per share` : ''}` };
  }

  // One line per person: tick to include (Equally) or a box to type their part (other ways).
  function drawSplit() {
    splitError.hidden = true;
    const result = workOut();
    const shareOf = new Map((result.shares || []).map((s) => [s.member, s.sharePaise]));
    splitBox.replaceChildren(...members(group).map((m) => {
      if (mode === 'equal') {
        const on = included.has(m.id);
        const toggle = button({
          label: `${on ? '✓ ' : ''}${m.name}`,
          variant: on ? 'primary' : 'secondary',
          onClick: () => { if (on) included.delete(m.id); else included.add(m.id); drawSplit(); },
        });
        toggle.setAttribute('aria-pressed', String(on));
        return el('div', { className: 'split-row' }, [toggle, el('span', { className: 'split-row__share', text: on && shareOf.has(m.id) && parseMoney(amount.input.value) ? formatMoney(shareOf.get(m.id)) : '' })]);
      }
      const box = el('input', {
        className: 'input', type: 'text', inputmode: 'decimal',
        'aria-label': `${m.name}: ${mode === 'exact' ? 'amount in ₹' : mode === 'percent' ? 'percent' : 'shares'}`,
        placeholder: mode === 'exact' ? '₹' : mode === 'percent' ? '%' : '0',
      });
      box.value = typed.get(m.id) ?? '';
      box.addEventListener('input', () => { typed.set(m.id, box.value); refreshNote(); });
      return el('div', { className: 'split-row' }, [
        el('span', { className: 'split-row__name', text: m.name }),
        box,
        el('span', { className: 'split-row__share', 'data-member': m.id, text: mode !== 'exact' && shareOf.get(m.id) ? formatMoney(shareOf.get(m.id)) : '' }),
      ]);
    }));
    splitNote.textContent = result.note || result.error || '';
  }

  // Updates the note and the ₹ next to each box without redrawing the boxes (so typing isn't interrupted).
  function refreshNote() {
    splitError.hidden = true;
    const result = workOut();
    splitNote.textContent = result.note || result.error || '';
    const shareOf = new Map((result.shares || []).map((s) => [s.member, s.sharePaise]));
    splitBox.querySelectorAll('.split-row__share[data-member]').forEach((s) => {
      s.textContent = mode !== 'exact' && shareOf.get(s.dataset.member) && parseMoney(amount.input.value) ? formatMoney(shareOf.get(s.dataset.member)) : '';
    });
  }

  amount.input.addEventListener('input', () => { amount.setError(''); if (mode === 'equal') drawSplit(); else refreshNote(); });
  what.input.addEventListener('input', () => what.setError(''));
  date.input.addEventListener('input', () => date.setError(''));

  function resetForm() {
    editingId = null;
    formTitle.textContent = 'Add a bill';
    what.input.value = '';
    amount.input.value = '';
    date.input.value = today();
    paidBy = ME;
    mode = 'equal';
    modePick.set(mode);
    included = new Set(members(group).map((m) => m.id));
    typed.clear();
    formButtons.replaceChildren(saveBill);
    drawPaidBy();
    drawSplit();
  }

  function editBill(bill) {
    editingId = bill.id;
    formTitle.textContent = 'Edit bill';
    what.input.value = bill.title;
    amount.input.value = amountText(bill.amountPaise);
    date.input.value = bill.date;
    paidBy = bill.paidBy;
    mode = bill.splitMode || 'equal';
    modePick.set(mode);
    included = new Set(bill.shares.map((s) => s.member));
    typed.clear();
    if (mode !== 'equal') for (const s of bill.shares) typed.set(s.member, String(s.typed));
    formButtons.replaceChildren(cancelEdit, saveBill);
    drawPaidBy();
    drawSplit();
    billForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const billForm = el('form', { className: 'stack', novalidate: true }, [
    what, amount, paidPick,
    el('div', { className: 'field' }, [el('div', { className: 'field__label', text: 'How to split?' }), modePick]),
    el('div', { className: 'field' }, [el('div', { className: 'field__label', text: 'Between' }), splitBox, splitNote, splitError]),
    date,
    formButtons,
  ]);
  billForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = cleanText(what.input.value);
    what.setError(title ? '' : 'Type what it was for, e.g. Dinner');
    const { paise, error } = checkAmount(amount.input.value);
    amount.setError(error || '');
    const dateError = checkDate(date.input.value);
    date.setError(dateError);
    const result = error ? {} : workOut();
    splitError.textContent = result.error || '';
    splitError.hidden = !result.error;
    if (!title || error || dateError || result.error) return;
    const bill = {
      groupId: group.id, kind: 'bill', date: date.input.value, title, amountPaise: paise,
      paidBy, splitMode: mode, shares: result.shares,
    };
    const wasEditing = editingId;
    if (wasEditing) await update('splitItems', wasEditing, bill);
    else await add('splitItems', bill);
    await touchGroup();
    toast({ message: wasEditing ? `Saved changes to "${title}" ✨` : `Added "${title}" · ${formatMoney(paise)} ✨` });
    resetForm();
    await refresh();
    if (!wasEditing) what.input.focus();
  });

  // ---------- Balances, who pays whom, settle up ----------
  function settleForm(s) {
    const amt = input({ label: 'Amount (₹)', name: 'settleAmount', inputmode: 'decimal', value: amountText(s.amount) });
    const day = input({ label: 'Date', name: 'settleDate', type: 'date', value: today(), max: today() });
    const f = el('form', { className: 'stack', novalidate: true }, [
      amt, day,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { settlingKey = null; drawBalances(); } }),
        button({ label: 'Mark as paid', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { paise, error } = checkAmount(amt.input.value);
      amt.setError(error || '');
      const dateError = checkDate(day.input.value);
      day.setError(dateError);
      if (error || dateError) return;
      const payment = await add('splitItems', {
        groupId: group.id, kind: 'payment', date: day.input.value, amountPaise: paise, paidBy: s.from, paidTo: s.to,
      });
      settlingKey = null;
      await touchGroup();
      await refresh();
      toast({
        message: `Settled: ${paysText(group, s.from, s.to)} ${formatMoney(paise)} 🎉`,
        actionLabel: 'Undo',
        onAction: async () => { await remove('splitItems', payment.id); await refresh(); },
      });
    });
    queueMicrotask(() => amt.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [
      el('div', { className: 'list-item__title', text: `${paysText(group, s.from, s.to)}` }), f,
    ])]);
  }

  let suggestions = [];
  function drawBalances() {
    const bal = balancesOf(group, items);
    suggestions = whoPaysWhom(bal);
    const me = bal.get(ME) || 0;
    headYou.textContent = youText(me);
    if (!items.length) {
      balanceBox.replaceChildren(el('p', { className: 'progress-note', text: 'Add a bill above and the balances show up here.' }));
      return;
    }
    const people = list(members(group).map((m) => {
      const v = bal.get(m.id) || 0;
      const meta = v > 0 ? `gets back ${formatMoney(v)}` : v < 0 ? `owes ${formatMoney(-v)}` : 'settled ✅';
      return listItem({ title: m.name, meta });
    }));
    const pays = suggestions.length
      ? list(suggestions.map((s) => {
        const key = `${s.from}>${s.to}`;
        if (key === settlingKey) return settleForm(s);
        return listItem({
          title: paysText(group, s.from, s.to),
          meta: formatMoney(s.amount),
          actions: [button({ label: 'Settle up', variant: 'secondary', onClick: () => { settlingKey = key; drawBalances(); } })],
        });
      }))
      : el('p', { className: 'progress-note', text: 'Everyone is settled up 🎉' });
    balanceBox.replaceChildren(
      people,
      el('h3', { className: 'list-group__title' }, [el('span', { text: 'Who pays whom' })]),
      pays,
      button({ label: '📤 Share summary', variant: 'secondary', block: true, onClick: shareSummary }),
    );
  }

  async function shareSummary() {
    const lines = suggestions.length
      ? suggestions.map((s) => `• ${paysText(group, s.from, s.to)} ${formatMoney(s.amount)}`)
      : ['Everyone is settled up 🎉'];
    const total = items.filter((x) => x.kind === 'bill').reduce((s, x) => s + x.amountPaise, 0);
    const text = [`🤝 ${group.emoji} ${group.name}`, `Total bills: ${formatMoney(total)}`, ...lines].join('\n');
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast({ message: 'Summary copied 📋 Paste it in WhatsApp or anywhere.' });
    } catch (err) {
      if (err?.name !== 'AbortError') toast({ message: "Couldn't share this time. Please try again." });
    }
  }

  // ---------- History ----------
  function historyRow(it) {
    if (it.kind === 'payment') {
      return listItem({
        title: `💸 ${nameOf(group, it.paidBy)} paid ${nameOf(group, it.paidTo)}`,
        subtitle: formatDate(it.date),
        meta: formatMoney(it.amountPaise),
        actions: [deleteButton(it, 'this payment')],
      });
    }
    const mine = it.shares.find((s) => s.member === ME)?.sharePaise;
    const how = MODES.find((m) => m.key === it.splitMode)?.label.toLowerCase() || 'equally';
    return listItem({
      title: it.title,
      subtitle: [`${nameOf(group, it.paidBy)} paid`, `split ${how}`, mine ? `your share ${formatMoney(mine)}` : 'not in your share', formatDate(it.date)].join(' · '),
      meta: formatMoney(it.amountPaise),
      onClick: () => editBill(it),
      actions: [deleteButton(it, `"${it.title}"`)],
    });
  }

  function deleteButton(it, what) {
    return button({
      icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${what}`,
      onClick: async () => {
        const removed = await remove('splitItems', it.id);
        if (editingId === it.id) resetForm();
        await refresh();
        if (!removed) return;
        toast({
          message: `Deleted ${what}`,
          actionLabel: 'Undo',
          onAction: async () => { await restore('splitItems', removed); await refresh(); },
        });
      },
    });
  }

  function drawHistory() {
    historyBox.replaceChildren(items.length
      ? list([...items].sort(sortItems).map(historyRow))
      : emptyState({ emoji: '🧾', title: 'No bills yet', text: 'Add the first one above.' }));
  }

  // ---------- Group settings ----------
  async function touchGroup() { group = await update('splitGroups', group.id, {}) || group; }

  function drawSettings() {
    const rename = input({ label: 'Group name', name: 'rename', value: group.name });
    rename.input.maxLength = MAX_NAME;
    const emoji = pills(GROUP_EMOJI.map((x) => ({ key: x, label: x })), { selected: group.emoji });
    const renameForm = el('form', { className: 'stack', novalidate: true }, [
      rename,
      el('div', { className: 'field' }, [el('div', { className: 'field__label', text: 'Emoji' }), emoji]),
      button({ label: 'Save name', variant: 'secondary', type: 'submit', block: true }),
    ]);
    renameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = cleanText(rename.input.value);
      rename.setError(name ? '' : 'Type a name, e.g. Goa trip');
      if (!name) return;
      group = await update('splitGroups', group.id, { name, emoji: emoji.value() });
      toast({ message: `Saved ${group.emoji} ${group.name} ✨` });
      drawAll();
    });

    const addPerson = input({ label: 'Add people', name: 'addPeople', placeholder: 'e.g. Sam, Neha' });
    const addForm = el('form', { className: 'stack', novalidate: true }, [
      addPerson,
      button({ label: 'Add', icon: 'plus', variant: 'secondary', type: 'submit', block: true }),
    ]);
    addPerson.input.addEventListener('input', () => addPerson.setError(''));
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { names, error } = readPeople(addPerson.input.value, group.people.map((p) => p.name));
      const err = error || (names.length ? '' : 'Type a name, e.g. Sam');
      addPerson.setError(err);
      if (err) return;
      group = await update('splitGroups', group.id, { people: [...group.people, ...names.map((n) => ({ id: newId(), name: n }))] });
      for (const p of group.people) included.add(p.id);
      toast({ message: `Added ${names.join(', ')} ✨` });
      drawAll();
    });

    const peopleRows = list(group.people.map((p) => listItem({
      title: p.name,
      actions: [button({
        icon: 'trash', variant: 'ghost', ariaLabel: `Remove ${p.name}`,
        onClick: async () => {
          const used = items.some((x) => x.paidBy === p.id || x.paidTo === p.id || (x.shares || []).some((s) => s.member === p.id));
          if (used) { toast({ message: `${p.name} is in bills here, so they can't be removed. Delete those bills first.` }); return; }
          if (group.people.length === 1) { toast({ message: 'A group needs at least one other person.' }); return; }
          const before = group.people;
          group = await update('splitGroups', group.id, { people: before.filter((x) => x.id !== p.id) });
          included.delete(p.id);
          drawAll();
          toast({
            message: `Removed ${p.name}`,
            actionLabel: 'Undo',
            onAction: async () => { group = await update('splitGroups', group.id, { people: before }); included.add(p.id); drawAll(); },
          });
        },
      })],
    })));

    const archiveButton = button({
      label: group.archived ? '📂 Bring back from archive' : '📦 Archive group', variant: 'secondary', block: true,
      onClick: async () => {
        group = await update('splitGroups', group.id, { archived: !group.archived });
        toast({ message: group.archived ? 'Archived 📦 Find it under "Archived groups".' : 'Back in your groups ✨' });
        drawAll();
      },
    });
    const deleteGroup = button({
      label: 'Delete group and its bills', variant: 'danger', block: true,
      onClick: async () => {
        const gone = await remove('splitGroups', group.id);
        const goneItems = [];
        for (const it of items) { const r = await remove('splitItems', it.id); if (r) goneItems.push(r); }
        // Waits for the move to the groups list, so the Undo message isn't hidden by the screen change.
        await new Promise((resolve) => {
          window.addEventListener('hashchange', () => resolve(), { once: true });
          navigate('money/split');
        });
        toast({
          message: `Deleted ${gone.emoji} ${gone.name}`,
          actionLabel: 'Undo',
          onAction: async () => {
            await restore('splitGroups', gone);
            for (const r of goneItems) await restore('splitItems', r);
            navigate(`money/split/${gone.id}`);
          },
          duration: 8000,
        });
      },
    });

    settingsBox.replaceChildren(el('details', { className: 'settings-details' }, [
      el('summary', { text: '⚙️ Group settings' }),
      el('div', { className: 'stack' }, [
        renameForm,
        el('h3', { className: 'list-group__title' }, [el('span', { text: 'People' })]),
        el('p', { className: 'muted', text: 'You are always in the group.' }),
        peopleRows,
        addForm,
        archiveButton,
        deleteGroup,
      ]),
    ]));
  }

  function drawHead() {
    headTitle.textContent = `${group.emoji} ${group.name}${group.archived ? ' (archived)' : ''}`;
    headPeople.textContent = members(group).map((m) => m.name).join(' · ');
  }

  function drawAll() {
    drawHead();
    drawPaidBy();
    drawSplit();
    drawBalances();
    drawHistory();
    drawSettings();
  }

  async function refresh() {
    items = (await listAll('splitItems')).filter((x) => x.groupId === group.id);
    const me = balancesOf(group, items).get(ME) || 0;
    if (me < 0) buddyMood('worried', `You owe ${formatMoney(-me)} here. {name} will remind you 🧮`);
    else if (me > 0) buddyMood('content', `You get back ${formatMoney(me)} here. {name} kept count 🧮`);
    else buddyMood(items.length ? 'happy' : 'calm', items.length ? 'All square! {name} is happy 🎉' : '{name} is ready to split 🧮');
    drawAll();
  }

  root.append(el('div', { className: 'mod-money stack' }, [
    backButton('All groups', 'money/split'),
    card({ children: [el('div', { className: 'stack' }, [
      el('h2', { className: 'card__title' }, [headTitle]), headPeople, headYou,
    ])] }),
    el('section', { className: 'card' }, [
      el('h2', { className: 'card__title' }, [el('span', { text: '🧾' }), formTitle]),
      el('div', { className: 'card__body' }, [billForm]),
    ]),
    card({ title: '⚖️ Balances', children: [balanceBox] }),
    card({ title: '📜 History', children: [historyBox] }),
    card({ children: [settingsBox] }),
  ]));
  await refresh();
}

/** "#/money/split" (path []) or "#/money/split/<group id>" (path [id]). */
export async function render(root, path = []) {
  if (path[0]) return groupScreen(root, path[0]);
  return groupsScreen(root);
}
