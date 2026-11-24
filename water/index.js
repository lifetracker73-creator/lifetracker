// 💧 water module screens.
// WTR-1: quick-add buttons, a custom amount, today's list, delete with Undo.
// WTR-2: today's progress toward the daily goal.
// WTR-3: history bar chart (7/14/21/30 days) with a goal line, and a streak of goal days.
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import { add, remove, restore, list as listAll, listByDate, getSettings } from '../core/storage.js';
import { today, yesterday, addDays, dateRange, nowTime, formatTime } from '../core/dates.js';
import { formatMl } from '../core/format.js';
import { barChart } from '../core/charts.js';
import { celebrate, buddyMood } from '../core/buddy.js';

const DEFAULTS = { dailyGoalMl: 2500, quickAmounts: [250, 500, 750] };
const MAX_ML = 5000; // one entry above this is almost surely a typo
const HISTORY_DAYS = [7, 14, 21, 30];

// Total ml per date, from a list of entries: { '2026-11-24': 1750, ... }
function totalsByDate(entries) {
  const totals = {};
  for (const entry of entries) {
    totals[entry.date] = (totals[entry.date] || 0) + (Number(entry.amountMl) || 0);
  }
  return totals;
}

// Days in a row that reached the goal. Today counts once reached; an unfinished today
// doesn't break the streak, so counting starts from yesterday in that case.
function goalStreak(totals, goalMl) {
  let day = (totals[today()] || 0) >= goalMl ? today() : yesterday();
  let streak = 0;
  while ((totals[day] || 0) >= goalMl) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export async function render(root) {
  const settings = await getSettings('water', DEFAULTS);

  const listBox = el('div');

  // Today's progress toward the goal (WTR-2). Worked out on screen; nothing extra is stored.
  const goalMl = settings.dailyGoalMl > 0 ? settings.dailyGoalMl : DEFAULTS.dailyGoalMl;
  const bar = progressBar({ value: 0, max: goalMl, label: 'Water today toward your goal' });
  const amountText = el('span', { className: 'progress-stats__amount' });
  const percentText = el('span', { className: 'progress-stats__percent' });
  const noteText = el('p', { className: 'progress-note' });

  let shownTotal = 0; // today's total on screen, to spot the moment the goal is reached
  function showProgress(totalMl) {
    shownTotal = totalMl;
    const percent = Math.round((totalMl / goalMl) * 100);
    bar.set(totalMl, goalMl);
    amountText.textContent = `${formatMl(totalMl)} of ${formatMl(goalMl)}`;
    percentText.textContent = `${percent}%`;
    noteText.textContent = totalMl >= goalMl
      ? 'Goal reached! 🎉'
      : `${formatMl(goalMl - totalMl)} to go`;
    // 🍄 Thirsty with no water today, happier as you get closer to the goal (REFINE-3).
    if (totalMl <= 0) buddyMood('thirsty', '{name} is thirsty! A glass of water? 💧');
    else if (totalMl >= goalMl) buddyMood('happy', '{name} is fully watered and happy! 💦');
    else if (totalMl >= goalMl / 2) buddyMood('content', 'More than halfway! {name} feels fresh 💧');
    else buddyMood('okay', '{name} is sipping along… keep going 💧');
  }

  // History (WTR-3): chart of daily totals plus the goal streak. Worked out on screen.
  let historyDays = HISTORY_DAYS[0];
  let chart = null;
  const chartBox = el('div', { className: 'chart-box' });
  const streakText = el('p', { className: 'progress-note' });
  const rangeButtons = HISTORY_DAYS.map((days) => {
    const btn = button({
      label: String(days), // "7 days" doesn't fit four across on a 360px phone
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
        await refreshHistory();
      },
    });
    btn.dataset.days = String(days);
    btn.setAttribute('aria-pressed', String(days === historyDays));
    return btn;
  });

  async function refreshHistory() {
    const totals = totalsByDate(await listAll('water'));
    const dates = dateRange(addDays(today(), -(historyDays - 1)), today());
    const values = dates.map((d) => (totals[d] ? totals[d] : null)); // no entries = gap
    const config = { labels: dates, values };
    if (!chartBox.isConnected) return;
    if (chart) (await chart).update(config);
    else {
      // Keep the promise so quick taps never draw a second chart.
      chart = barChart(chartBox, {
        module: 'water', ...config, goal: goalMl, goalLabel: 'Goal', format: (v) => formatMl(v),
      });
      await chart;
    }
    const streak = goalStreak(totals, goalMl);
    streakText.textContent = streak > 0
      ? `🔥 ${streak}-day streak of goal days`
      : 'Reach your goal today to start a streak 💪';
  }

  async function refresh() {
    const entries = await listByDate('water', today());
    await refreshHistory();
    showProgress(entries.reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0));
    entries.sort((a, b) => (b.time.localeCompare(a.time)) || b.createdAt.localeCompare(a.createdAt));
    if (!entries.length) {
      listBox.replaceChildren(emptyState({
        emoji: '💧',
        title: 'No water yet today',
        text: 'Tap a button above to add a glass.',
      }));
      return;
    }
    listBox.replaceChildren(list(entries.map((entry) => listItem({
      title: formatMl(entry.amountMl),
      subtitle: formatTime(entry.time),
      actions: [button({
        icon: 'trash',
        variant: 'ghost',
        ariaLabel: `Delete ${formatMl(entry.amountMl)} at ${formatTime(entry.time)}`,
        onClick: () => deleteEntry(entry),
      })],
    }))));
  }

  async function logWater(amountMl) {
    const before = shownTotal;
    await add('water', { date: today(), time: nowTime(), amountMl });
    await refresh();
    // 🍄 The buddy cheers when this glass reaches today's goal (REFINE-2).
    if (before < goalMl && shownTotal >= goalMl) celebrate('{name} is cheering! 💧 Water goal reached');
  }

  async function deleteEntry(entry) {
    const removed = await remove('water', entry.id);
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted ${formatMl(removed.amountMl)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('water', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  // Quick-add buttons
  const quickRow = el('div', { className: 'btn-row' }, settings.quickAmounts.map((ml) => button({
    label: `+${formatMl(ml)}`,
    variant: 'primary',
    ariaLabel: `Add ${formatMl(ml)}`,
    onClick: () => logWater(ml),
  })));

  // Custom amount
  const amountField = input({
    label: 'Other amount (ml)',
    name: 'amountMl',
    type: 'number',
    inputmode: 'numeric',
    min: 1,
    max: MAX_ML,
    step: 1,
    placeholder: 'e.g. 300',
  });
  const form = el('form', { className: 'stack', novalidate: true }, [
    amountField,
    button({ label: 'Add', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = amountField.input.value.trim();
    const ml = Number(text);
    if (!text || !Number.isInteger(ml) || ml <= 0) {
      amountField.setError('Type a whole number of ml above 0.');
      return;
    }
    if (ml > MAX_ML) {
      amountField.setError(`That's a lot! Please enter ${formatMl(MAX_ML)} or less.`);
      return;
    }
    amountField.setError('');
    amountField.input.value = '';
    await logWater(ml);
  });
  amountField.input.addEventListener('input', () => amountField.setError(''));

  root.append(el('div', { className: 'mod-water stack' }, [
    card({ title: "Today's progress", module: 'water', children: [bar, el('div', { className: 'progress-stats' }, [amountText, percentText]), noteText] }),
    card({ title: 'Add water', module: 'water', children: [el('div', { className: 'stack' }, [quickRow, form])] }),
    card({ title: 'Today', children: [listBox] }),
    card({ title: 'History', module: 'water', children: [el('div', { className: 'stack' }, [
      el('div', { className: 'stack' }, [
        el('p', { className: 'progress-note', text: 'Days to show' }),
        el('div', { className: 'btn-row', role: 'group', 'aria-label': 'Days to show' }, rangeButtons),
      ]),
      chartBox,
      streakText,
    ])] }),
  ]));

  await refresh();
}
