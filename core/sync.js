// Lifetracker Google Sync (SHEETS-SYNC).
// Copies every change waiting in the outbox (see storage.js) to my Google Apps Script,
// which writes it into my yearly Google Sheet. The phone always saves first; this only copies.
//
// The Apps Script link and secret key are typed into Settings and saved ONLY on this phone
// (settings row "sync"). They are never in the code. Settings are never sent to Google.

import {
  STORES, list, get, update, listOutbox, countOutbox, clearSent, queueEverything, getSettings, saveSettings,
  listFiles, getFile, updateFile,
} from './storage.js';
import { isoToKolkata, toIndianDate } from './dates.js';

const BATCH = 100;            // changes per request
const TIMEOUT_MS = 45000;     // give up on one request after this long
const UPLOAD_TIMEOUT_MS = 180000; // a photo/PDF upload (MED-3) can take longer on a slow phone connection
const RETRY_DELAYS = [30, 60, 120, 300, 600].map((s) => s * 1000);

// Which Google Sheet tab each kind of data goes into, and its "Type" on shared tabs.
const TABS = {
  water: ['Water'],
  sleep: ['Sleep'],
  weight: ['Weight'],
  foodLog: ['Food', 'Food log'],
  foods: ['Food', 'Food library'],
  recipes: ['Food', 'Recipe'],
  expenses: ['Expenses', 'Expense'],
  categories: ['Expenses', 'Category'],
  tasks: ['Tasks'],
  books: ['Reading', 'Book'],
  checkins: ['Reading', 'Check-in'],
  reflections: ['Reading', 'Weekly reflection'],
  visits: ['Medical log'],
  splitGroups: ['Expenses', 'Split group'],          // REFINE-5
  splitItems: ['Expenses', 'Split bill / payment'],  // REFINE-5
  loans: ['Expenses', 'Lent / borrowed'],            // REFINE-5
};

// Fields that point at another entry: shown in the Sheet by that entry's name.
const LINKS = {
  category: 'categories', foodId: 'foods', recipeId: 'recipes', bookId: 'books', bookIds: 'books',
  personId: 'people', typeId: 'types', // Medical log: these two lists live in its settings (MED-2).
  // Split bills (REFINE-5): the group, and the people inside groups ("me" = You).
  groupId: 'splitGroups', paidBy: 'splitPeople', paidTo: 'splitPeople', member: 'splitPeople',
};

// Column names that the automatic naming would get wrong.
const LABELS = {
  id: 'ID', createdAt: 'Created', updatedAt: 'Updated', kcal: 'kcal',
  foodId: 'Food', recipeId: 'Recipe', bookId: 'Book', bookIds: 'Books',
  satFatG: 'Saturated fat (g)', vitAUg: 'Vitamin A (µg)', vitB12Ug: 'Vitamin B12 (µg)',
  vitCMg: 'Vitamin C (mg)', vitDUg: 'Vitamin D (µg)',
  howIUsedIt: 'How I used it',
  personId: 'Person', typeId: 'Type', place: 'Doctor / clinic / lab', costPaise: 'Cost (₹)',
  lendType: 'Lent / gifted / borrowed', lendPerson: 'Person', lendDate: 'Lent / gifted on', lendBackDate: 'Back on',
};
const UNITS = { Paise: '₹', Ml: 'ml', Kg: 'kg', Cm: 'cm', Ug: 'µg', Mg: 'mg', G: 'g' };

// ---------- making readable rows ----------

/** 'amountMl' -> 'Amount (ml)', 'paymentMethod' -> 'Payment method'. */
function label(field) {
  if (LABELS[field]) return LABELS[field];
  const m = /^(.+?)(Paise|Ml|Kg|Cm|Ug|Mg|G)$/.exec(field);
  const base = m ? m[1] : field;
  const words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const text = words.charAt(0).toUpperCase() + words.slice(1);
  return m ? `${text} (${UNITS[m[2]]})` : text;
}

function cellValue(field, value, names) {
  if (value === null || value === undefined || value === '') return '';
  if (LINKS[field]) {
    const lookup = (id) => names[LINKS[field]]?.get(id) || id;
    return Array.isArray(value) ? value.map(lookup).join(', ') : lookup(value);
  }
  // Food's own extra nutrients ({ id: value }) -> "Selenium (µg): 12, Omega-3 (g): 0.5".
  if (field === 'extraNutrients' && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([id, v]) => `${names.extraNutrients?.get(id) || 'Deleted nutrient'}: ${v}`)
      .join(', ');
  }
  // Medical log attachments (MED-3): only the Drive links go in the Sheet, never the files.
  if (field === 'attachments' && Array.isArray(value)) {
    const links = value.filter((a) => a?.url).map((a) => a.url);
    const waiting = value.length - links.length;
    if (waiting) links.push(`${waiting} ${waiting === 1 ? 'file' : 'files'} waiting to upload`);
    return links.join('\n');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return field.endsWith('Paise') ? value / 100 : value;
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return toIndianDate(isoToKolkata(value));
    return toIndianDate(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item && typeof item === 'object'
      ? describe(item, names)
      : cellValue(field, item, names))).join(' | ');
  }
  if (typeof value === 'object') return describe(value, names);
  return String(value);
}

// A small object (e.g. one recipe ingredient) -> "Food: Rice, Grams: 150".
function describe(obj, names) {
  return Object.entries(obj)
    .map(([k, v]) => [label(k), cellValue(k, v, names)])
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

/** One record -> a list of [column name, value] pairs, "Type" first and ID/Created/Updated last. */
function toRow(storeName, record, names) {
  const [, type] = TABS[storeName] || ['Other', storeName];
  const row = type ? [['Type', type]] : [];
  for (const [field, value] of Object.entries(record)) {
    if (['id', 'createdAt', 'updatedAt'].includes(field)) continue;
    row.push([label(field), cellValue(field, value, names)]);
  }
  row.push(['ID', record.id], ['Created', cellValue('createdAt', record.createdAt, names)],
    ['Updated', cellValue('updatedAt', record.updatedAt, names)]);
  return row;
}

function toChange(entry, names) {
  const [tab] = TABS[entry.store] || ['Other'];
  const change = { tab, id: entry.id, op: entry.op, year: entry.year, staleYears: entry.staleYears };
  if (entry.op === 'upsert') change.row = toRow(entry.store, entry.record, names);
  return change;
}

// Names of library items, so links show "Rice" instead of an ID.
async function loadNames() {
  const names = {};
  for (const store of new Set(Object.values(LINKS))) {
    if (!STORES[store]) continue;
    names[store] = new Map((await list(store)).map((r) => [r.id, r.name || r.title || r.id]));
  }
  // Your own food nutrients live in food settings (FOOD-1 extra).
  const { customMicros = [] } = await getSettings('food');
  names.extraNutrients = new Map(customMicros.map((c) => [c.id, `${c.name} (${c.unit})`]));
  // Medical log people and visit types live in its settings (MED-1).
  const { people = [], types = [] } = await getSettings('medical');
  names.people = new Map(people.map((x) => [x.id, x.name]));
  names.types = new Map(types.map((x) => [x.id, x.name]));
  // Split bills people live inside their group (REFINE-5); "me" is always You.
  names.splitPeople = new Map([['me', 'You']]);
  for (const g of await list('splitGroups')) for (const p of g.people || []) names.splitPeople.set(p.id, p.name);
  return names;
}

/**
 * CORE-7 "Export to Excel": every record as the same readable rows the Sheet gets, grouped by tab.
 * Returns [{ tab, rows: [[ [column, value], ... ], ...] }] in the Sheet's tab order. Empty tabs are kept.
 */
export async function readableTabs() {
  const names = await loadNames();
  const tabs = new Map();
  for (const [store, [tab]] of Object.entries(TABS)) {
    if (!tabs.has(tab)) tabs.set(tab, []);
    for (const record of await list(store)) tabs.get(tab).push(toRow(store, record, names));
  }
  return [...tabs].map(([tab, rows]) => ({ tab, rows }));
}

// ---------- talking to Google ----------

const LINK_PATTERN = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

/** Tidy a typed key: capital letters, no spaces. */
export function cleanKey(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

class SyncError extends Error {
  constructor(code, detail = '') { super(code); this.code = code; this.detail = detail; }
}

async function post(cfg, body, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    // Sent as plain text so the browser doesn't need an extra permission check with Google.
    res = await fetch(cfg.url, {
      method: 'POST',
      body: JSON.stringify({ ...body, key: cfg.key }),
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch {
    throw new SyncError(navigator.onLine ? 'network' : 'offline');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON: wrong link or not deployed for "Anyone" */ }
  if (!data) throw new SyncError('bad_link');
  if (data.ok !== true) {
    const code = { wrong_key: 'wrong_key', bad_request: 'rejected', busy: 'busy' }[data.error] || 'google_error';
    throw new SyncError(code, String(data.detail || data.error || '').slice(0, 200));
  }
  return data;
}

// ---------- settings ----------

const CONFIG_DEFAULTS = { url: '', key: '', email: '', lastSyncAt: '' };

export async function getConfig() {
  return getSettings('sync', CONFIG_DEFAULTS);
}

const isSetUp = (cfg) => Boolean(cfg.url && cfg.key);

/**
 * Check a link and key with Google, save them on this phone, then upload everything.
 * Returns the connected email. Throws an Error with a plain-words message if it fails.
 */
export async function connect(url, key) {
  const cfg = { url: String(url || '').trim(), key: cleanKey(key) };
  if (!LINK_PATTERN.test(cfg.url)) {
    throw new Error('That link doesn\'t look right. It should start with https://script.google.com/macros/s/ and end with /exec.');
  }
  if (cfg.key.length < 20) throw new Error('That key looks too short. Type it exactly as shown in the Apps Script log.');
  if (!navigator.onLine) throw new Error('You\'re offline. Connect to the internet and try again.');
  let data;
  try {
    data = await post(cfg, { action: 'ping' });
  } catch (err) {
    throw new Error(MESSAGES[err.code]?.(0, err.detail) || 'Something went wrong. Please try again.');
  }
  await saveSettings('sync', { ...cfg, email: data.email || '', lastSyncAt: '' });
  lastError = null;
  await syncEverything();
  return data.email || '';
}

// ---------- status ----------

// Plain-words explanations for each kind of problem.
const MESSAGES = {
  not_set_up: () => 'Google Sync isn\'t connected yet. Your entries are safe on this phone. Open Settings to connect.',
  offline: (n) => `You're offline. ${n} waiting ${n === 1 ? 'entry' : 'entries'} will be sent automatically when you're back online.`,
  network: () => 'Couldn\'t reach your Google script. If your internet works, check the link in Settings. I\'ll keep trying.',
  bad_link: () => 'The Apps Script link isn\'t working. Check you copied the whole link, and that the script is deployed with "Who has access: Anyone".',
  wrong_key: () => 'Google says the secret key is wrong. Check the key in Settings → Google Sync.',
  rejected: (n, d) => `Google refused the entries as not valid${d ? ` (${d})` : ''}. They're safe on this phone. Ask Claude to look at it.`,
  busy: () => 'Google was busy. I\'ll try again in a moment.',
  google_error: (n, d) => `Google had a problem saving${d ? ` (${d})` : ''}. I'll try again soon.`,
};

let lastError = null;
let sending = false;
const listeners = new Set();
let current = { state: 'synced', waiting: 0, message: '' };

/** The latest status: { state: 'synced' | 'waiting' | 'sending' | 'problem', waiting, message, email, lastSyncAt }. */
export function getStatus() { return current; }

/** Call `fn(status)` whenever the status changes. Returns a function to stop. */
export function onStatus(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

async function refreshStatus() {
  const [outboxCount, uploads, cfg] = await Promise.all([countOutbox(), pendingUploads(), getConfig()]);
  const waiting = outboxCount + uploads.length;
  let state;
  let message;
  if (!isSetUp(cfg)) { state = 'problem'; message = MESSAGES.not_set_up(); }
  else if (lastError) { state = 'problem'; message = MESSAGES[lastError.code](waiting, lastError.detail); }
  else if (sending && waiting) { state = 'sending'; message = `Sending ${waiting} ${waiting === 1 ? 'entry' : 'entries'} to Google…`; }
  else if (waiting && !navigator.onLine) { state = 'waiting'; message = MESSAGES.offline(waiting); }
  else if (waiting) { state = 'waiting'; message = `${waiting} ${waiting === 1 ? 'entry is' : 'entries are'} waiting to be sent to Google.`; }
  else { state = 'synced'; message = 'Everything is saved in your Google Sheet.'; }
  current = { state, waiting, message, email: cfg.email, lastSyncAt: cfg.lastSyncAt, setUp: isSetUp(cfg) };
  for (const fn of listeners) fn(current);
}

// ---------- attachments (MED-3) ----------

// Visit attachments not yet in Drive: [{ visitId, fileId, file }]. Skips files Google refused.
async function pendingUploads() {
  const files = new Map((await listFiles()).map((f) => [f.id, f]));
  const pending = [];
  for (const visit of await list('visits')) {
    for (const att of visit.attachments || []) {
      const file = files.get(att.id);
      if (!att.url && file && !file.failed) pending.push({ visitId: visit.id, fileId: att.id, file });
    }
  }
  return pending;
}

function toBase64(buffer) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([buffer]));
  });
}

// Uploads each waiting photo/PDF to Drive "LifeTracker/Reports", then saves its link on the visit
// (which queues the visit again, so the Sheet gets the link). A file is uploaded only once.
async function uploadFiles(cfg) {
  const links = new Map(); // visitId -> Map(fileId -> url)
  for (const { visitId, fileId, file } of await pendingUploads()) {
    let { url } = file;
    if (!url) {
      const full = await getFile(fileId);
      if (!full) continue;
      try {
        const data = await post(cfg, {
          action: 'upload', name: full.name, mimeType: full.type, data: await toBase64(full.data),
        }, UPLOAD_TIMEOUT_MS);
        url = String(data.url || '');
      } catch (err) {
        // Google refused this one file: mark it so it doesn't block everything else.
        if (err.code === 'rejected') { await updateFile(fileId, { failed: true }); continue; }
        throw err;
      }
      if (!url) continue;
      await updateFile(fileId, { url });
    }
    if (!links.has(visitId)) links.set(visitId, new Map());
    links.get(visitId).set(fileId, url);
  }
  for (const [visitId, urls] of links) {
    const visit = await get('visits', visitId); // fresh copy, in case it was edited meanwhile
    if (!visit?.attachments) continue;
    await update('visits', visitId, {
      attachments: visit.attachments.map((a) => (urls.has(a.id) && !a.url ? { ...a, url: urls.get(a.id) } : a)),
    });
  }
}

// ---------- sending ----------

let again = false;
let retryTimer = null;
let retryCount = 0;

async function sendAll() {
  const cfg = await getConfig();
  if (!isSetUp(cfg) || !navigator.onLine) return;
  await uploadFiles(cfg);
  for (let round = 0; round < 1000; round++) {
    const batch = await listOutbox(BATCH);
    if (!batch.length) break;
    const names = await loadNames();
    const data = await post(cfg, { action: 'sync', changes: batch.map((e) => toChange(e, names)) });
    await clearSent(batch);
    await saveSettings('sync', { lastSyncAt: new Date().toISOString(), email: data.email || cfg.email });
  }
}

/** Send everything waiting now. Safe to call any time; only one send runs at once. */
export async function syncNow() {
  if (sending) { again = true; return; }
  sending = true;
  clearTimeout(retryTimer);
  await refreshStatus();
  try {
    do { again = false; await sendAll(); } while (again);
    lastError = null;
    retryCount = 0;
  } catch (err) {
    lastError = err instanceof SyncError ? err : new SyncError('google_error', err?.message);
    if (lastError.code === 'offline') lastError = null; // not a problem: it'll send when back online
    else scheduleRetry();
  } finally {
    sending = false;
    await refreshStatus();
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
  retryCount += 1;
  retryTimer = setTimeout(syncNow, delay);
}

/** "Sync everything now": put every entry back in the outbox and send it all. No duplicates. */
export async function syncEverything() {
  const count = await queueEverything();
  await syncNow();
  return count;
}

let started = false;
let debounce = null;

/** Start syncing in the background while the app is open. Called once by index.html. */
export function startSync() {
  if (started) return;
  started = true;
  // A change was saved: show the new count now, send shortly after (so quick taps go together).
  window.addEventListener('lifetracker:outbox', () => {
    if (!sending) refreshStatus();
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, 1500);
  });
  window.addEventListener('online', () => { retryCount = 0; syncNow(); });
  window.addEventListener('offline', refreshStatus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  syncNow();
}
