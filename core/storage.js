// Lifetracker storage helper (CORE-2).
// The ONLY file that talks to IndexedDB. Modules import these functions instead.
//
//   import { add, get, update, remove, restore, list, listByDate, listByDateRange,
//            getSettings, saveSettings } from '../core/storage.js';
//
// Every record gets `id` (random UUID), `createdAt` and `updatedAt` (ISO timestamps).
// Every add, update, remove and restore also goes into the outbox for Google Sync (SHEETS-SYNC).

import { isoToKolkata } from './dates.js';

const DB_NAME = 'lifetracker';

// Each store, and which field (if any) holds its date for listByDate / listByDateRange.
export const STORES = {
  water:       { dateField: 'date' },
  sleep:       { dateField: 'date' },
  weight:      { dateField: 'date' },
  foods:       { dateField: null },
  foodLog:     { dateField: 'date' },
  recipes:     { dateField: null },
  expenses:    { dateField: 'date' },
  categories:  { dateField: null },
  tasks:       { dateField: 'dueDate' },
  books:       { dateField: 'startDate' },
  checkins:    { dateField: 'date' },
  reflections: { dateField: 'weekStart' },
  visits:      { dateField: 'date' },
  splitGroups: { dateField: null },   // REFINE-5: 🤝 Split bills groups
  splitItems:  { dateField: 'date' }, // REFINE-5: bills and settle-up payments inside a group
  loans:       { dateField: 'date' }, // REFINE-5: 📒 money lent and borrowed
  gymSessions: { dateField: 'date' }, // GYM-1: 🏋️ workout sessions
  gymSets:     { dateField: null },   // GYM-2: one exercise done inside a session
  gymExercises: { dateField: null },  // GYM-2: exercise library
  gymRoutines: { dateField: null },   // GYM-5: saved routines
  refillItems: { dateField: null },   // REF-1: 🔄 things I buy again and again
  refills:     { dateField: 'date' }, // REF-2: one refill of an item
};

const SETTINGS = 'settings'; // one row per module, keyed by module name

// SHEETS-SYNC: the outbox is a waiting list of changes still to be copied to Google Sheets.
// One row per record ("water:<id>"), so it always holds only the latest change of each record.
// It is written in the same step as the record itself, so a change can never be missed.
// Settings are never put in the outbox.
const OUTBOX = 'outbox';

// MED-3: attached photos/PDFs. Kept apart from the records (big files would slow lists and the outbox),
// never put in the outbox and never sent to the Sheet; sync.js uploads them to Drive separately.
// Row: { id, name, type, size, data (ArrayBuffer), url ('' until uploaded), failed, createdAt }.
const FILES = 'files';

// Migrations: entry N upgrades the database from version N-1 to version N.
// To change the data structure later, ADD a new entry at the end (never edit old ones).
// Each step gets the open database and the upgrade transaction, so it can also
// read and rewrite existing records to keep your data.
const migrations = [
  // Version 1: create every store as it was then (incl. the old blood test drawers, not visits).
  (db) => {
    const v1 = { ...STORES, markers: { dateField: null }, reports: { dateField: 'date' } };
    // Drawers added by later versions are made by their own step below (on a new phone too).
    for (const later of ['visits', 'splitGroups', 'splitItems', 'loans', 'gymSessions', 'gymSets', 'gymExercises', 'gymRoutines', 'refillItems', 'refills']) {
      delete v1[later];
    }
    for (const [name, { dateField }] of Object.entries(v1)) {
      const store = db.createObjectStore(name, { keyPath: 'id' });
      if (dateField) store.createIndex('date', dateField);
    }
    db.createObjectStore(SETTINGS, { keyPath: 'module' });
  },
  // Version 2 (SHEETS-SYNC): add the outbox. Existing data is not touched.
  (db) => {
    db.createObjectStore(OUTBOX, { keyPath: 'key' });
  },
  // Version 3 (24 Nov 2026): Blood tests became Medical log. Adds the visits drawer and removes the
  // markers and reports drawers, which were never used (the blood test module was never built).
  (db) => {
    const store = db.createObjectStore('visits', { keyPath: 'id' });
    store.createIndex('date', 'date');
    for (const old of ['markers', 'reports']) {
      if (db.objectStoreNames.contains(old)) db.deleteObjectStore(old);
    }
  },
  // Version 4 (MED-3): add the files drawer for photos/PDFs attached to visits. Existing data is not touched.
  (db) => {
    db.createObjectStore(FILES, { keyPath: 'id' });
  },
  // Version 5 (REFINE-5, 25 Nov 2026): add drawers for Split bills (groups, bills/payments) and
  // Lent & borrowed. Existing data is not touched.
  (db) => {
    db.createObjectStore('splitGroups', { keyPath: 'id' });
    db.createObjectStore('splitItems', { keyPath: 'id' }).createIndex('date', 'date');
    db.createObjectStore('loans', { keyPath: 'id' }).createIndex('date', 'date');
  },
  // Version 6 (GYM-1, 25 Nov 2026): add drawers for the Gym log (sessions, exercises done,
  // exercise library, routines). Existing data is not touched.
  (db) => {
    db.createObjectStore('gymSessions', { keyPath: 'id' }).createIndex('date', 'date');
    db.createObjectStore('gymSets', { keyPath: 'id' });
    db.createObjectStore('gymExercises', { keyPath: 'id' });
    db.createObjectStore('gymRoutines', { keyPath: 'id' });
  },
  // Version 7 (REF-1, 25 Nov 2026): add drawers for Refills (items and refills). Existing data is not touched.
  (db) => {
    db.createObjectStore('refillItems', { keyPath: 'id' });
    db.createObjectStore('refills', { keyPath: 'id' }).createIndex('date', 'date');
  },
];

export const DB_VERSION = migrations.length;

// ---------- internals ----------

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (let v = event.oldVersion; v < DB_VERSION; v++) migrations[v](db, tx);
    };
    req.onsuccess = () => {
      const db = req.result;
      // If a newer version of the app opens in another tab, let it upgrade.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('Lifetracker: close other open tabs of the app to finish updating.');
  });
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}

function checkStore(name) {
  if (!STORES[name]) throw new Error(`Unknown storage store: "${name}"`);
}

async function storeFor(name, mode = 'readonly') {
  checkStore(name);
  const db = await openDb();
  const tx = db.transaction(name, mode);
  return { tx, store: tx.objectStore(name) };
}

// Random UUID. crypto.randomUUID only works on https/localhost, so fall back
// for phones testing over the home Wi-Fi address.
function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const nowIso = () => new Date().toISOString();

// ---------- outbox (SHEETS-SYNC) ----------

/** Which year's Google Sheet a record goes in: the year of its date, else the year it was created. */
export function yearOf(storeName, record) {
  const field = STORES[storeName]?.dateField;
  const value = field ? record?.[field] : null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return Number(value.slice(0, 4));
  return Number(isoToKolkata(record?.createdAt || nowIso()).slice(0, 4));
}

// A record store plus the outbox, in one step, for writing.
async function writeTx(name) {
  checkStore(name);
  const db = await openDb();
  const tx = db.transaction([name, OUTBOX], 'readwrite');
  return { tx, store: tx.objectStore(name), outbox: tx.objectStore(OUTBOX) };
}

/**
 * Put a change in the outbox (inside an open transaction).
 * op: 'upsert' (added/changed) or 'delete'. `before` is the record as it was, if it was changed.
 * staleYears lists other years' Sheets the record must be removed from (when its date moved year).
 */
function queueChange(outbox, storeName, op, record, before = null) {
  const key = `${storeName}:${record.id}`;
  const req = outbox.get(key);
  req.onsuccess = () => {
    const prev = req.result;
    const year = yearOf(storeName, record);
    const stale = new Set(prev?.staleYears ?? []);
    if (prev) stale.add(prev.year);
    if (before) stale.add(yearOf(storeName, before));
    stale.delete(year);
    outbox.put({
      key, store: storeName, id: record.id, op,
      record: op === 'upsert' ? record : null,
      year, staleYears: [...stale], version: uuid(), queuedAt: nowIso(),
    });
  };
}

// Tell the sync helper that the outbox changed.
function outboxChanged() {
  globalThis.dispatchEvent?.(new Event('lifetracker:outbox'));
}

/** The oldest `limit` waiting changes. */
export async function listOutbox(limit) {
  const db = await openDb();
  const all = await done(db.transaction(OUTBOX).objectStore(OUTBOX).getAll());
  all.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  return limit ? all.slice(0, limit) : all;
}

/** How many changes are waiting. */
export async function countOutbox() {
  const db = await openDb();
  return done(db.transaction(OUTBOX).objectStore(OUTBOX).count());
}

/** Remove changes that were sent, unless the record changed again while sending. */
export async function clearSent(entries) {
  const db = await openDb();
  const tx = db.transaction(OUTBOX, 'readwrite');
  const outbox = tx.objectStore(OUTBOX);
  for (const entry of entries) {
    const req = outbox.get(entry.key);
    req.onsuccess = () => {
      if (req.result?.version === entry.version) outbox.delete(entry.key);
    };
  }
  await txDone(tx);
  outboxChanged();
}

/** Put every saved record (not settings) in the outbox, for "Sync everything now". */
export async function queueEverything() {
  const db = await openDb();
  const names = Object.keys(STORES);
  const tx = db.transaction([...names, OUTBOX], 'readwrite');
  const outbox = tx.objectStore(OUTBOX);
  let count = 0;
  for (const name of names) {
    const records = await done(tx.objectStore(name).getAll());
    for (const record of records) queueChange(outbox, name, 'upsert', record);
    count += records.length;
  }
  await txDone(tx);
  outboxChanged();
  return count;
}

// ---------- records ----------

/** Save a new record. Returns the saved record (with id, createdAt, updatedAt). */
export async function add(storeName, data) {
  const now = nowIso();
  const record = { ...data, id: uuid(), createdAt: now, updatedAt: now };
  const { tx, store, outbox } = await writeTx(storeName);
  store.add(record);
  queueChange(outbox, storeName, 'upsert', record);
  await txDone(tx);
  outboxChanged();
  return record;
}

/** Get one record by id, or null if it doesn't exist. */
export async function get(storeName, id) {
  const { store } = await storeFor(storeName);
  return (await done(store.get(id))) ?? null;
}

/** Change some fields of a record. Returns the updated record, or null if not found. */
export async function update(storeName, id, changes) {
  const { tx, store, outbox } = await writeTx(storeName);
  const existing = await done(store.get(id));
  if (!existing) { await txDone(tx); return null; }
  const record = { ...existing, ...changes, id, createdAt: existing.createdAt, updatedAt: nowIso() };
  store.put(record);
  queueChange(outbox, storeName, 'upsert', record, existing);
  await txDone(tx);
  outboxChanged();
  return record;
}

/** Delete a record. Returns the deleted record (keep it to offer Undo), or null. */
export async function remove(storeName, id) {
  const { tx, store, outbox } = await writeTx(storeName);
  const existing = await done(store.get(id));
  if (existing) {
    store.delete(id);
    queueChange(outbox, storeName, 'delete', existing);
  }
  await txDone(tx);
  if (existing) outboxChanged();
  return existing ?? null;
}

/** Put a deleted record back exactly as it was (for Undo). */
export async function restore(storeName, record) {
  const { tx, store, outbox } = await writeTx(storeName);
  store.put(record);
  queueChange(outbox, storeName, 'upsert', record);
  await txDone(tx);
  outboxChanged();
  return record;
}

/** All records in a store. Dated stores come back oldest date first; records without a date come last. */
export async function list(storeName) {
  const { store } = await storeFor(storeName);
  const all = await done(store.getAll());
  const field = STORES[storeName].dateField;
  if (!field) return all;
  // Sorted here instead of through the date index, which skips records with no date
  // (e.g. tasks with no due date). Same order as before for records that have one.
  const dateOf = (r) => (typeof r[field] === 'string' ? r[field] : null);
  return all.sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (da === db) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  });
}

/** Records for one date ('YYYY-MM-DD'). */
export async function listByDate(storeName, date) {
  return listByDateRange(storeName, date, date);
}

/** Records from `from` to `to` ('YYYY-MM-DD', both included), oldest first. */
export async function listByDateRange(storeName, from, to) {
  checkStore(storeName);
  if (!STORES[storeName].dateField) throw new Error(`"${storeName}" has no date to search by`);
  const { store } = await storeFor(storeName);
  return done(store.index('date').getAll(IDBKeyRange.bound(from, to)));
}

// ---------- files (MED-3) ----------

/** Save a file. `data` is an ArrayBuffer. Returns the saved row (with id). */
export async function saveFile({ name, type, data }) {
  const row = { id: uuid(), name, type, size: data.byteLength, data, url: '', failed: false, createdAt: nowIso() };
  const db = await openDb();
  const tx = db.transaction(FILES, 'readwrite');
  tx.objectStore(FILES).add(row);
  await txDone(tx);
  return row;
}

/** One file row (with its data), or null. */
export async function getFile(id) {
  const db = await openDb();
  return (await done(db.transaction(FILES).objectStore(FILES).get(id))) ?? null;
}

/** Change some fields of a file row (e.g. its Drive link). */
export async function updateFile(id, changes) {
  const db = await openDb();
  const tx = db.transaction(FILES, 'readwrite');
  const store = tx.objectStore(FILES);
  const existing = await done(store.get(id));
  if (existing) store.put({ ...existing, ...changes, id });
  await txDone(tx);
}

/** Every file row without its data: { id, name, type, size, url, failed, createdAt }. */
export async function listFiles() {
  const db = await openDb();
  const rows = [];
  await new Promise((resolve, reject) => {
    const req = db.transaction(FILES).objectStore(FILES).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(); return; }
      const { data, ...rest } = cursor.value;
      rows.push(rest);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return rows;
}

/** Delete file rows by id. */
export async function removeFiles(ids) {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction(FILES, 'readwrite');
  for (const id of ids) tx.objectStore(FILES).delete(id);
  await txDone(tx);
}

// ---------- backup (CORE-7) ----------
// A backup is one plain object: every record of every store, every settings row except "sync"
// (it holds the Google link and secret key), and the attached files with their data as base64 text.

const BACKUP_KIND = 'lifetracker-backup';

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function base64ToBuffer(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Everything saved on this phone, ready to be turned into a backup file. Never includes the sync link or key. */
export async function exportAll() {
  const db = await openDb();
  const names = Object.keys(STORES);
  const tx = db.transaction([...names, SETTINGS, FILES]);
  const stores = {};
  for (const name of names) stores[name] = await done(tx.objectStore(name).getAll());
  const settings = (await done(tx.objectStore(SETTINGS).getAll())).filter((row) => row.module !== 'sync');
  const files = (await done(tx.objectStore(FILES).getAll()))
    .map(({ data, ...rest }) => ({ ...rest, data: data ? bufferToBase64(data) : '' }));
  return { kind: BACKUP_KIND, dbVersion: DB_VERSION, exportedAt: nowIso(), stores, settings, files };
}

/**
 * Check a backup (already read from JSON) and count what's in it, without changing anything.
 * Returns { counts: { store: n }, settings: n, files: n, fileBytes, exportedAt } or throws a friendly Error.
 */
export function checkBackup(backup) {
  const bad = () => new Error('This file isn\'t a Lifetracker backup, or it is damaged. Nothing was changed.');
  if (!backup || typeof backup !== 'object' || backup.kind !== BACKUP_KIND) throw bad();
  if (typeof backup.dbVersion !== 'number' || backup.dbVersion > DB_VERSION) {
    throw new Error('This backup was made by a newer version of Lifetracker. Update the app first, then try again. Nothing was changed.');
  }
  if (!backup.stores || typeof backup.stores !== 'object') throw bad();
  const isRecord = (r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id;
  const counts = {};
  for (const name of Object.keys(STORES)) {
    const rows = backup.stores[name] ?? [];
    if (!Array.isArray(rows) || !rows.every(isRecord)) throw bad();
    counts[name] = rows.length;
  }
  const settings = backup.settings ?? [];
  if (!Array.isArray(settings) || !settings.every((s) => s && typeof s.module === 'string')) throw bad();
  const files = backup.files ?? [];
  if (!Array.isArray(files) || !files.every((f) => isRecord(f) && typeof f.data === 'string')) throw bad();
  const fileBytes = files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
  return { counts, settings: settings.length, files: files.length, fileBytes, exportedAt: backup.exportedAt || '' };
}

/**
 * Replace everything on this phone with a backup (after checkBackup). The Google Sync link and key
 * on this phone are kept. Every restored record is queued for Google Sheets, and records that were
 * on the phone but aren't in the backup are queued for removal, so the Sheets match afterwards.
 */
export async function importAll(backup) {
  checkBackup(backup);
  // Turn files back into binary data before the transaction starts (it must not wait on other work).
  const files = (backup.files ?? []).map((f) => ({ ...f, data: f.data ? base64ToBuffer(f.data) : null }));
  const db = await openDb();
  const names = Object.keys(STORES);
  const tx = db.transaction([...names, SETTINGS, FILES, OUTBOX], 'readwrite');
  const outbox = tx.objectStore(OUTBOX);
  for (const name of names) {
    const store = tx.objectStore(name);
    const incoming = backup.stores[name] ?? [];
    const keep = new Set(incoming.map((r) => r.id));
    const old = await done(store.getAll());
    for (const record of old) {
      if (!keep.has(record.id)) queueChange(outbox, name, 'delete', record);
    }
    store.clear();
    for (const record of incoming) {
      store.put(record);
      queueChange(outbox, name, 'upsert', record);
    }
  }
  const settingsStore = tx.objectStore(SETTINGS);
  const sync = await done(settingsStore.get('sync'));
  settingsStore.clear();
  for (const row of backup.settings ?? []) if (row.module !== 'sync') settingsStore.put(row);
  if (sync) settingsStore.put(sync);
  const filesStore = tx.objectStore(FILES);
  filesStore.clear();
  for (const f of files) filesStore.put(f);
  await txDone(tx);
  outboxChanged();
}

// ---------- settings ----------

/** A module's settings, with `defaults` filled in for anything not saved yet. */
export async function getSettings(moduleName, defaults = {}) {
  const db = await openDb();
  const saved = await done(db.transaction(SETTINGS).objectStore(SETTINGS).get(moduleName));
  const { module, updatedAt, ...values } = saved ?? {};
  return { ...defaults, ...values };
}

/** Save (merge) settings for a module. Returns the full saved settings. */
export async function saveSettings(moduleName, values) {
  const db = await openDb();
  const tx = db.transaction(SETTINGS, 'readwrite');
  const store = tx.objectStore(SETTINGS);
  const existing = (await done(store.get(moduleName))) ?? {};
  const record = { ...existing, ...values, module: moduleName, updatedAt: nowIso() };
  store.put(record);
  await txDone(tx);
  const { module, updatedAt, ...saved } = record;
  return saved;
}
