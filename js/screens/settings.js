import { h, toast, confirmDialog, downloadJSON, todayISO, fmtDate } from '../util.js';
import * as db from '../db.js';

export async function settingsScreen(root) {
  const workouts = await db.getWorkouts();
  const fields = await db.getFields();
  const lastBackup = await db.getMeta('lastBackup');
  const rerender = () => settingsScreen(root);

  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };

  function workoutCard(w) {
    const save = () => db.put('workouts', w).then(rerender);
    return h('div', { class: 'card' },
      h('h3', {}, w.name),
      ...w.exercises.map((e, i) => h('div', { class: 'edit-row' },
        h('span', { class: 'grow' }, e.name),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'הזז למעלה', onclick: () => move(w.exercises, i, -1) && save() }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'הזז למטה', onclick: () => move(w.exercises, i, 1) && save() }, '↓'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'שנה שם', onclick: () => { const n = prompt('שם התרגיל:', e.name); if (n && n.trim()) { e.name = n.trim(); save(); } } }, '✎'),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'מחק', onclick: async () => { if (await confirmDialog(`למחוק את "${e.name}" מהאימון? ההיסטוריה נשמרת.`)) { w.exercises.splice(i, 1); save(); } } }, '✕'))),
      h('button', { class: 'btn', type: 'button', onclick: () => { const n = prompt('שם התרגיל החדש:'); if (n && n.trim()) { w.exercises.push({ id: db.uid(), name: n.trim() }); save(); } } }, '＋ הוסף תרגיל'));
  }

  const fieldsCard = h('div', { class: 'card' }, h('h3', {}, 'שדות מדידה'),
    ...fields.map((f, i) => {
      const save = async () => { fields.forEach((x, k) => (x.order = k)); await Promise.all(fields.map((x) => db.put('measurementFields', x))); rerender(); };
      return h('div', { class: 'edit-row' },
        h('span', { class: 'grow' }, `${f.name} (${f.unit})`),
        h('button', { class: 'icon-btn', type: 'button', onclick: () => move(fields, i, -1) && save() }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', onclick: () => move(fields, i, 1) && save() }, '↓'),
        h('button', { class: 'icon-btn', type: 'button', onclick: () => { const n = prompt('שם השדה:', f.name); if (n && n.trim()) { f.name = n.trim(); save(); } } }, '✎'),
        h('button', { class: 'icon-btn danger', type: 'button', onclick: async () => { if (await confirmDialog(`למחוק את השדה "${f.name}"? ערכים קיימים לא יוצגו יותר.`)) { await db.del('measurementFields', f.id); rerender(); } } }, '✕'));
    }),
    h('button', { class: 'btn', type: 'button', onclick: async () => {
      const n = prompt('שם השדה החדש (למשל: כתפיים):'); if (!n || !n.trim()) return;
      const unit = prompt('יחידה:', 'ס״מ') || 'ס״מ';
      await db.put('measurementFields', { id: db.uid(), name: n.trim(), unit, order: fields.length });
      rerender();
    } }, '＋ הוסף שדה'));

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!db.validateImport(data)) throw new Error();
      if (!(await confirmDialog(`לשחזר ${data.sessions.length} אימונים ו־${data.measurements.length} מדידות? כל הנתונים הנוכחיים יוחלפו.`))) return;
      await db.importAll(data);
      toast('השחזור הושלם');
      rerender();
    } catch { toast('קובץ לא תקין'); }
    e.target.value = '';
  } });

  const dataCard = h('div', { class: 'card' }, h('h3', {}, 'גיבוי ושחזור'),
    h('p', { class: 'muted' }, lastBackup ? `גיבוי אחרון: ${fmtDate(new Date(lastBackup).toISOString().slice(0, 10))}` : 'עוד לא בוצע גיבוי'),
    h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const data = await db.exportAll();
      const name = `fit-backup-${todayISO()}.json`;
      try {
        const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); }
        else downloadJSON(data, name);
      } catch (err) { if (err.name !== 'AbortError') downloadJSON(data, name); }
      rerender();
    } }, 'ייצוא נתונים'),
    h('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, 'ייבוא מקובץ'), fileIn);

  root.replaceChildren(h('header', { class: 'top' }, h('h1', {}, 'הגדרות')),
    ...workouts.map(workoutCard), fieldsCard, dataCard);
}
