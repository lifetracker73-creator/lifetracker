// Lifetracker shared UI pieces (CORE-1, cute pastel style).
// Every module builds its screens from these so the app looks the same everywhere.
// Each function returns a DOM element. Text is always set safely as text, never as HTML.

// Small inline SVG icons (no icon libraries). Our own constant strings only.
export const icons = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-width="2"/><path d="M8 12.5l3 3 5-6"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13l3-8h12l3 8v6H3v-6z"/><path d="M3 13h5l1 3h6l1-3h5"/></svg>',
};

// Each module's emoji and name. Its pastel colour is the CSS class "mod-<key>" in styles.css.
export const modules = {
  water: { emoji: '💧', label: 'Water' },
  sleep: { emoji: '😴', label: 'Sleep' },
  weight: { emoji: '⚖️', label: 'Weight' },
  food: { emoji: '🍱', label: 'Food' },
  money: { emoji: '💸', label: 'Money' },
  tasks: { emoji: '✅', label: 'Tasks' },
  reading: { emoji: '📚', label: 'Reading' },
  bloodtests: { emoji: '🩸', label: 'Blood tests' },
};

/**
 * Round pastel bubble with a module's emoji. badge('water')
 */
export function badge(moduleKey) {
  const mod = modules[moduleKey];
  return el('span', { className: `badge mod-${moduleKey}`, 'aria-hidden': 'true', text: mod ? mod.emoji : '' });
}

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Create an element. `children` may be elements, strings (added as text), or null (skipped).
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function iconSpan(name, className) {
  const span = el('span', { className });
  span.innerHTML = icons[name] || '';
  return span;
}

/**
 * Card: a rounded box with an optional title.
 * Give `module` (e.g. 'water') to add that module's emoji to the title and use its pastel colour.
 * card({ title: 'Today', module: 'water', children: [...] })
 */
export function card({ title, module, children = [], className = '' } = {}) {
  const classes = ['card'];
  if (module) classes.push(`mod-${module}`);
  if (className) classes.push(className);
  return el('section', { className: classes.join(' ') }, [
    title
      ? el('h2', { className: 'card__title' }, [module ? badge(module) : null, el('span', { text: title })])
      : null,
    el('div', { className: 'card__body' }, children),
  ]);
}

/**
 * Button. variant: 'primary' | 'secondary' | 'ghost' | 'danger'.
 * button({ label: 'Add', icon: 'plus', variant: 'primary', onClick })
 * For an icon-only button, leave `label` empty and give `ariaLabel`.
 */
export function button({
  label = '',
  variant = 'primary',
  icon,
  onClick,
  type = 'button',
  block = false,
  disabled = false,
  ariaLabel,
} = {}) {
  const classes = ['btn', `btn--${variant}`];
  if (block) classes.push('btn--block');
  if (icon && !label) classes.push('btn--icon');
  const btn = el('button', {
    type,
    className: classes.join(' '),
    disabled,
    'aria-label': ariaLabel || (label ? null : icon),
    onClick,
  });
  if (icon) btn.append(iconSpan(icon, 'btn__icon'));
  if (label) btn.append(el('span', { text: label }));
  return btn;
}

/**
 * Input with a label. type: 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select'.
 * For 'select', pass options: [{ value, label }].
 * Returns the wrapper; the actual field is at wrapper.input.
 */
export function input({
  label,
  name,
  type = 'text',
  value = '',
  placeholder,
  hint,
  required = false,
  min,
  max,
  step,
  inputmode,
  options = [],
  onInput,
} = {}) {
  const id = nextId('field');
  let field;
  if (type === 'textarea') {
    field = el('textarea', { id, name, className: 'input', placeholder, required });
    field.value = value;
  } else if (type === 'select') {
    field = el(
      'select',
      { id, name, className: 'input', required },
      options.map((opt) => el('option', { value: opt.value, text: opt.label })),
    );
    field.value = value;
  } else {
    field = el('input', {
      id, name, type, className: 'input', placeholder, required, min, max, step, inputmode,
    });
    field.value = value;
  }
  if (onInput) field.addEventListener('input', onInput);

  const errorEl = el('div', { className: 'field__error', id: `${id}-error`, hidden: true });
  const wrapper = el('div', { className: 'field' }, [
    label ? el('label', { className: 'field__label', for: id, text: label }) : null,
    field,
    hint ? el('div', { className: 'field__hint', text: hint }) : null,
    errorEl,
  ]);
  wrapper.input = field;
  wrapper.setError = (message) => {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', errorEl.id);
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    }
  };
  return wrapper;
}

/**
 * List of rows. items: array of elements made with listItem().
 */
export function list(items = []) {
  return el('ul', { className: 'list' }, items);
}

/**
 * One list row: title, optional subtitle, optional meta (right side), optional action buttons.
 * listItem({ title: '250 ml', subtitle: '08:30', meta: 'Water', onClick, actions: [button(...)] })
 */
export function listItem({ title, subtitle, meta, onClick, actions = [] } = {}) {
  const row = el('li', { className: onClick ? 'list-item list-item--clickable' : 'list-item' }, [
    el('div', { className: 'list-item__main' }, [
      el('div', { className: 'list-item__title', text: title }),
      subtitle ? el('div', { className: 'list-item__subtitle', text: subtitle }) : null,
    ]),
    meta ? el('div', { className: 'list-item__meta', text: meta }) : null,
    actions.length ? el('div', { className: 'list-item__actions' }, actions) : null,
  ]);
  if (onClick) {
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.addEventListener('click', (e) => {
      if (e.target.closest('.list-item__actions')) return;
      onClick(e);
    });
    row.addEventListener('keydown', (e) => {
      if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(e);
      }
    });
  }
  return row;
}

/**
 * Short message floating above the bottom menu bar, with an optional button (e.g. Undo).
 * It hides itself after `duration` ms, when the button is tapped, or when the screen changes.
 * Only one shows at a time. toast({ message: 'Deleted 250 ml', actionLabel: 'Undo', onAction })
 */
let currentToast = null;
export function toast({ message, actionLabel, onAction, duration = 5000 } = {}) {
  currentToast?.close();
  let timer = null;
  const box = el('div', { className: 'toast', role: 'status' }, [
    el('span', { className: 'toast__text', text: message }),
    actionLabel
      ? button({
        label: actionLabel,
        variant: 'ghost',
        onClick: () => { close(); onAction?.(); },
      })
      : null,
  ]);
  function close() {
    clearTimeout(timer);
    window.removeEventListener('hashchange', close);
    box.remove();
    if (currentToast === handle) currentToast = null;
  }
  const handle = { close };
  currentToast = handle;
  document.body.append(box);
  timer = setTimeout(close, duration);
  window.addEventListener('hashchange', close);
  return handle;
}

/**
 * Empty state: shown when a list has nothing in it yet.
 * emptyState({ title: 'No entries yet', text: 'Add your first one.', action: button(...) })
 * Pass `emoji` (e.g. '💧') to show an emoji instead of the icon.
 */
export function emptyState({ icon = 'inbox', emoji, title, text, action } = {}) {
  return el('div', { className: 'empty' }, [
    emoji
      ? el('span', { className: 'empty__icon', 'aria-hidden': 'true', text: emoji })
      : iconSpan(icon, 'empty__icon'),
    title ? el('p', { className: 'empty__title', text: title }) : null,
    text ? el('p', { className: 'empty__text', text }) : null,
    action || null,
  ]);
}

/**
 * Progress bar: a soft rounded bar in the module's pastel colour (WTR-2).
 * progressBar({ value: 1250, max: 2500, label: 'Water today' })
 * The fill stops at full when value is over max. Returns the element with `.set(value, max)` to update it.
 */
export function progressBar({ value = 0, max = 100, label = '' } = {}) {
  const fill = el('div', { className: 'progress__fill' });
  const bar = el('div', {
    className: 'progress',
    role: 'progressbar',
    'aria-label': label || undefined,
    'aria-valuemin': 0,
  }, [fill]);
  bar.set = (v, m) => {
    const safeMax = m > 0 ? m : 1;
    const percent = Math.min(100, Math.max(0, (v / safeMax) * 100));
    fill.style.width = `${percent}%`;
    bar.setAttribute('aria-valuemax', String(safeMax));
    bar.setAttribute('aria-valuenow', String(Math.min(v, safeMax)));
    bar.classList.toggle('progress--full', v >= safeMax);
  };
  bar.set(value, max);
  return bar;
}
