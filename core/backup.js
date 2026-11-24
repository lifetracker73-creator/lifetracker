// 💾 Backup (CORE-7): download everything to one file, restore it (after a preview), and "Export to Excel".
// The Google Sync link and secret key are never put in a backup or an export.
import { card, button, el, toast } from './ui.js';
import { exportAll, checkBackup, importAll } from './storage.js';
import { readableTabs } from './sync.js';
import { makeXlsx, saveFile } from './xlsx.js';
import { today, isoToKolkata, formatDateTime } from './dates.js';
import { formatNumber } from './format.js';

// What each store holds, in words, for the restore preview.
const WHAT = [
  ['water', '💧 Water entries'], ['sleep', '😴 Nights of sleep'], ['weight', '⚖️ Weights'],
  ['foods', '🍱 Foods in library'], ['foodLog', '🍱 Food log entries'], ['recipes', '🍱 Recipes'],
  ['expenses', '💸 Expenses'], ['categories', '💸 Categories'], ['tasks', '✅ Tasks'],
  ['books', '📚 Books'], ['checkins', '📚 Reading check-ins'], ['reflections', '📚 Weekly reflections'],
  ['visits', '🩺 Medical visits'],
  ['splitGroups', '🤝 Split bills groups'], ['splitItems', '🤝 Split bills and payments'],
  ['loans', '📒 Lent & borrowed entries'],
  ['gymSessions', '🏋️ Workouts'], ['gymSets', '🏋️ Exercises done'],
  ['gymExercises', '🏋️ Exercises in library'], ['gymRoutines', '🏋️ Routines'],
];

// Excel tab colour for each Sheet tab (the module's pastel).
const TAB_FILL = {
  Water: 'water', Sleep: 'sleep', Weight: 'weight', Food: 'food', Expenses: 'money',
  Tasks: 'tasks', Reading: 'reading', 'Medical log': 'medical', 'Gym log': 'gym',
};

function sizeText(bytes) {
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}

// One Excel tab: a coloured header row, then one row per entry, like the Google Sheet.
function excelSheet({ tab, rows }) {
  const fill = TAB_FILL[tab] || 'lilac';
  const last = ['ID', 'Created', 'Updated'];
  const columns = [];
  for (const row of rows) {
    for (const [name] of row) if (!last.includes(name) && !columns.includes(name)) columns.push(name);
  }
  columns.push(...last);
  if (!rows.length) {
    return { name: tab, cols: [30], rows: [[{ v: 'No entries yet', s: { italic: true, color: 'muted', fill } }]], gridLines: false };
  }
  const head = columns.map((c) => ({ v: c, s: { bold: true, fill } }));
  const body = rows.map((row) => {
    const values = new Map(row);
    return columns.map((c) => {
      const v = values.get(c);
      if (v === undefined || v === '') return null;
      if (typeof v === 'number' && c.includes('(₹)')) return { v, s: { num: 'money' } };
      if (typeof v === 'string') return { v, s: { align: 'left', wrap: v.includes('\n') } };
      return v;
    });
  });
  const cols = columns.map((c, i) => {
    let longest = c.length;
    for (const r of body) {
      const v = r[i];
      const text = v && typeof v === 'object' ? String(v.v) : String(v ?? '');
      longest = Math.max(longest, ...text.split('\n').map((t) => t.length));
    }
    return Math.min(50, Math.max(10, longest + 2));
  });
  const lastCol = String.fromCharCode(64 + Math.min(columns.length, 26));
  return {
    name: tab,
    cols,
    rows: [head, ...body],
    frozenRows: 1,
    filter: columns.length <= 26 ? `A1:${lastCol}${body.length + 1}` : undefined,
  };
}

export function backupCard() {
  const message = el('p', { className: 'muted', role: 'status' });
  const busy = (btn, on, text) => {
    btn.disabled = on;
    btn.lastChild.textContent = text;
  };

  // ---- download a backup ----
  const downloadButton = button({
    label: '⬇️ Download backup',
    variant: 'primary',
    block: true,
    onClick: async () => {
      busy(downloadButton, true, 'Making backup…');
      try {
        const backup = await exportAll();
        const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
        const name = `lifetracker-backup-${today()}.json`;
        saveFile(blob, name);
        message.textContent = `Saved ${name} (${sizeText(blob.size)}) to your Downloads. Keep it somewhere safe, like Google Drive.`;
      } catch (err) {
        console.error(err);
        message.textContent = 'Sorry, the backup couldn\'t be made. Please try again.';
      } finally {
        busy(downloadButton, false, '⬇️ Download backup');
      }
    },
  });

  // ---- export to Excel ----
  const excelButton = button({
    label: '📊 Export to Excel',
    variant: 'secondary',
    block: true,
    onClick: async () => {
      busy(excelButton, true, 'Making Excel file…');
      try {
        const tabs = await readableTabs();
        const name = `lifetracker-all-data-${today()}.xlsx`;
        saveFile(makeXlsx(tabs.map(excelSheet)), name);
        message.textContent = `Saved ${name} to your Downloads: one tab per module. Photos and PDFs aren't in it (only their Google Drive links).`;
      } catch (err) {
        console.error(err);
        message.textContent = 'Sorry, the Excel file couldn\'t be made. Please try again.';
      } finally {
        busy(excelButton, false, '📊 Export to Excel');
      }
    },
  });

  // ---- restore ----
  const picker = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const preview = el('div', { className: 'stack', hidden: true });
  const restoreButton = button({
    label: '⬆️ Restore from backup',
    variant: 'secondary',
    block: true,
    onClick: () => { picker.value = ''; picker.click(); },
  });

  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    preview.hidden = true;
    message.textContent = 'Reading the backup…';
    let backup;
    let info;
    try {
      backup = JSON.parse(await file.text());
      info = checkBackup(backup);
    } catch (err) {
      message.textContent = err instanceof SyntaxError
        ? 'This file isn\'t a Lifetracker backup, or it is damaged. Nothing was changed.'
        : err.message;
      return;
    }
    message.textContent = '';
    const when = info.exportedAt ? formatDateTime(isoToKolkata(info.exportedAt)) : 'an unknown date';
    const lines = WHAT.filter(([store]) => info.counts[store]).map(([store, words]) => el('li', {
      text: `${words}: ${formatNumber(info.counts[store])}`,
    }));
    if (info.files) {
      lines.push(el('li', { text: `📎 Photos & PDFs: ${formatNumber(info.files)} (${sizeText(info.fileBytes)})` }));
    }
    if (!lines.length) lines.push(el('li', { text: 'No entries (only settings)' }));

    const yes = button({
      label: 'Yes, restore',
      variant: 'danger',
      block: true,
      onClick: async () => {
        busy(yes, true, 'Restoring…');
        no.disabled = true;
        try {
          await importAll(backup);
          preview.hidden = true;
          message.textContent = 'Restored ✅ Reopening the app…';
          toast({ message: 'Backup restored ✅' });
          setTimeout(() => location.reload(), 1500);
        } catch (err) {
          console.error(err);
          message.textContent = 'Sorry, the restore didn\'t work, so nothing was changed. Please try again.';
          busy(yes, false, 'Yes, restore');
          no.disabled = false;
        }
      },
    });
    const no = button({
      label: 'Cancel',
      variant: 'ghost',
      block: true,
      onClick: () => { preview.hidden = true; message.textContent = 'Restore cancelled. Nothing was changed.'; },
    });
    preview.replaceChildren(
      el('p', { className: 'settings-status', text: `Backup from ${when}` }),
      el('ul', { className: 'settings-steps' }, lines),
      el('p', {
        className: 'settings-note',
        text: 'This replaces everything on this phone with what\'s in the backup. Entries made after the backup will be gone. Your Google Sync link and key stay as they are.',
      }),
      yes, no,
    );
    preview.hidden = false;
  });

  return card({
    title: '💾 Backup',
    children: [
      el('p', { className: 'muted', text: `Save everything (including medical photos and PDFs) in one file. Do it now and then: it's your safety net if this phone is lost or reset.` }),
      el('div', { className: 'stack' }, [downloadButton, excelButton, restoreButton]),
      picker,
      preview,
      message,
    ],
  });
}
