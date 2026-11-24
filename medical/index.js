// 🩺 medical (Medical log) module screens. Starter screen from CORE-3; MED-1 builds the real one.
import { card, emptyState, el } from '../core/ui.js';

export function render(root) {
  root.append(el('div', { className: 'mod-medical stack' }, [
    card({
      children: [emptyState({ emoji: '🩺', title: 'Coming soon', text: 'This screen is on its way.' })],
    }),
  ]));
}
