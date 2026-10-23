/* Aide · core — helpers shared by every view.
   No dependencies. Dates are plain integers (days since 1970-01-01, local
   calendar day) like Moxen's components, so there are no time-zone surprises.
   User text is only ever inserted with textContent (never innerHTML). */
(function () {
  'use strict';
  const A = window.Aide = { views: {}, ui: {} };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  A.$ = $; A.$$ = $$;

  /* ── tiny hyperscript ─────────────────────────────────────────────── */
  const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'tabIndex', 'textContent', 'htmlFor', 'className']);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (k.slice(0, 5) === 'aria-' && typeof v === 'boolean') { el.setAttribute(k, String(v)); continue; }   // aria-pressed="true"/"false"
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const s in v) s.startsWith('--') ? el.style.setProperty(s, v[s]) : (el.style[s] = v[s]);
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) add(el, k);
      else el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  A.h = h;
  A.put = (el, ...kids) => { add(el, kids); return el; };   // like append(), but skips null/false

  /* ── icons ────────────────────────────────────────────────────────── */
  const IC = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    inbox: 'M4 13l2-8h12l2 8M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M4 13h4l1 2h6l1-2h4',
    clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    tasks: 'M9 11l2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    notes: 'M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8 13h8M8 17h6',
    timer: 'M10 2h4M12 9v4l2.5 1.5M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
    people: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1a4 4 0 0 0-3-3.9M15 4.2a3.5 3.5 0 0 1 0 6.6',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    plus: 'M12 5v14M5 12h14', chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6', x: 'M6 6l12 12M18 6 6 18',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5', check: 'M5 12.5l4.5 4.5L19 7',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', pin: 'M12 17v5M8 3h8l-1 7 3 3v2H6v-2l3-3z',
    print: 'M7 8V3h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z',
    download: 'M12 4v11M7 11l5 5 5-5M5 20h14', upload: 'M12 20V9M7 13l5-5 5 5M5 4h14',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3',
    copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15V5a1 1 0 0 1 1-1h10',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
    mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM3 7l9 6 9-6',
    place: 'M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    play: 'M7 4l13 8-13 8z', pause: 'M8 5v14M16 5v14', reset: 'M4 4v6h6M5.5 14a7.5 7.5 0 1 0 2-7.7L4 10',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5', bell: 'M6 17v-6a6 6 0 1 1 12 0v6l2 2H4zM10 21h4',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    arrow: 'M5 12h14M13 6l6 6-6 6', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', more: 'M5 12h.01M12 12h.01M19 12h.01',
    logout: 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9', cmd: 'M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  };
  A.ico = (name, cls) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'icon' + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', IC[name] || IC.more); s.appendChild(p);
    return s;
  };

  /* ── tiny event bus ───────────────────────────────────────────────── */
  const bus = {};
  A.on = (n, f) => { (bus[n] = bus[n] || new Set()).add(f); return () => bus[n].delete(f); };
  A.emit = (n, ...a) => bus[n] && bus[n].forEach(f => { try { f(...a); } catch (e) { console.error(e); } });

  /* ── springs: a physical spring turned into a CSS linear() curve ──── */
  A.spring = function (k, c) {
    if (!(window.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)'))) return 'cubic-bezier(.34,1.56,.64,1)';
    const pts = [0]; let x = 0, v = 0, t = 0;
    while (t < 3) { v += (k * (1 - x) - c * v) / 240; x += v / 240; t += 1 / 240; pts.push(x); if (t > .15 && Math.abs(1 - x) < .001 && Math.abs(v) < .01) break; }
    const out = []; for (let i = 0; i <= 40; i++) out.push(pts[Math.round(i / 40 * (pts.length - 1))].toFixed(4)); out[40] = '1';
    return 'linear(' + out.join(', ') + ')';
  };
  A.SPRING = A.spring(380, 17);
  document.documentElement.style.setProperty('--spring', A.SPRING);
  A.settle = (el, from, ms = 600) => { if (!el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return; el.animate([{ transform: from }, { transform: 'none' }], { duration: ms, easing: A.SPRING }); };

  /* ── dates (integers) ─────────────────────────────────────────────── */
  const DOW3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOWL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const D = A.date = {
    DOW3, DOWL, MON, MON3: MON.map(m => m.slice(0, 3)),
    num: (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 864e5),
    today() { const n = new Date(); return D.num(n.getFullYear(), n.getMonth() + 1, n.getDate()); },
    ymd(n) { const d = new Date(n * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; },
    dow: n => (((n + 3) % 7) + 7) % 7,                    // Monday = 0
    iso(n) { const { y, m, d } = D.ymd(n); return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); },
    parse(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? D.num(+m[1], +m[2], +m[3]) : null; },
    weekStart(n, ws) { return n - ((D.dow(n) - ws + 7) % 7); },
    addMonths(n, k) { const { y, m, d } = D.ymd(n); const t = (y * 12 + m - 1) + k; const ny = Math.floor(t / 12), nm = t % 12 + 1; const last = D.ymd(D.num(ny, nm + 1, 1) - 1).d; return D.num(ny, nm, Math.min(d, last)); },
    daysIn: (y, m) => D.ymd(D.num(y, m + 1, 1) - 1).d,
    nowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); },
    long(n) { const { y, m, d } = D.ymd(n); return DOWL[D.dow(n)] + ', ' + d + ' ' + MON[m - 1] + ' ' + y; },
    mid(n) { const { m, d } = D.ymd(n); return DOW3[D.dow(n)] + ' ' + d + ' ' + MON[m - 1].slice(0, 3); },
    rel(n) { const t = D.today(); return n === t ? 'Today' : n === t + 1 ? 'Tomorrow' : n === t - 1 ? 'Yesterday' : D.mid(n); },
    sec(n) {                                              // secondary calendar label
      const s = A.settings().secondary; if (!s || s === 'none') return '';
      try {
        const loc = s === 'persian' ? 'en-u-ca-persian' : 'en-u-ca-islamic-umalqura';
        const parts = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(new Date(n * 864e5 + 432e5));
        const dd = parts.find(p => p.type === 'day').value, mm = parts.find(p => p.type === 'month').value;
        return dd === '1' ? dd + ' ' + mm : dd;
      } catch (e) { return ''; }
    },
  };
  A.time = function (min) {                               // minutes -> "09:30" or "9:30 AM"
    min = ((min % 1440) + 1440) % 1440; const hh = Math.floor(min / 60), mm = String(min % 60).padStart(2, '0');
    if (A.settings().hour12) return ((hh % 12) || 12) + ':' + mm + ' ' + (hh < 12 ? 'AM' : 'PM');
    return String(hh).padStart(2, '0') + ':' + mm;
  };
  A.hourLabel = hh => A.settings().hour12 ? (((hh % 12) || 12) + (hh < 12 ? ' AM' : ' PM')) : String(hh).padStart(2, '0') + ':00';
  A.parseTime = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  A.hhmm = min => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  A.dur = m => m < 60 ? m + ' min' : (m % 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : Math.floor(m / 60) + ' h');
  A.pad = n => String(n).padStart(2, '0');

  /* ── categories ───────────────────────────────────────────────────── */
  A.CATS = { meeting: 'Meeting', visit: 'Visit', call: 'Call', travel: 'Travel', personal: 'Personal', focus: 'Focus', away: 'Out of office' };
  A.catStyle = c => ({ '--c': 'var(--c-' + (A.CATS[c] ? c : 'meeting') + ')', '--b': 'var(--b-' + (A.CATS[c] ? c : 'meeting') + ')' });

  /* ── store (in memory; vault.js encrypts it to disk) ──────────────── */
  const DEFAULTS = () => ({ name: '', title: '', assistant: '', theme: 'auto', hour12: false, weekStart: 0, dayStart: 7, dayEnd: 21, defDur: 60, lockMin: 10, secondary: 'none', clocks: ['Asia/Tehran', 'Europe/London', 'America/New_York'], remind: 15 });
  A.db = { data: null };
  A.settings = () => (A.db.data && A.db.data.settings) || DEFAULTS();
  A.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  A.load = function (data) {
    data = data || {};
    A.db.data = Object.assign({ events: [], contacts: [], requests: [], tasks: [], notes: [], avail: {}, away: [] }, data);
    A.db.data.settings = Object.assign(DEFAULTS(), data.settings || {});
    A.applyTheme();
  };
  let saveT = 0;
  A.save = function (what) {
    clearTimeout(saveT); saveT = setTimeout(() => A.vault && A.vault.save(A.db.data).catch(e => A.toast('Could not save: ' + e.message)), 200);
    A.emit('change', what);
  };
  A.flush = () => { clearTimeout(saveT); return A.vault && A.db.data ? A.vault.save(A.db.data) : Promise.resolve(); };
  const coll = n => A.db.data[n];
  A.add = (n, o) => { o.id = o.id || A.uid(); coll(n).push(o); A.save(n); return o; };
  A.get = (n, id) => coll(n).find(x => x.id === id);
  A.patch = (n, id, p) => { const o = A.get(n, id); if (o) { Object.assign(o, p); A.save(n); } return o; };
  A.del = (n, id, label) => {
    const i = coll(n).findIndex(x => x.id === id); if (i < 0) return; const [o] = coll(n).splice(i, 1); A.save(n);
    A.toast((label || 'Deleted') + '.', { action: ['Undo', () => { coll(n).splice(Math.min(i, coll(n).length), 0, o); A.save(n); }] });
  };
  A.applyTheme = function () {
    const t = A.settings().theme, dark = t === 'dusk' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dusk' : 'paper';
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#1b110d' : '#fbf3e8';
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => A.applyTheme());

  /* ── toasts & dialogs ─────────────────────────────────────────────── */
  A.toast = function (msg, o = {}) {
    let box = $('.toasts'); if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: 'toast' }, h('span', null, msg));
    if (o.action) t.append(h('button', { type: 'button', onClick: () => { o.action[1](); kill(); } }, o.action[0]));
    box.append(t); const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
    setTimeout(kill, o.ms || (o.action ? 6000 : 3200));
  };
  A.modal = function ({ title, body, footer, cls = '', onClose }) {
    const dlg = h('dialog', { 'aria-label': title });
    const close = v => { if (!dlg.open) return; dlg.close(); };
    const sheet = h('div', { class: 'sheet ' + cls },
      h('header', null, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: close }, A.ico('x'))),
      h('div', { class: 'body' }, body), footer ? h('footer', null, footer) : null);
    sheet.setAttribute('tabindex', '-1');
    dlg.append(sheet); document.body.append(dlg); dlg.showModal();
    sheet.focus({ preventScroll: true });       // not the ✕ button: a held Enter key would otherwise click it
    dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(); });
    dlg.addEventListener('mousedown', e => { if (e.target === dlg) close(); });
    return { el: dlg, close, sheet };
  };
  A.confirm = (title, msg, ok = 'Delete', danger = true) => new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); m.close(); } };
    const m = A.modal({ title, body: h('p', null, msg), footer: [h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onClick: () => fin(false) }, 'Cancel'), h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onClick: () => fin(true) }, ok)], onClose: () => fin(false) });
  });
  A.field = (label, input, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), input);
  A.copy = async txt => { try { await navigator.clipboard.writeText(txt); A.toast('Copied to clipboard'); } catch (e) { const t = h('textarea', { value: txt, style: { position: 'fixed', opacity: 0 } }); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); A.toast('Copied to clipboard'); } };
  A.download = (name, text, type) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  A.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  A.initials = s => (s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  A.empty = (title, sub, icon = 'calendar') => h('div', { class: 'empty' }, A.ico(icon), h('b', null, title), sub ? h('span', null, sub) : null);
  A.debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

  /* ── sound & notifications ────────────────────────────────────────── */
  let actx;
  A.beep = function (n = 3) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      for (let i = 0; i < n; i++) { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * .28; o.frequency.value = 880; o.type = 'sine'; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.25, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .22); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .25); }
    } catch (e) { /* no audio */ }
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  };
  A.notify = function (title, body) {
    A.toast(title + (body ? ' — ' + body : ''), { ms: 6000 }); A.beep(2);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'icons/icon-192.png', tag: title + body }); } catch (e) { /* ignore */ }
  };

  /* ── iCalendar (.ics) ─────────────────────────────────────────────── */
  A.ics = function (events, name) {
    const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const fold = l => { const out = []; while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); } out.push(l); return out.join('\r\n'); };
    const dt = (day, min) => { const { y, m, d } = D.ymd(day); return y + A.pad(m) + A.pad(d) + 'T' + A.pad(Math.floor(min / 60) % 24) + A.pad(min % 60) + '00'; };
    const dd = day => dt(day, 0).slice(0, 8);
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aide Executive Desk//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(name || 'Aide')];
    for (const e of events) {
      const day = D.parse(e.date); if (day == null) continue;
      L.push('BEGIN:VEVENT', 'UID:' + e.id + '@aide', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'SUMMARY:' + esc(e.title));
      if (e.allDay) L.push('DTSTART;VALUE=DATE:' + dd(day), 'DTEND;VALUE=DATE:' + dd(day + 1));
      else L.push('DTSTART:' + dt(day, e.start), 'DTEND:' + dt(day, e.start + e.dur));
      const rr = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY' }[e.rec];
      if (rr) L.push('RRULE:' + rr + (e.recUntil ? ';UNTIL=' + e.recUntil.replace(/-/g, '') : ''));
      if (e.loc) L.push('LOCATION:' + esc(e.loc));
      const desc = [e.people, e.notes].filter(Boolean).join('\n'); if (desc) L.push('DESCRIPTION:' + esc(desc));
      if (e.status === 'tentative') L.push('STATUS:TENTATIVE');
      if (e.remind) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:-PT' + e.remind + 'M', 'END:VALARM');
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR'); return L.map(fold).join('\r\n');
  };

  /* ── sample data (relative to today, so it always looks alive) ────── */
  A.sample = function () {
    const t = D.today(), ws = D.weekStart(t, A.settings().weekStart), iso = n => D.iso(n);
    const ev = (off, start, dur, title, cat, extra) => Object.assign({ id: A.uid(), title, date: iso(t + off), start, dur, cat, status: 'confirmed', remind: 15, allDay: false }, extra || {});
    const events = [
      ev(0, 9 * 60, 30, 'Daily briefing with Chief of Staff', 'meeting', { loc: 'Boardroom 2', rec: 'weekdays' }),
      ev(0, 10 * 60, 60, 'Investor call — Series B update', 'call', { people: 'Sarah Whitfield', loc: 'Zoom', notes: 'Send deck 30 min before. Do not discuss the Q4 forecast.' }),
      ev(0, 12 * 60 + 30, 90, 'Lunch with the CFO', 'personal', { people: 'Daniel Moradi', loc: 'Lucca Restaurant' }),
      ev(0, 15 * 60, 45, 'Visitor: Hamid Rezaei (supplier)', 'visit', { people: 'Hamid Rezaei', loc: 'Reception' }),
      ev(0, 15 * 60 + 15, 45, 'Legal review — NDA', 'meeting', { loc: 'Room 4', status: 'tentative' }),
      ev(0, 17 * 60, 60, 'Deep work — strategy memo', 'focus'),
      ev(1, 9 * 60 + 30, 60, 'Board pre-read with Chair', 'meeting', { people: 'Elena Park', loc: 'Chair’s office' }),
      ev(1, 11 * 60, 30, 'Press interview — Financial Daily', 'call', { people: 'Marcus Lee' }),
      ev(1, 14 * 60, 120, 'Factory visit — Site B tour', 'visit', { loc: 'Industrial Zone, Site B', notes: 'PPE required. Driver at 13:15.' }),
      ev(2, 8 * 60, 0, 'Flight IST → LHR (TK1983)', 'travel', { allDay: true, loc: 'Istanbul Airport' }),
      ev(2, 16 * 60, 60, 'Town hall rehearsal', 'meeting', { loc: 'Auditorium' }),
      ev(3, 10 * 60, 90, 'Quarterly business review', 'meeting', { loc: 'Boardroom 1', rec: 'monthly' }),
      ev(3, 13 * 60, 60, 'Mentoring: Leila (Head of Ops)', 'meeting'),
      ev(4, 9 * 60, 60, 'Weekly leadership sync', 'meeting', { rec: 'weekly', loc: 'Boardroom 1' }),
      ev(4, 16 * 60, 60, 'Family dinner reservation', 'personal', { loc: 'Dar Restaurant' }),
      ev(ws + 7 - t + 1, 11 * 60, 60, 'Supplier negotiation — Hamid Rezaei', 'meeting', { people: 'Hamid Rezaei' }),
      ev(ws + 7 - t + 2, 0, 0, 'Out of office — Annual retreat', 'away', { allDay: true }),
      ev(-2, 14 * 60, 60, 'Product demo for investors', 'meeting', { loc: 'Demo room' }),
    ];
    const contacts = [
      { id: A.uid(), name: 'Sarah Whitfield', org: 'Northbridge Capital', role: 'Partner', phone: '+44 20 7946 0123', email: 'sarah@northbridge.example', tags: ['VIP', 'Investor'], notes: 'Prefers calls before noon (London time). Likes short agendas.' },
      { id: A.uid(), name: 'Daniel Moradi', org: 'Own company', role: 'CFO', phone: '+98 912 000 0000', email: 'cfo@example.com', tags: ['Internal'], notes: '' },
      { id: A.uid(), name: 'Elena Park', org: 'Board of Directors', role: 'Chair', phone: '', email: 'elena@example.com', tags: ['Board', 'VIP'], notes: 'Assistant: Tom (+44 20 7946 0999)' },
      { id: A.uid(), name: 'Hamid Rezaei', org: 'Rezaei Trading', role: 'Supplier', phone: '+98 21 5555 0100', email: 'hamid@example.com', tags: ['Vendor'], notes: 'Always 10 minutes early. Offer tea.' },
      { id: A.uid(), name: 'Marcus Lee', org: 'Financial Daily', role: 'Journalist', phone: '', email: 'marcus@example.com', tags: ['Press'], notes: 'Off-the-record unless agreed in writing.' },
    ];
    const requests = [
      { id: A.uid(), who: 'Aria Nazari', org: 'Tehran Design Week', purpose: 'Invitation to speak at the opening panel', dur: 30, pref: 'Next week, mornings', pri: 'normal', status: 'pending', created: t - 1 },
      { id: A.uid(), who: 'James Carter', org: 'Carter & Boyd LLP', purpose: 'Review of the shareholder agreement', dur: 60, pref: 'Any day before Friday', pri: 'high', status: 'pending', created: t },
      { id: A.uid(), who: 'Mina Kamali', org: 'University of Tehran', purpose: 'Student mentoring programme kick-off', dur: 45, pref: 'Flexible', pri: 'normal', status: 'pending', created: t - 3 },
    ];
    const tasks = [
      { id: A.uid(), title: 'Confirm car and driver for Site B visit', pri: 'now', due: iso(t), done: false },
      { id: A.uid(), title: 'Send board pre-read pack to Elena', pri: 'now', due: iso(t + 1), done: false },
      { id: A.uid(), title: 'Renew executive travel insurance', pri: 'plan', due: iso(t + 12), done: false },
      { id: A.uid(), title: 'Reschedule dentist appointment', pri: 'delegate', due: '', done: false, owner: 'Personal assistant' },
      { id: A.uid(), title: 'Review expense report (October)', pri: 'plan', due: iso(t + 4), done: false },
      { id: A.uid(), title: 'Unsubscribe from vendor newsletters', pri: 'drop', due: '', done: false },
      { id: A.uid(), title: 'Book hotel in London (3 nights)', pri: 'now', due: iso(t - 1), done: true },
    ];
    const notes = [
      { id: A.uid(), title: 'Preferences — CEO', body: 'Coffee: flat white, no sugar.\nNo meetings before 09:00 or after 18:00 on Fridays.\nPrefers 25/50-minute meetings, not 30/60.\nAlways add 15 min travel buffer between sites.\nAisle seat, Turkish Airlines / Emirates.', color: 'visit', pinned: true, updated: Date.now() },
      { id: A.uid(), title: 'Board meeting checklist', body: '☐ Agenda sent 5 days before\n☐ Pre-read pack uploaded\n☐ Catering confirmed\n☐ Minutes template ready\n☐ Video link tested', color: 'meeting', pinned: false, updated: Date.now() - 36e5 },
      { id: A.uid(), title: 'یادداشت فارسی (RTL test)', body: 'جلسه با تأمین‌کننده باید حداقل ۲۴ ساعت قبل تأیید شود.', color: 'personal', pinned: false, updated: Date.now() - 72e5 },
    ];
    const avail = {}; for (let d = 0; d < 5; d++) { avail[d] = []; for (let s = 20; s < 24; s++) avail[d].push(s); for (let s = 28; s < 32; s++) avail[d].push(s); } // 10:00-12:00 and 14:00-16:00
    return { settings: { name: 'Alex Morgan', title: 'Chief Executive Officer', assistant: 'Executive Assistant' }, events, contacts, requests, tasks, notes, avail, away: [] };
  };
})();
