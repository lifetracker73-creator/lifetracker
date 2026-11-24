/**
 * LifeTracker sync: Google Apps Script (SHEETS-SYNC).
 *
 * Paste this into a new project at script.google.com, together with appsscript.json.
 * - WRITE-ONLY: it accepts entries from the LifeTracker app and saves them in yearly Google Sheets
 *   ("LifeTracker 2026") inside a "LifeTracker" folder in your Drive. It never sends your data back.
 * - The secret key is kept in this project's Script Properties, never in this code.
 *   Run "setup" once to create it; the key is shown in the log.
 * - It can only see files and folders it created itself (permission "drive.file").
 */

const TABS = ['Water', 'Sleep', 'Weight', 'Food', 'Expenses', 'Tasks', 'Reading', 'Medical log'];
const ALLOWED_TABS = TABS.concat(['Other']);
const TAIL = ['ID', 'Created', 'Updated']; // always the last columns
const FOLDER_NAME = 'LifeTracker';
const REPORTS_NAME = 'Reports';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIMITS = { body: 22 * 1024 * 1024, changes: 500, columns: 80, name: 80, text: 20000, file: 15 * 1024 * 1024 };
const KEY_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, easy to type

// ---------- run these from the editor ----------

/** Run once: makes the secret key (if there isn't one) and the LifeTracker folder. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('SECRET_KEY');
  if (!key) {
    key = makeKey_();
    props.setProperty('SECRET_KEY', key);
  }
  folderId_();
  Logger.log('Setup done for ' + email_() + ' ✅');
  Logger.log('Your secret key:   ' + key);
  Logger.log('Type it into LifeTracker → Settings → Google Sync. Keep it private.');
}

/** Run only if the key leaked: makes a new key. The old one stops working at once. */
function newKey() {
  const key = makeKey_();
  PropertiesService.getScriptProperties().setProperty('SECRET_KEY', key);
  Logger.log('Your NEW secret key:   ' + key);
  Logger.log('Type it into LifeTracker → Settings → Google Sync → Change account.');
}

// ---------- web app ----------

function doGet() {
  return ContentService.createTextOutput('LifeTracker sync is running.');
}

function doPost(e) {
  let lock = null;
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body || body.length > LIMITS.body) return reply_({ ok: false, error: 'bad_request', detail: 'empty or too big' });
    let req;
    try { req = JSON.parse(body); } catch (err) { return reply_({ ok: false, error: 'bad_request', detail: 'not JSON' }); }

    if (!req || typeof req !== 'object' || !keyOk_(req.key)) {
      Utilities.sleep(1500); // slows down anyone guessing keys
      return reply_({ ok: false, error: 'wrong_key' });
    }

    if (req.action === 'ping') return reply_({ ok: true, email: email_() });

    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) { lock = null; return reply_({ ok: false, error: 'busy' }); }

    if (req.action === 'sync') {
      const changes = checkChanges_(req.changes);
      applyChanges_(changes);
      return reply_({ ok: true, done: changes.length, email: email_() });
    }
    if (req.action === 'upload') return reply_(saveReportFile_(req));
    return reply_({ ok: false, error: 'bad_request', detail: 'unknown action' });
  } catch (err) {
    if (err && err.badRequest) return reply_({ ok: false, error: 'bad_request', detail: err.message });
    console.error(err);
    return reply_({ ok: false, error: 'google_error', detail: String((err && err.message) || err).slice(0, 150) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

// Replies only ever hold ok/error, counts, your own email, or the link of a file just uploaded.
function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- security checks ----------

function cleanKey_(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function keyOk_(given) {
  const saved = cleanKey_(PropertiesService.getScriptProperties().getProperty('SECRET_KEY'));
  const typed = cleanKey_(given);
  if (saved.length < 20 || typed.length !== saved.length) return false;
  let diff = 0;
  for (let i = 0; i < saved.length; i++) diff |= saved.charCodeAt(i) ^ typed.charCodeAt(i);
  return diff === 0;
}

function makeKey_() {
  const seed = Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  let key = '';
  for (let i = 0; i < 24; i++) {
    key += KEY_LETTERS[(bytes[i] + 256) % 32];
    if (i % 4 === 3 && i < 23) key += '-';
  }
  return key; // 6 groups of 4 letters/digits joined by dashes
}

function bad_(message) {
  const err = new Error(message);
  err.badRequest = true;
  throw err;
}

const yearOk_ = (y) => Number.isInteger(y) && y >= 2000 && y <= 2100;

/** Reject anything that doesn't look like a valid LifeTracker entry. */
function checkChanges_(changes) {
  if (!Array.isArray(changes) || changes.length > LIMITS.changes) bad_('changes list');
  return changes.map((c) => {
    if (!c || typeof c !== 'object') bad_('change');
    if (ALLOWED_TABS.indexOf(c.tab) < 0) bad_('unknown tab');
    if (typeof c.id !== 'string' || !ID_PATTERN.test(c.id)) bad_('bad ID');
    if (c.op !== 'upsert' && c.op !== 'delete') bad_('bad action');
    if (!yearOk_(c.year)) bad_('bad year');
    const stale = c.staleYears == null ? [] : c.staleYears;
    if (!Array.isArray(stale) || stale.length > 10 || !stale.every(yearOk_)) bad_('bad years');

    let row = null;
    let order = null;
    if (c.op === 'upsert') {
      if (!Array.isArray(c.row) || c.row.length < 4 || c.row.length > LIMITS.columns) bad_('bad row');
      row = {};
      c.row.forEach((pair) => {
        if (!Array.isArray(pair) || pair.length !== 2) bad_('bad column');
        const name = pair[0];
        const value = pair[1];
        if (typeof name !== 'string' || !name.trim() || name.length > LIMITS.name) bad_('bad column name');
        if (Object.prototype.hasOwnProperty.call(row, name)) bad_('repeated column');
        if (typeof value === 'string') { if (value.length > LIMITS.text) bad_('text too long'); }
        else if (typeof value === 'number') { if (!isFinite(value)) bad_('bad number'); }
        else if (typeof value !== 'boolean') bad_('bad value');
        row[name] = value;
      });
      if (row.ID !== c.id) bad_('ID mismatch');
      order = c.row.map((pair) => pair[0]);
    }
    return { tab: c.tab, id: c.id, op: c.op, year: c.year, staleYears: stale, row: row, order: order };
  });
}

// ---------- writing to the Sheets ----------

function applyChanges_(changes) {
  // Turn each change into jobs per year: save in its year, remove from any old years.
  const byYear = {};
  const addJob = (year, job) => {
    byYear[year] = byYear[year] || {};
    (byYear[year][job.tab] = byYear[year][job.tab] || []).push(job);
  };
  changes.forEach((c) => {
    if (c.op === 'upsert') addJob(c.year, { tab: c.tab, id: c.id, op: 'upsert', row: c.row, order: c.order });
    else addJob(c.year, { tab: c.tab, id: c.id, op: 'delete' });
    c.staleYears.forEach((y) => { if (y !== c.year) addJob(y, { tab: c.tab, id: c.id, op: 'delete' }); });
  });

  Object.keys(byYear).forEach((year) => {
    const tabs = byYear[year];
    const needsFile = Object.keys(tabs).some((t) => tabs[t].some((j) => j.op === 'upsert'));
    const ssId = yearFile_(Number(year), needsFile);
    if (!ssId) return; // only deletes, and there's no file for that year: nothing to do
    const info = sheetInfo_(ssId);
    Object.keys(tabs).forEach((tab) => applyTab_(ssId, info, tab, tabs[tab]));
  });
}

function sheetInfo_(ssId) {
  const ss = Sheets.Spreadsheets.get(ssId, { fields: 'sheets.properties(sheetId,title,gridProperties)' });
  const info = {};
  (ss.sheets || []).forEach((s) => { info[s.properties.title] = s.properties; });
  return info;
}

const quote_ = (tab) => "'" + tab.replace(/'/g, "''") + "'";

function colLetter_(n) { // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function applyTab_(ssId, info, tab, jobs) {
  const upserts = jobs.filter((j) => j.op === 'upsert');
  let sheet = info[tab];
  if (!sheet) {
    if (!upserts.length) return;
    sheet = addTabs_(ssId, [tab])[0];
    info[tab] = sheet;
  }
  const q = quote_(tab);
  const values = Sheets.Spreadsheets.Values;

  // 1. Columns: add any new ones just before ID / Created / Updated.
  let header = ((values.get(ssId, q + '!1:1').values || [[]])[0] || []).map(String);
  const wanted = [];
  upserts.forEach((j) => j.order.forEach((name) => {
    if (TAIL.indexOf(name) < 0 && wanted.indexOf(name) < 0) wanted.push(name);
  }));
  let columnCount = sheet.gridProperties.columnCount;
  const requests = [];
  if (!header.length) {
    header = wanted.concat(TAIL);
  } else {
    const missing = wanted.filter((name) => header.indexOf(name) < 0);
    if (missing.length) {
      let at = header.indexOf('ID');
      if (at < 0) at = header.length;
      if (at < columnCount) {
        requests.push({ insertDimension: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: at, endIndex: at + missing.length }, inheritFromBefore: at > 0 } });
        columnCount += missing.length;
      }
      header = header.slice(0, at).concat(missing, header.slice(at));
    }
    TAIL.forEach((name) => { if (header.indexOf(name) < 0) header.push(name); });
  }
  if (header.length > columnCount) {
    requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'COLUMNS', length: header.length - columnCount } });
    columnCount = header.length;
  }
  if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, ssId);
  sheet.gridProperties.columnCount = columnCount;
  const last = colLetter_(header.length);
  values.update({ values: [header] }, ssId, q + '!A1:' + last + '1', { valueInputOption: 'RAW' });

  // 2. Find existing rows by ID.
  const idCol = colLetter_(header.indexOf('ID') + 1);
  const ids = values.get(ssId, q + '!' + idCol + '2:' + idCol).values || [];
  const rowsById = {};
  ids.forEach((r, i) => {
    const id = r && r[0];
    if (id) (rowsById[id] = rowsById[id] || []).push(i + 2);
  });

  // 3. Work out updates, new rows and deletions. RAW means nothing is ever run as a formula.
  const updates = [];
  const appends = [];
  const deletes = [];
  jobs.forEach((j) => {
    const rows = rowsById[j.id] || [];
    if (j.op === 'upsert') {
      const line = header.map((name) => (Object.prototype.hasOwnProperty.call(j.row, name) ? j.row[name] : ''));
      if (rows.length) {
        updates.push({ range: q + '!A' + rows[0] + ':' + last + rows[0], values: [line] });
        rows.slice(1).forEach((r) => deletes.push(r)); // repair any accidental duplicates
      } else {
        appends.push(line);
      }
    } else {
      rows.forEach((r) => deletes.push(r));
    }
  });

  if (updates.length) values.batchUpdate({ valueInputOption: 'RAW', data: updates }, ssId);
  if (deletes.length) {
    const unique = deletes.filter((r, i) => deletes.indexOf(r) === i).sort((a, b) => b - a);
    Sheets.Spreadsheets.batchUpdate({
      requests: unique.map((r) => ({ deleteDimension: { range: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } })),
    }, ssId);
  }
  if (appends.length) {
    values.append({ values: appends }, ssId, q + '!A1:' + last + '1', { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  }
}

/** Add tabs with a bold, frozen header row. Returns their properties. */
function addTabs_(ssId, names) {
  const res = Sheets.Spreadsheets.batchUpdate({
    requests: names.map((title) => ({ addSheet: { properties: { title: title, gridProperties: { frozenRowCount: 1 } } } })),
  }, ssId);
  const added = res.replies.map((r) => r.addSheet.properties);
  Sheets.Spreadsheets.batchUpdate({
    requests: added.map((p) => ({
      repeatCell: {
        range: { sheetId: p.sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    })),
  }, ssId);
  return added;
}

// ---------- files and folders (only ones this script created) ----------

function fileOk_(id) {
  if (!id) return false;
  try { return !Drive.Files.get(id, { fields: 'id,trashed' }).trashed; } catch (err) { return false; }
}

function findFile_(name, mime, parentId) {
  const q = "name = '" + name.replace(/'/g, "\\'") + "' and mimeType = '" + mime + "' and '" + parentId + "' in parents and trashed = false";
  const res = Drive.Files.list({ q: q, fields: 'files(id)', pageSize: 1 });
  return res.files && res.files.length ? res.files[0].id : null;
}

function folderId_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('FOLDER_ID');
  if (fileOk_(id)) return id;
  id = findFile_(FOLDER_NAME, FOLDER_MIME, 'root') ||
    Drive.Files.create({ name: FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'] }).id;
  props.setProperty('FOLDER_ID', id);
  return id;
}

function reportsFolderId_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('REPORTS_ID');
  if (fileOk_(id)) return id;
  const parent = folderId_();
  id = findFile_(REPORTS_NAME, FOLDER_MIME, parent) ||
    Drive.Files.create({ name: REPORTS_NAME, mimeType: FOLDER_MIME, parents: [parent] }).id;
  props.setProperty('REPORTS_ID', id);
  return id;
}

/** The "LifeTracker <year>" Sheet's ID. Creates it (with all 8 tabs) if `create` is true. */
function yearFile_(year, create) {
  const props = PropertiesService.getScriptProperties();
  const prop = 'YEAR_' + year;
  let id = props.getProperty(prop);
  if (!fileOk_(id)) {
    const name = 'LifeTracker ' + year;
    const parent = folderId_();
    id = findFile_(name, SHEET_MIME, parent);
    if (!id && !create) return null;
    if (!id) id = Drive.Files.create({ name: name, mimeType: SHEET_MIME, parents: [parent] }).id;
    props.setProperty(prop, id);
    props.deleteProperty('READY_' + year);
  }
  if (!props.getProperty('READY_' + year)) finishYearFile_(id, year);
  return id;
}

/**
 * Finish setting up a year file: India region and time zone, the 8 tabs, no empty "Sheet1".
 * Each step is tried on its own; a failed step never stops entries being saved,
 * and is tried again on the next save until all steps have worked.
 */
function finishYearFile_(id, year) {
  let allDone = true;
  const step = (label, fn) => {
    try { fn(); } catch (err) { allDone = false; console.error('Year file setup, ' + label + ': ' + ((err && err.message) || err)); }
  };
  step('region', () => Sheets.Spreadsheets.batchUpdate({
    requests: [{ updateSpreadsheetProperties: { properties: { locale: 'en_IN', timeZone: 'Asia/Kolkata' }, fields: 'locale,timeZone' } }],
  }, id));
  step('tabs', () => {
    const have = Object.keys(sheetInfo_(id));
    const missing = TABS.filter((t) => have.indexOf(t) < 0);
    if (missing.length) addTabs_(id, missing);
  });
  step('remove Sheet1', () => {
    const info = sheetInfo_(id);
    const extra = Object.keys(info).filter((t) => ALLOWED_TABS.indexOf(t) < 0);
    extra.forEach((t) => {
      const used = Sheets.Spreadsheets.Values.get(id, quote_(t) + '!A1:Z5').values;
      if (!used) Sheets.Spreadsheets.batchUpdate({ requests: [{ deleteSheet: { sheetId: info[t].sheetId } }] }, id);
    });
  });
  if (allDone) PropertiesService.getScriptProperties().setProperty('READY_' + year, 'yes');
}

/** Medical log attachment: photo/PDF (photos already shrunk by the app): saves it in LifeTracker/Reports, returns its link. */
function saveReportFile_(req) {
  if (FILE_TYPES.indexOf(req.mimeType) < 0) bad_('file type');
  if (typeof req.name !== 'string' || !req.name.trim() || req.name.length > 100) bad_('file name');
  if (typeof req.data !== 'string' || req.data.length > LIMITS.file * 1.4) bad_('file data');
  const bytes = Utilities.base64Decode(req.data);
  if (!bytes.length || bytes.length > LIMITS.file) bad_('file size');
  const name = req.name.replace(/[^\w .()-]/g, '_');
  const file = Drive.Files.create(
    { name: name, mimeType: req.mimeType, parents: [reportsFolderId_()] },
    Utilities.newBlob(bytes, req.mimeType, name),
    { fields: 'id,webViewLink' },
  );
  return { ok: true, url: file.webViewLink };
}

function email_() {
  try { return Session.getEffectiveUser().getEmail() || ''; } catch (err) { return ''; }
}
