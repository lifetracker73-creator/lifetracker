// ⚙️ Settings screen: your name, goals and "Customise menu" (CORE-8), Appearance,
// Google Sync (SHEETS-SYNC), Notifications (CORE-9) and Backup (CORE-7).
import { card, button, input, el, toast, modules } from './ui.js';
import { getSettings, saveSettings } from './storage.js';
import { getMenu, saveMenu, resetMenu, BAR_SIZE } from './menu.js';
import { getConfig, connect, syncEverything, onStatus } from './sync.js';
import { notificationState, askPermission, notify } from './notify.js';
import { MODES, THEMES, FONTS, SIZES, getAppearance, setAppearance } from './appearance.js';
import { backupCard } from './backup.js';
import { buddy, getBuddyName, setBuddyName } from './buddy.js';

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

// 🍄 Your buddy (REFINE-3): give the doodle friend a name; it's used in its little messages.
async function buddyCard() {
  const nameField = input({
    label: "Your buddy's name", name: 'buddyName', value: await getBuddyName(), placeholder: 'e.g. Mochi',
  });
  nameField.input.maxLength = 20;
  const friend = buddy({ size: 72, face: 'content' });
  friend.setAttribute('aria-hidden', 'true');
  const form = el('form', { className: 'stack', novalidate: true }, [
    el('div', { className: 'buddy-settings' }, [friend, el('p', { className: 'settings-note', text: 'Your little friend shows up on Home, on each section and when you reach a goal.' })]),
    nameField,
    button({ label: 'Save buddy name', variant: 'primary', type: 'submit', block: true }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameField.input.value.trim().replace(/\s+/g, ' ');
    nameField.input.value = name;
    await setBuddyName(name);
    friend.hop();
    toast({ message: name ? `Hi, I'm ${name}! 🍄` : 'Buddy name cleared' });
  });
  return card({ title: '🍄 Your buddy', children: [form] });
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
  const gym = await getSettings('gym', { weeklyGoal: 3 });
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
  const gymGoal = num('Workouts each week', gym.weeklyGoal > 0 ? gym.weeklyGoal : 3, 3);

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
    heading('gym', 'Gym log'),
    gymGoal,
    el('p', { className: 'muted', text: 'Weeks run Monday to Sunday. Reaching this keeps your gym streak going.' }),
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
    const weeklyGoal = check(gymGoal, { min: 1, max: 14, whole: true, example: 3 });
    if (!ok) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    await Promise.all([
      saveSettings('gym', { weeklyGoal }),
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
      ['gym', '🏋️ Workout types and exercises'],
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
      // Same gap above "Reset to default" as between the other parts of Settings.
      el('div', { className: 'stack' }, [rows, reset]),
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
    group('size', SIZES, 'Text size', (o) => [
      el('span', { className: `size-sample size-sample--${o.value}`, 'aria-hidden': 'true', text: 'A' }),
      note(o.label),
    ], 'appearance-choices--sizes'),
    el('p', { className: 'muted', text: 'Makes all the words in the app smaller or bigger.' }),
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

// ---------- ℹ️ About your data ----------
// Plain answers about where data lives, backups and the Google Sheet, plus a step-by-step guide
// (written for a beginner) to linking a Google Sheet. Text only: nothing here reads or saves data.

// The two script files, shown as plain text on the app's own GitHub (so they can be copied, not downloaded).
const SCRIPT_FILES = 'https://raw.githubusercontent.com/lifetracker73-creator/lifetracker/main/google-apps-script/';

const fileLink = (name) => el('a', { href: SCRIPT_FILES + name, target: '_blank', rel: 'noopener', text: name });
const bold = (text) => el('strong', { text });
const steps = (items, start = 1) => el('ol', { className: 'settings-steps', start: start > 1 ? start : null },
  items.map((item) => el('li', {}, Array.isArray(item) ? item : [item])));
const dots = (items) => el('ul', { className: 'settings-steps' }, items.map((item) => el('li', {}, item)));
const question = (title, children, id) => el('details', { className: 'settings-details about-q', id }, [
  el('summary', { text: title }),
  el('div', { className: 'about-a' }, children),
]);

const GUIDE = [
  ['🧰 Part 1: Get ready', [
    'Use a computer (a laptop is easiest). A phone screen is too small for this part.',
    'Open Google Chrome.',
    'Check you are signed in to the Google account where you want your data to go. Its round picture is at the top right of any Google page.',
    'Keep your phone nearby. You will need it at the end.',
  ]],
  ['📁 Part 2: Make a new script', [
    ['Click the address bar at the top, type ', bold('script.google.com'), ' and press Enter.'],
    'If it asks you to sign in, sign in.',
    'Click the "New project" button (it has a big + on it).',
    'A new page opens. At the top it says "Untitled project". Click those words.',
    'Type LifeTracker and click "Rename".',
  ]],
  ['👀 Part 3: Show the hidden settings file', [
    'On the far left there is a thin row of icons. Click the ⚙️ gear icon ("Project Settings").',
    'Find the box "Show "appsscript.json" manifest file in editor". Click it so it gets a tick ✔️.',
    'Click the < > icon ("Editor") on the far left to go back.',
    'On the left you now see two files: Code.gs and appsscript.json.',
  ]],
  ['📋 Part 4: Copy in the first file (Code.gs)', [
    'Click "Code.gs" in the list on the left.',
    'Click anywhere inside the big writing area.',
    'Press the Ctrl and A keys together. This selects everything. (On a Mac, use ⌘ instead of Ctrl.)',
    'Press the Delete key. The writing area is now empty.',
    ['Open this link (it opens in a new tab): ', fileLink('Code.gs'), '. You will see a page full of code.'],
    'Click anywhere on that page. Press Ctrl + A, then Ctrl + C. This copies it.',
    'Go back to the script tab. Click inside the empty writing area.',
    'Press Ctrl + V. This pastes it, and the code appears.',
    'Press Ctrl + S to save (or click the 💾 save icon).',
  ]],
  ['📋 Part 5: Copy in the second file (appsscript.json)', [
    'Click "appsscript.json" in the list on the left.',
    'Click inside the writing area, press Ctrl + A, then press Delete.',
    ['Open this link: ', fileLink('appsscript.json'), '.'],
    'Click on that page, press Ctrl + A, then Ctrl + C.',
    'Go back to the script tab, click inside the empty writing area and press Ctrl + V.',
    'Press Ctrl + S to save.',
  ]],
  ['▶️ Part 6: Run "setup" to make your secret key', [
    'Click "Code.gs" on the left again.',
    'At the top, next to the "▶ Run" button, there is a small box with a name in it. Click it and choose "setup".',
    'Click "▶ Run".',
    'A box pops up: "Authorization required". Click "Review permissions".',
    'Click your Google account.',
    'Google shows a warning: "Google hasn\'t verified this app". Don\'t worry. This is your own script, so it is safe.',
    'Click the small word "Advanced" at the bottom left.',
    'Click "Go to LifeTracker (unsafe)".',
    'If you see tick boxes, tick all of them. Then click "Allow" (or "Continue").',
    'At the bottom, a box called "Execution log" opens. Wait until it says "Setup done ✅".',
    'Under it you see "Your secret key:" and then letters and numbers in groups, like ABCD-EFGH-… . That is your secret key.',
    'Select the key with your mouse and press Ctrl + C. Paste it into a private note just for you. Never show it to anyone.',
  ]],
  ['🚀 Part 7: Switch the script on (make your link)', [
    'At the top right, click the blue "Deploy" button.',
    'Click "New deployment".',
    'Next to "Select type", click the ⚙️ gear and choose "Web app".',
    'In "Description", type LifeTracker.',
    'In "Execute as", choose "Me".',
    'In "Who has access", choose "Anyone". (Don\'t worry: without your secret key, nobody can use it.)',
    'Click "Deploy".',
    'If Google asks for permission again, do the same as in Part 6: your account → Advanced → Go to LifeTracker (unsafe) → Allow.',
    'You now see "Web app" with a long link that ends in /exec. Click "Copy" under it.',
    'Paste the link into your private note too. Then click "Done".',
  ]],
  ['📱 Part 8: Connect your phone', [
    'Get the link and the key onto your phone privately, for example by emailing them to yourself. Never send them to anyone else, and delete that message once you are connected.',
    'On your phone, open Lifetracker.',
    'Tap ⚙️ at the top right to open Settings.',
    'Scroll to "☁️ Google Sync".',
    'Press and hold the "Apps Script link" box, then tap "Paste".',
    'Press and hold the "Secret key" box, then tap "Paste".',
    'Tap "Connect".',
    'Wait a few seconds. You should see "Connected: (your email) ✅". Your entries are now being copied.',
  ]],
  ['✅ Part 9: Check it worked', [
    'In the app, add a glass of water.',
    'Wait until the small icon at the top shows ✅.',
    ['On your computer, go to ', bold('drive.google.com'), '.'],
    'Open the folder "LifeTracker", then the file "LifeTracker 2026" (the year you are in).',
    'At the bottom, click the "Water" tab. Your glass of water is there! 🎉',
  ]],
  ['🔄 Later: when you are told to update the script', [
    'Open script.google.com and click your LifeTracker project.',
    'Do Part 4 again (Code.gs). Only if you are told to, do Part 5 again too.',
    'Click the blue "Deploy" button, then "Manage deployments".',
    'Click the ✏️ pencil icon.',
    'Under "Version", choose "New version".',
    'Click "Deploy". Your link stays the same, so you don\'t need to change anything on your phone.',
    'Never use "New deployment" for an update: that makes a new link.',
  ]],
  ['🆘 If something goes wrong', [
    '"The secret key is wrong": copy the key again carefully. Lost it? In the script, click ⚙️ Project Settings and scroll to "Script Properties". The value next to SECRET_KEY is your key.',
    '"The Apps Script link isn\'t working": check you copied the whole link (it ends in /exec), and that "Who has access" is "Anyone".',
    'Someone saw your key? In the script, choose "newKey" in the box next to ▶ Run and click Run. Copy the new key from the log. Then in the app: Settings → Google Sync → Change account, and paste the same link with the new key.',
    'Still stuck? Your entries are safe on your phone. Ask for help.',
  ]],
];

function guide() {
  const parts = [];
  for (const [title, items] of GUIDE) {
    parts.push(el('p', { className: 'about-part', text: title }), steps(items));
  }
  return question('🧩 Step by step: link your Google Sheet', [
    el('p', { text: 'This takes about 15 minutes, once. Go slowly and do one step at a time. ✨' }),
    ...parts,
  ], 'about-guide');
}

/** Opens the step-by-step guide and scrolls to it (used by the Google Sync card). */
function openGuide() {
  const box = document.getElementById('about-guide');
  if (!box) return;
  box.open = true;
  box.scrollIntoView({ block: 'start' });
}

function aboutCard() {
  return card({
    title: 'ℹ️ About your data',
    children: [
      el('p', { className: 'muted', text: 'Tap a question to read the answer.' }),
      question('📱 Where is my data kept?', [
        el('p', { text: 'Only on this phone, inside the app. There is no account and no company server, and nobody else can see it.' }),
        el('p', { text: 'The app\'s code is on GitHub, but your entries never go there.' }),
      ]),
      question('✈️ Does it work without internet?', [
        el('p', { text: 'Yes. Everything works offline, and entries are saved straight away.' }),
      ]),
      question('⚠️ When could I lose my data?', [
        dots([
          'If you clear this browser\'s data or "site data", or uninstall the browser.',
          'If you lose or reset your phone.',
          'On iPhone, if you use the app in Safari (not from the home screen) and don\'t open it for a few weeks.',
        ]),
        el('p', { className: 'settings-note', text: 'To be safe: add the app to your home screen, download a backup now and then, and link your Google Sheet.' }),
      ]),
      question('🔁 Is my data on my other phone or laptop too?', [
        el('p', { text: 'No. Each phone and each browser has its own separate copy.' }),
        el('p', { text: 'Moving to a new phone? Install the app there, then use "Restore from backup".' }),
      ]),
      question('💾 What is a backup?', [
        el('p', { text: '"Download backup" saves everything (even medical photos and PDFs) in one file.' }),
        el('p', { className: 'settings-note', text: 'Keep that file somewhere private. It holds all your personal details, so never share it or post it anywhere.' }),
        el('p', { text: '"Restore from backup" replaces everything on this phone with what is in the file.' }),
      ]),
      question('📊 What is "Export to Excel"?', [
        el('p', { text: 'An easy-to-read copy of everything, to look at on a computer. Keep it just as private as a backup.' }),
        el('p', { text: 'You can\'t restore the app from it. Use a backup for that.' }),
      ]),
      question('☁️ How does the Google Sheet link work?', [
        dots([
          'It is optional. Once linked, every add, change and delete is copied to a Sheet in your own Google Drive: folder "LifeTracker", one Sheet per year (like "LifeTracker 2026").',
          'Medical photos and PDFs go to the folder "LifeTracker" → "Reports".',
          'It only copies from the phone to the Sheet. Changing the Sheet does not change the app, and the app can\'t be restored from the Sheet (use a backup for that).',
          'Entries made offline are sent by themselves when you are back online.',
          'The small icon at the top shows: ✅ everything copied, ⏳ waiting to send, ⚠️ a problem (your entries are still safe on the phone).',
          'To link it, follow the step-by-step guide below.',
        ]),
      ]),
      guide(),
      question('🔒 Keeping it private', [
        dots([
          'Never share your LifeTracker Sheets or folder with "Anyone with the link".',
          'Keep your secret key secret. With your link and key, someone could add entries to your Sheet, but they still couldn\'t read it.',
          'The link and key are saved only on this phone. They are never in backups, exports or the app\'s code.',
          'Removing a photo in the app doesn\'t delete its copy in Google Drive. Delete that by hand.',
          'This app is for your own notes, not medical advice.',
        ]),
      ]),
    ],
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

  // The full beginner guide lives in ℹ️ About your data; this just points to it.
  const steps = el('div', { className: 'stack' }, [
    el('p', { className: 'muted', text: 'You need a link and a secret key from your own Google script. Setting it up takes about 15 minutes, once.' }),
    button({ label: '📖 How to link a Google Sheet, step by step', variant: 'secondary', block: true, onClick: openGuide }),
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

  const [youCard, buddyBox, goals, menuBox] = await Promise.all([profileCard(), buddyCard(), goalsCard(), menuCard()]);
  root.append(
    youCard,
    buddyBox,
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
    aboutCard(),
  );
}
