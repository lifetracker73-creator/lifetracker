// 🎨 Appearance: light/dark mode, colour theme, font, text size, buddy on/off and emoji on/off.
// Saved in storage (settings row "appearance"), applied to the page as
//   <html data-mode="light|dark" data-theme="..." data-font="..." data-size="..." data-buddy="on|off" data-emoji="on|off">
// core/styles.css holds the colours and fonts for each choice.
// Anything that draws its own colours (charts) listens for the "appearancechange" event on document.
// 🖤 Serious theme: always dark, crisp and plain, with the buddy hidden. Only there can heading emoji
// be switched off too (data-emoji="off"): then emoji are taken out of headings while they show.
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
  { value: 'serious', emoji: '🖤', label: 'Serious', note: 'Always dark, crisp and plain' },
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

// Buddy and emoji switches.
export const ON_OFF = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const DEFAULTS = { mode: 'auto', theme: 'lavender', font: 'nunito', size: 'normal', buddy: 'on', emoji: 'on' };
const pick = (list, value, fallback) => (list.some((o) => o.value === value) ? value : fallback);
const LISTS = { mode: MODES, theme: THEMES, font: FONTS, size: SIZES, buddy: ON_OFF, emoji: ON_OFF };

let current = { ...DEFAULTS };
const phoneDark = window.matchMedia('(prefers-color-scheme: dark)');

/** True when the app is showing dark colours right now. */
export function isDark() {
  return document.documentElement.dataset.mode === 'dark';
}

/** True when the Serious theme is on (always dark, no buddy). */
export function isSerious() {
  return current.theme === 'serious';
}

/** The saved choices: { mode, theme, font, size, buddy, emoji }. */
export function getAppearance() {
  return { ...current };
}

// ---- Emoji off (Serious theme only): take emoji out of headings, and put them back when on again ----
const HEADINGS = 'h1, h2, h3, .card__title, .goals-heading, .list-group__title';
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍|\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s?/gu;
const originals = new Map(); // text node → { text: with emoji, plain: what we put there }
let observer = null;

function stripNode(node) {
  const saved = originals.get(node);
  if (saved && node.nodeValue === saved.plain) return; // already done
  const text = node.nodeValue; // new or changed by the app since
  EMOJI.lastIndex = 0;
  if (!EMOJI.test(text)) { originals.delete(node); return; }
  const plain = text.replace(EMOJI, '').trim();
  originals.set(node, { text, plain });
  node.nodeValue = plain;
}
function stripIn(root) {
  const heads = root.nodeType === 1 && root.matches(HEADINGS) ? [root] : [];
  const parent = root.nodeType === 3 ? root.parentElement : null;
  if (parent?.closest(HEADINGS)) heads.push(parent.closest(HEADINGS));
  if (root.querySelectorAll) heads.push(...root.querySelectorAll(HEADINGS));
  for (const h of heads) {
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) stripNode(walker.currentNode);
  }
}
function emojiOff(off) {
  if (off && !observer) {
    stripIn(document.body);
    observer = new MutationObserver((changes) => {
      for (const c of changes) {
        if (c.type === 'characterData') stripIn(c.target);
        else c.addedNodes.forEach(stripIn);
      }
      // Forget headings from screens that are gone.
      if (originals.size > 300) for (const node of originals.keys()) if (!node.isConnected) originals.delete(node);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else if (!off && observer) {
    observer.disconnect();
    observer = null;
    for (const [node, { text, plain }] of originals) if (node.isConnected && node.nodeValue === plain) node.nodeValue = text;
    originals.clear();
  }
}

function apply() {
  const root = document.documentElement;
  const serious = isSerious();
  const dark = serious || current.mode === 'dark' || (current.mode === 'auto' && phoneDark.matches);
  root.dataset.mode = dark ? 'dark' : 'light';
  root.dataset.theme = current.theme;
  root.dataset.font = current.font;
  root.dataset.size = current.size;
  root.dataset.buddy = serious || current.buddy === 'off' ? 'off' : 'on';
  root.dataset.emoji = serious && current.emoji === 'off' ? 'off' : 'on';
  emojiOff(root.dataset.emoji === 'off');
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
    current = Object.fromEntries(Object.entries(LISTS).map(([key, list]) => [key, pick(list, saved[key], DEFAULTS[key])]));
  } catch {
    // Storage not available: keep the defaults.
  }
  apply();
}

/** Change one or more choices, e.g. setAppearance({ mode: 'dark' }). Applies at once, then saves. */
export async function setAppearance(changes) {
  current = Object.fromEntries(Object.entries(LISTS).map(([key, list]) => [key, pick(list, changes[key] ?? current[key], current[key])]));
  apply();
  await saveSettings('appearance', current);
}
