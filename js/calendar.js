/* Aide · calendar — six ways to look at the same schedule.
   Day · 3 days · Week share one time grid: events snap to 15 minutes, drag
   to move (mouse, or long-press on touch), stretch from the bottom edge, and
   arrow keys nudge the focused event (Shift + ↑↓ changes the duration).
   Month, Year and Agenda are built from the same expanded occurrences. */
(function () {
  'use strict';
  const A = window.Aide, { h, date: D, ev: E } = A;
  const SNAP = 15, MIN = 15;
  const ui = A.ui.cal = { view: null, anchor: D.today(), cats: new Set(Object.keys(A.CATS)), q: '' };
  try { const s = JSON.parse(localStorage.getItem('aide.ui') || '{}'); ui.view = s.calView || null; } catch (e) { /* ignore */ }
  const isPhone = () => matchMedia('(max-width: 860px)').matches;
  const VIEWS = [['day', 'Day'], ['3day', '3 Days'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['agenda', 'Agenda']];

  A.views.calendar = {
    title: 'Calendar', flush: true, noTop: true,
    render(root, bar) {
      if (!ui.view) ui.view = isPhone() ? 'day' : 'week';
      const view = ui.view, S = A.settings(), ws = S.weekStart;
      const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Calendar view' }, VIEWS.map(([k, n]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === view, onClick: () => { ui.view = k; localStorage.setItem('aide.ui', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('aide.ui') || '{}'), { calView: k }))); A.route(); } }, n)));
      const move = dir => { const v = view; ui.anchor = v === 'day' ? ui.anchor + dir : v === '3day' ? ui.anchor + 3 * dir : v === 'week' ? ui.anchor + 7 * dir : v === 'year' ? D.addMonths(ui.anchor, 12 * dir) : v === 'agenda' ? ui.anchor + 14 * dir : D.addMonths(ui.anchor, dir); A.route(); };
      const a = ui.anchor, y = D.ymd(a);
      let title, sub = '';
      if (view === 'day') { title = D.long(a); sub = D.sec(a) ? D.sec(a) : ''; }
      else if (view === '3day' || view === 'week') { const n = view === 'week' ? 7 : 3, s = view === 'week' ? D.weekStart(a, ws) : a, f = D.ymd(s), l = D.ymd(s + n - 1); title = f.m === l.m ? D.MON[f.m - 1] + ' ' + f.d + ' – ' + l.d + ', ' + l.y : D.MON3[f.m - 1] + ' ' + f.d + ' – ' + D.MON3[l.m - 1] + ' ' + l.d + ', ' + l.y; }
      else if (view === 'month') title = D.MON[y.m - 1] + ' ' + y.y; else if (view === 'year') title = String(y.y); else title = 'Next 30 days';
      const quick = h('input', { type: 'text', class: 'quick', placeholder: 'Quick add: “Call Sarah tomorrow 3pm 30m”', 'aria-label': 'Quick add', autocomplete: 'off', dir: 'auto', style: { maxWidth: '360px', minWidth: '180px', flex: '1 1 220px', minHeight: '34px', padding: '4px 14px', borderRadius: '999px' } });
      quick.addEventListener('keydown', ev => { if (ev.key !== 'Enter' || !quick.value.trim()) return; const p = E.parse(quick.value); quick.value = ''; E.edit(null, { title: p.title, date: D.iso(p.day), start: p.start != null ? p.start : undefined, dur: p.dur || undefined, cat: p.cat, allDay: p.cat === 'away' }); });
      const nav = h('div', { class: 'row' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous', onClick: () => move(-1) }, A.ico('chevL')),
        h('button', { class: 'btn sm', type: 'button', onClick: () => { ui.anchor = D.today(); A.route(); } }, 'Today'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next', onClick: () => move(1) }, A.ico('chevR')));
      const head = h('div', { class: 'cal-head' }, nav, h('div', { class: 'cal-title', 'aria-live': 'polite' }, title, sub ? h('small', null, sub) : null), h('span', { class: 'grow' }),
        seg, h('button', { class: 'btn primary', type: 'button', onClick: () => E.edit(null, { date: D.iso(view === 'day' ? a : D.today()) }) }, A.ico('plus'), h('span', { class: 'hide-sm' }, 'New')));
      const body = h('div', { class: 'cal-body view-enter' });
      root.append(head, catFilter(quick), body);
      ({ day: timeGrid, '3day': timeGrid, week: timeGrid, month, year, agenda })[view](body, view);
      A.keys = ev => { if (ev.target.matches('input,textarea,select')) return false; if (ev.key === 'ArrowLeft' && !ev.target.closest('.ev')) { move(-1); return true; } if (ev.key === 'ArrowRight' && !ev.target.closest('.ev')) { move(1); return true; } if (ev.key === 't') { ui.anchor = D.today(); A.route(); return true; } if (ev.key === 'n') { E.edit(null, {}); return true; } return false; };
    },
    destroy() { clearInterval(ui._t); A.keys = null; if (this._cleanup) { this._cleanup(); this._cleanup = null; } },
  };

  function catFilter(quick) {
    return h('div', { class: 'row wrap cal-filter', role: 'group', 'aria-label': 'Show categories and quick add' }, Object.entries(A.CATS).map(([k, n]) => h('button', { type: 'button', class: 'chip', style: Object.assign(A.catStyle(k), { opacity: ui.cats.has(k) ? 1 : .45 }), 'aria-pressed': ui.cats.has(k), onClick: ev => { ui.cats.has(k) ? ui.cats.delete(k) : ui.cats.add(k); A.route(); } }, h('i'), n)), h('span', { class: 'grow' }), quick);
  }
  const visible = occs => occs.filter(o => ui.cats.has(o.cat));
  const sub = o => [o.ev.people, o.ev.loc].filter(Boolean).join(' · ');

  /* ── time grid ────────────────────────────────────────────────────── */
  function timeGrid(body, view) {
    const S = A.settings(), n = view === 'day' ? 1 : view === '3day' ? 3 : 7, first = view === 'week' ? D.weekStart(ui.anchor, S.weekStart) : ui.anchor;
    const days = Array.from({ length: n }, (_, i) => first + i), t0 = D.today();
    const H0 = Math.max(0, Math.min(S.dayStart, 12)), H1 = Math.min(24, Math.max(S.dayEnd, H0 + 4)), hours = H1 - H0;
    body.style.setProperty('--cols', n); body.style.setProperty('--hours', hours);
    const occs = visible(E.expand(first, first + n - 1)), bad = E.conflictKeys(occs);
    const head = h('div', { class: 'tg-head' }, h('div'), days.map(d => h('div', { class: 'tg-day' + (d === t0 ? ' today' : '') }, h('button', { type: 'button', 'aria-label': D.long(d), onClick: () => { ui.anchor = d; ui.view = 'day'; A.route(); } }, h('span', { class: 'dn' }, D.DOW3[D.dow(d)]), h('span', { class: 'dd num' }, D.ymd(d).d), D.sec(d) ? h('span', { class: 'sec' }, D.sec(d)) : null))));
    const allday = h('div', { class: 'tg-allday' }, h('div'), days.map(d => h('div', null, occs.filter(o => o.allDay && o.day === d).map(o => h('button', { type: 'button', class: 'ev-chip', style: A.catStyle(o.cat), onClick: () => E.edit(o.ev) }, h('span', { class: 't' }, o.title))))));
    const hoursCol = h('div', { class: 'tg-hours' }, Array.from({ length: hours }, (_, i) => h('span', { style: { top: i * 100 / hours + '%' } }, i === 0 ? '' : A.hourLabel(H0 + i))));
    const cols = days.map(d => {
      const col = h('div', { class: 'tg-col' + (d === t0 ? ' today' : '') + (D.dow(d) > 4 ? ' wknd' : ''), 'data-day': d, role: 'group', 'aria-label': D.long(d) });
      // outside working hours (view range only)
      layout(occs.filter(o => !o.allDay && o.day === d)).forEach(p => col.append(evEl(p.o, p, H0, bad, hours)));
      return col;
    });
    const grid = h('div', { class: 'tg' }, hoursCol, cols);
    const scroll = h('div', { class: 'tg-scroll' }, grid);
    body.append(head, allday, scroll);
    const hourPx = () => parseFloat(getComputedStyle(grid).height) / hours;
    // scrollbar compensation for the sticky header
    requestAnimationFrame(() => { const sb = scroll.offsetWidth - scroll.clientWidth; body.style.setProperty('--sbw', sb + 'px'); });
    // now line
    const nowLine = () => { A.$$('.now-line', grid).forEach(x => x.remove()); const m = D.nowMin(); if (!days.includes(t0) || m < H0 * 60 || m > H1 * 60) return; const col = cols[days.indexOf(t0)]; col.append(h('div', { class: 'now-line', style: { top: (m - H0 * 60) / (hours * 60) * 100 + '%' } })); };
    nowLine(); clearInterval(ui._t); ui._t = setInterval(nowLine, 30000);
    // scroll to the first event or to "now"
    requestAnimationFrame(() => { const px = hourPx(), todayShown = days.includes(t0), firstMin = occs.filter(o => !o.allDay).reduce((m, o) => Math.min(m, o.start), 1e9); const target = todayShown ? Math.max(H0 * 60, D.nowMin() - 90) : Math.max(H0 * 60, Math.min(firstMin === 1e9 ? S.dayStart * 60 : firstMin, 14 * 60) - 30); scroll.scrollTop = (target - H0 * 60) / 60 * px; });
    interact(grid, cols, days, H0, hours, bad, occs);
  }

  function layout(list) {                              // side-by-side columns for overlaps
    const L = list.map(o => ({ o, s: o.start, e: Math.max(o.end, o.start + 20) })).sort((a, b) => a.s - b.s || b.e - a.e), out = []; let group = [], gEnd = -1;
    const flush = () => { const cols = []; group.forEach(p => { let c = cols.findIndex(end => end <= p.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = p.e; p.c = c; }); group.forEach(p => { p.n = cols.length; out.push(p); }); group = []; };
    L.forEach(p => { if (p.s >= gEnd && group.length) flush(); group.push(p); gEnd = Math.max(gEnd, p.e); }); if (group.length) flush();
    return out;
  }
  function evEl(o, p, H0, bad, hours) {
    const top = (o.start - H0 * 60) / (hours * 60) * 100, hgt = Math.max(o.dur, 20) / (hours * 60) * 100;
    const el = h('button', { type: 'button', class: 'ev' + (o.ev.status === 'tentative' ? ' tent' : '') + (bad.has(o.key) ? ' conflict' : '') + (o.ev.status === 'cancelled' ? ' done' : ''), style: Object.assign(A.catStyle(o.cat), { top: top + '%', height: hgt + '%', '--l': p.c * 100 / p.n, '--w': 100 / p.n }), 'data-key': o.key, 'data-day': o.day, 'data-start': o.start, 'data-dur': o.dur, 'aria-label': o.title + ', ' + A.time(o.start) + ' to ' + A.time(o.end) + (bad.has(o.key) ? ', conflict' : '') },
      h('span', { class: 't', dir: 'auto' }, o.title), o.dur >= 40 ? h('span', { class: 'm' }, A.time(o.start) + ' – ' + A.time(o.end)) : null, o.dur >= 60 && sub(o) ? h('span', { class: 'm', dir: 'auto' }, sub(o)) : null, h('i', { class: 'rz', 'aria-hidden': 'true' }));
    el._o = o; return el;
  }

  function interact(grid, cols, days, H0, hours, bad, occs) {
    const px = () => parseFloat(getComputedStyle(grid).height) / hours, snap = m => Math.round(m / SNAP) * SNAP;
    const minAt = (y, col) => { const r = col.getBoundingClientRect(); return H0 * 60 + (y - r.top) / r.height * hours * 60; };
    let drag = null, bubble = null;
    const say = (x, y, txt) => { bubble = bubble || h('div', { class: 'bubble' }); bubble.textContent = txt; bubble.style.left = x + 'px'; bubble.style.top = y + 'px'; if (!bubble.isConnected) document.body.append(bubble); };
    const stop = () => { bubble && bubble.remove(); bubble = null; };
    const blockTouch = ev => { if (drag && drag.on) ev.preventDefault(); };
    document.addEventListener('touchmove', blockTouch, { passive: false });
    grid.addEventListener('pointerdown', ev => {
      const evEl = ev.target.closest('.ev'), col = ev.target.closest('.tg-col'); if (ev.button > 0 || !col) return;
      if (evEl) {
        const o = evEl._o, resize = !!ev.target.closest('.rz'), touch = ev.pointerType === 'touch';
        drag = { type: resize ? 'resize' : 'move', el: evEl, o, x0: ev.clientX, y0: ev.clientY, id: ev.pointerId, on: false, armed: !touch || resize, col, day: o.day, start: o.start, dur: o.dur, moved: false };
        if (touch && !resize) drag.timer = setTimeout(() => { drag.armed = true; drag.on = true; evEl.classList.add('drag'); if (navigator.vibrate) navigator.vibrate(12); }, 380);
        if (resize) drag.on = true;
      } else if (ev.pointerType !== 'touch') {
        const m0 = Math.max(H0 * 60, Math.min(H0 * 60 + hours * 60 - SNAP, Math.floor(minAt(ev.clientY, col) / SNAP) * SNAP));
        drag = { type: 'draw', col, m0, id: ev.pointerId, on: false, armed: true, x0: ev.clientX, y0: ev.clientY, box: null, day: +col.dataset.day, m1: m0 + A.settings().defDur };
      } else { drag = { type: 'tap', col, x0: ev.clientX, y0: ev.clientY, y: ev.clientY, id: ev.pointerId, moved: false, t: Date.now() }; }
    });
    const onMove = ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.x0, dy = ev.clientY - drag.y0, far = Math.hypot(dx, dy) > 6;
      if (drag.type === 'tap') { if (far) drag.moved = true; return; }
      if (drag.timer && far && !drag.armed) { clearTimeout(drag.timer); drag = null; return; }          // it was a scroll
      if (!drag.armed) return;
      if (!drag.on && far) { drag.on = true; if (drag.type === 'move') drag.el.classList.add('drag'); }
      if (!drag.on) return;
      const hp = px();
      if (drag.type === 'move') {
        const dm = snap(dy / hp * 60), cw = grid.querySelector('.tg-col').getBoundingClientRect().width, dd = Math.round(dx / cw);
        drag.start = Math.max(H0 * 60, Math.min(H0 * 60 + hours * 60 - drag.dur, snap(drag.o.start + dm))); drag.day = Math.max(days[0], Math.min(days[days.length - 1], drag.o.day + dd));
        drag.el.style.transform = 'translate(' + (dx) + 'px,' + ((drag.start - drag.o.start) / 60 * hp) + 'px)';
        say(ev.clientX, ev.clientY, D.DOW3[D.dow(drag.day)] + ' ' + A.time(drag.start) + ' – ' + A.time(drag.start + drag.dur));
      } else if (drag.type === 'resize') {
        drag.dur = Math.max(MIN, snap(drag.o.dur + dy / hp * 60)); drag.el.style.height = 'calc(' + (drag.dur / (hours * 60) * 100) + '% )';
        say(ev.clientX, ev.clientY, A.time(drag.o.start) + ' – ' + A.time(drag.o.start + drag.dur) + ' · ' + A.dur(drag.dur));
      } else if (drag.type === 'draw') {
        const m = Math.max(H0 * 60, Math.min(H0 * 60 + hours * 60, snap(minAt(ev.clientY, drag.col)))); const a = Math.min(drag.m0, m), b = Math.max(drag.m0 + SNAP, m); drag.a = a; drag.m1 = b;
        drag.box = drag.box || h('div', { class: 'drawing' }); if (!drag.box.isConnected) drag.col.append(drag.box);
        drag.box.style.top = (a - H0 * 60) / (hours * 60) * 100 + '%'; drag.box.style.height = (b - a) / (hours * 60) * 100 + '%';
        say(ev.clientX, ev.clientY, A.time(a) + ' – ' + A.time(b));
      }
    };
    window.addEventListener('pointermove', onMove);
    const end = ev => {
      if (!drag || (ev.pointerId !== drag.id && ev.type !== 'cancel')) return; const d = drag; drag = null; clearTimeout(d.timer); stop();
      if (ev.type === 'pointercancel') { d.el && (d.el.style.transform = '', d.el.classList.remove('drag')); d.box && d.box.remove(); return; }
      if (d.type === 'tap') { if (!d.moved && Date.now() - d.t < 450) { const m = Math.max(H0 * 60, Math.floor(minAt(d.y, d.col) / 30) * 30); E.edit(null, { date: D.iso(+d.col.dataset.day), start: Math.min(m, 1380), dur: A.settings().defDur }); } return; }
      if (d.type === 'draw') { d.box && d.box.remove(); const day = d.day; if (!d.on) E.edit(null, { date: D.iso(day), start: d.m0, dur: A.settings().defDur }); else E.edit(null, { date: D.iso(day), start: d.a != null ? d.a : d.m0, dur: Math.max(15, d.m1 - (d.a != null ? d.a : d.m0)) }); return; }
      if (!d.on) { d.el.classList.remove('drag'); if (d.type === 'move') E.edit(d.o.ev); return; }       // a plain click opens the editor
      const changed = d.type === 'move' ? (d.day !== d.o.day || d.start !== d.o.start) : d.dur !== d.o.dur;
      if (!changed) { d.el.style.transform = ''; d.el.classList.remove('drag'); d.el.style.height = ''; if (d.type === 'resize') E.edit(d.o.ev); return; }   // a tap on the bottom edge still opens it
      const to = { day: d.day, start: d.type === 'move' ? d.start : d.o.start, dur: d.dur }, clash = E.clashes(to.day, to.start, to.dur, d.o.id);
      E.moveOcc(d.o, to); if (clash.length) A.toast('Heads up: this now overlaps “' + clash[0].title + '”.', { ms: 4500 });
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    grid.addEventListener('click', e => { const el = e.target.closest('.ev'); if (el && e.detail === 0) E.edit(el._o.ev); });   // keyboard Enter / Space
    // keyboard: arrows move, shift+arrows resize, Enter edits, Delete removes
    grid.addEventListener('keydown', ev => {
      const el = ev.target.closest('.ev'); if (!el) return; const o = el._o, k = ev.key;
      if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); E.askDelete(o.ev, D.iso(o.day)); return; }
      if (!/^Arrow/.test(k)) return; ev.preventDefault();
      let day = o.day, start = o.start, dur = o.dur;
      if (ev.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown')) dur = Math.max(MIN, dur + (k === 'ArrowDown' ? SNAP : -SNAP)); else if (k === 'ArrowUp') start -= SNAP; else if (k === 'ArrowDown') start += SNAP; else day += k === 'ArrowLeft' ? -1 : 1;
      start = Math.max(0, Math.min(1440 - dur, start)); E.moveOcc(o, { day, start, dur }); setTimeout(() => { const n = A.$('.ev[data-key^="' + CSS.escape(o.ev.id) + '"]'); n && n.focus(); }, 30);
    });
    A.views.calendar._cleanup = () => { document.removeEventListener('touchmove', blockTouch); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); stop(); };
  }

  /* ── month ────────────────────────────────────────────────────────── */
  function month(body) {
    const S = A.settings(), y = D.ymd(ui.anchor), first = D.num(y.y, y.m, 1), gs = D.weekStart(first, S.weekStart), total = Math.ceil((first - gs + D.daysIn(y.y, y.m)) / 7) * 7, last = gs + total - 1, t0 = D.today();
    const occs = visible(E.expand(gs, last)), by = {}; occs.forEach(o => (by[o.day] = by[o.day] || []).push(o));
    let sel = ui._sel != null && ui._sel >= gs && ui._sel <= last ? ui._sel : (t0 >= gs && t0 <= last ? t0 : first);
    const dow = h('div', { class: 'mo-dow' }, Array.from({ length: 7 }, (_, i) => h('span', null, D.DOW3[(S.weekStart + i) % 7])));
    const panel = h('div', { class: 'mo-side' });
    const fill = () => { const L = by[sel] || []; panel.replaceChildren(h('b', null, D.long(sel)), h('div', { class: 'stack', style: { marginTop: '8px' } }, L.length ? L.map(o => evChip(o)) : h('span', { class: 'muted' }, 'Nothing scheduled.'))); };
    const cells = [];
    const grid = h('div', { class: 'mo-grid' }, Array.from({ length: total }, (_, i) => {
      const d = gs + i, L = by[d] || [], out = D.ymd(d).m !== y.m;
      const c = h('button', { type: 'button', class: 'mo-cell' + (out ? ' out' : '') + (d === t0 ? ' today' : '') + (d === sel ? ' sel' : ''), 'aria-label': D.long(d) + ', ' + L.length + ' events', onClick: () => { if (isPhone()) { sel = d; ui._sel = d; cells.forEach((x, j) => x.classList.toggle('sel', gs + j === sel)); fill(); } else { ui.anchor = d; ui.view = 'day'; A.route(); } }, onDblclick: () => E.edit(null, { date: D.iso(d) }) },
        h('span', { class: 'd' }, h('b', { class: 'num' }, D.ymd(d).d), D.sec(d) ? h('em', null, D.sec(d)) : null),
        L.slice(0, 3).map(o => h('span', { class: 'mo-ev', style: A.catStyle(o.cat), dir: 'auto' }, (o.allDay ? '' : A.time(o.start) + ' ') + o.title)), L.length > 3 ? h('span', { class: 'mo-more' }, '+' + (L.length - 3) + ' more') : null,
        h('span', { class: 'mo-dots' }, L.slice(0, 4).map(o => h('i', { class: 'dot', style: { background: 'var(--b-' + o.cat + ')' } }))));
      cells.push(c); return c;
    }));
    fill(); body.append(h('div', { class: 'mo' }, dow, grid), panel);
  }
  function evChip(o) { return h('button', { type: 'button', class: 'ev-chip', style: A.catStyle(o.cat), onClick: () => E.edit(o.ev) }, h('span', { class: 'grow' }, h('span', { class: 't', dir: 'auto' }, o.title), h('small', null, (o.allDay ? 'All day' : A.time(o.start) + ' – ' + A.time(o.end)) + (sub(o) ? ' · ' + sub(o) : ''))), o.ev.status === 'tentative' ? h('span', { class: 'pill' }, 'Tentative') : null); }

  /* ── year ─────────────────────────────────────────────────────────── */
  function year(body) {
    const S = A.settings(), Y = D.ymd(ui.anchor).y, t0 = D.today(), occs = visible(E.expand(D.num(Y, 1, 1), D.num(Y, 12, 31))), cnt = {}; occs.forEach(o => cnt[o.day] = (cnt[o.day] || 0) + 1);
    body.append(h('div', { class: 'yr' }, Array.from({ length: 12 }, (_, mi) => {
      const first = D.num(Y, mi + 1, 1), lead = (D.dow(first) - S.weekStart + 7) % 7, n = D.daysIn(Y, mi + 1);
      return h('section', { class: 'mini' }, h('h4', null, h('button', { type: 'button', onClick: () => { ui.anchor = first; ui.view = 'month'; A.route(); } }, D.MON[mi])),
        h('div', { class: 'mini-grid' }, Array.from({ length: 7 }, (_, i) => h('b', null, D.DOW3[(S.weekStart + i) % 7][0])), Array.from({ length: lead }, () => h('span')), Array.from({ length: n }, (_, i) => { const d = first + i; return h('button', { type: 'button', class: d === t0 ? 'today' : '', style: { '--heat': Math.min(cnt[d] || 0, 6) }, 'aria-label': D.long(d) + ', ' + (cnt[d] || 0) + ' events', onClick: () => { ui.anchor = d; ui.view = 'day'; A.route(); } }, i + 1); })));
    })));
  }

  /* ── agenda ───────────────────────────────────────────────────────── */
  function agenda(body) {
    const from = ui.anchor, to = from + 29, occs = visible(E.expand(from, to)), bad = E.conflictKeys(occs), t0 = D.today();
    const q = h('input', { type: 'search', placeholder: 'Filter agenda…', value: ui.q, 'aria-label': 'Filter agenda', dir: 'auto', style: { maxWidth: '320px', margin: '10px 22px 0' } });
    const wrap = h('div', { class: 'ag' });
    const draw = () => {
      const term = q.value.trim().toLowerCase(); ui.q = q.value; wrap.replaceChildren();
      const L = term ? occs.filter(o => (o.title + ' ' + (o.ev.people || '') + ' ' + (o.ev.loc || '') + ' ' + (o.ev.notes || '')).toLowerCase().includes(term)) : occs;
      if (!L.length) return wrap.append(A.empty('Nothing here', 'No events in the next 30 days match.'));
      const g = {}; L.forEach(o => (g[o.day] = g[o.day] || []).push(o));
      Object.keys(g).sort((a, b) => a - b).forEach(d => { d = +d; wrap.append(h('div', { class: 'ag-day' + (d === t0 ? ' today' : '') }, h('div', { class: 'dl num' }, D.ymd(d).d, h('small', null, D.DOW3[D.dow(d)] + ' · ' + D.MON3[D.ymd(d).m - 1])), h('div', { class: 'list' }, g[d].map(o => { const c = evChip(o); if (bad.has(o.key)) c.append(h('span', { class: 'pill', style: { '--c': 'var(--danger-bg)', color: 'var(--danger)' } }, 'Conflict')); return c; })))); });
    };
    q.addEventListener('input', A.debounce(draw, 120)); body.append(q, wrap); draw();
  }
})();
