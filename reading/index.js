// 📚 reading module screens.
// RDG-1: books. Add a book (to "Reading now" or the wishlist), tap a book to edit it or change its status,
// lists of current, wishlist, finished and paused/dropped books, delete with Undo.
// RDG-2: check-ins. Log the page you're on (one per book per day), progress % on "Reading now" books,
// "Check-in due" after 3 days, a book's check-ins in its edit box (edit/delete with Undo).
// RDG-3: weekly reflection (Monday to Sunday, one per week). Moves to the top on a Sunday that has none yet;
// form with books, key idea, how I used it, ⭐ rating and next week's goal; past reflections (edit/delete with Undo).
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll } from '../core/storage.js';
import {
  today, formatDate, isoToKolkata, daysBetween, addDays, weekStart, isSunday,
} from '../core/dates.js';
import { formatNumber } from '../core/format.js';

const FORMATS = [
  { value: 'paper', label: '📖 Paper' },
  { value: 'ebook', label: '📱 Ebook' },
  { value: 'audio', label: '🎧 Audio' },
];
const STATUSES = [
  { value: 'reading', label: '📖 Reading now' },
  { value: 'wishlist', label: '🌟 Wishlist' },
  { value: 'paused', label: '⏸️ Paused' },
  { value: 'finished', label: '🎉 Finished' },
  { value: 'dropped', label: '👋 Dropped' },
];
const RATINGS = [
  { value: '', label: 'No rating' },
  ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: '⭐'.repeat(n) })),
];
const MAX_PAGES = 20000;
const MAX_NAME = 60;
// Lent, gifted or borrowed (extra, asked for after RDG-2). `who` is the label for the person's name box.
const LEND_TYPES = [
  { value: '', label: 'No' },
  { value: 'lent', label: '📤 Lent to', who: 'Lent to', ask: 'who you lent it to', back: 'Got it back on (optional)' },
  { value: 'gifted', label: '🎁 Gifted to', who: 'Gifted to', ask: 'who you gave it to' },
  { value: 'borrowed', label: '📥 Borrowed from', who: 'Borrowed from', ask: 'who you borrowed it from', back: 'Gave it back on (optional)' },
  { value: 'gift', label: '💝 Gift from', who: 'Gift from', ask: 'who gave it to you' },
];
const lendInfo = (type) => LEND_TYPES.find((x) => x.value === type && type);
const formatEmoji = (f) => (FORMATS.find((x) => x.value === f)?.label || '📖').split(' ')[0];
const show = (node, on) => { node.style.display = on ? '' : 'none'; };
const statusLabel = (s) => STATUSES.find((x) => x.value === s)?.label.replace(/^\S+\s/, '') || s;

/**
 * The book form's boxes (used for adding and for editing). `statuses` limits the status choices.
 * Gives back { node, read(), setError() }; read() checks the boxes and gives back { data } or { error }.
 */
function bookFields(book = {}, statuses = STATUSES) {
  const title = input({ label: 'Title', name: 'title', value: book.title || '', required: true });
  const author = input({ label: 'Author (optional)', name: 'author', value: book.author || '' });
  const pages = input({
    label: 'Total pages', name: 'totalPages', type: 'number', inputmode: 'numeric', min: 1, max: MAX_PAGES, step: 1,
    value: book.totalPages ? String(book.totalPages) : '',
  });
  const format = input({ label: 'Format', name: 'format', type: 'select', options: FORMATS, value: book.format || 'paper' });
  const status = input({ label: 'Status', name: 'status', type: 'select', options: statuses, value: book.status || statuses[0].value });
  const start = input({ label: 'Started on', name: 'startDate', type: 'date', max: today(), value: book.startDate || '' });
  const finish = input({ label: 'Finished on', name: 'finishDate', type: 'date', max: today(), value: book.finishDate || '' });
  const rating = input({ label: 'Rating (optional)', name: 'rating', type: 'select', options: RATINGS, value: book.rating ? String(book.rating) : '' });
  const suggested = input({ label: '💡 Suggested by (optional)', name: 'suggestedBy', value: book.suggestedBy || '' });
  const lendType = input({
    label: '🤝 Lent, gifted or borrowed?', name: 'lendType', type: 'select', options: LEND_TYPES, value: book.lendType || '',
  });
  const lendPerson = input({ label: 'Name', name: 'lendPerson', value: book.lendPerson || '' });
  const lendDate = input({ label: 'On', name: 'lendDate', type: 'date', max: today(), value: book.lendDate || '' });
  const lendBack = input({ label: 'Back on (optional)', name: 'lendBackDate', type: 'date', max: today(), value: book.lendBackDate || '' });
  const all = [title, author, pages, format, status, start, finish, rating, suggested, lendType, lendPerson, lendDate, lendBack];

  // Show the name, date and "back on" boxes only when they fit the lend choice.
  function showForLend() {
    const info = lendInfo(lendType.input.value);
    [lendPerson, lendDate].forEach((f) => show(f, Boolean(info)));
    show(lendBack, Boolean(info?.back));
    if (!info) return;
    lendPerson.querySelector('.field__label').textContent = `${info.who} (name)`;
    if (info.back) lendBack.querySelector('.field__label').textContent = info.back;
    if (!lendDate.input.value) lendDate.input.value = today();
  }
  lendType.input.addEventListener('change', showForLend);
  showForLend();

  // Show only the boxes that fit the status, and fill in today's date when a date becomes needed.
  function showForStatus() {
    const s = status.input.value;
    const wish = s === 'wishlist';
    const done = s === 'finished';
    show(start, !wish);
    show(finish, done);
    show(rating, done);
    pages.querySelector('.field__label').textContent = wish ? 'Total pages (optional)' : 'Total pages';
    if (!wish && !start.input.value) start.input.value = today();
    if (done && !finish.input.value) finish.input.value = today();
  }
  status.input.addEventListener('change', showForStatus);
  all.forEach((f) => f.input.addEventListener('input', () => f.setError('')));
  showForStatus();

  function read() {
    all.forEach((f) => f.setError(''));
    const s = status.input.value;
    const name = title.input.value.trim();
    if (!name) return { error: [title, 'Please type the book title.'] };
    const pagesText = pages.input.value.trim();
    const n = Number(pagesText);
    if (pagesText && (!Number.isInteger(n) || n < 1 || n > MAX_PAGES)) {
      return { error: [pages, `Pages should be a whole number from 1 to ${formatNumber(MAX_PAGES)}.`] };
    }
    if (!pagesText && s !== 'wishlist') return { error: [pages, 'Please type how many pages the book has.'] };
    const data = {
      title: name,
      author: author.input.value.trim(),
      totalPages: pagesText ? n : null,
      format: format.input.value,
      status: s,
      startDate: null,
      finishDate: null,
      rating: null,
    };
    if (s !== 'wishlist') {
      const d = start.input.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: [start, 'Please pick the date you started.'] };
      if (d > today()) return { error: [start, "The start date can't be in the future."] };
      data.startDate = d;
    }
    if (s === 'finished') {
      const d = finish.input.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: [finish, 'Please pick the date you finished.'] };
      if (d > today()) return { error: [finish, "The finish date can't be in the future."] };
      if (d < data.startDate) return { error: [finish, "The finish date can't be before the start date."] };
      data.finishDate = d;
      data.rating = rating.input.value ? Number(rating.input.value) : null;
    }
    const by = suggested.input.value.trim();
    if (by.length > MAX_NAME) return { error: [suggested, `Please keep the name under ${MAX_NAME} letters.`] };
    data.suggestedBy = by;
    Object.assign(data, { lendType: '', lendPerson: '', lendDate: null, lendBackDate: null });
    const info = lendInfo(lendType.input.value);
    if (info) {
      const who = lendPerson.input.value.trim();
      if (!who) return { error: [lendPerson, `Please type ${info.ask}.`] };
      if (who.length > MAX_NAME) return { error: [lendPerson, `Please keep the name under ${MAX_NAME} letters.`] };
      const d = lendDate.input.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: [lendDate, 'Please pick the date.'] };
      if (d > today()) return { error: [lendDate, "The date can't be in the future."] };
      Object.assign(data, { lendType: info.value, lendPerson: who, lendDate: d });
      const back = info.back ? lendBack.input.value : '';
      if (back) {
        if (back > today()) return { error: [lendBack, "The date can't be in the future."] };
        if (back < d) return { error: [lendBack, `This can't be before ${formatDate(d)}.`] };
        data.lendBackDate = back;
      }
    }
    return { data };
  }

  return {
    nodes: all,
    read,
    showError: ([field, message]) => { field.setError(message); field.input.focus(); },
    reset() {
      [title, author, pages, start, finish, suggested, lendPerson, lendDate, lendBack].forEach((f) => { f.input.value = ''; });
      format.input.value = 'paper';
      rating.input.value = '';
      lendType.input.value = '';
      showForStatus();
      showForLend();
    },
  };
}

// The small grey line under a book's title.
function bookSubtitle(b) {
  const parts = [`${formatEmoji(b.format)}${b.author ? ` ${b.author}` : ''}`];
  if (b.totalPages) parts.push(`${formatNumber(b.totalPages)} pages`);
  if (b.status === 'finished' && b.finishDate) parts.push(`Finished ${formatDate(b.finishDate)}`);
  else if (b.status === 'wishlist') parts.push(`Added ${formatDate(isoToKolkata(b.createdAt).slice(0, 10))}`);
  else if (b.startDate) parts.push(`Started ${formatDate(b.startDate)}`);
  return parts.join(' · ');
}

// "📤 Lent to Rahul · 20 Nov 2026" (or "↩️ … back 24 Nov 2026" once returned).
function lendText(b) {
  const info = lendInfo(b.lendType);
  if (!info) return '';
  const emoji = b.lendBackDate ? '↩️' : info.label.split(' ')[0];
  const when = b.lendBackDate ? `back ${formatDate(b.lendBackDate)}` : formatDate(b.lendDate);
  return `${emoji} ${info.who} ${b.lendPerson} · ${when}`;
}

// The people line under a book: who suggested it, and who it's lent to / from.
function peopleText(b) {
  return [b.suggestedBy ? `💡 Suggested by ${b.suggestedBy}` : '', lendText(b)].filter(Boolean).join(' · ');
}

// ---------- check-ins (RDG-2) ----------
const DUE_AFTER_DAYS = 3;
const MAX_MINUTES = 1440;
const newestCheckin = (a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt);
const percentOf = (page, total) => (total ? Math.min(100, Math.round((page / total) * 100)) : null);
const pageText = (page, total) => (total
  ? `p. ${formatNumber(page)} of ${formatNumber(total)} · ${percentOf(page, total)}%`
  : `p. ${formatNumber(page)}`);
function agoText(ymd) {
  const d = daysBetween(ymd, today());
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

/**
 * Check-in boxes (page, date, minutes, note), used for adding and editing.
 * `getBook()` gives the book the check-in is for (for its page count and start date).
 */
function checkinFields(getBook, c = {}) {
  const page = input({
    label: 'Page I\'m on', name: 'currentPage', type: 'number', inputmode: 'numeric', min: 1, step: 1,
    value: c.currentPage ? String(c.currentPage) : '',
  });
  const date = input({ label: 'Date', name: 'date', type: 'date', max: today(), value: c.date || today() });
  const minutes = input({
    label: 'Minutes read (optional)', name: 'minutesRead', type: 'number', inputmode: 'numeric', min: 1, max: MAX_MINUTES, step: 1,
    value: c.minutesRead ? String(c.minutesRead) : '',
  });
  const note = input({ label: 'Note (optional)', name: 'note', type: 'textarea', value: c.note || '' });
  const all = [page, date, minutes, note];
  all.forEach((f) => f.input.addEventListener('input', () => f.setError('')));

  function read() {
    all.forEach((f) => f.setError(''));
    const book = getBook();
    const max = book?.totalPages || MAX_PAGES;
    const n = Number(page.input.value.trim());
    if (!page.input.value.trim() || !Number.isInteger(n) || n < 1 || n > max) {
      return { error: [page, book?.totalPages
        ? `Page should be a whole number from 1 to ${formatNumber(max)} (the book has ${formatNumber(max)} pages).`
        : `Page should be a whole number from 1 to ${formatNumber(max)}.`] };
    }
    const d = date.input.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: [date, 'Please pick the date.'] };
    if (d > today()) return { error: [date, "The date can't be in the future."] };
    if (book?.startDate && d < book.startDate) {
      return { error: [date, `You started this book on ${formatDate(book.startDate)}, so the date can't be before that.`] };
    }
    const minText = minutes.input.value.trim();
    const m = Number(minText);
    if (minText && (!Number.isInteger(m) || m < 1 || m > MAX_MINUTES)) {
      return { error: [minutes, `Minutes should be a whole number from 1 to ${formatNumber(MAX_MINUTES)}.`] };
    }
    if (note.input.value.trim().length > MAX_TEXT) {
      return { error: [note, `Please keep the note under ${formatNumber(MAX_TEXT)} letters.`] };
    }
    return { data: { date: d, currentPage: n, minutesRead: minText ? m : null, note: note.input.value.trim() } };
  }

  return {
    nodes: [el('div', { className: 'field-row' }, [date, page]), minutes, note],
    page,
    date,
    read,
    showError: ([field, message]) => { field.setError(message); field.input.focus(); },
    reset() {
      page.input.value = '';
      minutes.input.value = '';
      note.input.value = '';
      date.input.value = today();
      date.input.max = today();
      all.forEach((f) => f.setError(''));
    },
  };
}

// ---------- weekly reflection helpers (RDG-3) ----------
const MAX_TEXT = 20000; // the most Google Sync accepts in one box (google-apps-script/Code.gs LIMITS.text)
const WEEKS_BACK = 12; // weeks offered in the "Week" box (this week and 11 before it)
const weekEndOf = (ws) => addDays(ws, 6);
const thisWeekStart = () => weekStart(today());

// "17–23 Nov 2026", "24 Nov – 30 Dec 2026" or "29 Dec 2025 – 4 Jan 2026".
function weekText(ws) {
  const end = weekEndOf(ws);
  const a = formatDate(ws);
  const b = formatDate(end);
  if (ws.slice(0, 7) === end.slice(0, 7)) return `${Number(ws.slice(8))}–${b}`;
  if (ws.slice(0, 4) === end.slice(0, 4)) return `${a.replace(/ \d{4}$/, '')} – ${b}`;
  return `${a} – ${b}`;
}

function weekChoiceLabel(ws) {
  const now = thisWeekStart();
  const prefix = ws === now ? 'This week · ' : ws === addDays(now, -7) ? 'Last week · ' : '';
  return `${prefix}${weekText(ws)}`;
}

// 1–5 ⭐ pill buttons; the picked number is at group.value (0 = none yet).
function starPicker(value = 0) {
  const label = '⭐ How was your reading week?';
  const error = el('div', { className: 'field__error', hidden: true });
  const group = el('div', { className: 'field' });
  const buttons = [1, 2, 3, 4, 5].map((n) => button({
    label: `${n}⭐`, variant: 'secondary', ariaLabel: `${n} star${n === 1 ? '' : 's'}`, onClick: () => pick(n),
  }));
  function pick(n) {
    group.value = n;
    buttons.forEach((b, i) => {
      const on = i + 1 === n;
      b.classList.toggle('btn--primary', on);
      b.classList.toggle('btn--secondary', !on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (n) group.setError('');
  }
  group.append(
    el('div', { className: 'field__label', text: label }),
    el('div', { className: 'btn-row', role: 'group', 'aria-label': label }, buttons),
    error,
  );
  group.pick = pick;
  group.setError = (message) => { error.textContent = message || ''; error.hidden = !message; };
  group.focus = () => buttons[0].focus();
  pick(value);
  return group;
}

export async function render(root) {
  let books = [];
  let checkins = [];
  let reflections = [];
  let editingId = null;
  let editingCheckinId = null;
  let editingReflectionId = null;
  const checkinsOf = (bookId) => checkins.filter((c) => c.bookId === bookId).sort(newestCheckin);
  const bookById = (id) => books.find((b) => b.id === id);

  const readingBox = el('div');
  const wishBox = el('div');
  const finishedBox = el('div');
  const otherBox = el('div');
  const peopleBox = el('div', { className: 'stack' });
  const otherCard = card({ title: 'Paused & dropped', children: [otherBox] });

  // ---------- Add a book ----------
  const addFields = bookFields({}, STATUSES.filter((s) => s.value === 'reading' || s.value === 'wishlist'));
  addFields.nodes[4].querySelector('.field__label').textContent = 'Add to';
  const addForm = el('form', { className: 'stack', novalidate: true }, [
    ...addFields.nodes,
    button({ label: 'Add book', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = addFields.read();
    if (error) { addFields.showError(error); return; }
    await add('books', data);
    addFields.reset();
    toast({ message: data.status === 'wishlist' ? `Added “${data.title}” to your wishlist 🌟` : `Happy reading “${data.title}” 📚` });
    await refresh();
  });

  // ---------- Check in (RDG-2) ----------
  const checkBook = input({ label: 'Book', name: 'bookId', type: 'select', options: [] });
  const checkFields = checkinFields(() => bookById(checkBook.input.value));
  const lastHint = el('p', { className: 'field__hint' });
  const checkForm = el('form', { className: 'stack', novalidate: true }, [
    checkBook,
    lastHint,
    ...checkFields.nodes,
    button({ label: 'Save check-in', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  const checkEmpty = emptyState({
    emoji: '📖', title: 'No book on the go', text: 'Start a book to check in your progress.',
  });

  // "Last time: p. 120 of 300 · 40% · 2 days ago" under the book choice.
  function showLastHint() {
    const book = bookById(checkBook.input.value);
    const last = book ? checkinsOf(book.id)[0] : null;
    lastHint.textContent = last
      ? `Last time: ${pageText(last.currentPage, book.totalPages)} · ${agoText(last.date)}`
      : 'No check-ins for this book yet.';
    checkFields.page.input.max = book?.totalPages || MAX_PAGES;
  }
  checkBook.input.addEventListener('change', showLastHint);

  checkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const book = bookById(checkBook.input.value);
    if (!book) return;
    const { data, error } = checkFields.read();
    if (error) { checkFields.showError(error); return; }
    // One check-in per book per day: a second one that day replaces the first.
    const same = checkins.find((c) => c.bookId === book.id && c.date === data.date);
    if (same) await update('checkins', same.id, data);
    else await add('checkins', { ...data, bookId: book.id });
    checkFields.reset();
    const done = book.totalPages && data.currentPage >= book.totalPages;
    toast({
      message: done ? 'Last page! 🎉 Tap the book to mark it Finished.'
        : `${same ? 'Updated' : 'Saved'}: ${pageText(data.currentPage, book.totalPages)} 📚`,
    });
    await refresh();
  });

  function fillCheckinCard() {
    const reading = books.filter((b) => b.status === 'reading').sort((a, b) => a.title.localeCompare(b.title));
    const chosen = checkBook.input.value;
    checkBook.input.replaceChildren(...reading.map((b) => el('option', { value: b.id, text: b.title })));
    if (reading.some((b) => b.id === chosen)) checkBook.input.value = chosen;
    show(checkForm, reading.length > 0);
    show(checkEmpty, reading.length === 0);
    if (reading.length) showLastHint();
  }

  // ---------- Lists ----------
  function editRow(book) {
    const fields = bookFields(book);
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      ...fields.nodes,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
      button({ label: 'Delete book', icon: 'trash', variant: 'danger', block: true, onClick: () => deleteBook(book) }),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { data, error } = fields.read();
      if (error) { fields.showError(error); return; }
      await update('books', book.id, data);
      editingId = null;
      toast({ message: data.status === book.status ? 'Saved ✨' : `Moved to ${statusLabel(data.status)} ✨` });
      await refresh();
    });
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [
      el('div', { className: 'stack' }, [editForm, checkinSection(book)]),
    ])]);
  }

  // A book's check-ins, shown under its edit boxes (RDG-2).
  function checkinSection(book) {
    const items = checkinsOf(book.id);
    return el('div', { className: 'stack' }, [
      el('div', { className: 'list-group__title' }, [
        el('span', { text: '📍 Check-ins' }),
        el('span', { text: items.length ? String(items.length) : '' }),
      ]),
      items.length
        ? list(items.map((c) => checkinRow(book, c)))
        : el('p', { className: 'field__hint', text: 'No check-ins for this book yet.' }),
    ]);
  }

  function checkinRow(book, c) {
    if (c.id === editingCheckinId) {
      const fields = checkinFields(() => book, c);
      const form = el('form', { className: 'stack', novalidate: true }, [
        ...fields.nodes,
        el('div', { className: 'btn-row' }, [
          button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingCheckinId = null; refresh(); } }),
          button({ label: 'Save', variant: 'primary', type: 'submit' }),
        ]),
      ]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = fields.read();
        if (error) { fields.showError(error); return; }
        const clash = checkins.find((x) => x.bookId === book.id && x.date === data.date && x.id !== c.id);
        if (clash) {
          fields.showError([fields.date, 'This book already has a check-in on that day. Edit that one instead.']);
          return;
        }
        await update('checkins', c.id, data);
        editingCheckinId = null;
        toast({ message: 'Saved ✨' });
        await refresh();
      });
      return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
    }
    const sub = [formatDate(c.date)];
    if (c.minutesRead) sub.push(`${formatNumber(c.minutesRead)} min`);
    if (c.note) sub.push(c.note);
    return listItem({
      title: pageText(c.currentPage, book.totalPages),
      subtitle: sub.join(' · '),
      onClick: () => { editingCheckinId = c.id; refresh(); },
      actions: [button({
        icon: 'trash', variant: 'ghost', ariaLabel: `Delete check-in of ${formatDate(c.date)}`, onClick: () => deleteCheckin(c),
      })],
    });
  }

  async function deleteCheckin(c) {
    const removed = await remove('checkins', c.id);
    if (editingCheckinId === c.id) editingCheckinId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted check-in · p. ${formatNumber(removed.currentPage)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('checkins', removed);
        if (readingBox.isConnected) await refresh();
      },
    });
  }

  async function deleteBook(book) {
    // The book's check-ins go with it (and come back with Undo).
    const removedCheckins = [];
    for (const c of checkinsOf(book.id)) {
      const r = await remove('checkins', c.id);
      if (r) removedCheckins.push(r);
    }
    const removed = await remove('books', book.id);
    if (editingId === book.id) editingId = null;
    await refresh();
    if (!removed) return;
    const n = removedCheckins.length;
    toast({
      message: `Deleted “${removed.title}”${n ? ` and ${n} check-in${n === 1 ? '' : 's'}` : ''}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('books', removed);
        for (const r of removedCheckins) await restore('checkins', r);
        if (readingBox.isConnected) await refresh();
      },
    });
  }

  async function startReading(book) {
    await update('books', book.id, { status: 'reading', startDate: today() });
    toast({ message: `Happy reading “${book.title}” 📚` });
    await refresh();
  }

  function bookRow(book) {
    if (book.id === editingId) return editRow(book);
    const actions = [];
    if (book.status === 'wishlist') {
      actions.push(button({
        label: 'Start', variant: 'secondary', ariaLabel: `Start reading ${book.title}`, onClick: () => startReading(book),
      }));
    }
    actions.push(button({
      icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${book.title}`, onClick: () => deleteBook(book),
    }));
    const last = checkinsOf(book.id)[0];
    const reading = book.status === 'reading';
    const row = listItem({
      title: book.title,
      subtitle: bookSubtitle(book),
      meta: book.status === 'finished' && book.rating ? '⭐'.repeat(book.rating)
        : (['paused', 'dropped'].includes(book.status) ? statusLabel(book.status) : null),
      onClick: () => { editingId = book.id; editingCheckinId = null; refresh(); },
      actions,
    });
    if (reading) {
      // Progress from the latest check-in, and "Check-in due" after 3 days (RDG-2).
      const main = row.querySelector('.list-item__main');
      const since = last?.date || book.startDate;
      const due = since && daysBetween(since, today()) >= DUE_AFTER_DAYS;
      if (book.totalPages && last) {
        main.append(progressBar({ value: last.currentPage, max: book.totalPages, label: `${book.title}: pages read` }));
      }
      const parts = [];
      if (due) parts.push('📌 Check-in due');
      parts.push(last ? `${pageText(last.currentPage, book.totalPages)} · ${agoText(last.date)}` : 'No check-ins yet');
      main.append(el('div', { className: 'list-item__subtitle', text: parts.join(' · ') }));
    }
    const people = peopleText(book);
    if (people) row.querySelector('.list-item__main').append(el('div', { className: 'list-item__subtitle', text: people }));
    return row;
  }

  // ---------- Lent, gifted & suggested ----------
  // Open a book's edit box from this card and scroll to it.
  async function openBook(book) {
    editingId = book.id;
    editingCheckinId = null;
    await refresh();
    root.querySelector('.list-item [name="title"]')?.closest('.list-item')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function markBack(book) {
    await update('books', book.id, { lendBackDate: today() });
    toast({
      message: book.lendType === 'lent' ? `Got “${book.title}” back from ${book.lendPerson} ✨` : `Gave “${book.title}” back to ${book.lendPerson} ✨`,
      actionLabel: 'Undo',
      onAction: async () => {
        await update('books', book.id, { lendBackDate: null });
        if (readingBox.isConnected) await refresh();
      },
    });
    await refresh();
  }

  function peopleRow(book, subtitle, action) {
    return listItem({ title: book.title, subtitle, onClick: () => openBook(book), actions: action ? [action] : [] });
  }

  function fillPeopleCard() {
    const lent = books.filter((b) => lendInfo(b.lendType));
    const open = (type) => lent.filter((b) => b.lendType === type && !b.lendBackDate)
      .sort((a, b) => a.lendDate.localeCompare(b.lendDate));
    const sinceText = (b) => {
      const d = daysBetween(b.lendDate, today());
      return `${lendText(b)}${d > 0 ? ` · ${d} day${d === 1 ? '' : 's'} ago` : ''}`;
    };
    const groups = [
      ['📤 With someone else', open('lent').map((b) => peopleRow(b, sinceText(b),
        button({ label: 'Got it back', variant: 'secondary', ariaLabel: `Got ${b.title} back`, onClick: () => markBack(b) })))],
      ['📥 To give back', open('borrowed').map((b) => peopleRow(b, sinceText(b),
        button({ label: 'Gave it back', variant: 'secondary', ariaLabel: `Gave ${b.title} back`, onClick: () => markBack(b) })))],
      ['🎁 Gifts', lent.filter((b) => b.lendType === 'gifted' || b.lendType === 'gift')
        .sort((a, b) => b.lendDate.localeCompare(a.lendDate)).map((b) => peopleRow(b, lendText(b)))],
      ['↩️ Back home', lent.filter((b) => b.lendBackDate)
        .sort((a, b) => b.lendBackDate.localeCompare(a.lendBackDate)).map((b) => peopleRow(b, lendText(b)))],
      ['💡 Suggested by', books.filter((b) => b.suggestedBy)
        .sort((a, b) => a.suggestedBy.localeCompare(b.suggestedBy) || a.title.localeCompare(b.title))
        .map((b) => peopleRow(b, `💡 ${b.suggestedBy}`))],
    ].filter(([, rows]) => rows.length);
    peopleBox.replaceChildren(...(groups.length
      ? groups.map(([heading, rows]) => el('div', { className: 'stack' }, [
        el('div', { className: 'list-group__title' }, [el('span', { text: heading }), el('span', { text: String(rows.length) })]),
        list(rows),
      ]))
      : [emptyState({
        emoji: '🤝', title: 'Nothing here yet',
        text: 'Tap a book to note who suggested it, or who you lent it to, gifted it to or borrowed it from.',
      })]));
  }

  // ---------- Weekly reflection (RDG-3) ----------
  const reflectionOfWeek = (ws) => reflections.find((r) => r.weekStart === ws);

  // The week the form opens on: this week on Sunday; on other days last week if it has no reflection yet.
  function defaultWeek() {
    const now = thisWeekStart();
    const last = addDays(now, -7);
    return !isSunday(today()) && !reflectionOfWeek(last) ? last : now;
  }

  // Books worth offering for a week: checked in that week, being read then, finished that week, or already picked.
  function booksForWeek(ws, picked) {
    const end = weekEndOf(ws);
    const inWeek = (d) => d && d >= ws && d <= end;
    const checked = new Set(checkins.filter((c) => inWeek(c.date)).map((c) => c.bookId));
    const offered = books.filter((b) => picked.has(b.id) || checked.has(b.id)
      || (b.status === 'reading' && b.startDate && b.startDate <= end)
      || (b.status === 'finished' && inWeek(b.finishDate)));
    return { offered: offered.sort((a, b) => a.title.localeCompare(b.title)), checked };
  }

  /**
   * Reflection boxes. With `r` (editing a saved one) the week can change but can't clash with another.
   * Without `r` (the add form), picking a week that already has a reflection loads it, so saving updates it.
   */
  function reflectionFields(r = null) {
    const now = thisWeekStart();
    const weeks = Array.from({ length: WEEKS_BACK }, (_, i) => addDays(now, -7 * i));
    if (r && !weeks.includes(r.weekStart)) weeks.push(r.weekStart);
    const week = input({
      label: '📅 Week', name: 'weekStart', type: 'select',
      options: weeks.map((w) => ({ value: w, label: weekChoiceLabel(w) })), value: r?.weekStart || defaultWeek(),
    });
    const weekNote = el('p', { className: 'field__hint' });
    const bookBox = el('div', { className: 'pill-wrap', role: 'group', 'aria-label': 'Books I read this week' });
    const bookHint = el('p', { className: 'field__hint' });
    const bookField = el('div', { className: 'field' }, [
      el('div', { className: 'field__label', text: '📚 Books I read this week (tap to pick)' }), bookBox, bookHint,
    ]);
    const keyIdea = input({ label: '💡 Key idea', name: 'keyIdea', type: 'textarea', value: r?.keyIdea || '' });
    const used = input({ label: '🛠️ How I used it (optional)', name: 'howIUsedIt', type: 'textarea', value: r?.howIUsedIt || '' });
    const stars = starPicker(r?.weekRating || 0);
    const goal = input({ label: '🎯 Next week\'s goal (optional)', name: 'nextWeekGoal', type: 'textarea', value: r?.nextWeekGoal || '' });
    const texts = [keyIdea, used, goal];
    texts.forEach((f) => f.input.addEventListener('input', () => f.setError('')));
    let picked = new Set(r?.bookIds || []);
    let loaded = null; // the saved reflection the add form is showing, if any

    function drawBooks() {
      const { offered } = booksForWeek(week.input.value, picked);
      bookBox.replaceChildren(...offered.map((b) => {
        const on = picked.has(b.id);
        const btn = button({
          label: `${on ? '✓ ' : ''}${b.title}`, variant: on ? 'primary' : 'secondary',
          onClick: () => { if (picked.has(b.id)) picked.delete(b.id); else picked.add(b.id); drawBooks(); },
        });
        btn.setAttribute('aria-pressed', String(on));
        return btn;
      }));
      bookHint.textContent = offered.length ? '' : 'No books to pick for this week. That\'s fine, you can still reflect.';
      show(bookHint, !offered.length);
    }

    // Add form: load the week's saved reflection (or start fresh, ticking books checked in that week).
    function loadWeek() {
      const ws = week.input.value;
      const saved = r ? null : reflectionOfWeek(ws);
      if (saved) {
        keyIdea.input.value = saved.keyIdea || '';
        used.input.value = saved.howIUsedIt || '';
        goal.input.value = saved.nextWeekGoal || '';
        stars.pick(saved.weekRating || 0);
        picked = new Set(saved.bookIds || []);
      } else if (!r) {
        if (loaded) { texts.forEach((f) => { f.input.value = ''; }); stars.pick(0); }
        picked = booksForWeek(ws, new Set()).checked;
      }
      loaded = saved || null;
      weekNote.textContent = saved ? '✅ You already reflected on this week. Saving updates it.' : '';
      show(weekNote, Boolean(saved));
      texts.forEach((f) => f.setError(''));
      stars.setError('');
      drawBooks();
    }
    week.input.addEventListener('change', () => { week.setError(''); if (r) drawBooks(); else loadWeek(); });
    if (r) { show(weekNote, false); drawBooks(); } else loadWeek();

    function read() {
      week.setError('');
      texts.forEach((f) => f.setError(''));
      stars.setError('');
      const ws = week.input.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) return { error: [week, 'Please pick the week.'] };
      const idea = keyIdea.input.value.trim();
      if (!idea) return { error: [keyIdea, 'Please write the key idea from your reading this week.'] };
      for (const f of texts) {
        if (f.input.value.trim().length > MAX_TEXT) return { error: [f, `Please keep this under ${formatNumber(MAX_TEXT)} letters.`] };
      }
      if (!stars.value) return { error: [stars, 'Please tap 1 to 5 stars for your week.'] };
      return {
        data: {
          weekStart: ws,
          bookIds: [...picked].filter((id) => bookById(id)),
          keyIdea: idea,
          howIUsedIt: used.input.value.trim(),
          weekRating: stars.value,
          nextWeekGoal: goal.input.value.trim(),
        },
      };
    }

    return {
      nodes: [week, weekNote, bookField, keyIdea, used, stars, goal],
      week,
      read,
      isUpdate: () => Boolean(loaded),
      showError: ([field, message]) => { field.setError(message); (field.input || field).focus(); },
      refreshBooks: drawBooks,
      reset() { loaded = null; texts.forEach((f) => { f.input.value = ''; }); stars.pick(0); week.input.value = defaultWeek(); loadWeek(); },
    };
  }

  const reflectPrompt = el('p', { className: 'field__hint' });
  const reflectFields = reflectionFields();
  let reflectReady = false;
  const reflectSave = button({ label: 'Save reflection', icon: 'plus', variant: 'primary', type: 'submit', block: true });
  const reflectForm = el('form', { className: 'stack', novalidate: true }, [...reflectFields.nodes, reflectSave]);
  const pastBox = el('div', { className: 'stack' });
  const reflectCard = card({ title: 'Weekly reflection', module: 'reading', children: [el('div', { className: 'stack' }, [reflectPrompt, reflectForm, pastBox])] });
  const syncSaveLabel = () => {
    reflectSave.querySelector('span:last-child').textContent = reflectFields.isUpdate() ? 'Update reflection' : 'Save reflection';
  };
  reflectFields.week.input.addEventListener('change', syncSaveLabel);

  reflectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = reflectFields.read();
    if (error) { reflectFields.showError(error); return; }
    const same = reflectionOfWeek(data.weekStart);
    if (same) await update('reflections', same.id, data);
    else await add('reflections', data);
    toast({ message: `${same ? 'Updated' : 'Saved'} your reflection for ${weekText(data.weekStart)} 🌿` });
    await refresh();
    reflectFields.reset();
    syncSaveLabel();
  });

  function reflectionRow(r) {
    if (r.id === editingReflectionId) {
      const fields = reflectionFields(r);
      const form = el('form', { className: 'stack', novalidate: true }, [
        ...fields.nodes,
        el('div', { className: 'btn-row' }, [
          button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingReflectionId = null; refresh(); } }),
          button({ label: 'Save', variant: 'primary', type: 'submit' }),
        ]),
      ]);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = fields.read();
        if (error) { fields.showError(error); return; }
        const clash = reflections.find((x) => x.weekStart === data.weekStart && x.id !== r.id);
        if (clash) {
          fields.showError([fields.week, 'That week already has a reflection. Edit that one instead.']);
          return;
        }
        await update('reflections', r.id, data);
        editingReflectionId = null;
        toast({ message: 'Saved ✨' });
        await refresh();
      });
      return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
    }
    const titles = (r.bookIds || []).map((id) => bookById(id)?.title).filter(Boolean);
    const row = listItem({
      title: weekText(r.weekStart),
      subtitle: titles.length ? `📚 ${titles.join(', ')}` : null,
      meta: r.weekRating ? '⭐'.repeat(r.weekRating) : null,
      onClick: () => { editingReflectionId = r.id; refresh(); },
      actions: [button({
        icon: 'trash', variant: 'ghost', ariaLabel: `Delete reflection for ${weekText(r.weekStart)}`, onClick: () => deleteReflection(r),
      })],
    });
    row.querySelector('.list-item__main').append(el('div', { className: 'list-item__subtitle', text: `💡 ${r.keyIdea}` }));
    return row;
  }

  async function deleteReflection(r) {
    const removed = await remove('reflections', r.id);
    if (editingReflectionId === r.id) editingReflectionId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted reflection · ${weekText(removed.weekStart)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('reflections', removed);
        if (readingBox.isConnected) await refresh();
      },
    });
  }

  // The nudge line, the past list, and the card's place: at the top on a Sunday with no reflection yet.
  function fillReflectionCard() {
    const now = thisWeekStart();
    const sunday = isSunday(today());
    const doneThisWeek = Boolean(reflectionOfWeek(now));
    const missedLast = !reflectionOfWeek(addDays(now, -7));
    reflectPrompt.textContent = doneThisWeek ? '✅ This week\'s reflection is saved. See you next Sunday 🌿'
      : sunday ? '🌿 It\'s Sunday! Time to look back on your reading week ✨'
        : missedLast ? '🌿 Missed last Sunday? You can still reflect on last week.'
          : '🌿 Weeks run Monday to Sunday. You\'ll get a nudge here on Sunday.';
    const top = sunday && !doneThisWeek;
    if (top) screen.prepend(reflectCard);
    else screen.insertBefore(reflectCard, otherCard);

    const past = [...reflections].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    pastBox.replaceChildren(
      el('div', { className: 'list-group__title' }, [
        el('span', { text: '🗒️ Past reflections' }), el('span', { text: past.length ? String(past.length) : '' }),
      ]),
      past.length ? list(past.map(reflectionRow)) : emptyState({
        emoji: '🌿', title: 'No reflections yet', text: 'Your weekly reflections will show here.',
      }),
    );
    // First fill (saved data now known), or the reflection the form was showing was deleted: start fresh.
    if (!reflectReady || (reflectFields.isUpdate() && !reflectionOfWeek(reflectFields.week.input.value))) {
      reflectReady = true;
      reflectFields.reset();
    } else reflectFields.refreshBooks();
    syncSaveLabel();
  }

  function fill(box, items, empty) {
    box.replaceChildren(items.length ? list(items.map(bookRow)) : emptyState(empty));
  }

  async function refresh() {
    [books, checkins, reflections] = await Promise.all([listAll('books'), listAll('checkins'), listAll('reflections')]);
    fillCheckinCard();
    const newest = (field) => (a, b) => (b[field] || '').localeCompare(a[field] || '') || b.createdAt.localeCompare(a.createdAt);
    const of = (...statuses) => books.filter((b) => statuses.includes(b.status));
    fill(readingBox, of('reading').sort(newest('startDate')), {
      emoji: '📖', title: 'Nothing on the go', text: 'Add a book below, or start one from your wishlist.',
    });
    fill(wishBox, of('wishlist').sort(newest('createdAt')), {
      emoji: '🌟', title: 'Wishlist is empty', text: 'Add books you want to read one day.',
    });
    fill(finishedBox, of('finished').sort(newest('finishDate')), {
      emoji: '🎉', title: 'No finished books yet', text: 'Tap a book and set it to Finished when you\'re done.',
    });
    const other = of('paused', 'dropped').sort(newest('startDate'));
    show(otherCard, other.length > 0);
    fill(otherBox, other, {});
    fillPeopleCard();
    fillReflectionCard();
  }

  const screen = el('div', { className: 'mod-reading stack' }, [
    card({ title: 'Check in', module: 'reading', children: [checkForm, checkEmpty] }),
    card({ title: 'Reading now', module: 'reading', children: [readingBox] }),
    card({ title: 'Add a book', module: 'reading', children: [addForm] }),
    card({ title: 'Wishlist', children: [wishBox] }),
    card({ title: 'Finished', children: [finishedBox] }),
    otherCard,
    card({ title: 'Lent, gifted & suggested', children: [peopleBox] }),
  ]);
  root.append(screen);

  await refresh();
}
