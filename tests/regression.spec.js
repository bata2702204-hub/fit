// Regression tests for issues found by the independent QA pass.
const { test, expect } = require('@playwright/test');
const { sessionsDB, setup, card, rows, inputs, fill, startWorkout, finish, logQuick } = require('./helpers');

test('home never renders the literal text "null"; empty states are explained', async ({ page }) => {
  await setup(page);
  await expect(page.locator('main')).not.toContainText('null');
  await expect(page.locator('main .empty')).toContainText('עוד אין אימונים');
  await logQuick(page, 'A', 'חזה עליון', 70, 8);
  await page.reload();
  await expect(page.locator('main')).not.toContainText('null');
});

test('blank sets are dropped on finish; abandoned empty sessions leave no trace', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  await fill(rows(c).first(), 50, 10);
  await page.waitForTimeout(500);
  await c.locator('.add-set').click(); // prefilled copy counts as data
  await page.waitForTimeout(500);
  const c2 = card(page, 'חזה רגיל');
  await c2.locator('.add-set').click();
  await rows(c2).first().locator('input').nth(0).fill('');
  await rows(c2).first().locator('input').nth(1).fill('');
  await finish(page);
  const s = (await sessionsDB(page))[0];
  expect(s.exercises.find((e) => e.name === 'חזה רגיל').sets).toHaveLength(0);
  expect(s.exercises.find((e) => e.name === 'חזה עליון').sets).toHaveLength(2);
  await page.goto('/#/history');
  await expect(page.locator('.hist small')).toContainText('תרגיל אחד');

  // started and abandoned: no leftover row
  await startWorkout(page, 'B');
  expect(await sessionsDB(page)).toHaveLength(2);
  await page.goto('/#/');
  await expect.poll(async () => (await sessionsDB(page)).length).toBe(1);

  // only blank sets, then finished: removed as well
  await startWorkout(page, 'B');
  const p = card(page, 'פטישים');
  await p.locator('.add-set').click();
  await rows(p).first().locator('input').nth(0).fill('');
  await rows(p).first().locator('input').nth(1).fill('');
  await finish(page);
  expect(await sessionsDB(page)).toHaveLength(1);
});

test('number fields reject junk; text is selected on focus', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  const w = inputs(rows(c).first()).nth(0);
  const r = inputs(rows(c).first()).nth(1);
  await w.fill('');
  await w.pressSequentially('abc-5e3');
  await expect(w).toHaveValue('53');
  await r.pressSequentially('1x2.5');
  await expect(r).toHaveValue('125');
  await w.fill('62.5');
  await page.waitForTimeout(400);
  await r.focus();
  await w.focus();
  await page.waitForTimeout(150);
  const sel = await w.evaluate((el) => el.selectionEnd - el.selectionStart);
  expect(sel).toBe(4);
  const s = (await sessionsDB(page))[0];
  expect(s.exercises[0].sets[0].weight).toBe(62.5);
  await page.goto('/#/measurements');
  const m = page.locator('form input.inp').first();
  await m.pressSequentially('8a0,5-');
  await expect(m).toHaveValue('80,5');
});

test('double tap on "＋ סט" adds a single set with no accidental value', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').dblclick();
  await expect(rows(c)).toHaveCount(1);
  await expect(inputs(rows(c).first()).nth(0)).toHaveValue('');
});

test('deleting a set can be undone from the toast', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  await fill(rows(c).first(), 40, 12);
  await page.waitForTimeout(450);
  await rows(c).first().getByRole('button', { name: 'מחק סט' }).click();
  await expect(rows(c)).toHaveCount(0);
  await page.getByRole('button', { name: 'בטל' }).click();
  await expect(rows(c)).toHaveCount(1);
  await expect(inputs(rows(c).first()).nth(0)).toHaveValue('40');
});

test('"last time" never points at a later session; clearing the date is rejected', async ({ page }) => {
  await setup(page);
  await logQuick(page, 'A', 'חזה עליון', 70, 8); // today
  await startWorkout(page, 'A'); // second session, backdated
  await page.locator('.date-input').fill('2020-01-05');
  const c = card(page, 'חזה עליון');
  await c.locator('.add-set').click();
  await fill(rows(c).first(), 50, 10);
  await page.waitForTimeout(400);
  await page.reload(); // date change must have been saved
  await expect(page.locator('.date-input')).toHaveValue('2020-01-05');
  await expect(card(page, 'חזה עליון').locator('.prev')).toContainText('פעם ראשונה'); // today's 70x8 is later
  await page.locator('.date-input').fill('');
  await page.locator('.date-input').blur();
  await expect(page.locator('.date-input')).toHaveValue('2020-01-05');
  await page.waitForTimeout(400);
  await page.goto('/#/history');
  const dates = (await sessionsDB(page)).map((s) => s.date).sort();
  expect(dates[0]).toBe('2020-01-05');
});

test('renaming an exercise in settings keeps its history (when confirmed)', async ({ page }) => {
  const st = await setup(page);
  await logQuick(page, 'A', 'חזה רגיל', 85, 6);
  await page.goto('/#/settings');
  const wA = page.locator('.card', { has: page.locator('h3', { hasText: 'אימון A' }) });
  st.prompts.push('לחיצת חזה');
  await wA.locator('.edit-row').nth(1).getByRole('button', { name: 'שנה שם' }).click();
  await expect(wA.locator('.edit-row').nth(1)).toContainText('לחיצת חזה');
  await page.reload();
  const s = (await sessionsDB(page))[0];
  expect(s.exercises.some((e) => e.name === 'לחיצת חזה' && e.sets.length === 1)).toBe(true);
  await startWorkout(page, 'A');
  await expect(card(page, 'לחיצת חזה').locator('.prev')).toContainText('85×6');
  await page.goto('/#/progress');
  await expect(page.locator('select.sel').first().locator('option')).toHaveText(['לחיצת חזה']);
});

test('settings: first "up" and last "down" buttons are disabled', async ({ page }) => {
  await setup(page);
  await page.goto('/#/settings');
  const wA = page.locator('.card', { has: page.locator('h3', { hasText: 'אימון A' }) });
  await expect(wA.locator('.edit-row').first().getByRole('button', { name: 'הזז למעלה' })).toBeDisabled();
  await expect(wA.locator('.edit-row').last().getByRole('button', { name: 'הזז למטה' })).toBeDisabled();
});
