const { test, expect } = require('@playwright/test');
const fs = require('fs');

// ---------- helpers ----------
const A = ['חזה עליון', 'חזה רגיל', 'פרפר בכבלים', 'לחיצת חבל בפולי', 'פשיטת מרפקים מעל הראש', 'כתף אחורית'];
const B = ['פולי עליון רחב', 'כפיפות מרפקים יד יד', 'כתף אחורית', 'פטישים', 'כפיפות מרפקים', 'סקוואט במכונה', 'תאומים', 'פשיטת רגל במכונה'];

const dbAll = (page, store) => page.evaluate(async (s) => (await import('/js/db.js')).getAll(s), store);
const sessionsDB = (page) => dbAll(page, 'sessions');

async function setup(page) {
  const state = { prompts: [], confirm: true, messages: [] };
  page.on('dialog', async (d) => {
    state.messages.push(d.message());
    if (d.type() === 'prompt') await d.accept(state.prompts.shift() ?? '');
    else if (d.type() === 'confirm' && !state.confirm) await d.dismiss();
    else await d.accept();
  });
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await expect(page.locator('.start-btn')).toHaveCount(2);
  return state;
}

const card = (page, name) => page.locator('.ex', { has: page.locator('.ex-name', { hasText: new RegExp(`^${name}$`) }) }).first();
const rows = (c) => c.locator('.set-row');
const inputs = (row) => row.locator('input');
async function fill(row, w, r) {
  const i = inputs(row);
  if (w != null) await i.nth(0).fill(String(w));
  if (r != null) await i.nth(1).fill(String(r));
}
async function startWorkout(page, id) {
  await page.goto('/#/');
  await page.locator('.start-btn').nth(id === 'A' ? 0 : 1).click();
  await expect(page.locator('.ex').first()).toBeVisible();
}
async function finish(page) {
  await page.getByRole('button', { name: /סיים אימון|שמור וסגור/ }).click();
  const close = page.locator('.summary-close');
  await expect(close.or(page.locator('.start-grid'))).toBeVisible();
  if (await close.isVisible()) await close.click(); // first finish shows the summary screen
  await expect(page.locator('.start-grid')).toBeVisible();
}
async function logQuick(page, id, exName, w, r) {
  await startWorkout(page, id);
  const c = card(page, exName);
  await c.locator('.add-set').click();
  await fill(rows(c).first(), w, r);
  await page.waitForTimeout(300);
  await finish(page);
}

// ---------- tests ----------
test('seed data: both workouts have the exact exercises', async ({ page }) => {
  await setup(page);
  const ws = await dbAll(page, 'workouts');
  expect(ws.find((w) => w.id === 'A').exercises.map((e) => e.name)).toEqual(A);
  expect(ws.find((w) => w.id === 'B').exercises.map((e) => e.name)).toEqual(B);
  const fields = (await dbAll(page, 'measurementFields')).sort((a, b) => a.order - b.order).map((f) => f.name);
  expect(fields).toEqual(['משקל גוף', 'חזה', 'בטן', 'ירכיים', 'זרוע', 'ירך']);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('start A and B sessions show the right exercises', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await expect(page.locator('.ex-name')).toHaveText(A);
  await startWorkout(page, 'B');
  await expect(page.locator('.ex-name')).toHaveText(B);
});

test('add / remove sets, edit weight & reps, persisted after reload', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  await fill(rows(c).nth(0), '61.25', 10);
  await page.waitForTimeout(450); // taps right after adding a set are intentionally ignored
  await c.locator('.add-set').click();
  await expect(inputs(rows(c).nth(1)).nth(0)).toHaveValue('61.25'); // prefilled from previous set
  await fill(rows(c).nth(1), 60, 8);
  await page.waitForTimeout(450);
  await c.locator('.add-set').click();
  await fill(rows(c).nth(2), 57.5, 6);
  await expect(rows(c)).toHaveCount(3);
  await page.waitForTimeout(450);
  await rows(c).nth(2).getByRole('button', { name: 'הוסף 2.5' }).click();
  await expect(inputs(rows(c).nth(2)).nth(0)).toHaveValue('60');
  await rows(c).nth(0).getByRole('button', { name: 'מחק סט' }).click();
  await expect(rows(c)).toHaveCount(2);
  await page.waitForTimeout(400);

  const s = (await sessionsDB(page))[0];
  const ex = s.exercises.find((e) => e.name === 'חזה עליון');
  expect(ex.sets).toEqual([{ weight: 60, reps: 8 }, { weight: 60, reps: 6 }]);

  await page.reload();
  const c2 = card(page, 'חזה עליון');
  await expect(rows(c2)).toHaveCount(2);
  await expect(inputs(rows(c2).nth(0)).nth(0)).toHaveValue('60');
  await expect(inputs(rows(c2).nth(0)).nth(1)).toHaveValue('8');
  await expect(inputs(rows(c2).nth(1)).nth(1)).toHaveValue('6');
});

test('"last time" is shown in the next session', async ({ page }) => {
  await setup(page);
  await logQuick(page, 'A', 'חזה רגיל', 80, 9);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה רגיל');
  await expect(c.locator('.prev')).toContainText('80×9');
  await expect(card(page, 'חזה עליון').locator('.prev')).toContainText('פעם ראשונה');
  await c.locator('.add-set').click();
  await expect(inputs(rows(c).first()).nth(0)).toHaveValue('80');
});

test('shared exercise "כתף אחורית" has one history across A and B', async ({ page }) => {
  await setup(page);
  await logQuick(page, 'A', 'כתף אחורית', 12.5, 15);
  await startWorkout(page, 'B');
  await expect(card(page, 'כתף אחורית').locator('.prev')).toContainText('12.5×15');
});

test('in-progress session survives reload and can be resumed', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  await fill(rows(c).first(), 50, 12);
  await page.waitForTimeout(400);
  await page.goto('/#/');
  await expect(page.locator('.resume')).toBeVisible();
  await page.reload();
  await page.locator('.resume a').click();
  await expect(inputs(rows(card(page, 'חזה עליון')).first()).nth(0)).toHaveValue('50');
});

test('edit a past session from history (date, weight) persists after reload', async ({ page }) => {
  await setup(page);
  await logQuick(page, 'A', 'חזה עליון', 70, 8);
  await page.goto('/#/history');
  await expect(page.locator('.hist')).toHaveCount(1);
  await page.locator('.hist').click();
  await page.locator('.date-input').fill('2025-03-04');
  const c = card(page, 'חזה עליון');
  await fill(rows(c).first(), 72.5, 7);
  await page.waitForTimeout(400);
  await page.goto('/#/history'); // leaving the screen saves
  const s = (await sessionsDB(page))[0];
  expect(s.date).toBe('2025-03-04');
  expect(s.exercises.find((e) => e.name === 'חזה עליון').sets[0]).toEqual({ weight: 72.5, reps: 7 });
  await page.reload();
  await expect(page.locator('.hist')).toHaveCount(1);
  await page.locator('.hist').click();
  await expect(page.locator('.date-input')).toHaveValue('2025-03-04');
  await expect(inputs(rows(card(page, 'חזה עליון')).first()).nth(0)).toHaveValue('72.5');
});

test('delete session: cancel keeps it, confirm removes it everywhere (incl. after reload)', async ({ page }) => {
  const st = await setup(page);
  await logQuick(page, 'A', 'חזה עליון', 70, 8);
  await logQuick(page, 'B', 'פטישים', 20, 12);
  expect(await sessionsDB(page)).toHaveLength(2);
  await page.goto('/#/history');
  await page.locator('.hist', { hasText: 'אימון A' }).click();

  st.confirm = false;
  await page.getByRole('button', { name: 'מחק אימון' }).click();
  await page.waitForTimeout(300);
  expect(await sessionsDB(page)).toHaveLength(2);
  await expect(page.locator('.ex').first()).toBeVisible();

  st.confirm = true;
  await page.getByRole('button', { name: 'מחק אימון' }).click();
  await expect(page.locator('h1')).toHaveText('היסטוריה');
  await expect(page.locator('.hist')).toHaveCount(1);
  await page.waitForTimeout(500);
  const left = await sessionsDB(page);
  expect(left).toHaveLength(1);
  expect(left[0].workoutId).toBe('B');

  await page.reload();
  await expect(page.locator('.hist')).toHaveCount(1);
  expect(await sessionsDB(page)).toHaveLength(1);
  await page.goto('/#/');
  await expect(page.locator('.card.row')).toHaveCount(1);
  await page.goto('/#/progress');
  await expect(page.locator('select.sel').first().locator('option')).toHaveText(['פטישים']);
});

test('deleting an in-progress session does not resurrect it', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await card(page, 'חזה עליון').locator('.add-set').click();
  await page.getByRole('button', { name: 'מחק אימון' }).click();
  await page.waitForTimeout(500);
  await page.reload();
  expect(await sessionsDB(page)).toHaveLength(0);
  await page.goto('/#/');
  await expect(page.locator('.resume')).toHaveCount(0);
});

test('measurements: add, deltas, edit, delete — persisted after reload', async ({ page }) => {
  const st = await setup(page);
  const add = async (date, vals) => {
    await page.goto('/#/measurements');
    await page.locator('form .date-input').fill(date);
    const ins = page.locator('form input.inp');
    for (let i = 0; i < vals.length; i++) await ins.nth(i).fill(String(vals[i]));
    await page.getByRole('button', { name: 'שמור מדידה' }).click();
    await expect(page.locator('.toast').last()).toBeVisible();
  };
  await add('2025-01-01', [80, 100, 90, 95, 35, 58]);
  await add('2025-01-08', [79.5, 101, 88, '', 35.5, '']);
  expect(await dbAll(page, 'measurements')).toHaveLength(2);
  await page.reload();
  const entries = page.locator('.card', { hasText: 'ערוך' });
  await expect(entries).toHaveCount(2);
  const newest = entries.first();
  await expect(newest.locator('.delta.down').first()).toContainText('0.5'); // weight 80 -> 79.5
  await expect(newest.locator('.delta.up').first()).toContainText('1');     // chest 100 -> 101
  await expect(newest).toContainText('בטן');
  await expect(newest.locator('.delta.down').nth(1)).toContainText('2');     // belly 90 -> 88

  await newest.getByRole('link', { name: 'ערוך' }).click();
  await expect(page.locator('h1')).toHaveText('עריכת מדידה');
  await page.locator('form input.inp').first().fill('78');
  await page.getByRole('button', { name: 'עדכן מדידה' }).click();
  await expect(page.locator('.toast').last()).toBeVisible();
  let ms = await dbAll(page, 'measurements');
  const fields = await dbAll(page, 'measurementFields');
  const wId = fields.find((f) => f.name === 'משקל גוף').id;
  expect(ms.find((m) => m.date === '2025-01-08').values[wId]).toBe(78);
  expect(ms).toHaveLength(2);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('מדידות שבועיות');
  await expect(entries).toHaveCount(2);

  st.confirm = false;
  await entries.first().getByRole('button', { name: 'מחק' }).click();
  await page.waitForTimeout(300);
  expect(await dbAll(page, 'measurements')).toHaveLength(2);
  st.confirm = true;
  await entries.first().getByRole('button', { name: 'מחק' }).click();
  await expect(entries).toHaveCount(1);
  expect(await dbAll(page, 'measurements')).toHaveLength(1);
  await page.reload();
  await expect(entries).toHaveCount(1);
  expect((await dbAll(page, 'measurements'))[0].date).toBe('2025-01-01');
});

test('measurement form refuses an empty entry', async ({ page }) => {
  await setup(page);
  await page.goto('/#/measurements');
  await page.getByRole('button', { name: 'שמור מדידה' }).click();
  await page.waitForTimeout(300);
  expect(await dbAll(page, 'measurements')).toHaveLength(0);
});

test('settings: add / rename / reorder / delete exercises, persisted and used by new sessions', async ({ page }) => {
  const st = await setup(page);
  await page.goto('/#/settings');
  const wA = page.locator('.card', { has: page.locator('h3', { hasText: 'אימון A' }) });
  const names = async () => (await dbAll(page, 'workouts')).find((w) => w.id === 'A').exercises.map((e) => e.name);

  st.prompts.push('הרמה צידית');
  await wA.getByRole('button', { name: '＋ הוסף תרגיל' }).click();
  await expect(wA.locator('.edit-row')).toHaveCount(7);
  expect(await names()).toEqual([...A, 'הרמה צידית']);

  st.prompts.push('חזה עליון בשיפוע');
  await wA.locator('.edit-row').first().getByRole('button', { name: 'שנה שם' }).click();
  await expect(wA.locator('.edit-row').first()).toContainText('חזה עליון בשיפוע');
  expect((await names())[0]).toBe('חזה עליון בשיפוע');

  await wA.locator('.edit-row').nth(1).getByRole('button', { name: 'הזז למעלה' }).click();
  expect((await names()).slice(0, 2)).toEqual(['חזה רגיל', 'חזה עליון בשיפוע']);
  await wA.locator('.edit-row').nth(0).getByRole('button', { name: 'הזז למטה' }).click();
  expect((await names()).slice(0, 2)).toEqual(['חזה עליון בשיפוע', 'חזה רגיל']);

  st.confirm = false;
  await wA.locator('.edit-row').nth(2).getByRole('button', { name: 'מחק' }).click();
  await page.waitForTimeout(300);
  expect(await names()).toHaveLength(7);
  st.confirm = true;
  await wA.locator('.edit-row').nth(2).getByRole('button', { name: 'מחק' }).click(); // פרפר בכבלים
  await expect(wA.locator('.edit-row')).toHaveCount(6);

  const expected = ['חזה עליון בשיפוע', 'חזה רגיל', 'לחיצת חבל בפולי', 'פשיטת מרפקים מעל הראש', 'כתף אחורית', 'הרמה צידית'];
  expect(await names()).toEqual(expected);
  await page.reload();
  expect(await names()).toEqual(expected);
  await expect(page.locator('.card', { has: page.locator('h3', { hasText: 'אימון A' }) }).locator('.edit-row .grow')).toHaveText(expected);

  await startWorkout(page, 'A');
  await expect(page.locator('.ex-name')).toHaveText(expected);
});

test('settings: deleting an exercise from a workout keeps old sessions intact', async ({ page }) => {
  await setup(page);
  await logQuick(page, 'A', 'חזה רגיל', 90, 5);
  await page.goto('/#/settings');
  const wA = page.locator('.card', { has: page.locator('h3', { hasText: 'אימון A' }) });
  await wA.locator('.edit-row').nth(1).getByRole('button', { name: 'מחק' }).click();
  await expect(wA.locator('.edit-row')).toHaveCount(5);
  await page.goto('/#/history');
  await page.locator('.hist').click();
  await expect(inputs(rows(card(page, 'חזה רגיל')).first()).nth(0)).toHaveValue('90');
});

test('settings: measurement fields add / rename / reorder / delete', async ({ page }) => {
  const st = await setup(page);
  await page.goto('/#/settings');
  const fc = page.locator('.card', { has: page.locator('h3', { hasText: 'שדות מדידה' }) });
  const fnames = async () => (await dbAll(page, 'measurementFields')).sort((a, b) => a.order - b.order).map((f) => f.name);
  st.prompts.push('כתפיים', 'ס״מ');
  await fc.getByRole('button', { name: '＋ הוסף שדה' }).click();
  await expect(fc.locator('.edit-row')).toHaveCount(7);
  expect((await fnames()).at(-1)).toBe('כתפיים');
  st.prompts.push('חזה גדול');
  await fc.locator('.edit-row').nth(1).locator('button').nth(2).click(); // rename
  await expect(fc.locator('.edit-row').nth(1)).toContainText('חזה גדול');
  await fc.locator('.edit-row').nth(1).locator('button').nth(0).click(); // up
  await expect.poll(fnames).toEqual(['חזה גדול', 'משקל גוף', 'בטן', 'ירכיים', 'זרוע', 'ירך', 'כתפיים']);
  await page.reload();
  expect((await fnames()).slice(0, 2)).toEqual(['חזה גדול', 'משקל גוף']);
  await fc.locator('.edit-row').last().locator('button').nth(3).click(); // delete כתפיים
  await expect(fc.locator('.edit-row')).toHaveCount(6);
  await page.reload();
  expect(await fnames()).toHaveLength(6);
  await page.goto('/#/measurements');
  await expect(page.locator('form .field')).toHaveCount(7); // date + 6
});

test('progress charts render for exercises and measurements; PR shown', async ({ page }) => {
  await setup(page);
  await logQuick(page, 'A', 'חזה עליון', 60, 10);
  await startWorkout(page, 'A');
  await page.locator('.date-input').fill('2099-01-01');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  await fill(rows(c).first(), 65, 8);
  await page.waitForTimeout(300);
  await finish(page);
  await page.goto('/#/measurements');
  await page.locator('form input.inp').first().fill('80');
  await page.getByRole('button', { name: 'שמור מדידה' }).click();
  await page.waitForTimeout(300);
  await page.goto('/#/progress');
  const charts = page.locator('svg.chart');
  await expect(charts).toHaveCount(2);
  await expect(charts.first().locator('circle')).toHaveCount(2);
  await expect(page.locator('.pr')).toContainText('65');
  await page.getByRole('button', { name: /נפח/ }).click();
  await expect(page.locator('.pr')).toContainText('600'); // 60*10=600 beats 65*8=520
  await expect(charts.first().locator('path.line')).toHaveCount(1);
  await expect(charts.nth(1).locator('circle')).toHaveCount(1);
});

test('export then import restores all data', async ({ page }, testInfo) => {
  await setup(page);
  await logQuick(page, 'A', 'חזה עליון', 70, 8);
  await logQuick(page, 'B', 'פטישים', 20, 12);
  await page.goto('/#/measurements');
  await page.locator('form input.inp').first().fill('81.5');
  await page.getByRole('button', { name: 'שמור מדידה' }).click();
  await page.waitForTimeout(300);
  await page.goto('/#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא נתונים' }).click()]);
  const file = testInfo.outputPath('backup.json');
  await dl.saveAs(file);
  expect(dl.suggestedFilename()).toMatch(/^fit-backup-\d{4}-\d\d-\d\d\.json$/);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(data.sessions).toHaveLength(2);
  expect(data.measurements).toHaveLength(1);

  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    for (const s of ['sessions', 'measurements']) for (const o of await db.getAll(s)) await db.del(s, o.id);
    for (const w of await db.getAll('workouts')) await db.put('workouts', { ...w, exercises: [] });
  });
  await page.reload();
  expect(await sessionsDB(page)).toHaveLength(0);

  fs.writeFileSync(testInfo.outputPath('bad.json'), '{"hello":1}');
  await page.locator('input[type=file]').setInputFiles(testInfo.outputPath('bad.json'));
  await expect(page.locator('.toast').last()).toContainText('לא תקין');
  expect(await sessionsDB(page)).toHaveLength(0);

  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.locator('.toast', { hasText: 'השחזור הושלם' })).toBeVisible();
  await page.reload();
  const after = await Promise.all(['sessions', 'measurements', 'workouts', 'measurementFields'].map((s) => dbAll(page, s)));
  const norm = (a) => JSON.stringify([...a].sort((x, y) => x.id.localeCompare(y.id)));
  expect(norm(after[0])).toBe(norm(data.sessions));
  expect(norm(after[1])).toBe(norm(data.measurements));
  expect(norm(after[2])).toBe(norm(data.workouts));
  expect(norm(after[3])).toBe(norm(data.measurementFields));
  await page.goto('/#/history');
  await expect(page.locator('.hist')).toHaveCount(2);
});

test('import cancelled at confirm leaves data unchanged', async ({ page }, testInfo) => {
  const st = await setup(page);
  await logQuick(page, 'A', 'חזה עליון', 70, 8);
  await page.goto('/#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא נתונים' }).click()]);
  const file = testInfo.outputPath('b.json');
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.sessions = [];
  fs.writeFileSync(file, JSON.stringify(data));
  st.confirm = false;
  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForTimeout(400);
  expect(await sessionsDB(page)).toHaveLength(1);
});

test('home shows recent sessions and backup nudge; navigation tabs work', async ({ page }) => {
  await setup(page);
  await logQuick(page, 'A', 'חזה עליון', 70, 8);
  await expect(page.locator('.nudge')).toBeVisible();
  await expect(page.locator('.card.row')).toHaveCount(1);
  for (const [tab, h1] of [['היסטוריה', 'היסטוריה'], ['התקדמות', 'התקדמות'], ['מדידות', 'מדידות שבועיות'], ['הגדרות', 'הגדרות'], ['בית', 'מעקב אימונים']]) {
    await page.locator('nav a', { hasText: tab }).click();
    await expect(page.locator('h1')).toHaveText(h1);
  }
});

test('layout: no horizontal overflow, inputs are touch-sized', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  await fill(rows(c).first(), '102.5', 10);
  await page.waitForTimeout(300);
  for (const hash of ['#/', '#/history', '#/progress', '#/measurements', '#/settings']) {
    await page.goto('/' + hash);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, hash).toBeLessThanOrEqual(0);
  }
  await page.goto('/#/');
  await page.locator('.resume a').click();
  const box = await inputs(rows(card(page, 'חזה עליון')).first()).nth(0).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(box.width).toBeGreaterThanOrEqual(60);
});

test.describe('offline / PWA', () => {
  test.use({ serviceWorkers: 'allow' });
  test('manifest valid and app loads offline after first visit', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForTimeout(500);
    const man = await (await page.request.get('/manifest.webmanifest')).json();
    expect(man.display).toBe('standalone');
    expect(man.lang).toBe('he');
    for (const i of man.icons) expect((await page.request.get('/' + i.src)).ok(), i.src).toBeTruthy();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.start-btn')).toHaveCount(2);
    await context.setOffline(false);
  });
});
