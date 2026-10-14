// Rest timer bar shown on the session screen. Time is derived from an end timestamp, so it stays correct if the screen sleeps.
let el, timeEl, tickId, hideId, endAt = 0, ctx;

export function unlockAudio() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); ctx.resume?.(); } catch {}
}

function beep() {
  try {
    if (!ctx) return;
    [0, 0.3, 0.6].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.25;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
    });
  } catch {}
}

function ensureEl() {
  if (el?.isConnected) return;
  timeEl = document.createElement('b');
  timeEl.className = 'rest-time';
  const btn = (label, aria, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.onclick = fn; return b; };
  el = document.createElement('div');
  el.className = 'rest';
  el.setAttribute('role', 'timer');
  el.append(btn('−15', 'הפחת 15 שניות', () => adjust(-15)), timeEl, btn('+15', 'הוסף 15 שניות', () => adjust(15)), btn('דלג', 'דלג על המנוחה', stopRest));
  document.body.append(el);
}

function adjust(sec) {
  if (!el) return;
  if (el.dataset.state === 'done') { start(Math.max(15, sec)); return; }
  endAt += sec * 1000;
  tick();
}

function finish() {
  clearInterval(tickId);
  el.dataset.state = 'done';
  timeEl.textContent = 'המנוחה הסתיימה';
  try { navigator.vibrate?.([300, 150, 300, 150, 500]); } catch {}
  beep();
  hideId = setTimeout(stopRest, 8000);
}

function tick() {
  const left = Math.ceil((endAt - Date.now()) / 1000);
  if (left <= 0) { finish(); return; }
  timeEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function start(seconds) {
  clearInterval(tickId); clearTimeout(hideId);
  ensureEl();
  endAt = Date.now() + seconds * 1000;
  el.dataset.state = 'running';
  tick();
  tickId = setInterval(tick, 250);
}

export function startRest(seconds) { unlockAudio(); start(seconds); }

export function stopRest() {
  clearInterval(tickId); clearTimeout(hideId);
  el?.remove(); el = null;
}
