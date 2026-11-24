// 📚 reading module screens.
// RDG-1: books. Add a book (to "Reading now" or the wishlist), tap a book to edit it or change its status,
// lists of current, wishlist, finished and paused/dropped books, delete with Undo.
// RDG-2: check-ins. Log the page you're on (one per book per day), progress % on "Reading now" books,
// "Check-in due" after 3 days, a book's check-ins in its edit box (edit/delete with Undo).
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll } from '../core/storage.js';
import { today, formatDate, isoToKolkata, daysBetween } from '../core/dates.js';
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
  const all = [title, author, pages, format, status, start, finish, rating];

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
    return { data };
  }

  return {
    nodes: all,
    read,
    showError: ([field, message]) => { field.setError(message); field.input.focus(); },
    reset() {
      [title, author, pages, start, finish].forEach((f) => { f.input.value = ''; });
      format.input.value = 'paper';
      rating.input.value = '';
      showForStatus();
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

export async function render(root) {
  let books = [];
  let checkins = [];
  let editingId = null;
  let editingCheckinId = null;
  const checkinsOf = (bookId) => checkins.filter((c) => c.bookId === bookId).sort(newestCheckin);
  const bookById = (id) => books.find((b) => b.id === id);

  const readingBox = el('div');
  const wishBox = el('div');
  const finishedBox = el('div');
  const otherBox = el('div');
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
          fields.showError([fields.date,'This book already has a check-in on that day. Edit that one instead.']);
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
    return row;
  }

  function fill(box, items, empty) {
    box.replaceChildren(items.length ? list(items.map(bookRow)) : emptyState(empty));
  }

  async function refresh() {
    [books, checkins] = await Promise.all([listAll('books'), listAll('checkins')]);
    fillCheckinCard();
    const newest = (field) => (a, b) => (b[field] || '').localeCompare(a[field] || '') || b.createdAt.localeCompare(a.createdAt);
    const of = (...statuses) => books.filter((b) => statuses.includes(b.status));
    fill(readingBox, of('reading').sort(newest('startDate')), {
      emoji: '📖', title: 'Nothing on the go', text: 'Add a book above, or start one from your wishlist.',
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
  }

  root.append(el('div', { className: 'mod-reading stack' }, [
    card({ title: 'Check in', module: 'reading', children: [checkForm, checkEmpty] }),
    card({ title: 'Reading now', module: 'reading', children: [readingBox] }),
    card({ title: 'Add a book', module: 'reading', children: [addForm] }),
    card({ title: 'Wishlist', children: [wishBox] }),
    card({ title: 'Finished', children: [finishedBox] }),
    otherCard,
  ]));

  await refresh();
}
