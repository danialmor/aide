/* AIDE · Template tabs (Moxen). Each template runs unchanged in its own frame, so its design and motion stay exact.
   Tab names are Persian. To add one: copy the template folder to templates/<slug>/ and add a line to LIST.
   Connections to the AIDE calendar data are added in a later step (see postMessage hook in frame()). */
(function () {
  'use strict';
  const A = window.Aide; if (!A || !A.views) return;
  const LIST = [
    ['lunario', 'تقویم ماهانه', 'رویدادهای چندروزه به‌صورت نوار روی ماه'],
    ['semana', 'برنامه هفتگی', 'هفت ستون ساعتی با خط «اکنون» و جابه‌جایی رویدادها'],
    ['epoca', 'نمای سال تا روز', 'بزرگ‌نمایی پیوسته از سال تا روز'],
    ['parangon', 'مقایسه بازه‌ها', 'مقایسه‌ی دو بازه‌ی زمانی روی تقویم دوماهه'],
    ['turno', 'رزرو وقت', 'انتخاب روز و ساعت آزاد برای ملاقات'],
    ['vencimientos', 'سررسیدها', 'پرداخت‌ها و سررسیدهای ماه'],
    ['solape', 'تداخل تقویم‌ها', 'خواندن فایل ICS و نمایش تداخل‌ها'],
    ['estadia', 'انتخاب بازه', 'انتخاب تاریخ رفت و برگشت یا مرخصی'],
    ['franjas', 'ساعات حضور', 'رنگ‌کردن ساعات حضور هفتگی'],
    ['itinerario', 'برنامه فصلی', 'نقشه‌ی راه سه‌ماهه با نوارهای کشیدنی'],
    ['recurrencia', 'تکرار رویداد', 'تنظیم تکرار با جمله‌ی خوانا و پیش‌نمایش تقویم'],
    ['rueda', 'انتخاب تاریخ', 'چرخ روز، ماه و سال'],
    ['esfera', 'تنظیم زمان', 'صفحه‌ی گرد انتخاب دقیقه'],
    ['puntual', 'شمارش معکوس', 'زمان‌سنج نقطه‌ای تا شروع جلسه'],
    ['convite', 'دعوت‌نامه جلسه', 'کارت دعوت با تأیید حضور']
  ];
  A.templateTabs = LIST;
  const base = (document.currentScript && document.currentScript.src) ? new URL('../templates/', document.currentScript.src).href : './templates/';
  const dark = () => document.documentElement.dataset.theme === 'dusk';
  function frame(slug, title) {
    const f = document.createElement('iframe');
    f.src = base + slug + '/index.html'; f.title = title; f.loading = 'lazy';
    f.setAttribute('allow', 'fullscreen; clipboard-write');
    f.style.cssText = 'width:100%;height:calc(100dvh - 150px);min-height:560px;border:0;border-radius:18px;display:block;background:#fff;color-scheme:' + (dark() ? 'dark' : 'light');
    return f;
  }
  LIST.forEach(([slug, name, sub]) => {
    A.views['tpl-' + slug] = { title: name, sub: sub, flush: false, render(root) { root.append(frame(slug, name)) } };
  });
})();
