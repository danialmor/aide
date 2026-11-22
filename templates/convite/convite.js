/* =====================================================================
   Convite · Moxen
   Una tarjeta de evento con plazas, la hora del lugar y la tuya, un recordatorio y «Añadir al calendario» (un archivo
   .ics de verdad o un enlace). Sirve para la ficha de un evento, una invitación a una charla, una apertura, un
   seminario web o cualquier cita con aforo.

   · La fecha es una hoja de calendario. «Asistiré» (o la tecla A) enciende la siguiente plaza en dorado —cada plaza es
     una pastilla de la barra—, hace rodar «Quedan 12» hasta «Quedan 11» y vuelve el botón «Asistirás ✓» dorado. A la vez
     se activa el recordatorio y su campana se balancea.
   · «Añadir al calendario» abre tres opciones (archivo .ics, enlace o texto). Al elegir una, la hoja de fecha se
     desprende, se levanta, cruza la tarjeta en un arco y el ícono de calendario la absorbe con un pliegue: queda con el
     día escrito y un ✓. La hoja nace otra vez en su sitio. El .ics se genera de verdad en el navegador (VEVENT, la hora
     en UTC y una alarma según el recordatorio) y se descarga.
   · El conmutador «Mi hora» abre «19:00 allí · 14:00 aquí»: la segunda hora se despliega y sus dígitos ruedan como los de un
     contador desde la hora del evento hasta la tuya.
   · El recordatorio es una píldora con tres momentos (1 día, 1 hora, 10 min) y un indicador dorado que se desliza con
     un resorte; solo se activa al asistir. Cancelar la asistencia devuelve la tarjeta a como estaba.
   · Teclado: A asiste, C abre el calendario, M cambia «Mi hora»; en el recordatorio, ← → eligen; en el menú, ↑ ↓ y Esc.
     Movimiento reducido: todo cambia de golpe, sin vuelo.

   Montaje (se inicia con la llamada de index.html; el HTML de esta demo es la plantilla):
     const c = Convite(document.querySelector('[data-convite]'), {
       evento: EVENTO,                 // título, fecha, hora, duración, lugar, plazas y el enlace
       alAsistir: ({ asiste }) => {},  // cada vez que se asiste o se cancela
       alAnadir: ({ via, ics }) => {}, // «ics», «enlace» o «texto»; «ics» trae el texto del archivo
     });
     c.asiste(true);  c.anade('ics');  c.hora(false);  c.recuerda('1h');  c.restablece();

   Qué cambia qué: EVENTO (todo lo que se lee y se exporta; el huso del lugar es «gmt» y el tuyo, «tu.gmt»: en la demo
   está fijo para que se vea igual en todas partes, y con tu: 'auto' lo toma del navegador); los colores, al principio de
   convite.css (--cv-dorado es lo que confirma, --cv-vino la hoja de fecha); la foto, img/galeria-cuadros.jpg. Sin
   dependencias; el tiempo viene de timers, Web Animations y transiciones CSS (nada de Date para animar: Date solo
   sirve para convertir las horas y sellar el .ics): la página y el vídeo coinciden.
   ===================================================================== */
(function () {
  'use strict';

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const quieto = () => mq.matches;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));

  /* Un resorte convertido en curva `linear()`: sirve para CSS y para Web Animations. */
  function muelle(k, c) {
    const pts = [0];
    let x = 0, v = 0, t = 0;
    while (t < 3) {
      v += (k * (1 - x) - c * v) / 240; x += v / 240; t += 1 / 240;
      pts.push(x);
      if (t > .15 && Math.abs(1 - x) < .001 && Math.abs(v) < .01) break;
    }
    const out = [];
    for (let i = 0; i <= 40; i++) out.push(pts[Math.round(i / 40 * (pts.length - 1))].toFixed(4));
    out[40] = '1';
    return 'linear(' + out.join(', ') + ')';
  }
  const h = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const CURVA = 'cubic-bezier(.22, 1, .36, 1)';
  const p2 = n => String(n).padStart(2, '0');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /* ── el evento de ejemplo (todo inventado) ───────────────────────── */
  const EVENTO = {
    titulo: 'Paisajes en tinta',
    descripcion: 'Una noche con brindis de apertura y visita guiada a la colección, en la sala principal.',
    lugar: 'Sala de exposiciones, planta baja',
    fecha: '2026-11-19', hora: '19:00', duracion: 120,     // minutos
    gmt: 1,                                                // el huso del lugar
    tu: { gmt: -4 },                                       // el tuyo: fijo en la demo; 'auto' lo toma del navegador
    capacidad: 30, ocupadas: 18,
    enlace: 'https://ejemplo.dev/eventos/paisajes-en-tinta',
    archivo: 'paisajes-en-tinta.ics',
  };
  const AVISOS = { '1d': ['-P1D', 'un día antes'], '1h': ['-PT1H', 'una hora antes'], '10m': ['-PT10M', '10 minutos antes'] };

  /* ── el archivo .ics ─────────────────────────────────────────────── */
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const dobla = l => { let o = ''; while (l.length > 70) { o += l.slice(0, 70) + '\r\n '; l = l.slice(70); } return o + l; };
  const fmtUTC = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  function construyeIcs(ev, aviso, gmt) {
    const [y, m, d] = ev.fecha.split('-').map(Number), [hh, mm] = ev.hora.split(':').map(Number);
    const ini = Date.UTC(y, m - 1, d, hh, mm) - gmt * 3600000, fin = ini + ev.duracion * 60000;
    const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moxen//Convite//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + ev.archivo.replace(/\.ics$/, '') + '-' + fmtUTC(ini) + '@convite', 'DTSTAMP:' + fmtUTC(Date.now()), 'DTSTART:' + fmtUTC(ini), 'DTEND:' + fmtUTC(fin),
      'SUMMARY:' + esc(ev.titulo), 'LOCATION:' + esc(ev.lugar), 'DESCRIPTION:' + esc(ev.descripcion + ' ' + ev.enlace), 'URL:' + ev.enlace];
    if (aviso) lineas.push('BEGIN:VALARM', 'TRIGGER:' + AVISOS[aviso][0], 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(ev.titulo), 'END:VALARM');
    lineas.push('END:VEVENT', 'END:VCALENDAR');
    return lineas.map(dobla).join('\r\n') + '\r\n';
  }
  function copiaTexto(txt) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).catch(() => {}); return; }
    } catch (e) { /* sigue con el método antiguo */ }
    try {
      const t = h('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0;left:-9999px'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    } catch (e) { /* sin portapapeles: la tarjeta responde igual */ }
  }

  function Convite(raiz, opciones) {
    const op = Object.assign({ evento: EVENTO, alAsistir: null, alAnadir: null }, opciones);
    const ev = op.evento;
    const $ = (s, r) => (r || raiz).querySelector(s);
    const el = {
      foto: $('.cv-foto'), hoja: $('[data-hoja]'), hMes: $('[data-h-mes]'), hDia: $('[data-h-dia]'), hSem: $('[data-h-sem]'),
      horas: $('[data-horas]'), relojA: $('[data-reloj-a]'), relojB: $('[data-reloj-b]'), sw: $('[data-sw]'),
      plazas: $('[data-plazas]'), quedan: $('[data-quedan]'), quedanN: $('[data-quedan-n]'), quedanT: $('[data-quedan-t]'),
      aviso: $('[data-aviso]'), campana: $('[data-campana]'), avT: $('[data-av-t]'), seg: $('[data-seg]'), segI: $('.cv-seg-i'),
      asistir: $('[data-asistir]'), cal: $('[data-cal]'), ico: $('[data-ico]'), icoDia: $('[data-ico-dia]'), menu: $('[data-menu]'), vivo: $('[data-vivo]'),
    };
    const EASE = muelle(250, 21);
    raiz.style.setProperty('--cv-muelle', muelle(250, 21));
    const anuncia = t => { el.vivo.textContent = ''; setTimeout(() => { el.vivo.textContent = t; }, 30); };
    const E = { asiste: false, cal: false, mi: true, aviso: '1d', menu: false, vuelo: 0 };

    /* ── la fecha y las dos horas ──────────────────────────────────── */
    const [fy, fm, fd] = ev.fecha.split('-').map(Number);
    const dow = new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay();
    el.hMes.textContent = MESES[fm - 1].slice(0, 3); el.hDia.textContent = String(fd); el.hSem.textContent = DIAS[dow];
    el.icoDia.textContent = String(fd);
    const tuGmt = ev.tu === 'auto' || (ev.tu && ev.tu.gmt === 'auto') ? -new Date().getTimezoneOffset() / 60 : (ev.tu && ev.tu.gmt != null ? ev.tu.gmt : ev.gmt);
    const [eh, em] = ev.hora.split(':').map(Number);
    const minAqui = eh * 60 + em + Math.round((tuGmt - ev.gmt) * 60), diaAqui = Math.floor(minAqui / 1440), mAqui = ((minAqui % 1440) + 1440) % 1440;
    const horaAlli = ev.hora, horaAqui = p2(Math.floor(mAqui / 60)) + ':' + p2(mAqui % 60);
    $('small', el.relojB.parentNode).textContent = 'aquí' + (diaAqui ? (diaAqui > 0 ? ' · día siguiente' : ' · día anterior') : '');
    $('.cv-titulo, #cv-titulo', raiz).textContent = ev.titulo;
    $('.cv-lede', raiz).textContent = ev.descripcion;
    $('.cv-lugar', raiz).firstChild.textContent = ev.lugar.split(',')[0];
    $('.cv-lugar small', raiz).textContent = ev.lugar.split(',').slice(1).join(',').trim() + ', entrada por el patio';

    /* Un reloj con dígitos que ruedan: cada cifra es una columna de 0 a 9 que sube o baja hasta la nueva. */
    function reloj(span, txt) {
      span.textContent = ''; span.setAttribute('aria-label', txt);
      const cols = [];
      [].forEach.call(txt, ch => {
        if (/\d/.test(ch)) {
          const d = h('span', 'cv-d'), c = h('span', 'cv-d-c');
          for (let i = 0; i < 10; i++) c.appendChild(h('span', null, String(i)));
          c.style.transform = 'translateY(' + (-ch) + 'em)'; d.appendChild(c); span.appendChild(d); cols.push({ c, v: +ch });
        } else span.appendChild(h('span', 'cv-sep', ch));
      });
      return {
        pon(t, anima) {
          const ds = t.replace(/\D/g, '');
          span.setAttribute('aria-label', t);
          cols.forEach((col, i) => {
            const to = +ds[i];
            if (to === col.v) return;
            const de = col.v; col.v = to;
            col.c.style.transform = 'translateY(' + (-to) + 'em)';
            if (anima && !quieto()) col.c.animate([{ transform: 'translateY(' + (-de) + 'em)' }, { transform: 'translateY(' + (-to) + 'em)' }], { duration: 760 + i * 110, easing: CURVA });
          });
        },
      };
    }
    const rA = reloj(el.relojA, horaAlli), rB = reloj(el.relojB, horaAqui);
    function hora(on, anima) {
      E.mi = on == null ? !E.mi : !!on;
      el.sw.setAttribute('aria-checked', E.mi ? 'true' : 'false');
      el.horas.dataset.mi = E.mi ? '1' : '0';
      if (E.mi) { rB.pon(horaAlli, false); setTimeout(() => rB.pon(horaAqui, true), anima === false || quieto() ? 0 : 160); }
      else rB.pon(horaAlli, true);          // al cerrarse, vuelve a rodar hasta la hora del lugar
      anuncia(E.mi ? 'Mostrando tu hora: ' + horaAqui + '.' : 'Mostrando solo la hora del lugar.');
    }
    el.horas.dataset.mi = '1';

    /* ── las plazas ────────────────────────────────────────────────── */
    const pastillas = [];
    for (let i = 0; i < ev.capacidad; i++) { const p = h('i', i < ev.ocupadas ? 'is-oc' : ''); el.plazas.appendChild(p); pastillas.push(p); }
    function rueda(span, v) {
      const txt = String(v);
      if (span.textContent === txt) return;
      const hubo = span.textContent !== '';
      span.textContent = txt;
      if (hubo && !quieto()) span.animate([{ translate: '0 70%', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 480, easing: EASE });
    }
    function pintaPlazas(anima) {
      const tuya = ev.ocupadas;                       // la plaza que se enciende al asistir es la siguiente libre
      pastillas.forEach((p, i) => {
        const esTuya = E.asiste && i === tuya;
        if (esTuya && !p.classList.contains('is-tuya') && anima && !quieto()) { p.classList.remove('is-pop'); void p.offsetWidth; p.classList.add('is-pop'); setTimeout(() => p.classList.remove('is-pop'), 800); }
        p.classList.toggle('is-tuya', esTuya);
      });
      const quedan = ev.capacidad - ev.ocupadas - (E.asiste ? 1 : 0);
      rueda(el.quedanN, quedan);
      el.quedanT.textContent = E.asiste ? '· una es tuya' : '';
      el.plazas.setAttribute('aria-label', (ev.ocupadas + (E.asiste ? 1 : 0)) + ' de ' + ev.capacidad + ' plazas ocupadas');
    }

    /* ── el recordatorio ───────────────────────────────────────────── */
    const botonesR = [].slice.call(el.seg.querySelectorAll('button'));
    function mideSeg() {
      const b = botonesR.find(x => x.getAttribute('aria-checked') === 'true');
      if (!b) return;
      el.seg.style.setProperty('--x', b.offsetLeft + 'px'); el.seg.style.setProperty('--w', b.offsetWidth + 'px');
    }
    function suena() { el.campana.classList.remove('is-suena'); void el.campana.offsetWidth; if (!quieto()) el.campana.classList.add('is-suena'); }
    function recuerda(r, desdeUsuario) {
      if (!AVISOS[r]) return;
      E.aviso = r;
      botonesR.forEach(b => { const on = b.dataset.r === r; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on && E.asiste ? 0 : -1; });
      mideSeg();
      if (desdeUsuario) { suena(); anuncia('Te avisaremos ' + AVISOS[r][1] + '.'); }
    }
    function activaAviso(on) {
      el.aviso.dataset.activo = on ? '1' : '0';
      el.avT.textContent = on ? 'Avisarme' : 'Aviso al asistir';
      botonesR.forEach(b => { b.disabled = !on; b.tabIndex = on && b.getAttribute('aria-checked') === 'true' ? 0 : -1; });
      if (on) suena();
    }
    botonesR.forEach(b => b.addEventListener('click', () => { if (E.asiste) recuerda(b.dataset.r, true); }));
    el.seg.addEventListener('keydown', ev2 => {
      if (!E.asiste || (ev2.key !== 'ArrowLeft' && ev2.key !== 'ArrowRight')) return;
      const i = botonesR.findIndex(b => b.getAttribute('aria-checked') === 'true'), n = lim(i + (ev2.key === 'ArrowRight' ? 1 : -1), 0, botonesR.length - 1);
      ev2.preventDefault(); recuerda(botonesR[n].dataset.r, true); botonesR[n].focus();
    });

    /* ── asistir ───────────────────────────────────────────────────── */
    function asiste(on) {
      E.asiste = on == null ? !E.asiste : !!on;
      el.asistir.setAttribute('aria-pressed', E.asiste ? 'true' : 'false');
      el.asistir.setAttribute('aria-label', E.asiste ? 'Asistirás. Pulsa para cancelar la asistencia.' : 'Asistiré');
      if (E.asiste && !quieto()) { el.asistir.classList.remove('is-salta'); void el.asistir.offsetWidth; el.asistir.classList.add('is-salta'); }
      pintaPlazas(true);
      activaAviso(E.asiste);
      if (!E.asiste) { recuerda('1d'); quitaCal(); }
      else mideSeg();
      anuncia(E.asiste ? 'Asistirás. Quedan ' + (ev.capacidad - ev.ocupadas - 1) + ' plazas.' : 'Cancelaste tu asistencia.');
      if (op.alAsistir) op.alAsistir({ asiste: E.asiste });
    }

    /* ── el menú del calendario ────────────────────────────────────── */
    const opciones2 = [].slice.call(el.menu.querySelectorAll('button'));
    opciones2.forEach((b, i) => b.style.setProperty('--i', i));
    function abreMenu(on) {
      if (on === E.menu) return;
      E.menu = on;
      el.cal.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) { el.menu.hidden = false; el.menu.classList.remove('is-cierra'); }
      else { el.menu.classList.add('is-cierra'); setTimeout(() => { if (!E.menu) { el.menu.hidden = true; el.menu.classList.remove('is-cierra'); } }, quieto() ? 0 : 230); }
    }
    el.cal.addEventListener('click', () => { abreMenu(!E.menu); if (E.menu) setTimeout(() => opciones2[0].focus({ preventScroll: true }), 60); });
    document.addEventListener('pointerdown', e => { if (E.menu && !el.menu.contains(e.target) && !el.cal.contains(e.target)) abreMenu(false); });
    el.menu.addEventListener('keydown', e => {
      const i = opciones2.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); opciones2[(i + 1) % opciones2.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); opciones2[(i - 1 + opciones2.length) % opciones2.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); abreMenu(false); el.cal.focus(); }
      else if (e.key === 'Tab') abreMenu(false);
    });
    opciones2.forEach(b => b.addEventListener('click', () => anade(b.dataset.op)));

    /* La hoja de fecha viaja al ícono: se levanta, cruza en arco y el ícono la absorbe con un pliegue. */
    function vuela(fin) {
      const o = el.hoja.getBoundingClientRect(), d = el.ico.getBoundingClientRect();
      const w = el.hoja.offsetWidth, hh = el.hoja.offsetHeight;
      const cx0 = o.left + o.width / 2, cy0 = o.top + o.height / 2, cx1 = d.left + d.width / 2, cy1 = d.top + d.height / 2;
      const dx = cx1 - cx0, dy = cy1 - cy0, k = d.width / w;
      const clon = el.hoja.cloneNode(true);
      clon.className = 'cv-vuelo'; clon.removeAttribute('data-hoja');
      clon.style.cssText = 'left:' + (cx0 - w / 2) + 'px;top:' + (cy0 - hh / 2) + 'px;width:' + w + 'px;height:' + hh + 'px;';
      raiz.appendChild(clon);
      const tok = ++E.vuelo;
      el.foto.classList.add('is-ido');
      const T = (x, y, r, s, sy) => 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px) rotate(' + r + 'deg) scale(' + s + ', ' + (sy == null ? s : sy) + ')';
      const D = 1250;
      const a = clon.animate([
        { transform: T(0, 0, -3, 1), opacity: 1, easing: 'cubic-bezier(.3, 0, .2, 1)' },
        { transform: T(0, -16, -9, 1.12), opacity: 1, offset: .12, easing: 'cubic-bezier(.45, 0, .2, 1)' },
        { transform: T(dx * .46, dy * .46 - 150, 13, .74), offset: .58, easing: 'cubic-bezier(.5, 0, .3, 1)' },
        { transform: T(dx, dy, 3, k * 1.15), offset: .86 },
        { transform: T(dx, dy, 0, k, k), opacity: 1, offset: .91, easing: 'ease-in' },
        { transform: T(dx, dy + 3, 0, k, .02), opacity: 0, offset: 1 }], { duration: D, fill: 'forwards' });
      setTimeout(() => { if (tok === E.vuelo) { el.ico.classList.remove('is-pliega'); void el.ico.offsetWidth; el.ico.classList.add('is-pliega'); } }, D * .88);
      a.onfinish = () => { clon.remove(); if (tok === E.vuelo) fin(); };
      // la hoja de fecha nace otra vez en su sitio
      setTimeout(() => { el.foto.classList.remove('is-ido'); el.foto.classList.add('is-nace'); setTimeout(() => el.foto.classList.remove('is-nace'), 1000); }, D + 700);
    }
    function marcaCal() { E.cal = true; el.cal.classList.add('is-hecho'); }
    function quitaCal() {
      E.cal = false; E.vuelo++; el.cal.classList.remove('is-hecho'); el.cal.removeAttribute('aria-disabled');
      el.foto.classList.remove('is-ido'); [].forEach.call(raiz.querySelectorAll('.cv-vuelo'), n => n.remove());
      el.cal.setAttribute('aria-label', 'Añadir al calendario'); abreMenu(false);
    }
    function anade(via) {
      abreMenu(false);
      const aviso = E.asiste ? E.aviso : null;
      let ics = null, msg;
      if (via === 'ics') {
        ics = construyeIcs(ev, aviso, ev.gmt);
        try {
          const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
          const a = h('a'); a.href = url; a.download = ev.archivo; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch (e) { /* sin descarga: la tarjeta responde igual */ }
        msg = 'Archivo .ics descargado.';
      } else if (via === 'enlace') { copiaTexto(ev.enlace); msg = 'Enlace copiado.'; }
      else {
        copiaTexto(ev.titulo + '\n' + DIAS[dow][0].toUpperCase() + DIAS[dow].slice(1) + ' ' + fd + ' de ' + MESES[fm - 1] + ' de ' + fy + ', ' + horaAlli + ' (hora del lugar) · ' + horaAqui + ' (tu hora)\n' + ev.lugar + '\n' + ev.enlace);
        msg = 'Texto copiado.';
      }
      if (!E.cal && !quieto()) {
        el.cal.setAttribute('aria-disabled', 'true');
        vuela(() => { marcaCal(); el.cal.removeAttribute('aria-disabled'); });
        const tok = E.vuelo;
        setTimeout(() => { if (tok === E.vuelo) el.cal.classList.add('is-hecho'); }, 1250 * .9);     // el texto cambia justo cuando se pliega
      } else if (!E.cal) marcaCal();
      else if (!quieto()) { el.ico.classList.remove('is-pliega'); void el.ico.offsetWidth; el.ico.classList.add('is-pliega'); }
      anuncia(msg + ' Está en tu calendario.');
      if (op.alAnadir) op.alAnadir({ via, ics });
    }

    /* ── ratón, dedo y teclado ─────────────────────────────────────── */
    el.asistir.addEventListener('click', () => asiste());
    el.sw.addEventListener('click', () => hora());
    document.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'a') { e.preventDefault(); asiste(); }
      else if (k === 'c') { e.preventDefault(); el.cal.click(); }
      else if (k === 'm') { e.preventDefault(); hora(); }
    });

    function restablece() {
      E.asiste = false; E.cal = false;
      el.asistir.setAttribute('aria-pressed', 'false'); el.asistir.setAttribute('aria-label', 'Asistiré');
      pintaPlazas(false); activaAviso(false); recuerda('1d'); quitaCal(); el.foto.classList.remove('is-ido');
      [].forEach.call(raiz.querySelectorAll('.cv-vuelo'), n => n.remove());
    }

    pintaPlazas(false); activaAviso(false); recuerda('1d');
    rB.pon(horaAqui, false);
    el.quedanN.textContent = String(ev.capacidad - ev.ocupadas);
    // las medidas del indicador dependen de la tipografía: se vuelven a tomar al cargarla y al cambiar el tamaño
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mideSeg);
    window.addEventListener('resize', mideSeg);
    mideSeg();

    return { asiste, anade, hora, recuerda: r => recuerda(r, true), restablece, estado: () => Object.assign({}, E) };
  }

  window.Convite = Convite;
})();
