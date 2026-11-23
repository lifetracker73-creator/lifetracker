// Lifetracker date helpers. Everything is in Kolkata time (Asia/Kolkata).
// Dates are 'YYYY-MM-DD', times are 'HH:MM' (24h), date-times are 'YYYY-MM-DD HH:MM'.

const TZ = 'Asia/Kolkata';

function parts(date = new Date()) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)) out[p.type] = p.value;
  return out;
}

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' <-> a plain day count, so date maths never trips over time zones.
function toDayNumber(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function fromDayNumber(n) {
  const dt = new Date(n * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Today's date in Kolkata as 'YYYY-MM-DD'. */
export function today() {
  const p = parts();
  return `${p.year}-${p.month}-${p.day}`;
}

/** Yesterday's date in Kolkata as 'YYYY-MM-DD'. */
export function yesterday() {
  return addDays(today(), -1);
}

/** The current hour in Kolkata, 0 to 23. */
export function currentHour() {
  return Number(parts().hour);
}

/** The current time in Kolkata as 'HH:MM'. */
export function nowTime() {
  const p = parts();
  return `${p.hour}:${p.minute}`;
}

/** The current date and time in Kolkata as 'YYYY-MM-DD HH:MM'. */
export function nowDateTime() {
  return `${today()} ${nowTime()}`;
}

/** Add (or with a negative number, subtract) days: addDays('2026-11-30', 1) -> '2026-12-01'. */
export function addDays(ymd, days) {
  return fromDayNumber(toDayNumber(ymd) + days);
}

/** Whole days from `from` to `to`: daysBetween('2026-11-20', '2026-11-23') -> 3. */
export function daysBetween(from, to) {
  return toDayNumber(to) - toDayNumber(from);
}

/** The Monday of the week containing this date (weeks run Monday to Sunday). */
export function weekStart(ymd) {
  const n = toDayNumber(ymd);
  const weekday = (n + 3) % 7; // 0 = Monday ... 6 = Sunday (1 Jan 1970 was a Thursday)
  return fromDayNumber(n - weekday);
}

/** True if this date is a Sunday. */
export function isSunday(ymd) {
  return (toDayNumber(ymd) + 3) % 7 === 6;
}

/** The first day of the month: '2026-11-23' -> '2026-11-01'. */
export function monthStart(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

/** The last day of the month: '2024-02-10' -> '2024-02-29'. */
export function monthEnd(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

/** The list of dates from `from` to `to`, both included. */
export function dateRange(from, to) {
  const out = [];
  for (let n = toDayNumber(from), end = toDayNumber(to); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

/** 'YYYY-MM-DD' -> "23 Nov 2026". Add { weekday: true } for "Monday, 23 Nov 2026". */
export function formatDate(ymd, { weekday = false } = {}) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
  if (!weekday) return text;
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(date);
  return `${day}, ${text}`;
}

/** 'YYYY-MM' or 'YYYY-MM-DD' -> "Nov 2026". */
export function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, 1, 12)));
}

/** 'HH:MM' (24h) -> "6:15 am" / "11:30 pm". */
export function formatTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

/** 'YYYY-MM-DD HH:MM' -> "23 Nov 2026, 6:15 am". */
export function formatDateTime(dt) {
  const [ymd, hm] = dt.split(' ');
  return `${formatDate(ymd)}, ${formatTime(hm)}`;
}

// 'YYYY-MM-DD HH:MM' -> minutes counted from 1 Jan 1970 (Kolkata has no clock changes).
function toMinutes(dt) {
  const [ymd, hm] = dt.split(' ');
  const [h, m] = hm.split(':').map(Number);
  return toDayNumber(ymd) * 1440 + h * 60 + m;
}

/**
 * Minutes asleep between bed time and wake time ('YYYY-MM-DD HH:MM' each).
 * Handles sleeping past midnight: '2026-11-22 23:30' -> '2026-11-23 06:15' is 405.
 * If the wake time is not after the bed time (e.g. both saved on the same date),
 * it is taken to be the next day.
 */
export function sleepMinutes(bedTime, wakeTime) {
  let mins = toMinutes(wakeTime) - toMinutes(bedTime);
  while (mins <= 0) mins += 1440;
  return mins;
}

/** Minutes -> "6 h 45 m" (or "45 m", or "8 h"). */
export function formatDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}
