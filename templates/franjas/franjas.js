/* =====================================================================
   Franjas · Moxen
   Fijar la disponibilidad de la semana pintando franjas horarias, como en
   una página de reservas. La rejilla son siete días por media hora; lo que
   se pinta son celdas, y las celdas contiguas de un día se dibujan como UNA
   franja de bordes redondeados (cada franja es un elemento con resortes, así
   que al unirse, partirse o estirarse se mueve en vez de saltar).

   · Arrastrar pinta: una pincelada translúcida sigue al puntero con
     resortes y dice el rango («9:00 – 12:30 · 3,5 h»); al soltar, se vuelve
     franja y se une a las vecinas. Mayús (o la herramienta «Borrar») borra:
     la pincelada se rayada y las franjas se encogen o se parten.
   · El borde de una franja se estira: sigue al puntero con un tirón elástico
     y se imanta a la media hora, con una etiqueta que dice la hora.
   · «Copiar a los demás días» propaga el día seleccionado con una onda que
     se abre desde él; cada día recibe su franja con un destello.
   · Arriba a la izquierda, la cifra de horas semanales rueda dígito a dígito
     (y abre un «,5» si hay media hora), cada día muestra sus horas y un resumen
     en lenguaje natural («Lun a vie, de 9:00 a 13:00 y de 14:00 a 18:00») se
     reescribe letra a letra: borra solo lo que cambió y escribe el resto.
   · Teclado: Tab entra en la rejilla; las flechas mueven el cursor, Espacio
     (o Intro) empieza una pincelada, las flechas la estiran y Espacio la
     confirma (Esc la cancela, Mayús+Espacio borra); Supr borra la franja del
     cursor; ⌘Z o Ctrl+Z deshace (también el botón «Deshacer»).
   · Con movimiento reducido todo llega de una vez, sin resortes ni ondas.

   Montaje (se inicia solo sobre [data-franjas]; el HTML de esta demo es la plantilla):
     const f = Franjas(document.querySelector('[data-franjas]'), {
       abre: 8, cierra: 20,           // horas visibles (cada una son dos filas)
       ahora: [2, 11 * 60 + 10],      // [día 0-6, minuto del día] de la línea ámbar; null la quita
       inicial: { 0: [[9, 13], [14, 18]], 1: …, },   // día → franjas [desde, hasta] en horas (admite 9.5)
       alCambiar: ({ horas, resumen, dias }) => {},  // tras cada cambio: horas semanales, el texto y {0: [[9, 13]], …}
     });
     f.dias();                        // { 0: [['9:00', '13:00'], …], … }
     f.copiar(4);                     // copia el viernes a los demás días
     f.deshacer(); f.vaciar();

   Qué cambia qué: los colores y el alto de media hora (--fr-fila) están al
   principio de franjas.css (el ámbar es solo de la hora actual); los resortes
   están juntos en MUELLES y los textos de los días en DIAS. Sin dependencias; el
   tiempo sale de requestAnimationFrame y timers, y no hay azar: la página y el
   vídeo coinciden.
   ===================================================================== */
(function () {
  'use strict';

  /* ── utilidades ───────────────────────────────────────────────────── */
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const quieto = () => mq.matches;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  // un resorte: x es el valor, meta a dónde va, k la rigidez, c la amortiguación y e la precisión de reposo
  const resorte = (x, par, e) => ({ x, v: 0, meta: x, k: par.k, c: par.c, e: e || .05 });
  function avanza(r, dt) {
    for (let t = dt; t > 0;) {
      const h = Math.min(t, 1 / 240);
      r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h;
      r.x += r.v * h;
      t -= h;
    }
  }
  const enReposo = r => Math.abs(r.v) < r.e * 4 && Math.abs(r.meta - r.x) < r.e;
  const fija = r => { r.x = r.meta; r.v = 0; };
  // avanza un resorte y dice si hay que pintar este cuadro; con movimiento reducido llega de una vez
  function paso(r, dt) {
    if (quieto() || enReposo(r)) { const c = r.x !== r.meta; fija(r); return c; }
    avanza(r, dt);
    if (enReposo(r)) fija(r);
    return true;
  }
  // un resorte convertido en curva CSS linear(), para lo que se mueve con CSS (la pastilla de la herramienta)
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

  /* los resortes: la franja que cambia de tamaño se acomoda sin rebotar mucho, la pincelada obedece
     casi sin rebote, el borde estirado es elástico y los dígitos ruedan con un pequeño rebote */
  const MUELLES = {
    franja: { k: 400, c: 31 },
    previa: { k: 700, c: 46 },
    celda: { k: 820, c: 52 },
    borde: { k: 520, c: 27 },
    cifra: { k: 150, c: 15 },
    pastilla: { k: 420, c: 24 },
  };

  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIAS_MIN = DIAS.map(d => d.toLowerCase());          // para las frases: «Lun a jue; vie»
  const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DIAS_INICIO = { 0: [[9, 13], [14, 18]], 1: [[9, 13], [14, 18]], 2: [[9, 13], [14, 18]], 3: [[9, 13], [14, 18]] };

  const hm = min => { const h = Math.floor(min / 60), m = min % 60; return h + ':' + (m < 10 ? '0' : '') + m; };
  const nh = x => String(x).replace('.', ',');                 // 3.5 → «3,5»

  /* los tramos de un día: celdas contiguas pintadas, como [desde, hasta) en filas */
  function tramos(col) {
    const out = [];
    let a = -1;
    for (let r = 0; r <= col.length; r++) {
      const on = r < col.length && col[r];
      if (on && a < 0) a = r;
      if (!on && a >= 0) { out.push([a, r]); a = -1; }
    }
    return out;
  }

  function Franjas(raiz, opciones) {
    const o = Object.assign({ abre: 8, cierra: 20, ahora: [2, 11 * 60 + 10], inicial: DIAS_INICIO, alCambiar: null }, opciones || {});
    const N = (o.cierra - o.abre) * 2;
    const celdaMin = f => o.abre * 60 + f * 30;                     // minuto del día de una fila (o de su borde superior)
    const cel = Array.from({ length: 7 }, () => new Uint8Array(N));
    raiz.style.setProperty('--fr-filas', N);
    raiz.style.setProperty('--fr-muelle', muelle(MUELLES.pastilla.k, MUELLES.pastilla.c));

    const rejilla = raiz.querySelector('[data-rejilla]');
    const totalEl = raiz.querySelector('[data-total]');
    const resumenEl = raiz.querySelector('[data-resumen]');
    const modoEl = raiz.querySelector('[data-modo]');
    const btnCopiar = raiz.querySelector('[data-copiar]');
    const btnDeshacer = raiz.querySelector('[data-deshacer]');
    const btnVaciar = raiz.querySelector('[data-vaciar]');
    const avisoEl = raiz.querySelector('[data-aviso]');

    /* ── la rejilla: encabezados de día, eje de horas y el cuerpo ─────── */
    let h = '<div class="fr-cab">';
    DIAS.forEach((d, i) => { h += '<div class="fr-dia" data-d="' + i + '"><b>' + d + '</b><em>0 h</em></div>'; });
    h += '</div><div class="fr-eje" aria-hidden="true">';
    for (let k = 0; k <= o.cierra - o.abre; k++) h += '<span style="top:' + (k * 2 / N * 100) + '%">' + (o.abre + k) + ':00</span>';
    h += '</div><div class="fr-cuerpo" tabindex="0" role="application" aria-roledescription="rejilla de disponibilidad" aria-label="Disponibilidad semanal. Flechas para moverte, Espacio para pintar o confirmar, Supr para borrar una franja."></div>';
    rejilla.innerHTML = h;
    const cuerpo = rejilla.querySelector('.fr-cuerpo');
    const cabs = Array.from(rejilla.querySelectorAll('.fr-dia'));
    const etiquetasEje = Array.from(rejilla.querySelectorAll('.fr-eje span'));
    cuerpo.insertAdjacentHTML('beforeend',
      '<i class="fr-celda"></i><div class="fr-previa"><span class="fr-previa-t"></span></div><span class="fr-chip"></span>' +
      (o.ahora ? '<div class="fr-ahora"><i></i><span>' + hm(o.ahora[1]) + '</span></div>' : ''));
    const celdaEl = cuerpo.querySelector('.fr-celda');
    const previaEl = cuerpo.querySelector('.fr-previa');
    const previaT = previaEl.querySelector('.fr-previa-t');
    const chipEl = cuerpo.querySelector('.fr-chip');
    const ahoraEl = cuerpo.querySelector('.fr-ahora');

    /* ── medidas: ancho de una columna y alto de media hora ─────────── */
    let CW = 100, RH = 22, rc = null;
    const GX = 3, GY = 2;                                           // aire entre la franja y la línea de la celda
    function mide() {
      CW = cuerpo.clientWidth / 7;
      RH = cuerpo.clientHeight / N;
      rc = cuerpo.getBoundingClientRect();
      rejilla.classList.toggle('fr-estrecho', CW < 62);
      raiz.classList.toggle('fr-estrecho', CW < 62);
      if (ahoraEl) {
        const y = (o.ahora[1] - o.abre * 60) / 30 * RH;
        ahoraEl.style.top = y + 'px';
        const p = ahoraEl.querySelector('i');
        p.style.left = (o.ahora[0] * CW + 7) + 'px';
        p.style.setProperty('--fr-col', (CW - 14) + 'px');
        const et = ahoraEl.querySelector('span');           // la hora, al final del tramo ámbar del día de hoy
        et.style.left = ((o.ahora[0] + 1) * CW - 8) + 'px';
        ahoraEl.style.display = (y < 0 || y > N * RH) ? 'none' : '';
      }
    }
    const rectDe = (d, a, b) => ({ x: d * CW + GX, w: CW - 2 * GX, y: a * RH + GY, h: (b - a) * RH - 2 * GY });

    /* ── las franjas: una por tramo, con resortes de posición, alto y opacidad ── */
    const franjas = [];
    let seq = 0, vivo = false, raf = 0, tAnt = 0;
    function creaFranja(d, a, b) {
      const el = document.createElement('div');
      el.className = 'fr-franja';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<i class="fr-grip fr-grip-t"></i><div class="fr-fr-txt"><b></b><em></em></div><i class="fr-grip fr-grip-b"></i>';
      cuerpo.insertBefore(el, celdaEl.nextSibling);
      const f = { id: ++seq, d, a, b, el, tx: el.querySelector('b'), du: el.querySelector('em'),
        top: resorte(0, MUELLES.franja), alto: resorte(0, MUELLES.franja), op: resorte(0, { k: 260, c: 28 }, .01), pinta: true, muerta: false, arrastre: null };
      el._f = f;
      franjas.push(f);
      return f;
    }
    function etiqueta(f) {
      f.tx.textContent = CW < 62 ? hm(celdaMin(f.a)) : hm(celdaMin(f.a)) + ' – ' + hm(celdaMin(f.b));     // en columnas estrechas, solo la hora de inicio
      f.du.textContent = nh((f.b - f.a) / 2) + ' h';
      f.el.classList.toggle('es-corta', f.b - f.a < 3);
    }
    // adónde va una franja: sus filas (o, si se estira su borde, el borde elástico del puntero)
    function apunta(f) {
      let t = f.a * RH + GY, b = f.b * RH - GY;
      if (f.arrastre) { if (f.arrastre.lado === 't') t = f.arrastre.v + GY; else b = f.arrastre.v - GY; }
      f.top.meta = t;
      f.alto.meta = Math.max(0, b - t);
      f.op.meta = 1;
      etiqueta(f);
    }
    function pintaFranja(f) {
      const x = f.d * CW + GX;
      f.el.style.width = (CW - 2 * GX) + 'px';
      f.el.style.transform = 'translate3d(' + x + 'px,' + f.top.x.toFixed(2) + 'px,0)';
      f.el.style.height = Math.max(0, f.alto.x).toFixed(2) + 'px';
      f.el.style.opacity = lim(f.op.x, 0, 1).toFixed(3);
    }
    // una franja que se va: se encoge hacia otra (si se fundió con ella) o hacia su centro
    function mata(f, hacia) {
      f.muerta = true;
      if (hacia) { f.top.meta = hacia.y; f.alto.meta = hacia.h; } else { f.top.meta = f.top.x + f.alto.x / 2; f.alto.meta = 0; }
      f.op.meta = 0;
      f.arrastre = null;
      despierta();
      setTimeout(() => {
        f.el.remove();
        const i = franjas.indexOf(f);
        if (i >= 0) franjas.splice(i, 1);
      }, quieto() ? 0 : 520);
    }

    /* La reconciliación: de las celdas salen los tramos; cada tramo se queda con la franja con la que más
       se solapa (así se estira, se encoge o absorbe a otra) y los que sobran nacen o mueren.
       op.previa: la pincelada de la que nacen las franjas nuevas · op.retraso: ms entre franja y franja */
    function reconcilia(op) {
      op = op || {};
      let k = 0;
      for (let d = 0; d < 7; d++) {
        const runs = tramos(cel[d]);
        const previas = franjas.filter(f => f.d === d && !f.muerta);
        const usadas = new Set();
        const sinFranja = [];
        runs.forEach(run => {
          let mejor = null, mo = 0;
          previas.forEach(f => {
            if (usadas.has(f)) return;
            const ov = Math.min(f.b, run[1]) - Math.max(f.a, run[0]);
            if (ov > mo) { mo = ov; mejor = f; }
          });
          if (mejor) { usadas.add(mejor); mejor.a = run[0]; mejor.b = run[1]; apunta(mejor); }
          else sinFranja.push(run);
        });
        sinFranja.forEach(run => {
          const f = creaFranja(d, run[0], run[1]);
          // de dónde nace: de la pincelada, de la franja que se partió o, si no, de su propio borde de arriba
          const padre = previas.find(p => Math.min(p.b, run[1]) > Math.max(p.a, run[0]));
          let t0 = run[0] * RH + GY, h0 = 0;
          if (op.previa && d >= op.previa.d0 && d <= op.previa.d1) { t0 = op.previa.t; h0 = op.previa.b - op.previa.t; }
          else if (padre) { t0 = padre.top.x; h0 = padre.alto.x; }
          f.top.x = t0; f.alto.x = h0; f.op.x = (padre || op.previa) ? .6 : 0;
          apunta(f);
          const lanza = () => { if (!f.muerta) { apunta(f); } };
          if (op.retraso && !quieto()) { f.top.meta = t0; f.alto.meta = h0; f.op.meta = 0; setTimeout(lanza, k * op.retraso); k++; }
          if (!quieto()) { f.el.classList.add('nace'); setTimeout(() => f.el.classList.remove('nace'), 700); }
          if (quieto()) { fija(f.top); fija(f.alto); fija(f.op); }
        });
        previas.forEach(f => {
          if (usadas.has(f)) return;
          const absorbe = runs.find(r => Math.min(f.b, r[1]) > Math.max(f.a, r[0]));
          mata(f, absorbe ? rectDe(d, absorbe[0], absorbe[1]) : null);
        });
      }
      franjas.forEach(f => { f.pinta = true; });
      despierta();
    }

    /* ── el bucle de animación ─────────────────────────────────────── */
    const pv = { l: resorte(0, MUELLES.previa), t: resorte(0, MUELLES.previa), r: resorte(0, MUELLES.previa), b: resorte(0, MUELLES.previa), vivo: false };
    const ce = { x: resorte(0, MUELLES.celda), y: resorte(0, MUELLES.celda), w: CW, h: RH, vivo: false };
    const ch = { x: resorte(0, MUELLES.borde), y: resorte(0, MUELLES.borde), vivo: false };
    function despierta() { if (!raf) { tAnt = 0; raf = requestAnimationFrame(tick); } }
    function tick(t) {
      raf = 0;
      const dt = tAnt ? lim((t - tAnt) / 1000, .001, .05) : 1 / 60;
      tAnt = t;
      let sigue = false;
      for (const f of franjas) {
        const m = paso(f.top, dt) | paso(f.alto, dt) | paso(f.op, dt);
        if (m || f.pinta) { pintaFranja(f); f.pinta = !!m; }
        if (m) sigue = true;
      }
      if (pv.vivo) {
        const m = paso(pv.l, dt) | paso(pv.t, dt) | paso(pv.r, dt) | paso(pv.b, dt);
        previaEl.style.transform = 'translate3d(' + pv.l.x.toFixed(2) + 'px,' + pv.t.x.toFixed(2) + 'px,0)';
        previaEl.style.width = Math.max(0, pv.r.x - pv.l.x).toFixed(2) + 'px';
        previaEl.style.height = Math.max(0, pv.b.x - pv.t.x).toFixed(2) + 'px';
        if (m) sigue = true; else if (!trazo) pv.vivo = false;
        if (trazo) sigue = true;
      }
      if (ce.vivo) {
        const m = paso(ce.x, dt) | paso(ce.y, dt);
        celdaEl.style.transform = 'translate3d(' + ce.x.x.toFixed(2) + 'px,' + ce.y.x.toFixed(2) + 'px,0)';
        if (m) sigue = true; else ce.vivo = false;
      }
      if (ch.vivo) {
        const m = paso(ch.x, dt) | paso(ch.y, dt);
        chipEl.style.transform = 'translate3d(' + ch.x.x.toFixed(2) + 'px,' + ch.y.x.toFixed(2) + 'px,0)';
        if (m) sigue = true; else ch.vivo = false;
      }
      if (cifras(dt)) sigue = true;
      if (escribiendo(dt)) sigue = true;
      if (sigue) raf = requestAnimationFrame(tick); else tAnt = 0;
    }

    /* ── la cifra de horas: dos dígitos que ruedan, y un «,5» ────────── */
    const digs = [];
    for (let i = 0; i < 2; i++) {
      const el = document.createElement('span');
      el.className = 'fr-dig';
      el.innerHTML = '<span class="fr-tira">' + '<i></i>' + Array.from({ length: 10 }, (_, n) => '<i>' + n + '</i>').join('') + '</span>';
      totalEl.appendChild(el);
      digs.push({ tira: el.firstChild, pos: resorte(0, MUELLES.cifra, .004), vivo: true });
    }
    const medioEl = document.createElement('span');
    medioEl.className = 'fr-medio';
    medioEl.textContent = ',5';
    totalEl.appendChild(medioEl);
    function ponCifra(horas, instante) {
      const entero = Math.floor(horas);
      digs[0].pos.meta = entero >= 10 ? Math.floor(entero / 10) + 1 : 0;
      digs[1].pos.meta = entero % 10 + 1;
      medioEl.classList.toggle('is-visible', horas % 1 !== 0);
      totalEl.setAttribute('aria-label', nh(horas) + (horas === 1 ? ' hora' : ' horas'));
      if (instante || quieto()) digs.forEach(d => { fija(d.pos); d.vivo = true; });
      despierta();
    }
    function cifras(dt) {
      let m = false;
      for (const d of digs) {
        const c = paso(d.pos, dt);
        if (c || d.vivo) {
          d.tira.style.transform = 'translateY(' + (-d.pos.x).toFixed(3) + 'em)';
          // un poco de desenfoque mientras gira, según la velocidad
          const bl = Math.min(1.6, Math.abs(d.pos.v) * .06);
          d.tira.style.filter = bl > .15 ? 'blur(' + bl.toFixed(2) + 'px)' : '';
          d.vivo = !!c;
        }
        if (c) m = true;
      }
      return m;
    }

    /* ── el resumen en palabras, que se escribe letra a letra ────────── */
    const tip = { actual: '', meta: '', acc: 0 };
    function escribiendo(dt) {
      if (tip.actual === tip.meta) { resumenEl.classList.remove('escribe'); return false; }
      resumenEl.classList.add('escribe');
      let p = 0;
      while (p < tip.actual.length && p < tip.meta.length && tip.actual[p] === tip.meta[p]) p++;
      const borrando = tip.actual.length > p;
      tip.acc += dt * (borrando ? 240 : 68);                       // borrar es rápido; escribir, letra a letra
      const n = Math.floor(tip.acc);
      if (!n) return true;
      tip.acc -= n;
      tip.actual = borrando ? tip.actual.slice(0, Math.max(p, tip.actual.length - n)) : tip.meta.slice(0, tip.actual.length + n);
      resumenEl.textContent = tip.actual;
      return true;
    }
    function ponResumen(txt, instante) {
      tip.meta = txt;
      if (instante || quieto()) { tip.actual = txt; resumenEl.textContent = txt; return; }
      despierta();
    }
    // las horas como lenguaje natural: los días con las mismas franjas se agrupan («Lun a vie»)
    function describe() {
      const grupos = new Map();
      for (let d = 0; d < 7; d++) {
        const t = tramos(cel[d]);
        if (!t.length) continue;
        const clave = t.map(r => r.join('-')).join('|');
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(d);
      }
      if (!grupos.size) return 'Aún no hay franjas. Arrastra sobre la rejilla para pintarlas.';
      const unir = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
      const partes = [];
      grupos.forEach((dias, clave) => {
        const rangos = clave.split('|').map(s => { const [a, b] = s.split('-').map(Number); return 'de ' + hm(celdaMin(a)) + ' a ' + hm(celdaMin(b)); });
        let dd;
        if (dias.length === 7) dd = 'todos los días';
        else {
          const sub = [];
          let ini = dias[0], prev = dias[0];
          const cierra = () => { sub.push(prev === ini ? DIAS_MIN[ini] : (prev === ini + 1 ? DIAS_MIN[ini] + ' y ' + DIAS_MIN[prev] : DIAS_MIN[ini] + ' a ' + DIAS_MIN[prev])); };
          for (let i = 1; i < dias.length; i++) { if (dias[i] === prev + 1) { prev = dias[i]; continue; } cierra(); ini = prev = dias[i]; }
          cierra();
          dd = unir(sub);
        }
        partes.push((partes.length ? dd : dd[0].toUpperCase() + dd.slice(1)) + ', ' + unir(rangos));
      });
      return partes.join('; ') + '.';
    }

    /* ── totales ───────────────────────────────────────────────────── */
    let horasPrev = -1;
    const horasDia = [-1, -1, -1, -1, -1, -1, -1];
    function cuenta(instante) {
      let tot = 0;
      for (let d = 0; d < 7; d++) {
        let n = 0;
        for (let r = 0; r < N; r++) n += cel[d][r];
        tot += n;
        if (n !== horasDia[d]) {
          const em = cabs[d].querySelector('em');
          em.textContent = nh(n / 2) + ' h';
          if (horasDia[d] >= 0 && !quieto()) { em.classList.remove('pop'); void em.offsetWidth; em.classList.add('pop'); }
          horasDia[d] = n;
        }
      }
      const horas = tot / 2;
      if (horas !== horasPrev) { ponCifra(horas, instante); horasPrev = horas; }
      btnCopiar.disabled = !tot;
      btnVaciar.disabled = !tot;
    }
    // todo lo que cambia tras un cambio: la cifra, el resumen (escrito) y los avisos
    function cambio(anuncio) {
      revisaDia();
      cuenta();
      const txt = describe();
      ponResumen(txt);
      if (anuncio) avisoEl.textContent = anuncio + ' ' + txt;
      if (o.alCambiar) o.alCambiar({ horas: horasPrev, resumen: txt, dias: datos() });
    }
    function datos() {
      const out = {};
      for (let d = 0; d < 7; d++) { const t = tramos(cel[d]); if (t.length) out[d] = t.map(r => [celdaMin(r[0]) / 60, celdaMin(r[1]) / 60]); }
      return out;
    }

    /* ── la historia para deshacer: una foto de las celdas antes de cada cambio ── */
    const hist = [];
    const foto = () => cel.map(c => c.join('')).join('/');
    function restaura(s) { s.split('/').forEach((fila, d) => { for (let r = 0; r < N; r++) cel[d][r] = fila.charCodeAt(r) - 48; }); }
    function guarda(f) { hist.push(f || foto()); if (hist.length > 50) hist.shift(); btnDeshacer.disabled = false; }
    function deshace() {
      if (!hist.length) return;
      restaura(hist.pop());
      btnDeshacer.disabled = !hist.length;
      reconcilia();
      cambio('Cambio deshecho.');
    }

    /* ── seleccionar un día: es el origen de «Copiar a los demás días» ── */
    let selDia = -1;
    function ponDia(d) {
      selDia = d;
      cabs.forEach((c, i) => c.classList.toggle('is-sel', i === d));
    }
    // un día sin franjas deja de estar seleccionado (la marca solo acompaña a lo que se puede copiar)
    const revisaDia = () => { if (selDia >= 0 && !cel[selDia].some(Boolean)) ponDia(-1); };

    /* ── herramienta (pintar / borrar) y Mayús ───────────────────────── */
    let herr = 'pintar', shift = false;
    const borrando = () => shift || herr === 'borrar';
    function ponHerr(h) {
      herr = h;
      modoEl.dataset.herr = h;
      modoEl.querySelectorAll('button').forEach(b => {
        const on = b.dataset.herr === h;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      actualizaModo();
    }
    function actualizaModo() {
      const b = borrando();
      cuerpo.classList.toggle('is-borra', b);
      previaEl.classList.toggle('es-borra', b);
    }
    modoEl.addEventListener('click', e => { const b = e.target.closest('[data-herr]'); if (b) ponHerr(b.dataset.herr); });
    modoEl.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        ponHerr(herr === 'pintar' ? 'borrar' : 'pintar');
        modoEl.querySelector('[aria-checked="true"]').focus();
      }
    });
    const mira = e => { if (e.key === 'Shift') { shift = e.type === 'keydown'; actualizaModo(); } };
    window.addEventListener('keydown', mira);
    window.addEventListener('keyup', mira);
    window.addEventListener('blur', () => { shift = false; actualizaModo(); });

    /* ── la celda bajo el puntero y la etiqueta del eje ──────────────── */
    function ponCelda(d, r, instante) {
      ce.x.meta = d * CW + GX; ce.y.meta = r * RH + GY;
      celdaEl.style.width = (CW - 2 * GX) + 'px'; celdaEl.style.height = (RH - 2 * GY) + 'px';
      if (instante || quieto() || !celdaEl.classList.contains('is-visible')) { fija(ce.x); fija(ce.y); }
      celdaEl.classList.add('is-visible');
      ce.vivo = true;
      etiquetasEje.forEach((s, i) => s.classList.toggle('is-sobre', Math.floor(r / 2) === i || (r % 2 === 1 && false)));
      despierta();
    }
    function quitaCelda() { celdaEl.classList.remove('is-visible'); etiquetasEje.forEach(s => s.classList.remove('is-sobre')); }

    /* ── la pincelada: del ancla a la celda actual ────────────────────── */
    let trazo = null;
    function rectTrazo() {
      const d0 = Math.min(trazo.d0, trazo.d1), d1 = Math.max(trazo.d0, trazo.d1);
      const r0 = Math.min(trazo.r0, trazo.r1), r1 = Math.max(trazo.r0, trazo.r1);
      return { d0, d1, r0, r1 };
    }
    function textoTrazo() {
      const q = rectTrazo();
      const rango = hm(celdaMin(q.r0)) + ' – ' + hm(celdaMin(q.r1 + 1));
      const horas = nh((q.r1 - q.r0 + 1) / 2) + ' h';
      const dias = q.d0 === q.d1 ? '' : DIAS[q.d0] + ' a ' + DIAS[q.d1] + ' · ';
      return (borrando() ? 'Borrar ' : '') + dias + rango + ' · ' + horas;
    }
    function apuntaTrazo() {
      const q = rectTrazo();
      pv.l.meta = q.d0 * CW + GX; pv.r.meta = (q.d1 + 1) * CW - GX;
      pv.t.meta = q.r0 * RH + GY; pv.b.meta = (q.r1 + 1) * RH - GY;
      previaT.textContent = textoTrazo();
      // la etiqueta se centra en la pincelada pero no se sale de la rejilla
      const w = previaT.offsetWidth, ancho = q.d1 === q.d0 ? CW : (q.d1 - q.d0 + 1) * CW;
      previaT.style.left = lim((ancho - w) / 2 + (q.d0 * CW + GX), 6, cuerpo.clientWidth - w - 6) - (q.d0 * CW + GX) + 'px';
      // si la pincelada es baja, la etiqueta va fuera: debajo, o encima si abajo no cabe
      const alto = (q.r1 - q.r0 + 1) * RH;
      previaEl.classList.toggle('es-baja', alto < 46 && (q.r1 + 1) * RH + 34 < cuerpo.clientHeight);
      previaEl.classList.toggle('es-alta', alto < 46 && !((q.r1 + 1) * RH + 34 < cuerpo.clientHeight));
      pv.vivo = true;
      despierta();
    }
    function empiezaTrazo(d, r, id) {
      trazo = { d0: d, r0: r, d1: d, r1: r, id };
      previaEl.classList.add('is-visible');
      previaEl.classList.toggle('es-borra', borrando());
      const q = rectTrazo();
      pv.l.meta = q.d0 * CW + GX; pv.r.meta = (q.d1 + 1) * CW - GX; pv.t.meta = q.r0 * RH + GY; pv.b.meta = (q.r1 + 1) * RH - GY;
      [pv.l, pv.r, pv.t, pv.b].forEach(fija);
      pv.vivo = true;
      apuntaTrazo();
      ponDia(d);
    }
    function mueveTrazo(d, r) {
      if (!trazo || (d === trazo.d1 && r === trazo.r1)) return;
      trazo.d1 = d; trazo.r1 = r;
      apuntaTrazo();
    }
    function terminaTrazo(confirma) {
      if (!trazo) return;
      const q = rectTrazo();
      const borra = borrando();
      const previa = { d0: q.d0, d1: q.d1, t: pv.t.x, b: pv.b.x };
      trazo = null;
      previaEl.classList.remove('is-visible');
      if (!confirma) { revisaDia(); despierta(); return; }
      const antes = foto();
      for (let d = q.d0; d <= q.d1; d++) for (let r = q.r0; r <= q.r1; r++) cel[d][r] = borra ? 0 : 1;
      if (foto() === antes) { revisaDia(); despierta(); return; }    // nada cambió (pintar sobre lo pintado)
      guarda(antes);
      reconcilia({ previa: borra ? null : previa });
      cambio((borra ? 'Borrado ' : 'Pintado ') + (q.d0 === q.d1 ? DIAS_LARGO[q.d0] : DIAS_LARGO[q.d0] + ' a ' + DIAS_LARGO[q.d1]) + ', de ' + hm(celdaMin(q.r0)) + ' a ' + hm(celdaMin(q.r1 + 1)) + '.');
    }

    /* ── estirar el borde de una franja ───────────────────────────────── */
    let borde = null;
    function limites(f, lado) {
      // un borde no puede cruzar al otro ni tocar la franja vecina (dejaría de ser otra franja)
      const col = tramos(cel[f.d]);
      if (lado === 't') {
        const prev = col.filter(t => t[1] <= f.a).pop();
        return [prev ? prev[1] + 1 : 0, f.b - 1];
      }
      const sig = col.find(t => t[0] >= f.b);
      return [f.a + 1, sig ? sig[0] - 1 : N];
    }
    function empiezaBorde(f, lado, e) {
      borde = { f, lado, id: e.pointerId, antes: foto() };
      f.arrastre = { lado, v: (lado === 't' ? f.a : f.b) * RH };
      f.el.classList.add('is-borde');
      ponDia(f.d);
      chipEl.classList.add('is-visible');
      posChip(f, lado, f.arrastre.v, true);
      ponTextoChip(lado === 't' ? f.a : f.b);
    }
    function ponTextoChip(s) { chipEl.textContent = hm(celdaMin(s)); }
    function posChip(f, lado, v, instante) {
      const w = chipEl.offsetWidth || 50;
      ch.x.meta = f.d * CW + CW / 2 - w / 2;
      ch.y.meta = lado === 't' ? v - 32 : v + 9;
      if (instante || quieto()) { fija(ch.x); fija(ch.y); }
      ch.vivo = true;
      despierta();
    }
    function mueveBorde(e) {
      const { f, lado } = borde;
      const crudo = (e.clientY - rc.top) / RH;                       // la fila donde está el puntero, con decimales
      const [mn, mx] = limites(f, lado);
      const s = lim(Math.round(crudo), mn, mx);                      // el imán: a la media hora más cercana
      const actual = lado === 't' ? f.a : f.b;
      if (s !== actual) {
        // se pintan o se borran las celdas entre el borde viejo y el nuevo
        if (lado === 't') { if (s < f.a) for (let r = s; r < f.a; r++) cel[f.d][r] = 1; else for (let r = f.a; r < s; r++) cel[f.d][r] = 0; }
        else { if (s > f.b) for (let r = f.b; r < s; r++) cel[f.d][r] = 1; else for (let r = s; r < f.b; r++) cel[f.d][r] = 0; }
        reconcilia();
        cuenta();
        ponTextoChip(s);
        if (!quieto()) { chipEl.classList.remove('imanta'); void chipEl.offsetWidth; chipEl.classList.add('imanta'); }
      }
      // el borde visual es elástico: sigue al puntero un poco y se queda pegado a la media hora
      const el = s * RH + lim((crudo - s) * RH * .45, -RH * .6, RH * .6);
      f.arrastre.v = el;
      apunta(f);
      posChip(f, lado, el);
      despierta();
    }
    function terminaBorde() {
      if (!borde) return;
      const { f, antes } = borde;
      borde = null;
      f.arrastre = null;
      f.el.classList.remove('is-borde');
      chipEl.classList.remove('is-visible');
      apunta(f);
      despierta();
      if (foto() !== antes) { guarda(antes); cambio('Franja de ' + DIAS_LARGO[f.d] + ' ajustada: de ' + hm(celdaMin(f.a)) + ' a ' + hm(celdaMin(f.b)) + '.'); }
    }

    /* ── el puntero sobre la rejilla ─────────────────────────────────── */
    const celdaDe = e => {
      const x = e.clientX - rc.left, y = e.clientY - rc.top;
      return { d: lim(Math.floor(x / CW), 0, 6), r: lim(Math.floor(y / RH), 0, N - 1) };
    };
    cuerpo.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      rc = cuerpo.getBoundingClientRect();
      shift = e.shiftKey;
      actualizaModo();
      try { cuerpo.setPointerCapture(e.pointerId); } catch (_) {}
      const grip = e.target.closest && e.target.closest('.fr-grip');
      if (grip) { e.preventDefault(); empiezaBorde(grip.parentNode._f, grip.classList.contains('fr-grip-t') ? 't' : 'b', e); return; }
      e.preventDefault();
      cuerpo.classList.remove('is-teclado');                           // con el puntero no hace falta el aro del foco
      cuerpo.focus({ preventScroll: true });
      cuerpo.classList.remove('is-teclado');
      const c = celdaDe(e);
      kc = c.d; kr = c.r;
      empiezaTrazo(c.d, c.r, e.pointerId);
      ponCelda(c.d, c.r);
    });
    cuerpo.addEventListener('pointermove', e => {
      if (!borde && !trazo) rc = cuerpo.getBoundingClientRect();
      if (borde) { if (e.pointerId === borde.id) mueveBorde(e); return; }
      const c = celdaDe(e);
      if (e.pointerType === 'mouse' || trazo) ponCelda(c.d, c.r);
      if (trazo && e.pointerId === trazo.id) { shift = e.shiftKey || shift; mueveTrazo(c.d, c.r); }
    });
    const suelta = e => {
      if (borde && e.pointerId === borde.id) { terminaBorde(); return; }
      if (trazo && e.pointerId === trazo.id) { terminaTrazo(e.type !== 'pointercancel'); if (e.pointerType !== 'mouse') quitaCelda(); }
    };
    cuerpo.addEventListener('pointerup', suelta);
    cuerpo.addEventListener('pointercancel', suelta);
    cuerpo.addEventListener('pointerleave', e => { if (!trazo && !borde && document.activeElement !== cuerpo) quitaCelda(); });
    new ResizeObserver(() => {
      mide();
      franjas.forEach(f => { apunta(f); fija(f.top); fija(f.alto); f.pinta = true; });     // apunta también reescribe la etiqueta
      despierta();
    }).observe(cuerpo);

    /* ── el teclado dentro de la rejilla ──────────────────────────────── */
    let kc = 0, kr = 2;
    cuerpo.addEventListener('focus', () => { if (cuerpo.matches(':focus-visible') && !trazo) { cuerpo.classList.add('is-teclado'); ponCelda(kc, kr, true); } });
    cuerpo.addEventListener('blur', () => {
      cuerpo.classList.remove('is-teclado');
      if (trazo && trazo.id === 'teclado') { trazo = null; previaEl.classList.remove('is-visible'); }
      quitaCelda();
    });
    cuerpo.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod) return;
      if (!cuerpo.classList.contains('is-teclado')) { cuerpo.classList.add('is-teclado'); ponCelda(kc, kr, true); }
      const mueve = (dd, dr) => {
        e.preventDefault();
        kc = lim(kc + dd, 0, 6); kr = lim(kr + dr, 0, N - 1);
        ponCelda(kc, kr);
        ponDia(kc);
        if (trazo && trazo.id === 'teclado') mueveTrazo(kc, kr);
      };
      switch (e.key) {
        case 'ArrowLeft': mueve(-1, 0); break;
        case 'ArrowRight': mueve(1, 0); break;
        case 'ArrowUp': mueve(0, -1); break;
        case 'ArrowDown': mueve(0, 1); break;
        case 'PageUp': mueve(0, -4); break;
        case 'PageDown': mueve(0, 4); break;
        case 'Home': mueve(0, -N); break;
        case 'End': mueve(0, N); break;
        case ' ': case 'Enter':
          e.preventDefault();
          shift = e.shiftKey; actualizaModo();
          if (trazo && trazo.id === 'teclado') terminaTrazo(true);
          else { rc = cuerpo.getBoundingClientRect(); empiezaTrazo(kc, kr, 'teclado'); }
          break;
        case 'Escape':
          if (trazo) { e.preventDefault(); terminaTrazo(false); }
          break;
        case 'Delete': case 'Backspace': {
          e.preventDefault();
          const t = tramos(cel[kc]).find(x => kr >= x[0] && kr < x[1]);
          if (!t) break;
          const antes = foto();
          for (let r = t[0]; r < t[1]; r++) cel[kc][r] = 0;
          guarda(antes); reconcilia(); cambio('Franja de ' + DIAS_LARGO[kc] + ' borrada.');
          break;
        }
      }
    });

    /* ── copiar a los demás días, con una onda ───────────────────────── */
    function copia(origen) {
      let src = origen == null ? selDia : origen;
      if (src < 0 || !tramos(cel[src]).length) src = cel.findIndex(c => c.some(Boolean));
      if (src < 0) return;
      ponDia(src);
      guarda();
      btnCopiar.classList.remove('pulso'); void btnCopiar.offsetWidth; btnCopiar.classList.add('pulso');
      const destinos = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== src).sort((a, b) => Math.abs(a - src) - Math.abs(b - src));
      const paso = quieto() ? 0 : 130;
      if (!quieto()) {
        // la onda: una banda que sale del día de origen hacia cada lado
        [-1, 1].forEach(lado => {
          const hasta = lado < 0 ? src : 6 - src;
          if (!hasta) return;
          const b = document.createElement('i');
          b.className = 'fr-onda';
          b.style.left = (src * CW) + 'px';
          b.style.setProperty('--fr-viaje', (lado * hasta * CW) + 'px');
          cuerpo.appendChild(b);
          setTimeout(() => b.remove(), 1100);
        });
      }
      let ultimo = 0;
      destinos.forEach(d => {
        const dist = Math.abs(d - src);
        ultimo = Math.max(ultimo, dist);
        const aplica = () => {
          cel[d].set(cel[src]);
          reconcilia();
          cuenta();
          if (!quieto()) {
            const fl = document.createElement('i');
            fl.className = 'fr-flash';
            fl.style.left = (d * CW) + 'px';
            cuerpo.appendChild(fl);
            setTimeout(() => fl.remove(), 900);
          }
        };
        if (paso) setTimeout(aplica, dist * paso - 40); else aplica();
      });
      const fin = () => cambio('Copiado el ' + DIAS_LARGO[src] + ' a los demás días.');
      if (paso) setTimeout(fin, ultimo * paso + 60); else fin();
    }
    btnCopiar.addEventListener('click', () => copia());
    btnDeshacer.addEventListener('click', deshace);
    btnVaciar.addEventListener('click', () => {
      if (!cel.some(c => c.some(Boolean))) return;
      guarda();
      cel.forEach(c => c.fill(0));
      reconcilia();
      cambio('Semana vaciada.');
    });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && hist.length && (raiz.contains(e.target) || e.target === document.body)) {
        e.preventDefault();
        deshace();
      }
    });

    /* ── arranque ─────────────────────────────────────────────────── */
    mide();
    Object.keys(o.inicial).forEach(d => o.inicial[d].forEach(([a, b]) => {
      for (let r = Math.round((a - o.abre) * 2); r < Math.round((b - o.abre) * 2); r++) if (r >= 0 && r < N) cel[+d][r] = 1;
    }));
    ponHerr('pintar');
    horasPrev = -1;
    cuenta(true);
    ponResumen(describe(), true);
    let listo = false;
    function arranca() {
      if (listo) return;
      listo = true;
      mide();
      // las franjas iniciales entran una tras otra, creciendo desde su borde de arriba
      reconcilia({ retraso: 36 });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(arranca));
    setTimeout(arranca, 1200);

    return {
      dias: () => { const out = {}; const d = datos(); Object.keys(d).forEach(k => { out[k] = d[k].map(r => [hm(r[0] * 60), hm(r[1] * 60)]); }); return out; },
      copiar: copia,
      deshacer: deshace,
      vaciar: () => btnVaciar.click(),
    };
  }

  window.Franjas = Franjas;
  const raiz = document.querySelector('[data-franjas]');
  if (raiz) raiz._franjas = Franjas(raiz);
})();
