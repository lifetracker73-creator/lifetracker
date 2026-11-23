// Lifetracker charts (CORE-6).
// The ONLY place that touches Chart.js (saved locally in core/vendor/chart.umd.min.js).
// Modules call barChart() or lineChart() and get charts in the house style:
// Nunito font, the module's pastel colour, rounded bars, soft grid, light/dark mode,
// no animation when the phone asks for reduced motion.
//
// Usage:
//   const chart = await barChart(box, {
//     module: 'water',
//     labels: ['2026-11-18', ...],      // 'YYYY-MM-DD' dates show as "18 Nov"; other text shows as is
//     values: [2000, 2600, null, ...],  // null = no data that day
//     goal: 2500, goalLabel: 'Goal',    // optional dashed goal line
//     format: (v) => formatMl(v),       // optional: how numbers show in tooltips and the side axis
//   });
//   const chart = await lineChart(box, {
//     module: 'weight', labels,
//     series: [
//       { label: 'Weight', values },
//       { label: '7-day average', values: avg, style: 'average' },  // softer dashed line
//     ],
//     goal: 70, format: (v) => formatKg(v),
//   });
//   chart.update({ labels, values })  or  chart.update({ labels, series })  (also { height })
//   chart.destroy()
// `box` is any empty element; the chart fills its width and is 220px tall (pass height to change).
// Labels can also be months ('2026-11' shows as "Nov", "Nov 2026" when tapped) or any text
// (long text is shortened on the axis, shown in full when tapped).
// Bar charts can lie sideways with `horizontal: true` (e.g. one bar per category); no goal line then.

import { formatDate, formatMonth } from './dates.js';

let loading = null;

// Loads Chart.js once, from the app's own files (works offline).
function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/chart.umd.min.js', import.meta.url).href;
      script.onload = () => resolve(window.Chart);
      script.onerror = () => { loading = null; reject(new Error('Chart tool did not load')); };
      document.head.appendChild(script);
    });
  }
  return loading;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const MAX_LABEL = 14; // longer text labels are shortened on the axis

// '2026-11-23' -> "23 Nov" (short, so 30 days fit on a phone); '2026-11' -> "Nov".
// Long text is shortened with "…". Other labels unchanged.
function shortLabel(label) {
  if (typeof label !== 'string') return label;
  if (DATE_RE.test(label)) return formatDate(label).split(' ').slice(0, 2).join(' ');
  if (MONTH_RE.test(label)) return formatMonth(label).split(' ')[0];
  const chars = [...label];
  return chars.length > MAX_LABEL ? `${chars.slice(0, MAX_LABEL - 1).join('').trimEnd()}…` : label;
}

function fullLabel(label) {
  if (typeof label !== 'string') return label;
  if (DATE_RE.test(label)) return formatDate(label);
  if (MONTH_RE.test(label)) return formatMonth(label);
  return label;
}

// ---- Colours from styles.css (so modules never invent colours) ----

function cssVar(el, name) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function toRgb(color) {
  const c = color.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(c)) {
    return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  }
  const m = color.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : [205, 184, 255];
}

function mix(a, b, amountOfB) {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const f = (x, y) => Math.round(x + (y - x) * amountOfB);
  return `rgb(${f(r1, r2)}, ${f(g1, g2)}, ${f(b1, b2)})`;
}

function alpha(color, a) {
  const [r, g, b] = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Reads the theme each time a chart is drawn or the phone switches light/dark.
function readTheme(holder) {
  const accent = cssVar(holder, '--accent') || cssVar(holder, '--color-primary');
  const text = cssVar(holder, '--color-text');
  const muted = cssVar(holder, '--color-text-muted');
  const ink = cssVar(holder, '--color-on-accent');
  const surface = cssVar(holder, '--color-surface');
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    accent,
    surface,
    // Lines need a little more depth than the pastel so they show on the card:
    // a touch darker on light cards, a touch lighter on dark cards.
    line: dark ? mix(accent, text, 0.35) : mix(accent, ink, 0.35),
    soft: dark ? mix(accent, muted, 0.4) : mix(accent, muted, 0.25),
    grid: alpha(muted, 0.15),
    goal: muted,
    text,
    muted,
    tooltipBg: text,
    tooltipText: surface,
    font: cssVar(holder, '--font-family') || 'system-ui, sans-serif',
  };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Small built-in add-on that draws the dashed goal line with its label.
const goalLinePlugin = {
  id: 'ltGoalLine',
  afterDatasetsDraw(chart, _args, opts) {
    if (opts == null || opts.value == null || !Number.isFinite(opts.value)) return;
    const y = chart.scales.y.getPixelForValue(opts.value);
    const { left, right, top, bottom } = chart.chartArea;
    if (y < top || y > bottom) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    if (opts.label) {
      ctx.setLineDash([]);
      ctx.font = `700 11px ${opts.font}`;
      // Small rounded backing in the card colour so the label stays readable over bars.
      const w = ctx.measureText(opts.label).width + 10;
      const boxTop = Math.max(top, y - 19);
      ctx.fillStyle = opts.surface;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(right - w, boxTop, w, 16, 8);
      else ctx.rect(right - w, boxTop, w, 16);
      ctx.fill();
      ctx.fillStyle = opts.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.label, right - 5, boxTop + 8.5);
    }
    ctx.restore();
  },
};

function buildOptions(theme, { format, goal, goalLabel, showLegend, beginAtZero, horizontal }) {
  const fmt = (v) => (format ? format(v) : new Intl.NumberFormat('en-IN').format(v));
  const font = { family: theme.font, size: 12 };
  // Sideways bars: labels go down the left, numbers along the bottom.
  const labelAxis = horizontal ? 'y' : 'x';
  const valueAxis = horizontal ? 'x' : 'y';
  if (horizontal) goal = null;
  return {
    indexAxis: labelAxis,
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion() ? false : { duration: 500, easing: 'easeOutQuart' },
    layout: { padding: { top: 8, right: horizontal ? 12 : 0 } },
    interaction: { mode: 'index', axis: labelAxis, intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom',
        labels: { color: theme.muted, font, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14 },
      },
      tooltip: {
        backgroundColor: theme.tooltipBg,
        titleColor: theme.tooltipText,
        bodyColor: theme.tooltipText,
        titleFont: { ...font, weight: '700' },
        bodyFont: font,
        padding: 10,
        cornerRadius: 12,
        displayColors: showLegend,
        usePointStyle: true,
        callbacks: {
          title: (items) => (items.length ? String(fullLabel(items[0].chart.data.labels[items[0].dataIndex])) : ''),
          label: (item) => {
            const v = item.parsed[valueAxis];
            const text = v == null ? '—' : fmt(v);
            return showLegend ? ` ${item.dataset.label}: ${text}` : ` ${text}`;
          },
        },
      },
      ltGoalLine: goal == null ? null : {
        value: goal, label: goalLabel || '', color: theme.goal, font: theme.font, surface: theme.surface,
      },
    },
    scales: {
      [labelAxis]: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: theme.muted,
          font,
          maxRotation: 0,
          autoSkip: !horizontal, // sideways: every category keeps its label
          autoSkipPadding: 12,
          callback(value) { return shortLabel(this.getLabelForValue(value)); },
        },
      },
      [valueAxis]: {
        beginAtZero,
        grace: '8%',
        grid: { color: theme.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          color: theme.muted, font, padding: 8, maxRotation: 0,
          maxTicksLimit: horizontal ? 4 : 5, callback: (v) => fmt(v),
        },
        // Make sure the goal line always fits on the chart.
        suggestedMax: goal == null ? undefined : goal,
        suggestedMin: goal == null || beginAtZero ? undefined : goal,
      },
    },
  };
}

function barDataset(theme, values, label) {
  return {
    label: label || '',
    data: values,
    backgroundColor: theme.accent,
    hoverBackgroundColor: theme.line,
    borderWidth: 0,
    borderRadius: 8,
    borderSkipped: false,
    maxBarThickness: 28,
    categoryPercentage: 0.8,
    barPercentage: 0.85,
  };
}

function lineDataset(theme, s, index) {
  const average = s.style === 'average';
  const color = average ? theme.soft : theme.line;
  return {
    label: s.label || '',
    data: s.values,
    borderColor: color,
    backgroundColor: color,
    borderWidth: average ? 2 : 3,
    borderDash: average ? [6, 5] : [],
    tension: 0.35,
    spanGaps: true,
    pointRadius: average || s.values.length > 60 ? 0 : 3, // long views: line only, dots would crowd
    pointHoverRadius: 6,
    pointBackgroundColor: color,
    pointBorderWidth: 0,
    fill: !average && index === 0 ? { target: 'origin' } : false,
    // Soft pastel wash under the main line.
    ...(index === 0 && !average ? { backgroundColor: alpha(theme.accent, 0.35), pointBackgroundColor: color } : {}),
  };
}

// Text that screen readers hear instead of the picture.
function describe(labels, valuesList, format) {
  const fmt = (v) => (format ? format(v) : new Intl.NumberFormat('en-IN').format(v));
  const first = labels.length ? fullLabel(labels[0]) : '';
  const last = labels.length ? fullLabel(labels[labels.length - 1]) : '';
  const nums = valuesList.flat().filter((v) => v != null && Number.isFinite(v));
  if (!nums.length) return `Chart from ${first} to ${last}: no data yet`;
  return `Chart from ${first} to ${last}. Lowest ${fmt(Math.min(...nums))}, highest ${fmt(Math.max(...nums))}`;
}

async function makeChart(box, type, config) {
  const Chart = await loadChartJs();
  const {
    module, labels = [], values = [], series = [], label, goal = null, goalLabel,
    format, height = 220, beginAtZero = type === 'bar', horizontal = false,
  } = config;
  const optionsFor = (t) => buildOptions(t, {
    format, goal, goalLabel, showLegend, beginAtZero, horizontal: type === 'bar' && horizontal,
  });

  box.replaceChildren();
  box.classList.add('chart-box');
  if (module) box.classList.add(`mod-${module}`);
  box.style.height = `${height}px`;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  box.appendChild(canvas);

  let state = { labels, values, series };

  const datasetsFor = (theme) => (type === 'bar'
    ? [barDataset(theme, state.values, label)]
    : state.series.map((s, i) => lineDataset(theme, s, i)));
  const showLegend = type === 'line' && state.series.length > 1;
  const valuesList = () => (type === 'bar' ? [state.values] : state.series.map((s) => s.values));

  let theme = readTheme(box);
  const chart = new Chart(canvas, {
    type,
    data: { labels: state.labels, datasets: datasetsFor(theme) },
    options: optionsFor(theme),
    plugins: [goalLinePlugin],
  });
  canvas.setAttribute('aria-label', describe(state.labels, valuesList(), format));

  // Redraw in the new colours when the phone switches light/dark mode.
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  const retheme = () => {
    theme = readTheme(box);
    chart.data.datasets = datasetsFor(theme);
    chart.options = optionsFor(theme);
    chart.update('none');
  };
  scheme.addEventListener('change', retheme);

  return {
    update(next = {}) {
      state = { ...state, ...next };
      if (next.height) box.style.height = `${next.height}px`;
      chart.data.labels = state.labels;
      chart.data.datasets = datasetsFor(theme);
      chart.update();
      canvas.setAttribute('aria-label', describe(state.labels, valuesList(), format));
    },
    destroy() {
      scheme.removeEventListener('change', retheme);
      chart.destroy();
      box.replaceChildren();
    },
  };
}

/** Bar chart in the house style. See the usage notes at the top of this file. */
export function barChart(box, config) {
  return makeChart(box, 'bar', config);
}

/** Line chart (one or more lines) in the house style. See the usage notes at the top. */
export function lineChart(box, config) {
  return makeChart(box, 'line', config);
}
