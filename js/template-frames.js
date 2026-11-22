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
    f.style.cssText = 'width:calc(100% + 12px);margin-inline-start:-12px;border:0;display:block;background:transparent;color-scheme:' + (dark() ? 'dark' : 'light');
    const size = () => { if (!f.isConnected) return removeEventListener('resize', size); const top = f.getBoundingClientRect().top; f.style.height = Math.max(520, innerHeight - Math.max(0, top)) + 'px' };
    addEventListener('resize', size); requestAnimationFrame(size); setTimeout(size, 300);
    f.addEventListener('load', () => { size(); try { f.contentWindow.postMessage({ aideTheme: dark() ? 'dark' : 'light' }, '*') } catch (e) { } });
    return f;
  }
  LIST.forEach(([slug, name, sub]) => {
    A.views['tpl-' + slug] = { title: name, sub: sub, flush: true, render(root) { root.append(frame(slug, name)) } };
  });
})();
