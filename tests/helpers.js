const { expect } = require('@playwright/test');

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

module.exports = { A, B, dbAll, sessionsDB, setup, card, rows, inputs, fill, startWorkout, finish, logQuick };
