// Lifetracker number formatting: ₹ money (stored as whole paise) and metric units.
// Blank values (null / undefined / '') mean "unknown" and show as "—".

const DASH = '—';
const isBlank = (v) => v === null || v === undefined || v === '' || Number.isNaN(v);

/** A number with Indian digit grouping and up to `maxDecimals` decimals: 123456.5 -> "1,23,456.5". */
export function formatNumber(value, maxDecimals = 0) {
  if (isBlank(value)) return DASH;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxDecimals }).format(value);
}

/**
 * Whole paise -> "₹1,23,456.50". Whole-rupee amounts show without paise ("₹500"),
 * unless { decimals: true } is passed to always show them ("₹500.00").
 */
export function formatMoney(paise, { decimals } = {}) {
  if (isBlank(paise)) return DASH;
  const showPaise = decimals ?? paise % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: showPaise ? 2 : 0, maximumFractionDigits: showPaise ? 2 : 0,
  }).format(paise / 100);
}

/**
 * What the user typed -> whole paise, or null if it isn't a valid amount.
 * Accepts "123", "123.5", "1,23,456.50", "₹ 99". Rejects negatives and more than 2 decimals.
 */
export function parseMoney(text) {
  const clean = String(text ?? '').replace(/[₹,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(clean);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}

/** Millilitres -> "750 ml" below 1 litre, "1.5 L" / "2.25 L" from 1 litre up. */
export function formatMl(ml) {
  if (isBlank(ml)) return DASH;
  return Math.abs(ml) < 1000 ? `${formatNumber(ml)} ml` : `${formatNumber(ml / 1000, 2)} L`;
}

/** Kilograms -> "72.4 kg" (always 1 decimal place). */
export function formatKg(kg) {
  if (isBlank(kg)) return DASH;
  return `${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(kg)} kg`;
}

/** Centimetres -> "170 cm". */
export function formatCm(cm) {
  return isBlank(cm) ? DASH : `${formatNumber(cm, 1)} cm`;
}

/** Calories -> "1,850 kcal" (whole numbers). */
export function formatKcal(kcal) {
  return isBlank(kcal) ? DASH : `${formatNumber(Math.round(kcal))} kcal`;
}

/** Grams -> "12.5 g". */
export function formatG(g) {
  return isBlank(g) ? DASH : `${formatNumber(g, 1)} g`;
}

/** Milligrams -> "8.2 mg". */
export function formatMg(mg) {
  return isBlank(mg) ? DASH : `${formatNumber(mg, 1)} mg`;
}

/** Micrograms -> "2.4 µg". */
export function formatUg(ug) {
  return isBlank(ug) ? DASH : `${formatNumber(ug, 1)} µg`;
}
