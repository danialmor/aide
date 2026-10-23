/* Aide · tools — Tasks (list + priority matrix), Notebook, Timers & world clocks.
   Timers keep absolute timestamps, so they stay correct when the tab sleeps. */
(function () {
  'use strict';
  const A = window.Aide, { h, date: D, ev: E } = A;

  /* ── tasks ────────────────────────────────────────────────────────── */
  const QUAD = { now: ['Do now', 'Urgent & important'], plan: ['Schedule', 'Important, not urgent'], delegate: ['Delegate', 'Urgent, less important'], drop: ['Drop or later', 'Neither'] };
  const tUI = { mode: 'list', showDone: false };
  A.views.tasks = {
    title: 'Tasks', sub: 'Follow-ups, errands and delegations',
    actions: () => [h('div', { class: 'seg', role: 'tablist' }, [['list', 'List'], ['matrix', 'Matrix']].map(([k, n]) => h('button', { type: 'button', role: 'tab', 'aria-selected': tUI.mode === k, onClick: () => { tUI.mode = k; A.route(); } }, n)))],
    render(root) {
      const T = A.db.data.tasks, t0 = D.iso(D.today());
      const inp = h('input', { type: 'text', dir: 'auto', placeholder: 'Add a task… try “Send pack to Elena tomorrow”', 'aria-label': 'New task', autocomplete: 'off' });
      inp.addEventListener('keydown', e => { if (e.key !== 'Enter' || !inp.value.trim()) return; const p = E.parse(inp.value); const hasDate = /today|tomorrow|tmrw|mon|tue|wed|thu|fri|sat|sun|\d{4}-\d{2}-\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(inp.value); A.add('tasks', { title: p.title || inp.value.trim(), pri: 'plan', due: hasDate ? D.iso(p.day) : '', done: false }); A.route(); });
      root.append(h('div', { class: 'row', style: { marginBottom: '14px' } }, inp));
      const row = (t, drag) => {
        const due = t.due ? D.parse(t.due) : null, over = due != null && !t.done && due < D.today();
        const chk = h('button', { type: 'button', class: 'check', role: 'checkbox', 'aria-checked': !!t.done, 'aria-label': 'Done: ' + t.title, onClick: () => { A.patch('tasks', t.id, { done: !t.done }); A.route(); } }, A.ico('check'));
        const el = h('div', { class: 'task' + (t.done ? ' done' : ''), 'data-id': t.id }, drag ? h('span', { class: 'grip', 'aria-hidden': 'true' }, A.ico('grip')) : null, chk,
          h('button', { type: 'button', class: 'grow', style: { textAlign: 'left' }, onClick: () => editTask(t) }, h('span', { class: 'tt', dir: 'auto' }, t.title), t.owner ? h('div', { class: 'small muted', dir: 'auto' }, '→ ' + t.owner) : null),
          due != null ? h('span', { class: 'pill', style: over ? { '--c': 'var(--danger-bg)', color: 'var(--danger)' } : {} }, D.rel(due)) : null);
        return el;
      };
      if (tUI.mode === 'list') {
        const open = T.filter(t => !t.done).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1), groups = [['Overdue', t => t.due && t.due < t0], ['Today', t => t.due === t0], ['Upcoming', t => t.due > t0], ['No date', t => !t.due]];
        let any = false;
        groups.forEach(([n, f]) => { const L = open.filter(f); if (!L.length) return; any = true; root.append(h('div', { class: 'card', style: { marginBottom: '14px' } }, h('h3', null, n, h('span', { class: 'badge', style: { background: n === 'Overdue' ? 'var(--danger)' : 'var(--accent-ink)' } }, L.length)), h('div', { class: 'stack' }, L.map(t => row(t))))); });
        if (!any) root.append(A.empty('All clear', 'No open tasks. Add one above.', 'tasks'));
        const done = T.filter(t => t.done); if (done.length) root.append(h('div', { class: 'card' }, h('h3', null, 'Completed', h('span', { class: 'grow' }), h('button', { class: 'btn sm', type: 'button', onClick: () => { tUI.showDone = !tUI.showDone; A.route(); } }, tUI.showDone ? 'Hide' : 'Show ' + done.length)), tUI.showDone ? h('div', { class: 'stack' }, done.map(t => row(t))) : null));
      } else {
        const M = h('div', { class: 'matrix' }, Object.entries(QUAD).map(([k, [n, s]]) => h('section', { class: 'quad', 'data-q': k }, h('h3', null, n, h('small', null, s)), T.filter(t => !t.done && t.pri === k).map(t => row(t, true)))));
        root.append(M); matrixDrag(M);
      }
    },
  };
  function matrixDrag(M) {
    let d = null;
    M.addEventListener('pointerdown', e => { const g = e.target.closest('.grip'); if (!g) return; e.preventDefault(); const el = g.closest('.task'), r = el.getBoundingClientRect(); d = { el, id: el.dataset.id, ghost: el.cloneNode(true), dx: e.clientX - r.left, dy: e.clientY - r.top, pid: e.pointerId }; d.ghost.classList.add('drag'); d.ghost.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px'; document.body.append(d.ghost); el.style.opacity = .3; g.setPointerCapture(e.pointerId); });
    M.addEventListener('pointermove', e => { if (!d) return; d.ghost.style.left = e.clientX - d.dx + 'px'; d.ghost.style.top = e.clientY - d.dy + 'px'; const q = document.elementFromPoint(e.clientX, e.clientY); const quad = q && q.closest('.quad'); A.$$('.quad', M).forEach(x => x.classList.toggle('over', x === quad)); });
    const end = e => { if (!d) return; const q = document.elementFromPoint(e.clientX, e.clientY), quad = q && q.closest('.quad'); d.ghost.remove(); const id = d.id; d = null; if (quad && quad.dataset.q) { A.patch('tasks', id, { pri: quad.dataset.q }); } A.route(); };
    M.addEventListener('pointerup', end); M.addEventListener('pointercancel', end);
  }
  function editTask(t) {
    const f = { title: h('input', { type: 'text', dir: 'auto', value: t.title }), due: h('input', { type: 'date', value: t.due || '' }), pri: h('select', null, Object.entries(QUAD).map(([k, [n]]) => h('option', { value: k, selected: k === t.pri }, n))), owner: h('input', { type: 'text', dir: 'auto', value: t.owner || '', placeholder: 'Who is handling it?' }), notes: h('textarea', { dir: 'auto' }) }; f.notes.value = t.notes || '';
    const m = A.modal({ title: 'Task', body: [A.field('Task', f.title), h('div', { class: 'two' }, A.field('Due', f.due), A.field('Priority', f.pri)), A.field('Delegated to', f.owner), A.field('Notes', f.notes)], footer: [h('button', { class: 'btn danger', type: 'button', onClick: () => { A.del('tasks', t.id, 'Task deleted'); m.close(); A.route(); } }, 'Delete'), h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onClick: () => { if (!f.title.value.trim()) return; A.patch('tasks', t.id, { title: f.title.value.trim(), due: f.due.value, pri: f.pri.value, owner: f.owner.value.trim(), notes: f.notes.value }); m.close(); A.route(); } }, 'Save')] });
  }

  /* ── notebook ─────────────────────────────────────────────────────── */
  const nUI = { sel: null, q: '' };
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : D.mid(D.num(...(d => [d.getFullYear(), d.getMonth() + 1, d.getDate()])(new Date(t)))); };
  A.views.notes = {
    title: 'Notebook', sub: 'Preferences, call notes and checklists', flush: true,
    actions: () => [h('button', { class: 'btn', type: 'button', onClick: () => newNote(true) }, 'Today’s log'), h('button', { class: 'btn primary', type: 'button', onClick: () => newNote() }, A.ico('plus'), 'New note')],
    render(root) {
      const N = A.db.data.notes; if (nUI.sel && !A.get('notes', nUI.sel)) nUI.sel = null; if (!nUI.sel && N.length && !matchMedia('(max-width:860px)').matches) nUI.sel = sorted()[0].id;
      const wrap = h('div', { class: 'notes', style: { padding: '4px 22px 18px', flex: 1, minHeight: 0 } });
      if (matchMedia('(max-width:860px)').matches) wrap.style.padding = '4px 14px 12px';
      const q = h('input', { type: 'search', placeholder: 'Search notes…', value: nUI.q, 'aria-label': 'Search notes', dir: 'auto' }), list = h('div', { class: 'nlist' }), ed = h('div', { class: 'neditor' });
      const drawList = () => { nUI.q = q.value; const t = q.value.trim().toLowerCase(); list.replaceChildren(); const L = sorted().filter(n => !t || (n.title + ' ' + n.body).toLowerCase().includes(t)); if (!L.length) list.append(A.empty('No notes', 'Create one to get started.', 'notes')); L.forEach(n => list.append(h('button', { type: 'button', class: 'nitem', 'aria-current': n.id === nUI.sel, style: { '--b': 'var(--b-' + (n.color || 'meeting') + ')' }, 'data-id': n.id, onClick: () => { nUI.sel = n.id; wrap.classList.add('editing'); A.$$('.nitem', list).forEach(x => x.setAttribute('aria-current', x.dataset.id === n.id)); drawEd(); } }, h('b', { dir: 'auto' }, (n.pinned ? '📌 ' : '') + (n.title || 'Untitled')), h('span', { dir: 'auto' }, ago(n.updated) + ' · ' + (n.body.split('\n')[0] || 'Empty'))))); };
      const drawEd = () => {
        const n = nUI.sel && A.get('notes', nUI.sel); ed.replaceChildren(); if (!n) { ed.append(A.empty('Select a note', '', 'notes')); return; }
        const ttl = h('input', { class: 'ttl', type: 'text', dir: 'auto', value: n.title, placeholder: 'Title', 'aria-label': 'Note title' }), body = h('textarea', { dir: 'auto', placeholder: 'Start typing…', 'aria-label': 'Note text' }), count = h('span', { class: 'small muted' });
        body.value = n.body; const words = () => { const w = body.value.trim() ? body.value.trim().split(/\s+/).length : 0; count.textContent = w + ' words · saved'; };
        const save = A.debounce(() => { A.patch('notes', n.id, { title: ttl.value, body: body.value, updated: Date.now() }); words(); const it = A.$('.nitem[data-id="' + n.id + '"]', list); if (it) { it.firstChild.textContent = (n.pinned ? '📌 ' : '') + (ttl.value || 'Untitled'); it.lastChild.textContent = 'just now · ' + (body.value.split('\n')[0] || 'Empty'); } }, 350);
        [ttl, body].forEach(x => x.addEventListener('input', () => { count.textContent = 'Saving…'; save(); }));
        const ins = txt => { const s = body.selectionStart; body.setRangeText(txt, s, body.selectionEnd, 'end'); body.focus(); body.dispatchEvent(new Event('input')); };
        body.addEventListener('keydown', e => { if (e.key === 'Enter') { const s = body.selectionStart, line = body.value.slice(body.value.lastIndexOf('\n', s - 1) + 1, s); if (/^☐ $/.test(line)) { e.preventDefault(); body.setRangeText('', s - 2, s, 'end'); ins('\n'); } else if (/^(☐|☑|•) /.test(line)) { e.preventDefault(); ins('\n' + line[0].replace('☑', '☐') + ' '); } } });
        body.addEventListener('click', e => { const s = body.selectionStart, a = body.value.lastIndexOf('\n', s - 1) + 1, ch = body.value[a]; if ((ch === '☐' || ch === '☑') && s <= a + 1) { body.setRangeText(ch === '☐' ? '☑' : '☐', a, a + 1, 'preserve'); body.dispatchEvent(new Event('input')); } });
        const colors = h('div', { class: 'row', style: { gap: '6px' } }, ['meeting', 'visit', 'call', 'travel', 'personal', 'focus'].map(c => h('button', { type: 'button', class: 'dot', 'aria-label': 'Colour ' + c, style: { width: '18px', height: '18px', background: 'var(--b-' + c + ')', outline: n.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: '2px' }, onClick: () => { A.patch('notes', n.id, { color: c }); drawList(); drawEd(); } })));
        ed.append(h('div', { class: 'row' }, h('button', { class: 'icon-btn show-sm', type: 'button', 'aria-label': 'Back to notes', onClick: () => wrap.classList.remove('editing') }, A.ico('chevL')), ttl, h('button', { class: 'icon-btn', type: 'button', 'aria-label': n.pinned ? 'Unpin' : 'Pin', style: { color: n.pinned ? 'var(--accent-ink)' : '' }, onClick: () => { A.patch('notes', n.id, { pinned: !n.pinned }); drawList(); drawEd(); } }, A.ico('pin')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete note', onClick: () => { A.del('notes', n.id, 'Note deleted'); nUI.sel = null; wrap.classList.remove('editing'); A.route(); } }, A.ico('trash'))),
          h('div', { class: 'row wrap' }, colors, h('span', { class: 'grow' }), h('button', { class: 'btn sm', type: 'button', onClick: () => ins((body.value && !/\n$/.test(body.value.slice(0, body.selectionStart)) ? '\n' : '') + '☐ ') }, 'Checklist'), h('button', { class: 'btn sm', type: 'button', onClick: () => ins((body.value && !/\n$/.test(body.value.slice(0, body.selectionStart)) ? '\n' : '') + '• ') }, 'Bullet'), h('button', { class: 'btn sm', type: 'button', onClick: () => ins(A.time(D.nowMin()) + ' ') }, 'Time')), body, count); words();
        if (!n.title && !n.body) setTimeout(() => ttl.focus(), 50);
      };
      q.addEventListener('input', A.debounce(drawList, 120)); wrap.append(h('div', { class: 'nside' }, q, list), ed); root.append(wrap); drawList(); drawEd(); if (nUI.sel && nUI._open) { wrap.classList.add('editing'); nUI._open = false; }
    },
  };
  const sorted = () => A.db.data.notes.slice().sort((a, b) => (b.pinned - a.pinned) || b.updated - a.updated);
  function newNote(log) {
    if (log) { const t = D.long(D.today()), ex = A.db.data.notes.find(n => n.title === 'Log — ' + t); if (ex) { nUI.sel = ex.id; nUI._open = true; return A.route(); } const n = A.add('notes', { title: 'Log — ' + t, body: '', color: 'focus', pinned: false, updated: Date.now() }); nUI.sel = n.id; nUI._open = true; }
    else { const n = A.add('notes', { title: '', body: '', color: 'meeting', pinned: false, updated: Date.now() }); nUI.sel = n.id; nUI._open = true; nUI.q = ''; }
    if (A.current !== 'notes') location.hash = '#/notes'; else A.route();
  }
  A.newNote = newNote;

  /* ── timers ───────────────────────────────────────────────────────── */
  const SS = 'aide.timers';
  const T = (() => { try { return JSON.parse(sessionStorage.getItem(SS)) || {}; } catch (e) { return {}; } })();
  T.cd = T.cd || { total: 25 * 60, end: null, left: null, label: '' }; T.sw = T.sw || { start: null, acc: 0, laps: [] }; T.mt = T.mt || { items: [{ t: 'Welcome', m: 5 }, { t: 'Updates', m: 15 }, { t: 'Decisions', m: 10 }], idx: -1, t0: null, acc: [], paused: null }; T.tab = T.tab || 'cd';
  const persist = () => sessionStorage.setItem(SS, JSON.stringify(T));
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return A.pad(Math.floor(s / 60)) + ':' + A.pad(s % 60); };
  const hms = s => { const h2 = Math.floor(s / 3600); return (h2 ? h2 + ':' : '') + A.pad(Math.floor(s / 60) % 60) + ':' + A.pad(Math.floor(s) % 60); };
  const cdLeft = () => T.cd.end ? Math.max(0, (T.cd.end - Date.now()) / 1000) : (T.cd.left != null ? T.cd.left : T.cd.total);
  let raf = 0, tick = null;
  // background alarm: runs even when the Timers tab is not open
  setInterval(() => { if (T.cd.end && Date.now() >= T.cd.end) { const l = T.cd.label; T.cd = { total: T.cd.total, end: null, left: 0, label: l, done: true }; persist(); A.notify('Time is up', l || 'Countdown finished'); } }, 500);

  A.views.timer = {
    title: 'Timers', sub: 'Countdown, stopwatch, meeting agenda and world clocks',
    actions: () => [h('div', { class: 'seg', role: 'tablist' }, [['cd', 'Countdown'], ['sw', 'Stopwatch'], ['mt', 'Meeting'], ['wc', 'World clocks']].map(([k, n]) => h('button', { type: 'button', role: 'tab', 'aria-selected': T.tab === k, onClick: () => { T.tab = k; persist(); A.route(); } }, n)))],
    render(root) { ({ cd, sw, mt, wc })[T.tab](root); },
    destroy() { cancelAnimationFrame(raf); clearInterval(tick); tick = null; },
  };
  const loop = fn => { cancelAnimationFrame(raf); const f = () => { fn(); raf = requestAnimationFrame(f); }; f(); };
  function cd(root) {
    const NS = 'http://www.w3.org/2000/svg', R = 80, C = 2 * Math.PI * R, mk = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = mk('svg', { viewBox: '0 0 200 200', class: 'dial', role: 'slider', 'aria-label': 'Minutes', 'aria-valuemin': 1, 'aria-valuemax': 60, tabindex: 0 });
    const face = mk('circle', { class: 'face', cx: 100, cy: 100, r: 96 }), trk = mk('circle', { class: 'trk', cx: 100, cy: 100, r: R }), arc = mk('circle', { class: 'arc', cx: 100, cy: 100, r: R, transform: 'rotate(-90 100 100)', 'stroke-dasharray': C, 'stroke-dashoffset': 0 });
    const txt = mk('text', { x: 100, y: 112, 'text-anchor': 'middle', 'font-size': 38, 'font-weight': 800 }), lab = mk('text', { x: 100, y: 138, 'text-anchor': 'middle', 'font-size': 11, 'letter-spacing': '.1em', style: 'fill:var(--faint);text-transform:uppercase' });
    const ticks = Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return mk('line', { x1: 100 + Math.sin(a) * 62, y1: 100 - Math.cos(a) * 62, x2: 100 + Math.sin(a) * 67, y2: 100 - Math.cos(a) * 67, stroke: 'var(--line)', 'stroke-width': 2, 'stroke-linecap': 'round' }); });
    const knob = mk('circle', { class: 'knob', r: 9 }); svg.append(face, trk, ...ticks, arc, txt, lab, knob);
    const running = () => !!T.cd.end, setMin = m => { m = Math.max(1, Math.min(180, Math.round(m))); T.cd = { total: m * 60, end: null, left: null, label: T.cd.label }; persist(); };
    const angleMin = e => { const r = svg.getBoundingClientRect(), a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); let deg = (a * 180 / Math.PI + 360) % 360; const prev = T.cd.total / 60; let m = Math.round(deg / 6); if (m === 0) m = prev > 30 ? 60 : 1; return m; };
    let dragging = false; svg.addEventListener('pointerdown', e => { if (running()) return; dragging = true; svg.setPointerCapture(e.pointerId); setMin(angleMin(e)); }); svg.addEventListener('pointermove', e => { if (dragging) setMin(angleMin(e)); }); svg.addEventListener('pointerup', () => dragging = false); svg.addEventListener('pointercancel', () => dragging = false);
    svg.addEventListener('keydown', e => { if (running()) return; if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setMin(T.cd.total / 60 + 1); } if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setMin(T.cd.total / 60 - 1); } });
    const main = h('button', { class: 'btn primary', type: 'button', style: { minWidth: '120px', minHeight: '48px' } });
    const start = () => { if (running()) { T.cd.left = cdLeft(); T.cd.end = null; } else { const left = T.cd.done ? T.cd.total : cdLeft(); T.cd = { total: T.cd.total, end: Date.now() + left * 1000, left: null, label: T.cd.label }; if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } persist(); };
    main.onclick = start;
    const label = h('input', { type: 'text', dir: 'auto', value: T.cd.label || '', placeholder: 'What is this for? (optional)', 'aria-label': 'Timer label', style: { maxWidth: '320px' } }); label.addEventListener('input', () => { T.cd.label = label.value; persist(); });
    const preset = (n, m) => h('button', { type: 'button', class: 'chip', onClick: () => { if (!running()) { setMin(m); } } }, n);
    root.append(h('div', { class: 'card', style: { maxWidth: '560px', margin: '0 auto' } }, h('div', { class: 'dial-wrap' }, svg), h('div', { class: 'row', style: { justifyContent: 'center', margin: '4px 0 14px' } }, label), h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn', type: 'button', onClick: () => { T.cd = { total: T.cd.total, end: null, left: null, label: T.cd.label }; persist(); } }, A.ico('reset'), 'Reset'), main, h('button', { class: 'btn', type: 'button', onClick: () => { if (running()) { T.cd.end += 60000; } else setMin(T.cd.total / 60 + 1); persist(); } }, '+1 min')), h('div', { class: 'row wrap', style: { justifyContent: 'center', marginTop: '14px' } }, [['5 min', 5], ['10 min', 10], ['15 min', 15], ['25 focus', 25], ['45 min', 45], ['60 min', 60]].map(([n, m]) => preset(n, m)))));
    loop(() => { const left = cdLeft(), tot = T.cd.total, frac = Math.max(0, Math.min(1, left / tot)), a = (running() || T.cd.left != null ? frac : tot / 3600) * Math.PI * 2; const show = running() || T.cd.left != null ? frac : Math.min(1, tot / 3600);
      arc.setAttribute('stroke-dashoffset', C * (1 - show)); const ang = show * Math.PI * 2; knob.setAttribute('cx', 100 + Math.sin(ang) * R); knob.setAttribute('cy', 100 - Math.cos(ang) * R); knob.style.display = running() ? 'none' : '';
      txt.textContent = mmss(left); lab.textContent = running() ? (T.cd.label || 'running') : T.cd.done ? 'finished' : T.cd.left != null ? 'paused' : 'drag the dial'; arc.style.stroke = left < 30 && running() ? 'var(--danger)' : ''; svg.setAttribute('aria-valuenow', Math.round(tot / 60));
      main.replaceChildren(A.ico(running() ? 'pause' : 'play'), running() ? 'Pause' : T.cd.left != null ? 'Resume' : 'Start'); document.title = running() ? mmss(left) + ' · Aide' : 'Aide · Executive Desk'; });
  }
  function sw(root) {
    const big = h('div', { class: 'display num', style: { fontSize: 'clamp(44px,12vw,84px)', fontWeight: 800, textAlign: 'center', letterSpacing: '-.02em' } }), laps = h('div', { class: 'stack', style: { marginTop: '14px' } });
    const el = () => T.sw.acc + (T.sw.start ? Date.now() - T.sw.start : 0), run = () => !!T.sw.start;
    const main = h('button', { class: 'btn primary', type: 'button', style: { minWidth: '120px', minHeight: '48px' }, onClick: () => { if (run()) { T.sw.acc = el(); T.sw.start = null; } else T.sw.start = Date.now(); persist(); } });
    const drawLaps = () => { laps.replaceChildren(...T.sw.laps.slice().reverse().map((l, i) => h('div', { class: 'item num', style: { background: 'var(--line-fine)' } }, h('span', { class: 'muted' }, 'Lap ' + (T.sw.laps.length - i)), h('span', { class: 'grow' }), h('b', null, fmt(l.split)), h('span', { class: 'muted' }, fmt(l.total))))); };
    const fmt = ms => { const s = ms / 1000; return hms(s) + '.' + A.pad(Math.floor(ms % 1000 / 10)); };
    root.append(h('div', { class: 'card', style: { maxWidth: '560px', margin: '0 auto' } }, big, h('div', { class: 'row', style: { justifyContent: 'center', margin: '16px 0' } }, h('button', { class: 'btn', type: 'button', onClick: () => { if (run()) { const t = el(), last = T.sw.laps.length ? T.sw.laps[T.sw.laps.length - 1].total : 0; T.sw.laps.push({ total: t, split: t - last }); persist(); drawLaps(); } else { T.sw = { start: null, acc: 0, laps: [] }; persist(); drawLaps(); } } }, A.ico('flag'), 'Lap / Reset'), main), laps)); drawLaps();
    loop(() => { big.textContent = fmt(el()); main.replaceChildren(A.ico(run() ? 'pause' : 'play'), run() ? 'Stop' : 'Start'); });
  }
  const MT_PRESETS = { 'Board meeting': [['Welcome & minutes', 5], ['CEO update', 15], ['Financials', 20], ['Discussion', 30], ['Decisions', 10], ['Any other business', 5]], 'One-to-one': [['Check-in', 5], ['Updates', 15], ['Priorities', 10]], 'Stand-up': [['Wins', 3], ['Blockers', 5], ['Today', 5]] };
  function mt(root) {
    const M = T.mt, box = h('div'), now = () => Date.now();
    const elapsed = () => M.idx < 0 ? 0 : (M.paused != null ? M.paused : now() - M.t0) / 1000;
    const total = M.items.reduce((s, i) => s + i.m, 0);
    const edit = () => {
      const rows = M.items.map((it, i) => h('div', { class: 'row' }, h('input', { type: 'text', dir: 'auto', value: it.t, 'aria-label': 'Agenda item', onInput: e => { it.t = e.target.value; persist(); } }), h('input', { type: 'number', min: 1, max: 240, value: it.m, 'aria-label': 'Minutes', style: { width: '84px' }, onInput: e => { it.m = Math.max(1, +e.target.value || 1); persist(); } }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove item', onClick: () => { M.items.splice(i, 1); persist(); A.route(); } }, A.ico('x'))));
      box.replaceChildren(h('div', { class: 'card', style: { maxWidth: '640px', margin: '0 auto' } }, h('h3', null, 'Meeting agenda', h('span', { class: 'grow' }), h('span', { class: 'muted small' }, total + ' min total')), h('div', { class: 'stack' }, rows), h('div', { class: 'row wrap', style: { marginTop: '12px' } }, h('button', { class: 'btn sm', type: 'button', onClick: () => { M.items.push({ t: '', m: 10 }); persist(); A.route(); } }, A.ico('plus'), 'Add item'), Object.keys(MT_PRESETS).map(k => h('button', { class: 'btn sm', type: 'button', onClick: () => { M.items = MT_PRESETS[k].map(([t, m]) => ({ t, m })); persist(); A.route(); } }, k)), h('span', { class: 'grow' }), h('button', { class: 'btn primary', type: 'button', disabled: !M.items.length, onClick: () => { M.idx = 0; M.t0 = now(); M.acc = []; M.paused = null; persist(); A.route(); } }, A.ico('play'), 'Start meeting'))));
    };
    const run = () => {
      const bar = h('div', { class: 'pbar' }, h('i')), cur = h('div', { class: 'display', style: { fontSize: '26px', fontWeight: 800, textAlign: 'center' }, dir: 'auto' }), clock = h('div', { class: 'display num', style: { fontSize: 'clamp(54px,14vw,96px)', fontWeight: 800, textAlign: 'center', lineHeight: 1.05 } }), drift = h('div', { class: 'small muted', style: { textAlign: 'center' } }), list = h('div', { class: 'stack', style: { marginTop: '14px' } });
      const next = () => { const it = M.items[M.idx], used = elapsed(); M.acc[M.idx] = used; if (M.idx >= M.items.length - 1) { M.idx = M.items.length; } else { M.idx++; M.t0 = now(); M.paused = null; } persist(); A.route(); };
      const pause = h('button', { class: 'btn', type: 'button', onClick: () => { if (M.paused != null) { M.t0 = now() - M.paused * 1000; M.paused = null; } else M.paused = elapsed(); persist(); } });
      if (M.idx >= M.items.length) { const used = M.acc.reduce((s, x) => s + x, 0) / 60; return box.replaceChildren(h('div', { class: 'card', style: { maxWidth: '640px', margin: '0 auto' } }, h('h3', null, 'Meeting finished'), h('p', null, 'Planned ' + total + ' min · actual ' + Math.round(used) + ' min (' + (used > total ? Math.round(used - total) + ' min over' : Math.round(total - used) + ' min under') + ').'), h('div', { class: 'stack', style: { margin: '12px 0' } }, M.items.map((it, i) => h('div', { class: 'item', style: { background: 'var(--line-fine)' } }, h('span', { dir: 'auto' }, it.t), h('span', { class: 'grow' }), h('b', { class: 'num', style: { color: (M.acc[i] || 0) / 60 > it.m ? 'var(--danger)' : '' } }, Math.round((M.acc[i] || 0) / 60) + ' / ' + it.m + ' min')))), h('button', { class: 'btn primary', type: 'button', onClick: () => { M.idx = -1; persist(); A.route(); } }, 'Back to agenda'))); }
      list.append(...M.items.map((it, i) => h('div', { class: 'item', style: { background: i === M.idx ? 'var(--c-visit)' : 'var(--line-fine)', opacity: i < M.idx ? .55 : 1 } }, h('span', null, i < M.idx ? '✓' : i + 1 + '.'), h('span', { class: 'grow', dir: 'auto' }, it.t), h('span', { class: 'muted num' }, it.m + ' min'))));
      box.replaceChildren(h('div', { class: 'card', style: { maxWidth: '640px', margin: '0 auto' } }, cur, clock, bar, drift, h('div', { class: 'row', style: { justifyContent: 'center', margin: '14px 0 0' } }, h('button', { class: 'btn', type: 'button', onClick: async () => { if (await A.confirm('End meeting', 'Stop the agenda timer?', 'End', false)) { M.idx = -1; persist(); A.route(); } } }, 'End'), pause, h('button', { class: 'btn primary', type: 'button', onClick: next }, 'Next item', A.ico('arrow'))), list));
      let warned = -1;
      loop(() => { if (M.idx < 0 || M.idx >= M.items.length) return; const it = M.items[M.idx], used = elapsed(), left = it.m * 60 - used; cur.textContent = it.t || 'Item ' + (M.idx + 1); clock.textContent = (left < 0 ? '+' : '') + mmss(Math.abs(left)); clock.style.color = left < 0 ? 'var(--danger)' : ''; bar.classList.toggle('over', left < 0); bar.firstChild.style.setProperty('--p', Math.min(1, used / (it.m * 60)));
        const planned = M.items.slice(0, M.idx).reduce((s, x) => s + x.m * 60, 0) + used, actual = M.acc.slice(0, M.idx).reduce((s, x) => s + x, 0) + used, plannedAll = planned, dd = Math.round((actual - M.items.slice(0, M.idx).reduce((s, x) => s + x.m * 60, 0) - it.m * 60 * Math.min(1, used / (it.m * 60))) / 60); drift.textContent = 'Item ' + (M.idx + 1) + ' of ' + M.items.length + ' · ' + (dd > 0 ? dd + ' min behind plan' : dd < 0 ? -dd + ' min ahead of plan' : 'on plan'); if (left <= 0 && warned !== M.idx) { warned = M.idx; A.notify('Time for “' + (it.t || 'this item') + '” is up', 'Move on or extend.'); } });
    };
    root.append(box); M.idx < 0 ? edit() : run();
  }
  /* ── world clocks ─────────────────────────────────────────────────── */
  const CITIES = [['Tehran', 'Asia/Tehran'], ['Dubai', 'Asia/Dubai'], ['Istanbul', 'Europe/Istanbul'], ['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'], ['Moscow', 'Europe/Moscow'], ['Cairo', 'Africa/Cairo'], ['Mumbai', 'Asia/Kolkata'], ['Singapore', 'Asia/Singapore'], ['Shanghai', 'Asia/Shanghai'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney'], ['New York', 'America/New_York'], ['Chicago', 'America/Chicago'], ['Los Angeles', 'America/Los_Angeles'], ['Toronto', 'America/Toronto'], ['São Paulo', 'America/Sao_Paulo']];
  const offset = (tz, d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000; };
  A.clockRows = function (when) {
    const S = A.settings(), d = when || new Date(), loc = -d.getTimezoneOffset();
    return S.clocks.map(tz => { const city = (CITIES.find(c => c[1] === tz) || [tz.split('/').pop().replace(/_/g, ' '), tz])[0]; let o; try { o = offset(tz, d); } catch (e) { return null; } const w = new Date(d.getTime() + o * 60000), hh = w.getUTCHours(), mm = w.getUTCMinutes(), diff = o - loc; return { tz, city, time: A.time(hh * 60 + mm), day: D.mid(D.num(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate())), night: hh < 7 || hh >= 21, diff: diff === 0 ? 'same as you' : (diff > 0 ? '+' : '−') + Math.floor(Math.abs(diff) / 60) + (Math.abs(diff) % 60 ? ':' + A.pad(Math.abs(diff) % 60) : '') + ' h from you' }; }).filter(Boolean);
  };
  function wc(root) {
    const S = A.settings(), box = h('div', { class: 'stack' }); let when = null;
    const conv = h('input', { type: 'time', 'aria-label': 'Convert a local time', style: { width: 'auto' } });
    const draw = () => { const rows = A.clockRows(when); box.replaceChildren(...rows.map(r => h('div', { class: 'clock' }, h('span', { 'aria-hidden': 'true', style: { fontSize: '22px' } }, r.night ? '🌙' : '☀️'), h('div', null, h('b', null, r.city), h('div', { class: 'small muted' }, r.diff)), h('div', { class: 'tm num' }, r.time, h('small', null, r.day)), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove ' + r.city, onClick: () => { S.clocks = S.clocks.filter(z => z !== r.tz); A.save('settings'); A.route(); } }, A.ico('x'))))); if (!rows.length) box.append(A.empty('No clocks', 'Add a city below.', 'globe')); };
    conv.addEventListener('input', () => { const m = A.parseTime(conv.value); if (m == null) { when = null; } else { const n = new Date(); n.setHours(Math.floor(m / 60), m % 60, 0, 0); when = n; } draw(); });
    const add = h('select', { 'aria-label': 'Add a city', style: { width: 'auto' }, onChange: e => { if (e.target.value) { S.clocks.push(e.target.value); A.save('settings'); A.route(); } } }, h('option', { value: '' }, 'Add a city…'), CITIES.filter(c => !S.clocks.includes(c[1])).map(c => h('option', { value: c[1] }, c[0])));
    root.append(h('div', { class: 'card', style: { maxWidth: '640px', margin: '0 auto' } }, h('h3', null, 'World clocks'), h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, h('span', { class: 'small muted' }, 'Convert my local time'), conv, h('span', { class: 'grow' }), add), box)); draw();
    clearInterval(tick); tick = setInterval(() => { if (!conv.value) draw(); }, 20000);
  }
})();
