/* AIDE · smart tiles (shared by the desk and the CEO page).
   - projects: live project status from the VERTEX Project Control dashboard (msp-bi/data/store/pinfo.json, public).
     planned % = elapsed share of start→finish; behind = actual is more than 5 points under planned.
   - brief: one-paragraph summary of the day built from the desk data (no external AI needed). */
(function () {
  'use strict';
  var SRC = 'https://danialmor.github.io/VERTEX/msp-bi/data/store/pinfo.json';
  var S = window.AideSmart = { projects: null, loading: false, listeners: [] };
  S.onProjects = function (fn) { if (S.projects) fn(S.projects); else S.listeners.push(fn); S.load(); };
  S.load = function (force) {
    if (S.loading || (S.projects && !force)) return; S.loading = true;
    fetch(SRC + '?t=' + Math.floor(Date.now() / 300000), { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (j) {
      var now = Date.now(), rows = Object.keys(j.rows || {}).map(function (k) {
        var p = j.rows[k], st = +p.start || 0, fi = +p.finish || 0;
        var plan = st && fi > st ? Math.max(0, Math.min(100, (now - st) / (fi - st) * 100)) : 0, act = Math.max(0, Math.min(100, +p.pct || 0));
        var gap = act - plan, state = act >= 100 ? 'done' : now < st ? 'soon' : gap < -15 ? 'late' : gap < -5 ? 'watch' : 'ok';
        return { no: p.no, name: p.name, stage: p.stage || '', pm: p.pm || '', act: Math.round(act), plan: Math.round(plan), gap: Math.round(gap), state: state, finish: fi };
      }).sort(function (a, b) { var o = { late: 0, watch: 1, ok: 2, soon: 3, done: 4 }; return o[a.state] - o[b.state] || a.gap - b.gap });
      var c = function (s) { return rows.filter(function (r) { return r.state === s }).length };
      S.projects = { rows: rows, total: rows.length, late: c('late'), watch: c('watch'), ok: c('ok'), done: c('done'), soon: c('soon'), avg: rows.length ? Math.round(rows.reduce(function (a, r) { return a + r.act }, 0) / rows.length) : 0, updated: j.t || 0 };
      var l = S.listeners; S.listeners = []; l.forEach(function (f) { try { f(S.projects) } catch (e) { } });
    }).catch(function () { }).then(function () { S.loading = false });
  };
  S.COLORS = { late: '#d64933', watch: '#e0a12a', ok: '#2f9e6e', soon: '#8a8f98', done: '#4a6fd6' };
  S.LABEL = { late: 'Behind', watch: 'Watch', ok: 'On track', soon: 'Not started', done: 'Done' };
  S.LABEL_FA = { late: 'عقب', watch: 'زیر نظر', ok: 'طبق برنامه', soon: 'شروع نشده', done: 'تمام' };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) };
  /* compact list (HTML) used by both pages: name · actual bar with planned tick · status */
  S.projectRows = function (max, fa) {
    var P = S.projects; if (!P) return '<p style="opacity:.6;margin:6px 0">' + (fa ? 'در حال دریافت وضعیت پروژه‌ها…' : 'Loading project status…') + '</p>';
    return P.rows.slice(0, max || 99).map(function (r) { return S.projectRow(r, fa) }).join('');
  };
  S.projectRow = function (r, fa) {
    {
      var col = S.COLORS[r.state];
      return '<div class="sp-row" title="' + esc(r.stage) + '"><span class="sp-n" dir="auto">' + esc(r.name) + '</span>' +
        '<span class="sp-bar"><i style="width:' + r.act + '%;background:' + col + '"></i><b style="inset-inline-start:' + r.plan + '%"></b></span>' +
        '<span class="sp-p">' + r.act + '%</span><span class="sp-s" style="color:' + col + '">' + (fa ? S.LABEL_FA : S.LABEL)[r.state] + '</span></div>';
    }
  };
  S.css = '.sp-row{display:grid;grid-template-columns:minmax(60px,1.1fr) 2fr 38px 70px;align-items:center;gap:8px;font-size:12.5px;padding:3px 0}.sp-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}' +
    '.sp-bar{position:relative;height:8px;border-radius:5px;background:rgba(0,0,0,.08)}.sp-bar i{position:absolute;inset-block:0;inset-inline-start:0;border-radius:5px}.sp-bar b{position:absolute;top:-3px;width:2px;height:14px;background:currentColor;opacity:.55}' +
    '.sp-p{font-variant-numeric:tabular-nums;text-align:end}.sp-s{font-size:11.5px;font-weight:600;white-space:nowrap}';
  var st = document.createElement('style'); st.textContent = S.css; document.head.appendChild(st);
  /* brief: d = { todays:[{title,start,allDay}], nowMin, pending, oldest, due, overdue, free:'14:00'|null, overlaps } */
  S.brief = function (d, fa) {
    var hm = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') };
    var timed = (d.todays || []).filter(function (e) { return !e.allDay }), next = timed.filter(function (e) { return e.start >= d.nowMin })[0], out = [];
    if (fa) {
      out.push(timed.length ? timed.length + ' جلسه امروز' + (next ? '؛ بعدی ' + hm(next.start) + ' «' + next.title + '»' : '؛ جلسه‌ی دیگری نمانده') : 'امروز جلسه‌ای ثبت نشده');
      if (d.overlaps) out.push(d.overlaps + ' تداخل در برنامه');
      if (d.pending) out.push(d.pending + ' درخواست منتظر پاسخ' + (d.oldest ? ' (قدیمی‌ترین ' + d.oldest + ' روز)' : ''));
      if (d.overdue) out.push(d.overdue + ' کار عقب‌افتاده'); else if (d.due) out.push(d.due + ' کار سررسید امروز');
      if (d.free) out.push('اولین وقت آزاد ' + d.free);
      if (S.projects && S.projects.late) out.push(S.projects.late + ' پروژه عقب از برنامه');
      return out.join(' · ') + '.';
    }
    out.push(timed.length ? timed.length + ' meeting' + (timed.length > 1 ? 's' : '') + ' today' + (next ? '; next at ' + hm(next.start) + ' “' + next.title + '”' : '; none left') : 'No meetings today');
    if (d.overlaps) out.push(d.overlaps + ' overlap' + (d.overlaps > 1 ? 's' : ''));
    if (d.pending) out.push(d.pending + ' request' + (d.pending > 1 ? 's' : '') + ' waiting' + (d.oldest ? ' (oldest ' + d.oldest + ' d)' : ''));
    if (d.overdue) out.push(d.overdue + ' overdue task' + (d.overdue > 1 ? 's' : '')); else if (d.due) out.push(d.due + ' task' + (d.due > 1 ? 's' : '') + ' due today');
    if (d.free) out.push('first free slot ' + d.free);
    if (S.projects && S.projects.late) out.push(S.projects.late + ' project' + (S.projects.late > 1 ? 's' : '') + ' behind plan');
    return out.join(' · ') + '.';
  };
  S.load();
})();
