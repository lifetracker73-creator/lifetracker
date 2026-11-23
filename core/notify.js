// 🔔 Notifications helper (CORE-9).
// Any module can show a phone notification with `notify()`. If notifications are off, blocked or not
// supported, the same message shows as a soft banner at the top of the app instead.
//
//   notificationState()   → 'on' | 'off' | 'blocked' | 'unsupported'
//   askPermission()       → asks the phone (call it only right after a tap), gives back the new state
//   notify({ title, body, emoji, path, tag })  → 'notification' or 'banner' (which one was shown)
//   showBanner({ title, body, emoji, actionLabel, onAction, path, tag })  → the in-app banner only
//
// `path` is the screen to open when tapped, e.g. 'tasks'. `tag` stops the same message showing twice.
import { el, button } from './ui.js';

const supported = typeof window !== 'undefined' && 'Notification' in window;

export function notificationState() {
  if (!supported) return 'unsupported';
  if (Notification.permission === 'granted') return 'on';
  if (Notification.permission === 'denied') return 'blocked';
  return 'off';
}

export async function askPermission() {
  if (!supported) return 'unsupported';
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (err) {
      console.error(err);
    }
  }
  return notificationState();
}

export async function notify({ title, body = '', emoji = '🔔', path = '', tag } = {}) {
  if (notificationState() === 'on') {
    const options = {
      body,
      tag,
      icon: new URL('icons/icon-192.png', document.baseURI).href,
      data: { path },
    };
    const text = `${emoji ? `${emoji} ` : ''}${title}`;
    try {
      // Phones (Android) only allow notifications through the offline helper (sw.js).
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) {
        await reg.showNotification(text, options);
      } else {
        const n = new Notification(text, options);
        n.onclick = () => { window.focus(); if (path) location.hash = `#/${path}`; n.close(); };
      }
      return 'notification';
    } catch (err) {
      console.error(err); // fall through to the banner
    }
  }
  showBanner({ title, body, emoji, path, tag });
  return 'banner';
}

// ---- in-app banner ----
let stack = null;
function bannerStack() {
  if (!stack || !stack.isConnected) {
    stack = el('div', { className: 'notify-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  return stack;
}

export function showBanner({ title, body = '', emoji = '🔔', actionLabel, onAction, path = '', tag } = {}) {
  const box = bannerStack();
  if (tag) box.querySelector(`[data-tag="${CSS.escape(tag)}"]`)?.remove();
  const label = actionLabel || (path ? 'Open' : '');
  const banner = el('div', { className: 'notify-banner', 'data-tag': tag }, [
    el('span', { className: 'notify-banner__emoji', 'aria-hidden': 'true', text: emoji }),
    el('div', { className: 'notify-banner__text' }, [
      el('p', { className: 'notify-banner__title', text: title }),
      body ? el('p', { className: 'notify-banner__body', text: body }) : null,
      label
        ? button({
          label,
          variant: 'secondary',
          onClick: () => {
            close();
            if (onAction) onAction();
            else if (path) location.hash = `#/${path}`;
          },
        })
        : null,
    ]),
    button({ icon: 'close', variant: 'ghost', ariaLabel: 'Close', onClick: () => close() }),
  ]);
  function close() {
    banner.remove();
    if (!box.childElementCount) box.remove();
  }
  box.append(banner);
  return { close };
}
