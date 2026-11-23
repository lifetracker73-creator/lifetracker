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
  markers:     { dateField: null },
  reports:     { dateField: 'date' },
};

const SETTINGS = 'settings'; // one row per module, keyed by module name

// SHEETS-SYNC: the outbox is a waiting list of changes still to be copied to Google Sheets.
// One row per record ("water:<id>"), so it always holds only the latest change of each record.
// It is written in the same step as the record itself, so a change can never be missed.
// Settings are never put in the outbox.
const OUTBOX = 'outbox';

// Migrations: entry N upgrades the database from version N-1 to version N.
// To change the data structure later, ADD a new entry at the end (never edit old ones).
// Each step gets the open database and the upgrade transaction, so it can also
// read and rewrite existing records to keep your data.
const migrations = [
  // Version 1: create every store.
  (db) => {
    for (const [name, { dateField }] of Object.entries(STORES)) {
      const store = db.createObjectStore(name, { keyPath: 'id' });
      if (dateField) store.createIndex('date', dateField);
    }
    db.createObjectStore(SETTINGS, { keyPath: 'module' });
  },
  // Version 2 (SHEETS-SYNC): add the outbox. Existing data is not touched.
  (db) => {
    db.createObjectStore(OUTBOX, { keyPath: 'key' });
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
