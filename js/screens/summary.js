import { h, fmtDate, fmtNum, topWeight, volume, mount } from '../util.js';
import * as db from '../db.js';
import * as st from '../stats.js';

const hasData = (s) => s.weight != null || s.reps != null;
const ARROW = { up: ['▲', 'עלייה'], down: ['▼', 'ירידה'], same: ['＝', 'ללא שינוי'], new: ['★', 'חדש'] };

export async function summaryScreen(root, id) {
  const session = await db.get('sessions', id);
  if (!session) { location.hash = '#/'; return; }
  const all = await db.getSessions();
  const prefs = await db.getPrefs();
  const kg = st.latestBodyWeight(await db.getFields(), await db.getMeasurements());
  const before = st.earlier(all, session);

  const rows = [];
  let prCount = 0;
  for (const ex of session.exercises.filter((e) => e.sets.some(hasData))) {
    const prevInfo = db.lastSetsFor(all, ex.name, session.id, session.date);
    const cmp = st.compare(ex.sets, prevInfo?.sets);
    const history = before.map((s) => s.exercises.find((e) => e.name === ex.name)?.sets || []).filter((x) => x.some(hasData));
    const pr = st.prsFor(ex.sets, history);
    prCount += pr.count;
    const kinds = new Set(pr.flags.flat());
    const tw = topWeight(ex.sets);
    rows.push(h('div', { class: 'sum-row' },
      h('span', { class: `sum-arrow ${cmp}`, role: 'img', 'aria-label': ARROW[cmp][1] }, ARROW[cmp][0]),
      h('div', { class: 'grow' },
        h('b', {}, ex.name),
        h('div', { class: 'muted sum-line' }, `${fmtNum(tw)} ק״ג${prevInfo ? ` (קודם ${fmtNum(topWeight(prevInfo.sets))})` : ''} · נפח ${fmtNum(volume(ex.sets))}${prevInfo ? ` (קודם ${fmtNum(volume(prevInfo.sets))})` : ''}`),
        (kinds.size || pr.volume) ? h('div', { class: 'sum-pr' }, [
          kinds.has('weight') ? '🏆 שיא משקל' : null, kinds.has('reps') ? '🏆 שיא חזרות' : null, pr.volume ? '🏆 שיא נפח' : null].filter(Boolean).join(' · ')) : null)));
  }

  const ms = st.durationMs(session);
  const kcal = st.calories(prefs.met, kg, ms);
  const total = session.exercises.reduce((a, e) => a + volume(e.sets), 0);
  const stat = (label, value, cls) => h('div', { class: `sum-stat ${cls || ''}` }, h('b', {}, value), h('small', {}, label));

  mount(root,
    h('header', { class: 'top' }, h('h1', {}, 'סיכום אימון'), h('small', {}, fmtDate(session.date))),
    h('div', { class: 'card summary' },
      h('div', { class: 'sum-stats' },
        stat('משך', ms != null ? st.fmtDuration(ms) : '—', 'sum-duration'),
        stat('נפח כולל', fmtNum(total)),
        stat('שיאים', String(prCount), 'sum-prs')),
      kcal != null
        ? h('p', { class: 'sum-kcal' }, `≈ ${kcal} קק״ל`, h('small', {}, ' הערכה בלבד — MET × משקל גוף × זמן'))
        : h('p', { class: 'muted sum-kcal' }, 'להערכת קלוריות יש להוסיף משקל גוף במדידות.')),
    h('h2', {}, 'מול הפעם הקודמת'),
    h('div', { class: 'card' }, ...(rows.length ? rows : [h('p', { class: 'empty' }, 'אין נתונים')])),
    h('a', { class: 'btn primary big summary-close', href: '#/' }, 'חזרה לבית'));
}
