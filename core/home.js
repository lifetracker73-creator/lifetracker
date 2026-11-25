// HOME-1: "📅 Today" cards on the home screen, one per module, summarising today.
// Everything is worked out from saved data; nothing new is stored.
import { el, badge, card, button, modules, progressBar } from './ui.js';
import { list, listByDate, listByDateRange, getSettings } from './storage.js';
import { today, formatTime, sleepMinutes, formatDuration, addDays, daysBetween, dateRange, monthStart, currentHour, weekStart } from './dates.js';
import { barChart } from './charts.js';
import { formatMl, formatMoney, formatNumber, formatG, formatKg } from './format.js';
import { loadDailyCost, dueText } from './refills.js';

const WATER_DEFAULTS = { dailyGoalMl: 2500 };
const FOOD_DEFAULT_TARGETS = { kcal: 2000, proteinG: 60 };
const isBlank = (v) => v === null || v === undefined || v === '';

// One tappable card: emoji bubble, module name, main line, small line, optional bar.
// REFINE-8: every card keeps room for all four lines (blank ones stay empty), and long lines end
// with "…", so all Today cards are exactly the same size.
function todayCard(key, { main, sub = '', bar = null, empty = false }) {
  return el('a', { className: `card today-card mod-${key}${empty ? ' today-card--empty' : ''}`, href: `#/${key}`, title: [main, sub].filter(Boolean).join(' · ') }, [
    badge(key),
    el('div', { className: 'today-card__body' }, [
      el('span', { className: 'today-card__label', text: modules[key].label }),
      el('span', { className: 'today-card__main', text: main }),
      el('span', { className: 'muted today-card__sub', text: sub || ' ' }),
      bar || el('div', { className: 'today-card__bar-space', 'aria-hidden': 'true' }),
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

// GYM-7: worked out today or not, workouts this week vs the weekly goal, gym streak.
// Same streak rule as 🏋️ Gym log: weeks in a row at the goal; this week counts once it's reached.
async function gym(day) {
  const [sessions, settings] = await Promise.all([list('gymSessions'), getSettings('gym', { weeklyGoal: 3, types: [] })]);
  // 0 means "no weekly goal": then just the count, with no bar or streak.
  const goal = Number.isInteger(settings.weeklyGoal) && settings.weeklyGoal >= 0 ? settings.weeklyGoal : 3;
  const perWeek = new Map();
  for (const s of sessions) perWeek.set(weekStart(s.date), (perWeek.get(weekStart(s.date)) || 0) + 1);
  const thisWeek = weekStart(day);
  const done = perWeek.get(thisWeek) || 0;
  let w = done >= goal ? thisWeek : addDays(thisWeek, -7);
  let streak = 0;
  while (goal > 0 && (perWeek.get(w) || 0) >= goal) { streak += 1; w = addDays(w, -7); }
  const todays = sessions.filter((s) => s.date === day);
  const typeName = (id) => (settings.types || []).find((t) => t.id === id)?.name || 'Workout';
  const sub = goal > 0
    ? `${done} of ${goal} this week${streak ? ` · 🔥 ${streak}-week streak` : ''}`
    : `${done} workout${done === 1 ? '' : 's'} this week`;
  const bar = goal > 0 ? progressBar({ value: done, max: goal, label: 'Workouts this week' }) : null;
  if (!todays.length) return todayCard('gym', { main: 'No workout yet today', sub, bar, empty: true });
  return todayCard('gym', {
    main: `Worked out today 💪 ${[...new Set(todays.map((s) => typeName(s.typeId)))].join(', ')}`,
    sub, bar,
  });
}

// REF-6: the next refill due (soonest expected) and the daily cost of living.
async function refills(day) {
  const cost = await loadDailyCost(day);
  if (!cost.items.length) {
    const any = (await list('refillItems')).length;
    return todayCard('refills', {
      main: any ? 'Not enough refills yet' : 'No refill items yet',
      sub: any ? 'Log 2 refills of an item to see when it’s due' : 'Tap to add gas, rice, water can… 🔄',
      empty: true,
    });
  }
  const next = [...cost.items].sort((a, b) => a.stats.expected.localeCompare(b.stats.expected))[0];
  return todayCard('refills', {
    main: `${next.stats.daysLeft < 0 ? '⏰ ' : ''}${next.item.name} ${dueText(next.stats.daysLeft)}`,
    sub: `Daily cost ${formatMoney(Math.round(cost.perDayPaise))} · ${formatMoney(Math.round(cost.perMonthPaise / 100) * 100)} a month`,
  });
}

const BUILDERS = { water, sleep, food, money, tasks, gym, refills };

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

// ---------------------------------------------------------------------------
// HOME-SUMMARY: streak chip, progress rings, mini 7-day chart, encouraging message,
// live stats on the tiles, reading check-in banner and the floating quick-add button.
// All worked out on screen from saved data; nothing new is stored.

const SLEEP_DEFAULTS = { targetHours: 8 };
const DUE_AFTER_DAYS = 3; // reading check-in is due after 3 days (same rule as 📚 Reading)
// Drawers whose entries count as "logged something that day" for the streak.
const STREAK_STORES = ['water', 'sleep', 'weight', 'foodLog', 'expenses', 'checkins', 'visits', 'gymSessions'];

// Days in a row with at least one entry anywhere, ending today (or yesterday, so the streak
// isn't lost before you've logged anything today). Finished tasks count on the day they were done.
export async function loggingStreak(day) {
  const lists = await Promise.all(STREAK_STORES.map((s) => list(s)));
  const days = new Set(lists.flat().map((e) => e.date).filter(Boolean));
  for (const t of await list('tasks')) if (t.done && t.doneAt) days.add(String(t.doneAt).slice(0, 10));
  let d = days.has(day) ? day : addDays(day, -1);
  let streak = 0;
  while (days.has(d)) { streak += 1; d = addDays(d, -1); }
  return streak;
}

// One soft ring (SVG) in a module's colour, with the value in the middle and a label below.
function ring(key, { percent, centre, label, aria }) {
  const r = 26;
  const length = 2 * Math.PI * r;
  const filled = percent === null ? 0 : (Math.min(100, Math.max(0, percent)) / 100) * length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ring__svg');
  for (const [cls, dash] of [['ring__track', null], ['ring__fill', filled]]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '32');
    c.setAttribute('cy', '32');
    c.setAttribute('r', String(r));
    c.setAttribute('class', cls);
    if (dash !== null) c.setAttribute('stroke-dasharray', `${dash} ${length}`);
    svg.append(c);
  }
  return el('a', { className: `ring mod-${key}`, href: `#/${key}`, 'aria-label': aria }, [
    el('div', { className: 'ring__circle' }, [svg, el('span', { className: 'ring__centre', text: centre })]),
    el('span', { className: 'ring__label', text: label }),
  ]);
}

async function rings(day) {
  const [waterEntries, waterSet, foodEntries, foodSet, night, sleepSet] = await Promise.all([
    listByDate('water', day), getSettings('water', WATER_DEFAULTS),
    listByDate('foodLog', day), getSettings('food', { targets: FOOD_DEFAULT_TARGETS }),
    listByDate('sleep', day).then((n) => n[0]), getSettings('sleep', SLEEP_DEFAULTS),
  ]);
  const waterGoal = waterSet.dailyGoalMl > 0 ? waterSet.dailyGoalMl : WATER_DEFAULTS.dailyGoalMl;
  const ml = waterEntries.reduce((s, e) => s + (Number(e.amountMl) || 0), 0);
  const waterPct = Math.round((ml / waterGoal) * 100);

  const kcal = Math.round(foodEntries.reduce((s, e) => s + (isBlank(e.kcal) ? 0 : Number(e.kcal) || 0), 0));
  const kcalTarget = (foodSet.targets || {}).kcal > 0 ? foodSet.targets.kcal : null;
  const kcalPct = kcalTarget ? Math.round((kcal / kcalTarget) * 100) : null;

  const sleepTarget = (sleepSet.targetHours > 0 ? sleepSet.targetHours : 8) * 60;
  const mins = night ? sleepMinutes(night.bedTime, night.wakeTime) : 0;
  const sleepPct = night ? Math.round((mins / sleepTarget) * 100) : 0;

  return el('div', { className: 'ring-row' }, [
    ring('water', {
      percent: waterPct, centre: `${waterPct}%`, label: `💧 ${formatMl(ml)}`,
      aria: `Water: ${formatMl(ml)} of ${formatMl(waterGoal)}, ${waterPct}%`,
    }),
    ring('food', {
      percent: kcalPct, centre: kcalPct === null ? '—' : `${kcalPct}%`, label: `🍱 ${formatNumber(kcal)} kcal`,
      aria: kcalTarget ? `Calories: ${formatNumber(kcal)} of ${formatNumber(kcalTarget)} kcal, ${kcalPct}%`
        : `Calories: ${formatNumber(kcal)} kcal`,
    }),
    ring('sleep', {
      percent: sleepPct, centre: night ? `${sleepPct}%` : '—', label: `😴 ${night ? formatDuration(mins) : 'not logged'}`,
      aria: night ? `Sleep last night: ${formatDuration(mins)}, ${sleepPct}% of your target` : 'Sleep last night: not logged',
    }),
  ]);
}

// Last 7 days of water, for the mini chart and the message.
async function waterWeek(day) {
  const from = addDays(day, -6);
  const [entries, settings] = await Promise.all([
    listByDateRange('water', from, day), getSettings('water', WATER_DEFAULTS),
  ]);
  const goal = settings.dailyGoalMl > 0 ? settings.dailyGoalMl : WATER_DEFAULTS.dailyGoalMl;
  const labels = dateRange(from, day);
  const totals = Object.fromEntries(labels.map((d) => [d, 0]));
  for (const e of entries) if (e.date in totals) totals[e.date] += Number(e.amountMl) || 0;
  return { labels, values: labels.map((d) => totals[d] || null), goal };
}

// One friendly sentence from simple rules about your own data (the first rule that fits wins).
async function message(day, streak, week) {
  // 💧 Water goal days in a row (today only counts once it's reached; it isn't over yet).
  const vals = week.values;
  let goalDays = 0;
  for (let i = vals.length - 1; i >= 0; i -= 1) {
    if ((vals[i] || 0) >= week.goal) goalDays += 1;
    else if (i < vals.length - 1) break;
  }
  if (goalDays >= 2) return `💧 ${goalDays} days in a row at your water goal. Lovely!`;

  // 😴 Last night compared with your usual (the 7 nights before).
  const nights = await listByDateRange('sleep', addDays(day, -7), day);
  const last = nights.find((n) => n.date === day);
  const before = nights.filter((n) => n.date < day);
  if (last && before.length >= 3) {
    const usual = before.reduce((s, n) => s + sleepMinutes(n.bedTime, n.wakeTime), 0) / before.length;
    const diff = Math.round(sleepMinutes(last.bedTime, last.wakeTime) - usual);
    if (diff >= 20) return `😴 You slept ${formatDuration(diff)} more than usual last night. Well rested!`;
    if (diff <= -45) return `😴 Last night was ${formatDuration(-diff)} shorter than usual. Maybe an early night tonight 🌙`;
  }

  if (streak >= 3) return `🔥 ${streak} days in a row of logging. Keep it going!`;
  if ((vals[vals.length - 1] || 0) >= week.goal) return '💧 Water goal reached today. Your body says thanks!';

  const doneToday = (await list('tasks')).filter((t) => t.done && String(t.doneAt || '').startsWith(day)).length;
  if (doneToday) return `✅ You finished ${doneToday} task${doneToday === 1 ? '' : 's'} today. Nice work 🌟`;

  const hour = currentHour();
  if (hour >= 5 && hour < 12) return '☀️ A fresh day! A glass of water is a lovely start.';
  if (hour >= 12 && hour < 17) return '🌤️ Little steps add up. Log one thing now and feel the win.';
  return '🌙 Be proud of today, however it went. Rest well.';
}

/** The summary card at the top of Home: streak chip, rings, mini water chart and a message. */
export function summaryCard() {
  const chip = el('span', { className: 'streak-chip', text: '🔥 …' });
  const ringSlot = el('div', { className: 'ring-row' });
  const chartBox = el('div', { className: 'home-mini-chart' });
  const msg = el('p', { className: 'home-message' });
  const box = card({ className: 'home-summary', children: [
    chip, ringSlot,
    el('h3', { className: 'home-summary__sub', text: '💧 Water, last 7 days' }),
    chartBox, msg,
  ] });
  const day = today();
  (async () => {
    const [streak, ringRow, week] = await Promise.all([loggingStreak(day), rings(day), waterWeek(day)]);
    chip.textContent = streak ? `🔥 ${streak}-day streak` : '🌱 Log something to start a streak';
    ringSlot.replaceWith(ringRow);
    msg.textContent = await message(day, streak, week);
    await barChart(chartBox, {
      module: 'water', labels: week.labels, values: week.values, goal: week.goal,
      goalLabel: 'Goal', format: (v) => formatMl(v), height: 120,
    });
  })().catch((err) => {
    console.error(err);
    if (!msg.textContent) msg.textContent = 'Couldn’t load your summary right now.';
  });
  return box;
}

/** 📚 "Check-in due" banner when a book you're reading hasn't had a check-in for 3+ days. */
export function readingBanner() {
  const slot = el('div', { className: 'home-banner-slot' });
  (async () => {
    const [books, checkins] = await Promise.all([list('books'), list('checkins')]);
    const day = today();
    const due = books.filter((b) => b.status === 'reading').filter((b) => {
      const dates = checkins.filter((c) => c.bookId === b.id).map((c) => c.date).sort();
      const since = dates[dates.length - 1] || b.startDate;
      return since && daysBetween(since, day) >= DUE_AFTER_DAYS;
    });
    if (!due.length) return;
    slot.append(el('a', { className: 'card highlight home-banner mod-reading', href: '#/reading' }, [
      el('span', { className: 'highlight__emoji', 'aria-hidden': 'true', text: '📚' }),
      el('p', { className: 'highlight__text', text: due.length === 1
        ? `Check-in due for “${due[0].title}” · tap to log your page`
        : `Check-ins due for ${due.length} books · tap to log your pages` }),
    ]));
  })().catch((err) => console.error(err));
  return slot;
}

// A short live number for each module tile ('' = nothing to show yet).
const TILE_STATS = {
  async water(day) {
    const ml = (await listByDate('water', day)).reduce((s, e) => s + (Number(e.amountMl) || 0), 0);
    return ml ? `${formatMl(ml)} today` : '';
  },
  async sleep(day) {
    const n = (await listByDate('sleep', day))[0];
    return n ? `${formatDuration(sleepMinutes(n.bedTime, n.wakeTime))} last night` : '';
  },
  async weight() {
    const latest = (await list('weight')).sort((a, b) => b.date.localeCompare(a.date))[0];
    return latest ? formatKg(latest.weightKg) : '';
  },
  async food(day) {
    const items = await listByDate('foodLog', day);
    if (!items.length) return '';
    const kcal = items.reduce((s, e) => s + (isBlank(e.kcal) ? 0 : Number(e.kcal) || 0), 0);
    return `${formatNumber(Math.round(kcal))} kcal today`;
  },
  async money(day) {
    const total = (await listByDateRange('expenses', monthStart(day), day))
      .reduce((s, e) => s + (Number(e.amountPaise) || 0), 0);
    return total ? `${formatMoney(Math.round(total / 100) * 100)} this month` : '';
  },
  async tasks() {
    const open = (await list('tasks')).filter((t) => !t.done).length;
    return open ? `${open} to do` : '';
  },
  async reading() {
    const n = (await list('books')).filter((b) => b.status === 'reading').length;
    return n ? `${n} reading now` : '';
  },
  async medical(day) {
    const n = (await listByDateRange('visits', `${day.slice(0, 4)}-01-01`, day)).length;
    return n ? `${n} visit${n === 1 ? '' : 's'} this year` : '';
  },
  async gym(day) {
    const n = (await listByDateRange('gymSessions', weekStart(day), day)).length;
    return n ? `${n} workout${n === 1 ? '' : 's'} this week` : '';
  },
  async refills(day) {
    const cost = await loadDailyCost(day);
    return cost.items.length ? `${formatMoney(Math.round(cost.perDayPaise / 100) * 100)} a day` : '';
  },
};

/** Adds a live number under each module name on the home tiles. */
export function fillTileStats(grid) {
  const day = today();
  for (const tileEl of grid.querySelectorAll('.tile')) {
    const key = tileEl.getAttribute('href').replace('#/', '');
    // REFINE-8: every tile keeps a line for its number (blank until there is one), so all tiles are one size.
    const stat = el('span', { className: 'tile__stat', text: ' ' });
    tileEl.append(stat);
    if (!TILE_STATS[key]) continue;
    TILE_STATS[key](day).then((text) => {
      if (text) { stat.textContent = text; stat.title = text; }
    }).catch((err) => console.error(err));
  }
}

/** Round "+" button floating over Home; opens a panel to jump to any module and add something. */
export function quickAdd(order) {
  const ADD_LABEL = {
    water: 'water', sleep: 'sleep', weight: 'weight', food: 'food',
    money: 'expense', tasks: 'task', reading: 'book', medical: 'visit', gym: 'workout', refills: 'refill',
  };
  const sheet = el('dialog', { className: 'sheet', 'aria-labelledby': 'quick-add-title' });
  const close = () => sheet.close();
  sheet.append(
    el('div', { className: 'sheet__head' }, [
      el('h2', { id: 'quick-add-title', className: 'sheet__title', text: '✨ Quick add' }),
      button({ icon: 'close', variant: 'ghost', ariaLabel: 'Close', onClick: close }),
    ]),
    el('div', { className: 'tile-grid' }, order.map((key) => el('a', { className: `tile mod-${key}`, href: `#/${key}` }, [
      el('span', { className: 'tile__emoji', 'aria-hidden': 'true', text: modules[key].emoji }),
      el('span', { text: `Add ${ADD_LABEL[key] || modules[key].label}` }),
    ]))),
  );
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('.tile')) close();
  });
  const fab = el('button', {
    className: 'fab', type: 'button', 'aria-label': 'Quick add', 'aria-haspopup': 'dialog',
    onClick: () => sheet.showModal(),
  }, [el('span', { 'aria-hidden': 'true', text: '+' })]);
  return el('div', { className: 'quick-add' }, [fab, sheet]);
}
