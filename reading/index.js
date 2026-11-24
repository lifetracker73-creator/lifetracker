// 📚 reading module screens.
// RDG-1: books. Add a book (to "Reading now" or the wishlist), tap a book to edit it or change its status,
// lists of current, wishlist, finished and paused/dropped books, delete with Undo.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll } from '../core/storage.js';
import { today, formatDate, isoToKolkata } from '../core/dates.js';
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

export async function render(root) {
  let books = [];
  let editingId = null;

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
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
  }

  async function deleteBook(book) {
    const removed = await remove('books', book.id);
    if (editingId === book.id) editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted “${removed.title}”`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('books', removed);
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
    return listItem({
      title: book.title,
      subtitle: bookSubtitle(book),
      meta: book.status === 'finished' && book.rating ? '⭐'.repeat(book.rating)
        : (['paused', 'dropped'].includes(book.status) ? statusLabel(book.status) : null),
      onClick: () => { editingId = book.id; refresh(); },
      actions,
    });
  }

  function fill(box, items, empty) {
    box.replaceChildren(items.length ? list(items.map(bookRow)) : emptyState(empty));
  }

  async function refresh() {
    books = await listAll('books');
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
    card({ title: 'Add a book', module: 'reading', children: [addForm] }),
    card({ title: 'Reading now', module: 'reading', children: [readingBox] }),
    card({ title: 'Wishlist', children: [wishBox] }),
    card({ title: 'Finished', children: [finishedBox] }),
    otherCard,
  ]));

  await refresh();
}
