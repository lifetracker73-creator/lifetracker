// HOME-1: "📅 Today" cards on the home screen, one per module, summarising today.
// Everything is worked out from saved data; nothing new is stored.
import { el, badge, modules, progressBar } from './ui.js';
import { list, listByDate, getSettings } from './storage.js';
import { today, formatTime, sleepMinutes, formatDuration } from './dates.js';
import { formatMl, formatMoney, formatNumber, formatG } from './format.js';

const WATER_DEFAULTS = { dailyGoalMl: 2500 };
const FOOD_DEFAULT_TARGETS = { kcal: 2000, proteinG: 60 };
const isBlank = (v) => v === null || v === undefined || v === '';

// One tappable card: emoji bubble, module name, main line, small line, optional bar.
function todayCard(key, { main, sub = '', bar = null, empty = false }) {
  return el('a', { className: `card today-card mod-${key}${empty ? ' today-card--empty' : ''}`, href: `#/${key}` }, [
    badge(key),
    el('div', { className: 'today-card__body' }, [
      el('span', { className: 'today-card__label', text: modules[key].label }),
      el('span', { className: 'today-card__main', text: main }),
      sub ? el('span', { className: 'muted today-card__sub', text: sub }) : null,
      bar,
    ]),
  ]);
}

async function water(day) {
  const [entries, settings] = await Promise.all([listByDate('water', day), getSettings('water', WATER_DEFAULTS)]);
  const goal = settings.dailyGoalMl > 0 ? settings.dailyGoalMl : WATER_DEFAULTS.dailyGoalMl;
  const total = entries.reduce((s, e) => s + (Number(e.amountMl) || 0), 0);
  if (!total) return todayCard('water', { main: 'No water yet', sub: `Goal ${formatMl(goal)} · tap to add 💧`, empty: true });
  const percent = Math.round((total / goal) * 100);
  return todayCard('water', {
    main: `${formatMl(total)} of ${formatMl(goal)} · ${percent}%`,
    sub: total >= goal ? 'Goal reached! 🎉' : `${formatMl(goal - total)} to go`,
    bar: progressBar({ value: total, max: goal, label: 'Water today' }),
  });
}

async function sleep(day) {
  const night = (await listByDate('sleep', day))[0];
  if (!night) return todayCard('sleep', { main: 'Last night not logged yet', sub: 'Tap to log it 😴', empty: true });
  return todayCard('sleep', {
    main: `${formatDuration(sleepMinutes(night.bedTime, night.wakeTime))} last night`,
    sub: `${formatTime(night.bedTime.split(' ')[1])} → ${formatTime(night.wakeTime.split(' ')[1])}${night.autoWake ? ' · ⏰ auto wake' : ''}`,
  });
}

async function food(day) {
  const [entries, settings] = await Promise.all([
    listByDate('foodLog', day), getSettings('food', { targets: FOOD_DEFAULT_TARGETS }),
  ]);
  if (!entries.length) return todayCard('food', { main: 'Nothing logged yet', sub: 'Tap to add a meal 🍱', empty: true });
  const sum = (field) => entries.reduce((s, e) => s + (isBlank(e[field]) ? 0 : Number(e[field]) || 0), 0);
  const unknown = entries.some((e) => isBlank(e.kcal));
  const kcal = Math.round(sum('kcal'));
  const target = (settings.targets || {}).kcal > 0 ? settings.targets.kcal : null;
  const proteinTarget = (settings.targets || {}).proteinG > 0 ? settings.targets.proteinG : null;
  const protein = sum('proteinG');
  return todayCard('food', {
    main: target ? `${formatNumber(kcal)} of ${formatNumber(target)} kcal` : `${formatNumber(kcal)} kcal`,
    sub: `${formatG(Math.round(protein))} protein${proteinTarget ? ` of ${formatG(proteinTarget)}` : ''} · ${entries.length} item${entries.length === 1 ? '' : 's'}${unknown ? ' · some kcal unknown' : ''}`,
    bar: target ? progressBar({ value: kcal, max: target, label: 'Calories today' }) : null,
  });
}

async function money(day) {
  const entries = await listByDate('expenses', day);
  if (!entries.length) return todayCard('money', { main: 'No spending today', sub: 'Tap to add an expense 💸', empty: true });
  const total = entries.reduce((s, e) => s + (Number(e.amountPaise) || 0), 0);
  return todayCard('money', {
    main: `Spent ${formatMoney(total)} today`,
    sub: `${entries.length} expense${entries.length === 1 ? '' : 's'}`,
  });
}

const PRIORITY = { high: 0, normal: 1, low: 2 };
async function tasks(day) {
  const open = (await list('tasks')).filter((t) => !t.done && t.dueDate && t.dueDate <= day);
  if (!open.length) return todayCard('tasks', { main: 'Nothing due today 🌿', sub: 'Tap to see your tasks', empty: true });
  const overdue = open.filter((t) => t.dueDate < day).length;
  const dueToday = open.length - overdue;
  open.sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1)
    || a.dueDate.localeCompare(b.dueDate)
    || (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
  const next = open[0];
  const parts = [];
  if (dueToday) parts.push(`${dueToday} due today`);
  if (overdue) parts.push(`⚠️ ${overdue} overdue`);
  return todayCard('tasks', {
    main: parts.join(' · '),
    sub: `Next: ${next.title}${next.dueDate === day && next.dueTime ? ` · ${formatTime(next.dueTime)}` : ''}`,
  });
}

const BUILDERS = { water, sleep, food, money, tasks };

/**
 * The "📅 Today" section: one card per module (water, sleep, food, money, tasks),
 * in the order chosen in Settings → Customise menu. Fills itself in once the data is read.
 */
export function todaySection(order) {
  const grid = el('div', { className: 'today-grid' });
  const section = el('section', { className: 'today', 'aria-labelledby': 'today-title' }, [
    el('h2', { id: 'today-title', className: 'today__title', text: '📅 Today' }),
    grid,
  ]);
  const day = today();
  const keys = order.filter((key) => BUILDERS[key]);
  Promise.all(keys.map((key) => BUILDERS[key](day).catch((err) => {
    console.error(err);
    return todayCard(key, { main: 'Couldn’t load today’s summary', sub: 'Tap to open', empty: true });
  }))).then((cards) => grid.append(...cards));
  return section;
}
