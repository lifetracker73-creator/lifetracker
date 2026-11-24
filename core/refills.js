// 🔄 Refills maths, shared by Refills, Home and Money (REF-4, REF-6, REF-7).
// Modules can't import from each other, so the "how long a refill lasts" and
// "what it costs per day" rules live here, in one place. Nothing here is stored.
import { list } from './storage.js';
import { addDays, daysBetween, today } from './dates.js';

const WINDOW = 6; // the numbers use the last 6 refills of an item

/** Total of a refill in paise: quantity × price per unit, rounded to whole paise. */
export function refillTotal(r) {
  const q = Number(r?.quantity);
  const p = Number(r?.pricePerUnitPaise);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return null;
  return Math.round(q * p);
}

/** Refills oldest first (date, then the order they were added). */
export function byDate(a, b) {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

/**
 * Numbers for one item from its refills (any order). null = not enough data yet
 * (fewer than 2 refills, or all on the same day).
 * { avgDays, perDayPaise, expected, daysLeft, first, previous, newest, count }
 * - avgDays: average days between refills (last 6 refills)
 * - perDayPaise: money spent on those refills (all but the newest) ÷ days from the first to the newest
 * - expected: newest date + avgDays (rounded); daysLeft: days from `day` to it (negative = late)
 */
export function itemStats(refills, day = today()) {
  const all = [...refills].sort(byDate);
  if (all.length < 2) return null;
  const recent = all.slice(-WINDOW);
  const first = recent[0];
  const newest = recent[recent.length - 1];
  const span = daysBetween(first.date, newest.date);
  if (span < 1) return null;
  const avgDays = span / (recent.length - 1);
  const spent = recent.slice(0, -1).reduce((s, r) => s + (refillTotal(r) || 0), 0);
  const expected = addDays(newest.date, Math.max(1, Math.round(avgDays)));
  return {
    avgDays,
    perDayPaise: spent / span,
    expected,
    daysLeft: daysBetween(day, expected),
    first: all[0],
    previous: all[all.length - 2],
    newest,
    count: all.length,
  };
}

/**
 * "Daily cost of living" from every item with enough data:
 * { perDayPaise, perMonthPaise, items: [{ item, perDayPaise, stats }] } (biggest share first).
 */
export function dailyCost(items, refills, day = today()) {
  const byItem = new Map();
  for (const r of refills) {
    if (!byItem.has(r.itemId)) byItem.set(r.itemId, []);
    byItem.get(r.itemId).push(r);
  }
  const rows = [];
  for (const item of items) {
    const stats = itemStats(byItem.get(item.id) || [], day);
    if (stats) rows.push({ item, perDayPaise: stats.perDayPaise, stats });
  }
  rows.sort((a, b) => b.perDayPaise - a.perDayPaise);
  const perDayPaise = rows.reduce((s, x) => s + x.perDayPaise, 0);
  return { perDayPaise, perMonthPaise: perDayPaise * 30, items: rows };
}

/** Reads the saved items and refills and works out the daily cost of living. */
export async function loadDailyCost(day = today()) {
  const [items, refills] = await Promise.all([list('refillItems'), list('refills')]);
  return dailyCost(items, refills, day);
}

/** "in 4 days", "due tomorrow", "due today", "2 days late". */
export function dueText(daysLeft) {
  if (daysLeft > 1) return `in ${daysLeft} days`;
  if (daysLeft === 1) return 'due tomorrow';
  if (daysLeft === 0) return 'due today';
  return `${-daysLeft} day${daysLeft === -1 ? '' : 's'} late`;
}
