// ⚖️ weight module screens.
// WGT-1: log today's weight (one per day; saving again replaces it), list of entries, edit/delete with Undo.
// WGT-2: history line chart (30/90/365 days) with a 7-day average line and change since start.
// WGT-3: BMI (if height is set in ⚙️ Settings) and progress toward the goal weight.
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import {
  add, update, remove, restore, list as listAll, listByDate, getSettings, saveSettings,
} from '../core/storage.js';
import { today, formatDate, addDays, dateRange } from '../core/dates.js';
import { formatKg, formatCm, formatNumber } from '../core/format.js';
import { lineChart } from '../core/charts.js';

const MIN_KG = 20;
const MAX_KG = 300;
const HISTORY_DAYS = [30, 90, 365];
// heightCm and goalKg are always saved in metric; heightUnit only changes how height is typed/shown.
const DEFAULTS = { heightCm: null, goalKg: null, heightUnit: 'cm' };
const CM_PER_INCH = 2.54;

// 170 -> { ft: 5, inch: 7 } (rounded to the nearest inch).
function cmToFeetInches(cm) {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { ft: Math.floor(totalInches / 12), inch: totalInches % 12 };
}

// "170 cm (5 ft 7 in)" or "5 ft 7 in (170 cm)", whichever unit was chosen first.
function heightText(cm, unit) {
  const { ft, inch } = cmToFeetInches(cm);
  const feet = `${ft} ft ${inch} in`;
  return unit === 'ftin' ? `${feet} (${formatCm(cm)})` : `${formatCm(cm)} (${feet})`;
}

// BMI from kg and cm, 1 decimal, with its standard band.
function bmiInfo(kg, cm) {
  const m = cm / 100;
  const bmi = Math.round((kg / (m * m)) * 10) / 10;
  let band = 'Obese';
  if (bmi < 18.5) band = 'Underweight';
  else if (bmi < 25) band = 'Healthy';
  else if (bmi < 30) band = 'Overweight';
  return { bmi, band };
}

// Average of the weights logged in the 7 days ending on `date` (null if none).
function sevenDayAverage(byDate, date) {
  const values = dateRange(addDays(date, -6), date).map((d) => byDate[d]).filter((v) => v != null);
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

// "📉 −2.4 kg since 25 Oct 2026" from the first and latest weights in the view.
function changeText(dates, byDate) {
  const logged = dates.filter((d) => byDate[d] != null);
  if (logged.length < 2) return 'Log a few more days to see your change ✨';
  const first = logged[0];
  const diff = Math.round((byDate[logged[logged.length - 1]] - byDate[first]) * 10) / 10;
  if (diff === 0) return `➖ No change since ${formatDate(first)}`;
  return diff < 0
    ? `📉 −${formatKg(-diff)} since ${formatDate(first)}`
    : `📈 +${formatKg(diff)} since ${formatDate(first)}`;
}

// Reads a typed weight. Gives back { kg } rounded to 1 decimal, or { error }.
function parseKg(text) {
  const clean = String(text).trim().replace(',', '.');
  const kg = Number(clean);
  if (!clean || !Number.isFinite(kg)) return { error: 'Type your weight in kg, e.g. 72.4' };
  if (kg < MIN_KG || kg > MAX_KG) return { error: `Please enter a weight between ${MIN_KG} and ${MAX_KG} kg.` };
  return { kg: Math.round(kg * 10) / 10 };
}

function weightField(value = '') {
  return input({
    label: "Today's weight (kg)",
    name: 'weightKg',
    type: 'number',
    inputmode: 'decimal',
    min: MIN_KG,
    max: MAX_KG,
    step: 0.1,
    value,
    placeholder: 'e.g. 72.4',
  });
}

export async function render(root) {
  const listBox = el('div');
  let editingId = null; // the entry whose row is open for editing
  let settings = await getSettings('weight', DEFAULTS);
  let latestEntries = [];

  // BMI & goal (WGT-3): worked out on screen from the weights and the saved height/goal.
  const bmiLine = el('div', { className: 'progress-stats__amount' });
  const bmiNote = el('p', { className: 'progress-note' });
  const goalLine = el('div', { className: 'progress-stats__amount' });
  const goalBar = progressBar({ label: 'Progress toward goal weight' });
  const goalNote = el('p', { className: 'progress-note' });

  function refreshBmiGoal(entries) {
    // entries are newest first; the first-ever weight is the starting point.
    const latest = entries[0];
    const first = entries[entries.length - 1];
    const { heightCm, goalKg } = settings;

    if (!heightCm) {
      bmiLine.textContent = '';
      bmiLine.hidden = true;
      bmiNote.textContent = 'Add your height in ⚙️ Settings → 📏 Height & weight to see your BMI ✨';
    } else if (!latest) {
      bmiLine.hidden = true;
      bmiNote.textContent = 'Log a weight above to see your BMI.';
    } else {
      const { bmi, band } = bmiInfo(latest.weightKg, heightCm);
      bmiLine.hidden = false;
      bmiLine.textContent = `BMI ${formatNumber(bmi, 1)} · ${band}`;
      bmiNote.textContent = `From ${formatKg(latest.weightKg)} and ${heightText(heightCm, settings.heightUnit)}. `
        + 'Healthy is 18.5 to 24.9. BMI is only a rough guide.';
    }

    goalBar.hidden = true;
    goalLine.hidden = true;
    if (!goalKg) {
      goalNote.textContent = 'Set a goal weight below to see your progress 🎯';
      return;
    }
    if (!latest) {
      goalNote.textContent = `Goal: ${formatKg(goalKg)}. Log a weight above to start.`;
      return;
    }
    const start = Number(first.weightKg);
    const now = Number(latest.weightKg);
    const losing = goalKg < start;
    const left = Math.round(Math.abs(now - goalKg) * 10) / 10;
    const reached = losing ? now <= goalKg : now >= goalKg;
    const totalChange = Math.abs(start - goalKg);
    const madeChange = losing ? start - now : now - start;
    const percent = reached ? 100 : Math.max(0, Math.round((madeChange / totalChange) * 100));

    goalLine.hidden = false;
    goalBar.hidden = false;
    goalBar.set(percent, 100);
    goalLine.textContent = reached ? 'Goal reached! 🎉' : `${formatKg(left)} to go · ${percent}%`;
    goalNote.textContent = `Goal ${formatKg(goalKg)} · started at ${formatKg(start)} on ${formatDate(first.date)}`
      + ` · now ${formatKg(now)}`;
  }

  // My goal form (WGT-3). Height is set in ⚙️ Settings → 📏 Height & weight.
  const goalField = input({
    label: 'Goal weight (kg)', name: 'goalKg', type: 'number', inputmode: 'decimal',
    min: MIN_KG, max: MAX_KG, step: 0.1, placeholder: 'e.g. 68',
  });
  const settingsNote = el('p', { className: 'progress-note' });

  function showSettings() {
    goalField.input.value = settings.goalKg ? String(settings.goalKg) : '';
    settingsNote.textContent = settings.goalKg
      ? `Saved: Goal ${formatKg(settings.goalKg)}. Leave the box empty to clear it.`
      : 'Optional. Your height (for BMI) is in ⚙️ Settings.';
  }

  goalField.input.addEventListener('input', () => goalField.setError(''));

  const settingsForm = el('form', { className: 'stack', novalidate: true }, [
    goalField,
    button({ label: 'Save goal', variant: 'primary', type: 'submit', block: true }),
    settingsNote,
  ]);

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const goalText = goalField.input.value.trim();
    const goal = goalText ? parseKg(goalText) : { kg: null };
    goalField.setError(goal.error ? goal.error.replace('your weight', 'your goal weight') : '');
    if (goal.error) return;
    settings = await saveSettings('weight', { goalKg: goal.kg });
    showSettings();
    refreshBmiGoal(latestEntries);
    toast({ message: 'Goal saved 🎯' });
  });
  showSettings();

  // Today's log form
  const todayField = weightField();
  const saveBtn = button({ label: 'Save', icon: 'plus', variant: 'primary', type: 'submit', block: true });
  const todayNote = el('p', { className: 'progress-note' });
  const form = el('form', { className: 'stack', novalidate: true }, [todayField, saveBtn, todayNote]);
  todayField.input.addEventListener('input', () => todayField.setError(''));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { kg, error } = parseKg(todayField.input.value);
    if (error) {
      todayField.setError(error);
      return;
    }
    todayField.setError('');
    const [existing] = await listByDate('weight', today());
    if (existing) await update('weight', existing.id, { weightKg: kg });
    else await add('weight', { date: today(), weightKg: kg });
    await refresh();
  });

  function showToday(entry) {
    todayField.input.value = entry ? String(entry.weightKg) : '';
    saveBtn.querySelector('span:last-child').textContent = entry ? 'Update' : 'Save';
    todayNote.textContent = entry
      ? `Saved for today: ${formatKg(entry.weightKg)} ✨ Saving again replaces it.`
      : 'One weight per day. Weighing at the same time each day works best.';
  }

  // A row opened for editing: weight box with Save and Cancel.
  function editRow(entry) {
    const field = weightField(String(entry.weightKg));
    field.querySelector('label').textContent = `Weight on ${formatDate(entry.date)} (kg)`;
    field.input.addEventListener('input', () => field.setError(''));
    const editForm = el('form', { className: 'stack', novalidate: true }, [
      field,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { kg, error } = parseKg(field.input.value);
      if (error) {
        field.setError(error);
        return;
      }
      await update('weight', entry.id, { weightKg: kg });
      editingId = null;
      await refresh();
    });
    const row = el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [editForm])]);
    queueMicrotask(() => field.input.focus());
    return row;
  }

  // History (WGT-2): daily weight plus 7-day average, worked out on screen.
  let historyDays = HISTORY_DAYS[0];
  let chart = null;
  const chartBox = el('div', { className: 'chart-box' });
  const changeNote = el('p', { className: 'progress-note' });
  const rangeButtons = HISTORY_DAYS.map((days) => {
    const btn = button({
      label: String(days),
      variant: days === historyDays ? 'primary' : 'secondary',
      ariaLabel: `Show the last ${days} days`,
      onClick: async () => {
        historyDays = days;
        rangeButtons.forEach((b) => {
          const on = b.dataset.days === String(days);
          b.classList.toggle('btn--primary', on);
          b.classList.toggle('btn--secondary', !on);
          b.setAttribute('aria-pressed', String(on));
        });
        await refreshHistory(await listAll('weight'));
      },
    });
    btn.dataset.days = String(days);
    btn.setAttribute('aria-pressed', String(days === historyDays));
    return btn;
  });

  async function refreshHistory(entries) {
    const byDate = {};
    for (const entry of entries) byDate[entry.date] = Number(entry.weightKg);
    const dates = dateRange(addDays(today(), -(historyDays - 1)), today());
    const values = dates.map((d) => (byDate[d] != null ? byDate[d] : null)); // no weight = gap
    const average = dates.map((d) => sevenDayAverage(byDate, d));
    const config = {
      labels: dates,
      series: [
        { label: 'Weight', values },
        { label: '7-day average', values: average, style: 'average' },
      ],
    };
    changeNote.textContent = changeText(dates, byDate);
    if (!chartBox.isConnected) return;
    if (chart) (await chart).update(config);
    else {
      // Keep the promise so quick taps never draw a second chart.
      chart = lineChart(chartBox, { module: 'weight', ...config, format: (v) => formatKg(v) });
      await chart;
    }
  }

  async function refresh() {
    const entries = await listAll('weight');
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    showToday(entries.find((entry) => entry.date === today()));
    latestEntries = entries;
    refreshBmiGoal(entries);
    await refreshHistory(entries);
    if (!entries.length) {
      listBox.replaceChildren(emptyState({
        emoji: '⚖️',
        title: 'No weights yet',
        text: "Type today's weight above to start.",
      }));
      return;
    }
    listBox.replaceChildren(list(entries.map((entry) => (entry.id === editingId ? editRow(entry) : listItem({
      title: formatKg(entry.weightKg),
      subtitle: entry.date === today() ? `Today · ${formatDate(entry.date)}` : formatDate(entry.date),
      actions: [
        button({
          icon: 'edit',
          variant: 'ghost',
          ariaLabel: `Edit ${formatKg(entry.weightKg)} on ${formatDate(entry.date)}`,
          onClick: () => { editingId = entry.id; refresh(); },
        }),
        button({
          icon: 'trash',
          variant: 'ghost',
          ariaLabel: `Delete ${formatKg(entry.weightKg)} on ${formatDate(entry.date)}`,
          onClick: () => deleteEntry(entry),
        }),
      ],
    })))));
  }

  async function deleteEntry(entry) {
    const removed = await remove('weight', entry.id);
    if (editingId === entry.id) editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted ${formatKg(removed.weightKg)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        // One per day: if that day got a new weight meanwhile, keep the new one.
        const [sameDay] = await listByDate('weight', removed.date);
        if (sameDay) {
          toast({ message: `${formatDate(removed.date)} already has a new weight` });
          return;
        }
        await restore('weight', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  root.append(el('div', { className: 'mod-weight stack' }, [
    card({ title: 'Log weight', module: 'weight', children: [form] }),
    card({ title: 'BMI & goal', module: 'weight', children: [el('div', { className: 'stack' }, [
      el('div', {}, [bmiLine, bmiNote]),
      el('div', { className: 'stack' }, [goalLine, goalBar, goalNote]),
    ])] }),
    card({ title: 'Entries', children: [listBox] }),
    card({ title: 'History', module: 'weight', children: [el('div', { className: 'stack' }, [
      el('div', { className: 'stack' }, [
        el('p', { className: 'progress-note', text: 'Days to show' }),
        el('div', { className: 'btn-row', role: 'group', 'aria-label': 'Days to show' }, rangeButtons),
      ]),
      chartBox,
      changeNote,
    ])] }),
    card({ title: 'My goal', module: 'weight', children: [settingsForm] }),
  ]));

  await refresh();
}
