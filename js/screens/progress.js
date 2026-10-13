import { h, fmtShort, topWeight, volume, fmtNum } from '../util.js';
import { lineChart } from '../chart.js';
import * as db from '../db.js';

export async function progressScreen(root) {
  const sessions = (await db.getSessions()).slice().reverse(); // oldest first
  const fields = await db.getFields();
  const measurements = (await db.getMeasurements()).slice().reverse();

  const names = [];
  for (const s of sessions) for (const e of s.exercises) if (e.sets.length && !names.includes(e.name)) names.push(e.name);
  // include current workout order for stable listing
  const workouts = await db.getWorkouts();
  const ordered = [...new Set([...workouts.flatMap((w) => w.exercises.map((e) => e.name)), ...names])].filter((n) => names.includes(n));

  let mode = 'weight';
  let exName = ordered[0];
  let fieldId = fields.find((f) => measurements.some((m) => m.values[f.id] != null))?.id;
  const out = h('div');

  function draw() {
    out.replaceChildren();
    // Exercises
    out.append(h('h2', {}, 'תרגילים'));
    if (!ordered.length) out.append(h('p', { class: 'empty' }, 'אין עדיין נתוני אימונים.'));
    else {
      const sel = h('select', { class: 'sel', onchange: (e) => { exName = e.target.value; draw(); } },
        ...ordered.map((n) => h('option', { value: n, selected: n === exName }, n)));
      const pts = sessions.map((s) => {
        const ex = s.exercises.find((e) => e.name === exName && e.sets.length);
        if (!ex) return null;
        const v = mode === 'weight' ? topWeight(ex.sets) : volume(ex.sets);
        return v > 0 ? { label: fmtShort(s.date), value: v } : null;
      }).filter(Boolean);
      const best = pts.length ? Math.max(...pts.map((p) => p.value)) : null;
      out.append(h('div', { class: 'card' }, sel,
        h('div', { class: 'seg' },
          h('button', { type: 'button', class: mode === 'weight' ? 'on' : '', onclick: () => { mode = 'weight'; draw(); } }, 'משקל מקסימלי'),
          h('button', { type: 'button', class: mode === 'volume' ? 'on' : '', onclick: () => { mode = 'volume'; draw(); } }, 'נפח (משקל×חזרות)')),
        lineChart(pts, { unit: mode === 'weight' ? 'ק״ג' : '' }),
        best != null ? h('div', { class: 'pr' }, `🏆 שיא: ${fmtNum(best)}${mode === 'weight' ? ' ק״ג' : ''}`) : null));
    }
    // Measurements
    out.append(h('h2', {}, 'מדידות גוף'));
    if (!fieldId) out.append(h('p', { class: 'empty' }, 'אין עדיין מדידות.'));
    else {
      const f = fields.find((x) => x.id === fieldId);
      const sel = h('select', { class: 'sel', onchange: (e) => { fieldId = e.target.value; draw(); } },
        ...fields.map((x) => h('option', { value: x.id, selected: x.id === fieldId }, x.name)));
      const pts = measurements.filter((m) => m.values[fieldId] != null).map((m) => ({ label: fmtShort(m.date), value: m.values[fieldId] }));
      out.append(h('div', { class: 'card' }, sel, lineChart(pts, { unit: f?.unit })));
    }
  }
  draw();
  root.replaceChildren(h('header', { class: 'top' }, h('h1', {}, 'התקדמות')), out);
}
