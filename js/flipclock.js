/* AIDE · Flip clock lock screen. The lock button turns the desk into a full-screen flip clock (time, date, next meeting).
   Tap or press any key to return. The session is not signed out, so returning needs no password. */
(function () {
  'use strict';
  var A = window.Aide;
  var css = document.createElement('style');
  css.textContent = '#flip{position:fixed;inset:0;z-index:100000;background:#0b0b0b;color:#f2f2ef;display:none;flex-direction:column;align-items:center;justify-content:center;gap:4vh;font-family:Outfit,Vazirmatn,system-ui,sans-serif;cursor:pointer;user-select:none;-webkit-user-select:none;padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom)}' +
    '#flip.on{display:flex}#flip .row{display:flex;align-items:center;gap:2.2vw}' +
    '#flip .card{position:relative;width:min(19vw,26vh);height:min(26vw,36vh);perspective:1200px;border-radius:min(2vw,18px);font-variant-numeric:tabular-nums}' +
    '#flip .half{position:absolute;left:0;right:0;height:50%;overflow:hidden;background:#1c1c1c;color:#f2f2ef;font-size:min(22vw,31vh);font-weight:600;line-height:min(26vw,36vh);text-align:center;letter-spacing:-.02em}' +
    '#flip .top{top:0;border-radius:min(2vw,18px) min(2vw,18px) 0 0;background:linear-gradient(#232323,#1c1c1c)}#flip .bot{bottom:0;border-radius:0 0 min(2vw,18px) min(2vw,18px);line-height:0;background:#191919}' +
    '#flip .bot span{display:block;transform:translateY(-50%)}#flip .card::after{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:#0b0b0b;z-index:5}' +
    '#flip .flap{position:absolute;left:0;right:0;top:0;height:50%;transform-origin:bottom;backface-visibility:hidden;z-index:4;border-radius:min(2vw,18px) min(2vw,18px) 0 0}' +
    '#flip .flap.go{animation:flipdown .6s cubic-bezier(.45,.05,.55,.95) forwards}@keyframes flipdown{to{transform:rotateX(-180deg)}}' +
    '#flip .sep{font-size:min(12vw,18vh);color:#555;font-weight:300;margin-top:-1vh}' +
    '#flip .date{font-size:clamp(18px,2.6vw,30px);color:#bdbdb8;text-align:center}#flip .next{font-size:clamp(14px,1.8vw,20px);color:#8b8b86;text-align:center;max-width:90vw}' +
    '#flip .hint{position:absolute;bottom:calc(22px + env(safe-area-inset-bottom));font-size:13px;color:#5d5d59}' +
    '@media (prefers-reduced-motion:reduce){#flip .flap.go{animation:none;display:none}}';
  document.head.appendChild(css);
  var el = document.createElement('div'); el.id = 'flip'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Locked — flip clock');
  el.innerHTML = '<div class="row"><div class="card" data-i="0"></div><div class="card" data-i="1"></div><div class="sep">:</div><div class="card" data-i="2"></div><div class="card" data-i="3"></div></div><div class="date"></div><div class="next"></div><div class="hint">Tap anywhere to return</div>';
  var cur = ['', '', '', ''], timer = null;
  function face(card, d, old) {
    card.innerHTML = '<div class="half top"><span>' + d + '</span></div><div class="half bot"><span>' + d + '</span></div>' + (old != null && old !== '' ? '<div class="half top flap go"><span>' + old + '</span></div>' : '');
  }
  function fa() { try { return A && A.settings().lang === 'fa' } catch (e) { return false } }
  function jal() { try { return A && A.settings().calSystem !== 'gregorian' } catch (e) { return true } }
  function tick() {
    var n = new Date(), s = String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0');
    var cards = el.querySelectorAll('.card');
    for (var i = 0; i < 4; i++) if (s[i] !== cur[i]) { var dg = fa() ? '۰۱۲۳۴۵۶۷۸۹'[+s[i]] : s[i]; face(cards[i], dg, cur[i] === '' ? null : (fa() ? '۰۱۲۳۴۵۶۷۸۹'[+cur[i]] : cur[i])); cur[i] = s[i] }
    var loc = (fa() ? 'fa-IR' : 'en-GB') + (jal() ? '-u-ca-persian' : '-u-ca-gregory');
    try { el.querySelector('.date').textContent = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(n) } catch (e) { }
    try {
      var iso = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'), m = n.getHours() * 60 + n.getMinutes();
      var nx = ((A.db.data || {}).events || []).filter(function (e) { return e.date === iso && !e.allDay && e.start >= m }).sort(function (a, b) { return a.start - b.start })[0];
      el.querySelector('.next').textContent = nx ? (fa() ? 'بعدی: ' : 'Next: ') + String(Math.floor(nx.start / 60)).padStart(2, '0') + ':' + String(nx.start % 60).padStart(2, '0') + ' · ' + nx.title : '';
    } catch (e) { }
  }
  function open() { if (!el.isConnected) document.body.appendChild(el); cur = ['', '', '', '']; el.classList.add('on'); tick(); clearInterval(timer); timer = setInterval(tick, 1000); try { el.requestFullscreen && document.fullscreenEnabled && el.requestFullscreen().catch(function () { }) } catch (e) { } }
  function close() { el.classList.remove('on'); clearInterval(timer); try { document.fullscreenElement && document.exitFullscreen() } catch (e) { } }
  el.addEventListener('click', close); addEventListener('keydown', function (e) { if (el.classList.contains('on')) close() });
  window.AideFlip = { open: open, close: close };
  // the lock buttons (top bar / side menu / settings) open the flip clock instead of signing out
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b || el.contains(b)) return;
    var t = (b.textContent || '').trim(), lab = (b.getAttribute('aria-label') || b.title || '');
    var isLock = (b.closest('.side-foot') && b.querySelector('svg path') && /M7 11V7a5 5 0 0 1 10 0v4|lock/i.test(b.innerHTML + lab + t) && !/logout|sign out|خروج/i.test(lab + t)) || /^(Lock|Lock now|قفل|قفل کنید)$/i.test(t);
    if (isLock) { e.preventDefault(); e.stopImmediatePropagation(); open() }
  }, true);
})();
