/* AIDE · Customizable navigation
 * Per-account section visibility. Preferences use A.save('settings'), which
 * writes through the existing online account-preferences API.
 */
(function () {
  'use strict';
  const A = window.Aide;
  if (!A || !A.views || !A.views.settings) return;

  const SECTIONS = [
    ['today', 'امروز', 'Today'],
    ['calendar', 'تقویم', 'Calendar'],
    ['repeats', 'تکرارها', 'Repeats'],
    ['roadmap', 'نقشه راه', 'Roadmap'],
    ['requests', 'درخواست‌ها', 'Requests'],
    ['availability', 'زمان‌های آزاد', 'Availability'],
    ['tasks', 'کارها', 'Tasks'],
    ['notes', 'دفترچه یادداشت', 'Notebook'],
    ['timer', 'زمان‌سنج‌ها', 'Timers'],
    ['people', 'افراد', 'People'],
    ['themes', 'تم‌ها', 'Themes'],
    ['layouts', 'قالب‌ها', 'Layouts'],
    ['moxen-anaquel', 'قالب Anaquel', 'Anaquel'],
    ['moxen-convite', 'قالب Convite', 'Convite'],
    ['moxen-epoca', 'قالب Época', 'Época'],
    ['moxen-lunario', 'قالب Lunario', 'Lunario'],
    ['moxen-parangon', 'قالب Parangón', 'Parangón'],
    ['moxen-semana', 'قالب Semana', 'Semana'],
    ['moxen-solape', 'قالب Solape', 'Solape'],
    ['moxen-tregua', 'قالب Tregua', 'Tregua'],
    ['moxen-turno', 'قالب Turno', 'Turno'],
    ['moxen-vencimientos', 'قالب Vencimientos', 'Vencimientos'],
    ['manager', 'مدیرعامل', 'Manager'],
    ['users', 'کاربران', 'Users'],
    ['settings', 'تنظیمات', 'Settings']
  ];
  const MANAGER_SECTIONS = new Set(['manager', 'themes', 'settings', 'layouts', 'moxen-anaquel', 'moxen-convite', 'moxen-epoca', 'moxen-lunario', 'moxen-parangon', 'moxen-semana', 'moxen-solape', 'moxen-tregua', 'moxen-turno', 'moxen-vencimientos']);
  const defaults = () => [];
  function availableSections() {
    if (A.role === 'manager') return SECTIONS.filter(([id]) => MANAGER_SECTIONS.has(id));
    return SECTIONS.filter(([id]) => id !== 'manager' && (id !== 'users' || A.role === 'admin'));
  }
  function isVisible(id) {
    const hidden = A.settings().hiddenSections || defaults();
    return id === 'settings' || !hidden.includes(id);
  }
  function applyVisibility() {
    if (!A.db || !A.db.data) return;
    const allowed = new Set(availableSections().map(([id]) => id));
    document.querySelectorAll('a[href^="#/"]').forEach(a => {
      const id = (a.getAttribute('href') || '').slice(2).split('?')[0];
      if (!SECTIONS.some(s => s[0] === id)) return;
      a.hidden = !allowed.has(id) || !isVisible(id);
      a.setAttribute('aria-hidden', String(a.hidden));
      if (a.hidden) a.tabIndex = -1;
      else a.removeAttribute('tabindex');
    });
  }

  const oldRender = A.views.settings.render;
  A.views.settings.render = function (root) {
    oldRender.call(this, root);
    const h = A.h;
    const S = A.settings();
    if (!Array.isArray(S.hiddenSections)) S.hiddenSections = [];
    const list = h('div', { class: 'aide-custom-tabs-list' });
    function renderRows() {
      list.replaceChildren();
      availableSections().forEach(([id, fa, en]) => {
        const input = h('input', {
          type: 'checkbox',
          checked: id === 'settings' || !S.hiddenSections.includes(id),
          disabled: id === 'settings',
          'aria-label': 'نمایش ' + fa,
          onChange: e => {
            const hidden = new Set(A.settings().hiddenSections || []);
            if (e.target.checked) hidden.delete(id);
            else if (id !== 'settings') hidden.add(id);
            A.settings().hiddenSections = Array.from(hidden);
            A.save('settings');
            A.rebuild();
            applyVisibility();
            if (A.toast) A.toast(e.target.checked ? 'بخش فعال شد: ' + fa : 'بخش غیرفعال شد: ' + fa);
          }
        });
        const label = h('label', { class: 'aide-custom-tab-row', for: 'aide-tab-' + id },
          h('span', { class: 'aide-custom-tab-name' }, fa, h('small', null, en)),
          input);
        input.id = 'aide-tab-' + id;
        list.append(label);
      });
    }
    renderRows();
    const style = h('style', null, `
      .aide-custom-tabs-card{margin-top:14px}
      .aide-custom-tabs-intro{color:var(--soft);font-size:13px;line-height:1.8;margin:0 0 12px}
      .aide-custom-tabs-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .aide-custom-tab-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:10px 12px;border:1px solid var(--line);border-radius:15px;background:var(--canvas);cursor:pointer}
      .aide-custom-tab-name{display:grid;gap:2px;font-weight:650}
      .aide-custom-tab-name small{font-size:11px;font-weight:500;color:var(--faint);direction:ltr;text-align:right}
      .aide-custom-tab-row input{width:19px;height:19px;accent-color:var(--accent);flex:none}
      @media(max-width:600px){.aide-custom-tabs-list{grid-template-columns:1fr}.aide-custom-tab-row{min-height:54px}}
    `);
    const card = h('section', { class: 'card aide-custom-tabs-card' },
      h('h3', null, 'سفارشی‌سازی تب‌ها'),
      h('p', { class: 'aide-custom-tabs-intro' }, 'با فعال یا غیرفعال کردن تیک هر بخش، نمایش آن در منوی کناری، نوار پایین موبایل و فهرست «بیشتر» کنترل می‌شود. این تغییر فقط نمایش را مدیریت می‌کند و اطلاعات بخش را حذف نمی‌کند. تنظیمات برای همین حساب کاربری به‌صورت آنلاین ذخیره می‌شود.'),
      list,
      h('div', { class: 'row wrap', style: { marginTop: '12px', justifyContent: 'flex-end' } },
        h('button', { type: 'button', class: 'btn sm', onClick: () => {
          A.settings().hiddenSections = [];
          A.save('settings');
          A.rebuild();
          applyVisibility();
          if (A.toast) A.toast('همه بخش‌های مجاز فعال شدند.');
        } }, 'نمایش همه بخش‌ها')));
    root.append(style, card);
    setTimeout(applyVisibility, 0);
  };

  if (typeof A.on === 'function') A.on('change', () => setTimeout(applyVisibility, 0));
  window.addEventListener('hashchange', () => setTimeout(applyVisibility, 0));
  const observer = new MutationObserver(() => applyVisibility());
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(applyVisibility, 0);
})();