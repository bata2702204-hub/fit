import { h, num, fmtNum, fmtDate, todayISO, confirmDialog, toast, mount, cleanDecimal } from '../util.js';
import * as db from '../db.js';

export async function measurementsScreen(root, editId) {
  const fields = await db.getFields();
  const list = await db.getMeasurements(); // newest first
  const editing = editId ? list.find((m) => m.id === editId) : null;
  const latest = list[0];

  const dateIn = h('input', { type: 'date', class: 'date-input', value: editing?.date || todayISO() });
  const inputs = fields.map((f) => {
    const inp = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', value: fmtNum(editing?.values[f.id]), placeholder: latest?.values[f.id] != null ? fmtNum(latest.values[f.id]) : '' });
    inp.addEventListener('input', () => { inp.value = cleanDecimal(inp.value); });
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
    inp.setAttribute('maxlength', '7');
    return { f, inp };
  });

  const form = h('form', { class: 'card form', onsubmit: async (e) => {
    e.preventDefault();
    const values = {};
    for (const { f, inp } of inputs) { const v = num(inp.value); if (v != null) values[f.id] = v; }
    if (!Object.keys(values).length) { toast('הזן לפחות ערך אחד'); return; }
    await db.put('measurements', { id: editing?.id || db.uid(), date: dateIn.value || todayISO(), values });
    toast('נשמר');
    location.hash = '#/measurements';
    measurementsScreen(root);
  } },
    h('label', { class: 'field' }, h('span', {}, 'תאריך'), dateIn),
    ...inputs.map(({ f, inp }) => h('label', { class: 'field' }, h('span', {}, `${f.name} (${f.unit})`), inp)),
    h('button', { class: 'btn primary big', type: 'submit' }, editing ? 'עדכן מדידה' : 'שמור מדידה'),
    editing ? h('a', { class: 'btn', href: '#/measurements' }, 'ביטול') : null);

  // history, with delta vs previous (older) entry that has the same field
  const rows = list.map((m, idx) => {
    const cells = fields.filter((f) => m.values[f.id] != null).map((f) => {
      const older = list.slice(idx + 1).find((o) => o.values[f.id] != null);
      const d = older ? m.values[f.id] - older.values[f.id] : null;
      const dTxt = d == null ? '' : d === 0 ? '＝' : `${d > 0 ? '▲' : '▼'}${fmtNum(Math.abs(d))}`;
      return h('div', { class: 'm-cell' }, h('small', {}, f.name), h('b', {}, fmtNum(m.values[f.id])),
        h('span', { class: `delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}` }, dTxt));
    });
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('b', {}, fmtDate(m.date)),
        h('span', {},
          h('a', { class: 'link', href: `#/measurements/${m.id}` }, 'ערוך'), ' ',
          h('button', { class: 'link danger', type: 'button', onclick: async () => {
            if (await confirmDialog('למחוק מדידה זו?')) { await db.del('measurements', m.id); measurementsScreen(root); }
          } }, 'מחק'))),
      h('div', { class: 'm-grid' }, ...cells));
  });

  mount(root,
    h('header', { class: 'top' }, h('h1', {}, editing ? 'עריכת מדידה' : 'מדידות שבועיות')),
    form,
    h('h2', {}, 'היסטוריה'),
    rows.length ? h('div', { class: 'list' }, ...rows) : h('p', { class: 'empty' }, 'עוד אין מדידות.'));
}
