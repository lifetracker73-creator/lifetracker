// 👋 First-time welcome (REFINE-4): the very first time the app opens, only the 🍄 buddy shows.
// It asks "Hey there! What's your good name?", then what you'd like to call it (or Skip),
// and then Home appears. Your name is saved in the same place as Settings → 👋 You, with
// `welcomed: true` so the welcome never comes back (even if you clear your name later).

import { el, button, input } from './ui.js';
import { getSettings, saveSettings } from './storage.js';
import { buddy, setBuddyName } from './buddy.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when this phone hasn't been welcomed yet (no welcome note and no name saved). */
export async function needsWelcome() {
  const profile = await getSettings('profile', { name: '', welcomed: false });
  return !profile.welcomed && !(profile.name || '').trim();
}

/** Shows the welcome screen; resolves once it's finished and gone. */
export function welcome() {
  return new Promise((resolve) => {
    const friend = buddy({ size: 160, face: 'happy' });
    friend.setAttribute('aria-hidden', 'true');
    const bubble = el('p', { className: 'welcome__bubble', 'aria-live': 'polite' });
    const formBox = el('div', { className: 'welcome__form' });
    const screen = el('section', { className: 'welcome', 'aria-label': 'Welcome' }, [
      bubble,
      el('div', { className: 'welcome__buddy' }, [
        friend,
        el('span', { className: 'welcome__wave', 'aria-hidden': 'true', text: '👋' }),
      ]),
      formBox,
    ]);
    document.body.append(screen);
    requestAnimationFrame(() => friend.hop());

    const say = (text) => { bubble.textContent = text; };
    const clean = (value) => value.trim().replace(/\s+/g, ' ');

    // A name box with a button that only wakes up once something is typed.
    function nameForm({ label, placeholder, maxLength, autocomplete, submitLabel, onSave, skip }) {
      const field = input({ label, name: 'name', placeholder });
      field.input.maxLength = maxLength;
      if (autocomplete) field.input.setAttribute('autocomplete', autocomplete);
      const go = button({ label: submitLabel, variant: 'primary', type: 'submit', block: true, disabled: true });
      field.input.addEventListener('input', () => { go.disabled = !clean(field.input.value); });
      const form = el('form', { className: 'stack', novalidate: true }, [
        field,
        go,
        skip ? button({ label: 'Skip', variant: 'ghost', block: true, onClick: skip }) : null,
      ]);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = clean(field.input.value);
        if (!name) return;
        go.disabled = true;
        onSave(name);
      });
      formBox.replaceChildren(form);
      setTimeout(() => field.input.focus(), 300);
    }

    async function finish() {
      formBox.replaceChildren();
      await wait(1400);
      screen.classList.add('welcome--out');
      await wait(350);
      screen.remove();
      resolve();
    }

    function askBuddyName(yourName) {
      say(`Nice to meet you, ${yourName}! 🌸 And what would you like to call me?`);
      nameForm({
        label: "Buddy's name",
        placeholder: 'e.g. Mochi',
        maxLength: 20,
        submitLabel: 'Save name ✨',
        onSave: async (name) => {
          await setBuddyName(name);
          friend.hop();
          say(`Yay! I'm ${name} now 🍄 Let's go!`);
          await finish();
        },
        skip: async () => {
          friend.hop();
          say("That's okay! You can name me later in Settings 🍄");
          await finish();
        },
      });
    }

    say("Hey there! What's your good name?");
    nameForm({
      label: 'Your name',
      placeholder: 'e.g. Asha',
      maxLength: 30,
      autocomplete: 'given-name',
      submitLabel: "Let's go ✨",
      onSave: async (name) => {
        await saveSettings('profile', { name, welcomed: true });
        friend.hop();
        formBox.replaceChildren();
        say(`Nice to meet you, ${name}! 🌸`);
        await wait(1300);
        askBuddyName(name);
      },
    });
  });
}
