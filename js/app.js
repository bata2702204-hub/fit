import * as db from './db.js';
import { homeScreen } from './screens/home.js';
import { sessionScreen } from './screens/session.js';
import { historyScreen } from './screens/history.js';
import { measurementsScreen } from './screens/measurements.js';
import { progressScreen } from './screens/progress.js';
import { settingsScreen } from './screens/settings.js';

const root = document.getElementById('app');

async function route() {
  try { await render(); } catch (err) {
    console.error(err);
    root.replaceChildren(Object.assign(document.createElement('div'), { className: 'card', innerHTML: '<p>משהו השתבש בטעינה.</p><button class="btn primary" onclick="location.reload()">טען מחדש</button>' }));
  }
}

async function render() {
  if (window.__leave) { try { await window.__leave(); } catch {} window.__leave = null; }
  const [, name = '', arg] = location.hash.replace(/^#/, '').split('/');
  const tab = name === 'session' ? '' : name;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.querySelector('nav').hidden = name === 'session';
  window.scrollTo(0, 0);
  switch (name) {
    case 'session': return sessionScreen(root, arg);
    case 'history': return historyScreen(root);
    case 'measurements': return measurementsScreen(root, arg);
    case 'progress': return progressScreen(root);
    case 'settings': return settingsScreen(root);
    default: return homeScreen(root);
  }
}

window.addEventListener('hashchange', route);
await db.init();
await route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
