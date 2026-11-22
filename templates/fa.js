/* AIDE · Template bridge (loaded at the end of every template page).
   1) Fits the template into the AIDE tab: transparent page, full width, AIDE font (Theme project: Vazirmatn).
   2) Translates the template's Spanish interface to Persian, live (MutationObserver), including generated dates.
   Data connections to the AIDE calendar come in a later step. */
(function () {
  'use strict';
  var root = document.documentElement;
  /* ---------- 1. fit into AIDE ---------- */
  var lk = document.createElement('link'); lk.rel = 'stylesheet';
  lk.href = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap';
  document.head.appendChild(lk);
  var st = document.createElement('style');
  st.textContent = 'html,body{background:transparent!important;min-height:0!important}' +
    'body{margin:0!important;font-family:Vazirmatn,var(--aide-font,system-ui),sans-serif!important}' +
    'body *{font-family:inherit}' +
    'code,kbd,pre,.mono,[class*=mono]{font-family:ui-monospace,Menlo,monospace!important}' +
    '.aide-wide{max-width:none!important;width:100%!important;margin-left:0!important;margin-right:0!important}' +
    '.aide-stage{background:transparent!important;padding:8px!important;min-height:0!important;height:auto!important}';
  document.head.appendChild(st);
  function fit() {
    var vw = innerWidth;
    // top-level wrappers that paint a full-page backdrop become transparent; centred content boxes get the full width
    [].forEach.call(document.body.children, function (el) {
      if (/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName)) return;
      var cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.position === 'absolute') return;
      if (el.getBoundingClientRect().width >= vw * .9) el.classList.add('aide-stage');
    });
    var q = document.querySelectorAll('body > *, body > * > *, body > * > * > *');
    [].forEach.call(q, function (el) {
      if (/^(SCRIPT|STYLE|svg|SVG|BUTTON|INPUT|IMG|CANVAS)$/.test(el.tagName)) return;
      var mw = parseFloat(getComputedStyle(el).maxWidth);
      if (mw >= 600 && mw <= 1300) el.classList.add('aide-wide');
    });
    try { parent.postMessage({ aideTpl: 'h', h: document.documentElement.scrollHeight }, '*') } catch (e) { }
  }
  /* ---------- 2. Persian ---------- */
  var P = {
    // whole strings (UI)
    'Entrada libre':'ورود آزاد','Inauguración':'افتتاحیه','exposición de pintura y grabado':'نمایشگاه نقاشی و چاپ','Paisajes en tinta':'منظره‌های جوهری',
    'Una noche con brindis de apertura y visita guiada a la colección, en la sala principal.':'شبی با پذیرایی افتتاحیه و بازدید همراه راهنما از مجموعه، در سالن اصلی.',
    'Mi hora':'ساعت من','allí':'آنجا','aquí':'اینجا','Lugar':'مکان','Sala de exposiciones':'سالن نمایشگاه','planta baja, entrada por el patio':'طبقه همکف، ورود از حیاط',
    'Plazas':'ظرفیت','Quedan':'باقی‌مانده','Aviso al asistir':'یادآوری هنگام حضور','Asistiré':'شرکت می‌کنم','Asistirás':'شرکت می‌کنید','Añadir al calendario':'افزودن به تقویم',
    'En tu calendario':'در تقویم شما','Descargar archivo .ics':'دریافت فایل ‎.ics','Vale para cualquier calendario':'برای هر تقویمی','Copiar enlace':'کپی پیوند',
    'Para pegarlo donde quieras':'برای چسباندن در هر جا','Copiar como texto':'کپی به‌صورت متن','Título, día, hora y lugar':'عنوان، روز، ساعت و مکان',
    'Recordatorio':'یادآور','Cuándo avisarte':'چه زمانی خبر بدهیم','Cómo añadirlo':'چطور اضافه شود',
    'Trabajo':'کار','Personal':'شخصی','Bienestar':'سلامتی','Estudio':'مطالعه','Año':'سال','Mes':'ماه','Semana':'هفته','Día':'روز','Hoy':'امروز','hoy':'امروز',
    'Rueda o pellizco':'چرخ یا دو انگشت','para acercar o alejar':'برای بزرگ‌نمایی یا کوچک‌نمایی','pulsa un punto para bajar a ese día':'یک نقطه را بزنید تا به آن روز بروید',
    'Calendario':'تقویم','Escala de tiempo':'مقیاس زمان','Anterior':'قبلی','Siguiente':'بعدی',
    'minutos':'دقیقه','Listo para empezar':'آماده‌ی شروع','Qué quieres recordar':'چه چیزی یادت بیاید','Minutos':'دقیقه','Segundos':'ثانیه',
    'Arrastra el dial · rueda para afinar · Esc reinicia':'صفحه را بچرخانید · چرخ برای تنظیم دقیق · Esc برای شروع دوباره',
    'Sacar el pan del horno':'بیرون آوردن نان از فر','¡Se acabó el tiempo!':'زمان تمام شد!','Temporizador de dial':'زمان‌سنج گرد','Tiempo restante':'زمان باقی‌مانده',
    'Tiempos habituales':'زمان‌های رایج','Un minuto menos':'یک دقیقه کمتر','Un minuto más':'یک دقیقه بیشتر','Reiniciar (Esc)':'از نو (Esc)','Iniciar':'شروع',
    'Llegada':'رفت','Salida':'برگشت','Agrega fecha':'افزودن تاریخ','Atajos':'میان‌برها','Este fin de semana':'این آخر هفته','Próximos 7 días':'۷ روز آینده',
    'Próximos 14 días':'۱۴ روز آینده','Este mes':'این ماه','Elige el día de llegada':'روز رفت را انتخاب کنید','Elige el día de salida':'روز برگشت را انتخاب کنید',
    'Borrar':'پاک کردن','Aplicar':'اعمال','Elegir llegada y salida':'انتخاب رفت و برگشت','Mes anterior':'ماه قبل','Mes siguiente':'ماه بعد','Re Pág':'PgUp','Av Pág':'PgDn',
    'Horario de atención':'ساعات پاسخ‌گویی','Disponibilidad semanal':'حضور هفتگی','semanales':'در هفته','En palabras':'به زبان ساده','Pintar':'رنگ‌کردن',
    'Mayús':'Shift','borra mientras arrastras':'هنگام کشیدن پاک می‌کند','Copiar a los demás días':'کپی به روزهای دیگر','Deshacer':'واگرد','Vaciar semana':'خالی کردن هفته',
    'Arrastra para pintar':'برای رنگ‌کردن بکشید','Estira el borde de una franja':'لبه‌ی یک بازه را بکشید','Espacio':'Space','pinta con teclado':'رنگ‌کردن با صفحه‌کلید',
    'Herramienta de la rejilla':'ابزار جدول','Rejilla de disponibilidad':'جدول حضور',
    'Producto · segundo trimestre':'محصول · فصل دوم','Hoja de ruta':'نقشه‌ی راه','Trimestre':'فصل','Diseño':'طراحی','Desarrollo':'توسعه','Contenido':'محتوا','Lanzamiento':'عرضه',
    'Hitos':'نقاط عطف','Investigación':'پژوهش','Prototipo':'نمونه‌ی اولیه','Sistema visual':'سیستم بصری','Base técnica':'زیرساخت فنی','Interfaz':'رابط کاربری','Pagos':'پرداخت‌ها',
    'Guía de voz':'راهنمای لحن','Textos de ayuda':'متن‌های راهنما','Plan de salida':'برنامه‌ی عرضه','Pruebas':'آزمون‌ها','Guía publicada':'راهنما منتشر شد',
    'Prototipo listo':'نمونه‌ی اولیه آماده','Beta cerrada':'بتای بسته','Salida pública':'عرضه‌ی عمومی','Avance':'پیشرفت','Completar':'تکمیل',
    'Arrastra una barra o sus asas · cambia entre Mes y Trimestre':'نوار یا دسته‌هایش را بکشید · بین ماه و فصل جابه‌جا شوید',
    'Arrastra una barra o estira sus asas · cambia a «Mes» · flechas mueven, Mayús + flechas estiran, +/− el avance':'نوار را بکشید یا دسته‌هایش را بکشید · به «ماه» بروید · کلیدهای جهت جابه‌جا می‌کنند، Shift + جهت کش می‌دهد، +/− پیشرفت',
    'Escala del tiempo':'مقیاس زمان','Eventos':'رویدادها','Carriles':'ردیف‌ها','Solapes':'هم‌پوشانی‌ها','Reiniciar':'از نو','Región':'منطقه','vía Intl.Locale':'از Intl.Locale',
    'Obra':'کارگاه','Taller':'کارگاه آموزشی','Gestión':'مدیریت','Plazo':'مهلت','Comprobar altos y regiones':'بررسی ارتفاع‌ها و مناطق',
    'Gibosa menguante':'کوژ کاهنده','Menguante':'کاهنده','Creciente':'فزاینده','Gibosa creciente':'کوژ فزاینده','Luna nueva':'ماه نو','Luna llena':'ماه کامل',
    'Mudanza de bodega':'جابه‌جایی انبار','Auditoría de calidad':'ممیزی کیفیت','Feria del taller':'نمایشگاه کارگاه','Inventario de otoño':'انبارگردانی پاییز','Reunión semanal':'جلسه‌ی هفتگی',
    'Entrega de planos':'تحویل نقشه‌ها','Reunión de obra':'جلسه‌ی کارگاه','Llamada con el taller':'تماس با کارگاه','Revisión de planos':'بازبینی نقشه‌ها','Montaje de la muestra':'نصب نمایشگاه',
    'Descarga de material':'تخلیه‌ی مصالح','Día del equipo':'روز تیم','Obra de la azotea':'کار پشت‌بام','Corte de luz programado':'قطعی برق برنامه‌ریزی‌شده','Visita técnica':'بازدید فنی',
    'Cierre de caja':'بستن صندوق','Control de calidad':'کنترل کیفیت','Revisión de existencias':'بررسی موجودی','Inauguración de la muestra':'افتتاح نمایشگاه','Curso de grabado':'دوره‌ی چاپ',
    'Inspección de obra':'بازرسی کارگاه','Pintura de fachada':'رنگ نما','Taller de acuarela':'کارگاه آبرنگ','Entrevista de ingreso':'مصاحبه‌ی استخدام','Cata de materiales':'بررسی نمونه مصالح',
    'Limpieza general':'نظافت کلی','Visita de proveedores':'بازدید تأمین‌کنندگان','Día sin reuniones':'روز بدون جلسه','Congreso del gremio':'همایش صنفی','Cierre trimestral':'بستن فصل',
    'Pago a proveedores':'پرداخت به تأمین‌کنندگان','Medidas del calendario':'اندازه‌های تقویم','Qué significa cada color':'معنی هر رنگ',
    'Arrastra una barra a otros días, estira su borde para cambiar la duración o pulsa un «+N más».':'یک نوار را به روزهای دیگر بکشید، لبه‌اش را برای تغییر مدت بکشید یا روی «+N بیشتر» بزنید.',
    'Visitas':'بازدیدها','Panel de tráfico · Estudio creativo':'پنل ترافیک · استودیوی خلاق','A medida':'دلخواه','Comparar con':'مقایسه با','Periodo anterior':'دوره‌ی قبل','Año pasado':'سال گذشته',
    'Actual':'فعلی','Sin comparar':'بدون مقایسه','Visitas por día':'بازدید روزانه','extender':'گسترش','Intro':'Enter','elegir':'انتخاب','Cancelar':'لغو','Periodo del panel':'دوره‌ی پنل',
    'Atajos de periodo':'میان‌برهای دوره','Meses anteriores':'ماه‌های قبل','Meses siguientes':'ماه‌های بعد','Calendario de dos meses':'تقویم دوماهه','Este trimestre':'این فصل',
    'Fijado':'تنظیم شد','Toca la píldora para fijar el tiempo':'برای تنظیم زمان روی دکمه بزنید','Temporizador':'زمان‌سنج',
    'Recordatorio que se repite':'یادآور تکرارشونده','Restablecer':'بازنشانی','Guardar':'ذخیره','Guardando…':'در حال ذخیره…','Guardado':'ذخیره شد','Diaria':'روزانه','Semanal':'هفتگی',
    'Mensual':'ماهانه','Anual':'سالانه','Se avisa estos días':'در این روزها یادآوری می‌شود','Omitir fines de semana':'آخر هفته‌ها نه','Días de la semana':'روزهای هفته','Entre semana':'روزهای کاری',
    'Fines de semana':'آخر هفته‌ها','Todos los días':'همه‌ی روزها','Cada':'هر','El día':'روز','El':'','primer':'اولین','Mes del año':'ماه سال','Hora del aviso':'ساعت یادآوری',
    'Arrastra las manecillas':'عقربه‌ها را بکشید','Se repite':'تکرار می‌شود','cada semana':'هر هفته','Próximas cinco':'پنج مورد بعدی','No hay fechas: marca al menos un día.':'تاریخی نیست: دست‌کم یک روز را انتخاب کنید.',
    'Expresión':'عبارت','Próximo aviso':'یادآوری بعدی','Nombre del recordatorio':'نام یادآور','Frecuencia':'تکرار','Cada cuántos meses':'هر چند ماه','Qué día del mes':'کدام روز ماه',
    'Día del mes':'روز ماه','Un día antes':'یک روز قبل','Un día después':'یک روز بعد','Qué semana del mes':'کدام هفته‌ی ماه','Qué día de la semana':'کدام روز هفته',
    'Reloj de la hora del aviso':'ساعت یادآوری','Mañana o tarde':'صبح یا عصر','Calendario de las próximas repeticiones':'تقویم تکرارهای بعدی','Copiar la expresión':'کپی عبارت',
    'Fecha de entrega':'تاریخ تحویل','Mañana':'فردا','mañana':'فردا','Fijar fecha':'ثبت تاریخ','Fecha elegida':'تاریخ انتخاب‌شده','Elegir la fecha':'انتخاب تاریخ',
    'Taller ':'کارگاه','Foco':'تمرکز','Cuerpo':'بدن','Social':'اجتماعی','Ideas':'ایده‌ها','Pausa':'استراحت','Nuevo':'جدید','Plan de la semana':'برنامه‌ی هفته','Revisión de ideas':'مرور ایده‌ها',
    'Almuerzo largo':'ناهار مفصل','Caminata corta':'پیاده‌روی کوتاه','Taller de cerámica':'کارگاه سفال','Sesión de foco':'جلسه‌ی تمرکز','Café y lectura':'قهوه و مطالعه','Clase de dibujo':'کلاس طراحی',
    'Pausa activa':'استراحت فعال','Cierre de semana':'جمع‌بندی هفته','Cena en casa':'شام در خانه','Mercado y plantas':'بازار و گیاهان','Tarde de lectura':'عصر مطالعه','Paseo largo':'پیاده‌روی طولانی',
    'Evento eliminado':'رویداد حذف شد','Arrastra un evento, estira su borde o dibuja sobre un hueco.':'رویداد را بکشید، لبه‌اش را بکشید یا روی جای خالی رسم کنید.','Calendario semanal':'تقویم هفتگی',
    'Mostrar u ocultar categorías':'نمایش یا پنهان کردن دسته‌ها','Nuevo evento':'رویداد جدید','Cambiar de semana':'تغییر هفته','Semana anterior':'هفته‌ی قبل','Semana siguiente':'هفته‌ی بعد',
    'Lee tus calendarios .ics y encuentra lo que choca':'تقویم‌های ‎.ics خود را بخوانید و تداخل‌ها را پیدا کنید','choques':'تداخل','Abrir .ics':'باز کردن ‎.ics','Exportar .ics unido':'خروجی ‎.ics یکپارچه',
    'Casa':'خانه','Caminata':'پیاده‌روی','Sincronía de equipo':'هماهنگی تیم','Revisión de diseño':'بازبینی طراحی','Revisión dental':'معاینه‌ی دندان','Planificación quincenal':'برنامه‌ریزی دوهفته‌ای',
    'Bloque de lectura (libre)':'زمان مطالعه (آزاد)','Clase de pilates':'کلاس پیلاتس','Demo con el cliente':'دمو با مشتری','Llamada con el proveedor':'تماس با تأمین‌کننده','Almuerzo en casa':'ناهار در خانه',
    'Revisar las facturas del hogar':'بررسی قبض‌های خانه','Compra semanal':'خرید هفتگی','Choques':'تداخل‌ها','Sin choques':'بدون تداخل',
    'Los calendarios caben uno al lado del otro. Ya puedes exportar el unido.':'تقویم‌ها با هم جور هستند. حالا می‌توانید نسخه‌ی یکپارچه را خروجی بگیرید.','Suelta tus .ics':'فایل‌های ‎.ics را اینجا رها کنید',
    'Calendarios y semana':'تقویم‌ها و هفته','Calendarios':'تقویم‌ها','Agenda de la semana':'برنامه‌ی هفته','1 choque':'۱ تداخل','Hora de origen':'ساعت مبدأ',
    'Asesoría inicial':'مشاوره‌ی اولیه','Una primera conversación para conocer tu proyecto y ver por dónde partir.':'گفت‌وگوی اول برای شناخت پروژه‌ی شما و انتخاب نقطه‌ی شروع.','Videollamada':'تماس تصویری',
    'Equipo de diseño':'تیم طراحی','Te atiende':'پاسخ‌گو','Elige día y hora':'روز و ساعت را انتخاب کنید','Confirmar':'تأیید','Elige una hora':'یک ساعت انتخاب کنید','Reservado':'رزرو شد',
    'Agregar al calendario':'افزودن به تقویم','Agendar otra':'رزرو دیگر','Servicio':'خدمت','Elegir día':'انتخاب روز','Elegir hora':'انتخاب ساعت',
    'cobros este mes':'پرداخت در این ماه','Cobros por semana':'پرداخت‌ها در هفته','La semana 3 es la más cargada':'هفته‌ی ۳ شلوغ‌ترین است','Total al mes':'جمع ماهانه',
    'Toca un círculo para cancelarlo':'برای لغو، روی دایره بزنید','Ahorras al año':'صرفه‌جویی سالانه','Próximo cobro':'پرداخت بعدی','Analítica':'آنالیتیکس','Almacenamiento':'فضای ذخیره',
    'Correo':'ایمیل','Respaldos':'پشتیبان‌گیری','Hospedaje':'هاست','Dominio':'دامنه','Periodo del total':'دوره‌ی جمع','Servicios con cobro este mes':'خدمات با پرداخت در این ماه',
    'Calendario de cobros de las suscripciones':'تقویم پرداخت اشتراک‌ها','Hora local (GMT−3)':'ساعت محلی (GMT−3)','Hora':'ساعت','hora':'ساعت','Expresión de repetición':'عبارت تکرار'
  };
  var W = { // words (dates, units, small words)
    enero:'ژانویه',febrero:'فوریه',marzo:'مارس',abril:'آوریل',mayo:'مه',junio:'ژوئن',julio:'ژوئیه',agosto:'اوت',septiembre:'سپتامبر',octubre:'اکتبر',noviembre:'نوامبر',diciembre:'دسامبر',
    ene:'ژانویه',feb:'فوریه',abr:'آوریل',may:'مه',jun:'ژوئن',jul:'ژوئیه',ago:'اوت',sep:'سپتامبر',sept:'سپتامبر',oct:'اکتبر',nov:'نوامبر',dic:'دسامبر',
    lunes:'دوشنبه',martes:'سه‌شنبه','miércoles':'چهارشنبه',jueves:'پنجشنبه',viernes:'جمعه','sábado':'شنبه',domingo:'یکشنبه',
    lun:'دوشنبه','mié':'چهارشنبه',jue:'پنجشنبه',vie:'جمعه','sáb':'شنبه',dom:'یکشنبه',
    'día':'روز','días':'روز','semana':'هفته','semanas':'هفته','mes':'ماه','meses':'ماه','año':'سال','noches':'شب','noche':'شب','horas':'ساعت','hora':'ساعت',
    eventos:'رویداد',evento:'رویداد',tareas:'کار',tarea:'کار',libres:'آزاد',libre:'آزاد',series:'سری',citas:'قرار',calendarios:'تقویم',calendario:'تقویم',
    desde:'از',hasta:'تا',del:'از',al:'تا',en:'در',con:'با',contra:'در برابر',y:'و',o:'یا',de:'',el:'',la:'',los:'',las:'',a:'',
    'más':'بیشتر',cada:'هر',hoy:'امروز','mañana':'فردا',iluminada:'روشن',avance:'پیشرفت',plazas:'جای',ocupadas:'پر',ahora:'اکنون',al_abrir:'',
    choques:'تداخل',choque:'تداخل',choca:'تداخل با',abrir:'باز کردن',Semana:'هفته','Mañana':'فردا',Hoy:'امروز',Hito:'نقطه‌ی عطف',
    obra:'کارگاه',taller:'کارگاه',gestion:'مدیریت','gestión':'مدیریت',plazo:'مهلت',cobro:'پرداخت',Pulsa:'بزنید',pulsa:'بزنید',para:'برای',cancelar:'لغو',marcar:'علامت',
    Confirmar:'تأیید',Horas:'ساعت‌های',Elegir:'انتخاب',semanal:'هفتگی',Lun:'دوشنبه',Mar:'سه‌شنبه','Mié':'چهارشنبه',Jue:'پنجشنبه',Vie:'جمعه','Sáb':'شنبه',Dom:'یکشنبه',
    Enero:'ژانویه',Febrero:'فوریه',Marzo:'مارس',Abril:'آوریل',Mayo:'مه',Junio:'ژوئن',Julio:'ژوئیه',Agosto:'اوت',Septiembre:'سپتامبر',Octubre:'اکتبر',Noviembre:'نوامبر',Diciembre:'دسامبر',
    Lunes:'دوشنبه',Martes:'سه‌شنبه','Miércoles':'چهارشنبه',Jueves:'پنجشنبه',Viernes:'جمعه','Sábado':'شنبه',Domingo:'یکشنبه',
    min:'دقیقه',s:'ثانیه',h:'ساعت',demo:'نمایشی',vs:'در برابر','Año':'سال',Calendario:'تقویم',Agenda:'برنامه',Días:'روزهای',quedan:'باقی',Quedan:'باقی‌مانده',
    'p.':'ب.ظ','a.':'ق.ظ',zona:'منطقه',tu:'',nada:'هیچ',sin:'بدون',horas_:'' };
  var SHORT = { lu:'د',ma:'س',mi:'چ',ju:'پ',vi:'ج','sá':'ش','do':'ی',L:'د',M:'س',X:'چ',J:'پ',V:'ج',S:'ش',D:'ی',Lun:'دوشنبه',Mar:'سه‌شنبه','Mié':'چهارشنبه',Jue:'پنجشنبه',Vie:'جمعه','Sáb':'شنبه',Dom:'یکشنبه',
    lun:'دوشنبه',mar:'سه‌شنبه','mié':'چهارشنبه',jue:'پنجشنبه',vie:'جمعه','sáb':'شنبه',dom:'یکشنبه','a. m.':'ق.ظ','p. m.':'ب.ظ',k:'هزار' };
  var keys = Object.keys(P).sort(function (a, b) { return b.length - a.length });
  var reW = new RegExp('(^|[^A-Za-zÁÉÍÓÚáéíóúñÑü])(' + Object.keys(W).sort(function (a, b) { return b.length - a.length }).map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }).join('|') + ')(?=$|[^A-Za-zÁÉÍÓÚáéíóúñÑü])', 'g');
  var FD = '۰۱۲۳۴۵۶۷۸۹';
  function digits(s) { return s.replace(/\d/g, function (d) { return FD[d] }) }
  function tr(s) {
    var t = s.trim(); if (!t || !/[A-Za-zÁÉÍÓÚáéíóúñ]/.test(t)) return /\d/.test(s) ? digits(s) : s;
    if (Object.prototype.hasOwnProperty.call(P, t)) return s.replace(t, P[t]);
    if (Object.prototype.hasOwnProperty.call(SHORT, t)) return s.replace(t, SHORT[t]);
    var out = s;
    for (var i = 0; i < keys.length; i++) if (keys[i].length > 6 && out.indexOf(keys[i]) >= 0) out = out.split(keys[i]).join(P[keys[i]]);
    out = out.replace(reW, function (m, pre, w) { return pre + W[w] });
    out = out.replace(/ {2,}/g, ' ').replace(/ ([,.:·])/g, '$1');
    return digits(out);
  }
  var busy = false;
  function walk(node) {
    if (node.nodeType === 3) { var p = node.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|CODE)$/.test(p.nodeName) || p.isContentEditable) return; var v = node.nodeValue, n = tr(v); if (n !== v) node.nodeValue = n; return }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(node.nodeName)) return;
    ['placeholder', 'aria-label', 'title', 'alt'].forEach(function (a) { var v = node.getAttribute(a); if (v) { var n = tr(v); if (n !== v) node.setAttribute(a, n) } });
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  function run() { busy = true; try { walk(document.body) } finally { busy = false } }
  root.lang = 'fa';
  var mo = new MutationObserver(function (ms) {
    if (busy) return; busy = true;
    try { ms.forEach(function (m) { if (m.type === 'characterData') walk(m.target); else if (m.type === 'attributes') walk(m.target); else m.addedNodes.forEach(walk) }) } finally { busy = false }
  });
  function start() { run(); fit(); mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title', 'alt'] }); setTimeout(fit, 600); addEventListener('resize', fit) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // AIDE theme (dark/light) is sent by the parent tab
  addEventListener('message', function (e) { var d = e.data || {}; if (d.aideTheme) root.style.colorScheme = d.aideTheme });
})();
