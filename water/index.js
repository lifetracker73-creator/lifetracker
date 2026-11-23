// 💧 water module screens.
// WTR-1: quick-add buttons, a custom amount, today's list, delete with Undo.
// WTR-2: today's progress toward the daily goal.
import { card, button, input, list, listItem, emptyState, toast, progressBar, el } from '../core/ui.js';
import { add, remove, restore, listByDate, getSettings } from '../core/storage.js';
import { today, nowTime, formatTime } from '../core/dates.js';
import { formatMl } from '../core/format.js';

const DEFAULTS = { dailyGoalMl: 2500, quickAmounts: [250, 500, 750] };
const MAX_ML = 5000; // one entry above this is almost surely a typo

export async function render(root) {
  const settings = await getSettings('water', DEFAULTS);

  const listBox = el('div');

  // Today's progress toward the goal (WTR-2). Worked out on screen; nothing extra is stored.
  const goalMl = settings.dailyGoalMl > 0 ? settings.dailyGoalMl : DEFAULTS.dailyGoalMl;
  const bar = progressBar({ value: 0, max: goalMl, label: 'Water today toward your goal' });
  const amountText = el('span', { className: 'progress-stats__amount' });
  const percentText = el('span', { className: 'progress-stats__percent' });
  const noteText = el('p', { className: 'progress-note' });

  function showProgress(totalMl) {
    const percent = Math.round((totalMl / goalMl) * 100);
    bar.set(totalMl, goalMl);
    amountText.textContent = `${formatMl(totalMl)} of ${formatMl(goalMl)}`;
    percentText.textContent = `${percent}%`;
    noteText.textContent = totalMl >= goalMl
      ? 'Goal reached! 🎉'
      : `${formatMl(goalMl - totalMl)} to go`;
  }

  async function refresh() {
    const entries = await listByDate('water', today());
    showProgress(entries.reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0));
    entries.sort((a, b) => (b.time.localeCompare(a.time)) || b.createdAt.localeCompare(a.createdAt));
    if (!entries.length) {
      listBox.replaceChildren(emptyState({
        emoji: '💧',
        title: 'No water yet today',
        text: 'Tap a button above to add a glass.',
      }));
      return;
    }
    listBox.replaceChildren(list(entries.map((entry) => listItem({
      title: formatMl(entry.amountMl),
      subtitle: formatTime(entry.time),
      actions: [button({
        icon: 'trash',
        variant: 'ghost',
        ariaLabel: `Delete ${formatMl(entry.amountMl)} at ${formatTime(entry.time)}`,
        onClick: () => deleteEntry(entry),
      })],
    }))));
  }

  async function logWater(amountMl) {
    await add('water', { date: today(), time: nowTime(), amountMl });
    await refresh();
  }

  async function deleteEntry(entry) {
    const removed = await remove('water', entry.id);
    await refresh();
    if (!removed) return;
    toast({
      message: `Deleted ${formatMl(removed.amountMl)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restore('water', removed);
        if (listBox.isConnected) await refresh();
      },
    });
  }

  // Quick-add buttons
  const quickRow = el('div', { className: 'btn-row' }, settings.quickAmounts.map((ml) => button({
    label: `+${formatMl(ml)}`,
    variant: 'primary',
    ariaLabel: `Add ${formatMl(ml)}`,
    onClick: () => logWater(ml),
  })));

  // Custom amount
  const amountField = input({
    label: 'Other amount (ml)',
    name: 'amountMl',
    type: 'number',
    inputmode: 'numeric',
    min: 1,
    max: MAX_ML,
    step: 1,
    placeholder: 'e.g. 300',
  });
  const form = el('form', { className: 'stack', novalidate: true }, [
    amountField,
    button({ label: 'Add', icon: 'plus', variant: 'primary', type: 'submit', block: true }),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = amountField.input.value.trim();
    const ml = Number(text);
    if (!text || !Number.isInteger(ml) || ml <= 0) {
      amountField.setError('Type a whole number of ml above 0.');
      return;
    }
    if (ml > MAX_ML) {
      amountField.setError(`That's a lot! Please enter ${formatMl(MAX_ML)} or less.`);
      return;
    }
    amountField.setError('');
    amountField.input.value = '';
    await logWater(ml);
  });
  amountField.input.addEventListener('input', () => amountField.setError(''));

  root.append(el('div', { className: 'mod-water stack' }, [
    card({ title: "Today's progress", module: 'water', children: [bar, el('div', { className: 'progress-stats' }, [amountText, percentText]), noteText] }),
    card({ title: 'Add water', module: 'water', children: [el('div', { className: 'stack' }, [quickRow, form])] }),
    card({ title: 'Today', children: [listBox] }),
  ]));

  await refresh();
}
