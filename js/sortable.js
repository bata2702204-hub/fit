// Pointer-based drag-and-drop sorting for the direct children of `container`.
// Touch: long-press the handle, then drag. Mouse/pen: drag at once. Keyboard: ArrowUp/ArrowDown on a focused handle.
// The DOM is reordered live; onReorder(from, to) fires on drop so the caller can update its data.
export function sortable(container, { handle = '.drag-handle', onStart, onEnd, onReorder, holdMs = 350 }) {
  let pending = null; // pointer is down on a handle, drag not started yet (touch long-press)
  let drag = null;

  const items = () => [...container.children];
  const itemOf = (el) => { let x = el; while (x && x.parentElement !== container) x = x.parentElement; return x; };

  function place() {
    const { item } = drag;
    item.style.transform = '';
    const y = drag.y + drag.off; // finger position translated by the offset taken when the drag began
    let before = null;
    for (const s of items()) {
      if (s === item) continue;
      const r = s.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = s; break; }
    }
    if (before !== item.nextElementSibling) container.insertBefore(item, before);
    item.style.transform = `translateY(${y - drag.grab - item.getBoundingClientRect().top}px)`;
  }

  function loop() {
    if (!drag) return;
    if (drag.y < 90) scrollBy(0, -12);
    else if (drag.y > innerHeight - 90) scrollBy(0, 12);
    place();
    drag.raf = requestAnimationFrame(loop);
  }

  function begin() {
    const { item, y, id } = pending;
    clearTimeout(pending.timer);
    pending = null;
    const from = items().indexOf(item);
    const r0 = item.getBoundingClientRect();
    const grab = Math.min(Math.max(y - r0.top, 0), r0.height);
    onStart?.(container, item); // may reflow the list (the session screen collapses its cards)
    const r = item.getBoundingClientRect();
    // After a reflow the finger can sit over a different slot. Keep the item in its own slot and let it follow
    // the finger's movement (off), instead of snapping under the finger and reordering before any movement.
    drag = { item, from, id, y, grab, off: r.top + grab - y, raf: 0 };
    item.classList.add('dragging');
    navigator.vibrate?.(12);
    loop();
  }

  function finish(cancel) {
    if (pending) { clearTimeout(pending.timer); pending = null; }
    if (!drag) return;
    const { item, from, raf } = drag;
    drag = null;
    cancelAnimationFrame(raf);
    item.style.transform = '';
    item.classList.remove('dragging');
    if (cancel) container.insertBefore(item, items().filter((x) => x !== item)[from] || null);
    onEnd?.(container, item);
    const to = items().indexOf(item);
    if (!cancel && to !== from) onReorder?.(from, to);
  }

  container.addEventListener('pointerdown', (e) => {
    const hd = e.target.closest(handle);
    if (!hd || !container.contains(hd) || drag || pending) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { hd.setPointerCapture(e.pointerId); } catch {}
    pending = { item: itemOf(hd), id: e.pointerId, x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch') pending.timer = setTimeout(begin, holdMs);
    else begin();
  });

  container.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) { drag.y = e.clientY; return; }
    if (pending && e.pointerId === pending.id && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 12) {
      clearTimeout(pending.timer); pending = null; // moved before the long-press fired: not a drag
    }
  });
  container.addEventListener('pointerup', (e) => { if ((drag || pending)?.id === e.pointerId) finish(false); });
  container.addEventListener('pointercancel', (e) => { if ((drag || pending)?.id === e.pointerId) finish(true); });
  container.addEventListener('contextmenu', (e) => { if (e.target.closest(handle)) e.preventDefault(); });
  container.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });

  container.addEventListener('keydown', (e) => {
    const hd = e.target.closest?.(handle);
    if (!hd || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const item = itemOf(hd), from = items().indexOf(item), to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= items().length) return;
    container.insertBefore(item, e.key === 'ArrowUp' ? items()[to] : items()[to].nextElementSibling);
    hd.focus();
    onReorder?.(from, to);
  });
}

export const reorder = (arr, from, to) => { const [m] = arr.splice(from, 1); arr.splice(to, 0, m); };
