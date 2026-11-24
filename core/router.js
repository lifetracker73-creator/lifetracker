// Lifetracker screen switcher (CORE-3).
// Each screen has its own address after the "#": "#/" is home, "#/water" is the water module,
// "#/water/history" is a deeper water screen. The phone's Back button and refresh both work.
//
// A module's screens live in "<module>/index.js", which exports:
//   export function render(root, { path }) { ... }
// `root` is an empty box to put the screen into. `path` is the rest of the address as a list,
// e.g. ['history'] for "#/water/history". The module file loads only when first opened.

import { modules, emptyState } from './ui.js';
import { screenBuddy } from './buddy.js';

/** The current address without "#/", split into parts. "#/water/history" -> ['water', 'history'] */
export function currentPath() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

/** Go to a screen. navigate('water') or navigate('water/history') or navigate('') for home. */
export function navigate(path = '') {
  location.hash = `#/${path}`;
}

/**
 * Start switching screens.
 * outlet: the element screens are drawn into.
 * home: function(root) that draws the home screen.
 * onChange: function(name) called before each screen is drawn ('home' or a module key).
 * screens: extra screens that aren't modules, e.g. { settings: () => import('./settings.js') }.
 */
export function startRouter({ outlet, home, onChange, screens = {} }) {
  let latest = 0;

  async function show() {
    const ticket = ++latest;
    const [name, ...rest] = currentPath();

    if (name && !modules[name] && !screens[name]) {
      // Unknown address: quietly go home instead.
      history.replaceState(null, '', '#/');
      return show();
    }

    let render = home;
    let failed = false;
    if (name) {
      try {
        render = (screens[name] ? await screens[name]() : await import(`../${name}/index.js`)).render;
      } catch (err) {
        console.error(err);
        failed = true;
      }
    }
    if (ticket !== latest) return; // the user already moved to another screen

    onChange?.(name || 'home');
    outlet.replaceChildren();
    window.scrollTo(0, 0);
    if (failed) {
      outlet.append(emptyState({ emoji: '😿', title: "Couldn't open this screen", text: 'Please try again.' }));
      return;
    }
    // 🍄 A module screen starts with the buddy in that module's outfit (REFINE-3).
    if (modules[name]) outlet.append(screenBuddy(name));
    try {
      await render(outlet, { path: rest });
    } catch (err) {
      console.error(err);
      outlet.replaceChildren(emptyState({ emoji: '😿', title: 'Something went wrong', text: 'Please try again.' }));
    }
  }

  window.addEventListener('hashchange', show);
  return show();
}
