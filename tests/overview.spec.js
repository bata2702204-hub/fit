const { test, expect } = require('@playwright/test');
const { setup } = require('./helpers');

const seed = (page, s) => page.evaluate(async (x) => (await import('/js/db.js')).put('sessions', x), s);
const mk = (id, date, exercises) => ({ id, workoutId: 'A', workoutName: 'אימון A', date, created: Date.parse(date + 'T10:00:00'), done: true,
  exercises: exercises.map(([name, sets]) => ({ name, sets: sets.map(([weight, reps]) => ({ weight, reps })) })) });
const call = (page, fn, ...args) => page.evaluate(async ([f, a]) => { const s = await import('/js/stats.js'); return s[f](...a); }, [fn, args]);

const S = [
  mk('p1', '2025-02-10', [['UP', [[40, 10]]], ['DOWN', [[50, 10]]]]),
  mk('m1', '2025-03-03', [['UP', [[50, 10], [50, 8]]], ['DOWN', [[60, 10]]], ['FLAT', [[30, 10]]], ['ONCE', [[20, 10]]]]),
  mk('m2', '2025-03-12', [['UP', [[60, 10]]], ['DOWN', [[54, 10]]], ['FLAT', [[30, 12]]]]),
  mk('m3', '2025-03-25', [['UP', [[55, 10]]], ['DOWN', [[48, 10]]], ['FLAT', [[30, 8]]]]),
];

test('monthlyOverview: change, sorting, counts, volumes, insufficient data', async ({ page }) => {
  await setup(page);
  const o = await call(page, 'monthlyOverview', S, '2025-03', '2025-02');
  const by = Object.fromEntries(o.exercises.map((e) => [e.name, e]));
  expect(by.UP).toMatchObject({ start: 50, end: 55, change: 10, trend: 'up', tops: [50, 60, 55], sets: 4, prevSets: 1, volume: 2050 });
  expect(by.DOWN).toMatchObject({ start: 60, end: 48, change: -20, trend: 'down', prevVolume: 500 });
  expect(by.FLAT).toMatchObject({ change: 0, trend: 'same' });
  expect(by.ONCE).toMatchObject({ change: null, trend: null, tops: [20] });
  expect(o.exercises.map((e) => e.name)).toEqual(['UP', 'FLAT', 'DOWN', 'ONCE']); // biggest gain first, no-data last
  expect([o.improved, o.same, o.dropped, o.insufficient]).toEqual([1, 1, 1, 1]);
  expect([o.workouts, o.prevWorkouts]).toEqual([3, 1]);
  expect(o.prevVolume).toBe(900);
  expect(o.volume).toBe(o.exercises.reduce((a, e) => a + e.volume, 0));
});

test('monthlyOverview: empty month and month helpers', async ({ page }) => {
  await setup(page);
  const o = await call(page, 'monthlyOverview', S, '2024-01', '2023-12');
  expect(o.exercises).toEqual([]);
  expect(o.workouts).toBe(0);
  expect(await call(page, 'prevMonth', 2025, 0)).toEqual({ y: 2024, m: 11 });
  expect(await call(page, 'monthKey', 2025, 2)).toBe('2025-03');
});

test('progress screen: overview defaults to current month and navigates', async ({ page }) => {
  await setup(page);
  const [y, m] = await page.evaluate(async () => (await import('/js/util.js')).todayISO().split('-'));
  const prev = await page.evaluate(([yy, mm]) => { const d = new Date(+yy, +mm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }, [y, m]);
  await seed(page, mk('a1', `${prev}-05`, [['UP', [[40, 10]]]]));
  await seed(page, mk('a2', `${y}-${m}-01`, [['UP', [[50, 10]]], ['DOWN', [[60, 10]]], ['ONCE', [[20, 10]]]]));
  await seed(page, mk('a3', `${y}-${m}-02`, [['UP', [[55, 10]]], ['DOWN', [[54, 10]]]]));
  await page.goto('/#/progress');
  const box = page.locator('.overview');
  await expect(box).toHaveAttribute('data-month', `${y}-${m}`);
  await expect(box.locator('.ov-counts')).toContainText('1 השתפרו');
  await expect(box.locator('.ov-counts')).toContainText('1 ירדו');
  await expect(box).toContainText('אימונים: 2 (חודש קודם: 1)');
  // bar chart: sorted gain -> drop, with colors and percentages
  await expect(box.locator('.ov-bar-row').locator('span')).toHaveText(['UP', 'DOWN', 'ONCE']);
  await expect(box.locator('.ov-bar-row[data-name="UP"] b')).toHaveText('+10%');
  await expect(box.locator('.ov-bar-row[data-name="UP"] .ov-bar')).toHaveClass(/up/);
  await expect(box.locator('.ov-bar-row[data-name="DOWN"] b')).toHaveText('-10%');
  await expect(box.locator('.ov-bar-row[data-name="DOWN"] .ov-bar')).toHaveClass(/down/);
  // rows: range, sets/volume vs last month, sparkline
  const up = box.locator('.ov-row[data-name="UP"]');
  await expect(up).toContainText('50 → 55 ק״ג');
  await expect(up).toContainText('סטים: 2 (קודם 1)');
  await expect(up.locator('svg.spark path')).toHaveCount(1);
  // fewer than 2 sessions: "not enough data", no bar
  await expect(box.locator('.ov-bar-row[data-name="ONCE"] b')).toHaveText('אין מספיק נתונים');
  await expect(box.locator('.ov-bar-row[data-name="ONCE"] .ov-bar')).toHaveCount(0);
  await expect(box.locator('.ov-row[data-name="ONCE"]')).toContainText('אין מספיק נתונים');
  // previous month: only one session there -> not enough data; next month back again
  await box.getByRole('button', { name: 'חודש קודם (סיכום)' }).click();
  await expect(box).toHaveAttribute('data-month', prev);
  await expect(box.locator('.ov-bar-row[data-name="UP"] b')).toHaveText('אין מספיק נתונים');
  await box.getByRole('button', { name: 'חודש הבא (סיכום)' }).click();
  await expect(box).toHaveAttribute('data-month', `${y}-${m}`);
  // existing per-exercise chart still there
  await expect(page.locator('select.sel').first()).toBeVisible();
  await expect(page.locator('svg.chart').first()).toBeVisible();
});

test('progress screen: month with no workouts shows an empty message', async ({ page }) => {
  await setup(page);
  await page.goto('/#/progress');
  await expect(page.locator('.overview .ov-empty')).toBeVisible();
});
