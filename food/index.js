// 🍱 food module screens.
// FOOD-1: Food library: add, edit, delete (with Undo), search, favourites.
//         Nutrients can be typed per 100 g or per serving; they are always saved per 100 g.
//         A blank nutrient means "unknown", never zero.
import { card, button, input, list, listItem, emptyState, toast, el } from '../core/ui.js';
import { add, update, remove, restore, list as listAll } from '../core/storage.js';
import { formatNumber, formatKcal } from '../core/format.js';

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

// The whole food form (used to add and to edit). Returns { elements, read(foods, selfId) }.
function foodFields(values = {}) {
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
      for (const n of NUTRIENTS) {
        const v = parseNum(f[n.key].input.value);
        if (typeof v === 'number' && !Number.isNaN(v)) f[n.key].input.value = boxText(v * factor);
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

  const microsOpen = MICROS.some((n) => !isBlank(values[n.key]));
  const micros = el('details', { className: 'settings-details', open: microsOpen }, [
    el('summary', { text: 'Vitamins & minerals (optional)' }),
    el('div', { className: 'field-grid' }, MICROS.map((n) => f[n.key])),
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
    for (const n of NUTRIENTS) {
      const v = parseNum(f[n.key].input.value);
      food[n.key] = null;
      if (v === '') continue;
      if (Number.isNaN(v)) { fail(f[n.key], 'Type a number, e.g. 12.5, or leave it empty.'); continue; }
      const per100 = round(v * factor, 3);
      if (n.grams === null && per100 > MAX_KCAL) {
        fail(f[n.key], `That's over ${MAX_KCAL} kcal per 100 g, more than any food has.`);
      } else if (n.grams !== null && per100 * n.grams > 100) {
        fail(f[n.key], per === 'serving' ? 'That weighs more than the serving.' : 'That\'s more than 100 g in 100 g.');
      } else food[n.key] = per100;
    }
    if (food.sugarG !== null && food.carbsG !== null && food.sugarG > food.carbsG) {
      fail(f.sugarG, 'Sugar can\'t be more than carbs.');
    }
    if (food.satFatG !== null && food.fatG !== null && food.satFatG > food.fatG) {
      fail(f.satFatG, 'Saturated fat can\'t be more than fat.');
    }

    if (errors.length) {
      if (MICROS.some((n) => errors.includes(f[n.key]))) micros.open = true;
      errors[0].input.focus();
      return null;
    }
    return food;
  }

  return { elements, read, fields: f };
}

function sortFoods(foods) {
  return [...foods].sort((a, b) => (Number(!!b.favourite) - Number(!!a.favourite))
    || a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' })
    || (a.brand || '').localeCompare(b.brand || '', 'en-IN', { sensitivity: 'base' }));
}

export async function render(root) {
  let foods = await listAll('foods');
  let editingId = null;

  // ---- Add a food ----
  let addFields = foodFields();
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
      addFields = foodFields();
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
    const ef = foodFields(food);
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

  buildAddForm();
  root.append(el('div', { className: 'mod-food stack' }, [
    card({ title: 'Add a food', module: 'food', children: [addBox] }),
    card({ title: 'My foods', module: 'food', children: [el('div', { className: 'stack' }, [search, countLine, listBox])] }),
  ]));
  await refresh();
}
