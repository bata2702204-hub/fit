// IndexedDB wrapper + seed data
const DB_NAME = 'fit-tracker';
const DB_VERSION = 1;
const STORES = ['workouts', 'sessions', 'measurementFields', 'measurements', 'meta'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const get = (store, id) => tx(store, 'readonly', (s) => s.get(id));
export const put = (store, obj) => tx(store, 'readwrite', (s) => s.put(obj));
export const del = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const SEED_WORKOUTS = {
  A: ['חזה עליון', 'חזה רגיל', 'פרפר בכבלים', 'לחיצת חבל בפולי', 'פשיטת מרפקים מעל הראש', 'כתף אחורית'],
  B: ['פולי עליון רחב', 'כפיפות מרפקים יד יד', 'כתף אחורית', 'פטישים', 'כפיפות מרפקים', 'סקוואט במכונה', 'תאומים', 'פשיטת רגל במכונה'],
};

const SEED_FIELDS = [
  { name: 'משקל גוף', unit: 'ק״ג' },
  { name: 'חזה', unit: 'ס״מ' },
  { name: 'בטן', unit: 'ס״מ' },
  { name: 'ירכיים', unit: 'ס״מ' },
  { name: 'זרוע', unit: 'ס״מ' },
  { name: 'ירך', unit: 'ס״מ' },
];

export async function init() {
  try { await navigator.storage?.persist?.(); } catch {}
  const seeded = await get('meta', 'seeded');
  if (seeded) {
    // migration: rename default field מותניים -> בטן
    for (const f of await getAll('measurementFields')) {
      if (f.name === 'מותניים') await put('measurementFields', { ...f, name: 'בטן' });
    }
    return;
  }
  for (const id of ['A', 'B']) {
    await put('workouts', {
      id,
      name: `אימון ${id}`,
      exercises: SEED_WORKOUTS[id].map((name) => ({ id: uid(), name })),
    });
  }
  let order = 0;
  for (const f of SEED_FIELDS) {
    await put('measurementFields', { id: uid(), order: order++, ...f });
  }
  await put('meta', { id: 'seeded', value: true });
}

// ---- Domain helpers ----
export async function getWorkouts() {
  const w = await getAll('workouts');
  return w.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getSessions() {
  const s = await getAll('sessions');
  return s.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0));
}

export async function getFields() {
  const f = await getAll('measurementFields');
  return f.sort((a, b) => a.order - b.order);
}

export async function getMeasurements() {
  const m = await getAll('measurements');
  return m.sort((a, b) => b.date.localeCompare(a.date));
}

// Last session (before `beforeDate` / excluding `excludeId`) that contains the exercise with at least one set.
export function lastSetsFor(sessions, name, excludeId, onOrBeforeDate) {
  for (const s of sessions) {
    if (s.id === excludeId) continue;
    if (onOrBeforeDate && s.date > onOrBeforeDate) continue; // never show a *later* session as "previous"

    const ex = s.exercises.find((e) => e.name === name && e.sets.some((x) => x.weight != null || x.reps != null));
    if (ex) return { date: s.date, sets: ex.sets };
  }
  return null;
}

// ---- Backup ----
export async function exportAll() {
  const data = {
    app: 'fit-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: await getAll('workouts'),
    sessions: await getAll('sessions'),
    measurementFields: await getAll('measurementFields'),
    measurements: await getAll('measurements'),
  };
  await put('meta', { id: 'lastBackup', value: Date.now() });
  return data;
}

export function validateImport(d) {
  return d && d.app === 'fit-tracker' && Array.isArray(d.workouts) && Array.isArray(d.sessions)
    && Array.isArray(d.measurementFields) && Array.isArray(d.measurements);
}

export async function importAll(d) {
  if (!validateImport(d)) throw new Error('קובץ לא תקין');
  for (const s of ['workouts', 'sessions', 'measurementFields', 'measurements']) {
    const db = await open();
    await new Promise((res, rej) => {
      const t = db.transaction(s, 'readwrite');
      t.objectStore(s).clear();
      for (const o of d[s]) t.objectStore(s).put(o);
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }
  await put('meta', { id: 'seeded', value: true });
}

export async function getMeta(id) {
  const m = await get('meta', id);
  return m ? m.value : undefined;
}
export const setMeta = (id, value) => put('meta', { id, value });
