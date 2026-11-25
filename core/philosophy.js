// 💭 Philosophy: the builder's note to everyone who uses Lifetracker.
// Opened from the small dot button in the title bar ("#/philosophy"). Text only: nothing is read or saved.
import { card, el } from './ui.js';
import { buddy } from './buddy.js';

// The essay, one paragraph per line. While it's empty, the swag buddy holds a "coming soon" banner instead.
const ESSAY = [];

const COMING_SOON = 'Builder is cooking something, it will be worth the wait';

export function render(root) {
  if (ESSAY.length) {
    root.append(card({ children: ESSAY.map((text) => el('p', { text })) }));
    return;
  }
  // 😎 Swag buddy holding up a banner on two poles (poles behind it, hands in front).
  const scene = el('div', { className: 'swag-scene' }, [
    el('div', { className: 'swag-banner' }, [el('p', { className: 'swag-banner__text', text: COMING_SOON })]),
    el('div', { className: 'swag-holder' }, [
      el('span', { className: 'swag-pole swag-pole--left', 'aria-hidden': 'true' }),
      el('span', { className: 'swag-pole swag-pole--right', 'aria-hidden': 'true' }),
      buddy({ size: 150, outfit: 'swag', face: 'content', className: 'swag-buddy' }),
      el('span', { className: 'swag-hand swag-hand--left', 'aria-hidden': 'true' }),
      el('span', { className: 'swag-hand swag-hand--right', 'aria-hidden': 'true' }),
    ]),
  ]);
  root.append(card({ className: 'swag-card', children: [scene] }));
}
