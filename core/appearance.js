// 🎨 Appearance: light/dark mode, colour theme, font and text size.
// Saved in storage (settings row "appearance"), applied to the page as
//   <html data-mode="light|dark" data-theme="..." data-font="..." data-size="...">
// core/styles.css holds the colours and fonts for each choice.
// Anything that draws its own colours (charts) listens for the "appearancechange" event on document.
import { getSettings, saveSettings } from './storage.js';

export const MODES = [
  { value: 'auto', emoji: '📱', label: 'Auto' },
  { value: 'light', emoji: '☀️', label: 'Light' },
  { value: 'dark', emoji: '🌙', label: 'Dark' },
];

export const THEMES = [
  { value: 'lavender', emoji: '🪻', label: 'Lavender calm', note: 'Soft lilac and warm cream' },
  { value: 'ocean', emoji: '🌊', label: 'Ocean breeze', note: 'Misty sky and sea blues' },
  { value: 'forest', emoji: '🌿', label: 'Forest mist', note: 'Gentle sage and leafy greens' },
];

export const FONTS = [
  { value: 'nunito', label: 'Nunito', note: 'Round and friendly' },
  { value: 'quicksand', label: 'Quicksand', note: 'Light and airy' },
  { value: 'comfortaa', label: 'Comfortaa', note: 'Soft and bubbly' },
  { value: 'lexend', label: 'Lexend', note: 'Clear and easy to read' },
  { value: 'lora', label: 'Lora', note: 'Gentle book style' },
];

// Text size: Normal is the size the app always had; the others scale every text size together.
export const SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
];

const DEFAULTS = { mode: 'auto', theme: 'lavender', font: 'nunito', size: 'normal' };
const pick = (list, value, fallback) => (list.some((o) => o.value === value) ? value : fallback);

let current = { ...DEFAULTS };
const phoneDark = window.matchMedia('(prefers-color-scheme: dark)');

/** True when the app is showing dark colours right now. */
export function isDark() {
  return document.documentElement.dataset.mode === 'dark';
}

/** The saved choices: { mode, theme, font, size }. */
export function getAppearance() {
  return { ...current };
}

function apply() {
  const root = document.documentElement;
  const dark = current.mode === 'dark' || (current.mode === 'auto' && phoneDark.matches);
  root.dataset.mode = dark ? 'dark' : 'light';
  root.dataset.theme = current.theme;
  root.dataset.font = current.font;
  root.dataset.size = current.size;
  // Phone status bar colour follows the app background.
  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { if (bg) m.content = bg; });
  document.dispatchEvent(new CustomEvent('appearancechange', { detail: getAppearance() }));
}

/** Read the saved choices and apply them. Call once when the app starts. */
export async function startAppearance() {
  phoneDark.addEventListener('change', () => { if (current.mode === 'auto') apply(); });
  try {
    const saved = await getSettings('appearance', DEFAULTS);
    current = {
      mode: pick(MODES, saved.mode, DEFAULTS.mode),
      theme: pick(THEMES, saved.theme, DEFAULTS.theme),
      font: pick(FONTS, saved.font, DEFAULTS.font),
      size: pick(SIZES, saved.size, DEFAULTS.size),
    };
  } catch {
    // Storage not available: keep the defaults.
  }
  apply();
}

/** Change one or more choices, e.g. setAppearance({ mode: 'dark' }). Applies at once, then saves. */
export async function setAppearance(changes) {
  current = {
    mode: pick(MODES, changes.mode ?? current.mode, current.mode),
    theme: pick(THEMES, changes.theme ?? current.theme, current.theme),
    font: pick(FONTS, changes.font ?? current.font, current.font),
    size: pick(SIZES, changes.size ?? current.size, current.size),
  };
  apply();
  await saveSettings('appearance', current);
}
