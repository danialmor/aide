/* Aide · people — everything about other people's time:
   Requests (who wants to see the executive), Availability (visiting hours the
   executive is open to, plus a live list of real free windows) and Contacts. */
(function () {
  'use strict';
  const A = window.Aide, { h, date: D, ev: E } = A;

  /* ── free windows: availability minus the schedule ────────────────── */
  A.windows = function (dur, days = 14, from) {
    const S = A.settings(), buf = S.buffer == null ? 10 : S.buffer, av = A.db.data.avail, t0 = from == null ? D.today() : from, out = [], nowM = D.nowMin();
    const occs = E.expand(t0, t0 + days);
    for (let d = t0; d < t0 + days; d++) {
      const dw = D.dow(d), slots = (av[dw] || []).slice().sort((a, b) => a - b); if (!slots.length || E.awayOn(d)) continue;
      let ranges = [], s = null, p = null;                                    // contiguous half-hour slots → ranges
      slots.forEach(i => { if (s == null) { s = i; p = i; } else if (i === p + 1) p = i; else { ranges.push([s * 30, (p + 1) * 30]); s = i; p = i; } }); if (s != null) ranges.push([s * 30, (p + 1) * 30]);
      if (d === t0) ranges = ranges.map(([a, b]) => [Math.max(a, Math.ceil((nowM + 15) / 15) * 15), b]).filter(([a, b]) => b > a);
      const busy = occs.filter(o => o.day === d && !o.allDay && o.dur > 0 && o.cat !== 'away').map(o => [o.start - buf, o.end + buf]).sort((a, b) => a[0] - b[0]);
      for (const [a0, b0] of ranges) {
        let cur = a0; const free = [];
        for (const [bs, be] of busy) { if (be <= cur) continue; if (bs >= b0) break; if (bs > cur) free.push([cur, Math.min(bs, b0)]); cur = Math.max(cur, be); }
        if (cur < b0) free.push([cur, b0]);
        free.forEach(([a, b]) => { if (b - a >= dur) out.push({ day: d, from: a, to: b }); });
      }
    }
    return out;
  };
  const winText = w => D.mid(w.day) + ', ' + A.time(w.from) + '–' + A.time(w.to);
  const sign = () => { const S = A.settings(); return 'Kind regards,\n' + (S.assistant || 'Executive Office') + (S.name ? '\nOffice of ' + S.name : ''); };
  const replyBox = (title, text, to) => {
    const ta = h('textarea', { dir: 'auto', style: { minHeight: '230px' } }); ta.value = text;
    const m = A.modal({ title, body: [ta, h('p', { class: 'note' }, 'Edit the text if you like, then copy it into your email or chat.')], footer: [
      to ? h('a', { class: 'btn', href: 'mailto:' + encodeURIComponent(to) + '?body=' + encodeURIComponent(ta.value), onClick: e => { e.currentTarget.href = 'mailto:' + encodeURIComponent(to) + '?body=' + encodeURIComponent(ta.value); } }, A.ico('mail'), 'Open email') : null,
      h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Close'), h('button', { class: 'btn primary', type: 'button', onClick: () => A.copy(ta.value) }, A.ico('copy'), 'Copy')] });
  };

  /* ── requests ─────────────────────────────────────────────────────── */
  const reqUI = { tab: 'pending' };
  const STAT = { pending: 'Pending', approved: 'Approved', declined: 'Declined' };
  A.views.requests = {
    title: 'Requests', sub: 'Meeting and visit requests for the executive',
    actions: () => [h('button', { class: 'btn primary', type: 'button', onClick: () => editReq() }, A.ico('plus'), 'New request')],
    render(root) {
      const R = A.db.data.requests, count = s => R.filter(r => r.status === s).length;
      root.append(h('div', { class: 'row wrap', style: { marginBottom: '14px' } }, h('div', { class: 'seg', role: 'tablist' }, Object.entries(STAT).map(([k, n]) => h('button', { type: 'button', role: 'tab', 'aria-selected': reqUI.tab === k, onClick: () => { reqUI.tab = k; A.route(); } }, n + ' · ' + count(k))))));
      const list = R.filter(r => r.status === reqUI.tab).sort((a, b) => (b.pri === 'high') - (a.pri === 'high') || b.created - a.created);
      if (!list.length) return root.append(A.empty(reqUI.tab === 'pending' ? 'Inbox zero' : 'Nothing here yet', reqUI.tab === 'pending' ? 'No pending requests. New ones appear here.' : '', 'inbox'));
      root.append(h('div', { class: 'grid g2' }, list.map(r => h('article', { class: 'req' + (r.pri === 'high' ? ' high' : '') },
        h('div', { class: 'row' }, h('div', { class: 'avatar' }, A.initials(r.who)), h('div', { class: 'grow' }, h('b', { dir: 'auto' }, r.who), h('div', { class: 'small muted', dir: 'auto' }, [r.org, 'asked ' + D.rel(r.created).toLowerCase()].filter(Boolean).join(' · '))), r.pri === 'high' ? h('span', { class: 'pill', style: { '--c': 'var(--danger-bg)', color: 'var(--danger)' } }, 'High priority') : null),
        h('p', { dir: 'auto' }, r.purpose), h('div', { class: 'row wrap small muted' }, h('span', null, A.dur(r.dur || 30)), r.pref ? h('span', null, '· ' + r.pref) : null, r.status === 'approved' && r.when ? h('span', null, '· Booked ' + r.when) : null),
        h('div', { class: 'row wrap' },
          r.status === 'pending' ? [h('button', { class: 'btn sm primary', type: 'button', onClick: () => approve(r) }, 'Approve & schedule'), h('button', { class: 'btn sm', type: 'button', onClick: () => propose(r) }, 'Suggest times'), h('button', { class: 'btn sm', type: 'button', onClick: () => decline(r) }, 'Decline')] : h('button', { class: 'btn sm', type: 'button', onClick: () => { A.patch('requests', r.id, { status: 'pending' }); A.route(); } }, 'Move back to pending'),
          h('span', { class: 'grow' }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Edit request', onClick: () => editReq(r) }, A.ico('settings')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete request', onClick: () => { A.del('requests', r.id, 'Request deleted'); A.route(); } }, A.ico('trash')))))));
    },
  };
  function editReq(r) {
    const isNew = !r, o = r || { who: '', org: '', purpose: '', dur: 30, pref: '', pri: 'normal', status: 'pending', email: '', created: D.today() };
    const f = { who: h('input', { type: 'text', dir: 'auto', value: o.who, placeholder: 'Full name' }), org: h('input', { type: 'text', dir: 'auto', value: o.org || '', placeholder: 'Company / organisation' }), email: h('input', { type: 'email', value: o.email || '', placeholder: 'name@example.com' }), purpose: h('textarea', { dir: 'auto', placeholder: 'What is it about?' }), dur: h('select', null, [15, 30, 45, 60, 90, 120].map(v => h('option', { value: v, selected: v === o.dur }, A.dur(v)))), pref: h('input', { type: 'text', dir: 'auto', value: o.pref || '', placeholder: 'e.g. mornings next week' }), pri: h('select', null, [['normal', 'Normal'], ['high', 'High priority']].map(([v, t]) => h('option', { value: v, selected: v === o.pri }, t))) };
    f.purpose.value = o.purpose;
    const m = A.modal({ title: isNew ? 'New request' : 'Edit request', body: [A.field('Who', f.who), h('div', { class: 'two' }, A.field('Organisation', f.org), A.field('Email', f.email)), A.field('Purpose', f.purpose), h('div', { class: 'two' }, A.field('Length', f.dur), A.field('Priority', f.pri)), A.field('Preferred time', f.pref)],
      footer: [h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onClick: () => { if (!f.who.value.trim()) return A.toast('Who is asking?'); const d = { who: f.who.value.trim(), org: f.org.value.trim(), email: f.email.value.trim(), purpose: f.purpose.value.trim() || 'Meeting', dur: +f.dur.value, pref: f.pref.value.trim(), pri: f.pri.value }; isNew ? A.add('requests', Object.assign(o, d)) : A.patch('requests', o.id, d); m.close(); reqUI.tab = isNew ? 'pending' : reqUI.tab; A.route(); } }, 'Save')] });
  }
  function approve(r) {
    const w = A.windows(r.dur || 30, 21)[0], visit = /visit|tour|site/i.test(r.purpose);
    E.edit(null, { title: (visit ? 'Visit: ' : 'Meeting: ') + r.who + (r.org ? ' (' + r.org + ')' : ''), people: r.who, cat: visit ? 'visit' : 'meeting', date: w ? D.iso(w.day) : D.iso(D.today() + 1), start: w ? w.from : 10 * 60, dur: r.dur || 30, notes: r.purpose }, ev => { A.patch('requests', r.id, { status: 'approved', when: D.mid(D.parse(ev.date)) + ' ' + A.time(ev.start), eventId: ev.id }); A.route(); });
    if (w) A.toast('Suggested the first free slot: ' + winText(w));
  }
  function propose(r) {
    const ws = A.windows(r.dur || 30, 21).slice(0, 5), S = A.settings();
    replyBox('Suggest times to ' + r.who, 'Dear ' + r.who + ',\n\nThank you for your request regarding “' + r.purpose + '”. ' + (S.name || 'The executive') + ' would be glad to meet. The following ' + A.dur(r.dur || 30) + ' times are available:\n\n' + (ws.length ? ws.map(w => '• ' + D.long(w.day).replace(/, \d{4}$/, '') + ', ' + A.time(w.from) + ' – ' + A.time(Math.min(w.to, w.from + (r.dur || 30)))).join('\n') : '• (no open times in the next three weeks — please check Availability)') + '\n\nPlease let me know which suits you best and I will confirm the booking.\n\n' + sign(), r.email);
  }
  function decline(r) {
    const S = A.settings(); replyBox('Reply to ' + r.who, 'Dear ' + r.who + ',\n\nThank you for thinking of ' + (S.name || 'us') + ' regarding “' + r.purpose + '”. Unfortunately the diary is full for the coming weeks, so we are unable to accommodate a meeting at this time. We would be happy to reconnect later in the year.\n\nWith thanks for your understanding,\n' + sign().replace('Kind regards,\n', ''), r.email);
    A.patch('requests', r.id, { status: 'declined' }); A.route();
  }

  /* ── availability / visiting hours ────────────────────────────────── */
  const avUI = { dur: 30 };
  A.views.availability = {
    title: 'Availability', sub: 'Visiting hours and real free windows',
    actions: () => [h('button', { class: 'btn', type: 'button', onClick: () => E.edit(null, { cat: 'away', allDay: true, title: 'Out of office' }) }, A.ico('calendar'), 'Block dates')],
    render(root) {
      const S = A.settings(), av = A.db.data.avail, ws = S.weekStart, H0 = Math.min(S.dayStart, 12), H1 = Math.max(S.dayEnd, H0 + 4), rows = (H1 - H0) * 2;
      const order = Array.from({ length: 7 }, (_, i) => (ws + i) % 7), on = (dw, i) => (av[dw] || []).includes(i);
      const grid = h('div', { class: 'av-grid', role: 'application', 'aria-label': 'Weekly visiting hours. Drag to add or remove.' }, h('div', { class: 'hd' }), order.map(dw => h('div', { class: 'hd' }, D.DOW3[dw])));
      for (let r = 0; r < rows; r++) { const slot = H0 * 2 + r; A.put(grid, h('div', { class: 'hr' }, r % 2 === 0 ? A.hourLabel(H0 + r / 2).replace(':00', '') : ''), order.map(dw => h('div', { class: 'av-cell' + (r % 2 === 0 ? ' hour' : '') + (on(dw, slot) ? ' on' : ''), 'data-dw': dw, 'data-slot': slot }))); }
      let mode = null;
      const paint = el => { if (!el || !el.classList || !el.classList.contains('av-cell')) return; const dw = +el.dataset.dw, s = +el.dataset.slot; const list = av[dw] = av[dw] || []; const has = list.includes(s); if (mode === 'add' && !has) list.push(s); else if (mode === 'del' && has) list.splice(list.indexOf(s), 1); else return; el.classList.toggle('on', mode === 'add'); };
      grid.addEventListener('pointerdown', e => { const c = e.target.closest('.av-cell'); if (!c) return; e.preventDefault(); mode = c.classList.contains('on') ? 'del' : 'add'; grid.setPointerCapture(e.pointerId); paint(c); });
      grid.addEventListener('pointermove', e => { if (mode) paint(document.elementFromPoint(e.clientX, e.clientY)); });
      const done = () => { if (mode) { mode = null; A.save('avail'); drawSlots(); } }; grid.addEventListener('pointerup', done); grid.addEventListener('pointercancel', done);
      const preset = fn => { fn(); A.save('avail'); A.route(); };
      const range = (a, b) => { const o = []; for (let i = a * 2; i < b * 2; i++) o.push(i); return o; };
      const tools = h('div', { class: 'row wrap', style: { marginBottom: '10px' } },
        h('button', { class: 'btn sm', type: 'button', onClick: () => preset(() => { for (let d = 0; d < 5; d++) av[d] = range(10, 12).concat(range(14, 16)); av[5] = []; av[6] = []; }) }, 'Weekdays 10–12 & 14–16'),
        h('button', { class: 'btn sm', type: 'button', onClick: () => preset(() => { const m = (av[0] || []).slice(); for (let d = 1; d < 5; d++) av[d] = m.slice(); }) }, 'Copy Monday → Fri'),
        h('button', { class: 'btn sm danger', type: 'button', onClick: () => preset(() => { A.db.data.avail = {}; }) }, 'Clear all'));
      const slotsBox = h('div', { class: 'stack' });
      const dur = h('select', { 'aria-label': 'Meeting length', style: { width: 'auto' }, onChange: () => { avUI.dur = +dur.value; drawSlots(); } }, [15, 30, 45, 60, 90, 120].map(v => h('option', { value: v, selected: v === avUI.dur }, A.dur(v))));
      function drawSlots() {
        const ws2 = A.windows(avUI.dur, 21); slotsBox.replaceChildren();
        if (!ws2.length) return slotsBox.append(A.empty('No free windows', 'Paint some visiting hours on the left, or shorten the meeting length.', 'clock'));
        ws2.slice(0, 40).forEach(w => slotsBox.append(h('div', { class: 'slot' }, h('div', { class: 'grow' }, h('b', null, D.rel(w.day) + ' · ' + A.time(w.from) + '–' + A.time(w.to)), h('div', { class: 'small muted' }, A.dur(w.to - w.from) + ' free')), h('button', { class: 'btn sm', type: 'button', onClick: () => E.edit(null, { date: D.iso(w.day), start: w.from, dur: avUI.dur, cat: 'visit', title: 'Visit: ' }) }, 'Book'))));
        copyBtn.onclick = () => A.copy('Available times (' + A.dur(avUI.dur) + '):\n' + ws2.slice(0, 6).map(w => '• ' + D.long(w.day).replace(/, \d{4}$/, '') + ', ' + A.time(w.from) + ' – ' + A.time(w.to)).join('\n'));
      }
      const copyBtn = h('button', { class: 'btn sm', type: 'button' }, A.ico('copy'), 'Copy 6 times');
      const away = E.expand(D.today(), D.today() + 120).filter(o => o.allDay && (o.cat === 'away' || o.cat === 'travel'));
      root.append(h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', alignItems: 'start' }, id: 'avgrid' },
        h('div', { class: 'card' }, h('h3', null, 'Weekly visiting hours'), h('p', { class: 'note', style: { marginBottom: '10px' } }, 'Drag across the grid to mark the hours the executive can receive visitors and meetings. Each cell is 30 minutes.'), tools, grid),
        h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('h3', null, 'Free windows', h('span', { class: 'grow' }), dur, copyBtn), h('p', { class: 'note', style: { marginBottom: '10px' } }, 'Visiting hours minus the schedule, with a ' + (S.buffer == null ? 10 : S.buffer) + '-minute buffer. Days marked out of office are skipped.'), slotsBox),
          h('div', { class: 'card' }, h('h3', null, 'Away & blocked days'), away.length ? h('div', { class: 'stack' }, away.slice(0, 8).map(o => h('button', { type: 'button', class: 'ev-chip', style: A.catStyle(o.cat), onClick: () => E.edit(o.ev) }, h('span', { class: 'grow' }, h('span', { class: 't', dir: 'auto' }, o.title), h('small', null, D.mid(o.day)))))) : h('p', { class: 'muted small' }, 'No upcoming travel or out-of-office days.')))));
      if (matchMedia('(max-width: 1100px)').matches) A.$('#avgrid').style.gridTemplateColumns = 'minmax(0,1fr)';
      drawSlots();
    },
  };

  /* ── contacts ─────────────────────────────────────────────────────── */
  const cUI = { q: '', tag: '' };
  A.views.people = {
    title: 'People', sub: 'Contacts, VIPs and visitors',
    actions: () => [h('button', { class: 'btn primary', type: 'button', onClick: () => editContact() }, A.ico('plus'), 'New contact')],
    render(root) {
      const C = A.db.data.contacts, tags = [...new Set(C.flatMap(c => c.tags || []))].sort();
      const q = h('input', { type: 'search', placeholder: 'Search name, company, note…', value: cUI.q, 'aria-label': 'Search contacts', dir: 'auto' }), box = h('div');
      const chips = h('div', { class: 'row wrap', style: { margin: '10px 0 12px' } }, tags.map(t => h('button', { type: 'button', class: 'chip', 'aria-pressed': cUI.tag === t, style: { background: cUI.tag === t ? 'var(--accent)' : '', color: cUI.tag === t ? '#fff' : '' }, onClick: () => { cUI.tag = cUI.tag === t ? '' : t; A.route(); } }, t)));
      const draw = () => {
        cUI.q = q.value; const term = q.value.trim().toLowerCase(); box.replaceChildren();
        const L = C.filter(c => (!cUI.tag || (c.tags || []).includes(cUI.tag)) && (!term || [c.name, c.org, c.role, c.notes, c.email].join(' ').toLowerCase().includes(term))).sort((a, b) => a.name.localeCompare(b.name));
        if (!L.length) return box.append(A.empty('No contacts', term ? 'Nothing matches your search.' : 'Add VIPs, visitors and suppliers.', 'people'));
        let letter = '';
        const card = h('div', { class: 'card', style: { padding: '6px' } });
        L.forEach(c => { const l = (c.name[0] || '#').toUpperCase(); if (l !== letter) { letter = l; card.append(h('div', { class: 'alpha' }, l)); } card.append(h('button', { type: 'button', class: 'item', onClick: () => editContact(c) }, h('div', { class: 'avatar' }, A.initials(c.name)), h('div', { class: 'grow' }, h('b', { dir: 'auto' }, c.name), h('div', { class: 'small muted', dir: 'auto' }, [c.role, c.org].filter(Boolean).join(' · '))), (c.tags || []).slice(0, 2).map(t => h('span', { class: 'pill', style: t === 'VIP' ? { '--c': 'var(--c-focus)' } : {} }, t)))); });
        box.append(card);
      };
      q.addEventListener('input', A.debounce(draw, 120)); root.append(q, chips, box); draw();
    },
  };
  function editContact(c) {
    const isNew = !c, o = c || { name: '', org: '', role: '', phone: '', email: '', tags: [], notes: '' };
    const f = { name: h('input', { type: 'text', dir: 'auto', value: o.name, placeholder: 'Full name' }), org: h('input', { type: 'text', dir: 'auto', value: o.org || '' }), role: h('input', { type: 'text', dir: 'auto', value: o.role || '' }), phone: h('input', { type: 'tel', value: o.phone || '' }), email: h('input', { type: 'email', value: o.email || '' }), tags: h('input', { type: 'text', value: (o.tags || []).join(', '), placeholder: 'VIP, Board, Press…' }), notes: h('textarea', { dir: 'auto', placeholder: 'Preferences, assistant’s number, how to greet…' }) };
    f.notes.value = o.notes || '';
    const hist = !isNew ? E.expand(D.today() - 120, D.today() + 120).filter(x => (x.ev.people || '').toLowerCase().includes(o.name.toLowerCase())) : [], past = hist.filter(x => x.day < D.today()).slice(-1)[0], next = hist.filter(x => x.day >= D.today())[0];
    const m = A.modal({ title: isNew ? 'New contact' : o.name, body: [
      !isNew ? h('div', { class: 'row wrap' }, o.phone ? h('a', { class: 'btn sm', href: 'tel:' + o.phone.replace(/\s/g, '') }, A.ico('phone'), 'Call') : null, o.email ? h('a', { class: 'btn sm', href: 'mailto:' + o.email }, A.ico('mail'), 'Email') : null, h('button', { class: 'btn sm', type: 'button', onClick: () => { m.close(); E.edit(null, { people: o.name, title: 'Meeting with ' + o.name }); } }, A.ico('calendar'), 'Schedule'), h('span', { class: 'small muted' }, next ? 'Next: ' + D.mid(next.day) + ' ' + A.time(next.start) : past ? 'Last: ' + D.mid(past.day) : 'No meetings on record')) : null,
      A.field('Name', f.name), h('div', { class: 'two' }, A.field('Organisation', f.org), A.field('Role', f.role)), h('div', { class: 'two' }, A.field('Phone', f.phone), A.field('Email', f.email)), A.field('Tags', f.tags), A.field('Notes', f.notes)],
      footer: [!isNew ? h('button', { class: 'btn danger', type: 'button', onClick: () => { A.del('contacts', o.id, 'Contact deleted'); m.close(); A.route(); } }, 'Delete') : null, h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onClick: () => { if (!f.name.value.trim()) return A.toast('A name is needed.'); const d = { name: f.name.value.trim(), org: f.org.value.trim(), role: f.role.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), tags: f.tags.value.split(',').map(s => s.trim()).filter(Boolean), notes: f.notes.value }; isNew ? A.add('contacts', Object.assign(o, d)) : A.patch('contacts', o.id, d); m.close(); A.route(); } }, 'Save')] });
  }
})();
