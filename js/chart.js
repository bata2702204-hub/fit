// Minimal SVG line chart. points: [{label, value}]
const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

export function lineChart(points, { unit = '' } = {}) {
  const W = 340, H = 200, pl = 36, pr = 12, pt = 14, pb = 26;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  if (!points.length) {
    svg.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-empty' }, 'אין נתונים עדיין'));
    return svg;
  }
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;
  const x = (i) => (points.length === 1 ? (pl + W - pr) / 2 : pl + (i * (W - pl - pr)) / (points.length - 1));
  const y = (v) => pt + ((max - v) / (max - min)) * (H - pt - pb);

  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    svg.append(s('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(s('text', { x: pl - 5, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, Math.round(v * 10) / 10));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  svg.append(s('path', { d, class: 'line' }));
  points.forEach((p, i) => {
    svg.append(s('circle', { cx: x(i), cy: y(p.value), r: 4, class: 'dot' }));
  });
  // x labels: first, middle, last
  const idxs = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  for (const i of idxs) {
    svg.append(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'axis' }, points[i].label));
  }
  // last value label
  const last = points[points.length - 1];
  svg.append(s('text', { x: Math.min(x(points.length - 1) + 4, W - 2), y: y(last.value) - 8, 'text-anchor': 'end', class: 'val' }, `${Math.round(last.value * 100) / 100}${unit ? ' ' + unit : ''}`));
  return svg;
}
