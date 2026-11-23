// 😴 sleep module screens.
// SLP-1: log a night (bed and wake time, defaults to last night), one entry per night (the morning you
// woke up), list of nights, edit/delete with Undo. Plus a quick "Going to bed" / "I'm awake" pair and a
// wake-up cut-off time: if "I'm awake" is forgotten, the wake time is set to the cut-off automatically.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import {
  add, update, remove, restore, list as listAll, listByDate, getSettings, saveSettings,
} from '../core/storage.js';
import {
  today, yesterday, currentHour, nowDateTime, addDays, daysBetween, formatDate, formatTime, formatDuration,
} from '../core/dates.js';

// wakeCutoff: 'HH:MM', or '' when switched off. pendingBedTime: 'YYYY-MM-DD HH:MM' after
// "Going to bed" until the night is finished (kept in settings, so it's never a half-filled entry).
const DEFAULTS = { targetHours: 8, wakeCutoff: '10:00', pendingBedTime: null };
const DEFAULT_BED = '23:00';
const DEFAULT_WAKE = '07:00';
const MAX_MINUTES = 24 * 60;

const hmToMinutes = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

// Minutes from one 'YYYY-MM-DD HH:MM' to another (negative if the second is earlier).
function minutesBetween(from, to) {
  const [fd, ft] = from.split(' ');
  const [td, tt] = to.split(' ');
  return daysBetween(fd, td) * 1440 + hmToMinutes(tt) - hmToMinutes(ft);
}

// Checks a bed/wake pair. Gives back { minutes } or { error }.
function checkNight(bedTime, wakeTime) {
  const valid = (dt) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dt);
  if (!valid(bedTime) || !valid(wakeTime)) return { error: 'Please fill in both dates and times.' };
  const minutes = minutesBetween(bedTime, wakeTime);
  if (minutes <= 0) return { error: 'Wake time must be after bed time.' };
  if (minutes > MAX_MINUTES) return { error: 'That is longer than 24 hours. Please check the dates.' };
  if (wakeTime > nowDateTime()) return { error: "Wake time can't be in the future." };
  return { minutes };
}

// The first time the clock shows the cut-off after going to bed.
function cutoffAfter(bedTime, cutoff) {
  const bedDate = bedTime.slice(0, 10);
  const sameDay = `${bedDate} ${cutoff}`;
  return sameDay > bedTime ? sameDay : `${addDays(bedDate, 1)} ${cutoff}`;
}

// A date box and a time box side by side.
function dateTimeFields(label, dt) {
  const [d, t] = dt.split(' ');
  const date = input({ label: `${label} date`, name: `${label}Date`, type: 'date', value: d });
  const time = input({ label: `${label} time`, name: `${label}Time`, type: 'time', value: t });
  const row = el('div', { className: 'field-row' }, [date, time]);
  row.value = () => `${date.input.value} ${time.input.value}`;
  row.fields = [date, time];
  return row;
}

// Saves a night on the morning it ended. One per night: replaces that morning's entry if there is one.
async function saveNight(bedTime, wakeTime, autoWake) {
  const date = wakeTime.slice(0, 10);
  const [existing] = await listByDate('sleep', date);
  const data = { date, bedTime, wakeTime, autoWake };
  if (existing) await update('sleep', existing.id, data);
  else await add('sleep', data);
}

const nightText = (n) => `${formatTime(n.bedTime.slice(11))} → ${formatTime(n.wakeTime.slice(11))}`;

// Saves some sleep settings and gives back all of them, with defaults for anything never saved.
async function saveSleepSettings(values) {
  return { ...DEFAULTS, ...(await saveSettings('sleep', values)) };
}

// ---------- Going to bed / I'm awake (shared by the Sleep screen and the Home card) ----------

// If a bed time is waiting and the cut-off has passed, finish the night at the cut-off.
async function finishIfPastCutoff(settings) {
  const bed = settings.pendingBedTime;
  if (!bed || !settings.wakeCutoff) return { settings, finished: false };
  const wake = cutoffAfter(bed, settings.wakeCutoff);
  if (wake > nowDateTime()) return { settings, finished: false };
  await saveNight(bed, wake, true);
  const saved = await saveSleepSettings({ pendingBedTime: null });
  toast({ message: `Wake time set to ${formatTime(saved.wakeCutoff)} automatically ⏰ Edit it if needed.` });
  return { settings: saved, finished: true };
}

// "Going to bed": remembers the time now. Undo forgets it again and calls onUndo(settings).
async function bedNow(onUndo) {
  const saved = await saveSleepSettings({ pendingBedTime: nowDateTime() });
  toast({
    message: 'Good night 🌙 Sleep well!',
    actionLabel: 'Undo',
    onAction: async () => onUndo(await saveSleepSettings({ pendingBedTime: null })),
  });
  return saved;
}

// "I'm awake": logs the night from bed time to now, worked out automatically.
async function wakeNow(settings, errorHint) {
  const result = await finishIfPastCutoff(settings);
  if (result.finished || !result.settings.pendingBedTime) return result;
  const bed = settings.pendingBedTime;
  const wake = nowDateTime();
  const { minutes, error } = checkNight(bed, wake);
  if (error) {
    toast({ message: `${error} ${errorHint}` });
    return { settings, finished: false };
  }
  await saveNight(bed, wake, false);
  toast({ message: `Good morning ☀️ You slept ${formatDuration(minutes)}` });
  return { settings: await saveSleepSettings({ pendingBedTime: null }), finished: true };
}

// The Home card shows "Going to bed" from 10 pm to 6 am, and "I'm awake" from 6 am while a night is open.
const BED_FROM_HOUR = 22;
const AWAKE_FROM_HOUR = 6;

/** A small Sleep card for the Home screen (it hides itself when there is nothing to tap). */
export async function homeCard() {
  let settings = (await finishIfPastCutoff(await getSettings('sleep', DEFAULTS))).settings;
  const inner = el('div', { className: 'stack' });
  const box = card({ title: 'Sleep', module: 'sleep', children: [inner] });
  const show = (on) => { box.style.display = on ? '' : 'none'; };

  function draw() {
    const hour = currentHour();
    const bed = settings.pendingBedTime;
    show(true);
    if (!bed && (hour >= BED_FROM_HOUR || hour < AWAKE_FROM_HOUR)) {
      inner.replaceChildren(
        button({ label: '🌙 Going to bed', variant: 'primary', block: true, onClick: goToBed }),
        el('p', { className: 'progress-note', text: 'Tap when you go to bed, and "I\'m awake" in the morning. Your sleep is worked out and saved for you.' }),
      );
    } else if (bed) {
      const sleeping = `😴 Sleeping since ${formatTime(bed.slice(11))}`;
      inner.replaceChildren(
        el('div', { className: 'progress-stats__amount', text: sleeping }),
        // From the first 6 am after going to bed (not straight after tapping at 10:30 pm).
        cutoffAfter(bed, `0${AWAKE_FROM_HOUR}:00`) <= nowDateTime()
          ? button({ label: "☀️ I'm awake", variant: 'primary', block: true, onClick: wakeUp })
          : el('p', { className: 'progress-note', text: 'Sleep well 🌙 The "I\'m awake" button shows here from 6 am.' }),
      );
    } else {
      show(false);
    }
  }

  async function goToBed() {
    settings = await bedNow((s) => { settings = s; draw(); });
    draw();
  }

  async function wakeUp() {
    settings = (await wakeNow(settings, 'Open 😴 Sleep to log the night by hand.')).settings;
    draw();
  }

  draw();
  // While Home is open, switch buttons when the clock passes 10 pm / 6 am or the cut-off.
  const timer = setInterval(async () => {
    if (!box.isConnected) { clearInterval(timer); return; }
    settings = (await finishIfPastCutoff(settings)).settings;
    draw();
  }, 60 * 1000);
  return box;
}

export async function render(root) {
  let settings = await getSettings('sleep', DEFAULTS);
  let editingId = null;
  let entries = [];
  const listBox = el('div');

  // ---------- Bedtime / I'm awake ----------
  const tonightBox = el('div', { className: 'stack' });

  async function autoFinish() {
    const result = await finishIfPastCutoff(settings);
    settings = result.settings;
    return result.finished;
  }

  function showTonight() {
    const bed = settings.pendingBedTime;
    const cutoffNote = settings.wakeCutoff
      ? `If you forget, your wake time is set to ${formatTime(settings.wakeCutoff)} automatically.`
      : 'The wake-up cut-off is off, so remember to tap "I\'m awake".';
    if (!bed) {
      tonightBox.replaceChildren(
        button({ label: '🌙 Going to bed', variant: 'primary', block: true, onClick: goToBed }),
        el('p', { className: 'progress-note', text: `Tap when you go to bed, then "I'm awake" in the morning. ${cutoffNote}` }),
      );
      return;
    }
    const bedDate = bed.slice(0, 10);
    const when = bedDate === today() ? '' : ` (${formatDate(bedDate)})`;
    tonightBox.replaceChildren(
      el('div', { className: 'progress-stats__amount', text: `😴 Sleeping since ${formatTime(bed.slice(11))}${when}` }),
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: cancelBed }),
        button({ label: "☀️ I'm awake", variant: 'primary', onClick: wakeUp }),
      ]),
      el('p', { className: 'progress-note', text: cutoffNote }),
    );
  }

  async function goToBed() {
    settings = await bedNow(async (s) => {
      settings = s;
      if (tonightBox.isConnected) showTonight();
    });
    showTonight();
  }

  async function cancelBed() {
    settings = await saveSleepSettings({ pendingBedTime: null });
    showTonight();
  }

  async function wakeUp() {
    settings = (await wakeNow(settings, 'Tap Cancel and log the night below.')).settings;
    await refresh();
  }

  // ---------- Log a night (form) ----------
  // Starts on last night; before 7 am, today's morning hasn't happened yet, so the night before.
  const wakeDay = nowDateTime() >= `${today()} ${DEFAULT_WAKE}` ? today() : yesterday();
  const bedRow = dateTimeFields('Bed', `${addDays(wakeDay, -1)} ${DEFAULT_BED}`);
  const wakeRow = dateTimeFields('Wake', `${wakeDay} ${DEFAULT_WAKE}`);
  const preview = el('p', { className: 'progress-note' });
  const formError = el('div', { className: 'field__error', hidden: true });
  const saveBtn = button({ label: 'Save', icon: 'plus', variant: 'primary', type: 'submit', block: true });
  const form = el('form', { className: 'stack', novalidate: true }, [bedRow, wakeRow, formError, preview, saveBtn]);

  function setFormError(message) {
    formError.textContent = message;
    formError.hidden = !message;
  }

  function showPreview() {
    const wakeDate = wakeRow.value().slice(0, 10);
    const existing = entries.find((n) => n.date === wakeDate);
    saveBtn.querySelector('span:last-child').textContent = existing ? 'Update' : 'Save';
    const { minutes, error } = checkNight(bedRow.value(), wakeRow.value());
    let text = error ? '' : `You slept ${formatDuration(minutes)} 💤`;
    if (existing) text += `${text ? ' · ' : ''}Saving replaces the night ending ${formatDate(wakeDate)}.`;
    preview.textContent = text;
  }

  [...bedRow.fields, ...wakeRow.fields].forEach((f) => f.input.addEventListener('input', () => {
    setFormError('');
    showPreview();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bed = bedRow.value();
    const wake = wakeRow.value();
    const { error } = checkNight(bed, wake);
    setFormError(error || '');
    if (error) return;
    await saveNight(bed, wake, false);
    toast({ message: `Saved the night ending ${formatDate(wake.slice(0, 10))} ✨` });
    await refresh();
  });

  // ---------- Nights list ----------
  function editRow(night) {
    const bed = dateTimeFields('Bed', night.bedTime);
    const wake = dateTimeFields('Wake', night.wakeTime);
    const error = el('div', { className: 'field__error', hidden: true });
    const setError = (msg) => { error.textContent = msg; error.hidden = !msg; };
    [...bed.fields, ...wake.fields].forEach((f) => f.input.addEventListener('input', () => setError('')));
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      bed, wake, error,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bedTime = bed.value();
      const wakeTime = wake.value();
      const check = checkNight(bedTime, wakeTime);
      if (check.error) { setError(check.error); return; }
      const date = wakeTime.slice(0, 10);
      const [other] = (await listByDate('sleep', date)).filter((n) => n.id !== night.id);
      if (other) { setError(`${formatDate(date)} already has a night. Delete that one first.`); return; }
      await update('sleep', night.id, { date, bedTime, wakeTime, autoWake: false });
      editingId = null;
      await refresh();
    });
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
  }

  async function deleteNight(night) {
    const removed = await remove('sleep', night.id);
    if (editingId === night.id) editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted ${formatDuration(minutesBetween(removed.bedTime, removed.wakeTime))}`,
      actionLabel: 'Undo',
      onAction: async () => {
        // One per night: if that morning got a new entry meanwhile, keep the new one.
        const [sameDay] = await listByDate('sleep', removed.date);
        if (sameDay) {
          toast({ message: `${formatDate(removed.date)} already has a new night` });
          return;
        }
        await restore('sleep', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  async function refresh() {
    entries = await listAll('sleep');
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    showTonight();
    showPreview();
    if (!entries.length) {
      listBox.replaceChildren(emptyState({
        emoji: '😴',
        title: 'No nights yet',
        text: 'Tap "Going to bed" tonight, or log last night above.',
      }));
      return;
    }
    listBox.replaceChildren(list(entries.map((night) => {
      if (night.id === editingId) return editRow(night);
      const duration = formatDuration(minutesBetween(night.bedTime, night.wakeTime));
      const day = night.date === today() ? `Today · ${formatDate(night.date)}` : formatDate(night.date);
      return listItem({
        title: duration,
        subtitle: `${nightText(night)} · ${day}${night.autoWake ? ' · ⏰ auto wake' : ''}`,
        actions: [
          button({
            icon: 'edit',
            variant: 'ghost',
            ariaLabel: `Edit the night ending ${formatDate(night.date)}`,
            onClick: () => { editingId = night.id; refresh(); },
          }),
          button({
            icon: 'trash',
            variant: 'ghost',
            ariaLabel: `Delete the night ending ${formatDate(night.date)}`,
            onClick: () => deleteNight(night),
          }),
        ],
      });
    })));
  }

  // ---------- Wake-up cut-off (setting) ----------
  const cutoffField = input({
    label: 'Wake-up cut-off time',
    name: 'wakeCutoff',
    type: 'time',
    value: settings.wakeCutoff || '',
    hint: 'Leave empty to switch it off.',
  });
  const cutoffNote = el('p', { className: 'progress-note' });
  const showCutoff = () => {
    cutoffNote.textContent = settings.wakeCutoff
      ? `Now: ${formatTime(settings.wakeCutoff)}. If you tap "Going to bed" and forget "I'm awake", `
        + 'your wake time is set to this time.'
      : 'Off: a night stays open until you tap "I\'m awake".';
  };
  const cutoffForm = el('form', { className: 'stack', novalidate: true }, [
    cutoffField,
    button({ label: 'Save', variant: 'primary', type: 'submit', block: true }),
    cutoffNote,
  ]);
  cutoffForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = cutoffField.input.value.trim();
    if (value && !/^\d{2}:\d{2}$/.test(value)) { cutoffField.setError('Pick a time, e.g. 10:00 am'); return; }
    cutoffField.setError('');
    settings = await saveSleepSettings({ wakeCutoff: value });
    showCutoff();
    toast({ message: value ? `Cut-off set to ${formatTime(value)} ✨` : 'Cut-off switched off' });
    await autoFinish();
    await refresh();
  });
  showCutoff();

  root.append(el('div', { className: 'mod-sleep stack' }, [
    card({ title: 'Bedtime', module: 'sleep', children: [tonightBox] }),
    card({ title: 'Log a night', module: 'sleep', children: [form] }),
    card({ title: 'Nights', children: [listBox] }),
    card({ title: 'Wake-up cut-off', module: 'sleep', children: [cutoffForm] }),
  ]));

  await autoFinish();
  await refresh();

  // While this screen is open, finish a forgotten night as soon as the cut-off passes.
  const timer = setInterval(async () => {
    if (!listBox.isConnected) { clearInterval(timer); return; }
    if (await autoFinish()) await refresh();
  }, 60 * 1000);
}
