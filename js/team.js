/* AIDE · Team (calendar centre of the subscription). The secretary sees every member of the VERTEX subscription,
   sets meetings and reminders for each person and sends them notifications (they appear in the bell on every VERTEX platform).
   Members and notifications come from the VERTEX hub; events/tasks stay in this Aide workspace with `for: [member codes]`. */
(function () {
  'use strict';
  var A = window.Aide; if (!A || !A.views) return;
  var h = A.h, ROOT = (location.pathname.match(/^(.*?\/VERTEX\/)/i) || [])[1] || 'https://danialmor.github.io/VERTEX/';
  var tok = function () { try { return localStorage.getItem('hub.token') || '' } catch (e) { return '' } };
  var hubReady = null;
  function hub() {
    if (hubReady) return hubReady;
    var need = function (src) { return new Promise(function (r) { var s = document.createElement('script'); s.src = ROOT + src; s.onload = r; s.onerror = r; document.head.appendChild(s) }) };
    hubReady = (window.VX_HUB ? Promise.resolve() : need('shared/cloud.js?v=412').then(function () { return window.BRAND ? 0 : need('shared/brand.js') }).then(function () { return need('shared/demo.js?v=414') }))
      .then(function () { var b = document.getElementById('demoBar'); if (b) b.remove() });
    return hubReady;
  }
  function api(m, p, b) { return hub().then(function () { return fetch(location.origin + (ROOT.indexOf('http') === 0 ? new URL(ROOT).pathname : ROOT) + 'api/v1' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() }, body: b ? JSON.stringify(b) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j }) }) }) }
  var MEM = null, SEL = null;
  function members() { return MEM ? Promise.resolve(MEM) : api('GET', '/team/members').then(function (j) { MEM = j.members || []; return MEM }) }
  var pad = function (n) { return String(n).padStart(2, '0') }, hm = function (m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60) };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
  function forOf(code) { var d = A.db.data || {}; return { ev: (d.events || []).filter(function (e) { return (e.for || []).indexOf(code) >= 0 }).sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : 1 }), tk: (d.tasks || []).filter(function (t) { return t.forCode === code && !t.done }) } }
  function field(label, el) { return h('label', { style: { display: 'grid', gap: '6px', fontSize: '13px', color: 'var(--soft)' } }, label, el) }
  A.views.team = {
    title: 'Team', sub: 'Calendars, meetings and reminders for every member of the subscription', flush: false,
    render: function (root) {
      if (!tok()) { root.append(h('div', { class: 'card', style: { padding: '22px' } }, h('b', null, 'Sign in through VERTEX'), h('p', { class: 'muted' }, 'Open Aide from the VERTEX control panel to see your team.'))); return }
      var wrap = h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(220px,300px) 1fr', gap: '16px', alignItems: 'start' } });
      var list = h('div', { class: 'card', style: { padding: '12px', display: 'grid', gap: '4px' } }, h('p', { class: 'muted' }, 'Loading team…'));
      var pane = h('div', { style: { display: 'grid', gap: '14px', minWidth: 0 } });
      wrap.append(list, pane); root.append(wrap);
      if (matchMedia('(max-width: 820px)').matches) wrap.style.gridTemplateColumns = '1fr';
      members().then(function (ms) {
        list.innerHTML = '';
        if (!ms.length) { list.append(h('p', { class: 'muted' }, 'No members in this subscription yet.')); return }
        if (!SEL) SEL = ms[0].code;
        ms.forEach(function (m) {
          var c = forOf(m.code);
          var b = h('button', { type: 'button', class: 'btn', style: { justifyContent: 'flex-start', gap: '10px', background: SEL === m.code ? 'var(--ink)' : 'transparent', color: SEL === m.code ? 'var(--canvas,#fff)' : 'var(--ink)', boxShadow: 'none' }, onClick: function () { SEL = m.code; A.route() } },
            h('span', { class: 'avatar', style: { width: '34px', height: '34px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: SEL === m.code ? 'rgba(255,255,255,.18)' : 'var(--line)', fontWeight: 600 } }, (m.name || m.code).trim().charAt(0).toUpperCase()),
            h('span', { class: 'grow', style: { textAlign: 'start' } }, h('b', { dir: 'auto' }, m.name), h('small', { style: { display: 'block', opacity: .7 } }, (m.leader ? 'Leader · ' : '') + c.ev.filter(function (e) { return e.date >= today() }).length + ' upcoming')));
          list.append(b);
        });
        var me = ms.filter(function (m) { return m.code === SEL })[0] || ms[0]; renderMember(pane, me, ms);
      }).catch(function (e) { list.innerHTML = ''; list.append(h('p', { class: 'muted' }, 'Could not load the team: ' + e.message)) });
    }
  };
  function renderMember(pane, m, ms) {
    var c = forOf(m.code);
    var head = h('div', { class: 'card', style: { padding: '18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
      h('div', { class: 'grow' }, h('h2', { style: { margin: 0, fontSize: '24px' }, dir: 'auto' }, m.name), h('p', { class: 'muted', style: { margin: '4px 0 0' } }, m.code + (m.ucode ? ' · ' + m.ucode : ''))));
    // new meeting for this person
    var tt = h('input', { type: 'text', placeholder: 'Meeting title…', autocomplete: 'off' }), dd = h('input', { type: 'date', value: today() }), st = h('input', { type: 'time', value: '10:00' }), du = h('input', { type: 'number', value: 60, min: 5, step: 5, inputmode: 'numeric' }), lc = h('input', { type: 'text', placeholder: 'Place (optional)…', autocomplete: 'off' });
    var others = h('select', { multiple: true, style: { minHeight: '88px' } }); ms.forEach(function (x) { var o = h('option', { value: x.code }, x.name); if (x.code === m.code) o.selected = true; others.append(o) });
    var notify = h('input', { type: 'checkbox', checked: true });
    var meet = h('div', { class: 'card', style: { padding: '18px', display: 'grid', gap: '12px' } }, h('b', null, 'Set a meeting'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '10px' } }, field('Title', tt), field('Date', dd), field('Start', st), field('Minutes', du), field('Place', lc), field('People', others)),
      h('label', { class: 'row', style: { gap: '8px' } }, notify, h('span', null, 'Notify them on VERTEX')),
      h('div', null, h('button', { class: 'btn', type: 'button', style: { background: 'var(--ink)', color: 'var(--canvas,#fff)' }, onClick: function () {
        if (!tt.value.trim()) { tt.focus(); return }
        var who = [].map.call(others.selectedOptions, function (o) { return o.value }), p = st.value.split(':');
        var ev = { id: A.uid(), title: tt.value.trim(), date: dd.value, start: (+p[0]) * 60 + (+p[1] || 0), dur: +du.value || 60, cat: 'meeting', loc: lc.value.trim(), for: who, with: who.map(function (c) { var x = ms.filter(function (y) { return y.code === c })[0]; return x ? x.name : c }) };
        A.db.data.events = (A.db.data.events || []).concat([ev]); A.save('events');
        if (notify.checked && window.VX_NOTIFY_SEND !== undefined || notify.checked) api('POST', '/notify', { to: who, title: 'Meeting: ' + ev.title, body: ev.date + ' ' + st.value + (ev.loc ? ' · ' + ev.loc : ''), at: ev.date + ' ' + st.value, kind: 'meeting', app: 'aide' }).catch(function () { });
        A.toast && A.toast('Meeting saved' + (notify.checked ? ' and sent.' : '.')); A.route() } }, A.ico('plus'), h('span', null, 'Save meeting'))));
    // reminder
    var rt = h('input', { type: 'text', placeholder: 'Reminder…', autocomplete: 'off' }), rd = h('input', { type: 'date', value: today() });
    var rem = h('div', { class: 'card', style: { padding: '18px', display: 'grid', gap: '12px' } }, h('b', null, 'Add a reminder for ' + m.name),
      h('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px', alignItems: 'end' } }, field('Reminder', rt), field('Due', rd),
        h('button', { class: 'btn', type: 'button', onClick: function () {
          if (!rt.value.trim()) { rt.focus(); return }
          A.db.data.tasks = (A.db.data.tasks || []).concat([{ id: A.uid(), title: rt.value.trim(), due: rd.value, pri: 'plan', done: false, owner: m.name, forCode: m.code }]); A.save('data');
          api('POST', '/notify', { to: [m.code], title: 'Reminder: ' + rt.value.trim(), body: rd.value ? 'Due ' + rd.value : '', kind: 'reminder', app: 'aide' }).catch(function () { });
          A.toast && A.toast('Reminder added and sent.'); A.route() } }, h('span', null, 'Add'))));
    // free notice
    var nt = h('input', { type: 'text', placeholder: 'Message…', autocomplete: 'off' }), all = h('input', { type: 'checkbox' });
    var note = h('div', { class: 'card', style: { padding: '18px', display: 'grid', gap: '12px' } }, h('b', null, 'Send a notice'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'end' } }, field('Message', nt),
        h('button', { class: 'btn', type: 'button', onClick: function () { if (!nt.value.trim()) { nt.focus(); return } var to = all.checked ? ms.map(function (x) { return x.code }) : [m.code];
          api('POST', '/notify', { to: to, title: nt.value.trim(), kind: 'info', app: 'aide' }).then(function (j) { A.toast && A.toast('Sent to ' + j.sent + '.'); nt.value = '' }).catch(function (e) { A.toast && A.toast('Could not send: ' + e.message) }) } }, h('span', null, 'Send'))),
      h('label', { class: 'row', style: { gap: '8px' } }, all, h('span', null, 'Send to the whole team')));
    // their calendar
    var up = c.ev.filter(function (e) { return e.date >= today() }).slice(0, 30);
    var cal = h('div', { class: 'card', style: { padding: '18px' } }, h('b', null, m.name + ' — upcoming'),
      up.length ? h('div', null, up.map(function (e) { return h('div', { style: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--line)' } }, h('span', { class: 'muted', style: { fontVariantNumeric: 'tabular-nums' } }, e.date + ' ' + hm(e.start || 0)), h('span', { dir: 'auto' }, h('b', null, e.title), e.loc ? h('small', { class: 'muted', style: { display: 'block' } }, e.loc) : null)) })) : h('p', { class: 'muted' }, 'Nothing scheduled.'),
      c.tk.length ? h('div', { style: { marginTop: '12px' } }, h('b', null, 'Open reminders'), c.tk.map(function (t) { return h('div', { style: { padding: '8px 0', borderTop: '1px solid var(--line)' }, dir: 'auto' }, t.title + (t.due ? ' · ' + t.due : '')) })) : null);
    pane.append(head, cal, meet, rem, note);
  }
})();
