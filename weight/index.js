// ⚖️ weight module screens. Starter screen from CORE-3; WGT-1 builds the real one.
import { card, emptyState, el } from '../core/ui.js';

export function render(root) {
  root.append(el('div', { className: 'mod-weight stack' }, [
    card({
      children: [emptyState({ emoji: '⚖️', title: 'Coming soon', text: 'This screen is on its way.' })],
    }),
  ]));
}
