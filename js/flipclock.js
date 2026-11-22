/* AIDE · Flip clock lock screen. Uses the owner's original FlipClock (flipclock/, from FlipClock-main.zip) full screen.
   Lock buttons open it; the ✕ button in the clock (or Esc) returns to the desk. No sign-out, so no password is needed. */
(function () {
  'use strict';
  var base = (document.currentScript && document.currentScript.src || '').replace(/js\/flipclock\.js.*$/, '');
  var el = document.createElement('div'); el.id = 'flip';
  el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;background:#000';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Locked — flip clock');
  function open() {
    if (!el.isConnected) document.body.appendChild(el);
    el.innerHTML = '<iframe src="' + base + 'flipclock/index.html" title="Flip clock" style="border:0;width:100%;height:100%;display:block" allow="fullscreen; autoplay"></iframe>';
    el.style.display = 'block';
    try { document.fullscreenEnabled && el.requestFullscreen().catch(function () { }) } catch (e) { }
  }
  function close() { el.style.display = 'none'; el.innerHTML = ''; try { document.fullscreenElement && document.exitFullscreen() } catch (e) { } }
  addEventListener('message', function (e) { if (e.data === 'aide-flip-close') close() });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.style.display === 'block') close() });
  window.AideFlip = { open: open, close: close };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    var t = (b.textContent || '').trim(), lab = (b.getAttribute('aria-label') || b.title || '');
    var isLock = (b.closest('.side-foot') && b.querySelector('svg path') && /M7 11V7a5 5 0 0 1 10 0v4|lock/i.test(b.innerHTML + lab + t) && !/logout|sign out|خروج/i.test(lab + t)) || /^(Lock|Lock now|قفل|قفل کنید)$/i.test(t);
    if (isLock) { e.preventDefault(); e.stopImmediatePropagation(); open() }
  }, true);
})();
