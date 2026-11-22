/* AIDE · AI assistant. Uses the VERTEX ecosystem assistant (same providers, chats and settings as every VERTEX platform).
   Gives it the desk's data as context: today's and upcoming events, open tasks, requests, people. */
(function () {
  'use strict';
  var A = window.Aide;
  var pad = function (n) { return String(n).padStart(2, '0') };
  var hm = function (m) { m = +m || 0; return pad(Math.floor(m / 60)) + ':' + pad(m % 60) };
  window.VX_CTX = function (q) {
    try {
      var d = (A && A.db && A.db.data) || {}, today = new Date(); today.setHours(0, 0, 0, 0);
      var iso = function (x) { return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()) };
      var from = iso(today), to = iso(new Date(today.getTime() + 30 * 864e5));
      var ev = (d.events || []).filter(function (e) { return (e.date >= from && e.date <= to) || (e.rec && e.rec !== 'none') })
        .sort(function (a, b) { return (a.date + hm(a.start)) < (b.date + hm(b.start)) ? -1 : 1 }).slice(0, 80)
        .map(function (e) { return '- ' + e.date + ' ' + (e.allDay ? 'all day' : hm(e.start) + '–' + hm((+e.start || 0) + (+e.dur || 60))) + ' [' + (e.cat || 'meeting') + '] ' + e.title + (e.loc ? ' @ ' + e.loc : '') + (e.rec && e.rec !== 'none' ? ' (repeats)' : '') });
      var tk = (d.tasks || []).filter(function (t) { return !t.done }).slice(0, 40).map(function (t) { return '- ' + t.title + (t.due ? ' (due ' + t.due + ')' : '') + (t.owner ? ' → ' + t.owner : '') });
      var rq = (d.requests || []).slice(0, 30).map(function (r) { return '- ' + (r.title || r.subject || r.name || 'request') + (r.date ? ' ' + r.date : '') + (r.status ? ' [' + r.status + ']' : '') });
      var pp = (d.contacts || []).slice(0, 60).map(function (c) { return '- ' + c.name + (c.role ? ' (' + c.role + ')' : '') + (c.phone ? ' ' + c.phone : '') });
      var s = (A && A.settings && A.settings()) || {};
      return 'You are the assistant of an executive desk (secretary and CEO calendar). Today is ' + from + '. Calendar system preferred: ' + (s.calSystem === 'jalali' ? 'Shamsi (Persian)' : 'Gregorian') + '.\n' +
        'EVENTS (next 30 days):\n' + (ev.join('\n') || '- none') + '\nOPEN TASKS / REMINDERS:\n' + (tk.join('\n') || '- none') +
        '\nREQUESTS:\n' + (rq.join('\n') || '- none') + '\nPEOPLE:\n' + (pp.join('\n') || '- none');
    } catch (e) { return '' }
  };
  window.VXAI_SUGGEST = ['What is on today?', 'Which meetings clash this week?', 'Draft a reminder message for tomorrow\'s meetings', 'Find a free hour for a 60-min meeting this week'];
  var src = /\/VERTEX\//.test(location.pathname) ? '../shared/ai/ai.js?v=419' : 'https://danialmor.github.io/VERTEX/shared/ai/ai.js?v=419';
  var sc = document.createElement('script'); sc.src = src; sc.defer = true;
  sc.onload = function () { // desk-specific quick questions instead of the project ones
    var t = setInterval(function () { var c = document.querySelector('#vxai .chips'); if (!c) return; clearInterval(t);
      c.innerHTML = ''; window.VXAI_SUGGEST.forEach(function (q) { var b = document.createElement('button'); b.type = 'button'; b.textContent = q; c.appendChild(b) }) }, 300);
  };
  document.head.appendChild(sc);
})();
