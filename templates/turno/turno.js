/* =====================================================================
   Turno · Moxen
   Una agenda de horas para clínicas, consultas, peluquerías, estudios o
   cualquier servicio: eliges el día, la hora y confirmas. Un disco viaja
   con un resorte de un día al otro (un solo indicador que se comparte),
   el título del día gira como un tambor y las horas libres entran en
   cascada. Al elegir una hora, su píldora se parte en dos: la hora, ya
   oscura, y «Confirmar», que entra deslizándose desde la derecha. Al
   confirmar, la tarjeta pasa a la reserva con un ✓ verde que se dibuja,
   «Agregar al calendario» (un .ics) y «Agendar otra».

     const t = Turno(document.querySelector('[data-turno]'), {
       hoy: '2026-11-09',                 // la fecha de hoy, AAAA-MM-DD (la pones tú)
       duracion: 30,                      // minutos de cada turno
       horas: (fecha, { semana }) => ['09:00', '09:30', '10:30'],   // las libres de ese día
       alReservar: ({ fecha, hora, fin }) => { … },
     });
     t.elige('2026-11-12');   t.reinicia();

   Los días sin horas (y los pasados) no se pueden elegir. Teclado:
   flechas por los días, Re Pág / Av Pág cambian de mes, Intro elige;
   en las horas, Tab o flechas, Intro elige y otra vez Intro confirma.
   Todo lo que se mueve es transform, opacity o clip-path. Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  /* ── las fechas, a mano ───────────────────────────────────────────
     Cada día es un número entero (días desde el 1-1-1970) y todo se
     cuenta con aritmética: sin husos horarios que corran un día, y el
     «hoy» lo decides tú (del servidor, por ejemplo). */
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  const bisiesto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const diasDelMes = (a, m) => [31, bisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  // Sakamoto, con la semana que empieza el lunes: 0 = lunes … 6 = domingo
  function diaSemana(a, m, d) {
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    if (m < 3) a -= 1;
    return ((a + Math.floor(a / 4) - Math.floor(a / 100) + Math.floor(a / 400) + t[m - 1] + d) % 7 + 6) % 7;
  }
  // de año, mes y día a número de día, y de vuelta (los «días civiles» de H. Hinnant)
  function aNumero(a, m, d) {
    a -= m <= 2 ? 1 : 0;
    const era = Math.floor(a / 400), ae = a - era * 400;
    const dia = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    return era * 146097 + ae * 365 + Math.floor(ae / 4) - Math.floor(ae / 100) + dia - 719468;
  }
  function aFecha(n) {
    n += 719468;
    const era = Math.floor(n / 146097), de = n - era * 146097;
    const ae = Math.floor((de - Math.floor(de / 1460) + Math.floor(de / 36524) - Math.floor(de / 146096)) / 365);
    const da = de - (365 * ae + Math.floor(ae / 4) - Math.floor(ae / 100));
    const mp = Math.floor((5 * da + 2) / 153), m = mp < 10 ? mp + 3 : mp - 9;
    return { a: ae + era * 400 + (m <= 2 ? 1 : 0), m, d: da - Math.floor((153 * mp + 2) / 5) + 1 };
  }
  const dos = v => (v < 10 ? '0' : '') + v;
  const leeISO = s => { const p = String(s).split('-').map(Number); return aNumero(p[0], p[1], p[2]); };
  const aISO = n => { const f = aFecha(n); return f.a + '-' + dos(f.m) + '-' + dos(f.d); };
  const semanaDe = n => { const f = aFecha(n); return diaSemana(f.a, f.m, f.d); };
  const nombre = n => { const f = aFecha(n); return DIAS[semanaDe(n)] + ' ' + f.d + ' de ' + MESES[f.m - 1]; };
  const sumaMes = (v, k) => { const t = v.a * 12 + (v.m - 1) + k; return { a: Math.floor(t / 12), m: t % 12 + 1 }; };
  function otroMes(n, k) { const f = aFecha(n), v = sumaMes(f, k); return aNumero(v.a, v.m, Math.min(f.d, diasDelMes(v.a, v.m))); }
  // '10:30' + 30 minutos = '11:00'
  function sumaMinutos(h, min) { const p = h.split(':').map(Number), t = (p[0] * 60 + p[1] + min) % 1440; return dos(Math.floor(t / 60)) + ':' + dos(t % 60); }

  /* ── resortes ─────────────────────────────────────────────────────
     Uno por cada cosa que se mueve, con el paso real del cuadro (dt):
     así va igual a 60 que a 120 Hz. */
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, dt) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * dt; r.x += r.v * dt; }
  const parado = r => Math.abs(r.meta - r.x) < .002 && Math.abs(r.v) < .01;

  // un resorte convertido en curva CSS linear(), para lo que se mueve con CSS
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

  function Turno(raiz, opciones) {
    const o = Object.assign({ hoy: '2026-01-01', duracion: 30, horas: () => [], inicial: null, zona: 'America/Santiago', alReservar: null, alAgregar: null }, opciones);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const HOY = leeISO(o.hoy);
    const $ = s => raiz.querySelector(s);
    const caja = $('.to-meses'), tituloMes = $('.to-mes-titulo'), flechas = Array.from(raiz.querySelectorAll('[data-mover]'));
    const tituloDia = $('.to-dia-titulo'), subDia = $('.to-dia-sub'), horasCaja = $('.to-horas-caja');
    const columnas = Array.from(raiz.querySelectorAll('.to-col'));
    const listo = $('.to-listo'), cabezaListo = $('.to-listo h2'), detalle = $('.to-detalle'), otra = $('.to-otra'), agregar = $('.to-agregar');
    const movil = $('.to-confirma-movil');
    const servicio = ($('.to-servicio h2') || { textContent: 'Turno' }).textContent.trim();
    raiz.style.setProperty('--to-muelle', muelle(300, 22));

    // las horas libres de cada día se piden una vez (actualiza() las vuelve a pedir)
    let memoria = new Map();
    const libres = n => {
      if (!memoria.has(n)) memoria.set(n, n < HOY ? [] : (o.horas(aISO(n), { semana: semanaDe(n) }) || []).slice());
      return memoria.get(n);
    };
    function primerLibre(desde) { for (let n = desde; n < desde + 400; n++) if (libres(n).length) return n; return desde; }
    const INICIAL = o.inicial ? leeISO(o.inicial) : primerLibre(HOY);

    let vista = { a: aFecha(INICIAL).a, m: aFecha(INICIAL).m }, mes = null, elegido = null, hora = null, foco = INICIAL, ultimo = null;
    // el disco: columna y fila (con decimales mientras viaja) y su escala
    const X = resorte(0, 280, 23), Y = resorte(0, 280, 23), esc = resorte(0, 360, 20);
    const todos = [X, Y, esc];

    /* ── el mes ────────────────────────────────────────────────────── */
    function construyeMes(a, m) {
      const el = document.createElement('div');
      el.className = 'to-mes';
      const rejilla = document.createElement('div');
      rejilla.className = 'to-rejilla';
      rejilla.setAttribute('role', 'grid');
      rejilla.setAttribute('aria-label', MESES[m - 1] + ' de ' + a);
      const disco = document.createElement('span');
      disco.className = 'to-disco';
      disco.setAttribute('aria-hidden', 'true');
      disco.innerHTML = '<i></i>';
      rejilla.appendChild(disco);
      const primero = aNumero(a, m, 1), dias = diasDelMes(a, m), col0 = diaSemana(a, m, 1);
      const botones = new Map();
      for (let f = 0; f < 6; f++) {
        const fila = document.createElement('div');
        fila.className = 'to-fila-sem';
        fila.setAttribute('role', 'row');
        for (let c = 0; c < 7; c++) {
          const d = f * 7 + c - col0 + 1, celda = document.createElement('div');
          celda.setAttribute('role', 'gridcell');
          if (d >= 1 && d <= dias) {
            const n = primero + d - 1, hay = libres(n).length > 0;
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'to-dia'; b.tabIndex = -1; b.textContent = d;
            b.dataset.n = n; b.dataset.dia = aISO(n);
            b.setAttribute('aria-label', nombre(n) + (hay ? ', ' + libres(n).length + ' horas libres' : ', sin horas'));
            if (hay) b.classList.add('is-libre'); else b.setAttribute('aria-disabled', 'true');
            if (n === HOY) { b.classList.add('is-hoy'); b.setAttribute('aria-current', 'date'); }
            celda.setAttribute('aria-selected', 'false');
            celda.appendChild(b);
            botones.set(n, b);
          }
          fila.appendChild(celda);
        }
        rejilla.appendChild(fila);
      }
      el.appendChild(rejilla);
      return { el, a, m, primero, col0, botones, pos: disco, disco: disco.firstChild };
    }
    const lugar = n => { const d = n - mes.primero + mes.col0; return { c: d % 7, f: Math.floor(d / 7) }; };
    const enVista = n => !!mes && mes.botones.has(n);

    // al cambiar de mes, el viejo sale hacia un lado y el nuevo entra desde el otro
    function monta(dir) {
      const viejo = mes;
      mes = construyeMes(vista.a, vista.m);
      caja.appendChild(mes.el);
      gira(tituloMes, MESES[vista.m - 1] + ' ' + vista.a);
      flechas[0].disabled = aNumero(vista.a, vista.m, 1) <= HOY;
      if (viejo) {
        viejo.el.inert = true;
        if (dir && !reduce) {
          const como = { duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)' };
          viejo.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(' + (-dir * 34) + '%)', opacity: 0 }], Object.assign({ fill: 'forwards' }, como));
          mes.el.animate([{ transform: 'translateX(' + (dir * 34) + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], como);
          setTimeout(() => viejo.el.remove(), como.duration + 40);
        } else viejo.el.remove();
      }
      // el disco aparece en su sitio si el día elegido está en este mes; si no, no se ve
      if (elegido !== null && enVista(elegido)) { const p = lugar(elegido); X.x = X.meta = p.c; Y.x = Y.meta = p.f; esc.x = esc.meta = 1; }
      else { esc.x = esc.meta = 0; }
      X.v = Y.v = esc.v = 0;
      marca();
      pinta();
    }
    function desliza(k) {
      if (!k || (k < 0 && aNumero(vista.a, vista.m, 1) <= HOY)) return;
      vista = sumaMes(vista, k);
      monta(Math.sign(k));
      if (!enVista(foco)) foco = Math.max(HOY, mes.primero);
      marca();
    }

    /* ── el disco ──────────────────────────────────────────────────── */
    /* Mide una celda (1/7 del ancho, el alto de una semana) y se traslada
       en porcentajes de sí mismo: columna × 100 %, fila × 100 %. Mientras
       viaja se achica un poco con la velocidad, como una gota que corre. */
    function pinta() {
      if (!mes) return;
      const rapidez = Math.min(.14, Math.hypot(X.v, Y.v) * .012);
      mes.pos.style.transform = 'translate(' + (X.x * 100).toFixed(3) + '%,' + (Y.x * 100).toFixed(3) + '%)';
      mes.disco.style.transform = 'scale(' + Math.max(0, esc.x * (1 - (reduce ? 0 : rapidez))).toFixed(4) + ')';
    }
    let raf = 0, previo = 0;
    function anda() { if (!raf) { previo = 0; raf = requestAnimationFrame(cuadro); } }
    function cuadro(t) {
      const dt = previo ? Math.min(1 / 30, (t - previo) / 1000) : 0;
      previo = t;
      if (reduce) todos.forEach(r => { r.x = r.meta; r.v = 0; });
      else todos.forEach(r => avanza(r, dt));
      const quieto = todos.every(parado);
      if (quieto) todos.forEach(r => { r.x = r.meta; r.v = 0; });
      pinta();
      raf = quieto ? 0 : requestAnimationFrame(cuadro);
    }

    /* ── elegir el día ─────────────────────────────────────────────── */
    function eligeDia(n, forzar) {
      if (!libres(n).length || (n === elegido && !forzar)) return;
      if (!enVista(n)) { const f = aFecha(n); desliza((f.a - vista.a) * 12 + (f.m - vista.m)); }
      const p = lugar(n);
      // si el disco no estaba en este mes, nace en el día; si estaba, viaja
      if (esc.x < .05) { X.x = p.c; Y.x = p.f; X.v = Y.v = 0; }
      X.meta = p.c; Y.meta = p.f; esc.meta = 1;
      elegido = n; foco = n; hora = null;
      marca();
      muestraHoras(n);
      anda();
    }
    function marca() {
      if (!mes) return;
      mes.botones.forEach((b, n) => {
        b.tabIndex = n === foco ? 0 : -1;
        b.classList.toggle('is-elegido', n === elegido);
        b.parentNode.setAttribute('aria-selected', String(n === elegido));
      });
      if (!mes.botones.has(foco)) { const b = mes.botones.get(Math.max(HOY, mes.primero)); if (b) b.tabIndex = 0; }
    }

    /* ── las horas ─────────────────────────────────────────────────── */
    // la lista vieja se va hacia arriba; la nueva entra en cascada (el CSS escalona con --i)
    function muestraHoras(n) {
      const lista = libres(n);
      gira(tituloDia, nombre(n));
      subDia.textContent = lista.length + (lista.length === 1 ? ' hora libre' : ' horas libres') + ' · ' + o.duracion + ' min';
      horasCaja.querySelectorAll('.to-lista:not(.is-sale)').forEach(v => {
        v.classList.add('is-sale'); v.inert = true;
        setTimeout(() => v.remove(), 260);
      });
      const ul = document.createElement('ul');
      ul.className = 'to-lista';
      ul.setAttribute('aria-label', 'Horas libres del ' + nombre(n));
      if (!lista.length) ul.innerHTML = '<li class="to-vacio">No quedan horas este día.</li>';
      lista.forEach((h, i) => {
        const li = document.createElement('li');
        li.className = 'to-fila'; li.dataset.hora = h; li.style.setProperty('--i', i);
        li.innerHTML = '<button type="button" class="to-hora" aria-pressed="false"><span>' + h + '</span></button>' +
          '<button type="button" class="to-confirmar" tabindex="-1" aria-label="Confirmar ' + h + '">Confirmar</button>';
        ul.appendChild(li);
      });
      horasCaja.appendChild(ul);
      estadoMovil();
    }
    function eligeHora(fila) {
      const antes = horasCaja.querySelector('.to-fila.is-elegida');
      if (antes === fila) return;
      if (antes) suelta(antes);
      fila.classList.add('is-elegida');
      hora = fila.dataset.hora;
      fila.querySelector('.to-hora').setAttribute('aria-pressed', 'true');
      fila.querySelector('.to-confirmar').tabIndex = 0;
      estadoMovil();
    }
    function suelta(fila) {
      fila.classList.remove('is-elegida');
      fila.querySelector('.to-hora').setAttribute('aria-pressed', 'false');
      fila.querySelector('.to-confirmar').tabIndex = -1;
      hora = null;
      estadoMovil();
    }
    function estadoMovil() {
      if (!movil) return;
      movil.disabled = hora === null;
      movil.textContent = hora === null ? 'Elige una hora' : 'Confirmar ' + hora;
    }

    /* ── reservar y volver ────────────────────────────────────────── */
    function reserva() {
      if (hora === null || elegido === null) return;
      ultimo = { fecha: aISO(elegido), hora, fin: sumaMinutos(hora, o.duracion) };
      detalle.textContent = nombre(elegido) + ' · ' + hora + ' – ' + ultimo.fin;
      raiz.classList.add('is-reservado');
      columnas.forEach(c => { c.inert = true; });
      listo.removeAttribute('aria-hidden');
      listo.inert = false;
      setTimeout(() => cabezaListo.focus({ preventScroll: true }), reduce ? 0 : 450);
      if (o.alReservar) o.alReservar(ultimo);
    }
    function reinicia() {
      raiz.classList.remove('is-reservado');
      columnas.forEach(c => { c.inert = false; });
      listo.setAttribute('aria-hidden', 'true');
      listo.inert = true;
      hora = null;
      // vuelve al día del principio: el disco viaja y sus horas entran otra vez
      const f = aFecha(INICIAL);
      if (f.a !== vista.a || f.m !== vista.m) { vista = { a: f.a, m: f.m }; monta(0); }
      eligeDia(INICIAL, true);
      const b = mes.botones.get(INICIAL);
      if (b) b.focus({ preventScroll: true });
    }
    // «Agregar al calendario»: un archivo .ics con la hora local de la zona
    function agregaCalendario() {
      if (!ultimo) return;
      if (o.alAgregar) { o.alAgregar(ultimo); return; }
      const dia = ultimo.fecha.replace(/-/g, ''), hh = h => h.replace(':', '') + '00';
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Turno//ES', 'BEGIN:VEVENT',
        'UID:' + dia + 'T' + hh(ultimo.hora) + '-turno', 'DTSTAMP:' + o.hoy.replace(/-/g, '') + 'T000000Z',
        'DTSTART;TZID=' + o.zona + ':' + dia + 'T' + hh(ultimo.hora), 'DTEND;TZID=' + o.zona + ':' + dia + 'T' + hh(ultimo.fin),
        'SUMMARY:' + servicio, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'turno-' + ultimo.fecha + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // el texto que cambia gira como un tambor: el viejo sale por arriba, el nuevo entra de abajo
    function gira(caja, texto) {
      const viejo = caja.lastElementChild;
      if (viejo && viejo.textContent === texto) return;
      const nuevo = document.createElement('span');
      nuevo.textContent = texto;
      caja.appendChild(nuevo);
      if (!viejo) return;
      nuevo.classList.add('is-entra');
      viejo.classList.add('is-sale');
      setTimeout(() => viejo.remove(), 400);
    }

    /* ── ratón, dedo y teclado ────────────────────────────────────── */
    const diaDe = e => { const b = e.target.closest && e.target.closest('.to-dia'); return b && !b.closest('[inert]') ? +b.dataset.n : null; };
    caja.addEventListener('click', e => { const n = diaDe(e); if (n !== null) eligeDia(n); });
    caja.addEventListener('keydown', e => {
      const n = diaDe(e);
      if (n === null) return;
      const w = semanaDe(n);
      const a = { ArrowLeft: n - 1, ArrowRight: n + 1, ArrowUp: n - 7, ArrowDown: n + 7, Home: n - w, End: n + 6 - w, PageUp: otroMes(n, -1), PageDown: otroMes(n, 1) }[e.key];
      if (a === undefined) return;
      e.preventDefault();
      foco = Math.max(a, HOY);
      if (!enVista(foco)) { const f = aFecha(foco); desliza((f.a - vista.a) * 12 + (f.m - vista.m)); }
      marca();
      const b = mes.botones.get(foco);
      if (b) b.focus({ preventScroll: true });
    });
    flechas.forEach(b => b.addEventListener('click', () => desliza(+b.dataset.mover)));
    horasCaja.addEventListener('click', e => {
      if (e.target.closest('.to-confirmar')) { reserva(); return; }
      const b = e.target.closest('.to-hora');
      if (b) eligeHora(b.parentNode);
    });
    horasCaja.addEventListener('keydown', e => {
      const b = e.target.closest('.to-hora, .to-confirmar');
      if (!b) return;
      const fila = b.parentNode;
      if (e.key === 'Enter' && b.classList.contains('to-hora') && fila.classList.contains('is-elegida')) { e.preventDefault(); reserva(); return; }
      if (e.key === 'Escape' && fila.classList.contains('is-elegida')) { suelta(fila); fila.querySelector('.to-hora').focus(); return; }
      // flechas: arriba y abajo de una en una (o de a una fila en la rejilla del teléfono)
      const horas = Array.from(horasCaja.querySelectorAll('.to-lista:not(.is-sale) .to-hora'));
      const cols = getComputedStyle(fila.parentNode).display === 'grid' ? 3 : 1;
      const paso = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!paso || (cols === 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft'))) return;
      e.preventDefault();
      const i = horas.indexOf(fila.querySelector('.to-hora'));
      const sig = horas[Math.max(0, Math.min(horas.length - 1, i + paso))];
      if (sig) sig.focus();
    });
    if (movil) movil.addEventListener('click', reserva);
    otra.addEventListener('click', reinicia);
    agregar.addEventListener('click', agregaCalendario);

    /* ── arranque ─────────────────────────────────────────────────── */
    listo.setAttribute('aria-hidden', 'true');
    listo.inert = true;
    monta(0);
    eligeDia(INICIAL, true);
    todos.forEach(r => { r.x = r.meta; r.v = 0; });
    pinta();

    return {
      elige: fecha => eligeDia(leeISO(fecha), true),
      reserva, reinicia,
      // vuelve a pedir las horas libres (si cambiaron en tu servidor)
      actualiza: () => { memoria = new Map(); monta(0); if (elegido !== null) muestraHoras(elegido); },
      valor: () => (hora === null ? null : { fecha: aISO(elegido), hora, fin: sumaMinutos(hora, o.duracion) }),
    };
  }

  window.Turno = Turno;
})();
