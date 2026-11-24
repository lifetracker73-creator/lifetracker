// 📈 Daily spend (REF-7): actual spend per day for the last 30 days (from expenses), with a flat
// "regular refills per day" guide line from 🔄 Refills' Daily cost of living (core/refills.js).
// Refills are already counted once as their expenses; the line is only a guide, never added on top.
import { card, emptyState, el } from '../core/ui.js';
import { listByDateRange } from '../core/storage.js';
import { today, addDays, dateRange } from '../core/dates.js';
import { formatMoney } from '../core/format.js';
import { barChart } from '../core/charts.js';
import { loadDailyCost } from '../core/refills.js';

const DAYS = 30;
const money = (paise) => formatMoney(Math.round(paise));

export async function render(root) {
  const to = today();
  const from = addDays(to, -(DAYS - 1));
  const [expenses, cost] = await Promise.all([listByDateRange('expenses', from, to), loadDailyCost(to)]);
  const days = dateRange(from, to);
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const e of expenses) perDay.set(e.date, (perDay.get(e.date) || 0) + (Number(e.amountPaise) || 0));
  const total = [...perDay.values()].reduce((s, v) => s + v, 0);
  const average = total / DAYS;
  const baseline = cost.items.length ? cost.perDayPaise : null;

  const chartBox = el('div', { className: 'chart-box' });
  const page = el('div', { className: 'mod-money stack' }, [
    el('a', { className: 'btn btn--ghost split-back', href: '#/money' }, [el('span', { text: '◀ Back to Money' })]),
    card({ title: '📈 Daily spend', module: 'money', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'progress-stats' }, [
        el('span', { className: 'progress-stats__amount', text: `${money(average)} a day on average` }),
      ]),
      el('p', { className: 'progress-note', text: `Last ${DAYS} days · ${money(total)} in all.` }),
      el('p', { className: 'progress-note', text: baseline == null
        ? '🔄 Log 2 or more refills of an item in Refills to see your regular refills line here.'
        : `🔄 Regular refills: ${money(baseline)} a day (dashed line). It's a guide only: refills are already in your spending once.` }),
      total ? chartBox : emptyState({ emoji: '💸', title: 'No spending in the last 30 days', text: 'Add expenses in Money to see them here.' }),
    ])] }),
  ]);
  root.append(page);
  if (!total) return;
  const chart = barChart(chartBox, {
    module: 'money', labels: days, values: days.map((d) => perDay.get(d) / 100),
    goal: baseline == null ? null : baseline / 100, goalLabel: 'Refills per day',
    format: (v) => formatMoney(Math.round(v * 100)),
  });
  chart.catch?.((err) => console.error(err));
}
