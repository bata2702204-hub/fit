import { h, fmtDate, volume, mount, plural } from '../util.js';
import * as db from '../db.js';

export async function historyScreen(root) {
  const sessions = (await db.getSessions()).filter((s) => s.exercises.some((e) => e.sets.length));
  mount(root,
    h('header', { class: 'top' }, h('h1', {}, 'היסטוריה')),
    sessions.length ? h('div', { class: 'list' }, ...sessions.map((s) => {
      const done = s.exercises.filter((e) => e.sets.length);
      const vol = Math.round(done.reduce((a, e) => a + volume(e.sets), 0));
      return h('a', { class: 'card hist', href: `#/session/${s.id}` },
        h('div', { class: 'row' }, h('b', {}, s.workoutName || `אימון ${s.workoutId}`), h('span', {}, fmtDate(s.date))),
        h('small', {}, `${plural(done.length, 'תרגיל אחד', 'תרגילים')} · נפח ${vol.toLocaleString('he-IL')} ק״ג${s.done ? '' : ' · לא הושלם'}`));
    })) : h('p', { class: 'empty' }, 'עוד אין אימונים. התחל אימון ראשון במסך הבית.'));
}
