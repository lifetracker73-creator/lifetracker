// 🍱 food module screens.
// FOOD-1: Food library: add, edit, delete (with Undo), search, favourites.
//         Nutrients can be typed per 100 g or per serving; they are always saved per 100 g.
//         A blank nutrient means "unknown", never zero.
// FOOD-1 extra: your own extra nutrients (e.g. Selenium in µg). The list is kept in food settings
//         (`customMicros`: { id, name, unit }); each food keeps its values per 100 g in
//         `extraNutrients` ({ <nutrient id>: number }).
// FOOD-2: Log food: pick a food from the library (search, recent, favourites), choose the meal and
//         how much. Each log entry keeps its own copy of the nutrients for the amount eaten, so
//         editing or deleting the food later never changes past days. Food log by day, edit/delete.
// FOOD-3: My daily targets (food settings `targets`), day totals versus targets, totals per meal.
// FOOD-4: Vitamins & minerals for the day (built-in and your own) versus optional targets, unknowns marked.
// FOOD-5: Recipes (name, servings, ingredients [{ foodId, grams }]) made from library foods, logged like a
//         food (the log entry has `recipeId` instead of `foodId`, with its own copy of the nutrients).
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import {
  add, get, update, remove, restore, list as listAll, listByDate, getSettings, saveSettings,
} from '../core/storage.js';
import { formatNumber, formatKcal, formatG } from '../core/format.js';
import {
  today, yesterday, addDays, nowTime, currentHour, formatDate, formatTime,
} from '../core/dates.js';

// Nutrients per 100 g. `grams` = how many grams one unit is (used to catch impossible values).
const MACROS = [
  { key: 'kcal', label: 'Calories (kcal)', grams: null },
  { key: 'proteinG', label: 'Protein (g)', grams: 1 },
  { key: 'carbsG', label: 'Carbs (g)', grams: 1 },
  { key: 'fatG', label: 'Fat (g)', grams: 1 },
  { key: 'fibreG', label: 'Fibre (g)', grams: 1 },
  { key: 'sugarG', label: 'Sugar (g)', grams: 1 },
  { key: 'satFatG', label: 'Saturated fat (g)', grams: 1 },
];
const MICROS = [
  { key: 'sodiumMg', label: 'Sodium (mg)', grams: 1e-3 },
  { key: 'potassiumMg', label: 'Potassium (mg)', grams: 1e-3 },
  { key: 'calciumMg', label: 'Calcium (mg)', grams: 1e-3 },
  { key: 'ironMg', label: 'Iron (mg)', grams: 1e-3 },
  { key: 'magnesiumMg', label: 'Magnesium (mg)', grams: 1e-3 },
  { key: 'zincMg', label: 'Zinc (mg)', grams: 1e-3 },
  { key: 'vitAUg', label: 'Vitamin A (µg)', grams: 1e-6 },
  { key: 'vitB12Ug', label: 'Vitamin B12 (µg)', grams: 1e-6 },
  { key: 'vitCMg', label: 'Vitamin C (mg)', grams: 1e-3 },
  { key: 'vitDUg', label: 'Vitamin D (µg)', grams: 1e-6 },
  { key: 'folateUg', label: 'Folate (µg)', grams: 1e-6 },
];
const NUTRIENTS = [...MACROS, ...MICROS];
const MAX_KCAL = 900; // pure fat is about 900 kcal per 100 g, nothing has more
const MAX_NAME = 60;
const MAX_SERVING_NAME = 30;
const MAX_SERVING_G = 5000;

// Units for your own extra nutrients, and how many grams one unit is.
const UNITS = [['mg', 1e-3], ['µg', 1e-6], ['g', 1]];
const unitGrams = (unit) => (UNITS.find(([u]) => u === unit) || UNITS[0])[1];
const extraLabel = (c) => `${c.name} (${c.unit})`;
const MAX_EXTRA_NAME = 30;
const BUILT_IN_NAMES = NUTRIENTS.map((n) => n.label.replace(/\s*\(.*\)$/, '').toLowerCase());

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const isBlank = (v) => v === null || v === undefined || v === '';

// What was typed -> a number, '' for an empty box, or NaN if it isn't a number. "12,5" works too.
function parseNum(text) {
  const clean = String(text ?? '').trim().replace(',', '.');
  if (clean === '') return '';
  return /^(\d+(\.\d+)?|\.\d+)$/.test(clean) ? Number(clean) : NaN;
}

// A number for a box: up to 2 decimals, blank stays blank.
const boxText = (n) => (isBlank(n) ? '' : String(round(n, 2)));

// "1 katori · 150 g", "150 g", or '' when there is no serving.
function servingText(food) {
  if (!food.servingGrams) return '';
  const grams = `${formatNumber(food.servingGrams, 1)} g`;
  return food.servingName ? `${food.servingName} · ${grams}` : `1 serving · ${grams}`;
}

// Calories for one serving, or per 100 g when there is no serving size.
function kcalText(food) {
  if (isBlank(food.kcal)) return 'kcal unknown';
  if (food.servingGrams) return formatKcal((food.kcal * food.servingGrams) / 100);
  return `${formatKcal(food.kcal)} per 100 g`;
}

// A row of pill buttons where one is picked. The picked value is at group.value.
// `grid` puts four pills 2 × 2 on a phone; `onChange` runs when a pill is tapped.
function pillGroup({ label, options, value, grid = false, onChange }) {
  const group = el('div', { className: 'field' });
  const buttons = options.map(([v, text]) => {
    const b = button({ label: text, variant: 'secondary', onClick: () => { group.pick(v); onChange?.(v); } });
    b.dataset.value = v;
    return b;
  });
  group.pick = (v) => {
    group.value = v;
    buttons.forEach((b) => {
      const on = b.dataset.value === v;
      b.classList.toggle('btn--primary', on);
      b.classList.toggle('btn--secondary', !on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  group.append(
    el('div', { className: 'field__label', text: label }),
    el('div', { className: grid ? 'btn-row btn-row--grid' : 'btn-row', role: 'group', 'aria-label': label }, buttons),
  );
  group.pick(value);
  return group;
}

// ---- FOOD-2 helpers: meals, amounts and the saved copy of nutrients ----
const MEALS = [['breakfast', '🌅 Breakfast'], ['lunch', '🍛 Lunch'], ['dinner', '🌙 Dinner'], ['snack', '🍪 Snack']];
const MAX_SERVINGS = 50;
const MAX_LOG_G = 5000;

// The meal that fits the time of day: 5–11 breakfast, 11–4 lunch, 7–11 pm dinner, otherwise snack.
function mealForHour(h) {
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 19 && h < 23) return 'dinner';
  return 'snack';
}

// The food's name with its brand: "Poha (Amul)".
const foodTitle = (food) => (food.brand ? `${food.name} (${food.brand})` : food.name);

// "1.5 katori · 225 g", "2 servings · 60 g" or "150 g".
function amountText({ quantity, quantityUnit, servingName, grams }) {
  const g = `${formatNumber(grams, 1)} g`;
  if (quantityUnit !== 'serving') return g;
  const q = formatNumber(quantity, 2);
  let s;
  if (!servingName) s = `${q} serving${quantity === 1 ? '' : 's'}`;
  else if (/^1\s+\S/.test(servingName)) s = `${q} ${servingName.replace(/^1\s+/, '')}`;
  else s = `${q} × ${servingName}`;
  return `${s} · ${g}`;
}

// The nutrients in `grams` of a food (from its per-100 g values). Unknown stays unknown (null).
function nutrientsFor(food, grams) {
  const out = {};
  for (const n of NUTRIENTS) out[n.key] = isBlank(food[n.key]) ? null : round((food[n.key] * grams) / 100, 3);
  out.extraNutrients = {};
  for (const [id, v] of Object.entries(food.extraNutrients || {})) {
    if (!isBlank(v)) out.extraNutrients[id] = round((v * grams) / 100, 3);
  }
  return out;
}

// A log entry's saved nutrients, scaled to a new amount (used when editing an entry).
function scaleNutrients(entry, grams) {
  const factor = grams / entry.grams;
  const out = {};
  for (const n of NUTRIENTS) out[n.key] = isBlank(entry[n.key]) ? null : round(entry[n.key] * factor, 3);
  out.extraNutrients = {};
  for (const [id, v] of Object.entries(entry.extraNutrients || {})) {
    if (!isBlank(v)) out.extraNutrients[id] = round(v * factor, 3);
  }
  return out;
}

// Reads an amount box. Returns { quantity, grams } or null (with a friendly message shown).
function readAmount(box, unit, servingGrams) {
  box.setError('');
  const v = parseNum(box.input.value);
  let error = '';
  if (v === '' || Number.isNaN(v) || v <= 0) {
    error = unit === 'serving' ? 'Type how many, e.g. 1 or 1.5.' : 'Type the grams, e.g. 150.';
  } else if (unit === 'serving' && v > MAX_SERVINGS) error = `Up to ${MAX_SERVINGS} servings at a time.`;
  else if (unit === 'g' && v > MAX_LOG_G) error = 'Up to 5,000 g at a time.';
  if (error) { box.setError(error); box.input.focus(); return null; }
  const quantity = round(v, unit === 'serving' ? 2 : 1);
  const grams = unit === 'serving' ? round(quantity * servingGrams, 1) : quantity;
  if (grams <= 0) { box.setError('That\'s too small to log.'); box.input.focus(); return null; }
  return { quantity, grams };
}

// Checks a date + time pair for a log entry. Returns true if fine (messages shown otherwise).
function checkWhen(dateBox, timeBox) {
  dateBox.setError('');
  timeBox.setError('');
  const date = dateBox.input.value;
  const time = timeBox.input.value;
  if (!date) { dateBox.setError('Pick a date.'); dateBox.input.focus(); return false; }
  if (!time) { timeBox.setError('Pick a time.'); timeBox.input.focus(); return false; }
  if (date > today()) { dateBox.setError('That day hasn\'t come yet.'); dateBox.input.focus(); return false; }
  if (date === today() && time > nowTime()) {
    timeBox.setError('That time hasn\'t come yet.'); timeBox.input.focus(); return false;
  }
  return true;
}

// "Today · 24 Nov 2026", "Yesterday · 23 Nov 2026" or "22 Nov 2026".
// FOOD-3: daily targets (kept in food settings as `targets`; null = no target) and day totals.
const TARGET_MACROS = MACROS.slice(0, 5); // calories, protein, carbs, fat, fibre
const DEFAULT_TARGETS = { kcal: 2000, proteinG: 60, carbsG: 250, fatG: 65, fibreG: 30 };
const MAX_TARGET = { kcal: 10000, other: 1000 };
const MIN_KCAL_TARGET = 500;
const shortName = (n) => n.label.replace(/\s*\(.*\)$/, '');
const amountOf = (key, n) => (key === 'kcal' ? formatKcal(n) : formatG(n));

// Adds up one nutrient. Blank values are unknown: they're counted, never treated as zero.
function sumNutrient(entries, key) {
  let total = 0;
  let unknown = 0;
  entries.forEach((e) => { if (isBlank(e[key])) unknown += 1; else total += Number(e[key]); });
  return { total, unknown, allUnknown: entries.length > 0 && unknown === entries.length };
}

// "405 kcal · 12.5 g protein" for a meal heading; "405+ kcal" when some foods have no value.
function mealTotalText(rows) {
  const num = (key) => {
    const s = sumNutrient(rows, key);
    if (s.allUnknown) return '?';
    return `${formatNumber(key === 'kcal' ? Math.round(s.total) : s.total, 1)}${s.unknown ? '+' : ''}`;
  };
  return `${num('kcal')} kcal · ${num('proteinG')} g protein`;
}

// FOOD-4: vitamins & minerals for a day. Built-in ones are read from the entry's own field, your own
// ones from its `extraNutrients`. Their targets live in the same `targets` setting (built-in ones by
// key, e.g. ironMg; your own ones by the nutrient's id). No target = not set.
const MAX_MICRO_TARGET = { g: 1000, other: 100000 };
const unitOf = (n) => (/\((mg|µg|g)\)$/.exec(n.label) || [])[1] || 'mg';
const microAmount = (unit, n) => `${formatNumber(n, Math.abs(n) < 1 ? 2 : 1)} ${unit}`;

// Every vitamin/mineral to show: { key, name, unit, valueOf(entry) }.
function microList(extras) {
  return [
    ...MICROS.map((n) => ({ key: n.key, name: shortName(n), unit: unitOf(n), valueOf: (e) => e[n.key] })),
    ...extras.map((c) => ({
      key: c.id, name: c.name, unit: c.unit, valueOf: (e) => (e.extraNutrients || {})[c.id],
    })),
  ];
}

// Adds up one vitamin/mineral. Blank values are unknown: counted, never treated as zero.
function sumMicro(entries, m) {
  let total = 0;
  let unknown = 0;
  entries.forEach((e) => { const v = m.valueOf(e); if (isBlank(v)) unknown += 1; else total += Number(v); });
  return { total, unknown, allUnknown: entries.length > 0 && unknown === entries.length };
}

function dayTitle(ymd) {
  if (ymd === today()) return `Today · ${formatDate(ymd)}`;
  if (ymd === yesterday()) return `Yesterday · ${formatDate(ymd)}`;
  return formatDate(ymd);
}

// Name + unit boxes for one of your own extra nutrients. Returns { elements, name, read(extras, selfId) }.
function extraFields(values = {}) {
  const name = input({ label: 'Nutrient name', value: values.name || '', placeholder: 'e.g. Selenium' });
  const unit = pillGroup({ label: 'Unit', options: UNITS.map(([u]) => [u, u]), value: values.unit || 'mg' });
  function read(extras, selfId) {
    name.setError('');
    const text = name.input.value.trim();
    let error = '';
    if (!text) error = 'Give the nutrient a name.';
    else if (text.length > MAX_EXTRA_NAME) error = `Keep it to ${MAX_EXTRA_NAME} letters or less.`;
    else if (BUILT_IN_NAMES.includes(text.toLowerCase())) error = 'That one is already in the list.';
    else if (extras.some((c) => c.id !== selfId && c.name.toLowerCase() === text.toLowerCase())) {
      error = 'You already have a nutrient with this name.';
    }
    if (error) { name.setError(error); name.input.focus(); return null; }
    return { name: text, unit: unit.value };
  }
  return { elements: [name, unit], name, read };
}

// The whole food form (used to add and to edit). Returns { elements, read(foods, selfId), setExtras }.
// `extras` = your own extra nutrients; `onNewExtra(nutrient)` saves one made with "＋ Add your own".
function foodFields(values = {}, { extras = [], getExtras = () => extras, onNewExtra } = {}) {
  const f = {};
  f.name = input({ label: 'Food name', value: values.name || '', placeholder: 'e.g. Poha' });
  f.brand = input({ label: 'Brand (optional)', value: values.brand || '', placeholder: 'e.g. Amul' });

  let favourite = !!values.favourite;
  const favBtn = button({ label: '', variant: 'secondary', onClick: () => setFav(!favourite) });
  function setFav(on) {
    favourite = on;
    favBtn.replaceChildren(el('span', { text: on ? '⭐ Favourite' : '☆ Not a favourite' }));
    favBtn.classList.toggle('btn--primary', on);
    favBtn.classList.toggle('btn--secondary', !on);
    favBtn.setAttribute('aria-pressed', String(on));
  }
  setFav(favourite);

  f.servingName = input({
    label: 'Serving (optional)', value: values.servingName || '', placeholder: 'e.g. 1 katori',
  });
  f.servingGrams = input({
    label: 'Grams in it', value: boxText(values.servingGrams), placeholder: 'e.g. 150', inputmode: 'decimal',
  });

  // Per 100 g / Per serving pills. Boxes show values the way they were typed last time.
  let per = values.enteredPer === 'serving' && values.servingGrams ? 'serving' : '100g';
  const perBtns = [['100g', 'Per 100 g'], ['serving', 'Per serving']].map(([value, label]) => {
    const b = button({ label, variant: 'secondary', onClick: () => setPer(value, true) });
    b.dataset.value = value;
    return b;
  });
  const perHint = el('p', { className: 'progress-note' });

  for (const n of NUTRIENTS) {
    let shown = values[n.key];
    if (per === 'serving' && !isBlank(shown)) shown = (shown * values.servingGrams) / 100;
    f[n.key] = input({ label: n.label, value: boxText(shown), inputmode: 'decimal' });
  }

  // Your own extra nutrients: one box each. setExtras() adds, renames or removes boxes while the
  // form is open, keeping whatever is typed in the others.
  const extraBoxes = new Map(); // id -> { c, w }
  const extraGrid = el('div', { className: 'field-grid' });
  function setExtras(listNow) {
    const keep = new Set(listNow.map((c) => c.id));
    for (const id of [...extraBoxes.keys()]) if (!keep.has(id)) extraBoxes.delete(id);
    for (const c of listNow) {
      const box = extraBoxes.get(c.id);
      if (box) {
        box.c = c;
        box.w.querySelector('.field__label').textContent = extraLabel(c);
      } else {
        let shown = values.extraNutrients?.[c.id];
        if (per === 'serving' && !isBlank(shown) && values.servingGrams) shown = (shown * values.servingGrams) / 100;
        extraBoxes.set(c.id, { c, w: input({ label: extraLabel(c), value: boxText(shown), inputmode: 'decimal' }) });
      }
    }
    extraGrid.replaceChildren(...listNow.map((c) => extraBoxes.get(c.id).w));
  }
  setExtras(extras);

  // Every nutrient box: built-in ones, then your own.
  const boxes = () => [
    ...NUTRIENTS.map((n) => ({ key: n.key, grams: n.grams, w: f[n.key], extra: false })),
    ...[...extraBoxes.values()].map(({ c, w }) => ({ key: c.id, grams: unitGrams(c.unit), w, extra: true })),
  ];

  // "＋ Add your own": a small name + unit box inside the fold-out (not a form of its own,
  // because it sits inside the food form).
  const newExtra = extraFields();
  const newExtraBox = el('div', { className: 'stack', hidden: true }, [
    ...newExtra.elements,
    el('div', { className: 'btn-row' }, [
      button({ label: 'Cancel', variant: 'secondary', onClick: () => showNewExtra(false) }),
      button({ label: 'Add nutrient', variant: 'primary', onClick: () => saveNewExtra() }),
    ]),
  ]);
  const addExtraBtn = button({
    label: 'Add your own', icon: 'plus', variant: 'secondary', block: true, onClick: () => showNewExtra(true),
  });
  function showNewExtra(on) {
    newExtraBox.hidden = !on;
    addExtraBtn.hidden = on;
    newExtra.name.setError('');
    if (on) { newExtra.name.input.value = ''; newExtra.name.input.focus(); } else addExtraBtn.focus();
  }
  async function saveNewExtra() {
    const c = newExtra.read(getExtras());
    if (!c) return;
    const made = await onNewExtra?.(c);
    showNewExtra(false);
    if (made) extraBoxes.get(made.id)?.w.input.focus();
  }
  newExtra.name.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveNewExtra(); }
  });

  function gramsNow() {
    const g = parseNum(f.servingGrams.input.value);
    return typeof g === 'number' && g > 0 && g <= MAX_SERVING_G ? g : null;
  }
  function updateHint() {
    const g = gramsNow();
    const name = f.servingName.input.value.trim() || '1 serving';
    perHint.textContent = per === '100g'
      ? 'Values for 100 g, as on most packets. Leave a box empty if you don\'t know it.'
      : `Values for ${name}${g ? ` (${formatNumber(g, 1)} g)` : ''}. They're saved as per 100 g.`;
  }
  // Switching converts what's typed, so the food stays the same (needs the grams).
  function setPer(value, convert) {
    const g = gramsNow();
    if (convert && value !== per && g) {
      const factor = value === 'serving' ? g / 100 : 100 / g;
      for (const { w } of boxes()) {
        const v = parseNum(w.input.value);
        if (typeof v === 'number' && !Number.isNaN(v)) w.input.value = boxText(v * factor);
      }
    }
    per = value;
    perBtns.forEach((b) => {
      const on = b.dataset.value === value;
      b.classList.toggle('btn--primary', on);
      b.classList.toggle('btn--secondary', !on);
      b.setAttribute('aria-pressed', String(on));
    });
    updateHint();
  }
  setPer(per, false);
  f.servingName.input.addEventListener('input', updateHint);
  f.servingGrams.input.addEventListener('input', updateHint);

  const microsOpen = MICROS.some((n) => !isBlank(values[n.key]))
    || Object.keys(values.extraNutrients || {}).length > 0;
  const micros = el('details', { className: 'settings-details', open: microsOpen }, [
    el('summary', { text: 'Vitamins & minerals (optional)' }),
    el('div', { className: 'stack' }, [
      el('div', { className: 'field-grid' }, MICROS.map((n) => f[n.key])),
      extraGrid,
      onNewExtra ? addExtraBtn : null,
      onNewExtra ? newExtraBox : null,
    ]),
  ]);

  const elements = [
    f.name,
    f.brand,
    favBtn,
    el('div', { className: 'field-row' }, [f.servingName, f.servingGrams]),
    el('div', { className: 'field' }, [
      el('div', { className: 'field__label', text: 'Nutrients' }),
      el('div', { className: 'btn-row', role: 'group', 'aria-label': 'Nutrients typed' }, perBtns),
    ]),
    perHint,
    el('div', { className: 'field-grid' }, MACROS.map((n) => f[n.key])),
    micros,
  ];

  // Checks everything. Returns the food to save, or null (with friendly messages shown).
  function read(foods, selfId) {
    Object.values(f).forEach((w) => w.setError(''));
    extraBoxes.forEach(({ w }) => w.setError(''));
    const errors = [];
    const fail = (field, message) => { field.setError(message); errors.push(field); };

    const name = f.name.input.value.trim();
    const brand = f.brand.input.value.trim();
    if (!name) fail(f.name, 'Give the food a name.');
    else if (name.length > MAX_NAME) fail(f.name, `Keep the name to ${MAX_NAME} letters or less.`);
    if (brand.length > MAX_NAME) fail(f.brand, `Keep the brand to ${MAX_NAME} letters or less.`);
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    if (name && foods.some((x) => x.id !== selfId && same(x.name, name) && same(x.brand || '', brand))) {
      fail(f.name, brand ? 'You already have this food from this brand.' : 'You already have a food with this name.');
    }

    const servingName = f.servingName.input.value.trim();
    const gramsTyped = parseNum(f.servingGrams.input.value);
    let servingGrams = null;
    if (servingName.length > MAX_SERVING_NAME) {
      fail(f.servingName, `Keep it to ${MAX_SERVING_NAME} letters or less.`);
    }
    if (Number.isNaN(gramsTyped)) fail(f.servingGrams, 'Type grams, e.g. 150.');
    else if (gramsTyped !== '' && (gramsTyped <= 0 || gramsTyped > MAX_SERVING_G)) {
      fail(f.servingGrams, 'Between 0.1 and 5,000 g.');
    } else if (gramsTyped !== '') servingGrams = round(gramsTyped, 1);
    else if (servingName) fail(f.servingGrams, 'How many grams is it?');
    else if (per === 'serving') fail(f.servingGrams, 'Add the grams to type values per serving.');

    const factor = per === 'serving' && servingGrams ? 100 / servingGrams : 1;
    const food = {
      name, brand, favourite, servingName: servingGrams ? servingName : '', servingGrams, enteredPer: per,
    };
    food.extraNutrients = {};
    for (const n of boxes()) {
      const v = parseNum(n.w.input.value);
      if (!n.extra) food[n.key] = null;
      if (v === '') continue;
      if (Number.isNaN(v)) { fail(n.w, 'Type a number, e.g. 12.5, or leave it empty.'); continue; }
      const per100 = round(v * factor, 3);
      if (n.grams === null && per100 > MAX_KCAL) {
        fail(n.w, `That's over ${MAX_KCAL} kcal per 100 g, more than any food has.`);
      } else if (n.grams !== null && per100 * n.grams > 100) {
        fail(n.w, per === 'serving' ? 'That weighs more than the serving.' : 'That\'s more than 100 g in 100 g.');
      } else if (n.extra) food.extraNutrients[n.key] = per100;
      else food[n.key] = per100;
    }
    if (food.sugarG !== null && food.carbsG !== null && food.sugarG > food.carbsG) {
      fail(f.sugarG, 'Sugar can\'t be more than carbs.');
    }
    if (food.satFatG !== null && food.fatG !== null && food.satFatG > food.fatG) {
      fail(f.satFatG, 'Saturated fat can\'t be more than fat.');
    }

    if (errors.length) {
      if (errors.some((w) => micros.contains(w))) micros.open = true;
      errors[0].input.focus();
      return null;
    }
    return food;
  }

  return { elements, read, fields: f, setExtras };
}

function sortFoods(foods) {
  return [...foods].sort((a, b) => (Number(!!b.favourite) - Number(!!a.favourite))
    || a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' })
    || (a.brand || '').localeCompare(b.brand || '', 'en-IN', { sensitivity: 'base' }));
}

// ---- FOOD-5 helpers: recipes ----
// A recipe is saved as { name, servings, ingredients: [{ foodId, grams }] }. Its nutrients are worked
// out from the library foods. A nutrient is known only if every ingredient has it (blank = unknown).
const MAX_RECIPE_SERVINGS = 100;
const MAX_INGREDIENTS = 50;
const MAX_INGREDIENT_G = 5000;

const recipeGrams = (recipe) => (recipe.ingredients || []).reduce((s, x) => s + Number(x.grams || 0), 0);

// The recipe as a food-like item (per 100 g, one serving = total ÷ servings), so it can be shown and
// logged the same way as a food. `missing` = ingredients whose food was deleted.
function recipeAsFood(recipe, foodsById) {
  const ings = recipe.ingredients || [];
  const total = recipeGrams(recipe);
  const out = {
    id: recipe.id, isRecipe: true, name: recipe.name, brand: '', favourite: false,
    servingName: '', servingGrams: total && recipe.servings ? round(total / recipe.servings, 1) : null,
    totalGrams: total, missing: ings.filter((x) => !foodsById.get(x.foodId)).length,
  };
  const per100 = (valueOf) => {
    let sum = 0;
    for (const x of ings) {
      const food = foodsById.get(x.foodId);
      const v = food ? valueOf(food) : null;
      if (isBlank(v)) return null;
      sum += (v * x.grams) / 100;
    }
    return ings.length && total ? round((sum * 100) / total, 3) : null;
  };
  for (const n of NUTRIENTS) out[n.key] = per100((f) => f[n.key]);
  out.extraNutrients = {};
  const ids = new Set(ings.flatMap((x) => Object.keys(foodsById.get(x.foodId)?.extraNutrients || {})));
  for (const id of ids) {
    const v = per100((f) => (f.extraNutrients || {})[id]);
    if (!isBlank(v)) out.extraNutrients[id] = v;
  }
  return out;
}

// "380 kcal · 12.5 g protein" per serving of a recipe (or "kcal unknown").
function recipeServingText(rf) {
  if (!rf.servingGrams) return '';
  const kcal = isBlank(rf.kcal) ? 'kcal unknown' : formatKcal((rf.kcal * rf.servingGrams) / 100);
  const protein = isBlank(rf.proteinG) ? '' : ` · ${formatG((rf.proteinG * rf.servingGrams) / 100)} protein`;
  return `${kcal}${protein}`;
}

// The recipe form (add and edit). Returns { elements, read(recipes, selfId), refreshFoods(), focus() }.
// `getFoods()` gives the library now, so the food choices stay up to date.
function recipeFields(values = {}, getFoods) {
  let ingredients = (values.ingredients || []).map((x) => ({ foodId: x.foodId, grams: x.grams }));
  const name = input({ label: 'Recipe name', value: values.name || '', placeholder: 'e.g. Dal chawal' });
  const servings = input({
    label: 'Makes how many servings', inputmode: 'numeric', placeholder: 'e.g. 4',
    value: values.servings ? String(values.servings) : '',
  });
  servings.input.addEventListener('input', () => { servings.setError(''); showSummary(); });
  const ingTitle = el('div', { className: 'field__label', text: 'Ingredients' });
  const ingList = el('div');
  const ingError = el('div', { className: 'field__error', hidden: true });
  const pickBox = el('div');
  let foodSel = null;
  const grams = input({ label: 'Grams of it', inputmode: 'decimal', placeholder: 'e.g. 150' });
  grams.input.addEventListener('input', () => grams.setError(''));
  const servingHint = el('p', { className: 'progress-note' });
  const addIng = button({ label: 'Add ingredient', icon: 'plus', variant: 'secondary', block: true, onClick: () => addIngredient() });
  const summary = el('p', { className: 'progress-note', 'aria-live': 'polite' });

  const byId = () => new Map(getFoods().map((f) => [f.id, f]));

  function refreshFoods() {
    const foods = sortFoods(getFoods());
    const keep = foodSel ? foodSel.input.value : '';
    if (!foods.length) {
      foodSel = null;
      pickBox.replaceChildren(el('p', { className: 'progress-note', text: 'Add foods to "My foods" first, then use them here.' }));
    } else {
      foodSel = input({
        label: 'Add a food from your library', type: 'select',
        options: [{ value: '', label: 'Pick a food…' }, ...foods.map((f) => ({ value: f.id, label: foodTitle(f) }))],
        value: foods.some((f) => f.id === keep) ? keep : '',
      });
      foodSel.input.addEventListener('change', () => { foodSel.setError(''); showHint(); });
      pickBox.replaceChildren(foodSel);
    }
    addIng.hidden = !foods.length;
    grams.hidden = !foods.length;
    showHint();
    renderIngredients();
  }

  function showHint() {
    const food = foodSel && byId().get(foodSel.input.value);
    servingHint.textContent = food && food.servingGrams ? `${food.servingName || '1 serving'} = ${formatNumber(food.servingGrams, 1)} g` : '';
    servingHint.hidden = !servingHint.textContent;
  }

  function addIngredient() {
    if (!foodSel) return;
    foodSel.setError('');
    grams.setError('');
    const foodId = foodSel.input.value;
    if (!foodId) { foodSel.setError('Pick a food.'); foodSel.input.focus(); return; }
    const v = parseNum(grams.input.value);
    let error = '';
    if (v === '' || Number.isNaN(v) || v <= 0) error = 'Type the grams, e.g. 150.';
    else if (v > MAX_INGREDIENT_G) error = 'Up to 5,000 g per ingredient.';
    else if (round(v, 1) <= 0) error = 'That\'s too small.';
    if (error) { grams.setError(error); grams.input.focus(); return; }
    const g = round(v, 1);
    const same = ingredients.find((x) => x.foodId === foodId);
    if (same) same.grams = g; // adding the same food again changes its grams
    else if (ingredients.length >= MAX_INGREDIENTS) { grams.setError(`Up to ${MAX_INGREDIENTS} ingredients.`); return; }
    else ingredients.push({ foodId, grams: g });
    foodSel.input.value = '';
    grams.input.value = '';
    showHint();
    renderIngredients();
    foodSel.input.focus();
  }

  function renderIngredients() {
    ingError.hidden = true;
    const foods = byId();
    if (!ingredients.length) {
      ingList.replaceChildren(el('p', { className: 'progress-note', text: 'No ingredients yet. Pick a food and its grams below.' }));
    } else {
      ingList.replaceChildren(list(ingredients.map((x) => {
        const food = foods.get(x.foodId);
        const kcal = !food || isBlank(food.kcal) ? 'kcal unknown' : formatKcal((food.kcal * x.grams) / 100);
        const row = listItem({
          title: food ? foodTitle(food) : '❓ Missing food (deleted)',
          subtitle: `${formatNumber(x.grams, 1)} g · ${kcal}`,
          actions: [button({
            icon: 'trash', variant: 'ghost', ariaLabel: `Remove ${food ? food.name : 'missing food'} from the recipe`,
            onClick: () => { ingredients = ingredients.filter((y) => y !== x); renderIngredients(); },
          })],
        });
        row.classList.add('list-item--wrap');
        return row;
      })));
    }
    showSummary();
  }

  function showSummary() {
    if (!ingredients.length) { summary.textContent = ''; return; }
    const s = parseNum(servings.input.value);
    const n = typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= MAX_RECIPE_SERVINGS ? s : null;
    const rf = recipeAsFood({ name: '', servings: n || 1, ingredients }, byId());
    const totalKcal = isBlank(rf.kcal) ? 'kcal unknown' : formatKcal((rf.kcal * rf.totalGrams) / 100);
    let text = `Total ${formatNumber(rf.totalGrams, 1)} g · ${totalKcal}`;
    if (n) text += ` · 1 serving = ${formatNumber(rf.servingGrams, 1)} g · ${recipeServingText(rf)}`;
    if (isBlank(rf.kcal)) {
      const blanks = ingredients.map((x) => byId().get(x.foodId)).filter((f) => !f || isBlank(f.kcal));
      text += ` (no calories for ${blanks.map((f) => (f ? f.name : 'a missing food')).join(', ')})`;
    }
    summary.textContent = text;
  }

  function read(recipes, selfId) {
    name.setError('');
    servings.setError('');
    ingError.hidden = true;
    const text = name.input.value.trim();
    let error = '';
    if (!text) error = 'Give the recipe a name.';
    else if (text.length > MAX_NAME) error = `Keep it to ${MAX_NAME} letters or less.`;
    else if (recipes.some((r) => r.id !== selfId && r.name.toLowerCase() === text.toLowerCase())) {
      error = 'You already have a recipe with this name.';
    }
    if (error) { name.setError(error); name.input.focus(); return null; }
    const s = parseNum(servings.input.value);
    if (s === '' || Number.isNaN(s) || !Number.isInteger(s) || s < 1 || s > MAX_RECIPE_SERVINGS) {
      servings.setError(`Type a whole number from 1 to ${MAX_RECIPE_SERVINGS}, e.g. 4.`);
      servings.input.focus();
      return null;
    }
    if (!ingredients.length) {
      ingError.textContent = 'Add at least one ingredient.';
      ingError.hidden = false;
      (foodSel ? foodSel.input : name.input).focus();
      return null;
    }
    return { name: text, servings: s, ingredients: ingredients.map((x) => ({ foodId: x.foodId, grams: x.grams })) };
  }

  refreshFoods();
  return {
    elements: [name, servings, el('div', { className: 'field' }, [ingTitle, ingList, ingError]), pickBox, grams, servingHint, addIng, summary],
    read,
    refreshFoods,
    focus: () => name.input.focus(),
  };
}

export async function render(root) {
  let foods = await listAll('foods');
  let editingId = null;
  let extras = (await getSettings('food', { customMicros: [] })).customMicros || [];
  let editFields = null; // the food form open in a row, if any

  // Options every food form gets, so "＋ Add your own" works in both the add form and an edit row.
  const formOptions = () => ({
    extras,
    getExtras: () => extras,
    onNewExtra: async (c) => {
      const made = { id: crypto.randomUUID(), ...c };
      await saveExtras([...extras, made]);
      toast({ message: `Added ${extraLabel(made)} to every food ✨` });
      return made;
    },
  });

  // Save the list of your own nutrients and update every open form and the list card.
  async function saveExtras(listNow) {
    extras = listNow;
    await saveSettings('food', { customMicros: listNow });
    addFields.setExtras(listNow);
    if (editFields) editFields.setExtras(listNow);
    await refreshExtras();
    buildMicroTargets(); // FOOD-4: your own nutrients get a target box and a row for the day
    showMicros(await listByDate('foodLog', shownDay));
  }

  // ---- Add a food ----
  let addFields = foodFields({}, formOptions());
  const addBox = el('div', { className: 'stack' });
  function buildAddForm() {
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...addFields.elements,
      button({ label: 'Add food', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const food = addFields.read(foods);
      if (!food) return;
      await add('foods', food);
      toast({ message: `Added ${food.name} to your foods ✨` });
      addFields = foodFields({}, formOptions());
      buildAddForm();
      await refresh();
    });
    addBox.replaceChildren(form);
  }

  // ---- My foods ----
  const search = input({ label: 'Search my foods', type: 'search', placeholder: 'Name or brand' });
  search.input.addEventListener('input', () => refresh());
  const countLine = el('p', { className: 'progress-note' });
  const listBox = el('div', { className: 'stack' });

  function editRow(food) {
    const ef = foodFields(food, formOptions());
    editFields = ef;
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...ef.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingId = null; refresh(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = ef.read(foods, food.id);
      if (!changes) return;
      await update('foods', food.id, changes);
      editingId = null;
      toast({ message: `Saved ${changes.name} ✨` });
      await refresh();
    });
    queueMicrotask(() => ef.fields.name.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
  }

  function foodRow(food) {
    if (food.id === editingId) return editRow(food);
    const subtitle = [food.brand, servingText(food), kcalText(food)].filter(Boolean).join(' · ');
    const star = button({
      icon: food.favourite ? 'starFilled' : 'star',
      variant: 'ghost',
      ariaLabel: food.favourite ? `Remove ${food.name} from favourites` : `Make ${food.name} a favourite`,
      onClick: async () => {
        await update('foods', food.id, { favourite: !food.favourite });
        await refresh();
      },
    });
    star.setAttribute('aria-pressed', String(!!food.favourite));
    const row = listItem({
      title: food.favourite ? `⭐ ${food.name}` : food.name,
      subtitle,
      onClick: () => { editingId = food.id; refresh(); },
      actions: [
        star,
        button({ icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${food.name}`, onClick: () => deleteFood(food) }),
      ],
    });
    row.classList.add('list-item--wrap');
    return row;
  }

  async function refresh() {
    foods = await listAll('foods');
    const favCount = foods.filter((x) => x.favourite).length;
    countLine.textContent = foods.length
      ? `${foods.length === 1 ? '1 food' : `${formatNumber(foods.length)} foods`} · ${favCount} ⭐ favourite${favCount === 1 ? '' : 's'}`
      : '';
    const q = search.input.value.trim().toLowerCase();
    const shown = sortFoods(foods).filter((x) => !q
      || x.name.toLowerCase().includes(q) || (x.brand || '').toLowerCase().includes(q)
      || x.id === editingId);
    editFields = null;
    await refreshExtras();
    if (!foods.length) {
      listBox.replaceChildren(emptyState({
        emoji: '🍱', title: 'No foods yet', text: 'Add the foods you eat often above. You\'ll log them from here in a tap.',
      }));
    } else if (!shown.length) {
      listBox.replaceChildren(emptyState({
        emoji: '🔍', title: 'No foods match', text: `Nothing called "${search.input.value.trim()}" yet. Add it above ✨`,
      }));
    } else {
      listBox.replaceChildren(list(shown.map(foodRow)));
    }
    await refreshRecipes(); // FOOD-5: recipe nutrients follow library changes
    if (!picked) refreshPicker(); // the Log food picker shows library changes straight away
  }

  // ---- My recipes (FOOD-5) ----
  let recipes = await listAll('recipes');
  let editingRecipeId = null;
  let addRecipe = recipeFields({}, () => foods);
  const recipeAddBox = el('div');
  const recipeListBox = el('div', { className: 'stack' });
  const foodsMap = () => new Map(foods.map((x) => [x.id, x]));
  const sortRecipes = (rs) => [...rs].sort((a, b) => a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' }));
  const recipeFoods = () => sortRecipes(recipes).map((r) => recipeAsFood(r, foodsMap()));

  function buildRecipeForm() {
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...addRecipe.elements,
      button({ label: 'Save recipe', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const recipe = addRecipe.read(recipes);
      if (!recipe) return;
      await add('recipes', recipe);
      toast({ message: `Saved recipe ${recipe.name} 🍲` });
      addRecipe = recipeFields({}, () => foods);
      buildRecipeForm();
      await refreshRecipes();
      if (!picked) refreshPicker();
    });
    recipeAddBox.replaceChildren(form);
  }

  function recipeEditRow(recipe) {
    const rf = recipeFields(recipe, () => foods);
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...rf.elements,
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingRecipeId = null; refreshRecipes(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = rf.read(recipes, recipe.id);
      if (!changes) return;
      await update('recipes', recipe.id, changes);
      editingRecipeId = null;
      toast({ message: `Saved ${changes.name} ✨` });
      await refreshRecipes();
      if (!picked) refreshPicker();
    });
    queueMicrotask(() => rf.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
  }

  function recipeRow(recipe) {
    if (recipe.id === editingRecipeId) return recipeEditRow(recipe);
    const rf = recipeAsFood(recipe, foodsMap());
    const n = (recipe.ingredients || []).length;
    const parts = [
      `${recipe.servings} serving${recipe.servings === 1 ? '' : 's'}`,
      `${formatNumber(rf.totalGrams, 1)} g`,
      `${recipeServingText(rf)} each`,
      `${n} ingredient${n === 1 ? '' : 's'}`,
    ];
    if (rf.missing) parts.push(`⚠️ ${rf.missing} missing food${rf.missing === 1 ? '' : 's'}`);
    const startEdit = () => { editingRecipeId = recipe.id; refreshRecipes(); };
    const row = listItem({
      title: `🍲 ${recipe.name}`,
      subtitle: parts.join(' · '),
      onClick: startEdit,
      actions: [
        button({ icon: 'edit', variant: 'ghost', ariaLabel: `Edit ${recipe.name}`, onClick: startEdit }),
        button({ icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${recipe.name}`, onClick: () => deleteRecipe(recipe) }),
      ],
    });
    row.classList.add('list-item--wrap');
    return row;
  }

  async function refreshRecipes() {
    recipes = await listAll('recipes');
    addRecipe.refreshFoods();
    if (!recipes.length) {
      recipeListBox.replaceChildren(emptyState({
        emoji: '🍲', title: 'No recipes yet', text: 'Make one above from foods in your library, then log it in a tap.',
      }));
      return;
    }
    recipeListBox.replaceChildren(list(sortRecipes(recipes).map(recipeRow)));
  }

  async function deleteRecipe(recipe) {
    const removed = await remove('recipes', recipe.id);
    if (editingRecipeId === recipe.id) editingRecipeId = null;
    if (picked && picked.id === recipe.id) unpick(false);
    await refreshRecipes();
    if (!picked) refreshPicker();
    if (!removed) return;
    toast({
      message: `Deleted recipe ${removed.name}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('recipes', removed);
        if (recipeListBox.isConnected) { await refreshRecipes(); if (!picked) refreshPicker(); }
      },
    });
  }

  async function deleteFood(food) {
    const removed = await remove('foods', food.id);
    if (editingId === food.id) editingId = null;
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted ${removed.name}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('foods', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  // ---- My extra nutrients (your own, shared by every food) ----
  const extraListBox = el('div', { className: 'stack' });
  let editingExtraId = null;

  const newExtra = extraFields();
  const extraForm = el('form', { className: 'stack', novalidate: true }, [
    ...newExtra.elements,
    button({ label: 'Add nutrient', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  extraForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = newExtra.read(extras);
    if (!c) return;
    const made = { id: crypto.randomUUID(), ...c };
    newExtra.name.input.value = '';
    await saveExtras([...extras, made]);
    toast({ message: `Added ${extraLabel(made)} to every food ✨` });
  });

  const usedIn = (c) => foods.filter((x) => x.extraNutrients && !isBlank(x.extraNutrients[c.id])).length;
  const foodsText = (n) => (n === 1 ? '1 food' : `${formatNumber(n)} foods`);

  function extraEditRow(c) {
    const ef = extraFields(c);
    const form = el('form', { className: 'stack', novalidate: true }, [
      ...ef.elements,
      el('p', { className: 'progress-note', text: 'Changing the unit keeps the numbers already typed in your foods.' }),
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingExtraId = null; refreshExtras(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = ef.read(extras, c.id);
      if (!changes) return;
      editingExtraId = null;
      await saveExtras(extras.map((x) => (x.id === c.id ? { ...x, ...changes } : x)));
    });
    queueMicrotask(() => ef.name.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
  }

  function extraRow(c) {
    if (c.id === editingExtraId) return extraEditRow(c);
    const n = usedIn(c);
    const startEdit = () => { editingExtraId = c.id; refreshExtras(); };
    return listItem({
      title: extraLabel(c),
      subtitle: n ? `In ${foodsText(n)}` : 'Not in any food yet',
      onClick: startEdit,
      actions: [
        button({ icon: 'edit', variant: 'ghost', ariaLabel: `Edit ${c.name}`, onClick: startEdit }),
        button({ icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${c.name}`, onClick: () => deleteExtra(c) }),
      ],
    });
  }

  async function refreshExtras() {
    if (!extras.length) {
      extraListBox.replaceChildren(emptyState({
        emoji: '🧪',
        title: 'No extra nutrients yet',
        text: 'Add one above (e.g. Selenium, Omega-3) and every food gets a box for it.',
      }));
      return;
    }
    extraListBox.replaceChildren(list(extras.map(extraRow)));
  }

  // Deleting a nutrient also takes its values off every food; Undo puts them back.
  async function deleteExtra(c) {
    const index = extras.findIndex((x) => x.id === c.id);
    const taken = [];
    for (const food of await listAll('foods')) {
      if (!food.extraNutrients || !(c.id in food.extraNutrients)) continue;
      const rest = { ...food.extraNutrients };
      if (!isBlank(rest[c.id])) taken.push([food.id, rest[c.id]]);
      delete rest[c.id];
      await update('foods', food.id, { extraNutrients: rest });
    }
    if (editingExtraId === c.id) editingExtraId = null;
    foods = await listAll('foods');
    await saveExtras(extras.filter((x) => x.id !== c.id));
    toast({
      message: `Deleted ${extraLabel(c)}${taken.length ? ` (from ${foodsText(taken.length)})` : ''}`,
      actionLabel: 'Undo',
      onAction: async () => {
        for (const [id, value] of taken) {
          const food = await get('foods', id);
          if (food) await update('foods', id, { extraNutrients: { ...(food.extraNutrients || {}), [c.id]: value } });
        }
        const back = extras.filter((x) => x.id !== c.id);
        back.splice(Math.min(index, back.length), 0, c);
        foods = await listAll('foods');
        if (extraListBox.isConnected) await saveExtras(back);
        else await saveSettings('food', { customMicros: back });
      },
    });
  }

  // ---- Log food (FOOD-2) ----
  let logEntries = await listAll('foodLog');
  let picked = null; // the food chosen to log

  const mealPills = pillGroup({ label: 'Meal', options: MEALS, value: mealForHour(currentHour()), grid: true });

  // Picking a food: search, or Recent / Favourites / All.
  const pickSearch = input({ label: 'Find a food', type: 'search', placeholder: 'Name or brand' });
  pickSearch.input.addEventListener('input', () => refreshPicker());
  const viewPills = pillGroup({
    label: 'Show',
    options: [['recent', 'Recent'], ['fav', 'Favourites'], ['recipes', '🍲 Recipes'], ['all', 'All foods']],
    value: 'recent',
    grid: true,
    onChange: () => refreshPicker(),
  });
  const pickNote = el('p', { className: 'progress-note' });
  const pickList = el('div');
  const pickerBox = el('div', { className: 'stack' }, [pickSearch, viewPills, pickList, pickNote]);

  // Once a food is chosen: the food, how much, and a live line with the result.
  const pickedBox = el('div');
  const unitBox = el('div');
  let unitPills = null;
  const amountBox = input({ label: 'How many servings', inputmode: 'decimal' });
  const preview = el('p', { className: 'progress-note', 'aria-live': 'polite' });
  amountBox.input.addEventListener('input', () => updatePreview());
  const logDate = input({ label: 'Date', type: 'date', value: today(), max: today() });
  const logTime = input({ label: 'Time', type: 'time', value: nowTime() });
  const amountPart = el('div', { className: 'stack', hidden: true }, [
    pickedBox, unitBox, amountBox, preview,
    el('div', { className: 'field-row' }, [logDate, logTime]),
    button({ label: 'Log food', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  const logForm = el('form', { className: 'stack', novalidate: true }, [mealPills, pickerBox, amountPart]);

  // Foods logged most recently, newest first (foods since deleted are left out).
  // FOOD-5: recipes logged recently are included too.
  function recentFoods() {
    const byId = new Map([...foods, ...recipeFoods()].map((x) => [x.id, x]));
    const seen = new Set();
    const out = [];
    const sorted = [...logEntries].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    for (const e of sorted) {
      const id = e.recipeId || e.foodId;
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      out.push(byId.get(id));
      if (out.length === 8) break;
    }
    return out;
  }

  function refreshPicker() {
    const q = pickSearch.input.value.trim().toLowerCase();
    let shown;
    const rFoods = recipeFoods();
    if (q) {
      shown = [...sortFoods(foods), ...rFoods]
        .filter((x) => x.name.toLowerCase().includes(q) || (x.brand || '').toLowerCase().includes(q));
    } else if (viewPills.value === 'recent') shown = recentFoods();
    else if (viewPills.value === 'fav') shown = sortFoods(foods.filter((x) => x.favourite));
    else if (viewPills.value === 'recipes') shown = rFoods;
    else shown = sortFoods(foods);
    viewPills.hidden = !!q;
    pickNote.textContent = shown.length > 20 ? `Showing 20 of ${formatNumber(shown.length)} · search to find more` : '';

    if (!foods.length && !rFoods.length) {
      pickList.replaceChildren(emptyState({
        emoji: '🍱', title: 'Your library is empty', text: 'Add a food under "Add a food" below, then log it here.',
      }));
    } else if (!shown.length) {
      let empty;
      if (q) empty = { emoji: '🔍', title: 'No foods match', text: 'Add it under "Add a food" below ✨' };
      else if (viewPills.value === 'recent') empty = { emoji: '🕘', title: 'Nothing logged yet', text: 'Foods you log show up here. Try Favourites or All foods.' };
      else if (viewPills.value === 'recipes') empty = { emoji: '🍲', title: 'No recipes yet', text: 'Make one under "My recipes" below.' };
      else empty = { emoji: '⭐', title: 'No favourites yet', text: 'Tap ☆ on a food in "My foods" to make it a favourite.' };
      pickList.replaceChildren(emptyState(empty));
    } else {
      pickList.replaceChildren(list(shown.slice(0, 20).map((food) => {
        const row = listItem({
          title: pickTitle(food),
          subtitle: pickSubtitle(food),
          onClick: () => pick(food),
        });
        row.classList.add('list-item--wrap');
        return row;
      })));
    }
  }

  // How a food or recipe shows in the picker.
  function pickTitle(food) {
    if (food.isRecipe) return `🍲 ${food.name}`;
    return food.favourite ? `⭐ ${food.name}` : food.name;
  }
  function pickSubtitle(food) {
    if (food.isRecipe) {
      return ['Recipe', servingText(food), recipeServingText(food), food.missing ? '⚠️ has a missing food' : '']
        .filter(Boolean).join(' · ');
    }
    return [food.brand, servingText(food), kcalText(food)].filter(Boolean).join(' · ');
  }

  function pick(food) {
    picked = food;
    const row = listItem({
      title: pickTitle(food),
      subtitle: pickSubtitle(food),
      actions: [button({ label: 'Change', variant: 'secondary', onClick: () => unpick(true) })],
    });
    row.classList.add('list-item--wrap');
    pickedBox.replaceChildren(list([row]));
    if (food.servingGrams) {
      unitPills = pillGroup({
        label: 'Amount in',
        options: [['serving', 'Servings'], ['g', 'Grams']],
        value: 'serving',
        onChange: (unit) => switchUnit(unit),
      });
      unitBox.replaceChildren(unitPills);
      setUnit('serving', '1');
    } else {
      unitPills = null;
      unitBox.replaceChildren();
      setUnit('g', '100');
    }
    pickerBox.hidden = true;
    amountPart.hidden = false;
    amountBox.input.focus();
    amountBox.input.select();
  }

  function unpick(focus) {
    picked = null;
    pickerBox.hidden = false;
    amountPart.hidden = true;
    pickSearch.input.value = '';
    refreshPicker();
    if (focus) pickSearch.input.focus();
  }

  const unitNow = () => (unitPills ? unitPills.value : 'g');
  function setUnit(unit, value) {
    amountBox.querySelector('.field__label').textContent = unit === 'serving' ? 'How many servings' : 'How many grams';
    amountBox.input.placeholder = unit === 'serving' ? 'e.g. 1.5' : 'e.g. 150';
    amountBox.input.value = value;
    amountBox.setError('');
    updatePreview();
  }
  // Switching converts what's typed: 1.5 servings of 150 g -> 225 g.
  function switchUnit(unit) {
    const v = parseNum(amountBox.input.value);
    const ok = typeof v === 'number' && !Number.isNaN(v) && v > 0;
    if (unit === 'g') setUnit('g', ok ? String(round(v * picked.servingGrams, 1)) : '');
    else setUnit('serving', ok ? String(round(v / picked.servingGrams, 2)) : '');
  }

  function updatePreview() {
    if (!picked) { preview.textContent = ''; return; }
    const v = parseNum(amountBox.input.value);
    if (typeof v !== 'number' || Number.isNaN(v) || v <= 0) { preview.textContent = ''; return; }
    const unit = unitNow();
    const grams = unit === 'serving' ? v * picked.servingGrams : v;
    const kcal = isBlank(picked.kcal) ? 'kcal unknown' : formatKcal((picked.kcal * grams) / 100);
    preview.textContent = `${amountText({ quantity: v, quantityUnit: unit, servingName: picked.servingName, grams })} · ${kcal}`;
  }

  logForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!picked) return;
    const unit = unitNow();
    const amount = readAmount(amountBox, unit, picked.servingGrams);
    if (!amount || !checkWhen(logDate, logTime)) return;
    const entry = {
      date: logDate.input.value,
      time: logTime.input.value,
      meal: mealPills.value,
      ...(picked.isRecipe ? { recipeId: picked.id } : { foodId: picked.id }), // FOOD-5: or a recipe
      foodName: foodTitle(picked),
      quantity: amount.quantity,
      quantityUnit: unit,
      servingName: unit === 'serving' ? (picked.servingName || '') : '',
      servingGrams: unit === 'serving' ? picked.servingGrams : null,
      grams: amount.grams,
      ...nutrientsFor(picked, amount.grams),
    };
    const saved = await add('foodLog', entry);
    shownDay = entry.date;
    editingLogId = null;
    unpick(false);
    await refreshLog();
    const kcal = isBlank(entry.kcal) ? '' : ` · ${formatKcal(entry.kcal)}`;
    toast({
      message: `Logged ${entry.foodName}${kcal} 🍱`,
      actionLabel: 'Undo',
      onAction: async () => {
        await remove('foodLog', saved.id);
        if (logListBox.isConnected) await refreshLog();
      },
    });
  });

  // ---- Food log: one day at a time, grouped by meal ----
  let shownDay = today();
  let editingLogId = null;
  const dayLabel = el('div', { className: 'month-nav__title', 'aria-live': 'polite' });
  const prevDay = button({
    label: '◀', variant: 'secondary', ariaLabel: 'Previous day',
    onClick: () => { shownDay = addDays(shownDay, -1); editingLogId = null; refreshLog(); },
  });
  const nextDay = button({
    label: '▶', variant: 'secondary', ariaLabel: 'Next day',
    onClick: () => { shownDay = addDays(shownDay, 1); editingLogId = null; refreshLog(); },
  });
  const logListBox = el('div', { className: 'stack' });

  function logEditRow(entry) {
    const meal = pillGroup({ label: 'Meal', options: MEALS, value: entry.meal, grid: true });
    const isServing = entry.quantityUnit === 'serving' && entry.servingGrams;
    const unit = isServing ? 'serving' : 'g';
    const amt = input({
      label: unit === 'serving' ? 'How many servings' : 'How many grams',
      value: String(unit === 'serving' ? entry.quantity : entry.grams),
      inputmode: 'decimal',
    });
    const date = input({ label: 'Date', type: 'date', value: entry.date, max: today() });
    const time = input({ label: 'Time', type: 'time', value: entry.time });
    const form = el('form', { className: 'stack', novalidate: true }, [
      el('div', { className: 'list-item__title', text: entry.foodName }),
      meal, amt, date, time, // own lines: side by side they'd be cut off inside a row
      el('div', { className: 'btn-row' }, [
        button({ label: 'Cancel', variant: 'secondary', onClick: () => { editingLogId = null; refreshLog(); } }),
        button({ label: 'Save', variant: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const amount = readAmount(amt, unit, entry.servingGrams);
      if (!amount || !checkWhen(date, time)) return;
      const changes = {
        date: date.input.value,
        time: time.input.value,
        meal: meal.value,
        quantity: amount.quantity,
        grams: amount.grams,
        ...scaleNutrients(entry, amount.grams),
      };
      await update('foodLog', entry.id, changes);
      editingLogId = null;
      const moved = changes.date !== entry.date;
      shownDay = changes.date;
      toast({ message: moved ? `Moved ${entry.foodName} to ${formatDate(changes.date)} ✨` : `Saved ${entry.foodName} ✨` });
      await refreshLog();
    });
    queueMicrotask(() => amt.input.focus());
    return el('li', { className: 'list-item' }, [el('div', { className: 'list-item__main' }, [form])]);
  }

  function logRow(entry) {
    if (entry.id === editingLogId) return logEditRow(entry);
    const row = listItem({
      title: entry.recipeId ? `🍲 ${entry.foodName}` : entry.foodName,
      subtitle: `${amountText(entry)} · ${formatTime(entry.time)}`,
      meta: isBlank(entry.kcal) ? '? kcal' : formatKcal(entry.kcal),
      onClick: () => { editingLogId = entry.id; refreshLog(); },
      actions: [
        button({ icon: 'trash', variant: 'ghost', ariaLabel: `Delete ${entry.foodName} from the food log`, onClick: () => deleteLog(entry) }),
      ],
    });
    row.classList.add('list-item--wrap');
    return row;
  }

  async function refreshLog() {
    logEntries = await listAll('foodLog');
    dayLabel.textContent = dayTitle(shownDay);
    nextDay.disabled = shownDay >= today();
    const day = (await listByDate('foodLog', shownDay)).sort((a, b) => a.time.localeCompare(b.time));
    if (!day.length) {
      logListBox.replaceChildren(emptyState({
        emoji: '🍽️',
        title: shownDay === today() ? 'Nothing logged today yet' : 'Nothing logged on this day',
        text: 'Pick a food under "Log food" to add it here.',
      }));
    } else {
      logListBox.replaceChildren(...MEALS.map(([key, text]) => {
        const rows = day.filter((x) => (x.meal || 'snack') === key);
        if (!rows.length) return null;
        return el('div', { className: 'list-group' }, [
          el('h3', { className: 'list-group__title' }, [el('span', { text }), el('span', { text: mealTotalText(rows) })]),
          list(rows.map(logRow)),
        ]);
      }).filter(Boolean));
    }
    showMacros(day);
    showMicros(day);
    if (!picked) refreshPicker();
  }

  // ---- Today's macros (FOOD-3): totals for the day shown in the food log versus targets ----
  let targets = (await getSettings('food', { targets: DEFAULT_TARGETS })).targets || {};
  const macrosBox = el('div', { className: 'stack' });
  const macrosNote = el('p', { className: 'progress-note' });
  let macrosTitle = null; // the card's title, which follows the day shown in the food log

  function showMacros(day) {
    if (macrosTitle) {
      macrosTitle.textContent = shownDay === today() ? "Today's macros" : `Macros · ${formatDate(shownDay)}`;
    }
    let anyUnknown = false;
    macrosBox.replaceChildren(...TARGET_MACROS.map((n) => {
      const s = sumNutrient(day, n.key);
      const target = targets[n.key] > 0 ? targets[n.key] : null;
      if (s.unknown && !s.allUnknown) anyUnknown = true;
      let amount;
      if (s.allUnknown) amount = 'Unknown';
      else amount = `${s.unknown ? 'at least ' : ''}${amountOf(n.key, s.total)}${target ? ` of ${amountOf(n.key, target)}` : ''}`;
      const right = target && !s.allUnknown ? `${Math.round((s.total / target) * 100)}%` : '';
      let note;
      if (s.allUnknown) note = `No ${shortName(n).toLowerCase()} info in the foods logged`;
      else if (!target) note = 'No target set';
      else if (s.total > target) note = `${amountOf(n.key, s.total - target)} over target`;
      else if (s.total >= target - 0.05) note = 'Target reached 🎉';
      else note = `${amountOf(n.key, target - s.total)} to go`;
      const bar = target ? progressBar({ value: s.total, max: target, label: `${shortName(n)} toward your target` }) : null;
      return el('div', {}, [
        el('div', { className: 'progress-stats' }, [
          el('strong', { text: shortName(n) }),
          el('span', { className: 'progress-stats__percent', text: right }),
        ]),
        el('div', { className: 'list-item__title', text: amount }),
        bar,
        el('p', { className: 'progress-note', text: note }),
      ]);
    }));
    macrosNote.textContent = anyUnknown
      ? '"At least" means some foods you logged have that value left blank, so the real total may be higher.'
      : '';
    macrosNote.hidden = !anyUnknown;
  }

  // ---- Today's vitamins & minerals (FOOD-4): same day as the food log ----
  const microsBox = el('div', { className: 'stack' });
  const microsNote = el('p', { className: 'progress-note' });
  let microsTitle = null;

  // A nutrient with a target: amount, soft bar, % and what's left (like the macros).
  function microTargetRow({ m, s, target }) {
    const fmt = (n) => microAmount(m.unit, n);
    const amount = s.allUnknown ? 'Unknown' : `${s.unknown ? 'at least ' : ''}${fmt(s.total)} of ${fmt(target)}`;
    let note;
    if (s.allUnknown) note = `No ${m.name} info in the foods logged`;
    else if (s.total > target) note = `${fmt(s.total - target)} over target`;
    else if (s.total >= target * 0.999) note = 'Target reached 🎉';
    else note = `${fmt(target - s.total)} to go`;
    return el('div', {}, [
      el('div', { className: 'progress-stats' }, [
        el('strong', { text: m.name }),
        el('span', { className: 'progress-stats__percent', text: s.allUnknown ? '' : `${Math.round((s.total / target) * 100)}%` }),
      ]),
      el('div', { className: 'list-item__title', text: amount }),
      s.allUnknown ? null : progressBar({ value: s.total, max: target, label: `${m.name} toward your target` }),
      el('p', { className: 'progress-note', text: note }),
    ]);
  }

  function showMicros(day) {
    if (microsTitle) {
      microsTitle.textContent = shownDay === today()
        ? "Today's vitamins & minerals" : `Vitamins & minerals · ${formatDate(shownDay)}`;
    }
    const rows = microList(extras).map((m) => ({
      m, s: sumMicro(day, m), target: targets[m.key] > 0 ? targets[m.key] : null,
    }));
    const withTarget = rows.filter((r) => r.target);
    const known = day.length ? rows.filter((r) => !r.target && !r.s.allUnknown) : [];
    const unknown = rows.filter((r) => !r.target && r.s.allUnknown).map((r) => r.m.name);
    const anyPartly = rows.some((r) => r.s.unknown && !r.s.allUnknown);

    if (!day.length && !withTarget.length) {
      microsBox.replaceChildren(emptyState({
        emoji: '🥦',
        title: shownDay === today() ? 'Nothing logged today yet' : 'Nothing logged on this day',
        text: 'Log food to see your vitamins and minerals here. Set targets under "My daily targets".',
      }));
      microsNote.hidden = true;
      return;
    }
    const parts = withTarget.map(microTargetRow);
    if (known.length) {
      if (withTarget.length) parts.push(el('h3', { className: 'list-group__title' }, [el('span', { text: 'No target set' })]));
      parts.push(...known.map(({ m, s }) => el('div', { className: 'progress-stats' }, [
        el('span', { text: m.name }),
        el('strong', { text: `${s.unknown ? 'at least ' : ''}${microAmount(m.unit, s.total)}` }),
      ])));
    }
    if (unknown.length) {
      parts.push(el('p', { className: 'progress-note', text: `❔ Unknown (no info in the foods logged): ${unknown.join(', ')}` }));
    }
    if (!day.length) parts.push(el('p', { className: 'progress-note', text: 'Log food to fill these in ✨' }));
    microsBox.replaceChildren(...parts);
    microsNote.textContent = '"At least" means some foods you logged have that value left blank, so the real total may be higher.';
    microsNote.hidden = !anyPartly;
  }

  // ---- My daily targets (FOOD-3) ----
  const targetFields = TARGET_MACROS.map((n) => {
    const f = input({
      label: n.label, name: n.key, inputmode: 'decimal',
      value: targets[n.key] > 0 ? String(targets[n.key]) : '',
      placeholder: `e.g. ${DEFAULT_TARGETS[n.key]}`,
    });
    f.input.addEventListener('input', () => f.setError(''));
    return f;
  });
  // FOOD-4: a box per vitamin/mineral (your own ones too), in a fold-out. Rebuilt when your own
  // nutrients change, keeping whatever is typed.
  const microTargetGrid = el('div', { className: 'field-grid' });
  let microTargetFields = []; // [{ m, f }]
  function buildMicroTargets() {
    const typed = new Map(microTargetFields.map(({ m, f }) => [m.key, f.input.value]));
    microTargetFields = microList(extras).map((m) => {
      const f = input({
        label: `${m.name} (${m.unit})`, inputmode: 'decimal',
        value: typed.has(m.key) ? typed.get(m.key) : (targets[m.key] > 0 ? String(targets[m.key]) : ''),
      });
      f.input.addEventListener('input', () => f.setError(''));
      return { m, f };
    });
    microTargetGrid.replaceChildren(...microTargetFields.map((x) => x.f));
  }
  buildMicroTargets();
  const microTargetsBox = el('details', {
    className: 'settings-details',
    open: microList(extras).some((m) => targets[m.key] > 0),
  }, [
    el('summary', { text: 'Vitamins & minerals (optional)' }),
    el('div', { className: 'stack' }, [
      el('p', { className: 'progress-note', text: 'Only the ones you fill in get a bar. Check the amounts that suit you (e.g. with your doctor).' }),
      microTargetGrid,
    ]),
  ]);

  const targetsForm = el('form', { className: 'stack', novalidate: true }, [
    el('p', { className: 'progress-note', text: 'Leave a box empty if you don\'t want a target for it.' }),
    el('div', { className: 'field-grid' }, targetFields),
    microTargetsBox,
    button({ label: 'Save targets', variant: 'primary', type: 'submit', block: true }),
  ]);
  targetsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = { ...targets }; // keeps targets of nutrients not shown (e.g. one deleted, for Undo)
    let ok = true;
    let microError = false;
    microTargetFields.forEach(({ m, f }) => {
      const v = parseNum(f.input.value.replace(/,/g, ''));
      const max = m.unit === 'g' ? MAX_MICRO_TARGET.g : MAX_MICRO_TARGET.other;
      if (v === '') { next[m.key] = null; return; }
      if (Number.isNaN(v)) f.setError('Please type a number, e.g. 18');
      else if (v <= 0) f.setError('Please type more than 0, or leave it empty');
      else if (v > max) f.setError(`That's a lot! Please type ${formatNumber(max)} or less`);
      else { next[m.key] = round(v, 2); return; }
      ok = false;
      microError = true;
    });
    if (microError) microTargetsBox.open = true;
    TARGET_MACROS.forEach((n, i) => {
      const f = targetFields[i];
      // Targets are big round numbers, so a comma here is a thousands comma: "2,500" = 2500.
      const v = parseNum(f.input.value.replace(/,/g, ''));
      const max = n.key === 'kcal' ? MAX_TARGET.kcal : MAX_TARGET.other;
      if (v === '') { next[n.key] = null; return; }
      if (Number.isNaN(v)) f.setError('Please type a number, e.g. 60');
      else if (v <= 0) f.setError('Please type more than 0, or leave it empty');
      else if (n.key === 'kcal' && v < MIN_KCAL_TARGET) f.setError(`Please type at least ${MIN_KCAL_TARGET} kcal, or leave it empty`);
      else if (v > max) f.setError(`That's a lot! Please type ${formatNumber(max)} or less`);
      else { next[n.key] = round(v, 1); return; }
      ok = false;
    });
    if (!ok) return;
    targets = (await saveSettings('food', { targets: next })).targets;
    toast({ message: 'Daily targets saved 🎯' });
    const dayNow = await listByDate('foodLog', shownDay);
    showMacros(dayNow);
    showMicros(dayNow);
  });

  async function deleteLog(entry) {
    const removed = await remove('foodLog', entry.id);
    if (editingLogId === entry.id) editingLogId = null;
    await refreshLog();
    if (!removed) return;
    toast({
      message: `Deleted ${removed.foodName}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('foodLog', removed);
        if (logListBox.isConnected) await refreshLog();
      },
    });
  }

  buildAddForm();
  buildRecipeForm();
  const macrosCard = card({ title: "Today's macros", module: 'food', children: [macrosBox, macrosNote] });
  macrosTitle = macrosCard.querySelector('.card__title > span:last-child');
  const microsCard = card({ title: "Today's vitamins & minerals", module: 'food', children: [microsBox, microsNote] });
  microsTitle = microsCard.querySelector('.card__title > span:last-child');
  root.append(el('div', { className: 'mod-food stack' }, [
    card({ title: 'Log food', module: 'food', children: [logForm] }),
    macrosCard,
    microsCard,
    card({ title: 'Food log', module: 'food', children: [el('div', { className: 'stack' }, [
      el('div', { className: 'month-nav' }, [prevDay, dayLabel, nextDay]),
      logListBox,
    ])] }),
    card({ title: 'My daily targets', module: 'food', children: [targetsForm] }),
    card({ title: 'Add a food', module: 'food', children: [addBox] }),
    card({ title: 'My foods', module: 'food', children: [el('div', { className: 'stack' }, [search, countLine, listBox])] }),
    card({ title: 'My recipes', module: 'food', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'progress-note', text: 'Put foods from your library together into one dish, then log it like a food.' }),
      recipeAddBox,
      el('h3', { className: 'list-group__title' }, [el('span', { text: 'Saved recipes' })]),
      recipeListBox,
    ])] }),
    card({ title: 'My extra nutrients', module: 'food', children: [el('div', { className: 'stack' }, [
      el('p', { className: 'progress-note', text: 'Your own vitamins and minerals. Each one gets a box in every food, under "Vitamins & minerals".' }),
      extraForm,
      extraListBox,
    ])] }),
  ]));
  await refresh();
  await refreshLog();
}
