// Pure calculations (no DOM, no storage) so they can be unit-tested.
export const DEFAULT_RANGE = { min: 8, max: 12 };
export const MAX_SESSION_MS = 4 * 3600e3; // a session left open for a day must not produce a 24h workout

const has = (s) => s.weight != null || s.reps != null;
const round2 = (n) => Math.round(n * 100) / 100;

// Epley: w * (1 + reps/30). One rep is the weight itself. Above 30 reps the formula is meaningless.
export const epley = (w, r) => (!(w > 0) || !(r > 0) || r > 30 ? 0 : r === 1 ? w : round2(w * (1 + r / 30)));
export const best1RM = (sets) => Math.max(0, ...sets.map((s) => epley(s.weight, s.reps)));

export function repRange(workouts, workoutId, name) {
  const e = workouts.find((w) => w.id === workoutId)?.exercises.find((x) => x.name === name);
  return { min: e?.minReps ?? DEFAULT_RANGE.min, max: e?.maxReps ?? DEFAULT_RANGE.max };
}

// Double progression: every working set of last time reached the top of the range -> add weight.
export function suggestProgression(prevSets, range, increment) {
  const sets = (prevSets || []).filter(has);
  if (!sets.length) return null;
  if (!sets.every((s) => s.weight > 0 && s.reps >= range.max)) return null;
  const top = Math.max(...sets.map((s) => s.weight));
  return { weight: round2(top + increment), from: top, count: sets.length };
}

// Sessions that happened before `session` (older date, or same date but created earlier).
export const earlier = (sessions, session) => sessions.filter((s) => s.id !== session.id
  && (s.date < session.date || (s.date === session.date && (s.created || 0) < (session.created || 0))));

/* Personal records of one exercise against earlier history (array of set-arrays).
   Per set: 'weight' = heavier than anything before; 'reps' = more reps than any earlier set at the same or higher weight.
   volume = total exercise volume beats every earlier session. No history => no records (nothing to beat). */
export function prsFor(sets, history, { onlyDone = false } = {}) {
  const elig = (s) => (onlyDone ? s.done : has(s));
  const none = { flags: sets.map(() => []), volume: false, count: 0 };
  const bases = history.flat().filter((s) => s.weight > 0 && s.reps > 0).map((s) => ({ w: s.weight, r: s.reps }));
  if (!bases.length) return none;
  const flags = sets.map(() => []);
  sets.forEach((s, i) => {
    if (!elig(s) || !(s.weight > 0 && s.reps > 0)) return;
    if (bases.every((b) => b.w < s.weight)) flags[i].push('weight');
    else {
      const same = bases.filter((b) => b.w >= s.weight);
      if (s.reps > Math.max(...same.map((b) => b.r))) flags[i].push('reps');
    }
    bases.push({ w: s.weight, r: s.reps });
  });
  const vol = (arr) => arr.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
  const cur = vol(sets.filter(elig));
  const bestBefore = Math.max(0, ...history.map(vol));
  const volumePR = cur > 0 && bestBefore > 0 && cur > bestBefore;
  return { flags, volume: volumePR, count: flags.filter((f) => f.length).length + (volumePR ? 1 : 0) };
}

// 'new' | 'up' | 'down' | 'same' — top weight first, then total volume.
export function compare(sets, prevSets) {
  const d = (a) => a.filter(has);
  const cur = d(sets), prev = prevSets ? d(prevSets) : [];
  if (!prev.length) return 'new';
  const top = (a) => Math.max(0, ...a.map((s) => s.weight || 0));
  const vol = (a) => a.reduce((x, s) => x + (s.weight || 0) * (s.reps || 0), 0);
  if (top(cur) !== top(prev)) return top(cur) > top(prev) ? 'up' : 'down';
  if (vol(cur) !== vol(prev)) return vol(cur) > vol(prev) ? 'up' : 'down';
  return 'same';
}

export const durationMs = (session, now = Date.now()) => {
  if (session.durationMs != null) return session.durationMs;
  if (session.done || !session.created) return null;
  return Math.min(Math.max(0, now - session.created), MAX_SESSION_MS);
};

export const fmtDuration = (ms) => {
  const t = Math.floor(ms / 1000), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
};

// kcal ≈ MET × body weight (kg) × hours. An estimate only.
export const calories = (met, kg, ms) => (met > 0 && kg > 0 && ms > 0 ? Math.round((met * kg * ms) / 3600e3) : null);

export function latestBodyWeight(fields, measurements) {
  const f = fields.find((x) => x.name === 'משקל גוף');
  if (!f) return null;
  const m = measurements.filter((x) => x.values[f.id] > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  return m ? m.values[f.id] : null;
}

// ---- consistency ----
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const weekStart = (isoDate) => { const d = parse(isoDate); d.setDate(d.getDate() - d.getDay()); return iso(d); }; // Sunday

export const hasWork = (s) => s.exercises.some((e) => e.sets.some(has));

// last `n` weeks ending with the week of `todayISO`, oldest first
export function weeklyCounts(sessions, todayISO, n = 12) {
  const counts = new Map();
  for (const s of sessions.filter(hasWork)) { const k = weekStart(s.date); counts.set(k, (counts.get(k) || 0) + 1); }
  const out = [];
  const d = parse(weekStart(todayISO));
  for (let i = 0; i < n; i++) { out.unshift({ start: iso(d), count: counts.get(iso(d)) || 0 }); d.setDate(d.getDate() - 7); }
  return out;
}

// cells for a month grid starting on Sunday: null for padding, else ISO date
export function monthCells(year, month) {
  const first = new Date(year, month, 1, 12);
  const cells = Array(first.getDay()).fill(null);
  const days = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(year, month, d, 12)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

// ---- monthly overview ----
export const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`; // m is 0-based
export const prevMonth = (y, m) => (m ? { y, m: m - 1 } : { y: y - 1, m: 11 });

const setVol = (sets) => sets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);

/* Per-exercise and overall numbers for one month (key 'YYYY-MM') against the previous one.
   change = % change of top weight from the first to the last session of the month; null when the exercise
   has fewer than 2 weighted sessions in that month. */
export function monthlyOverview(sessions, key, prevKey) {
  const inMonth = (k) => sessions.filter((s) => hasWork(s) && s.date.startsWith(k))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
  const cur = inMonth(key), prev = inMonth(prevKey);
  const volOf = (list, name) => list.reduce((a, s) => a + s.exercises.filter((e) => e.name === name).reduce((x, e) => x + setVol(e.sets), 0), 0);
  const setsOf = (list, name) => list.reduce((a, s) => a + s.exercises.filter((e) => e.name === name).reduce((x, e) => x + e.sets.filter(has).length, 0), 0);
  const names = [];
  for (const s of cur) for (const e of s.exercises) if (e.sets.some(has) && !names.includes(e.name)) names.push(e.name);
  const exercises = names.map((name) => {
    const tops = [];
    for (const s of cur) {
      const w = Math.max(0, ...s.exercises.filter((e) => e.name === name).flatMap((e) => e.sets.map((x) => x.weight || 0)));
      if (w > 0) tops.push(w);
    }
    const enough = tops.length >= 2;
    const start = tops[0] ?? null, end = tops[tops.length - 1] ?? null;
    const change = enough ? round2(((end - start) / start) * 100) : null;
    return {
      name, tops, start, end, change,
      trend: change == null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'same',
      sets: setsOf(cur, name), prevSets: setsOf(prev, name),
      volume: volOf(cur, name), prevVolume: volOf(prev, name),
    };
  });
  exercises.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
  const count = (t) => exercises.filter((e) => e.trend === t).length;
  return {
    exercises,
    improved: count('up'), same: count('same'), dropped: count('down'), insufficient: exercises.filter((e) => e.change == null).length,
    workouts: cur.length, prevWorkouts: prev.length,
    volume: exercises.reduce((a, e) => a + e.volume, 0),
    prevVolume: prev.reduce((a, s) => a + s.exercises.reduce((x, e) => x + setVol(e.sets), 0), 0),
  };
}
