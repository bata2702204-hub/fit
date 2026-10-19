import { h, fmtShort, topWeight, volume, fmtNum, todayISO, mount } from '../util.js';
import * as st from '../stats.js';
import { lineChart, sparkline } from '../chart.js';
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

  // ---- monthly overview ----
  let ovY = cy, ovM = cm;
  const ovBox = h('div', { class: 'card overview' });
  const sign = (n) => (n > 0 ? '+' : '');
  const vs = (cur, prev) => `${fmtNum(Math.round(cur))} (חודש קודם: ${fmtNum(Math.round(prev))})`;
  function overview() {
    const key = st.monthKey(ovY, ovM), p = st.prevMonth(ovY, ovM);
    const o = st.monthlyOverview(sessions, key, st.monthKey(p.y, p.m));
    const shift = (d) => () => { ovM += d; if (ovM < 0) { ovM = 11; ovY--; } if (ovM > 11) { ovM = 0; ovY++; } draw(); };
    const maxAbs = Math.max(1, ...o.exercises.map((e) => Math.abs(e.change || 0)));
    ovBox.setAttribute('data-month', key);
    ovBox.replaceChildren(
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חודש קודם (סיכום)', onclick: shift(-1) }, '›'),
        h('b', { class: 'ov-title' }, `${MONTHS[ovM]} ${ovY}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חודש הבא (סיכום)', onclick: shift(1) }, '‹')),
      !o.exercises.length ? h('p', { class: 'empty ov-empty' }, 'אין אימונים בחודש הזה.') : h('div', {},
        h('div', { class: 'ov-summary' },
          h('div', { class: 'ov-counts' },
            h('span', { class: 'up' }, `${o.improved} השתפרו`), h('span', { class: 'same' }, `${o.same} ללא שינוי`), h('span', { class: 'down' }, `${o.dropped} ירדו`)),
          h('div', { class: 'muted' }, `אימונים: ${o.workouts} (חודש קודם: ${o.prevWorkouts})`),
          h('div', { class: 'muted' }, `נפח כולל: ${vs(o.volume, o.prevVolume)}`)),
        h('div', { class: 'ov-bars' }, ...o.exercises.map((e) => h('div', { class: 'ov-bar-row', 'data-name': e.name },
          h('div', { class: 'ov-bar-label' }, h('span', {}, e.name),
            h('b', { class: e.trend || 'none' }, e.change == null ? 'אין מספיק נתונים' : `${sign(e.change)}${fmtNum(e.change)}%`)),
          e.change == null ? null : h('div', { class: 'ov-track' },
            h('i', { class: `ov-bar ${e.trend}`, style: `${e.change >= 0 ? 'left' : 'right'}:50%;width:${e.change === 0 ? 1 : Math.max(2, (Math.abs(e.change) / maxAbs) * 50)}%` }))))),
        h('div', { class: 'ov-rows' }, ...o.exercises.map((e) => h('div', { class: 'ov-row', 'data-name': e.name },
          h('div', { class: 'ov-main' }, h('b', {}, e.name),
            h('span', { class: 'ov-range' }, e.change == null ? 'אין מספיק נתונים' : `${fmtNum(e.start)} → ${fmtNum(e.end)} ק״ג`)),
          h('div', { class: 'muted ov-meta' },
            `סטים: ${e.sets} (קודם ${e.prevSets}) · נפח: ${fmtNum(Math.round(e.volume))} (קודם ${fmtNum(Math.round(e.prevVolume))})`),
          sparkline(e.tops))))));
    return h('div', {}, h('h2', {}, 'סיכום חודשי'), ovBox);
  }

  let mode = 'weight';
  let exName = ordered[0];
  let fieldId = fields.find((f) => measurements.some((m) => m.values[f.id] != null))?.id;
  const out = h('div');

  function draw() {
    out.replaceChildren();
    out.append(overview());
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
