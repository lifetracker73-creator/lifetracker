// 🧭 Your menu (CORE-8): which 4 modules sit on the bottom bar, and the order of the module
// cards. Saved in the "menu" settings row. Home is always first and More always last.
import { getSettings, saveSettings } from './storage.js';
import { modules } from './ui.js';

export const BAR_SIZE = 4;
export const DEFAULT_ORDER = Object.keys(modules);
export const DEFAULT_BAR = ['water', 'food', 'money', 'tasks'];

// Tidies a saved choice: unknown modules dropped, missing ones added at the end, exactly 4 on the bar.
function clean({ order, bar } = {}) {
  const known = (list) => (Array.isArray(list) ? list.filter((k, i) => modules[k] && list.indexOf(k) === i) : []);
  const fullOrder = [...known(order), ...DEFAULT_ORDER.filter((k) => !known(order).includes(k))];
  let onBar = known(bar).slice(0, BAR_SIZE);
  for (const k of DEFAULT_BAR) if (onBar.length < BAR_SIZE && !onBar.includes(k)) onBar.push(k);
  for (const k of fullOrder) if (onBar.length < BAR_SIZE && !onBar.includes(k)) onBar.push(k);
  onBar = fullOrder.filter((k) => onBar.includes(k)); // bar follows the arrow order
  return { order: fullOrder, bar: onBar };
}

/** { order: all 8 modules in your order, bar: the 4 on the bottom bar (in that order) } */
export async function getMenu() {
  try {
    return clean(await getSettings('menu', {}));
  } catch (err) {
    console.error(err);
    return clean();
  }
}

/** Save a new menu and tell the app shell to redraw the bottom bar and More panel. */
export async function saveMenu(menu) {
  const tidy = clean(menu);
  await saveSettings('menu', tidy);
  document.dispatchEvent(new CustomEvent('menuchange', { detail: tidy }));
  return tidy;
}

/** "Reset to default": Water, Food, Money, Tasks on the bar and the original card order. */
export function resetMenu() {
  return saveMenu({ order: DEFAULT_ORDER, bar: DEFAULT_BAR });
}
