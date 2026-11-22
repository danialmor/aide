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
      if (tok) {
        const f = h('iframe', { src: linkFor(tok), title: 'CEO view preview', style: { width: '100%', height: 'calc(100dvh - 330px)', minHeight: '520px', border: '0', borderRadius: '24px', background: 'transparent' } });
        root.append(f);
      }
    }
  };
})();
