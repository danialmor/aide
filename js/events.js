/* Aide · events — the schedule model shared by every calendar view.
   An event is stored once; recurring events are expanded on demand into
   "occurrences" for the days being drawn. Conflicts (double bookings) are
   found on the expanded occurrences. */
(function () {
  'use strict';
  const A = window.Aide, { h, date: D } = A;
  const E = A.ev = {};
  const events = () => A.db.data.events;

  /* ── expansion ────────────────────────────────────────────────────── */
  E.expand = function (from, to, opt = {}) {
    const out = [];
    for (const e of events()) {
      if (e.status === 'cancelled' && !opt.cancelled) continue;
      const b = D.parse(e.date); if (b == null) continue;
      const span = e.allDay ? Math.max(1, e.span || 1) : 1;
      const push = d => out.push({ ev: e, id: e.id, day: d, start: e.allDay ? 0 : e.start, dur: e.allDay ? 1440 : e.dur, allDay: !!e.allDay, cat: e.cat, key: e.id + '@' + d, title: e.title, rec: !!(e.rec && e.rec !== 'none'), end: e.allDay ? 1440 : e.start + e.dur });
      if (!e.rec || e.rec === 'none') { for (let k = 0; k < span; k++) { const d = b + k; if (d >= from && d <= to) push(d); } continue; }
      const until = e.recUntil ? D.parse(e.recUntil) : Infinity, ex = e.ex || [], bd = D.ymd(b).d;
      for (let d = Math.max(from, b); d <= Math.min(to, until); d++) {
        let ok = false;
        switch (e.rec) {
          case 'daily': ok = true; break;
          case 'weekdays': ok = D.dow(d) < 5; break;
          case 'weekly': ok = (d - b) % 7 === 0; break;
          case 'monthly': { const y = D.ymd(d); ok = y.d === Math.min(bd, D.daysIn(y.y, y.m)); break; }
        }
        if (ok && !ex.includes(D.iso(d))) push(d);
      }
    }
    return out.sort((a, b) => a.day - b.day || a.allDay - b.allDay || a.start - b.start || a.end - b.end);
  };
  E.day = d => E.expand(d, d);

  /* ── conflicts ────────────────────────────────────────────────────── */
  const timed = o => !o.allDay && o.cat !== 'away' && o.dur > 0;
  E.conflictKeys = function (occs) {
    const bad = new Set(), byDay = {};
    for (const o of occs) if (timed(o)) (byDay[o.day] = byDay[o.day] || []).push(o);
    for (const d in byDay) { const L = byDay[d]; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (L[i].start < L[j].end && L[j].start < L[i].end) { bad.add(L[i].key); bad.add(L[j].key); } }
    return bad;
  };
  E.clashes = (day, start, dur, ignoreId) => E.day(day).filter(o => timed(o) && o.id !== ignoreId && o.start < start + dur && start < o.end);
  E.awayOn = day => E.day(day).find(o => o.allDay && (o.cat === 'away' || o.cat === 'travel'));

  /* ── moving a single occurrence (drag / resize) ───────────────────── */
  E.moveOcc = function (occ, to) {
    const e = occ.ev;
    if (!occ.rec) { A.patch('events', e.id, { date: D.iso(to.day), start: to.start, dur: to.dur }); return e; }
    e.ex = (e.ex || []).concat(D.iso(occ.day));                     // recurring: detach this occurrence
    const copy = Object.assign({}, e, { id: A.uid(), rec: 'none', recUntil: '', ex: [], date: D.iso(to.day), start: to.start, dur: to.dur, log: {} });
    A.add('events', copy); A.toast('Moved this occurrence only.'); return copy;
  };

  /* ── quick add: "Lunch with Sarah tomorrow 1pm 90m" ───────────────── */
  const DAYN = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6, monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
  const MONN = {}; D.MON.forEach((m, i) => { MONN[m.toLowerCase()] = i + 1; MONN[m.slice(0, 3).toLowerCase()] = i + 1; });
  E.parse = function (text, base) {
    let s = ' ' + text.trim() + ' ', day = null, start = null, dur = null, cat = null; const today = base || D.today();
    const cut = (re, fn) => { const m = re.exec(s); if (m) { fn(m); s = s.replace(re, ' '); return true; } return false; };
    cut(/\s(today|tonight)\s/i, () => { day = today; });
    cut(/\s(tomorrow|tmrw)\s/i, () => { day = today + 1; });
    if (day == null) cut(/\s(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s/i, m => { let t = DAYN[m[1].toLowerCase()]; let d = today + ((t - D.dow(today) + 7) % 7 || 7); if (/next/i.test(m[0]) && d - today < 7 && false) d += 7; day = d; });
    if (day == null) cut(/\s(\d{4})-(\d{2})-(\d{2})\s/, m => { day = D.num(+m[1], +m[2], +m[3]); });
    if (day == null) cut(/\s(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s/i, m => { const y = D.ymd(today).y; day = D.num(y, MONN[m[2].toLowerCase()], +m[1]); if (day < today) day = D.num(y + 1, MONN[m[2].toLowerCase()], +m[1]); });
    if (day == null) cut(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\s/i, m => { const y = D.ymd(today).y; day = D.num(y, MONN[m[1].toLowerCase()], +m[2]); if (day < today) day = D.num(y + 1, MONN[m[1].toLowerCase()], +m[2]); });
    cut(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s/i, m => { let hh = +m[1] % 12; if (/pm/i.test(m[3])) hh += 12; start = hh * 60 + (+m[2] || 0); });
    if (start == null) cut(/\s(?:at\s+)?(\d{1,2}):(\d{2})\s/, m => { if (+m[1] < 24 && +m[2] < 60) start = +m[1] * 60 + +m[2]; });
    if (start == null) cut(/\s(noon|midday)\s/i, () => { start = 720; });
    if (start == null) cut(/\sat\s+(\d{1,2})\s/i, m => { let hh = +m[1]; if (hh < 7) hh += 12; start = hh * 60; });
    cut(/\s(?:for\s+)?(\d+)\s*h(?:ours?|rs?)?\s*(\d+)?\s*(?:m(?:in(?:ute)?s?)?)?\s/i, m => { dur = +m[1] * 60 + (+m[2] || 0); });
    if (dur == null) cut(/\s(?:for\s+)?(\d+)\s*(?:m|min|mins|minutes)\s/i, m => { dur = +m[1]; });
    const lc = text.toLowerCase();
    cat = /\b(call|zoom|phone|teams|meet link)\b/.test(lc) ? 'call' : /\b(visit|visitor|tour|site|guest)\b/.test(lc) ? 'visit' : /\b(flight|fly|travel|train|hotel)\b/.test(lc) ? 'travel' : /\b(lunch|dinner|family|doctor|dentist|gym)\b/.test(lc) ? 'personal' : /\b(focus|deep work|write|review)\b/.test(lc) ? 'focus' : /\b(ooo|out of office|vacation|leave|holiday)\b/.test(lc) ? 'away' : 'meeting';
    const title = s.replace(/\s+/g, ' ').trim().replace(/^(?:at|on|for)\s+|\s+(?:at|on|for)$/gi, '');
    return { title: title ? title[0].toUpperCase() + title.slice(1) : '', day: day == null ? today : day, start, dur, cat, hadTime: start != null };
  };

  /* ── the editor dialog ────────────────────────────────────────────── */
  E.edit = function (src, defaults = {}, onDone) {
    const isNew = !src, S = A.settings();
    const e = src ? JSON.parse(JSON.stringify(src)) : Object.assign({ id: A.uid(), title: '', date: D.iso(D.today()), start: Math.max(S.dayStart, Math.min(S.dayEnd - 1, new Date().getHours() + 1)) * 60, dur: S.defDur, cat: 'meeting', status: 'confirmed', remind: S.remind, allDay: false, rec: 'none', loc: '', people: '', notes: '' }, defaults);
    const title = h('input', { type: 'text', dir: 'auto', value: e.title, placeholder: 'What is it?', required: true, autocomplete: 'off' });
    const date = h('input', { type: 'date', value: e.date }), until = h('input', { type: 'date', value: e.recUntil || '' }), endDate = h('input', { type: 'date', value: D.iso(D.parse(e.date) + Math.max(1, e.span || 1) - 1) });
    const st = h('input', { type: 'time', step: 300, value: A.hhmm(e.start) }), en = h('input', { type: 'time', step: 300, value: A.hhmm(e.start + e.dur) });
    const loc = h('input', { type: 'text', dir: 'auto', value: e.loc || '', placeholder: 'Room, address or video link' });
    const people = h('input', { type: 'text', dir: 'auto', value: e.people || '', placeholder: 'Names, comma separated', list: 'ppl' });
    const dl = h('datalist', { id: 'ppl' }, A.db.data.contacts.map(c => h('option', { value: c.name })));
    const notes = h('textarea', { dir: 'auto', placeholder: 'Prep notes, talking points, dress code…' }); notes.value = e.notes || '';
    const rec = h('select', null, [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Every weekday'], ['weekly', 'Every week'], ['monthly', 'Every month']].map(([v, t]) => h('option', { value: v, selected: v === (e.rec || 'none') }, t)));
    const status = h('select', null, [['confirmed', 'Confirmed'], ['tentative', 'Tentative (not yet confirmed)'], ['cancelled', 'Cancelled']].map(([v, t]) => h('option', { value: v, selected: v === e.status }, t)));
    const rem = h('select', null, [[0, 'No reminder'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before']].map(([v, t]) => h('option', { value: v, selected: v === (e.remind || 0) }, t)));
    let cat = e.cat, allDay = !!e.allDay;
    const cats = h('div', { class: 'cats', role: 'group', 'aria-label': 'Category' }, Object.entries(A.CATS).map(([k, n]) => h('button', { type: 'button', style: A.catStyle(k), 'aria-pressed': k === cat, 'data-k': k, onClick: ev => { cat = k; A.$$('button', cats).forEach(b => b.setAttribute('aria-pressed', b.dataset.k === k)); if (k === 'away' || k === 'travel') toggleAll(true, true); } }, h('i', { class: 'dot', style: { background: 'var(--b)' } }), n)));
    const sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': allDay, 'aria-label': 'All day', onClick: () => toggleAll(!allDay) });
    const timeRow = h('div', { class: 'two' }, A.field('Starts', st), A.field('Ends', en)), endRow = A.field('Last day', endDate);
    const warn = h('div', { class: 'warn', hidden: true, role: 'alert' });
    function toggleAll(v, quiet) { allDay = v; sw.setAttribute('aria-checked', v); timeRow.hidden = v; endRow.hidden = !v; if (!quiet) check(); }
    const times = () => { const s = A.parseTime(st.value), t = A.parseTime(en.value); return { s, t, d: Math.max(5, (t == null || s == null ? 60 : t - s)) }; };
    function check() {
      const day = D.parse(date.value); if (day == null) { warn.hidden = true; return; }
      let list = [];
      if (allDay) { const away = e.cat === 'away' || cat === 'away' || cat === 'travel'; if (away) list = E.day(day).filter(o => !o.allDay && o.id !== e.id && o.cat !== 'away').slice(0, 4); }
      else { const { s, d } = times(); if (s != null) list = E.clashes(day, s, d, e.id); }
      warn.hidden = !list.length; warn.replaceChildren(...(list.length ? [A.ico('bell'), h('span', null, 'Conflicts with: ' + list.map(o => o.title + ' (' + A.time(o.start) + ')').join(', '))] : []));
    }
    [date, st, en].forEach(x => x.addEventListener('change', check));
    st.addEventListener('change', () => { const s = A.parseTime(st.value); if (s != null && A.parseTime(en.value) <= s) en.value = A.hhmm(s + (e.dur || 60)); });
    toggleAll(allDay, true); check();
    const save = () => {
      if (!title.value.trim()) { title.focus(); return A.toast('Please give it a title.'); }
      const day = D.parse(date.value); if (day == null) return A.toast('Pick a valid date.');
      const { s, t } = times(); if (!allDay && (s == null || t == null || t <= s)) return A.toast('The end time must be after the start time.');
      const span = allDay ? Math.max(1, (D.parse(endDate.value) || day) - day + 1) : 1;
      const out = Object.assign(e, { title: title.value.trim(), date: date.value, allDay, span, start: allDay ? 0 : s, dur: allDay ? 0 : t - s, cat, status: status.value, loc: loc.value.trim(), people: people.value.trim(), notes: notes.value, rec: rec.value, recUntil: rec.value === 'none' ? '' : until.value, remind: +rem.value });
      if (isNew) A.add('events', out); else { const i = events().findIndex(x => x.id === out.id); events()[i] = out; A.save('events'); }
      m.close(); A.toast(isNew ? 'Added to the schedule.' : 'Saved.'); onDone && onDone(out);
    };
    const ics = () => A.download((e.title || 'event').replace(/[^\w-]+/g, '_') + '.ics', A.ics([Object.assign(e, { title: title.value || e.title })], 'Aide'), 'text/calendar');
    const log = e.log && e.log[date.value]; const logLine = h('span', { class: 'small muted' }, log ? 'In ' + (log.ci != null ? A.time(log.ci) : '—') + (log.co != null ? ' · Out ' + A.time(log.co) : '') : '');
    const m = A.modal({
      title: isNew ? 'New event' : 'Edit event', cls: '',
      body: [A.field('Title', title), cats,
        h('div', { class: 'two' }, A.field('Date', date), h('div', { class: 'field' }, h('span', null, 'All day'), h('div', { class: 'row', style: { minHeight: '42px' } }, sw))),
        timeRow, endRow, warn,
        A.field('Location', loc), A.field('With', people), dl,
        h('div', { class: 'two' }, A.field('Repeat', rec), A.field('Until (optional)', until)),
        h('div', { class: 'two' }, A.field('Status', status), A.field('Reminder', rem)),
        A.field('Notes', notes),
        !isNew && cat === 'visit' ? h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn sm', onClick: () => { e.log = e.log || {}; e.log[date.value] = Object.assign(e.log[date.value] || {}, { ci: D.nowMin() }); A.patch('events', e.id, { log: e.log }); logLine.textContent = 'Checked in ' + A.time(D.nowMin()); } }, 'Check in visitor'), h('button', { type: 'button', class: 'btn sm', onClick: () => { e.log = e.log || {}; e.log[date.value] = Object.assign(e.log[date.value] || {}, { co: D.nowMin() }); A.patch('events', e.id, { log: e.log }); logLine.textContent = 'Checked out ' + A.time(D.nowMin()); } }, 'Check out'), logLine) : null],
      footer: [!isNew ? h('button', { type: 'button', class: 'btn danger', onClick: async () => { const sel = await E.askDelete(src, date.value); if (sel) m.close(); } }, 'Delete') : null,
        !isNew ? h('button', { type: 'button', class: 'btn', 'aria-label': 'Export .ics', onClick: ics }, A.ico('download'), '.ics') : null,
        !isNew ? h('button', { type: 'button', class: 'btn', onClick: () => { m.close(); E.edit(null, Object.assign({}, e, { id: A.uid(), title: e.title + ' (copy)', log: {}, ex: [] })); } }, 'Duplicate') : null,
        h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn', onClick: () => m.close() }, 'Cancel'), h('button', { type: 'button', class: 'btn primary', onClick: save }, 'Save')],
    });
    m.sheet.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); save(); } });
    if (isNew) setTimeout(() => title.focus(), 60);
    return m;
  };
  E.askDelete = function (ev, dayIso) {
    return new Promise(res => {
      if (!ev.rec || ev.rec === 'none') { A.del('events', ev.id, 'Event deleted'); return res(true); }
      const m = A.modal({ title: 'Delete repeating event', body: h('p', null, 'This event repeats. What should be deleted?'), footer: [
        h('button', { class: 'btn', type: 'button', onClick: () => { A.patch('events', ev.id, { ex: (ev.ex || []).concat(dayIso) }); A.toast('This occurrence deleted.'); m.close(); res(true); } }, 'Only this one'),
        h('button', { class: 'btn danger', type: 'button', onClick: () => { A.del('events', ev.id, 'Series deleted'); m.close(); res(true); } }, 'Whole series'),
        h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onClick: () => { m.close(); res(false); } }, 'Cancel')], onClose: () => res(false) });
    });
  };

  /* ── reminders while the desk is open ─────────────────────────────── */
  const told = new Set();
  E.startReminders = function () {
    clearInterval(E._t);
    E._t = setInterval(() => {
      if (!A.db.data) return; const t = D.today(), now = D.nowMin();
      for (const o of E.day(t)) {
        if (o.allDay || !o.ev.remind || o.ev.status === 'tentative' && false) continue;
        const k = o.key + '#' + o.start; if (told.has(k)) continue;
        if (now >= o.start - o.ev.remind && now < o.start + 1) { told.add(k); const left = o.start - now; A.notify(left > 0 ? 'In ' + left + ' min: ' + o.title : 'Starting now: ' + o.title, [o.ev.loc, o.ev.people].filter(Boolean).join(' · ')); }
      }
    }, 15000);
  };
})();
