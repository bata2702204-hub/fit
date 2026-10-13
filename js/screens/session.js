import { h, num, fmtNum, setsText, fmtDate, todayISO, confirmDialog } from '../util.js';
import * as db from '../db.js';

export async function sessionScreen(root, id) {
  const session = await db.get('sessions', id);
  if (!session) { location.hash = '#/'; return; }
  const all = await db.getSessions();

  let timer;
  const save = () => { clearTimeout(timer); timer = setTimeout(() => db.put('sessions', session), 150); };
  const saveNow = () => { clearTimeout(timer); return db.put('sessions', session); };

  const dateInput = h('input', { type: 'date', value: session.date, class: 'date-input', onchange: (e) => { session.date = e.target.value || todayISO(); save(); } });

  const list = h('div', { class: 'ex-list' });

  function setRow(ex, set, i, prev, rerender) {
    const w = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', placeholder: prev[i]?.weight != null ? fmtNum(prev[i].weight) : 'ק״ג', value: fmtNum(set.weight), 'aria-label': 'משקל' });
    const r = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', placeholder: prev[i]?.reps != null ? fmtNum(prev[i].reps) : 'חזרות', value: fmtNum(set.reps), 'aria-label': 'חזרות' });
    w.addEventListener('input', () => { set.weight = num(w.value); save(); });
    r.addEventListener('input', () => { set.reps = num(r.value); save(); });
    const step = (d) => () => { set.weight = Math.max(0, Math.round(((set.weight || 0) + d) * 100) / 100); w.value = fmtNum(set.weight); save(); };
    return h('div', { class: 'set-row' },
      h('span', { class: 'set-n' }, i + 1),
      h('button', { class: 'step', type: 'button', onclick: step(-2.5), 'aria-label': 'הפחת 2.5' }, '−'),
      w,
      h('button', { class: 'step', type: 'button', onclick: step(2.5), 'aria-label': 'הוסף 2.5' }, '+'),
      h('span', { class: 'x' }, '×'),
      r,
      h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'מחק סט', onclick: () => { ex.sets.splice(i, 1); save(); rerender(); } }, '✕'));
  }

  function exCard(ex) {
    const prevInfo = db.lastSetsFor(all, ex.name, session.id);
    const prev = prevInfo ? prevInfo.sets : [];
    const body = h('div', { class: 'ex-body' });
    const card = h('section', { class: 'card ex' });
    const rerender = () => {
      body.replaceChildren(
        ...ex.sets.map((s, i) => setRow(ex, s, i, prev, rerender)),
        h('button', { class: 'btn add-set', type: 'button', onclick: () => {
          const last = ex.sets[ex.sets.length - 1];
          const src = last || prev[0] || {};
          const idxPrev = prev[ex.sets.length];
          const base = last || idxPrev || src;
          ex.sets.push({ weight: base.weight ?? null, reps: base.reps ?? null });
          save(); rerender();
          const rows = body.querySelectorAll('.set-row');
          rows[rows.length - 1]?.querySelector('input')?.focus();
        } }, '＋ סט'));
      const done = ex.sets.filter((s) => s.weight != null || s.reps != null).length;
      badge.textContent = done ? `${done} סטים` : '';
    };
    const badge = h('span', { class: 'badge' });
    const head = h('button', { class: 'ex-head', type: 'button', onclick: () => card.classList.toggle('collapsed') },
      h('span', { class: 'ex-name' }, ex.name), badge, h('span', { class: 'chev' }, '▾'));
    card.append(head,
      h('div', { class: 'prev' }, prevInfo ? `פעם קודמת (${fmtDate(prevInfo.date)}): ${setsText(prevInfo.sets)}` : 'פעם ראשונה בתרגיל הזה'),
      body);
    rerender();
    return card;
  }

  for (const ex of session.exercises) list.append(exCard(ex));

  const doneBtn = h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
    session.done = true;
    await saveNow();
    location.hash = '#/';
  } }, session.done ? 'שמור וסגור' : 'סיים אימון');

  const delBtn = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmDialog('למחוק את האימון הזה?')) {
      clearTimeout(timer);
      await db.del('sessions', session.id);
      location.hash = '#/history';
    }
  } }, 'מחק אימון');

  const addEx = h('button', { class: 'btn', type: 'button', onclick: () => {
    const name = prompt('שם התרגיל:');
    if (!name || !name.trim()) return;
    const ex = { name: name.trim(), sets: [] };
    session.exercises.push(ex);
    list.append(exCard(ex));
    save();
  } }, '＋ תרגיל חד־פעמי');

  root.replaceChildren(
    h('header', { class: 'top' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה', onclick: async () => { await saveNow(); history.length > 1 ? history.back() : (location.hash = '#/'); } }, '›'),
      h('h1', {}, session.workoutName || `אימון ${session.workoutId}`),
      dateInput),
    list, addEx, h('div', { class: 'actions' }, doneBtn, delBtn));

  window.__leave = () => saveNow();
}
