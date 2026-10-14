const { test, expect } = require('@playwright/test');
const { setup, card, rows, inputs, fill, startWorkout, finish, sessionsDB } = require('./helpers');

const EX = 'חזה עליון';
const mk = (id, date, sets, extra = {}) => ({ id, workoutId: 'A', workoutName: 'אימון A', date, created: Date.parse(date + 'T10:00:00'), done: true, exercises: [{ name: EX, sets }], ...extra });
const seed = (page, s) => page.evaluate(async (x) => (await import('/js/db.js')).put('sessions', x), s);
const setMeta = (page, k, v) => page.evaluate(async ([a, b]) => (await import('/js/db.js')).setMeta(a, b), [k, v]);
const today = (page) => page.evaluate(async () => (await import('/js/util.js')).todayISO());
const addBodyWeight = (page, kg) => page.evaluate(async (v) => {
  const d = await import('/js/db.js');
  const f = (await d.getFields()).find((x) => x.name === 'משקל גוף');
  await d.put('measurements', { id: 'bw1', date: '2025-01-01', values: { [f.id]: v } });
}, kg);
const sets3 = (w, r) => [{ weight: w, reps: r }, { weight: w, reps: r }, { weight: w, reps: r }];
const chk = (c, i = 0) => rows(c).nth(i).locator('.chk');
async function addSet(c, w, r) {
  await c.locator('.add-set').click();
  const n = await rows(c).count();
  await fill(rows(c).nth(n - 1), w, r);
  await c.page().waitForTimeout(450);
}

test('stats: formulas', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const s = await import('/js/stats.js');
    return {
      e100x5: s.epley(100, 5), e1: s.epley(80, 1), e31: s.epley(50, 31), e0: s.epley(0, 5),
      best: s.best1RM([{ weight: 60, reps: 10 }, { weight: 100, reps: 3 }]),
      kcal: s.calories(5, 80, 3600e3), kcalNo: s.calories(5, null, 3600e3),
      sugg: s.suggestProgression(sets(60, 12), { min: 8, max: 12 }, 2.5), suggNo: s.suggestProgression([{ weight: 60, reps: 12 }, { weight: 60, reps: 11 }], { min: 8, max: 12 }, 2.5),
      suggNone: s.suggestProgression([], { min: 8, max: 12 }, 2.5),
      range: s.repRange([{ id: 'A', exercises: [{ name: 'x', minReps: 6, maxReps: 10 }] }], 'A', 'x'), rangeDef: s.repRange([], 'A', 'x'),
      cmpUp: s.compare([{ weight: 65, reps: 8 }], [{ weight: 60, reps: 8 }]), cmpDown: s.compare([{ weight: 55, reps: 8 }], [{ weight: 60, reps: 8 }]),
      cmpSame: s.compare([{ weight: 60, reps: 8 }], [{ weight: 60, reps: 8 }]), cmpVol: s.compare([{ weight: 60, reps: 9 }], [{ weight: 60, reps: 8 }]), cmpNew: s.compare([{ weight: 60, reps: 8 }], null),
      dur: s.fmtDuration(3725000), durCap: s.durationMs({ created: 1 }, 99 * 3600e3),
      wk: s.weekStart('2025-01-11'), // Saturday -> Sunday 5th
      cells: s.monthCells(2025, 0).filter(Boolean).length, pad: s.monthCells(2025, 0).indexOf('2025-01-01'),
    };
    function sets(w, n) { return [1, 2, 3].map(() => ({ weight: w, reps: n })); }
  });
  expect(r.e100x5).toBeCloseTo(116.67, 2);
  expect(r.e1).toBe(80);
  expect(r.e31).toBe(0);
  expect(r.e0).toBe(0);
  expect(r.best).toBeCloseTo(110, 2);
  expect(r.kcal).toBe(400);
  expect(r.kcalNo).toBeNull();
  expect(r.sugg).toMatchObject({ weight: 62.5, from: 60 });
  expect(r.suggNo).toBeNull();
  expect(r.suggNone).toBeNull();
  expect(r.range).toEqual({ min: 6, max: 10 });
  expect(r.rangeDef).toEqual({ min: 8, max: 12 });
  expect([r.cmpUp, r.cmpDown, r.cmpSame, r.cmpVol, r.cmpNew]).toEqual(['up', 'down', 'same', 'up', 'new']);
  expect(r.dur).toBe('1:02:05');
  expect(r.durCap).toBe(4 * 3600e3);
  expect(r.wk).toBe('2025-01-05');
  expect(r.cells).toBe(31);
  expect(r.pad).toBe(3); // 1 Jan 2025 is a Wednesday
});

test('stats: personal records logic', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const s = await import('/js/stats.js');
    const hist = [[{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }]];
    return {
      heavier: s.prsFor([{ weight: 62.5, reps: 5, done: true }], hist, { onlyDone: true }).flags,
      moreReps: s.prsFor([{ weight: 60, reps: 11, done: true }], hist, { onlyDone: true }).flags,
      lighterMoreReps: s.prsFor([{ weight: 50, reps: 11, done: true }], hist, { onlyDone: true }).flags,
      lighterFewer: s.prsFor([{ weight: 50, reps: 9, done: true }], hist, { onlyDone: true }).flags,
      same: s.prsFor([{ weight: 60, reps: 10, done: true }], hist, { onlyDone: true }).flags,
      notDone: s.prsFor([{ weight: 70, reps: 10 }], hist, { onlyDone: true }).flags,
      volume: s.prsFor([{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }], hist).volume,
      noVolume: s.prsFor([{ weight: 60, reps: 8 }], hist).volume,
      noHistory: s.prsFor([{ weight: 100, reps: 10, done: true }], [], { onlyDone: true }),
      twice: s.prsFor([{ weight: 70, reps: 5, done: true }, { weight: 70, reps: 5, done: true }], hist, { onlyDone: true }).flags,
    };
  });
  expect(r.heavier).toEqual([['weight']]);
  expect(r.moreReps).toEqual([['reps']]);
  expect(r.lighterMoreReps).toEqual([['reps']]);
  expect(r.lighterFewer).toEqual([[]]);
  expect(r.same).toEqual([[]]);
  expect(r.notDone).toEqual([[]]);
  expect(r.volume).toBe(true);
  expect(r.noVolume).toBe(false);
  expect(r.noHistory.count).toBe(0);
  expect(r.twice).toEqual([['weight'], []]); // only the first set to beat the record is flagged
});

test('✓ per set: starts the rest timer, vibrates, beeps path does not crash, persists', async ({ page }) => {
  await page.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
  await setup(page);
  await setMeta(page, 'restSeconds', 2);
  await startWorkout(page, 'A');
  const c = card(page, EX);
  await addSet(c, 60, 10);
  await expect(page.locator('.rest')).toHaveCount(0);
  await chk(c).click();
  await expect(page.locator('.rest')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('.rest-time')).toHaveText(/0:0[12]/);
  await expect(chk(c)).toHaveClass(/on/);
  await expect(page.locator('.rest')).toHaveAttribute('data-state', 'done', { timeout: 5000 });
  expect(await page.evaluate(() => window.__vib.length)).toBe(1);
  expect(await page.evaluate(() => Array.isArray(window.__vib[0]))).toBe(true);
  // +15 on a finished timer restarts it
  await page.getByRole('button', { name: 'הוסף 15 שניות' }).click();
  await expect(page.locator('.rest')).toHaveAttribute('data-state', 'running');
  await page.getByRole('button', { name: 'דלג על המנוחה' }).click();
  await expect(page.locator('.rest')).toHaveCount(0);
  // unchecking does not start a timer
  await page.waitForTimeout(450);
  await chk(c).click();
  await expect(chk(c)).not.toHaveClass(/on/);
  await expect(page.locator('.rest')).toHaveCount(0);
  await page.waitForTimeout(450);
  await chk(c).click(); // done again, then leave: timer must go away and done persists
  await page.waitForTimeout(300);
  const [s] = await sessionsDB(page);
  expect(s.exercises.find((e) => e.name === EX).sets[0].done).toBe(true);
  await page.reload();
  await expect(chk(card(page, EX))).toHaveClass(/on/);
  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(page.locator('.rest')).toHaveCount(0);
});

test('rest timer: adjust with −15 / +15 and default of 90 seconds', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(async () => (await (await import('/js/db.js')).getPrefs()).restSeconds)).toBe(90);
  await startWorkout(page, 'A');
  const c = card(page, EX);
  await addSet(c, 60, 10);
  await chk(c).click();
  await expect(page.locator('.rest-time')).toHaveText(/1:(30|29)/);
  await page.getByRole('button', { name: 'הוסף 15 שניות' }).click();
  await expect(page.locator('.rest-time')).toHaveText(/1:(45|44)/);
  await page.getByRole('button', { name: 'הפחת 15 שניות' }).click();
  await expect(page.locator('.rest-time')).toHaveText(/1:(30|29)/);
});

test('progression suggestion: only when every set reached the top of the range', async ({ page }) => {
  await setup(page);
  await seed(page, mk('p1', '2025-01-10', sets3(60, 12)));
  await startWorkout(page, 'A');
  const c = card(page, EX);
  await expect(c.locator('.sugg')).toContainText('62.5');
  await expect(c.locator('.prev')).toContainText('יעד 8–12');
  await c.locator('.sugg .link').click();
  await expect(rows(c)).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(inputs(rows(c).nth(i)).nth(0)).toHaveValue('62.5');
  // other exercises have no history -> no suggestion
  await expect(card(page, 'חזה רגיל').locator('.sugg')).toHaveCount(0);
  // marking a set done hides the hint
  await addSet(c, null, 12);
  await chk(c).click();
  await expect(c.locator('.sugg')).toBeHidden();
});

test('progression: no suggestion when a set fell short; range is editable per exercise in settings', async ({ page }) => {
  const state = await setup(page);
  await seed(page, mk('p2', '2025-01-10', [{ weight: 60, reps: 12 }, { weight: 60, reps: 12 }, { weight: 60, reps: 10 }]));
  await startWorkout(page, 'A');
  await expect(card(page, EX).locator('.sugg')).toHaveCount(0);
  await page.goto('/#/settings');
  const btn = page.getByRole('button', { name: `טווח חזרות ל${EX}` });
  await expect(btn).toContainText('8–12');
  state.prompts.push('6-10');
  await btn.click();
  await expect(btn).toContainText('6–10');
  const ws = await page.evaluate(async () => (await import('/js/db.js')).getWorkouts());
  expect(ws[0].exercises[0]).toMatchObject({ name: EX, minReps: 6, maxReps: 10 });
  await page.reload();
  await expect(page.getByRole('button', { name: `טווח חזרות ל${EX}` })).toContainText('6–10');
  // invalid input is rejected
  state.prompts.push('12-6');
  await page.getByRole('button', { name: `טווח חזרות ל${EX}` }).click();
  await expect(page.locator('.toast')).toContainText('טווח לא תקין');
  await expect(page.getByRole('button', { name: `טווח חזרות ל${EX}` })).toContainText('6–10');
  // with a 6-10 range, 10 reps in every set now triggers the hint (10 is the top)
  await seed(page, mk('p3', '2025-01-12', [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }]));
  await startWorkout(page, 'A');
  await expect(card(page, EX).locator('.sugg')).toContainText('62.5');
  await expect(card(page, EX).locator('.prev')).toContainText('יעד 6–10');
});

test('personal record: highlight + toast when beating a record, none for a lighter set', async ({ page }) => {
  await setup(page);
  await seed(page, mk('r1', '2025-01-10', [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }]));
  await startWorkout(page, 'A');
  const c = card(page, EX);
  await addSet(c, 50, 8);
  await chk(c, 0).click();
  await expect(chk(c, 0)).not.toHaveClass(/pr/);
  await addSet(c, 65, 5);
  await chk(c, 1).click();
  await expect(chk(c, 1)).toHaveClass(/pr/);
  await expect(chk(c, 1)).toHaveText('🏆');
  await expect(page.locator('.toast')).toContainText('שיא משקל');
  await expect(c.locator('.badge')).toContainText('🏆');
  // unchecking removes the highlight
  await page.waitForTimeout(450);
  await chk(c, 1).click();
  await expect(chk(c, 1)).not.toHaveClass(/pr/);
});

test('first time ever for an exercise: nothing to beat, so no record', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, EX);
  await addSet(c, 100, 10);
  await chk(c).click();
  await expect(chk(c)).not.toHaveClass(/pr/);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('end-of-session summary: up / down / same / new vs last time, records, duration, calories', async ({ page }) => {
  await setup(page);
  await addBodyWeight(page, 80);
  const last = {
    id: 'h1', workoutId: 'A', workoutName: 'אימון A', date: '2025-01-10', created: Date.parse('2025-01-10T10:00:00'), done: true,
    exercises: [
      { name: 'חזה עליון', sets: [{ weight: 60, reps: 10 }] },
      { name: 'חזה רגיל', sets: [{ weight: 80, reps: 10 }] },
      { name: 'פרפר בכבלים', sets: [{ weight: 30, reps: 10 }] },
    ],
  };
  await seed(page, last);
  await startWorkout(page, 'A');
  // make the session look 30 minutes old so duration/calories are predictable
  await page.evaluate(async () => {
    const d = await import('/js/db.js');
    const [s] = (await d.getSessions()).filter((x) => !x.done);
    s.created = Date.now() - 30 * 60e3; await d.put('sessions', s);
  });
  await page.reload();
  await expect(page.locator('.sess-time')).toContainText(/⏱ 30:\d\d/);
  await expect(page.locator('.sess-kcal')).toContainText('≈ 200');
  await expect(page.locator('.sess-kcal')).toContainText('הערכה');
  await addSet(card(page, 'חזה עליון'), 65, 8);
  await addSet(card(page, 'חזה רגיל'), 70, 10);
  await addSet(card(page, 'פרפר בכבלים'), 30, 10);
  await addSet(card(page, 'כתף אחורית'), 10, 12);
  await page.getByRole('button', { name: 'סיים אימון' }).click();
  await expect(page.locator('.summary')).toBeVisible();
  const row = (n) => page.locator('.sum-row', { hasText: n });
  await expect(row('חזה עליון').locator('.sum-arrow')).toHaveClass(/up/);
  await expect(row('חזה רגיל').locator('.sum-arrow')).toHaveClass(/down/);
  await expect(row('פרפר בכבלים').locator('.sum-arrow')).toHaveClass(/same/);
  await expect(row('כתף אחורית').locator('.sum-arrow')).toHaveClass(/new/);
  await expect(row('חזה עליון')).toContainText('שיא משקל');
  await expect(page.locator('.sum-prs b')).toHaveText('1');
  await expect(page.locator('.sum-duration b')).toHaveText(/^30:\d\d$/);
  await expect(page.locator('.sum-kcal')).toContainText('≈ 200');
  await expect(page.locator('.sum-kcal')).toContainText('הערכה בלבד');
  // stored duration + end time
  const s = (await sessionsDB(page)).find((x) => x.done && x.id !== 'h1');
  expect(s.durationMs).toBeGreaterThan(29 * 60e3);
  expect(s.endedAt).toBeGreaterThan(s.created);
  await page.locator('.summary-close').click();
  await expect(page.locator('.start-grid')).toBeVisible();
  // re-opening a finished session shows its saved duration and does not show the summary again on save
  await page.goto(`/#/session/${s.id}`);
  await expect(page.locator('.sess-time')).toContainText('30:');
  await page.getByRole('button', { name: 'שמור וסגור' }).click();
  await expect(page.locator('.start-grid')).toBeVisible();
});

test('calories need a body weight: summary says so instead of guessing', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await addSet(card(page, EX), 60, 10);
  await page.getByRole('button', { name: 'סיים אימון' }).click();
  await expect(page.locator('.sum-kcal')).toContainText('משקל גוף');
  await expect(page.locator('.sum-kcal')).not.toContainText('≈');
});

test('session timer counts up while logging', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  await expect(page.locator('.sess-time')).toContainText('00:0');
  const t1 = await page.locator('.sess-time').innerText();
  await page.waitForTimeout(2100);
  expect(await page.locator('.sess-time').innerText()).not.toBe(t1);
});

test('1RM (Epley) appears in progress charts', async ({ page }) => {
  await setup(page);
  await seed(page, mk('e1', '2025-01-10', [{ weight: 100, reps: 5 }]));
  await seed(page, mk('e2', '2025-01-17', [{ weight: 100, reps: 3 }, { weight: 90, reps: 10 }]));
  await page.goto('/#/progress');
  await page.getByRole('button', { name: '1RM משוער' }).click();
  await expect(page.locator('.e1rm-note')).toContainText('Epley');
  await expect(page.locator('.pr')).toContainText('120'); // best of 100x3=110 and 90x10=120
    await expect(page.locator('.chart').first()).toContainText('120'); // 90 x 10
});

test('consistency calendar + workouts per week', async ({ page }) => {
  await setup(page);
  const t = await today(page);
  const [y, m] = t.split('-');
  await seed(page, mk('c1', `${y}-${m}-01`, [{ weight: 60, reps: 10 }]));
  await seed(page, mk('c2', t, [{ weight: 60, reps: 10 }], { created: Date.now() }));
  await seed(page, mk('c3', '2020-03-05', [{ weight: 60, reps: 10 }]));
  await seed(page, { ...mk('c4', `${y}-${m}-02`, []), exercises: [{ name: EX, sets: [] }] }); // empty session must not count
  await page.goto('/#/progress');
  const days = [...new Set([`${y}-${m}-01`, t])];
  await expect(page.locator('.cal-day.on')).toHaveCount(days.length);
  await expect(page.locator(`.cal-day.on[data-date="${t}"]`)).toBeVisible();
  await expect(page.locator('.cal-day.today')).toHaveCount(1);
  await expect(page.locator('.cal .cal-sum').first()).toContainText(`${days.length} ימי אימון`);
  // this week's bar has at least the one workout of today
  const bars = page.locator('.wk');
  await expect(bars).toHaveCount(12);
  await expect(bars.last()).toHaveAttribute('data-count', /[1-9]/);
  // previous month navigation
  await page.getByRole('button', { name: 'חודש קודם' }).click();
  await expect(page.locator('.cal-day.today')).toHaveCount(0);
  await page.getByRole('button', { name: 'חודש הבא' }).click();
  await expect(page.locator('.cal-day.today')).toHaveCount(1);
});

test('exercise note: saved, then shown next time', async ({ page }) => {
  await setup(page);
  await startWorkout(page, 'A');
  const c = card(page, EX);
  await addSet(c, 60, 10);
  await c.locator('.note').fill('הכתף כאבה, להוריד את הספסל');
  await page.waitForTimeout(400);
  let [s] = await sessionsDB(page);
  expect(s.exercises.find((e) => e.name === EX).note).toBe('הכתף כאבה, להוריד את הספסל');
  await page.reload();
  await expect(card(page, EX).locator('.note')).toHaveValue('הכתף כאבה, להוריד את הספסל');
  await finish(page);
  // earlier date so the next session is "later"
  await page.evaluate(async () => { const d = await import('/js/db.js'); const [x] = await d.getSessions(); x.date = '2025-02-01'; await d.put('sessions', x); });
  await startWorkout(page, 'A');
  await expect(card(page, EX).locator('.prev-note')).toContainText('הכתף כאבה');
  await expect(card(page, 'חזה רגיל').locator('.prev-note')).toHaveCount(0);
  // clearing a note removes it from storage
  await addSet(card(page, 'חזה רגיל'), 50, 10);
  await card(page, 'חזה רגיל').locator('.note').fill('x');
  await card(page, 'חזה רגיל').locator('.note').fill('   ');
  await page.waitForTimeout(400);
  await finish(page);
  [s] = (await sessionsDB(page)).filter((x) => x.date !== '2025-02-01');
  expect(s.exercises.find((e) => e.name === 'חזה רגיל').note).toBeUndefined();
});

test('preferences: saved in storage, validated, included in backup', async ({ page }) => {
  await setup(page);
  await page.goto('/#/settings');
  const rest = page.getByLabel('זמן מנוחה');
  await rest.fill('120');
  await rest.blur();
  await expect(page.locator('.toast')).toContainText('נשמר');
  await rest.fill('abc');
  await rest.blur();
  await expect(rest).toHaveValue('120');
  await page.getByLabel('קפיצת משקל מוצעת').fill('5');
  await page.getByLabel('קפיצת משקל מוצעת').blur();
  await page.reload();
  await expect(page.getByLabel('זמן מנוחה')).toHaveValue('120');
  const exp = await page.evaluate(async () => (await import('/js/db.js')).exportAll());
  expect(exp.prefs).toEqual({ restSeconds: 120, increment: 5, met: 5 });
  // import restores them
  await page.evaluate(async () => { const d = await import('/js/db.js'); await d.setMeta('restSeconds', 30); });
  await page.evaluate(async (data) => (await import('/js/db.js')).importAll(data), exp);
  expect(await page.evaluate(async () => (await (await import('/js/db.js')).getPrefs()).restSeconds)).toBe(120);
  // old backups without prefs still import
  const old = { ...exp }; delete old.prefs;
  await page.evaluate(async (data) => (await import('/js/db.js')).importAll(data), old);
});

test('no stray "null" text on screens', async ({ page }) => {
  await setup(page);
  await seed(page, mk('n1', '2025-01-10', sets3(60, 8)));
  await startWorkout(page, 'A');
  for (const hash of [null, '#/progress', '#/settings', '#/history']) {
    if (hash) await page.goto('/' + hash);
    await expect(page.locator('main')).not.toContainText('null');
    await expect(page.locator('main')).not.toContainText('undefined');
  }
});
