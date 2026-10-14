import { h, fmtShort, topWeight, volume, fmtNum, todayISO, mount } from '../util.js';
import * as st from '../stats.js';
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


  // ---- consistency: month calendar + workouts per week ----
  const today = todayISO();
  let cy = +today.slice(0, 4), cm = +today.slice(5, 7) - 1;
  const days = new Set(sessions.filter(st.hasWork).map((s) => s.date));
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const calBox = h('div', { class: 'card cal' });
  function consistency() {
    const weeks = st.weeklyCounts(sessions, today, 12);
    const maxC = Math.max(1, ...weeks.map((w) => w.count));
    const total = weeks.reduce((a, w) => a + w.count, 0);
    const shift = (d) => () => { cm += d; if (cm < 0) { cm = 11; cy--; } if (cm > 11) { cm = 0; cy++; } draw(); };
    const cells = st.monthCells(cy, cm);
    const inMonth = [...days].filter((d) => d.startsWith(`${cy}-${String(cm + 1).padStart(2, '0')}`)).length;
    calBox.replaceChildren(
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חודש קודם', onclick: shift(-1) }, '›'),
        h('b', { class: 'cal-title' }, `${MONTHS[cm]} ${cy}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חודש הבא', onclick: shift(1) }, '‹')),
      h('div', { class: 'cal-grid' },
        ...['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => h('span', { class: 'cal-dow' }, d)),
        ...cells.map((c) => (c ? h('span', { class: `cal-day${days.has(c) ? ' on' : ''}${c === today ? ' today' : ''}`, 'data-date': c }, +c.slice(8)) : h('span')))),
      h('div', { class: 'muted cal-sum' }, `${inMonth} ימי אימון בחודש`),
      h('div', { class: 'weeks' }, ...weeks.map((w) => h('div', { class: 'wk', 'data-count': w.count, title: `${w.count} אימונים` },
        h('i', { style: `height:${Math.round((w.count / maxC) * 100)}%` }), h('small', {}, w.count || '')))),
      h('div', { class: 'muted cal-sum' }, `אימונים בשבוע (12 שבועות אחרונים) · ממוצע ${fmtNum(Math.round((total / 12) * 10) / 10)}`));
    return h('div', {}, h('h2', {}, 'עקביות'), calBox);
  }

  let mode = 'weight';
  let exName = ordered[0];
  let fieldId = fields.find((f) => measurements.some((m) => m.values[f.id] != null))?.id;
  const out = h('div');

  function draw() {
    out.replaceChildren();
    out.append(consistency());
    // Exercises
    out.append(h('h2', {}, 'תרגילים'));
    if (!ordered.length) out.append(h('p', { class: 'empty' }, 'אין עדיין נתוני אימונים.'));
    else {
      const sel = h('select', { class: 'sel', onchange: (e) => { exName = e.target.value; draw(); } },
        ...ordered.map((n) => h('option', { value: n, selected: n === exName }, n)));
      const pts = sessions.map((s) => {
        const ex = s.exercises.find((e) => e.name === exName && e.sets.length);
        if (!ex) return null;
        const v = mode === 'weight' ? topWeight(ex.sets) : mode === 'e1rm' ? st.best1RM(ex.sets) : volume(ex.sets);
        return v > 0 ? { label: fmtShort(s.date), value: v } : null;
      }).filter(Boolean);
      const best = pts.length ? Math.max(...pts.map((p) => p.value)) : null;
      out.append(h('div', { class: 'card' }, sel,
        h('div', { class: 'seg' },
          h('button', { type: 'button', class: mode === 'weight' ? 'on' : '', onclick: () => { mode = 'weight'; draw(); } }, 'משקל מקסימלי'),
          h('button', { type: 'button', class: mode === 'volume' ? 'on' : '', onclick: () => { mode = 'volume'; draw(); } }, 'נפח'),
          h('button', { type: 'button', class: mode === 'e1rm' ? 'on' : '', onclick: () => { mode = 'e1rm'; draw(); } }, '1RM משוער')),
        lineChart(pts, { unit: mode === 'volume' ? '' : 'ק״ג' }),
        best != null ? h('div', { class: 'pr' }, `🏆 שיא: ${fmtNum(best)}${mode === 'volume' ? '' : ' ק״ג'}`) : null,
        mode === 'e1rm' ? h('small', { class: 'muted e1rm-note' }, 'הערכה לפי נוסחת Epley: משקל × (1 + חזרות/30)') : null));
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
  mount(root, h('header', { class: 'top' }, h('h1', {}, 'התקדמות')), out);
}
