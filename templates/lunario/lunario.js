/* =====================================================================
   Lunario · Moxen
   El mes de un calendario con los eventos de varios días bien colocados. Los largos son barras que cruzan celdas y siguen en la
   semana siguiente con un corte en pico; los de una hora, un punto con su hora; cada día enseña lo que cabe según el alto de su
   semana y un «+3 más» abre el día entero en un globo. Arrastrar una barra la cambia de días y todo se vuelve a colocar con FLIP;
   estirar su borde cambia la duración; al bajar o subir el cordón del alto caben más o menos carriles y los «+N» se recalculan.
   Cada semana lleva en su cabecera la fase de la luna, dibujada con la fecha. Al soltar sin que dos barras se pisen, un ✓ ámbar.

   Funciona de verdad (nada simulado salvo los 40 eventos de ejemplo de DATOS):
   · Carriles por semana. Cada evento se parte por semanas; en cada una se ordena por inicio, luego por duración (los largos antes)
     y por hora, y se le da el primer carril libre a lo largo de todo su tramo. Un evento de 9 días cae en dos semanas, con un corte
     en pico donde se parte.
   · Lo que cabe. Un ResizeObserver mide el alto de cada semana y de él sale cuántos carriles entran (--lu-num, --lu-paso y --lu-pie
     son la fuente: el script las lee del CSS). Si en un día algo no cabe, su último carril pasa a ser «+N más»; ese día se parte
     la barra (con otro corte) y en cada día los eventos que se ven más el N suman siempre los que tiene.
   · El primer día de la semana sale de la región: new Intl.Locale(región).getWeekInfo() (o .weekInfo), con una tabla propia si
     el navegador no lo trae; el rótulo dice cuál de las dos se usó.
   · La fase de la luna se calcula con la fecha: la elongación de la luna respecto del sol sale de los argumentos medios (D, M, M')
     y de sus términos principales, con un error de menos de una hora en una luna nueva o llena; de ahí salen la iluminación, el
     nombre y el trazo del terminador, y el día de la nueva o la llena es aquel por el que la elongación cruza 0° o 180°. Sin Date:
     las fechas son números de día (algoritmo de días-desde-civil) y el mes es fijo, octubre de 2026.
   · «Solapes» no es un cartel: mide con offsetLeft/Top/Width/Height cada par de barras de cada semana y cuenta las que
     se cruzan; el ✓ se sella cuando esa medida da 0. «Comprobar altos y regiones» lo repite en las 3 regiones y en todos los altos.

   Cómo se monta (ver index.html): se inicia solo sobre [data-lunario].
     const l = Lunario(document.querySelector('[data-lunario]'));
     l.region('en-US');  l.alto(520);  l.mueve(0, 3);  l.verifica();  l.estado();
   Teclado: cada evento es un botón (flechas: ← → mueven un día, ↑ ↓ una semana, Mayús+← → estiran o encogen el final); «+N más» abre
   el día (Esc cierra y devuelve el foco); el cordón del alto, con ↑ ↓; las regiones, con ← →; R lo reinicia todo. Qué se personaliza:
   los colores, al principio de lunario.css (--lu-ambar es la marca; --lu-o, --lu-t, --lu-a y --lu-u son las categorías); los eventos,
   en DATOS; el mes, en BASE. El tiempo sale de requestAnimationFrame, setTimeout y la Web Animations API; lo que se limpia al terminar
   una animación va con un setTimeout, nunca con `onfinish`. Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const quieto = () => mq.matches;
  const CURVA = 'cubic-bezier(.22, 1, .36, 1)';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const entre = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ── fechas sin Date: un día es un número de días desde 1970-01-01 ───────────────── */
  const diaNum = (y, m, d) => {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400), yoe = y - era * 400, doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
  };
  const civil = z => {
    z += 719468;
    const era = Math.floor(z / 146097), doe = z - era * 146097, yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
    return { d: doy - Math.floor((153 * mp + 2) / 5) + 1, m: mp < 10 ? mp + 3 : mp - 9, y: yoe + era * 400 + (mp >= 10 ? 1 : 0) };
  };
  const diaSem = z => (((z + 4) % 7) + 7) % 7;                     // 0 domingo … 6 sábado (el 1-1-1970 fue jueves)
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const corta = z => { const c = civil(z); return c.d + ' ' + MES3[c.m - 1]; };
  const larga = z => { const c = civil(z); return DIAS[diaSem(z)] + ' ' + c.d + ' de ' + MESES[c.m - 1]; };
  const hora = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ── el mes y sus eventos de ejemplo ─────────────────────────────────────────── */
  const BASE = diaNum(2026, 10, 1) - 1;       // el día 1 de octubre es BASE + 1; el 0 es el 30 de septiembre y el 32, el 1 de noviembre
  const HOY = BASE + 14;
  const CATS = { o: 'Obra', t: 'Taller', a: 'Gestión', u: 'Plazo' };
  /* [título, categoría, primer día, último día, hora] — sin hora: todo el día; con hora: un evento de ese momento */
  const DATOS = [
    ['Montaje de la muestra', 'o', 8, 16], ['Feria del taller', 't', 2, 4], ['Inventario de otoño', 'a', 5, 9], ['Obra de la azotea', 'o', 12, 14],
    ['Curso de grabado', 't', 19, 23], ['Visita de proveedores', 'a', 26, 28], ['Congreso del gremio', 't', 29, 32], ['Auditoría de calidad', 'u', 1, 2],
    ['Pintura de fachada', 'o', 21, 22], ['Cierre trimestral', 'u', 29, 30], ['Mudanza de bodega', 'o', -1, 1],
    ['Entrega de planos', 'u', 6, 6], ['Día del equipo', 'a', 9, 9], ['Corte de luz programado', 'u', 13, 13], ['Cierre de caja', 'a', 15, 15],
    ['Inspección de obra', 'u', 20, 20], ['Limpieza general', 'o', 24, 24], ['Día sin reuniones', 't', 27, 27], ['Pago a proveedores', 'a', 30, 30],
    ['Reunión de obra', 'o', 7, 7, '09:30'], ['Llamada con el taller', 't', 7, 7, '11:00'], ['Revisión de planos', 'a', 7, 7, '16:00'],
    ['Descarga de material', 'o', 8, 8, '08:00'], ['Prueba de cocción', 't', 8, 8, '10:30'], ['Reunión de cierre', 'a', 8, 8, '15:00'],
    ['Almuerzo del equipo', 't', 9, 9, '12:00'], ['Entrega de llaves', 'o', 9, 9, '17:30'],
    ['Visita técnica', 'o', 14, 14, '09:00'], ['Presupuesto de la muestra', 'a', 14, 14, '13:00'], ['Clase abierta', 't', 14, 14, '18:00'],
    ['Control de calidad', 'u', 15, 15, '10:00'], ['Revisión de existencias', 'a', 15, 15, '14:30'],
    ['Reunión semanal', 'a', 5, 5, '09:00'], ['Reunión semanal', 'a', 12, 12, '09:00'], ['Reunión semanal', 'a', 19, 19, '09:00'], ['Reunión semanal', 'a', 26, 26, '09:00'],
    ['Taller de acuarela', 't', 21, 21, '11:30'], ['Cata de materiales', 'o', 22, 22, '16:30'], ['Entrevista de ingreso', 'a', 22, 22, '10:00'],
    ['Inauguración de la muestra', 't', 17, 17, '19:00']
  ];
  const REGIONES = { 'es-ES': { fd: 1, fin: [6, 0] }, 'en-US': { fd: 0, fin: [6, 0] }, 'ar-EG': { fd: 6, fin: [5, 6] } };   // la tabla propia, por si el navegador no trae Intl.Locale (0 domingo)
  const NOMBRE_DIA = { 1: 'lunes', 0: 'domingo', 6: 'sábado' };

  /* ── la luna: fase calculada con la fecha ─────────────────────────────────────── */
  /* La elongación de la luna respecto del sol (0° luna nueva, 180° llena) sale de los argumentos medios (D, M, M') y de sus términos
     principales; con eso acierta la hora de una nueva o una llena con menos de una hora de error, y no un día como la fase media. */
  const rad = g => g * Math.PI / 180;
  function elongacion(jd) {
    const d = jd - 2451545.0, D = 297.8502 + 12.19074912 * d, M = 357.5291 + 0.98560028 * d, Mp = 134.9634 + 13.06499295 * d;
    const e = D + 6.289 * Math.sin(rad(Mp)) + 1.274 * Math.sin(rad(2 * D - Mp)) + 0.658 * Math.sin(rad(2 * D)) + 0.214 * Math.sin(rad(2 * Mp)) - 1.915 * Math.sin(rad(M)) - 0.114 * Math.sin(rad(2 * M));
    return ((e % 360) + 360) % 360;
  }
  function fase(z) {
    const j0 = z + 2440587.5;                                   // el día empieza a las 00:00 (UTC)
    const a = elongacion(j0), m = elongacion(j0 + .5), b = elongacion(j0 + 1);
    const p = m / 360, ilum = (1 - Math.cos(rad(m))) / 2;
    const nombre = p < .03 || p > .97 ? 'Luna nueva' : p < .22 ? 'Creciente' : p < .28 ? 'Cuarto creciente' : p < .47 ? 'Gibosa creciente' : p < .53 ? 'Luna llena'
      : p < .72 ? 'Gibosa menguante' : p < .78 ? 'Cuarto menguante' : 'Menguante';
    /* el día de la luna nueva o llena es aquel por el que la elongación cruza 0° o 180° */
    return { p, ilum, nombre, nueva: a > 180 && b < 180 && a - b > 180, llena: a < 180 && b >= 180 };
  }
  /* el disco de la luna: la parte con luz es un semicírculo del limbo y una elipse que hace de terminador */
  function lunaSVG(p, r) {
    const c = 10, mirror = p > .5, pw = mirror ? 1 - p : p, k = Math.cos(2 * Math.PI * pw), rx = Math.abs(k) * r;
    const luz = 'M' + c + ' ' + (c - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + c + ' ' + (c + r) + 'A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + (k > 0 ? 0 : 1) + ' ' + c + ' ' + (c - r) + 'Z';
    return '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="var(--lu-oscura)"/><path d="' + luz + '" fill="var(--lu-luna-luz)"' + (mirror ? ' transform="translate(20 0) scale(-1 1)"' : '') + '/>' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="var(--lu-linea-2)" stroke-width="1"/>';
  }
  const luna = (p, px) => '<svg viewBox="0 0 20 20" width="' + px + '" height="' + px + '" aria-hidden="true">' + lunaSVG(p, 8.5) + '</svg>';

  /* el primer día y el fin de semana de la región: Intl da firstDay y weekend como 1 (lunes) … 7 (domingo); aquí 0 es domingo */
  function primerDia(loc) {
    try {
      const l = new Intl.Locale(loc), wi = typeof l.getWeekInfo === 'function' ? l.getWeekInfo() : l.weekInfo;
      if (wi && wi.firstDay) return { fd: wi.firstDay % 7, fin: (wi.weekend || [6, 7]).map(n => n % 7), fuente: 'Intl.Locale' };
    } catch (e) { /* sin Intl.Locale: la tabla */ }
    return { fd: REGIONES[loc].fd, fin: REGIONES[loc].fin, fuente: 'tabla propia' };
  }

  function Lunario(raiz) {
    const q = s => $(s, raiz), qa = s => $$(s, raiz);
    const cal = q('[data-cal]'), nombresEl = q('[data-nombres]'), semanasEl = q('[data-semanas]'), globo = q('[data-globo]');
    const medidor = q('[data-medidor]'), estadoEl = q('[data-estado]'), anuncioEl = q('[data-anuncio]'), asaAlto = q('[data-alto]'), burbujaAlto = q('[data-alto-b]');
    const mEventos = q('[data-m-eventos]'), mCarriles = q('[data-m-carriles]'), mChoques = q('[data-m-choques]'), resumenEl = q('[data-resumen]'), fuenteEl = q('[data-fuente]');

    /* ── estado ─────────────────────────────────────────────────────────── */
    const eventos = DATOS.map((d, i) => ({
      id: i, t: d[0], c: d[1], ini: BASE + d[2], fin: BASE + d[3], h: d[4] ? (+d[4].slice(0, 2)) * 60 + (+d[4].slice(3)) : null,
      ini0: BASE + d[2], fin0: BASE + d[3]
    }));
    let region = 'es-ES', fd = 1, fin = [6, 0], fuente = '';
    let gs = 0, ge = 0;                                   // primer y último día de la cuadrícula
    let semanas = [];                                     // { el, cab, cuerpo, capa, celdas, segs }
    const segEls = new Map();                             // clave («id:n») → botón de la barra
    const masEls = new Map();                             // día → botón «+N más»
    let carriles = [];                                    // carriles que caben en cada semana
    let arr = null, sel = -1, tSello = 0, primera = true, silencio = false, globoDia = null;
    const medidas = () => { const cs = getComputedStyle(raiz); return { num: parseFloat(cs.getPropertyValue('--lu-num')), paso: parseFloat(cs.getPropertyValue('--lu-paso')), pie: parseFloat(cs.getPropertyValue('--lu-pie')) }; };

    /* ── montar las semanas: cambia con la región ─────────────────────────── */
    function monta() {
      segEls.forEach(e => e.remove()); masEls.forEach(e => e.remove());
      semanasEl.textContent = ''; nombresEl.textContent = '';
      const primero = BASE + 1, ultimo = BASE + 31;
      gs = primero - ((diaSem(primero) - fd + 7) % 7);
      const n = Math.ceil((ultimo - gs + 1) / 7);
      ge = gs + n * 7 - 1;
      for (let i = 0; i < 7; i++) { const dsm = (fd + i) % 7, s = h('span', fin.includes(dsm) ? 'fin' : '', DIAS3[dsm]); nombresEl.appendChild(s); }
      semanas = [];
      for (let w = 0; w < n; w++) {
        const ini = gs + 7 * w;
        const el = h('div', 'lu-sem'); el.dataset.w = w;
        const f = fase(ini + 3);
        const cab = h('div', 'lu-sem-cab');
        cab.innerHTML = '<b>Semana ' + (w + 1) + '</b><span class="lu-sem-fechas">' + corta(ini) + ' – ' + corta(ini + 6) + '</span>' +
          '<span class="lu-luna" title="' + f.nombre + ', ' + Math.round(f.ilum * 100) + ' % iluminada">' + luna(f.p, 16) + f.nombre + ' <em>· ' + Math.round(f.ilum * 100) + ' %</em></span>';
        const cuerpo = h('div', 'lu-cuerpo'), celdas = h('div', 'lu-celdas'), capa = h('div', 'lu-capa');
        celdas.setAttribute('role', 'row');
        const cs = [];
        for (let i = 0; i < 7; i++) {
          const dia = ini + i, c = civil(dia), fuera = dia < primero || dia > ultimo;
          const ce = h('div', 'lu-celda' + (fuera ? ' fuera' : '') + (dia === HOY ? ' hoy' : '') + (fin.includes(diaSem(dia)) ? ' fin' : '')); ce.dataset.dia = dia; ce.setAttribute('role', 'gridcell');
          ce.setAttribute('aria-label', larga(dia));
          const num = h('span', 'lu-num', String(c.d)); ce.appendChild(num);
          const fd_ = fase(dia);
          if (fd_.nueva || fd_.llena) { const sv = h('span', 'lu-fase-d'); sv.innerHTML = luna(fd_.p, 14); sv.firstChild.setAttribute('class', 'lu-fase-d'); sv.firstChild.removeAttribute('width'); sv.firstChild.removeAttribute('height'); ce.title = fd_.nombre; ce.appendChild(sv.firstChild); }
          celdas.appendChild(ce); cs.push(ce);
        }
        cuerpo.append(celdas, capa); el.append(cab, cuerpo); semanasEl.appendChild(el);
        semanas.push({ el, cab, cuerpo, capa, celdas: cs, ini });
      }
      resumenEl.textContent = eventos.length + ' eventos · ' + n + ' semanas, desde el ' + NOMBRE_DIA[fd];
    }

    /* ── colocar: carriles, lo que cabe, barras y «+N más», con FLIP ──────────── */
    const capacidad = S => { const m = medidas(); return Math.max(1, Math.floor((S.capa.clientHeight - m.num - m.pie) / m.paso)); };
    function coloca(anim) {
      const animar = anim && !quieto() && !silencio && !primera;
      const antes = new Map();
      if (animar) segEls.forEach((e, k) => antes.set(k, e.getBoundingClientRect()));
      segEls.forEach(e => e.getAnimations().forEach(a => a.cancel()));
      const cuenta = {};                                  // cuántas barras lleva ya cada evento: de ahí sale su clave
      const vistos = new Set(), masNuevos = [];
      carriles = [];
      semanas.forEach((S, w) => {
        const s = gs + 7 * w;
        const segs = [];
        eventos.forEach(ev => { if (ev.fin < s || ev.ini > s + 6) return; segs.push({ ev, a: Math.max(ev.ini, s) - s, b: Math.min(ev.fin, s + 6) - s }); });
        /* el orden de colocación: por inicio; a igual inicio, los largos primero; luego los de todo el día antes que los de hora; luego la hora */
        segs.sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a) || (x.ev.h == null ? 0 : 1) - (y.ev.h == null ? 0 : 1) || (x.ev.h || 0) - (y.ev.h || 0) || x.ev.id - y.ev.id);
        const finCarril = [];
        segs.forEach(sg => { let l = 0; while (finCarril[l] !== undefined && finCarril[l] >= sg.a) l++; sg.carril = l; finCarril[l] = sg.b; });
        S.segs = segs;
        const C = capacidad(S); carriles.push(C);
        /* por día: ¿algo se pasa de los carriles? entonces el último carril es para el «+N más» */
        const lim = [], ocultos = [];
        for (let d = 0; d < 7; d++) {
          const cubre = segs.filter(sg => sg.a <= d && d <= sg.b);
          const pasa = cubre.some(sg => sg.carril >= C);
          lim[d] = pasa ? C - 1 : C;
          ocultos[d] = cubre.filter(sg => sg.carril >= lim[d]);
        }
        S.ocultos = ocultos.map(o => o.map(sg => sg.ev.id));
        segs.forEach(sg => {
          let d = sg.a;
          while (d <= sg.b) {                             // tramos seguidos de días donde la barra sí se ve
            if (sg.carril >= lim[d]) { d++; continue; }
            let e = d; while (e + 1 <= sg.b && sg.carril < lim[e + 1]) e++;
            const k = cuenta[sg.ev.id] = (cuenta[sg.ev.id] || 0) + 1, clave = sg.ev.id + ':' + (k - 1);
            vistos.add(clave);
            let el = segEls.get(clave), nuevo = false;
            if (!el) { el = creaSeg(sg.ev); segEls.set(clave, el); nuevo = true; }
            if (el.parentNode !== S.capa) S.capa.appendChild(el);
            pintaSeg(el, sg.ev, { c: d, n: e - d + 1, l: sg.carril, cizq: s + d > sg.ev.ini, cder: s + e < sg.ev.fin, k: k - 1, dias: range(s + d, s + e) });
            if (nuevo && !primera && !silencio && !quieto()) { el.classList.add('nuevo'); setTimeout(() => el.classList.remove('nuevo'), 460); }
            d = e + 1;
          }
        });
        for (let d = 0; d < 7; d++) if (ocultos[d].length) masNuevos.push({ S, w, d, n: ocultos[d].length, l: C - 1, dia: s + d });
      });
      segEls.forEach((e, k) => { if (!vistos.has(k)) { e.remove(); segEls.delete(k); } });
      const vistosMas = new Set();                                     // los «+N más» se reutilizan: solo entra con animación el que no estaba
      masNuevos.forEach(m => {
        const k = String(m.dia); vistosMas.add(k);
        let b = masEls.get(k); const nuevo = !b;
        if (!b) { b = h('button', 'lu-mas'); b.type = 'button'; b.dataset.dia = m.dia; b.setAttribute('aria-haspopup', 'dialog'); masEls.set(k, b); }
        b.textContent = '+' + m.n + ' más'; b.style.setProperty('--c', m.d); b.style.setProperty('--l', m.l);
        b.setAttribute('aria-label', m.n + (m.n === 1 ? ' evento más' : ' eventos más') + ' el ' + larga(m.dia) + ': abrir el día');
        b.classList.toggle('abierto', globoDia === m.dia && globo.classList.contains('abierto'));
        if (b.parentNode !== m.S.capa) m.S.capa.appendChild(b);
        if (nuevo && !primera && !silencio && !quieto()) { b.classList.add('nuevo'); setTimeout(() => b.classList.remove('nuevo'), 460); }
      });
      masEls.forEach((b, k) => { if (!vistosMas.has(k)) { b.remove(); masEls.delete(k); } });
      if (animar) segEls.forEach((e, k) => {
        const o = antes.get(k); if (!o) return;
        const n = e.getBoundingClientRect(), dx = o.left - n.left, dy = o.top - n.top;
        if (Math.abs(dx) > .5 || Math.abs(dy) > .5) e.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: 440, easing: CURVA });
      });
      pintaMarcas(); pintaMedidor();
      primera = false;
    }
    const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
    function creaSeg(ev) {
      const b = h('button', 'lu-ev lu-c-' + ev.c + (ev.h != null ? ' h' : '')); b.type = 'button'; b.dataset.ev = ev.id;
      b.innerHTML = '<i class="lu-fig"></i>' + (ev.h != null
        ? '<span class="lu-tx"><i class="lu-pt"></i><time>' + hora(ev.h) + '</time><span class="lu-ti">' + esc(ev.t) + '</span></span>'
        : '<span class="lu-tx">' + esc(ev.t) + '</span><i class="lu-asa lu-asa-i"></i><i class="lu-asa lu-asa-d"></i>');
      return b;
    }
    function rango(ev) {
      if (ev.h != null) return larga(ev.ini) + ', ' + hora(ev.h);
      if (ev.fin === ev.ini) return larga(ev.ini) + ', todo el día';
      return 'del ' + corta(ev.ini) + ' al ' + corta(ev.fin) + ', ' + (ev.fin - ev.ini + 1) + ' días';
    }
    function pintaSeg(el, ev, o) {
      el.style.setProperty('--c', o.c); el.style.setProperty('--n', o.n); el.style.setProperty('--l', o.l);
      el.classList.toggle('cizq', o.cizq); el.classList.toggle('cder', o.cder);
      el.classList.toggle('sel', sel === ev.id);
      el.classList.toggle('arr', !!(arr && arr.mov && arr.ev === ev));
      el.dataset.dias = o.dias.join(','); el.dataset.k = o.k;
      el.tabIndex = o.k === 0 ? 0 : -1;
      el.setAttribute('aria-label', ev.t + ', ' + CATS[ev.c].toLowerCase() + ', ' + rango(ev));
    }
    /* los días sobre los que cae la barra que se arrastra, y la lista de eventos de cada día para el globo */
    function pintaMarcas() {
      const dia = arr && arr.mov ? arr.ev : null;
      semanas.forEach(S => S.celdas.forEach(ce => ce.classList.toggle('diana', !!dia && +ce.dataset.dia >= dia.ini && +ce.dataset.dia <= dia.fin)));
    }
    const eventosDe = dia => eventos.filter(ev => ev.ini <= dia && dia <= ev.fin).sort((x, y) => (x.h == null ? 0 : 1) - (y.h == null ? 0 : 1) || (x.h || 0) - (y.h || 0) || (y.fin - y.ini) - (x.fin - x.ini) || x.id - y.id);

    /* ── medir de verdad: barras que se pisan, y lo que suma cada día ──────────── */
    function choques() {
      let n = 0;
      semanas.forEach(S => {
        const els = $$('.lu-ev, .lu-mas', S.capa).map(e => ({ l: e.offsetLeft, t: e.offsetTop, r: e.offsetLeft + e.offsetWidth, b: e.offsetTop + e.offsetHeight }));
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; if (a.l < b.r - .5 && a.r > b.l + .5 && a.t < b.b - .5 && a.b > b.t + .5) n++; }
      });
      return n;
    }
    function sumas() {
      let mal = 0, dias = 0;
      semanas.forEach(S => {
        S.celdas.forEach(ce => {
          const dia = +ce.dataset.dia, total = eventosDe(dia).length;
          const vis = $$('.lu-ev', S.capa).filter(e => e.dataset.dias.split(',').includes(String(dia))).length;
          const mas = $('.lu-mas[data-dia="' + dia + '"]', S.capa);
          const nmas = mas ? parseInt(mas.textContent.replace('+', ''), 10) : 0;
          dias++; if (vis + nmas !== total) mal++;
        });
      });
      return { mal, dias };
    }
    function pintaMedidor() {
      mEventos.textContent = eventos.length;
      mCarriles.textContent = carriles.length ? carriles[0] : 0;
      const c = choques();
      mChoques.textContent = c;
      medidor.classList.toggle('fallo', c > 0);
      if (c > 0) medidor.classList.remove('sellado');
      const al = Math.round(cal.getBoundingClientRect().height);
      asaAlto.setAttribute('aria-valuenow', al); asaAlto.setAttribute('aria-valuetext', al + ' px, ' + (carriles[0] || 0) + ' carriles');
      burbujaAlto.textContent = al + ' px · ' + (carriles[0] || 0) + (carriles[0] === 1 ? ' carril' : ' carriles');
    }
    function desella() { clearTimeout(tSello); medidor.classList.remove('sellado'); }
    function sella(msg) {
      desella();
      tSello = setTimeout(() => {
        if (choques() === 0) { medidor.classList.add('sellado'); if (msg) aviso(msg + ' · 0 barras se pisan', 'ok'); }
      }, quieto() ? 0 : 280);
    }
    function aviso(txt, tipo, mudo) { estadoEl.textContent = txt; estadoEl.className = 'lu-estado' + (tipo ? ' ' + tipo : ''); if (!mudo) anuncioEl.textContent = txt; }

    /* ── el día bajo el puntero ───────────────────────────────────────────── */
    function diaEn(x, y) {
      let w = 0;
      semanas.forEach((S, i) => { if (y >= S.el.getBoundingClientRect().top) w = i; });
      const r = semanas[w].celdas[0].parentNode.getBoundingClientRect();
      return gs + 7 * w + entre(Math.floor((x - r.left) / (r.width / 7)), 0, 6);
    }
    const idDe = el => +el.dataset.ev;
    function mueve(ev, ini, fin) {
      ini = entre(ini, gs, ge); fin = entre(fin, ini, ge);
      if (ev.h != null) fin = ini;
      if (ini === ev.ini && fin === ev.fin) return false;
      ev.ini = ini; ev.fin = fin; coloca(true); return true;
    }
    cal.addEventListener('pointerdown', e => {
      if (e.button) return;
      const el = e.target.closest('.lu-ev'); if (!el) return;
      const ev = eventos[idDe(el)], asa = e.target.closest('.lu-asa');
      cal.setPointerCapture(e.pointerId);
      el.focus({ preventScroll: true });
      arr = { ev, modo: asa ? (asa.classList.contains('lu-asa-i') ? 'ini' : 'fin') : 'mover', x0: e.clientX, y0: e.clientY, mov: false, off: diaEn(e.clientX, e.clientY) - ev.ini };
      e.preventDefault();
    });
    cal.addEventListener('pointermove', e => {
      if (!arr) return;
      if (!arr.mov) {
        if (Math.hypot(e.clientX - arr.x0, e.clientY - arr.y0) < 5) return;
        arr.mov = true; cierraGlobo(); desella();
        cal.classList.add(arr.modo === 'mover' ? 'arrastrando' : 'estirando');
        sel = arr.ev.id; coloca(false);
      }
      const d = diaEn(e.clientX, e.clientY), ev = arr.ev;
      if (arr.modo === 'mover') { const largo = ev.fin - ev.ini; mueve(ev, entre(d - arr.off, gs, ge - largo), entre(d - arr.off, gs, ge - largo) + largo); }
      else if (arr.modo === 'fin') mueve(ev, ev.ini, d);
      else mueve(ev, Math.min(d, ev.fin), ev.fin);
      pintaMarcas();
    });
    const suelta = () => {
      if (!arr) return;
      const a = arr; arr = null;
      cal.classList.remove('arrastrando', 'estirando');
      segEls.forEach(e => e.classList.remove('arr')); pintaMarcas();
      if (a.mov) {
        const ev = a.ev;
        sella(ev.t + ': ' + rango(ev));
        anuncioEv(ev, 'movido');
      } else selecciona(a.ev);
    };
    cal.addEventListener('pointerup', suelta); cal.addEventListener('pointercancel', suelta);
    function selecciona(ev) {
      sel = ev.id; segEls.forEach((e, k) => e.classList.toggle('sel', +k.split(':')[0] === ev.id));
      aviso(ev.t + ' · ' + rango(ev) + (ev.h == null ? ' · ← → lo mueven, Mayús+← → estiran' : ' · ← → lo mueven'), '', false);
    }
    const anuncioEv = (ev, que) => { anuncioEl.textContent = ev.t + ' ' + que + ': ' + rango(ev); };
    function foco(ev) { const e = segEls.get(ev.id + ':0'); if (e && document.activeElement !== e) e.focus({ preventScroll: true }); }
    cal.addEventListener('keydown', e => {
      const el = e.target.closest && e.target.closest('.lu-ev');
      if (el) {
        const ev = eventos[idDe(el)]; let ok = false;
        const paso = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
        if (paso) {
          e.preventDefault(); sel = ev.id;
          if (e.shiftKey && ev.h == null && Math.abs(paso) === 1) ok = mueve(ev, ev.ini, ev.fin + paso);
          else if (!e.shiftKey) { const largo = ev.fin - ev.ini, ini = entre(ev.ini + paso, gs, ge - largo); ok = mueve(ev, ini, ini + largo); }
          if (ok) { foco(ev); desella(); sella(ev.t + ': ' + rango(ev)); anuncioEv(ev, 'ahora'); }
        }
      }
      if (e.key === 'Escape' && globo.classList.contains('abierto')) { e.preventDefault(); cierraGlobo(true); }
    });
    cal.addEventListener('click', e => {
      const el = e.target.closest('.lu-ev');
      if (el && e.detail === 0) selecciona(eventos[idDe(el)]);           // Intro o Espacio sobre una barra
      const mas = e.target.closest('.lu-mas');
      if (mas) abreGlobo(+mas.dataset.dia, mas);
    });

    /* ── el globo con todo un día ─────────────────────────────────────────── */
    function abreGlobo(dia, disparador) {
      const lista = eventosDe(dia), f = fase(dia);
      $('[data-globo-t]', globo).textContent = cap(larga(dia));
      $('[data-globo-s]', globo).innerHTML = lista.length + (lista.length === 1 ? ' evento' : ' eventos') + ' · ' + luna(f.p, 14) + f.nombre;
      const ul = $('[data-globo-lista]', globo); ul.textContent = '';
      lista.forEach((ev, i) => {
        const li = h('li', ev.h != null ? 'h' : ''); li.style.setProperty('--i', i); li.style.setProperty('--col', 'var(--lu-' + ev.c + ')');
        const meta = ev.h != null ? hora(ev.h) : ev.fin === ev.ini ? 'Todo el día' : corta(ev.ini) + ' – ' + corta(ev.fin) + ' · ' + (ev.fin - ev.ini + 1) + ' días';
        li.innerHTML = '<i></i><div><b>' + esc(ev.t) + '</b><small>' + CATS[ev.c] + ' · ' + meta + '</small></div>';
        ul.appendChild(li);
      });
      globoDia = dia;
      globo.hidden = false;
      const cr = cal.getBoundingClientRect(), br = disparador.getBoundingClientRect();
      const gw = Math.min(304, cr.width - 16), alto = globo.offsetHeight || 260;
      const izq = entre(br.left - cr.left + br.width / 2 - gw / 2, 8, cr.width - gw - 8);
      const arriba = br.top - cr.top > cr.height * .55;                 // en la parte baja, el globo se abre hacia arriba
      const top = entre(arriba ? br.top - cr.top + br.height - alto - 2 : br.top - cr.top - 4, 8, Math.max(8, cr.height - alto - 8));
      globo.style.left = izq + 'px'; globo.style.top = top + 'px'; globo.style.width = gw + 'px';
      globo.style.setProperty('--ox', (br.left - cr.left + br.width / 2 - izq) + 'px'); globo.style.setProperty('--oy', arriba ? '100%' : '0%');
      qa('.lu-mas').forEach(b => b.classList.toggle('abierto', +b.dataset.dia === dia));
      void globo.offsetWidth;
      globo.classList.add('abierto');
      globo.dataset.disp = dia;
      setTimeout(() => $('[data-globo-x]', globo).focus({ preventScroll: true }), quieto() ? 0 : 60);
      anuncioEl.textContent = cap(larga(dia)) + ': ' + lista.length + ' eventos';
    }
    function cierraGlobo(devuelve) {
      if (!globo.classList.contains('abierto')) return;
      globo.classList.remove('abierto');
      const dia = globoDia; globoDia = null;
      qa('.lu-mas').forEach(b => b.classList.remove('abierto'));
      setTimeout(() => { if (!globo.classList.contains('abierto')) globo.hidden = true; }, quieto() ? 0 : 420);
      if (devuelve) { const b = $('.lu-mas[data-dia="' + dia + '"]', cal); if (b) b.focus({ preventScroll: true }); }
    }
    $('[data-globo-x]', globo).addEventListener('click', () => cierraGlobo(true));
    document.addEventListener('pointerdown', e => { if (globo.classList.contains('abierto') && !globo.contains(e.target) && !e.target.closest('.lu-mas')) cierraGlobo(false); });

    /* ── la región: decide el primer día de la semana ────────────────────── */
    function ponRegion(loc, mudo) {
      region = loc; const r = primerDia(loc); fd = r.fd; fin = r.fin; fuente = r.fuente;
      qa('[data-region]').forEach(b => { const on = b.dataset.region === loc; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
      fuenteEl.textContent = 'vía ' + fuente;
      fuenteEl.title = 'La semana empieza el ' + NOMBRE_DIA[fd] + ' y el fin de semana es ' + fin.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(n => DIAS[n]).join(' y ') + ' (dato de ' + fuente + ')';
      cierraGlobo(false);
      const anim = !mudo;
      const antes = new Map(); if (anim && !quieto()) segEls.forEach((e, k) => antes.set(k, e.getBoundingClientRect()));
      monta();
      if (antes.size) {                                   // las barras viajan de su semana vieja a la nueva: FLIP entre cuadrículas distintas
        segEls.forEach(e => e.getAnimations().forEach(a => a.cancel()));
        const guardaPrimera = primera; primera = true; coloca(false); primera = guardaPrimera;
        segEls.forEach((e, k) => { const o = antes.get(k); if (!o) return; const n = e.getBoundingClientRect(), dx = o.left - n.left, dy = o.top - n.top;
          if (Math.abs(dx) > .5 || Math.abs(dy) > .5) e.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: 620, easing: CURVA }); });
      } else coloca(false);
      if (!mudo) { desella(); sella(); aviso('Región ' + loc + ': la semana empieza el ' + NOMBRE_DIA[fd] + ' (' + fuente + ') · ' + semanas.length + ' semanas', '', false); }
    }
    qa('[data-region]').forEach(b => {
      b.addEventListener('click', () => ponRegion(b.dataset.region));
      b.addEventListener('keydown', e => {
        const ls = qa('[data-region]'), i = ls.indexOf(b); let j = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % ls.length; else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + ls.length - 1) % ls.length;
        if (j > -1) { e.preventDefault(); ls[j].focus(); ponRegion(ls[j].dataset.region); }
      });
    });

    /* ── el alto: un cordón bajo el calendario ─────────────────────────────── */
    let alto0 = 0, y0 = 0;
    const maxAlto = () => 1100;
    function ponAlto(px) {
      px = entre(Math.round(px), 300, maxAlto());
      cal.style.setProperty('--lu-alto', px + 'px');
    }
    asaAlto.addEventListener('pointerdown', e => { if (e.button) return; asaAlto.setPointerCapture(e.pointerId); alto0 = cal.getBoundingClientRect().height; y0 = e.clientY; asaAlto.classList.add('arrastrando'); cierraGlobo(false); desella(); e.preventDefault(); });
    asaAlto.addEventListener('pointermove', e => { if (asaAlto.classList.contains('arrastrando')) ponAlto(alto0 + e.clientY - y0); });
    const sueltaAlto = () => { if (!asaAlto.classList.contains('arrastrando')) return; asaAlto.classList.remove('arrastrando'); sella('Alto ' + Math.round(cal.getBoundingClientRect().height) + ' px: ' + (carriles[0] || 0) + ' carriles'); };
    asaAlto.addEventListener('pointerup', sueltaAlto); asaAlto.addEventListener('pointercancel', sueltaAlto);
    asaAlto.addEventListener('keydown', e => {
      const paso = e.shiftKey ? 96 : 24; let px = null; const al = cal.getBoundingClientRect().height;
      if (e.key === 'ArrowUp') px = al - paso; else if (e.key === 'ArrowDown') px = al + paso; else if (e.key === 'Home') px = 300; else if (e.key === 'End') px = maxAlto();
      if (px == null) return; e.preventDefault(); desella(); ponAlto(px); sella();
    });
    new ResizeObserver(() => { if (!arr) { coloca(true); } }).observe(semanasEl);

    /* ── comprobar: tres regiones × todos los altos, midiendo de verdad ─────── */
    function verifica() {
      const regionAntes = region, altoAntes = cal.style.getPropertyValue('--lu-alto');
      silencio = true; cierraGlobo(false);
      let n = 0, solapes = 0, mal = 0, dias = 0, cortes = true, minC = 99, maxC = 0, largoOk = 0, largoN = 0;
      const montaje = eventos.find(ev => ev.t === 'Montaje de la muestra');
      Object.keys(REGIONES).forEach(loc => {
        ponRegion(loc, true);
        for (let al = 300; al <= 1000; al += 20) {
          cal.style.setProperty('--lu-alto', al + 'px');
          coloca(false); n++;
          solapes += choques();
          const s = sumas(); mal += s.mal; dias += s.dias;
          carriles.forEach(c => { minC = Math.min(minC, c); maxC = Math.max(maxC, c); });
          /* el evento de 9 días: cuando entra entero, sale en dos semanas con su corte en pico donde se parte */
          if (carriles.every(c => c >= 6)) {
            const partes = $$('.lu-ev[data-ev="' + montaje.id + '"]', cal).sort((a, b) => +a.dataset.k - +b.dataset.k);
            largoN++;
            const dias9 = partes.reduce((t, e) => t + e.dataset.dias.split(',').length, 0);
            if (partes.length === 2 && partes[0].classList.contains('cder') && partes[1].classList.contains('cizq') && !partes[0].classList.contains('cizq') && !partes[1].classList.contains('cder') && dias9 === 9) largoOk++; else cortes = false;
          }
        }
      });
      silencio = false;
      ponRegion(regionAntes, true);
      if (altoAntes) cal.style.setProperty('--lu-alto', altoAntes); else cal.style.removeProperty('--lu-alto');
      coloca(false);
      const ok = !solapes && !mal && cortes && largoN > 0;
      medidor.classList.toggle('fallo', !ok);
      aviso(ok ? 'Comprobadas 3 regiones × ' + (n / 3) + ' altos (' + n + ' cuadrículas, de ' + minC + ' a ' + maxC + ' carriles): 0 barras se pisan, en cada día lo que se ve más el «+N» suma lo que tiene, y el evento de 9 días sale en dos semanas con sus cortes (' + largoOk + ' de ' + largoN + ').'
        : 'Fallo: ' + solapes + ' solapes, ' + mal + ' días que no suman, cortes ' + (cortes ? 'bien' : 'mal') + '.', ok ? 'ok' : 'mal');
      if (ok) { desella(); void medidor.offsetWidth; medidor.classList.add('sellado'); }
      return { cuadriculas: n, solapes, diasMal: mal, dias, carriles: [minC, maxC], largo: { ok: largoOk, de: largoN, cortes } };
    }
    q('[data-prueba]').addEventListener('click', verifica);

    /* ── reiniciar ─────────────────────────────────────────────────────────── */
    function reinicia() {
      cierraGlobo(false); sel = -1;
      eventos.forEach(ev => { ev.ini = ev.ini0; ev.fin = ev.fin0; });
      cal.style.removeProperty('--lu-alto');
      if (region !== 'es-ES') ponRegion('es-ES'); else coloca(true);
      desella(); sella();
      aviso('Arrastra una barra a otros días, estira su borde para cambiar la duración o pulsa un «+N más».', '', true);
    }
    q('[data-reinicio]').addEventListener('click', reinicia);
    document.addEventListener('keydown', e => {
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) reinicia();
    });

    /* ── arranque ──────────────────────────────────────────────────────────── */
    ponRegion('es-ES', true);
    medidor.classList.add('sellado');

    return {
      region: loc => { ponRegion(loc); return region; },
      alto: px => { ponAlto(px); return Math.round(cal.getBoundingClientRect().height); },
      mueve: (id, dias) => { const ev = eventos[id], largo = ev.fin - ev.ini, ini = entre(ev.ini + dias, gs, ge - largo); mueve(ev, ini, ini + largo); sella(); return rango(ev); },
      evento: id => { const ev = eventos[id]; return { titulo: ev.t, ini: ev.ini - BASE, fin: ev.fin - BASE }; },   // el día 1 es el 1 de octubre
      verifica, reinicia,
      estado: () => ({ region, primerDia: fd, fuente, semanas: semanas.length, carriles: carriles.slice(), choques: choques(), sumas: sumas(), eventos: eventos.length, dias: [gs, ge] })
    };
  }

  window.Lunario = Lunario;
  document.querySelectorAll('[data-lunario]').forEach(r => { r.lunario = Lunario(r); });
})();
