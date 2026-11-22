/* AIDE · Template tabs (Moxen). Each template runs unchanged in its own frame, so its design and motion stay exact.
   Tab names are English (base language); Persian comes from the interface dictionary when the desk is set to فارسی. To add one: copy the template folder to templates/<slug>/ and add a line to LIST.
   Connections to the AIDE calendar data are added in a later step (see postMessage hook in frame()). */
(function () {
  'use strict';
  const A = window.Aide; if (!A || !A.views) return;
  const LIST = [
    ['lunario', 'Monthly calendar', 'Multi-day events as bars across the month'],
    ['semana', 'Weekly planner', 'Seven hour columns with a “now” line and draggable events'],
    ['epoca', 'Year to day', 'Smooth zoom from year to day'],
    ['parangon', 'Compare periods', 'Compare two date ranges on a two-month calendar'],
    ['turno', 'Book a time', 'Pick a day and a free time slot'],
    ['vencimientos', 'Due dates', 'Payments and due dates of the month'],
    ['solape', 'Calendar clashes', 'Read .ics files and show clashes'],
    ['estadia', 'Date range', 'Pick a start and end date'],
    ['franjas', 'Office hours', 'Paint weekly attendance hours'],
    ['itinerario', 'Quarter plan', 'Three-month roadmap with draggable bars'],
    ['recurrencia', 'Repeat rule', 'Set a repeat with a readable sentence and calendar preview'],
    ['rueda', 'Date picker', 'Day, month and year wheel'],
    ['esfera', 'Time dial', 'Round dial for picking minutes'],
    ['puntual', 'Countdown', 'Dot timer until the meeting starts'],
    ['convite', 'Meeting invite', 'Invitation card with RSVP']
  ];
  A.templateTabs = LIST;
  const base = (document.currentScript && document.currentScript.src) ? new URL('../templates/', document.currentScript.src).href : './templates/';
  const dark = () => document.documentElement.dataset.theme === 'dusk';
  function frame(slug, title) {
    const f = document.createElement('iframe');
    f.src = base + slug + '/index.html'; f.title = title;
    f.setAttribute('allow', 'fullscreen; clipboard-write'); f.setAttribute('allowtransparency', 'true');
    f.className = 'aide-tpl';
    f.style.cssText = 'width:100%;border:0;display:block;background:transparent;color-scheme:' + (dark() ? 'dark' : 'light');
    const size = () => { if (f.classList.contains('aide-tpl-sm')) return; if (!f.isConnected) return removeEventListener('resize', size); const top = f.getBoundingClientRect().top; f.style.height = Math.max(520, innerHeight - Math.max(0, top) - 12) + 'px' };
    addEventListener('resize', size); requestAnimationFrame(size); setTimeout(size, 300);
    f.addEventListener('load', () => { size(); try { f.contentWindow.postMessage({ aideTheme: dark() ? 'dark' : 'light' }, '*') } catch (e) { } });
    return f;
  }
  /* Small templates share one tab, side by side, each frame sized to its content. */
  const SMALL = ['rueda', 'esfera', 'puntual', 'estadia', 'convite'];
  A.templateSmall = SMALL;
  addEventListener('message', e => { const d = e.data || {}; if (d.aideTpl !== 'h' || !d.slug) return; document.querySelectorAll('iframe.aide-tpl-sm[data-slug="' + d.slug + '"]').forEach(f => { f.style.height = Math.max(220, Math.min(d.h + 4, 900)) + 'px' }) });
  A.views['tpl-tools'] = { title: 'Time tools', sub: 'Date picker, time dial, countdown, date range and invite', flush: true, render(root) {
    const g = document.createElement('div'); g.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:10px;align-items:start;padding:2px';
    SMALL.forEach(slug => { const it = LIST.find(x => x[0] === slug); const f = frame(slug, it ? it[1] : slug); f.className = 'aide-tpl aide-tpl-sm'; f.dataset.slug = slug; f.style.height = '420px'; f.onload = () => { try { f.contentWindow.postMessage({ aideTheme: dark() ? 'dark' : 'light' }, '*') } catch (e) { } }; g.append(f) });
    root.append(g) } };
  LIST.forEach(([slug, name, sub]) => {
    A.views['tpl-' + slug] = { title: name, sub: sub, flush: true, render(root) { root.append(frame(slug, name)) } };
  });
})();
