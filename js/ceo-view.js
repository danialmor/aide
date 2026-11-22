/* AIDE · CEO view tab (secretary side). Creates/revokes the CEO's private read-only link and shows exactly what the CEO sees. */
(function () {
  'use strict';
  const A = window.Aide; if (!A || !A.views) return;
  const h = A.h, KEY = 'aide.ceoLink';
  const base = new URL('./ceo.html', location.href.split('#')[0]).href;
  const linkFor = t => base + '#k=' + t;
  const saved = () => { try { return localStorage.getItem(KEY) || '' } catch (e) { return '' } };
  A.views['ceo-view'] = {
    title: 'CEO view', sub: 'What the CEO sees: meetings, appointments and reminders — on a private link, no password', flush: false,
    render(root) {
      const tok = saved();
      const box = h('div', { class: 'card', style: { padding: '18px', display: 'grid', gap: '12px', marginBottom: '14px' } });
      const status = h('p', { class: 'muted small', style: { margin: 0 } }, tok ? 'A private link is active. Anyone with it can view (read-only).' : 'No link yet. Create one and send it to the CEO.');
      const url = h('input', { type: 'text', readonly: true, value: tok ? linkFor(tok) : '', placeholder: 'The private link appears here…', style: { width: '100%' } });
      const make = h('button', { class: 'btn', type: 'button', onClick: async () => {
        try { const r = await A.api('/api/ceo-link', 'POST', {}); localStorage.setItem(KEY, r.token); A.toast && A.toast('New private link created. The old one stops working.'); A.route() }
        catch (e) { A.toast && A.toast('Could not create the link: ' + (e.message || 'server not updated yet')) } } }, A.ico('plus'), h('span', null, tok ? 'New link' : 'Create link'));
      const copy = h('button', { class: 'btn', type: 'button', disabled: !tok, onClick: () => { url.select(); (navigator.clipboard ? navigator.clipboard.writeText(url.value) : Promise.reject()).then(() => A.toast && A.toast('Link copied.'), () => document.execCommand('copy')) } }, A.ico('copy'), h('span', null, 'Copy link'));
      const open = h('a', { class: 'btn', href: tok ? linkFor(tok) : '#', target: '_blank', rel: 'noopener' }, A.ico('eye'), h('span', null, 'Open'));
      const revoke = h('button', { class: 'btn danger', type: 'button', disabled: !tok, onClick: async () => {
        if (A.confirm && !await A.confirm('Turn off link', 'The CEO will no longer be able to open the current link.')) return;
        try { await A.api('/api/ceo-link', 'DELETE'); localStorage.removeItem(KEY); A.route() } catch (e) { A.toast && A.toast('Could not turn off the link.') } } }, A.ico('trash'), h('span', null, 'Turn off'));
      box.append(h('b', null, 'Private link for the CEO'), status, url, h('div', { class: 'row wrap', style: { gap: '8px' } }, make, copy, open, revoke));
      root.append(box);
      const S = A.settings(), KEYS = ['stats', 'brief', 'today', 'next', 'reminders', 'projects'];
      const NAMES = { stats: ['Numbers', 'Meetings today, this week, open reminders, next meeting'], brief: ['Smart brief', 'One-line summary of the day'], today: ['Today', "Today's meetings"], next: ['Next days', 'The next 14 days'], reminders: ['Reminders', 'Open reminders'], projects: ['Project control', 'Status of every project from the Project Control dashboard'] };
      const DEF = { phone: { order: ['brief', 'stats', 'today', 'reminders', 'next', 'projects'], hide: {}, wide: {} }, desktop: { order: KEYS.slice(), hide: {}, wide: { stats: 1, brief: 1, projects: 1 } } };
      const old = S.ceoTiles || {};
      if (!S.ceoLayout) S.ceoLayout = JSON.parse(JSON.stringify(DEF)), ['phone', 'desktop'].forEach(m => { if (old.brief === false) S.ceoLayout[m].hide.brief = 1; if (old.projects === false) S.ceoLayout[m].hide.projects = 1; });
      const LY = S.ceoLayout; ['phone', 'desktop'].forEach(m => { LY[m] = LY[m] || JSON.parse(JSON.stringify(DEF[m])); LY[m].hide = LY[m].hide || {}; LY[m].wide = LY[m].wide || {}; KEYS.forEach(k => { if (!LY[m].order.includes(k)) LY[m].order.push(k); }); });
      const mode = A.views['ceo-view']._mode || 'desktop';
      const save = () => { S.ceoTiles = { brief: !LY.desktop.hide.brief, projects: !LY.desktop.hide.projects }; A.save('settings'); A.route(); };
      const L = LY[mode], list = h('div', { class: 'stack', style: { gap: '6px' } }, L.order.map((k, i) => h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', padding: '8px 12px', borderRadius: '14px', background: 'var(--line-fine)', opacity: L.hide[k] ? .55 : 1 } },
        h('input', { type: 'checkbox', checked: !L.hide[k], 'aria-label': 'Show ' + NAMES[k][0], onChange: e => { if (e.target.checked) delete L.hide[k]; else L.hide[k] = 1; save(); } }),
        h('span', { class: 'grow' }, h('b', null, NAMES[k][0]), h('br'), h('small', { class: 'muted' }, NAMES[k][1])),
        mode === 'desktop' ? h('button', { class: 'btn sm', type: 'button', 'aria-pressed': String(!!L.wide[k]), title: 'Full width or one column', onClick: () => { if (L.wide[k]) delete L.wide[k]; else L.wide[k] = 1; save(); } }, L.wide[k] ? 'Full width' : '1 column') : null,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onClick: () => { L.order.splice(i - 1, 0, L.order.splice(i, 1)[0]); save(); } }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move down', disabled: i === L.order.length - 1, onClick: () => { L.order.splice(i + 1, 0, L.order.splice(i, 1)[0]); save(); } }, '↓'))));
      const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Layout for' }, [['phone', 'Phone'], ['desktop', 'Desktop']].map(([v, n]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === v), onClick: () => { A.views['ceo-view']._mode = v; A.route(); } }, n)));
      const lyCard = h('div', { class: 'card', style: { padding: '18px', display: 'grid', gap: '12px', marginBottom: '14px', alignContent: 'start' } },
        h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, h('b', { class: 'grow' }, 'CEO page layout'), seg),
        h('p', { class: 'muted small', style: { margin: 0 } }, mode === 'phone' ? 'What the CEO sees on the phone: tick to show, arrows to reorder.' : 'What the CEO sees on a computer or iPad: tick to show, arrows to reorder, full width or one column.'), list);
      const pair = h('div', { style: { display: 'grid', gap: '16px', gridTemplateColumns: mode === 'phone' && innerWidth > 900 ? 'minmax(0,1fr) 410px' : '1fr', alignItems: 'start' } }, lyCard); root.append(pair);
      if (tok) {
        const md = A.views['ceo-view']._mode || 'desktop', ph = md === 'phone';
        const f = h('iframe', { src: linkFor(tok) + '&pv=' + encodeURIComponent(JSON.stringify(A.settings().ceoLayout)), title: 'CEO view preview', style: { width: ph ? '410px' : '100%', maxWidth: '100%', height: ph ? '780px' : 'calc(100dvh - 330px)', minHeight: '520px', border: ph ? '10px solid #111' : '0', borderRadius: ph ? '44px' : '24px', background: 'transparent', display: 'block', margin: ph ? '0 auto' : '0' } });
        pair.append(f);
      }
    }
  };
})();
