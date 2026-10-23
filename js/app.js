/* Aide · app — the shell: navigation, router, Today dashboard, Settings,
   the ⌘K command palette and the idle auto-lock. */
(function () {
  'use strict';
  const A = window.Aide, { h, date: D, ev: E, $ } = A;
  const NAV = [['today', 'Today', 'home'], ['calendar', 'Calendar', 'calendar'], ['requests', 'Requests', 'inbox'], ['availability', 'Availability', 'clock'], ['tasks', 'Tasks', 'tasks'], ['notes', 'Notebook', 'notes'], ['timer', 'Timers', 'timer'], ['people', 'People', 'people'], ['settings', 'Settings', 'settings']];
  const TABS = ['today', 'calendar', 'requests', 'notes'];
  A.current = null;
  let built = false, view = null;

  /* ── shell ────────────────────────────────────────────────────────── */
  function build() {
    const app = $('#app'); app.replaceChildren();
    const S = A.settings();
    const side = h('aside', { class: 'side', 'aria-label': 'Main' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, 'A'), h('div', null, h('b', null, 'Aide'), h('small', null, 'Executive Desk'))),
      h('button', { class: 'btn', type: 'button', style: { margin: '0 4px 10px', justifyContent: 'flex-start' }, onClick: () => A.palette() }, A.ico('search'), 'Search', h('span', { class: 'grow' }), h('small', { class: 'muted' }, '⌘K')),
      h('nav', { class: 'nav' }, NAV.map(([id, n, ic]) => h('a', { href: '#/' + id, 'data-id': id }, A.ico(ic), n, id === 'requests' ? h('span', { class: 'badge', 'data-badge': 'requests', hidden: true }) : null))),
      h('div', { class: 'side-foot' }, h('div', { class: 'who' }, h('div', { class: 'avatar' }, A.initials(S.name || A.vault.user())), h('div', { class: 'grow' }, h('b', { dir: 'auto' }, S.name || A.vault.user()), h('div', { class: 'small muted' }, S.title || 'Executive'))),
        h('div', { class: 'row' }, h('button', { class: 'btn sm grow', type: 'button', onClick: lock }, A.ico('lock'), 'Lock'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sign out', onClick: lock }, A.ico('logout')))));
    const main = h('main', { class: 'main', id: 'main' });
    const tabs = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABS.map(id => { const n = NAV.find(x => x[0] === id); return h('a', { href: '#/' + id, 'data-id': id }, A.ico(n[2]), n[1], id === 'requests' ? h('span', { class: 'badge', 'data-badge': 'requests', hidden: true }) : null); }), h('button', { type: 'button', 'data-id': 'more', onClick: more }, A.ico('more'), 'More'));
    app.append(side, main, tabs); built = true;
  }
  function more() {
    const list = h('div', { class: 'stack' }, NAV.filter(x => !TABS.includes(x[0])).map(([id, n, ic]) => h('a', { href: '#/' + id, class: 'item hov', style: { textDecoration: 'none', color: 'inherit' }, onClick: () => m.close() }, A.ico(ic), n)),
      h('button', { type: 'button', class: 'item hov', onClick: () => { m.close(); A.palette(); } }, A.ico('search'), 'Search everything'), h('button', { type: 'button', class: 'item hov', onClick: () => { m.close(); lock(); } }, A.ico('lock'), 'Lock the desk'));
    const m = A.modal({ title: 'More', body: list });
  }
  function lock(msg) { A.flush().finally(() => { A.vault.lock(); document.title = 'Aide · Executive Desk'; clearInterval(E._t); view && view.destroy && view.destroy(); view = null; built = false; A.showLogin(typeof msg === 'string' ? msg : 'Locked. Enter your password to continue.'); }); }

  /* ── router ───────────────────────────────────────────────────────── */
  A.route = function () {
    if (!A.db.data) return; const id = (location.hash.replace(/^#\//, '') || 'today').split('?')[0], v = A.views[id] || A.views.today, key = A.views[id] ? id : 'today';
    const main = $('#main'); if (!main) return;
    const prev = main.querySelector('.page'), keep = prev && A.current === key ? prev.scrollTop : 0;
    view && view.destroy && view.destroy(); view = v; const changed = A.current !== key; A.current = key;
    main.replaceChildren(); main.classList.toggle('notop', !!v.noTop);
    if (!v.noTop) { const acts = v.actions ? v.actions() : []; main.append(h('div', { class: 'topbar' }, h('div', null, h('h1', null, typeof v.title === 'function' ? v.title() : v.title), v.sub ? h('div', { class: 'sub' }, typeof v.sub === 'function' ? v.sub() : v.sub) : null), h('span', { class: 'grow' }), acts)); }
    const page = h('div', { class: 'page' + (v.flush ? ' flush' : ''), id: 'page', role: 'region', 'aria-label': v.title }); main.append(page);
    try { v.render(page); } catch (e) { console.error(e); page.append(A.empty('Something went wrong', e.message, 'x')); }
    if (changed) page.classList.add('view-enter'); else page.scrollTop = keep;
    A.$$('[data-id]').forEach(a => { if (a.tagName === 'A') { a.toggleAttribute('aria-current', a.dataset.id === key); if (a.dataset.id === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); } });
    const more = A.$('.tabbar [data-id=more]'); if (more) { if (!TABS.includes(key)) more.setAttribute('aria-current', 'page'); else more.removeAttribute('aria-current'); }
    badges();
  };
  function badges() { const n = A.db.data.requests.filter(r => r.status === 'pending').length; A.$$('[data-badge=requests]').forEach(b => { b.hidden = !n; b.textContent = n; }); }
  window.addEventListener('hashchange', () => A.db.data && A.route());
  A.on('change', badges);

  /* ── today ────────────────────────────────────────────────────────── */
  A.views.today = {
    title: () => { const S = A.settings(), hr = new Date().getHours(), g = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; return g + (S.assistant ? '' : (S.name ? ', ' + S.name.split(' ')[0] : '')); },
    sub: () => D.long(D.today()) + (D.sec(D.today()) ? ' · ' + D.sec(D.today()) : ''),
    actions: () => [h('button', { class: 'btn noprint', type: 'button', onClick: () => window.print() }, A.ico('print'), h('span', { class: 'hide-sm' }, 'Daily brief')), h('button', { class: 'btn primary noprint', type: 'button', onClick: () => E.edit(null, {}) }, A.ico('plus'), h('span', { class: 'hide-sm' }, 'New event'))],
    render(root) {
      const t0 = D.today(), now = D.nowMin(), todays = E.day(t0), bad = E.conflictKeys(E.expand(t0, t0 + 6)), tm = E.day(t0 + 1);
      const upcoming = todays.filter(o => !o.allDay && o.end > now && o.cat !== 'away')[0], later = !upcoming ? tm.filter(o => !o.allDay)[0] : null;
      const away = todays.find(o => o.allDay && (o.cat === 'away' || o.cat === 'travel'));
      const quick = h('input', { type: 'text', dir: 'auto', placeholder: 'Quick add event: “Lunch with Sarah tomorrow 1pm 90m”', 'aria-label': 'Quick add event', autocomplete: 'off' });
      quick.addEventListener('keydown', ev => { if (ev.key !== 'Enter' || !quick.value.trim()) return; const p = E.parse(quick.value); quick.value = ''; E.edit(null, { title: p.title, date: D.iso(p.day), start: p.start != null ? p.start : undefined, dur: p.dur || undefined, cat: p.cat, allDay: p.cat === 'away' }); });
      const hero = h('div', { class: 'hero' });
      const cdown = h('span', null);
      if (upcoming) { const live = upcoming.start <= now; A.put(hero, h('p', { style: { fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', fontSize: '12px' } }, live ? 'Happening now' : 'Next up'), h('div', { class: 'big', dir: 'auto', style: { fontSize: 'clamp(26px,4vw,36px)' } }, upcoming.title), h('p', null, A.time(upcoming.start) + ' – ' + A.time(upcoming.end), ' · ', cdown, [upcoming.ev.loc, upcoming.ev.people].filter(Boolean).length ? ' · ' + [upcoming.ev.loc, upcoming.ev.people].filter(Boolean).join(' · ') : ''), upcoming.ev.notes ? h('p', { style: { marginTop: '8px', opacity: .85, fontSize: '14px' }, dir: 'auto' }, '📝 ' + upcoming.ev.notes) : null, h('div', { class: 'row', style: { marginTop: '14px' } }, h('button', { class: 'btn sm noprint', type: 'button', onClick: () => E.edit(upcoming.ev) }, 'Open'), h('button', { class: 'btn sm noprint', type: 'button', onClick: () => { location.hash = '#/timer'; } }, 'Meeting timer')));
        const upd = () => { const d = upcoming.start - D.nowMin(); cdown.textContent = d > 0 ? 'in ' + (d >= 60 ? Math.floor(d / 60) + ' h ' + (d % 60) + ' min' : d + ' min') : 'ends in ' + Math.max(0, upcoming.end - D.nowMin()) + ' min'; }; upd(); const iv = setInterval(() => { if (!hero.isConnected) return clearInterval(iv); upd(); }, 20000); }
      else A.put(hero, h('p', { style: { fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', fontSize: '12px' } }, later ? 'Tomorrow starts with' : 'All clear'), h('div', { class: 'big', style: { fontSize: 'clamp(26px,4vw,36px)' } }, later ? later.title : 'Nothing else today'), h('p', null, later ? A.time(later.start) + ' · ' + (later.ev.loc || '') : 'Enjoy the quiet — or plan ahead.'));
      const alerts = [];
      if (away) alerts.push(h('div', { class: 'warn', style: { background: 'var(--c-travel)', color: 'var(--ink)' } }, A.ico('globe'), h('span', null, 'Executive is away today: ' + away.title)));
      const nBad = [...bad].filter(k => { const d = +k.split('@')[1]; return d >= t0; }).length; if (nBad) alerts.push(h('div', { class: 'warn' }, A.ico('bell'), h('span', null, nBad + ' overlapping event' + (nBad > 1 ? 's' : '') + ' in the next 7 days — look for the red “!” on the calendar.')));
      const timeline = h('div', { class: 'card' }, h('h3', null, 'Today’s schedule', h('span', { class: 'grow' }), h('span', { class: 'muted small' }, todays.length + ' item' + (todays.length === 1 ? '' : 's'))), h('div', { class: 'stack' }, todays.length ? todays.map(o => { const c = h('button', { type: 'button', class: 'ev-chip', style: Object.assign(A.catStyle(o.cat), { opacity: !o.allDay && o.end <= now ? .55 : 1 }), onClick: () => E.edit(o.ev) }, h('span', { class: 'grow' }, h('span', { class: 't', dir: 'auto' }, o.title), h('small', null, (o.allDay ? 'All day' : A.time(o.start) + ' – ' + A.time(o.end)) + ([o.ev.loc, o.ev.people].filter(Boolean).length ? ' · ' + [o.ev.loc, o.ev.people].filter(Boolean).join(' · ') : ''))), bad.has(o.key) ? h('span', { class: 'pill', style: { '--c': 'var(--danger-bg)', color: 'var(--danger)' } }, 'Conflict') : null, o.ev.status === 'tentative' ? h('span', { class: 'pill' }, 'Tentative') : null); return c; }) : A.empty('Free day', 'Nothing scheduled.', 'calendar')));
      const visits = todays.filter(o => o.cat === 'visit'), logOf = o => (o.ev.log && o.ev.log[D.iso(t0)]) || {};
      const visitCard = visits.length ? h('div', { class: 'card' }, h('h3', null, 'Visitors today'), h('div', { class: 'stack' }, visits.map(o => { const l = logOf(o); return h('div', { class: 'item', style: { background: 'var(--c-visit)', padding: '8px 12px' } }, h('div', { class: 'grow' }, h('b', { dir: 'auto' }, o.title.replace(/^Visit: /, '')), h('div', { class: 'small', style: { color: 'var(--soft)' } }, A.time(o.start) + (l.ci != null ? ' · in ' + A.time(l.ci) : '') + (l.co != null ? ' · out ' + A.time(l.co) : ''))), l.co == null ? h('button', { class: 'btn sm noprint', type: 'button', onClick: () => { const log = Object.assign({}, o.ev.log); log[D.iso(t0)] = Object.assign({}, l, l.ci == null ? { ci: D.nowMin() } : { co: D.nowMin() }); A.patch('events', o.ev.id, { log }); A.route(); } }, l.ci == null ? 'Check in' : 'Check out') : h('span', { class: 'pill' }, 'Done')); }))) : null;
      const pend = A.db.data.requests.filter(r => r.status === 'pending');
      const reqCard = h('div', { class: 'card' }, h('h3', null, 'Requests', h('span', { class: 'grow' }), pend.length ? h('span', { class: 'badge' }, pend.length) : null), pend.length ? h('div', { class: 'stack' }, pend.slice(0, 3).map(r => h('a', { href: '#/requests', class: 'item hov', style: { textDecoration: 'none', color: 'inherit', padding: '6px 8px' } }, h('div', { class: 'avatar' }, A.initials(r.who)), h('div', { class: 'grow' }, h('b', { dir: 'auto' }, r.who), h('div', { class: 'small muted', dir: 'auto' }, r.purpose.slice(0, 48)))))) : h('p', { class: 'muted small' }, 'No pending requests.'));
      const tasks = A.db.data.tasks.filter(t => !t.done && t.due && t.due <= D.iso(t0)).slice(0, 4);
      const taskCard = h('div', { class: 'card' }, h('h3', null, 'Due today & overdue', h('span', { class: 'grow' }), h('a', { href: '#/tasks', class: 'small', style: { color: 'var(--accent-ink)' } }, 'All')), tasks.length ? h('div', { class: 'stack' }, tasks.map(t => h('div', { class: 'row' }, h('button', { type: 'button', class: 'check', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'Done: ' + t.title, onClick: () => { A.patch('tasks', t.id, { done: true }); A.route(); } }, A.ico('check')), h('span', { class: 'grow', dir: 'auto' }, t.title), t.due < D.iso(t0) ? h('span', { class: 'pill', style: { '--c': 'var(--danger-bg)', color: 'var(--danger)' } }, 'Overdue') : null))) : h('p', { class: 'muted small' }, 'Nothing due. 🎉'));
      const wk = D.weekStart(t0, A.settings().weekStart), wocc = E.expand(wk, wk + 6), counts = Array.from({ length: 7 }, (_, i) => wocc.filter(o => o.day === wk + i).length);
      const weekCard = h('div', { class: 'card' }, h('h3', null, 'This week'), h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '6px', textAlign: 'center' } }, counts.map((c, i) => h('button', { type: 'button', 'aria-label': D.long(wk + i) + ', ' + c + ' events', onClick: () => { A.ui.cal.anchor = wk + i; A.ui.cal.view = 'day'; location.hash = '#/calendar'; A.route(); }, style: { padding: '8px 0', borderRadius: '14px', background: 'color-mix(in srgb, var(--accent) ' + Math.min(c, 6) * 12 + '%, transparent)', outline: wk + i === t0 ? '2px solid var(--accent)' : 'none' } }, h('div', { class: 'small muted' }, D.DOW3[D.dow(wk + i)][0]), h('b', { class: 'num' }, c)))));
      const clocks = A.clockRows().slice(0, 3), clockCard = clocks.length ? h('div', { class: 'card' }, h('h3', null, 'World clocks', h('span', { class: 'grow' }), h('a', { href: '#/timer', class: 'small', style: { color: 'var(--accent-ink)' }, onClick: () => { sessionStorage.setItem('aide.timers', JSON.stringify(Object.assign(JSON.parse(sessionStorage.getItem('aide.timers') || '{}'), { tab: 'wc' }))); } }, 'More')), h('div', { class: 'stack' }, clocks.map(r => h('div', { class: 'clock' }, h('span', null, r.night ? '🌙' : '☀️'), h('b', null, r.city), h('div', { class: 'tm num' }, r.time, h('small', null, r.diff)))))) : null;
      root.append(h('div', { class: 'stack', style: { gap: '14px' } }, quick, alerts, h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' }, id: 'tg' }, h('div', { class: 'stack', style: { gap: '14px' } }, hero, timeline, visitCard), h('div', { class: 'stack', style: { gap: '14px' } }, reqCard, taskCard, weekCard, clockCard))));
      if (matchMedia('(max-width: 1000px)').matches) $('#tg').style.gridTemplateColumns = '1fr';
    },
  };

  /* ── settings ─────────────────────────────────────────────────────── */
  A.views.settings = {
    title: 'Settings', sub: 'Profile, appearance, security and backups',
    render(root) {
      const S = A.settings(), set = (k, v) => { S[k] = v; A.save('settings'); }, txt = (k, ph, ac) => h('input', { type: 'text', dir: 'auto', value: S[k] || '', placeholder: ph, autocomplete: ac || 'off', onInput: e => set(k, e.target.value) });
      const seg = (k, opts, after) => h('div', { class: 'seg' }, opts.map(([v, n]) => h('button', { type: 'button', 'aria-pressed': S[k] === v, onClick: () => { set(k, v); if (k === 'theme') A.applyTheme(); A.route(); } }, n)));
      const num = (k, min, max, step) => h('input', { type: 'number', min, max, step: step || 1, value: S[k] == null ? '' : S[k], style: { width: '96px' }, onChange: e => { const v = Math.max(min, Math.min(max, +e.target.value || 0)); e.target.value = v; set(k, v); } });
      const row = (label, ctrl, hint) => h('div', { class: 'line' }, h('div', { class: 'grow' }, h('b', null, label), hint ? h('div', { class: 'small muted' }, hint) : null), ctrl);
      const card = (title, ...kids) => h('section', { class: 'card' }, h('h3', null, title), h('div', { class: 'sett' }, kids));
      const fileIn = h('input', { type: 'file', accept: '.aide,.json', class: 'sr', onChange: async e => { const f = e.target.files[0]; if (!f) return; try { const u = A.vault.importBlob(await f.text()); A.toast('Backup for “' + u + '” stored. Lock the desk and sign in with that vault’s password.'); } catch (x) { A.toast(x.message); } } });
      root.append(h('div', { class: 'stack', style: { gap: '14px', maxWidth: '820px' } },
        card('Profile', A.field('Executive’s name', txt('name', 'e.g. Alex Morgan')), A.field('Executive’s title', txt('title', 'e.g. Chief Executive Officer')), A.field('Your role / signature', txt('assistant', 'e.g. Executive Assistant'))),
        card('Appearance', row('Theme', seg('theme', [['auto', 'Auto'], ['paper', 'Paper'], ['dusk', 'Dusk']])), row('Time format', seg('hour12', [[false, '24-hour'], [true, '12-hour']])), row('Week starts on', seg('weekStart', [[0, 'Mon'], [5, 'Sat'], [6, 'Sun']])), row('Second calendar', seg('secondary', [['none', 'None'], ['persian', 'Persian'], ['islamic', 'Hijri']]), 'Shown in small type under each day.')),
        card('Schedule', row('Day starts at', num('dayStart', 0, 12), 'Hour, 0–12'), row('Day ends at', num('dayEnd', 12, 24), 'Hour, 12–24'), row('Default event length', num('defDur', 15, 480, 15), 'Minutes'), row('Buffer between meetings', num('buffer', 0, 60, 5), 'Minutes, used for free windows'), row('Default reminder', num('remind', 0, 120, 5), 'Minutes before; 0 = none')),
        card('Security', row('Auto-lock after', num('lockMin', 0, 240), 'Minutes of inactivity; 0 = never'), row('Lock now', h('button', { class: 'btn', type: 'button', onClick: lock }, A.ico('lock'), 'Lock')), row('Password', h('button', { class: 'btn', type: 'button', onClick: changePw }, 'Change password'), 'Re-encrypts everything with the new password.'), h('p', { class: 'note' }, 'Everything is stored only in this browser, encrypted with your password. There is no server and no way to reset a forgotten password — so keep a backup file somewhere safe.')),
        card('Notifications', row('Reminders & timers', h('button', { class: 'btn', type: 'button', onClick: async () => { if (!('Notification' in window)) return A.toast('This browser has no notification support.'); const r = await Notification.requestPermission(); A.toast('Notifications: ' + r); } }, A.ico('bell'), 'Allow notifications'), 'Alerts only fire while the desk is open (also on the iPhone/iPad home-screen app).')),
        card('Data & backup', row('Backup file', h('button', { class: 'btn', type: 'button', onClick: () => { A.flush().then(() => A.download('aide-backup-' + D.iso(D.today()) + '.aide', A.vault.exportBlob(), 'application/json')); } }, A.ico('download'), 'Download'), 'Encrypted. Safe to store in cloud drive or email to yourself.'), row('Restore backup', h('label', { class: 'btn' }, A.ico('upload'), 'Choose file', fileIn)), row('Calendar export', h('button', { class: 'btn', type: 'button', onClick: () => A.download('aide-calendar.ics', A.ics(A.db.data.events, 'Aide'), 'text/calendar') }, A.ico('calendar'), '.ics'), 'Opens in Apple, Google and Outlook calendars.'), row('Everything as plain JSON', h('button', { class: 'btn', type: 'button', onClick: async () => { if (await A.confirm('Export unencrypted data', 'The file will NOT be encrypted. Anyone who gets it can read it. Continue?', 'Export', false)) A.download('aide-data.json', JSON.stringify(A.db.data, null, 2), 'application/json'); } }, 'Export')), row('Load sample data', h('button', { class: 'btn', type: 'button', onClick: async () => { if (await A.confirm('Add sample data', 'Adds example events, contacts, tasks and notes to your existing data.', 'Add', false)) { const s = A.sample(); ['events', 'contacts', 'requests', 'tasks', 'notes'].forEach(k => A.db.data[k].push(...s[k])); A.db.data.avail = Object.assign({}, s.avail, A.db.data.avail); A.save('all'); A.toast('Sample data added.'); } } }, 'Add')), row('Erase everything', h('button', { class: 'btn danger', type: 'button', onClick: async () => { if (await A.confirm('Erase this vault', 'This permanently deletes the vault and all data on this device.', 'Erase forever')) { A.vault.wipe(); built = false; A.showLogin('The vault was erased.'); } } }, 'Erase'))),
        card('About', h('p', { class: 'note' }, 'Aide · Executive Desk v1.0. Design language inspired by Moxen’s free resources (moxen.cl/recursos): cream paper, cacao ink, pastel categories and spring motion. All code in this project is original and dependency-free.'), h('p', { class: 'note' }, 'Shortcuts: ⌘/Ctrl + K search · N new event · T today · ← → previous/next in the calendar · in the calendar, arrow keys move a focused event, Shift + ↑↓ changes its length.'))));
    },
  };
  function changePw() {
    const o = h('input', { type: 'password', autocomplete: 'current-password' }), n = h('input', { type: 'password', autocomplete: 'new-password' }), n2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const m = A.modal({ title: 'Change password', body: [A.field('Current password', o), A.field('New password (10+ characters)', n), A.field('Repeat new password', n2)], footer: [h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onClick: async () => { if (n.value.length < 10) return A.toast('Use at least 10 characters.'); if (n.value !== n2.value) return A.toast('The new passwords do not match.'); try { await A.vault.changePassword(o.value, n.value); m.close(); A.toast('Password changed.'); } catch (e) { A.toast('Current password is wrong.'); } } }, 'Change')] });
  }

  /* ── command palette (⌘K) ─────────────────────────────────────────── */
  A.palette = function () {
    if (!A.db.data) return; const t0 = D.today(); let sel = 0, items = [];
    const inp = h('input', { type: 'search', placeholder: 'Search events, people, notes, tasks — or type a command', 'aria-label': 'Search', autocomplete: 'off', dir: 'auto' }), list = h('div', { class: 'pal-list', role: 'listbox' });
    const go = id => () => { location.hash = '#/' + id; };
    const cmds = [['New event', 'plus', () => E.edit(null, {})], ['New task', 'tasks', () => { location.hash = '#/tasks'; }], ['New note', 'notes', () => A.newNote()], ['New contact', 'people', () => { location.hash = '#/people'; }], ...NAV.map(([id, n, ic]) => ['Go to ' + n, ic, go(id)])];
    const build2 = () => {
      const q = inp.value.trim().toLowerCase(); items = [];
      if (!q) items = cmds.slice(0, 9).map(([t, ic, fn]) => ({ t, ic, fn, s: 'Command' }));
      else {
        cmds.filter(c => c[0].toLowerCase().includes(q)).slice(0, 4).forEach(([t, ic, fn]) => items.push({ t, ic, fn, s: 'Command' }));
        E.expand(t0 - 30, t0 + 180).filter(o => (o.title + ' ' + (o.ev.people || '') + ' ' + (o.ev.loc || '') + ' ' + (o.ev.notes || '')).toLowerCase().includes(q)).slice(0, 6).forEach(o => items.push({ t: o.title, ic: 'calendar', s: D.mid(o.day) + (o.allDay ? '' : ' · ' + A.time(o.start)), fn: () => E.edit(o.ev) }));
        A.db.data.contacts.filter(c => [c.name, c.org, c.role, c.notes].join(' ').toLowerCase().includes(q)).slice(0, 4).forEach(c => items.push({ t: c.name, ic: 'user', s: [c.role, c.org].filter(Boolean).join(' · '), fn: () => { location.hash = '#/people'; } }));
        A.db.data.notes.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(q)).slice(0, 4).forEach(n => items.push({ t: n.title || 'Untitled', ic: 'notes', s: 'Note', fn: () => { location.hash = '#/notes'; } }));
        A.db.data.tasks.filter(t => t.title.toLowerCase().includes(q)).slice(0, 4).forEach(t => items.push({ t: t.title, ic: 'tasks', s: t.done ? 'Task · done' : 'Task', fn: () => { location.hash = '#/tasks'; } }));
      }
      sel = 0; draw();
    };
    const run = i => { const it = items[i]; if (!it) return; m.close(); setTimeout(it.fn, 60); };
    const draw = () => { list.replaceChildren(...(items.length ? items.map((it, i) => h('button', { type: 'button', class: 'item', role: 'option', 'aria-selected': i === sel, onClick: () => run(i) }, A.ico(it.ic), h('span', { class: 'grow', dir: 'auto' }, it.t), h('span', { class: 'small muted' }, it.s))) : [A.empty('No matches', '', 'search')])); const s = list.querySelector('[aria-selected=true]'); s && s.scrollIntoView({ block: 'nearest' }); };
    inp.addEventListener('input', A.debounce(build2, 80));
    inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } else if (e.key === 'Enter') { e.preventDefault(); run(sel); } });
    const m = A.modal({ title: 'Search', cls: 'palette', body: [inp, list] }); build2(); setTimeout(() => inp.focus(), 40);
  };

  /* ── keyboard + idle lock ─────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (!A.db.data) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('dialog[open]')) A.palette(); return; }
    if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (A.keys && A.keys(e)) e.preventDefault();
    else if (!e.target.matches('input,textarea,select') && e.key === '/') { e.preventDefault(); A.palette(); }
  });
  let idle = Date.now();
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(n => window.addEventListener(n, () => idle = Date.now(), { passive: true, capture: true }));
  setInterval(() => { if (!A.db.data) return; const m = A.settings().lockMin; if (m > 0 && Date.now() - idle > m * 60000) lock('Locked after ' + m + ' minutes of inactivity.'); }, 15000);
  window.addEventListener('pagehide', () => { A.db.data && A.flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && A.db.data) A.flush(); });

  A.start = function () {
    A.applyTheme(); idle = Date.now(); if (!built) build(); E.startReminders();
    if (!location.hash) history.replaceState(null, '', '#/today'); A.route();
  };
})();
