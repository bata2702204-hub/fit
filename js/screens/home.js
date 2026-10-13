import { h, todayISO, fmtDate, topWeight } from '../util.js';
import * as db from '../db.js';

export async function homeScreen(root) {
  const workouts = await db.getWorkouts();
  const sessions = await db.getSessions();
  const inProgress = sessions.filter((s) => !s.done && s.exercises.some((e) => e.sets.length));

  async function start(w) {
    const s = {
      id: db.uid(), workoutId: w.id, workoutName: w.name, date: todayISO(), created: Date.now(), done: false,
      exercises: w.exercises.map((e) => ({ name: e.name, sets: [] })),
    };
    await db.put('sessions', s);
    location.hash = `#/session/${s.id}`;
  }

  const lastBackup = await db.getMeta('lastBackup');
  const stale = !lastBackup || Date.now() - lastBackup > 14 * 864e5;

  root.replaceChildren(
    h('header', { class: 'top' }, h('h1', {}, 'מעקב אימונים')),
    inProgress.length ? h('div', { class: 'card resume' },
      h('div', {}, `אימון ${inProgress[0].workoutId} בתהליך · ${fmtDate(inProgress[0].date)}`),
      h('a', { class: 'btn primary', href: `#/session/${inProgress[0].id}` }, 'המשך')) : null,
    h('div', { class: 'start-grid' }, ...workouts.map((w) => {
      const last = sessions.find((s) => s.workoutId === w.id && s.exercises.some((e) => e.sets.length));
      return h('button', { class: 'start-btn', type: 'button', onclick: () => start(w) },
        h('span', { class: 'big-letter' }, w.id),
        h('span', {}, `התחל ${w.name}`),
        h('small', {}, last ? `אחרון: ${fmtDate(last.date)}` : 'עוד לא בוצע'));
    })),
    stale && sessions.length ? h('a', { class: 'card nudge', href: '#/settings' }, '💾 לא גיבית את הנתונים לאחרונה — גבה עכשיו') : null,
    h('h2', {}, 'אחרונים'),
    h('div', { class: 'list' }, ...sessions.filter((s) => s.exercises.some((e) => e.sets.length)).slice(0, 5).map((s) =>
      h('a', { class: 'card row', href: `#/session/${s.id}` },
        h('b', {}, s.workoutName || `אימון ${s.workoutId}`), h('span', {}, fmtDate(s.date))))));
}
