// ⚙️ Settings screen: Google Sync (SHEETS-SYNC) and Notifications (CORE-9).
// CORE-8 adds the module goals, "Customise menu" and your name later.
import { card, button, input, el, toast } from './ui.js';
import { getConfig, connect, syncEverything, onStatus } from './sync.js';
import { notificationState, askPermission, notify } from './notify.js';

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

  root.append(
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
    card({
      title: '🔒 Keep it private',
      children: [
        el('p', { className: 'settings-note', text: 'Your LifeTracker Sheets and the LifeTracker folder in Google Drive should stay private. Never share them with "Anyone with the link".' }),
        el('p', { className: 'muted', text: 'The link and key are saved only on this phone, never in the app\'s code or on GitHub. The script only accepts entries; it can\'t send your data back out.' }),
      ],
    }),
  );
}
