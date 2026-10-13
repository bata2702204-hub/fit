import { h, num, fmtNum, setsText, fmtDate, todayISO, confirmDialog, cleanDecimal, toast } from '../util.js';
import * as db from '../db.js';

const hasData = (s) => s.weight != null || s.reps != null;

export async function sessionScreen(root, id) {
  const session = await db.get('sessions', id);
  if (!session) { location.hash = '#/'; return; }
  const all = await db.getSessions();

  let timer;
  let lastAddAt = 0; // taps right after adding a set are ignored: the layout shifts and a double tap would hit a stepper
  const tooSoon = () => Date.now() - lastAddAt < 400;
  let deleted = false; // once deleted, never write the session back (route-leave autosave would resurrect it)
  const save = () => { if (deleted) return; clearTimeout(timer); timer = setTimeout(() => db.put('sessions', session), 150); };
  // flush a pending autosave if the page is closed/reloaded within the debounce window
  const flush = () => { if (!deleted && timer) { clearTimeout(timer); db.put('sessions', session); } };
  window.addEventListener('pagehide', flush);

  // Called whenever the user leaves the screen: drop blank sets, and drop sessions that never got any data.
  async function leave() {
    window.removeEventListener('pagehide', flush);
    clearTimeout(timer);
    if (deleted) return;
    for (const ex of session.exercises) ex.sets = ex.sets.filter(hasData);
    if (!session.exercises.some((e) => e.sets.length)) {
      deleted = true;
      await db.del('sessions', session.id);
      return;
    }
    await db.put('sessions', session);
  }

  const dateInput = h('input', { type: 'date', value: session.date, class: 'date-input', 'aria-label': 'תאריך אימון', onchange: (e) => {
    if (!e.target.value) { e.target.value = session.date; return; } // an empty date is not allowed
    session.date = e.target.value; save();
  } });

  const list = h('div', { class: 'ex-list' });

  function setRow(ex, set, i, prev, rerender) {
    const w = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', maxlength: 7, placeholder: prev[i]?.weight != null ? fmtNum(prev[i].weight) : 'ק״ג', value: fmtNum(set.weight), 'aria-label': 'משקל' });
    const r = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', maxlength: 3, placeholder: prev[i]?.reps != null ? fmtNum(prev[i].reps) : 'חזרות', value: fmtNum(set.reps), 'aria-label': 'חזרות' });
    w.addEventListener('input', () => { w.value = cleanDecimal(w.value); set.weight = num(w.value); save(); });
    r.addEventListener('input', () => { r.value = r.value.replace(/\D/g, ''); set.reps = num(r.value); save(); });
    for (const el of [w, r]) el.addEventListener('focus', () => setTimeout(() => el.select(), 0));
    const step = (d) => () => { if (tooSoon()) return; set.weight = Math.max(0, Math.round(((set.weight || 0) + d) * 100) / 100); w.value = fmtNum(set.weight); save(); };
    return h('div', { class: 'set-row' },
      h('span', { class: 'set-n' }, i + 1),
      h('button', { class: 'step', type: 'button', onclick: step(-2.5), 'aria-label': 'הפחת 2.5' }, '−'),
      w,
      h('button', { class: 'step', type: 'button', onclick: step(2.5), 'aria-label': 'הוסף 2.5' }, '+'),
      h('span', { class: 'x' }, '×'),
      r,
      h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'מחק סט', onclick: () => {
        if (tooSoon()) return;
        const [removed] = ex.sets.splice(i, 1);
        save(); rerender();
        toast('הסט נמחק', { label: 'בטל', onClick: () => { ex.sets.splice(i, 0, removed); save(); rerender(); } });
      } }, '✕'));
  }

  function exCard(ex) {
    const prevInfo = db.lastSetsFor(all, ex.name, session.id, session.date);
    const prev = prevInfo ? prevInfo.sets : [];
    const body = h('div', { class: 'ex-body' });
    const card = h('section', { class: 'card ex' });
    const rerender = () => {
      body.replaceChildren(
        ...ex.sets.map((s, i) => setRow(ex, s, i, prev, rerender)),
        h('button', { class: 'btn add-set', type: 'button', onclick: () => {
          if (tooSoon()) return;
          lastAddAt = Date.now();
          const last = ex.sets[ex.sets.length - 1];
          const base = last || prev[ex.sets.length] || prev[0] || {};
          ex.sets.push({ weight: base.weight ?? null, reps: base.reps ?? null });
          save(); rerender();
          const rows = body.querySelectorAll('.set-row');
          rows[rows.length - 1]?.querySelector('input')?.focus();
        } }, '＋ סט'));
      const done = ex.sets.filter(hasData).length;
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
    await leave();
    location.hash = '#/';
  } }, session.done ? 'שמור וסגור' : 'סיים אימון');

  const delBtn = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmDialog('למחוק את האימון הזה?')) {
      deleted = true;
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
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה', onclick: async () => { await leave(); history.length > 1 ? history.back() : (location.hash = '#/'); } }, '›'),
      h('h1', {}, session.workoutName || `אימון ${session.workoutId}`),
      dateInput),
    list, addEx, h('div', { class: 'actions' }, doneBtn, delBtn));

  window.__leave = leave;
}
