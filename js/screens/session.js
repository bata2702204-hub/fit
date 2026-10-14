import { h, mount, num, fmtNum, setsText, fmtDate, confirmDialog, cleanDecimal, toast } from '../util.js';
import * as db from '../db.js';
import * as st from '../stats.js';
import { startRest, stopRest } from '../rest.js';

const hasData = (s) => s.weight != null || s.reps != null;

export async function sessionScreen(root, id) {
  const session = await db.get('sessions', id);
  if (!session) { location.hash = '#/'; return; }
  const all = await db.getSessions();
  const workouts = await db.getWorkouts();
  const prefs = await db.getPrefs();
  const before = st.earlier(all, session);

  let timer;
  let metaTick;
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
    clearInterval(metaTick);
    stopRest();
    if (deleted) return;
    for (const ex of session.exercises) {
      ex.sets = ex.sets.filter(hasData);
      if (ex.note != null && !ex.note.trim()) delete ex.note;
    }
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

  // duration + calorie estimate line
  const metaBar = h('div', { class: 'sess-meta' });
  function drawMeta() {
    const ms = st.durationMs(session);
    if (ms == null) { metaBar.hidden = true; return; }
    mount(metaBar,
      h('span', { class: 'sess-time', 'aria-label': 'משך האימון' }, `⏱ ${st.fmtDuration(ms)}`));
  }
  drawMeta();
  if (!session.done) metaTick = setInterval(drawMeta, 1000);

  function setRow(ex, set, i, prev, ctl) {
    const w = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', maxlength: 7, placeholder: prev[i]?.weight != null ? fmtNum(prev[i].weight) : 'ק״ג', value: fmtNum(set.weight), 'aria-label': 'משקל' });
    const r = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', maxlength: 3, placeholder: prev[i]?.reps != null ? fmtNum(prev[i].reps) : 'חזרות', value: fmtNum(set.reps), 'aria-label': 'חזרות' });
    w.addEventListener('input', () => { w.value = cleanDecimal(w.value); set.weight = num(w.value); save(); ctl.refresh(); });
    r.addEventListener('input', () => { r.value = r.value.replace(/\D/g, ''); set.reps = num(r.value); save(); ctl.refresh(); });
    for (const el of [w, r]) el.addEventListener('focus', () => setTimeout(() => el.select(), 0));
    const step = (d) => () => { if (tooSoon()) return; set.weight = Math.max(0, Math.round(((set.weight || 0) + d) * 100) / 100); w.value = fmtNum(set.weight); save(); ctl.refresh(); };
    const chk = h('button', { class: 'chk', type: 'button', 'aria-label': 'סמן סט כבוצע', onclick: () => {
      if (tooSoon()) return;
      set.done = !set.done;
      if (!set.done) delete set.done;
      save(); ctl.refresh();
      if (set.done) {
        startRest(prefs.restSeconds);
        const f = ctl.flags()[i] || [];
        if (f.length) toast(f.includes('weight') ? '🏆 שיא משקל חדש!' : '🏆 שיא חזרות חדש!');
      }
    } }, '✓');
    ctl.chks[i] = chk;
    return h('div', { class: 'set-row' },
      chk,
      h('button', { class: 'step', type: 'button', onclick: step(-2.5), 'aria-label': 'הפחת 2.5' }, '−'),
      w,
      h('button', { class: 'step', type: 'button', onclick: step(2.5), 'aria-label': 'הוסף 2.5' }, '+'),
      h('span', { class: 'x' }, '×'),
      r,
      h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'מחק סט', onclick: () => {
        if (tooSoon()) return;
        const [removed] = ex.sets.splice(i, 1);
        save(); ctl.rerender();
        toast('הסט נמחק', { label: 'בטל', onClick: () => { ex.sets.splice(i, 0, removed); save(); ctl.rerender(); } });
      } }, '✕'));
  }

  function exCard(ex) {
    const prevInfo = db.lastSetsFor(all, ex.name, session.id, session.date);
    const prev = prevInfo ? prevInfo.sets : [];
    const range = st.repRange(workouts, session.workoutId, ex.name);
    const history = before.map((s) => s.exercises.find((e) => e.name === ex.name)?.sets || []).filter((x) => x.some(hasData));
    const sugg = st.suggestProgression(prev, range, prefs.increment);
    const prevNoteSession = before.find((s) => s.exercises.some((e) => e.name === ex.name && e.note && e.note.trim()));
    const prevNote = prevNoteSession && { date: prevNoteSession.date, text: prevNoteSession.exercises.find((e) => e.name === ex.name && e.note && e.note.trim()).note };

    const body = h('div', { class: 'ex-body' });
    const card = h('section', { class: 'card ex' });
    const badge = h('span', { class: 'badge' });
    const ctl = {
      chks: [],
      flags: () => st.prsFor(ex.sets, history, { onlyDone: true }).flags,
      refresh() {
        const pr = st.prsFor(ex.sets, history, { onlyDone: true });
        ex.sets.forEach((s, i) => {
          const c = ctl.chks[i]; if (!c) return;
          const isPR = !!s.done && pr.flags[i].length > 0;
          c.classList.toggle('on', !!s.done);
          c.classList.toggle('pr', isPR);
          c.textContent = isPR ? '🏆' : '✓';
          c.setAttribute('aria-pressed', String(!!s.done));
        });
        const n = ex.sets.filter(hasData).length;
        badge.textContent = [n ? `${n} סטים` : '', pr.count ? `🏆 ${pr.count}` : ''].filter(Boolean).join(' · ');
        if (suggBox) suggBox.hidden = ex.sets.some((s) => s.done);
      },
      rerender() {
        ctl.chks = [];
        body.replaceChildren(
          ...ex.sets.map((s, i) => setRow(ex, s, i, prev, ctl)),
          h('button', { class: 'btn add-set', type: 'button', onclick: () => {
            if (tooSoon()) return;
            lastAddAt = Date.now();
            const last = ex.sets[ex.sets.length - 1];
            const base = last || prev[ex.sets.length] || prev[0] || {};
            ex.sets.push({ weight: base.weight ?? null, reps: base.reps ?? null });
            save(); ctl.rerender();
            const rows = body.querySelectorAll('.set-row');
            rows[rows.length - 1]?.querySelector('input')?.focus();
          } }, '＋ סט'));
        ctl.refresh();
      },
    };

    const suggBox = sugg ? h('div', { class: 'hint sugg' },
      h('span', {}, `💡 הצעה: ${fmtNum(sugg.weight)} ק״ג — כל הסטים הגיעו ל־${range.max} חזרות`),
      h('button', { class: 'link', type: 'button', onclick: () => {
        if (!ex.sets.length) for (let k = 0; k < sugg.count; k++) ex.sets.push({ weight: null, reps: null });
        for (const s of ex.sets) if (!s.done) s.weight = sugg.weight;
        save(); ctl.rerender();
      } }, 'החל')) : null;

    const note = h('textarea', { class: 'note', rows: 2, maxlength: 500, placeholder: 'הערה לתרגיל (תופיע בפעם הבאה)…', 'aria-label': 'הערה לתרגיל', value: ex.note || '' });
    note.addEventListener('input', () => { ex.note = note.value; save(); });

    const head = h('button', { class: 'ex-head', type: 'button', onclick: () => card.classList.toggle('collapsed') },
      h('span', { class: 'ex-name' }, ex.name), badge, h('span', { class: 'chev' }, '▾'));
    card.append(...[head,
      h('div', { class: 'prev' }, `${prevInfo ? `פעם קודמת (${fmtDate(prevInfo.date)}): ${setsText(prevInfo.sets)}` : 'פעם ראשונה בתרגיל הזה'} · יעד ${range.min}–${range.max}`),
      prevNote ? h('div', { class: 'ex-body hint prev-note' }, `📝 הערה מ־${fmtDate(prevNote.date)}: ${prevNote.text}`) : null,
      suggBox && h('div', { class: 'ex-body' }, suggBox),
      body,
      h('div', { class: 'ex-body' }, note)].filter(Boolean));
    ctl.rerender();
    return card;
  }

  for (const ex of session.exercises) list.append(exCard(ex));

  const doneBtn = h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
    const first = !session.done;
    if (first) {
      session.endedAt = Date.now();
      session.durationMs = Math.min(Math.max(0, session.endedAt - (session.created || session.endedAt)), st.MAX_SESSION_MS);
    }
    session.done = true;
    await leave();
    location.hash = first ? `#/summary/${session.id}` : '#/';
  } }, session.done ? 'שמור וסגור' : 'סיים אימון');

  const delBtn = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmDialog('למחוק את האימון הזה?')) {
      deleted = true;
      clearTimeout(timer);
      stopRest();
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
    metaBar, list, addEx, h('div', { class: 'actions' }, doneBtn, delBtn));

  window.__leave = leave;
}
