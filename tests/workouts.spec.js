const { test, expect } = require('@playwright/test');
const { A, B, dbAll, sessionsDB, setup, card, rows, fill, finish, logQuick } = require('./helpers');

const names = async (page) => { await page.locator('.workout-card').first().waitFor().catch(() => {}); return page.locator('.workout-card h3').allTextContents(); };
const wcard = (page, name) => page.locator('.workout-card', { has: page.locator('h3', { hasText: new RegExp(`^${name}$`) }) });

test('migration removes כתף אחורית from existing B only, once', async ({ page }) => {
  await setup(page);
  // simulate old data: put it back in B and clear the migration flag
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const b = (await db.getWorkouts()).find((w) => w.id === 'B');
    b.exercises.splice(2, 0, { id: 'x1', name: 'כתף אחורית' });
    await db.put('workouts', b);
    await db.del('meta', 'migrated_noRearDeltB');
  });
  await page.reload();
  await expect(page.locator('.start-btn')).toHaveCount(2);
  let ws = await dbAll(page, 'workouts');
  expect(ws.find((w) => w.id === 'B').exercises.map((e) => e.name)).toEqual(B);
  expect(ws.find((w) => w.id === 'A').exercises.map((e) => e.name)).toEqual(A);
  // user re-adds it to B: must stay after another reload
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const b = (await db.getWorkouts()).find((w) => w.id === 'B');
    b.exercises.push({ id: 'x2', name: 'כתף אחורית' });
    await db.put('workouts', b);
  });
  await page.reload();
  await expect(page.locator('.start-btn')).toHaveCount(2);
  ws = await dbAll(page, 'workouts');
  expect(ws.find((w) => w.id === 'B').exercises.map((e) => e.name)).toContain('כתף אחורית');
});

test('add a workout with its own exercises and train it', async ({ page }) => {
  const st = await setup(page);
  await page.goto('/#/settings');
  st.prompts.push('אימון C');
  await page.getByRole('button', { name: /הוסף אימון/ }).click();
  await expect(wcard(page, 'אימון C')).toBeVisible();
  expect(await names(page)).toEqual(['אימון A', 'אימון B', 'אימון C']);
  st.prompts.push('דדליפט');
  await wcard(page, 'אימון C').getByRole('button', { name: /הוסף תרגיל/ }).click();
  await expect(wcard(page, 'אימון C').locator('.edit-row .grow')).toHaveText(['דדליפט']);
  await page.reload();
  expect(await names(page)).toEqual(['אימון A', 'אימון B', 'אימון C']);
  await page.goto('/#/');
  await expect(page.locator('.start-btn')).toHaveCount(3);
  await page.locator('.start-btn').nth(2).click();
  await expect(page.locator('.ex-name')).toHaveText(['דדליפט']);
  const c = card(page, 'דדליפט');
  await c.locator('.add-set').click();
  await fill(rows(c).first(), 100, 5);
  await page.waitForTimeout(300);
  await finish(page);
  expect((await sessionsDB(page))[0].workoutName).toBe('אימון C');
});

test('rename a workout', async ({ page }) => {
  const st = await setup(page);
  await page.goto('/#/settings');
  st.prompts.push('דחיפה');
  await page.getByRole('button', { name: 'שנה שם אימון אימון A' }).click();
  await expect(wcard(page, 'דחיפה')).toBeVisible();
  await page.reload();
  expect(await names(page)).toEqual(['דחיפה', 'אימון B']);
  await page.goto('/#/');
  await expect(page.locator('.start-btn').first()).toContainText('דחיפה');
});

test('reorder workouts persists and drives the home order', async ({ page }) => {
  await setup(page);
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'הזז את אימון B למעלה' }).click();
  await expect.poll(() => names(page)).toEqual(['אימון B', 'אימון A']);
  await expect(page.getByRole('button', { name: 'הזז את אימון B למעלה' })).toBeDisabled();
  await page.reload();
  expect(await names(page)).toEqual(['אימון B', 'אימון A']);
  await page.goto('/#/');
  await expect(page.locator('.start-btn').first()).toContainText('אימון B');
});

test('delete workout asks for confirmation and keeps history', async ({ page }) => {
  const st = await setup(page);
  await logQuick(page, 'B', 'פטישים', 20, 12);
  await page.goto('/#/settings');
  st.confirm = false;
  await page.getByRole('button', { name: 'מחק אימון אימון B' }).click();
  await page.waitForTimeout(300);
  expect(await names(page)).toEqual(['אימון A', 'אימון B']);
  st.confirm = true;
  await page.getByRole('button', { name: 'מחק אימון אימון B' }).click();
  await expect(page.locator('.workout-card')).toHaveCount(1);
  await page.reload();
  expect(await names(page)).toEqual(['אימון A']);
  const s = await sessionsDB(page);
  expect(s).toHaveLength(1);
  expect(s[0].workoutName).toBe('אימון B');
  await page.goto('/#/history');
  await expect(page.locator('.card', { hasText: 'אימון B' }).first()).toBeVisible();
  await page.goto('/#/');
  await expect(page.locator('.start-btn')).toHaveCount(1);
  await page.locator('.card.row', { hasText: 'אימון B' }).first().click();
  await expect(card(page, 'פטישים')).toBeVisible();
  await page.goto('/#/progress');
  await expect(page.locator('option[value="פטישים"]')).toHaveCount(1);
});
