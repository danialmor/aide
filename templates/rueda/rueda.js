/* =====================================================================
   Rueda · Moxen
   Un selector de fecha de tres rodillos con perspectiva, como los de un
   cajero o una caja fuerte: día, mes y año giran sobre un cilindro (cada
   fila se inclina con rotateX y se aleja con translateZ), se arrastran
   con inercia, se detienen siempre sobre una fila (con un resorte) y se
   dejan llevar por la rueda del ratón, las flechas o un toque sobre una
   fila. Todo lo demás sigue a los rodillos en vivo:

     · la lectura grande de la izquierda: el día rueda como un
       cuentakilómetros, el mes y la semana cambian de palabra y una
       etiqueta dice cuánto falta («Mañana», «En 12 días»);
     · el calendario compacto de abajo: un círculo mostaza se desliza con
       resorte hasta el día elegido y el mes cambia de página; también se
       puede pulsar un día (o moverse con las flechas) y los rodillos
       giran solos hasta él;
     · los meses cortos recortan la rueda de los días (el 31 de marzo cae
       al 30 de abril, y la rueda se acorta con la fila pasando por ahí);
     · «Fijar fecha» hace vibrar los rodillos, enciende la banda y deja
       un ✓; una fecha pasada deshabilita el botón.

     const r = Rueda(document.querySelector('[data-rueda]'), {
       hoy: [2026, 10, 13],          // [año, mes, día] de «hoy» (fijo: así la demo no cambia con el día)
       inicial: [2026, 10, 14],
       desde: 2024, hasta: 2040,     // los años de la rueda
       reinicio: 0,                  // demo: ms tras fijar para volver al inicio (0 = nunca)
       alFijar: ({ anio, mes, dia, iso }) => fetch(…),    // «2026-10-14»
     });
     r.fecha();   r.pon(2027, 3, 9);   r.reinicia();

   Qué se personaliza: los colores y la tipografía, en las variables --rd-*
   de rueda.css; el alto de fila y el radio del cilindro (ALTO_FILA y
   RADIO, abajo; --rd-fila en el CSS debe valer lo mismo); el paso y la
   fricción de la inercia. Teclado: Tab pasa por los tres rodillos;
   ↑ ↓ cambian de fila, Re Pág / Av Pág saltan, Inicio y Fin van a los
   extremos; en el calendario, las flechas mueven el día (±1, ±7) y Re
   Pág / Av Pág el mes. Solo se anima transform y opacity. Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  const sinMov = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const entre = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ── un resorte convertido en curva CSS linear() ──────────────────── */
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
    return { easing: 'linear(' + out.join(', ') + ')', duracion: Math.round(t * 1000) };
  }
  const M_GIRO = muelle(190, 19);      // las cifras grandes
  const M_SEL = muelle(330, 22);       // el círculo del calendario

  /* ── fechas, sin Date: solo aritmética ────────────────────────────── */
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const bisiesto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const diasMes = (m, a) => [31, bisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  function diasCivil(a, m, d) {      // días desde 1970-01-01 (algoritmo de H. Hinnant)
    a -= m <= 2 ? 1 : 0;
    const era = Math.floor(a / 400), yoe = a - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
  }
  const diaSemana = (a, m, d) => (((diasCivil(a, m, d) + 3) % 7) + 7) % 7;   // 0 = lunes
  const dos = n => String(n).padStart(2, '0');

  /* =====================================================================
     Las cifras grandes: cada dígito es una columna recortada con una
     tira del 0 al 9; para cambiarlo solo se mueve la tira (--d), y al
     pasar rápido por varios días las cifras ruedan por las intermedias.
     ===================================================================== */
  function Cifras(el) {
    let cols = [];
    el.textContent = '';
    const nueva = () => {
      const c = document.createElement('span'), t = document.createElement('span');
      c.className = 'rd-c'; t.className = 'rd-tira';
      for (let i = 0; i < 10; i++) { const s = document.createElement('span'); s.textContent = i; t.appendChild(s); }
      c.appendChild(t);
      return { el: c, tira: t, d: -1 };
    };
    return {
      pon(txt, rapido) {
        txt = String(txt);
        while (cols.length < txt.length) { const c = nueva(); cols.unshift(c); el.insertBefore(c.el, el.firstChild); }
        while (cols.length > txt.length) cols.shift().el.remove();
        txt.split('').forEach((ch, i) => {
          const c = cols[i], d = +ch;
          if (c.d === d) return;
          if (c.d < 0 || rapido) c.tira.style.transition = 'none';
          c.tira.style.setProperty('--d', d);
          if (c.d < 0 || rapido) { void c.tira.offsetWidth; c.tira.style.transition = ''; }
          c.d = d;
        });
      },
    };
  }

  /* una palabra que cambia: la vieja se va hacia un lado y la nueva entra del otro */
  function Palabra(el) {
    let txt = el.textContent.trim();
    el.textContent = '';
    const nodo = t => { const s = document.createElement('span'); s.className = 'rd-t-i'; s.textContent = t; return s; };
    let hijo = nodo(txt); el.appendChild(hijo);
    return {
      pon(t, sube) {
        if (t === txt) return;
        const viejo = hijo; hijo = nodo(t); el.appendChild(hijo); txt = t;
        if (sinMov()) { viejo.remove(); return; }
        const dy = sube ? 55 : -55;
        viejo.animate([{ transform: 'translateY(0)', opacity: 1, filter: 'blur(0)' }, { transform: 'translateY(' + -dy + '%)', opacity: 0, filter: 'blur(5px)' }], { duration: 260, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'both' }).onfinish = () => viejo.remove();
        hijo.animate([{ transform: 'translateY(' + dy + '%)', opacity: 0, filter: 'blur(5px)' }, { transform: 'translateY(0)', opacity: 1, filter: 'blur(0)' }], { duration: 480, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
        const todos = el.querySelectorAll('.rd-t-i'); if (todos.length > 3) todos[0].remove();
      },
    };
  }

  /* =====================================================================
     Un rodillo: un cilindro de filas que se inclinan y se alejan.
     La física es de paso fijo (igual a 60 que a 144 Hz) y tiene cuatro
     modos: arrastre (sigue al dedo), inercia (se desliza y se frena por
     fricción), imán (un resorte lo asienta en la fila más cercana) y
     goma (si se pasa de los extremos, vuelve con un resorte).
     ===================================================================== */
  const ALTO_FILA = 44, RADIO = 118, PASO_ANG = ALTO_FILA / RADIO;   // el ángulo entre filas, en radianes
  const FRICCION = 5.2, K_IMAN = 230, C_IMAN = 27, K_GOMA = 170, C_GOMA = 21;

  function Rodillo(host, cfg) {
    host.classList.add('rd-rueda');
    host.setAttribute('role', 'spinbutton');
    host.tabIndex = 0;
    host.setAttribute('aria-label', cfg.nombre);
    host.innerHTML = '<div class="rd-vista"><div class="rd-cil"></div></div>';
    const vista = host.firstChild, cil = vista.firstChild;
    let items = [], nodos = [], n = 0;
    let pos = 0, vel = 0, meta = 0, modo = 'reposo', valor = -1, arr = null, corre = false, ult = 0, acc = 0, rueda = 0, muda = false;
    let rIni = 0, rFin = -1;

    function pone(lista, indice) {
      items = lista; n = lista.length;
      cil.textContent = ''; nodos = lista.map((t, i) => { const d = document.createElement('div'); d.className = 'rd-it'; d.textContent = t; d.setAttribute('aria-hidden', 'true'); return d; });
      nodos.forEach(d => cil.appendChild(d));
      rIni = 0; rFin = -1;
      host.setAttribute('aria-valuemin', 1); host.setAttribute('aria-valuemax', n);
      if (indice != null) { pos = meta = indice; vel = 0; modo = 'reposo'; }
      const c = entre(Math.round(pos), 0, n - 1);
      valor = c; nodos[c].classList.add('is-sel');   // sin avisar: quien reemplaza la lista ya sabe en qué fila está
      host.setAttribute('aria-valuenow', c + 1); host.setAttribute('aria-valuetext', items[c]);
      if (pos > n - 1) va(n - 1, false, true);
      pinta();
    }
    function pinta() {
      const c = entre(Math.round(pos), 0, n - 1);
      const a = Math.max(0, c - 5), b = Math.min(n - 1, c + 5);
      for (let i = Math.min(rIni, a); i <= Math.max(rFin, b); i++) {
        if (!nodos[i]) continue;
        if (i < a || i > b) { nodos[i].style.opacity = '0'; continue; }
        const d = i - pos, ang = -d * PASO_ANG;
        nodos[i].style.transform = 'rotateX(' + ang.toFixed(4) + 'rad) translateZ(' + RADIO + 'px)';
        nodos[i].style.opacity = String(Math.max(0, 1 - Math.pow(Math.abs(d) / 3.7, 1.6)).toFixed(3));
      }
      rIni = a; rFin = b;
      if (c !== valor) {
        if (nodos[valor]) nodos[valor].classList.remove('is-sel');
        valor = c; nodos[c].classList.add('is-sel');
        host.setAttribute('aria-valuenow', c + 1); host.setAttribute('aria-valuetext', items[c]);
        if (!muda) cfg.alCambiar(c, modo);
      }
    }
    function paso(dt) {
      if (modo === 'arrastre' || modo === 'reposo') return;
      const max = n - 1;
      if ((pos < 0 || pos > max) && modo !== 'iman') {   // pasado de los extremos: la goma lo devuelve (el imán ya apunta dentro)
        const b = pos < 0 ? 0 : max;
        vel += (K_GOMA * (b - pos) - C_GOMA * vel) * dt; pos += vel * dt;
        if (Math.abs(vel) < .02 && Math.abs(b - pos) < .002) { pos = b; vel = 0; modo = 'reposo'; }
        return;
      }
      if (modo === 'inercia') {
        vel *= Math.exp(-FRICCION * dt); pos += vel * dt;
        if (Math.abs(vel) < 2.4) { modo = 'iman'; meta = entre(Math.round(pos), 0, max); }
      } else {
        vel += (K_IMAN * (meta - pos) - C_IMAN * vel) * dt; pos += vel * dt;
        if (Math.abs(vel) < .02 && Math.abs(meta - pos) < .002) { pos = meta; vel = 0; modo = 'reposo'; }
      }
    }
    function bucle(t) {
      if (!ult) ult = t;
      acc += Math.min(.05, (t - ult) / 1000); ult = t;
      while (acc >= 1 / 240) { paso(1 / 240); acc -= 1 / 240; }
      pinta();
      if (modo === 'reposo' || modo === 'arrastre') { corre = false; ult = 0; acc = 0; if (modo === 'reposo') muda = false; return; }
      requestAnimationFrame(bucle);
    }
    function arranca() { if (!corre) { corre = true; ult = 0; requestAnimationFrame(bucle); } }

    function va(i, rapido, prog) {   // ir a una fila con resorte; prog: el estado ya lo sabe, no avises fila a fila
      meta = entre(i, 0, n - 1); muda = !!prog;
      if (sinMov() || rapido) { pos = meta; vel = 0; modo = 'reposo'; pinta(); muda = false; return; }
      modo = 'iman'; arranca();
    }

    /* ── puntero: arrastre con inercia ─────────────────────────────── */
    vista.addEventListener('pointerdown', e => {
      if (e.button) return;
      vista.setPointerCapture(e.pointerId);
      arr = { y: e.clientY, p0: pos, m: [{ t: performance.now(), p: pos }], mov: false, id: e.pointerId };
      modo = 'arrastre'; vel = 0; muda = false; host.classList.add('is-arrastre');
    });
    vista.addEventListener('pointermove', e => {
      if (!arr || e.pointerId !== arr.id) return;
      const dy = e.clientY - arr.y;
      if (Math.abs(dy) > 4) arr.mov = true;
      let p = arr.p0 - dy / ALTO_FILA;
      if (p < 0) p *= .38; else if (p > n - 1) p = n - 1 + (p - (n - 1)) * .38;   // goma en los extremos
      pos = p; arr.m.push({ t: performance.now(), p }); if (arr.m.length > 8) arr.m.shift();
      pinta();
    });
    function suelta(e) {
      if (!arr || (e && e.pointerId !== arr.id)) return;
      const a = arr; arr = null; host.classList.remove('is-arrastre');
      if (!a.mov) {   // un toque: si fue sobre otra fila, va a ella
        const r = vista.getBoundingClientRect(), dy = (e ? e.clientY : r.top + r.height / 2) - (r.top + r.height / 2);
        const d = Math.round(Math.asin(entre(dy / RADIO, -1, 1)) / PASO_ANG);
        va(Math.round(pos) + d); return;
      }
      const now = performance.now(), m = a.m.filter(s => now - s.t < 110);
      const ref = m[0] || a.m[a.m.length - 1];
      vel = sinMov() ? 0 : (pos - ref.p) / Math.max(.016, (now - ref.t) / 1000);
      if (pos < 0 || pos > n - 1) { modo = 'goma'; arranca(); return; }
      if (Math.abs(vel) > 4) { modo = 'inercia'; arranca(); } else { meta = entre(Math.round(pos), 0, n - 1); modo = 'iman'; arranca(); }
    }
    vista.addEventListener('pointerup', suelta);
    vista.addEventListener('pointercancel', suelta);

    /* ── rueda del ratón y teclado ─────────────────────────────────── */
    vista.addEventListener('wheel', e => {
      e.preventDefault();
      rueda += e.deltaY;
      const k = Math.trunc(rueda / 50);
      if (k) { rueda -= k * 50; va((modo === 'iman' ? meta : Math.round(pos)) + k); }
    }, { passive: false });
    host.addEventListener('keydown', e => {
      const base = modo === 'iman' ? meta : Math.round(pos);
      const k = { ArrowDown: base + 1, ArrowUp: base - 1, PageDown: base + 5, PageUp: base - 5, Home: 0, End: n - 1 }[e.key];
      if (k == null) return;
      e.preventDefault(); va(k);
    });
    host.addEventListener('focus', () => host.classList.add('is-foco'));
    host.addEventListener('blur', () => host.classList.remove('is-foco'));

    return { pone, va, valor: () => valor, pos: () => pos };
  }

  /* =====================================================================
     La escena
     ===================================================================== */
  function Rueda(raiz, opciones) {
    const o = Object.assign({ hoy: [2026, 10, 13], inicial: [2026, 10, 14], desde: 2024, hasta: 2040, reinicio: +raiz.dataset.reinicio || 0, alFijar: null }, opciones);
    const $ = s => raiz.querySelector(s);
    const tarjeta = $('.rd-tarjeta'), banda = $('.rd-banda'), btn = $('[data-fijar]'), btnTxt = $('[data-fijar-txt]');
    const cuerpo = $('[data-cal-cuerpo]'), sel = $('.rd-cal-sel'), calTit = $('[data-cal-tit]');
    const chip = $('[data-chip]'), anuncio = $('[data-anuncio]');
    raiz.style.setProperty('--rd-giro', M_GIRO.duracion + 'ms');
    raiz.style.setProperty('--rd-curva-giro', M_GIRO.easing);

    const anios = []; for (let a = o.desde; a <= o.hasta; a++) anios.push(String(a));
    let f = { a: o.inicial[0], m: o.inicial[1], d: o.inicial[2] };
    let fijada = false, vibraT = 0, reiniT = 0, ruedasListas = false, anunT = 0, gridMes = '';

    const cGran = Cifras($('[data-gran]'));
    const pMes = Palabra($('[data-mes]')), pAnio = Palabra($('[data-anio]')), pSemana = Palabra($('[data-semana]')), pChip = Palabra($('[data-chip-t]'));
    let ultEpoca = diasCivil(f.a, f.m, f.d);

    /* ── los tres rodillos ─────────────────────────────────────────── */
    const rDia = Rodillo($('[data-rueda-dia]'), { nombre: 'Día', alCambiar: i => desde('dia', i) });
    const rMes = Rodillo($('[data-rueda-mes]'), { nombre: 'Mes', alCambiar: i => desde('mes', i) });
    const rAnio = Rodillo($('[data-rueda-anio]'), { nombre: 'Año', alCambiar: i => desde('anio', i) });
    const listaDias = n => Array.from({ length: n }, (_, i) => String(i + 1));
    rDia.pone(listaDias(diasMes(f.m, f.a)), f.d - 1);
    rMes.pone(MESES.map(m => m[0].toUpperCase() + m.slice(1)), f.m - 1);
    rAnio.pone(anios, f.a - o.desde);
    ruedasListas = true;

    function desde(cual, i) {          // un rodillo cambió de fila
      if (!ruedasListas) return;
      tic();
      if (cual === 'dia') f.d = i + 1;
      else if (cual === 'mes') f.m = i + 1;
      else f.a = o.desde + i;
      const dm = diasMes(f.m, f.a);
      if (cual !== 'dia') {
        const nDias = listaDiasN();
        if (dm !== nDias) { const cae = f.d > dm; rDia.pone(listaDias(dm)); if (cae) { f.d = dm; rDia.va(dm - 1, false, true); } }
        else if (f.d > dm) f.d = dm;
      }
      muestra();
    }
    let ticT = 0;
    function tic() {                   // un «clic» de la banda cada vez que una fila pasa (como un trinquete)
      const t = performance.now();
      if (sinMov() || t - ticT < 70) return;
      ticT = t;
      banda.animate([{ transform: 'scaleY(1)' }, { transform: 'scale(1.012, 1.1)', offset: .35 }, { transform: 'scaleY(1)' }], { duration: 150, easing: 'ease-out' });
    }
    const listaDiasN = () => document.querySelectorAll('[data-rueda-dia] .rd-it').length;

    /* ── la lectura y el calendario ────────────────────────────────── */
    function muestra() {
      const hoyN = diasCivil(...o.hoy), n = diasCivil(f.a, f.m, f.d), dif = n - hoyN;
      const sube = n >= ultEpoca; ultEpoca = n;
      cGran.pon(f.d);
      pMes.pon(MESES[f.m - 1], sube); pAnio.pon(String(f.a), sube);
      const sem = SEMANA[diaSemana(f.a, f.m, f.d)];
      pSemana.pon(sem, sube);
      let t;
      if (dif < 0) t = dif === -1 ? 'Ayer' : 'Hace ' + (-dif) + ' días';
      else if (dif === 0) t = 'Es hoy';
      else if (dif === 1) t = 'Mañana';
      else if (dif < 60) t = 'En ' + dif + ' días';
      else if (dif < 365) t = 'En ' + Math.round(dif / 30.4) + ' meses';
      else t = 'En más de un año';
      if (fijada) t = 'Fecha fijada';
      pChip.pon(t, sube);
      chip.classList.toggle('is-pasada', dif < 0 && !fijada);
      chip.classList.toggle('is-ok', fijada);
      const ok = dif >= 0;
      btn.disabled = !ok || fijada;
      if (!fijada) btnTxt.textContent = ok ? 'Fijar fecha' : 'Elige una fecha futura';
      cal();
      clearTimeout(anunT);
      anunT = setTimeout(() => { anuncio.textContent = sem[0].toUpperCase() + sem.slice(1) + ' ' + f.d + ' de ' + MESES[f.m - 1] + ' de ' + f.a + '. ' + t; }, 350);
    }

    function cal() {
      const clave = f.a + '-' + f.m;
      calTit.textContent = MESES[f.m - 1] + ' ' + f.a;
      if (clave !== gridMes) construyeGrid(clave);
      // la selección: el círculo viaja con resorte a su celda
      const primero = diaSemana(f.a, f.m, 1), k = primero + f.d - 1, col = k % 7, fila = Math.floor(k / 7);
      posicionaSel(col, fila);
      cuerpo.querySelectorAll('.rd-dia').forEach(b => {
        const es = +b.dataset.d === f.d && !b.classList.contains('is-fuera');
        b.classList.toggle('is-sel', es); b.tabIndex = es ? 0 : -1; b.setAttribute('aria-pressed', es);
      });
    }
    let selAnim = null;
    function posicionaSel(col, fila) {
      const w = cuerpo.clientWidth / 7, h = 30;
      const x = col * w + w / 2 - 14, y = fila * h + h / 2 - 14;
      const ant = sel.dataset.x === undefined ? null : [+sel.dataset.x, +sel.dataset.y];
      sel.dataset.x = x; sel.dataset.y = y;
      if (!ant || sinMov()) { sel.style.transform = 'translate(' + x + 'px,' + y + 'px)'; return; }
      if (selAnim) selAnim.cancel();
      const act = getComputedStyle(sel).transform, m = act && act !== 'none' ? new DOMMatrixReadOnly(act) : null;
      const x0 = m ? m.m41 : ant[0], y0 = m ? m.m42 : ant[1];
      selAnim = sel.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px)' }, { transform: 'translate(' + x + 'px,' + y + 'px)' }], { duration: M_SEL.duracion, easing: M_SEL.easing, fill: 'forwards' });
      selAnim.onfinish = () => { sel.style.transform = 'translate(' + x + 'px,' + y + 'px)'; selAnim && selAnim.cancel(); selAnim = null; };
    }
    function construyeGrid(clave) {
      const antes = gridMes; gridMes = clave;
      const grids = Array.from(cuerpo.querySelectorAll('.rd-grid'));
      grids.slice(0, -1).forEach(g0 => g0.remove());   // si se pasa rápido por varios meses, solo sale la última
      const viejo = grids[grids.length - 1];
      const g = document.createElement('div'); g.className = 'rd-grid'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Días de ' + MESES[f.m - 1] + ' de ' + f.a);
      const primero = diaSemana(f.a, f.m, 1), dm = diasMes(f.m, f.a), ma = f.m === 1 ? 12 : f.m - 1, dma = diasMes(ma, f.m === 1 ? f.a - 1 : f.a);
      const hoyN = o.hoy;
      for (let k = 0; k < 42; k++) {
        const num = k - primero + 1, b = document.createElement('button');
        b.type = 'button'; b.className = 'rd-dia'; b.tabIndex = -1;
        if (num < 1) { b.textContent = dma + num; b.classList.add('is-fuera'); b.dataset.d = dma + num; b.dataset.mes = -1; }
        else if (num > dm) { b.textContent = num - dm; b.classList.add('is-fuera'); b.dataset.d = num - dm; b.dataset.mes = 1; }
        else { b.textContent = num; b.dataset.d = num; b.dataset.mes = 0; if (f.a === hoyN[0] && f.m === hoyN[1] && num === hoyN[2]) b.classList.add('is-hoy'); }
        if (b.classList.contains('is-fuera')) { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
        g.appendChild(b);
      }
      cuerpo.appendChild(g);
      if (viejo && antes) {
        const dir = (f.a * 12 + f.m) >= (+antes.split('-')[0] * 12 + +antes.split('-')[1]) ? 1 : -1;
        if (sinMov()) viejo.remove();
        else {
          viejo.style.pointerEvents = 'none';
          viejo.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(' + -dir * 26 + 'px)', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }).onfinish = () => viejo.remove();
          g.animate([{ transform: 'translateX(' + dir * 26 + 'px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
        }
      } else if (viejo) viejo.remove();
    }

    /* ── girar los rodillos a una fecha (desde el calendario o el reinicio) ── */
    function pon(a, m, d, rapido) {
      a = entre(a, o.desde, o.hasta); m = entre(m, 1, 12); d = entre(d, 1, diasMes(m, a));
      const cambia = m !== f.m || a !== f.a;
      f = { a, m, d };
      ruedasListas = false;
      if (cambia) rDia.pone(listaDias(diasMes(m, a)));
      ruedasListas = true;
      rAnio.va(a - o.desde, rapido, true); rMes.va(m - 1, rapido, true); rDia.va(d - 1, rapido, true);
      muestra();
    }
    function suma(dias) {   // moverse N días en el calendario
      let a = f.a, m = f.m, d = f.d + dias;
      while (d > diasMes(m, a)) { d -= diasMes(m, a); m++; if (m > 12) { m = 1; a++; } }
      while (d < 1) { m--; if (m < 1) { m = 12; a--; } d += diasMes(m, a); }
      pon(a, m, d);
    }
    function mesDelta(k) {
      let m = f.m + k, a = f.a;
      while (m > 12) { m -= 12; a++; } while (m < 1) { m += 12; a--; }
      pon(a, m, Math.min(f.d, diasMes(m, a)));
    }
    cuerpo.addEventListener('click', e => {
      const b = e.target.closest('.rd-dia'); if (!b || fijada) return;
      let a = f.a, m = f.m + (+b.dataset.mes);
      if (m > 12) { m = 1; a++; } else if (m < 1) { m = 12; a--; }
      pon(a, m, +b.dataset.d);
    });
    cuerpo.addEventListener('keydown', e => {
      const k = { ArrowLeft: () => suma(-1), ArrowRight: () => suma(1), ArrowUp: () => suma(-7), ArrowDown: () => suma(7), PageUp: () => mesDelta(-1), PageDown: () => mesDelta(1) }[e.key];
      if (!k) return;
      e.preventDefault(); k();
      requestAnimationFrame(() => { const b = cuerpo.querySelector('.rd-dia.is-sel'); if (b) b.focus({ preventScroll: true }); });
    });
    $('[data-mes-menos]').addEventListener('click', () => { if (!fijada) mesDelta(-1); });
    $('[data-mes-mas]').addEventListener('click', () => { if (!fijada) mesDelta(1); });

    /* ── fijar: los rodillos vibran, la banda se enciende, ✓ ───────── */
    function vibra(el, ms, amp, retraso) {
      if (sinMov()) return;
      el.animate([0, -1, .9, -.7, .5, -.3, 0].map((k, i) => ({ transform: 'translateX(' + (k * amp) + 'px)', offset: i / 6 })), { duration: ms, delay: retraso || 0, easing: 'ease-out' });
    }
    function fijar() {
      if (fijada || btn.disabled) return;
      fijada = true; clearTimeout(reiniT);
      raiz.classList.add('is-fijada');
      btnTxt.textContent = 'Fecha fijada';
      btn.disabled = true; muestra();
      raiz.querySelectorAll('.rd-rueda').forEach((r, i) => vibra(r, 420, 4.5, i * 45));
      vibra(tarjeta, 380, 2.4, 0);
      banda.classList.remove('is-flash'); void banda.offsetWidth; banda.classList.add('is-flash');
      const datos = { anio: f.a, mes: f.m, dia: f.d, iso: f.a + '-' + dos(f.m) + '-' + dos(f.d) };
      if (o.alFijar) Promise.resolve(o.alFijar(datos)).catch(() => {});
      if (o.reinicio) reiniT = setTimeout(reinicia, o.reinicio);
    }
    function reinicia() {
      clearTimeout(reiniT);
      fijada = false; raiz.classList.remove('is-fijada');
      pon(o.inicial[0], o.inicial[1], o.inicial[2]);
    }
    btn.addEventListener('click', fijar);

    // el círculo del calendario se coloca bien al cambiar el tamaño de la tarjeta
    if (window.ResizeObserver) new ResizeObserver(() => { sel.dataset.x = ''; delete sel.dataset.x; cal(); }).observe(cuerpo);

    muestra();
    return {
      fecha: () => ({ anio: f.a, mes: f.m, dia: f.d }),
      pon: (a, m, d) => pon(a, m, d), reinicia, fijar,
    };
  }

  window.Rueda = Rueda;
  document.querySelectorAll('[data-rueda]').forEach(el => { el.rueda = Rueda(el); });
})();
