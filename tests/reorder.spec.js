const { test, expect } = require('@playwright/test');
const { A, dbAll, sessionsDB, setup, card, rows, fill, startWorkout, finish } = require('./helpers');

const wCard = (page, name) => page.locator('.card', { has: page.locator('h3', { hasText: name }) });
const wNames = async (page, id = 'A') => (await dbAll(page, 'workouts')).find((w) => w.id === id).exercises.map((e) => e.name);
const handle = (loc) => loc.locator('.drag-handle').first();
const centerY = async (loc) => { const b = await loc.boundingBox(); return b.y + b.height / 2; };

// Real touch gesture through CDP: press, optionally hold, then move to the vertical center (+offset) of `target`.
// `target` is measured after the hold, because the session list collapses cards while dragging.
async function touchDrag(page, from, target, { hold = 500, offset = 0, steps = 8 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await from.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await from.boundingBox();
  const x = b.x + b.width / 2, y0 = b.y + b.height / 2;
  const send = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await send('touchStart', y0);
  await page.waitForTimeout(hold);
  const y1 = (await centerY(target)) + offset;
  for (let i = 1; i <= steps; i++) { await send('touchMove', y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(16); }
  await send('touchEnd', y1);
  await page.waitForTimeout(250);
}

async function addOneTime(page, name, { permanent = false } = {}) {
  await page.locator('.add-ex').click();
  await page.getByLabel('שם התרגיל').fill(name);
  if (permanent) await page.getByRole('switch', { name: /באופן קבוע/ }).check();
  await page.getByRole('button', { name: 'הוסף תרגיל', exact: true }).click();
  await expect(card(page, name)).toBeVisible();
}

async function logSet(page, name, w, r) {
  const c = card(page, name);
  await c.locator('.add-set').click();
  await fill(rows(c).first(), w, r);
  await page.waitForTimeout(400);
}

test('settings: drag a handle with the mouse reorders and persists', async ({ page }) => {
  await setup(page);
  await page.goto('/#/settings');
  const rowsA = wCard(page, 'אימון A').locator('.edit-row');
  const fb = await handle(rowsA.nth(0)).boundingBox(), tb = await rowsA.nth(2).boundingBox();
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.mouse.move(fb.x + fb.width / 2, tb.y + tb.height * 0.8, { steps: 8 });
  await page.mouse.up();
  const want = [A[1], A[2], A[0], ...A.slice(3)];
  await expect.poll(() => wNames(page)).toEqual(want);
  await page.reload();
  await expect(wCard(page, 'אימון A').locator('.edit-row .grow')).toHaveText(want);
});

test('settings: touch long-press then drag reorders; the order is used by the next session', async ({ page }) => {
  await setup(page);
  await page.goto('/#/settings');
  const rowsA = wCard(page, 'אימון A').locator('.edit-row');
  await touchDrag(page, handle(rowsA.nth(1)), rowsA.nth(0), { offset: -12 }); // 2nd above 1st
  const want = [A[1], A[0], ...A.slice(2)];
  await expect.poll(() => wNames(page)).toEqual(want);
  await startWorkout(page, 'A');
  await expect(page.locator('.ex-name')).toHaveText(want);
});

test('settings: a quick swipe without long-press does not reorder; long-press drag to the end does', async ({ page }) => {
  await setup(page);
  await page.goto('/#/settings');
  const rowsA = wCard(page, 'אימון A').locator('.edit-row');
  await touchDrag(page, handle(rowsA.nth(0)), rowsA.nth(5), { hold: 0, offset: 10 });
  await page.waitForTimeout(300);
  expect(await wNames(page)).toEqual(A);
  await touchDrag(page, handle(rowsA.nth(0)), rowsA.nth(5), { offset: 10 });
  await expect.poll(() => wNames(page)).toEqual([...A.slice(1), A[0]]);
});

test('settings: works inside another workout and leaves the others alone', async ({ page }) => {
  await setup(page);
  await page.goto('/#/settings');
  const rowsB = wCard(page, 'אימון B').locator('.edit-row');
  await touchDrag(page, handle(rowsB.nth(1)), rowsB.nth(0), { offset: -12 });
  await expect.poll(async () => (await wNames(page, 'B')).slice(0, 2)).toEqual(['כפיפות מרפקים יד יד', 'פולי עליון רחב']);
  expect(await wNames(page)).toEqual(A);
});

test('session: touch drag reorders only this session; "save as default" persists it', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await expect(page.locator('.order-save')).toBeHidden();
  await touchDrag(page, handle(card(page, A[2])), card(page, A[0]), { offset: -10 });
  const want = [A[2], A[0], A[1], ...A.slice(3)];
  await expect(page.locator('.ex-name')).toHaveText(want);
  await expect(page.locator('.order-save')).toBeVisible();
  expect(await wNames(page)).toEqual(A); // workout untouched so far
  await logSet(page, A[0], 50, 8); // gives the session data so it is kept on reload
  await page.reload();
  await expect(page.locator('.ex-name')).toHaveText(want);
  await expect(page.locator('.order-save')).toBeVisible();
  await page.locator('.order-save').click();
  await expect(page.locator('.order-save')).toBeHidden();
  expect(await wNames(page)).toEqual(want);
  await finish(page);
  await startWorkout(page, 'A');
  await expect(page.locator('.ex-name')).toHaveText(want);
});

test('session: reordering without saving leaves the default order for the next session', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await handle(card(page, A[0])).press('ArrowDown');
  await expect(page.locator('.ex-name').first()).toHaveText(A[1]);
  await logSet(page, A[1], 40, 10);
  await finish(page);
  expect(await wNames(page)).toEqual(A);
  await startWorkout(page, 'A');
  await expect(page.locator('.ex-name')).toHaveText(A);
});

test('session: add-exercise toggle is off by default; a one-time exercise stays out of the workout', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await page.locator('.add-ex').click();
  await expect(page.getByRole('switch', { name: /באופן קבוע/ })).not.toBeChecked();
  await page.getByLabel('שם התרגיל').fill('הרמה צידית');
  await page.getByRole('button', { name: 'הוסף תרגיל', exact: true }).click();
  await expect(card(page, 'הרמה צידית')).toBeVisible();
  expect(await wNames(page)).toEqual(A);
  await expect(card(page, 'הרמה צידית').locator('.make-perm')).toBeVisible();
  await expect(card(page, A[0]).locator('.make-perm')).toBeHidden();
});

test('session: toggle on adds it to the end of the workout and the next session uses it', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await addOneTime(page, 'הרמה צידית', { permanent: true });
  await expect(card(page, 'הרמה צידית').locator('.make-perm')).toBeHidden();
  expect(await wNames(page)).toEqual([...A, 'הרמה צידית']);
  await logSet(page, 'הרמה צידית', 12, 15);
  await finish(page);
  await startWorkout(page, 'A');
  await expect(page.locator('.ex-name').last()).toHaveText('הרמה צידית');
  await expect(card(page, 'הרמה צידית').locator('.prev')).toContainText('12×15');
});

test('"make permanent" later from a past session keeps the history and goes to the end of the list', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await addOneTime(page, 'הרמה צידית');
  await logSet(page, 'הרמה צידית', 9, 12);
  await finish(page);
  await page.goto('/#/history');
  await page.locator('.hist').first().click();
  await card(page, 'הרמה צידית').locator('.make-perm').click();
  await expect(card(page, 'הרמה צידית').locator('.make-perm')).toBeHidden();
  expect(await wNames(page)).toEqual([...A, 'הרמה צידית']);
  await startWorkout(page, 'A');
  await expect(page.locator('.ex-name').last()).toHaveText('הרמה צידית');
  await expect(card(page, 'הרמה צידית').locator('.prev')).toContainText('9×12');
});

test('summary: "make permanent" button on a one-time exercise', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await addOneTime(page, 'הרמה צידית');
  await logSet(page, 'הרמה צידית', 9, 12);
  await page.getByRole('button', { name: /סיים אימון/ }).click();
  await expect(page.locator('.summary-close')).toBeVisible();
  await expect(page.locator('.sum-row .make-perm')).toHaveCount(1);
  await page.locator('.sum-row .make-perm').click();
  await expect(page.locator('.perm-done')).toBeVisible();
  expect(await wNames(page)).toEqual([...A, 'הרמה צידית']);
  expect((await sessionsDB(page))[0].exercises.find((e) => e.name === 'הרמה צידית').sets).toHaveLength(1);
});

test('session: long-press (cards collapse) does not reorder until the finger moves; dragging up moves the card up', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const h = page.locator('.drag-handle').nth(1);
  await h.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await h.boundingBox(), x = b.x + b.width / 2, y0 = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const names = () => page.locator('.ex-name').allTextContents();
  await send('touchStart', y0);
  await page.waitForTimeout(600);
  expect(await names()).toEqual(A.slice(0, 6));
  for (let i = 1; i <= 15; i++) { await send('touchMove', y0 - i * 8); await page.waitForTimeout(16); }
  await send('touchEnd', y0 - 120);
  await page.waitForTimeout(300);
  expect((await names()).slice(0, 2)).toEqual([A[1], A[0]]);
});
