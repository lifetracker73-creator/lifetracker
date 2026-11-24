// ⚙️ Settings screen: your name, goals and "Customise menu" (CORE-8), Appearance,
// Google Sync (SHEETS-SYNC), Notifications (CORE-9) and Backup (CORE-7).
import { card, button, input, el, toast, modules } from './ui.js';
import { getSettings, saveSettings } from './storage.js';
import { getMenu, saveMenu, resetMenu, BAR_SIZE } from './menu.js';
import { getConfig, connect, syncEverything, onStatus } from './sync.js';
import { notificationState, askPermission, notify } from './notify.js';
import { MODES, THEMES, FONTS, getAppearance, setAppearance } from './appearance.js';
import { backupCard } from './backup.js';

// 👋 You: your name, used in the home greeting ("Good morning, Asha ☀️").
async function profileCard() {
  const profile = await getSettings('profile', { name: '' });
  const nameField = input({ label: 'Your name', name: 'name', value: profile.name || '', placeholder: 'e.g. Asha' });
  nameField.input.setAttribute('autocomplete', 'given-name');
  nameField.input.maxLength = 30;
  const form = el('form', { className: 'stack', novalidate: true }, [
    nameField,
    button({ label: 'Save name', variant: 'primary', type: 'submit', block: true }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameField.input.value.trim().replace(/\s+/g, ' ');
    nameField.input.value = name;
    await saveSettings('profile', { name });
    toast({ message: name ? `Hello, ${name} 👋` : 'Name cleared' });
  });
  return card({ title: '👋 You', children: [form] });
}

// 🎯 Goals: the same saved values each module uses, so a change here shows there too.
// Defaults match the modules' own (water, sleep, food).
const WATER_DEFAULTS = { dailyGoalMl: 2500, quickAmounts: [250, 500, 750] };
const SLEEP_DEFAULTS = { targetHours: 8 };
const FOOD_TARGETS = [
  { key: 'kcal', label: 'Calories (kcal)', example: 2000 },
  { key: 'proteinG', label: 'Protein (g)', example: 60 },
  { key: 'carbsG', label: 'Carbs (g)', example: 250 },
  { key: 'fatG', label: 'Fat (g)', example: 65 },
  { key: 'fibreG', label: 'Fibre (g)', example: 30 },
];
const FOOD_DEFAULT_TARGETS = { kcal: 2000, proteinG: 60, carbsG: 250, fatG: 65, fibreG: 30 };

// Reads a number box. Returns { value } (null when empty and allowed) or { error }.
function readNumber(field, { min, max, optional = false, whole = false, example }) {
  const text = field.input.value.trim().replace(/,/g, '');
  if (text === '') return optional ? { value: null } : { error: `Please type a number, e.g. ${example}` };
  const v = Number(text);
  if (!Number.isFinite(v)) return { error: `Please type a number, e.g. ${example}` };
  if (v < min) return { error: `Please type at least ${min}${optional ? ', or leave it empty' : ''}` };
  if (v > max) return { error: `That's a lot! Please type ${max} or less` };
  return { value: whole ? Math.round(v) : Math.round(v * 10) / 10 };
}

async function goalsCard() {
  const [water, sleep, weight, food] = await Promise.all([
    getSettings('water', WATER_DEFAULTS),
    getSettings('sleep', SLEEP_DEFAULTS),
    getSettings('weight', { heightCm: null, goalKg: null }),
    getSettings('food', { targets: FOOD_DEFAULT_TARGETS }),
  ]);
  const foodTargets = food.targets || {};
  const num = (label, value, example) => {
    const f = input({ label, inputmode: 'decimal', value: value == null ? '' : String(value), placeholder: `e.g. ${example}` });
    f.input.addEventListener('input', () => f.setError(''));
    return f;
  };
  const heading = (key, text) => el('h3', { className: `goals-heading mod-${key}`, text: `${modules[key].emoji} ${text}` });

  const waterGoal = num('Daily goal (ml)', water.dailyGoalMl, 2500);
  const quick = [0, 1, 2].map((i) => num(`Button ${i + 1} (ml)`, (water.quickAmounts || [])[i], WATER_DEFAULTS.quickAmounts[i]));
  const sleepTarget = num('Hours of sleep each night', sleep.targetHours, 8);
  const height = num('Height (cm)', weight.heightCm, 165);
  const goalKg = num('Goal weight (kg)', weight.goalKg, 60);
  const foodFields = FOOD_TARGETS.map((t) => num(t.label, foodTargets[t.key] > 0 ? foodTargets[t.key] : null, t.example));

  const form = el('form', { className: 'stack', novalidate: true }, [
    el('p', { className: 'muted', text: 'These are the same goals you see in each module. Change them here or there.' }),
    heading('water', 'Water'),
    waterGoal,
    el('p', { className: 'field__label', text: 'Quick-add buttons' }),
    el('div', { className: 'field-grid' }, quick),
    heading('sleep', 'Sleep'),
    sleepTarget,
    heading('weight', 'Weight'),
    el('div', { className: 'field-grid' }, [height, goalKg]),
    el('p', { className: 'muted', text: 'Both optional. Height is used only for BMI. Leave a box empty to clear it.' }),
    heading('food', 'Food: daily targets'),
    el('div', { className: 'field-grid' }, foodFields),
    el('p', { className: 'muted', text: 'Leave a box empty for no target. Vitamin and mineral targets are in 🍱 Food.' }),
    button({ label: 'Save goals', variant: 'primary', type: 'submit', block: true }),
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let ok = true;
    const check = (field, rules) => {
      const r = readNumber(field, rules);
      field.setError(r.error || '');
      if (r.error) ok = false;
      return r.value;
    };
    const goal = check(waterGoal, { min: 250, max: 10000, whole: true, example: 2500 });
    const amounts = quick.map((f, i) => check(f, { min: 10, max: 5000, whole: true, example: WATER_DEFAULTS.quickAmounts[i] }));
    const hours = check(sleepTarget, { min: 3, max: 14, example: '7.5' });
    const cm = check(height, { min: 50, max: 250, optional: true, example: 165 });
    const kg = check(goalKg, { min: 20, max: 300, optional: true, example: 60 });
    const targets = {};
    FOOD_TARGETS.forEach((t, i) => {
      targets[t.key] = t.key === 'kcal'
        ? check(foodFields[i], { min: 500, max: 10000, optional: true, whole: true, example: t.example })
        : check(foodFields[i], { min: 1, max: 1000, optional: true, example: t.example });
    });
    if (!ok) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    await Promise.all([
      saveSettings('water', { dailyGoalMl: goal, quickAmounts: amounts }),
      saveSettings('sleep', { targetHours: hours }),
      saveSettings('weight', { heightCm: cm, goalKg: kg }),
      // Keep your vitamin/mineral targets; only the five above change.
      saveSettings('food', { targets: { ...foodTargets, ...targets } }),
    ]);
    Object.assign(foodTargets, targets);
    toast({ message: 'Goals saved 🎯' });
  });

  const shortcuts = el('div', { className: 'stack' }, [
    el('p', { className: 'muted', text: 'Set inside their own modules:' }),
    ...[
      ['money', '💸 Budgets and categories'],
      ['medical', '🩺 People and visit types'],
      ['sleep', '😴 Automatic wake-up time'],
    ].map(([key, text]) => el('a', { className: `btn btn--secondary btn--block mod-${key}`, href: `#/${key}` }, [el('span', { text })])),
  ]);
  return card({ title: '🎯 Goals', children: [form, shortcuts] });
}

// 🧭 Customise menu: pick 4 modules for the bottom bar; ↑/↓ also sets the home card order.
async function menuCard() {
  let menu = await getMenu();
  const rows = el('ol', { className: 'menu-list' });
  const note = el('p', { className: 'muted' });

  async function change(next, message) {
    menu = await saveMenu(next);
    draw();
    if (message) toast({ message });
  }
  function move(i, by) {
    const order = [...menu.order];
    [order[i], order[i + by]] = [order[i + by], order[i]];
    // Keep the same button focused after the list redraws.
    change({ ...menu, order }).then(() => {
      rows.children[i + by]?.querySelector(by < 0 ? '.menu-up' : '.menu-down')?.focus();
    });
  }
  // Swap: tap one module's place button, then one from the other group; they trade places.
  // The bar always keeps exactly 4.
  let swapFrom = null;
  function pick(key) {
    const on = menu.bar.includes(key);
    if (swapFrom === null) {
      swapFrom = key;
      draw();
      return;
    }
    if (swapFrom === key) { swapFrom = null; draw(); return; }
    const fromOn = menu.bar.includes(swapFrom);
    if (fromOn === on) { swapFrom = key; draw(); return; }
    const [barKey, moreKey] = fromOn ? [swapFrom, key] : [key, swapFrom];
    swapFrom = null;
    change({ ...menu, bar: [...menu.bar.filter((k) => k !== barKey), moreKey] },
      `${modules[moreKey].emoji} ${modules[moreKey].label} is on the bottom bar`);
  }
  function draw() {
    const picking = swapFrom !== null;
    const pickingOn = picking && menu.bar.includes(swapFrom);
    note.textContent = !picking
      ? 'Tap a module\'s place button to swap it between the bottom bar and More.'
      : pickingOn
        ? `Now tap a 🌈 More module to put it on the bar instead of ${modules[swapFrom].label}.`
        : `Now tap a ⭐ Bar module to swap with ${modules[swapFrom].label}.`;
    rows.replaceChildren(...menu.order.map((key, i) => {
      const on = menu.bar.includes(key);
      const place = el('button', {
        type: 'button',
        className: `btn ${swapFrom === key ? 'btn--primary' : 'btn--secondary'} menu-place`,
        'aria-pressed': String(swapFrom === key),
        'aria-label': `${modules[key].label}: ${on ? 'on the bottom bar' : 'in More'}. Tap to swap.`,
        onClick: () => pick(key),
      }, [el('span', { text: on ? '⭐ Bar' : '🌈 More' })]);
      const up = button({ label: '↑', variant: 'ghost', ariaLabel: `Move ${modules[key].label} up`, disabled: i === 0, onClick: () => move(i, -1) });
      const down = button({ label: '↓', variant: 'ghost', ariaLabel: `Move ${modules[key].label} down`, disabled: i === menu.order.length - 1, onClick: () => move(i, 1) });
      up.classList.add('menu-up', 'menu-arrow');
      down.classList.add('menu-down', 'menu-arrow');
      return el('li', { className: `menu-row mod-${key}${on ? ' is-on' : ''}` }, [
        el('span', { className: 'menu-row__name' }, [
          el('span', { 'aria-hidden': 'true', text: modules[key].emoji }),
          el('span', { text: modules[key].label }),
        ]),
        place, up, down,
      ]);
    }));
  }
  draw();

  const reset = button({
    label: 'Reset to default',
    variant: 'secondary',
    block: true,
    onClick: () => { swapFrom = null; resetMenu().then((m) => { menu = m; draw(); toast({ message: 'Menu is back to Water, Food, Money, Tasks' }); }); },
  });
  return card({
    title: '🧭 Customise menu',
    children: [
      el('p', { className: 'muted', text: `🏠 Home is always first and 🌈 More always last. ${BAR_SIZE} modules sit on the bottom bar; the rest are in More. The ↑/↓ arrows set the order on the bar, in More and on the home screen.` }),
      note,
      rows,
      reset,
    ],
  });
}

// 🎨 Appearance: light/dark/auto, 3 calm colour themes and 5 fonts. Changes show at once.
function appearanceCard() {
  const groups = [];
  function group(key, options, title, makeContent, extraClass = '') {
    const grid = el('div', { className: `appearance-choices ${extraClass}`, role: 'group', 'aria-label': title });
    for (const opt of options) {
      const b = el('button', {
        type: 'button',
        className: 'btn btn--secondary appearance-choice',
        onClick: () => { setAppearance({ [key]: opt.value }); paint(); },
      }, makeContent(opt));
      b.dataset.value = opt.value;
      grid.append(b);
    }
    groups.push({ key, grid });
    return el('div', { className: 'field' }, [el('div', { className: 'field__label', text: title }), grid]);
  }
  function paint() {
    const now = getAppearance();
    for (const { key, grid } of groups) {
      grid.querySelectorAll('.appearance-choice').forEach((b) => {
        const on = b.dataset.value === now[key];
        b.classList.toggle('btn--primary', on);
        b.classList.toggle('btn--secondary', !on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
  }
  const note = (text) => el('span', { className: 'appearance-choice__note', text });
  const body = el('div', { className: 'stack' }, [
    group('mode', MODES, 'Light or dark', (o) => [el('span', { text: `${o.emoji} ${o.label}` })], 'appearance-choices--modes'),
    el('p', { className: 'muted', text: 'Auto follows your phone. The ☀️/🌙 button at the top switches quickly too.' }),
    group('theme', THEMES, 'Colour theme', (o) => [
      el('span', { className: `appearance-swatches appearance-swatches--${o.value}`, 'aria-hidden': 'true' }, [el('span'), el('span'), el('span')]),
      el('span', { text: `${o.emoji} ${o.label}` }),
      note(o.note),
    ]),
    group('font', FONTS, 'Font', (o) => [
      el('span', { className: `font-sample--${o.value}`, text: o.label }),
      note(o.note),
    ]),
  ]);
  paint();
  // Keep the highlighted choice right when the ☀️/🌙 button at the top is tapped.
  const repaint = () => (body.isConnected ? paint() : document.removeEventListener('appearancechange', repaint));
  document.addEventListener('appearancechange', repaint);
  return card({ title: '🎨 Appearance', children: [body] });
}

// 🔔 Notifications (CORE-9): shows if they're on, a "Turn on" button and "Send a test".
function notificationsCard() {
  const words = {
    on: ['On ✅', 'Reminders will pop up as phone notifications.'],
    off: ['Off', 'Turn them on so reminders can pop up. Until then they show as a banner inside the app.'],
    blocked: ['Blocked 🚫', 'This phone has blocked notifications for Lifetracker. To allow them: open the app\'s settings (or tap the lock icon next to the web address) → Notifications → Allow. Until then reminders show as a banner inside the app.'],
    unsupported: ['Not available here', 'This browser can\'t show notifications, so reminders show as a banner inside the app. On iPhone, add the app to the Home Screen first (Share → Add to Home Screen).'],
  };
  const statusLine = el('p', { className: 'settings-status' });
  const statusMore = el('p', { className: 'muted' });
  const turnOn = button({
    label: '🔔 Turn on notifications',
    variant: 'primary',
    block: true,
    onClick: async () => {
      const state = await askPermission();
      show();
      toast({ message: state === 'on' ? 'Notifications are on 🔔' : 'Notifications are still off' });
    },
  });
  const test = button({
    label: 'Send a test',
    variant: 'secondary',
    block: true,
    onClick: () => notify({
      title: 'Hello from Lifetracker',
      body: 'This is how your reminders will look ✨',
      emoji: '🔔',
      tag: 'test',
    }),
  });
  function show() {
    const state = notificationState();
    statusLine.textContent = words[state][0];
    statusMore.textContent = words[state][1];
    turnOn.hidden = state !== 'off';
  }
  show();
  return card({
    title: '🔔 Notifications',
    children: [statusLine, statusMore, el('div', { className: 'stack' }, [turnOn, test])],
  });
}

export async function render(root) {
  const cfg = await getConfig();
  const connected = Boolean(cfg.url && cfg.key);

  // ---- status ----
  const statusLine = el('p', { className: 'settings-status' });
  const statusMore = el('p', { className: 'muted' });
  let stop = null;
  stop = onStatus((s) => {
    if (!root.isConnected) { stop?.(); return; }
    statusLine.textContent = s.setUp
      ? `Connected: ${s.email || 'your Google account'} ✅`
      : 'Not connected yet';
    statusMore.textContent = s.setUp ? s.message : 'Your entries are safe on this phone. Connect to also copy them to Google Sheets.';
  });

  // ---- connect form (also used for "Change account") ----
  const linkField = input({ label: 'Apps Script link', placeholder: 'https://script.google.com/macros/s/…/exec' });
  const keyField = input({ label: 'Secret key', placeholder: 'ABCD-EFGH-…' });
  for (const field of [linkField.input, keyField.input]) {
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('autocorrect', 'off');
  }
  linkField.input.setAttribute('inputmode', 'url');
  keyField.input.setAttribute('autocapitalize', 'characters');
  const formError = el('p', { className: 'field__error', role: 'alert', hidden: true });

  const connectButton = button({
    label: 'Connect',
    variant: 'primary',
    block: true,
    onClick: async () => {
      formError.hidden = true;
      connectButton.disabled = true;
      connectButton.lastChild.textContent = 'Connecting…';
      try {
        const email = await connect(linkField.input.value, keyField.input.value);
        toast({ message: `Connected${email ? ` to ${email}` : ''} ✅ Uploading your entries…` });
        root.replaceChildren();
        await render(root);
      } catch (err) {
        formError.textContent = err.message;
        formError.hidden = false;
        connectButton.disabled = false;
        connectButton.lastChild.textContent = 'Connect';
      }
    },
  });

  const steps = el('details', { className: 'settings-details', open: !connected }, [
    el('summary', { text: 'How to connect a Google account' }),
    el('ol', { className: 'settings-steps' }, [
      'On a computer, sign in to the Google account you want, and open script.google.com → New project.',
      'Paste in the two LifeTracker script files (Code.gs and appsscript.json from the google-apps-script folder of this project). Claude can walk you through it.',
      'Choose "setup" at the top and press Run. Allow access. Google will say "Google hasn\'t verified this app": tap Advanced, then "Go to … (unsafe)". It\'s safe: it\'s your own script.',
      'Copy the secret key shown in the log at the bottom.',
      'Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Copy the Web app link.',
      'Paste the link and the key here and tap Connect. All your entries are then uploaded to that account.',
    ].map((text) => el('li', { text }))),
  ]);

  const form = el('div', { className: 'stack', hidden: connected }, [
    connected ? el('p', { className: 'muted', text: 'Set up the script in the other Google account first (steps below), then paste its link and key. Your entries stay on this phone; everything is then uploaded to the new account. The old account keeps its copy.' }) : null,
    steps, linkField, keyField, formError, connectButton,
  ]);

  // ---- buttons when connected ----
  const syncAllButton = button({
    label: '🔄 Sync everything now',
    variant: 'primary',
    block: true,
    onClick: async () => {
      syncAllButton.disabled = true;
      try {
        const count = await syncEverything();
        toast({ message: `Sending all ${count} ${count === 1 ? 'entry' : 'entries'} to Google…` });
      } finally {
        syncAllButton.disabled = false;
      }
    },
  });
  const changeButton = button({
    label: 'Change account',
    variant: 'secondary',
    block: true,
    onClick: () => {
      form.hidden = false;
      changeButton.hidden = true;
      linkField.input.focus();
    },
  });

  const [youCard, goals, menuBox] = await Promise.all([profileCard(), goalsCard(), menuCard()]);
  root.append(
    youCard,
    goals,
    menuBox,
    appearanceCard(),
    card({
      title: '☁️ Google Sync',
      children: [
        statusLine,
        statusMore,
        connected ? el('div', { className: 'stack' }, [syncAllButton, changeButton]) : null,
        form,
      ],
    }),
    notificationsCard(),
    backupCard(),
    card({
      title: '🔒 Keep it private',
      children: [
        el('p', { className: 'settings-note', text: 'Your LifeTracker Sheets and the LifeTracker folder in Google Drive should stay private. Never share them with "Anyone with the link".' }),
        el('p', { className: 'muted', text: 'The link and key are saved only on this phone, never in the app\'s code or on GitHub. The script only accepts entries; it can\'t send your data back out.' }),
      ],
    }),
  );
}
