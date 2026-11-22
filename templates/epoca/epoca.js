/* =====================================================================
   Época · Moxen
   Un calendario que se acerca y se aleja en el tiempo, sin cortes. El año
   entero es UN plano (doce meses de siete columnas) y la vista es una cámara
   con zoom independiente en cada eje:

     Año → Mes         zoom uniforme sobre el mes
     Mes → Semana      solo vertical: la fila de la semana crece y llena la altura
     Semana → Día      solo horizontal: la columna del día crece y llena el ancho

   Una rueda, un pellizco o las teclas mueven un solo número, z (0 a 3), con un
   resorte; todo lo demás sale de él. Cada evento decide cómo dibujarse por el
   tamaño que tiene su celda en pantalla, y las tres formas se funden sin saltos:
   un PUNTO (celda pequeña), una BARRA con título (celda ancha) y un BLOQUE
   colocado en su hora, con su rango y su lugar (celda alta). Por eso, al
   acercar, los puntos se alargan en barras y las barras caen a su hora;
   al alejar, los bloques se condensan otra vez en puntos. La cámara es la
   «inversa» del zoom: el centro se interpola con 1/escala, que es lo que
   mantiene en su sitio el punto al que apuntas.

   · Rueda o pellizco: acerca o aleja hacia lo que hay bajo el cursor (o los
     dedos); al soltar, la vista se asienta en el nivel más cercano.
   · Pulsar un día con eventos en la vista de año: la cámara baja de un solo
     viaje hasta ese día; en cualquier otra vista, un clic baja un nivel.
   · Teclado: ← → ↑ ↓ mueven el día, Re Pág / Av Pág el mes, Inicio vuelve a
     hoy, Intro o + acercan, Esc o − alejan, 1–4 eligen la escala. Un aviso
     hablado dice dónde estás.
   · El selector Año · Mes · Semana · Día sigue el zoom de forma continua; las
     cuatro categorías de la leyenda son también filtros.
   · Deslizar a un lado (o una rueda horizontal) pasa al período anterior o siguiente.

   Cómo se monta (index.html es la plantilla):
     const e = Epoca(document.querySelector('[data-epoca]'), {
       nivel: 0,                        // 0 año · 1 mes · 2 semana · 3 día
       alCambiar: ({ nivel, mes, dia }) => {},
     });
     e.nivel(2); e.foco(9, 14); e.hoy();
   Qué se personaliza: los colores al principio de epoca.css (el canvas los
   lee de ahí); los eventos, en creaDatos() (cada evento es { c, t, ini, fin,
   lugar }: c es la categoría 0–3 y las horas van en decimales); el año y «hoy»
   en las constantes de arriba; los umbrales de punto/barra/bloque, en
   pintaEventos(). Sin dependencias; el tiempo sale de requestAnimationFrame
   (nada de Date para animar: el único Date calcula en qué día cae cada mes).
   ===================================================================== */
(function () {
  'use strict';

  const ANIO = 2026, HOY = [9, 14], AHORA = 10 + 40 / 60;     // «hoy»: miércoles 14 de octubre, 10:40
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS_C = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'], DIAS_L = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'], INI = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  // el plano, en unidades: una celda mide 7 × 4,5; un mes es su cabecera + 6 filas de 7
  const CW = 7, CH = 4.5, TIT = 3, HH = 4.6, MW = CW * 7, MH = HH + CH * 6, GX = 6, GY = 5;
  const H0 = 7, H1 = 20;                                      // horas que ve la escala de día
  const RESORTES = { zoom: [125, 17.8], foco: [150, 21], filtro: [180, 26] };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const suave = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, h) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; }
  const reposo = r => Math.abs(r.v) < .002 && Math.abs(r.meta - r.x) < .0008;
  const dosd = n => String(n).padStart(2, '0');
  const hora = h => dosd(Math.floor(h + 1e-6)) + ':' + dosd(Math.round((h % 1) * 60));
  const plural = (n, s, p) => n === 0 ? 'Sin eventos' : n + ' ' + (n === 1 ? s : p);
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mezcla = (a, b, t) => 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';

  const NDIAS = Array.from({ length: 12 }, (_, m) => new Date(ANIO, m + 1, 0).getDate());
  const PRIM = Array.from({ length: 12 }, (_, m) => (new Date(ANIO, m, 1).getDay() + 6) % 7);   // columna del día 1 (lunes = 0)
  const ndias = m => NDIAS[m], primero = m => PRIM[m];

  /* =====================================================================
     Los datos: eventos de ejemplo (genéricos, con semilla). La semana del 12
     al 18 de octubre está escrita a mano, con un solape el miércoles.
     ===================================================================== */
  function creaDatos() {
    const az = mulberry32(2026);
    const POOL = [
      ['Reunión de equipo', 'Revisión de diseño', 'Entrega de maqueta', 'Planificación', 'Llamada con proveedor', 'Cierre de sprint', 'Demostración', 'Presupuesto'],
      ['Almuerzo', 'Cena familiar', 'Cumpleaños', 'Visita al dentista', 'Compras', 'Mudanza', 'Cine', 'Viaje'],
      ['Yoga', 'Correr', 'Natación', 'Masaje', 'Meditación', 'Caminata'],
      ['Clase de ilustración', 'Taller de cerámica', 'Lectura', 'Curso en línea', 'Ensayo', 'Práctica de guitarra']];
    const LUG = [['Sala 2', 'En línea', 'Estudio', 'Sala 1'], ['Casa', 'Cafetería', 'Centro', 'Parque'], ['Estudio', 'Parque', 'Piscina', 'Casa'], ['Aula 4', 'Taller', 'En línea', 'Casa']];
    const E = (c, t, ini, fin, lugar) => ({ c, t, ini, fin, lugar });
    const A_MANO = {
      12: [E(0, 'Planificación', 9, 10.5, 'Sala 2'), E(1, 'Almuerzo', 13, 14, 'Cafetería'), E(2, 'Yoga', 18.5, 19.5, 'Estudio')],
      13: [E(0, 'Reunión de equipo', 10, 11, 'En línea'), E(3, 'Clase de ilustración', 17, 19, 'Aula 4')],
      14: [E(0, 'Reunión diaria', 9.5, 10, 'En línea'), E(0, 'Revisión de diseño', 11, 12.5, 'Sala 2'), E(0, 'Llamada con proveedor', 12, 12.75, 'En línea'), E(1, 'Almuerzo con el equipo', 13, 14, 'Cafetería'), E(2, 'Caminata', 15, 16, 'Parque'), E(0, 'Entrega de maqueta', 16.5, 17.5, 'Estudio'), E(3, 'Taller de cerámica', 19, 20, 'Taller')],
      15: [E(2, 'Natación', 7, 8, 'Piscina'), E(0, 'Presupuesto', 10, 11.5, 'Sala 1'), E(1, 'Cena familiar', 19, 20, 'Casa')],
      16: [E(0, 'Cierre de sprint', 14, 15.5, 'Sala 2'), E(1, 'Cine', 18.5, 20, 'Centro')],
      17: [E(2, 'Caminata', 9, 11, 'Parque'), E(1, 'Cumpleaños', 16, 19, 'Casa')],
      18: [E(3, 'Lectura', 10, 11.5, 'Casa'), E(1, 'Cena familiar', 19, 20, 'Casa')]
    };
    const dias = [];
    for (let m = 0; m < 12; m++) {
      const fila = [];
      for (let d = 1; d <= ndias(m); d++) {
        const wd = (primero(m) + d - 1) % 7, ev = [];
        if (m === 9 && A_MANO[d]) A_MANO[d].forEach(e => ev.push(Object.assign({}, e)));
        else {
          const r = az(), n = wd < 5 ? (r < .42 ? 0 : r < .8 ? 1 : r < .95 ? 2 : 3) : (r < .78 ? 0 : r < .97 ? 1 : 2);
          const slots = [8, 10, 12, 14, 16, 18].map(s => [az(), s]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]).sort((a, b) => a - b);
          slots.forEach(s => {
            const q = az(), c = wd < 5 ? (q < .5 ? 0 : q < .65 ? 1 : q < .82 ? 2 : 3) : (q < .45 ? 1 : q < .8 ? 2 : 3);
            const ini = s + (az() < .4 ? 0 : .5), fin = ini + Math.min(.5 + Math.floor(az() * 4) * .5, s + 2 - ini);
            ev.push(E(c, POOL[c][Math.floor(az() * POOL[c].length)], ini, fin, LUG[c][Math.floor(az() * 4)]));
          });
        }
        ev.sort((a, b) => a.ini - b.ini);
        // columnas de los que se solapan, para repartirse el ancho en el bloque
        let grupo = [], fin = -1;
        const cierra = () => { const k = grupo.reduce((x, e) => Math.max(x, e.col + 1), 1); grupo.forEach(e => { e.cols = k; }); grupo = []; };
        const ult = [];
        ev.forEach(e => {
          if (e.ini >= fin) { cierra(); ult.length = 0; }
          let c = ult.findIndex(f => f <= e.ini); if (c < 0) c = ult.length;
          ult[c] = e.fin; e.col = c; grupo.push(e); fin = Math.max(fin, e.fin);
        });
        cierra();
        fila.push({ m, d, wd, ev });
      }
      dias.push(fila);
    }
    return dias;
  }

  /* =====================================================================
     El calendario
     ===================================================================== */
  function Epoca(raiz, opciones) {
    const o = Object.assign({ nivel: 0, alCambiar: null }, opciones);
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const quieto = () => mq.matches;
    const $ = s => raiz.querySelector(s);
    const cv = $('[data-canvas]'), lienzo = $('[data-lienzo]'), ctx = cv.getContext('2d'), vivo = $('[data-vivo]');
    const eti = $('[data-eti]'), etiA = $('[data-eti-a]'), etiB = $('[data-eti-b]');
    const botonesNivel = Array.from(raiz.querySelectorAll('[data-nivel]')), chips = Array.from(raiz.querySelectorAll('[data-cat]'));
    const dias = creaDatos();
    const avisa = s => { vivo.textContent = ''; vivo.textContent = s; };
    const estilo = getComputedStyle(document.documentElement);
    const v = n => estilo.getPropertyValue(n).trim();
    const C = {};
    function leeColores() {
      ['ventana', 'celda', 'celda-fin', 'celda-hover', 'celda-fuera', 'tinta', 'suave', 'tenue', 'acento', 'acento-t', 'linea', 'linea-fuerte'].forEach(k => { C[k] = v('--ep-' + k); });
      C.cat = [0, 1, 2, 3].map(i => ({ f: rgb(v('--ep-c' + i)), t: v('--ep-c' + i + '-t'), p: rgb(v('--ep-c' + i + '-p')), ps: v('--ep-c' + i + '-p') }));
      C.sans = v('--ep-sans') || 'system-ui, sans-serif'; C.num = v('--ep-num') || 'ui-monospace, monospace';
    }
    leeColores();

    /* ── el tamaño y el plano (en pantallas estrechas, los meses van en dos columnas) ── */
    let Vw = 0, Vh = 0, dpr = 1, cols = 4, PW = 0, PH = 0, sucioTam = true;
    function mide() {
      Vw = lienzo.clientWidth; Vh = lienzo.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(Vw * dpr); cv.height = Math.round(Vh * dpr);
      cols = Vw < 700 ? 2 : 4;
      PW = cols * MW + (cols - 1) * GX; PH = (12 / cols) * MH + (12 / cols - 1) * GY;
      sucioTam = false;
    }
    const bloque = m => ({ x: (m % cols) * (MW + GX), y: Math.floor(m / cols) * (MH + GY) });
    const izq = () => Vw < 700 ? 40 : 66, der = () => Vw < 700 ? 8 : 24;

    /* ── la cámara ─────────────────────────────────────────────────────── */
    let foco = { m: HOY[0], d: HOY[1] };
    const zS = resorte(clamp(o.nivel, 0, 3), RESORTES.zoom[0], RESORTES.zoom[1]);
    const offX = resorte(0, RESORTES.foco[0], RESORTES.foco[1]), offY = resorte(0, RESORTES.foco[0], RESORTES.foco[1]);
    const catS = [0, 1, 2, 3].map(() => resorte(1, RESORTES.filtro[0], RESORTES.filtro[1]));
    const mesS = Array.from({ length: 12 }, (_, m) => resorte(m === HOY[0] ? 1 : 0, RESORTES.filtro[0], RESORTES.filtro[1]));   // cuánto se ve cada mes: el del foco, entero
    const celdaDe = f => { const i = primero(f.m) + f.d - 1; return { col: i % 7, row: Math.floor(i / 7) }; };

    // el encuadre de cada escala para un día de foco
    function nivelCam(l, f) {
      const b = bloque(f.m), { col, row } = celdaDe(f);
      if (l === 0) { const s = Math.min((Vw - 36) / PW, (Vh - 28) / PH); return { sx: s, sy: s, cx: PW / 2, cy: PH / 2, ox: 0, oy: 0 }; }
      if (l === 1) { const s = Math.min((Vw - 60) / MW, (Vh - 24) / MH); return { sx: s, sy: s, cx: b.x + MW / 2, cy: b.y + MH / 2, ox: 0, oy: 0 }; }
      const util = Vw - izq() - der(), sy = (Vh - 30) / CH, ox = (izq() - der()) / 2;
      if (l === 2) return { sx: util / MW, sy, cx: b.x + MW / 2, cy: b.y + HH + (row + .5) * CH, ox, oy: 0 };
      return { sx: util / CW, sy, cx: b.x + (col + .5) * CW, cy: b.y + HH + (row + .5) * CH, ox, oy: 0 };
    }
    // el centro se interpola con 1/escala: así lo que apuntas se queda donde está mientras se acerca
    const peso = (a, b, s, t) => Math.abs(1 / a - 1 / b) < 1e-4 ? t : (1 / a - 1 / s) / (1 / a - 1 / b);
    function camara() {
      const z = zS.x, i = clamp(Math.floor(z), 0, 2), t = z - i;
      const a = nivelCam(i, foco), b = nivelCam(i + 1, foco);
      const sx = Math.exp(lerp(Math.log(a.sx), Math.log(b.sx), t)), sy = Math.exp(lerp(Math.log(a.sy), Math.log(b.sy), t));
      return { sx, sy, cx: lerp(a.cx, b.cx, peso(a.sx, b.sx, sx, t)) + offX.x, cy: lerp(a.cy, b.cy, peso(a.sy, b.sy, sy, t)) + offY.x, ox: lerp(a.ox, b.ox, t), oy: lerp(a.oy, b.oy, t) };
    }
    function ponFoco(nf) {
      if (nf.m === foco.m && nf.d === foco.d) return;
      const c0 = camara(); foco = { m: nf.m, d: nf.d }; const c1 = camara();
      mesS.forEach((r, m) => { r.meta = m === foco.m ? 1 : 0; });
      if (quieto()) return;
      offX.x += c0.cx - c1.cx; offY.x += c0.cy - c1.cy; offX.meta = 0; offY.meta = 0;
    }

    /* ── qué día hay bajo un punto de la pantalla ──────────────────────── */
    function bajo(px, py, c) {
      const x = (px - Vw / 2 - c.ox) / c.sx + c.cx, y = (py - Vh / 2 - c.oy) / c.sy + c.cy;
      let mejor = 0, dm = 1e9;
      for (let m = 0; m < 12; m++) { const b = bloque(m), dx = Math.max(b.x - x, 0, x - b.x - MW), dy = Math.max(b.y - y, 0, y - b.y - MH), d = dx * dx + dy * dy; if (d < dm) { dm = d; mejor = m; } }
      const b = bloque(mejor), cx = (x - b.x) / CW, cy = (y - b.y - HH) / CH;
      const col = clamp(Math.floor(cx), 0, 6), row = clamp(Math.floor(cy), 0, 5);
      const n = row * 7 + col - primero(mejor) + 1, val = n >= 1 && n <= ndias(mejor);
      const dentro = dm === 0 && cx >= 0 && cx < 7 && cy >= 0 && cy < 6 && val;
      return { m: mejor, d: clamp(n, 1, ndias(mejor)), dentro };
    }

    /* ── el dibujo ─────────────────────────────────────────────────────── */
    let hover = null, teclado = false, mesAlfa = 1;
    function rr(x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }
    const fuente = (peso, px, fam) => peso + ' ' + px.toFixed(1) + 'px ' + (fam || C.sans);

    // un evento se funde entre punto, barra y bloque según el tamaño de su celda
    function pintaEventos(dia, x, y, w, h, alfa) {
      const evs = dia.ev; if (!evs.length) return;
      const u2 = suave(150, 300, h), u1 = Math.max(suave(40, 76, w), u2), grande = suave(420, 760, w);   // un bloque alto es siempre pastel, aunque la columna sea estrecha
      const dd = clamp(h * .2, 3.4, 5.6), n = evs.length, nd = Math.min(n, 4);
      const sup = y + clamp(h * .34, 14, 38), bh = clamp(h * .16, 10, 17), sep = clamp(h * .025, 1.4, 3);
      const carriles = Math.max(1, Math.floor((y + h - 5 - sup) / (bh + sep)));
      const hdr = lerp(52, 86, grande), tTop = y + hdr, span = Math.max(40, h - hdr - 12);
      const pad = clamp(w * .05, 2, 7);
      const oculto = u1 * (1 - u2), cupo = n > carriles ? carriles - 1 : carriles;
      for (let i = 0; i < n; i++) {
        const e = evs[i], cat = C.cat[e.c], a = alfa * clamp(catS[e.c].x, 0, 1);
        const extra = i >= cupo ? 1 - oculto : 1, aa = a * extra;
        if (aa < .02 || (i >= 4 && u1 < .5 && u2 < .5)) continue;
        // forma de punto
        const di = Math.min(i, nd - 1), sepd = Math.min(dd * 1.75, (w - 8) / (nd + .4));
        const rd = { x: x + w / 2 + (di - (nd - 1) / 2) * sepd - dd / 2, y: y + h * .76 - dd / 2, w: dd, h: dd };
        // forma de barra
        const li = Math.min(i, Math.max(0, cupo - 1));
        const rb = { x: x + pad, y: sup + li * (bh + sep), w: w - pad * 2, h: bh };
        // forma de bloque, en su hora
        const i0 = clamp(e.ini, H0, H1), f0 = clamp(e.fin, H0, H1), cw = (w - pad * 2) / e.cols;
        const rk = { x: x + pad + cw * e.col, y: tTop + (i0 - H0) / (H1 - H0) * span, w: cw - (e.cols > 1 ? 2 : 0), h: Math.max(17, (f0 - i0) / (H1 - H0) * span - 2) };
        const r1 = { x: lerp(rd.x, rb.x, u1), y: lerp(rd.y, rb.y, u1), w: lerp(rd.w, rb.w, u1), h: lerp(rd.h, rb.h, u1) };
        const r = { x: lerp(r1.x, rk.x, u2), y: lerp(r1.y, rk.y, u2), w: lerp(r1.w, rk.w, u2), h: lerp(r1.h, rk.h, u2) };
        if (r.w < 1 || r.h < 1) continue;
        const rad = lerp(lerp(dd / 2, 4.5, u1), 8, u2);
        ctx.globalAlpha = clamp(aa, 0, 1);
        ctx.fillStyle = mezcla(cat.p, cat.f, u1);
        rr(r.x, r.y, r.w, r.h, rad); ctx.fill();
        if (u2 > .2 && r.w > 14) {            // el filo de color del bloque
          ctx.globalAlpha = clamp(aa * u2, 0, 1); ctx.fillStyle = cat.ps;
          rr(r.x, r.y + 3, 3, r.h - 6, 1.5); ctx.fill();
        }
        const ta = suave(.5, .92, u1) * clamp((r.w - 38) / 26, 0, 1) * clamp((r.h - 9) / 5, 0, 1);
        if (ta > .02) {
          ctx.save(); rr(r.x, r.y, r.w, r.h, rad); ctx.clip();
          ctx.globalAlpha = clamp(aa * ta, 0, 1); ctx.fillStyle = cat.t; ctx.textBaseline = 'alphabetic';
          const tf = lerp(lerp(11, 11.5, u1), lerp(12.5, 16, grande), u2), tx = r.x + lerp(7, 11, u2);
          ctx.font = fuente(600, tf);
          const doble = u2 > .3 && r.h >= 36, ancho = grande > .25 && r.w > 420;
          ctx.fillText(e.t, tx, r.y + (doble ? 6 + tf : r.h / 2 + tf * .35 + .5 * (1 - u2)));
          if (doble) {
            ctx.globalAlpha = clamp(aa * ta * suave(.3, .8, u2), 0, 1); ctx.font = fuente(400, lerp(10.5, 13, grande), C.num);
            ctx.fillText(hora(e.ini) + ' – ' + hora(e.fin), tx, r.y + 10 + tf + lerp(11, 14, grande));
            if (grande > .2 && r.h >= 64 && !ancho) { ctx.globalAlpha = clamp(aa * grande, 0, 1); ctx.font = fuente(500, 13); ctx.fillText(e.lugar, tx, r.y + 14 + tf + 30 * lerp(.75, 1, grande) + 4); }
          }
          if (ancho) {                         // en la vista de día, lo secundario va a la derecha
            ctx.globalAlpha = clamp(aa * grande, 0, 1) * .8; ctx.textAlign = 'right'; ctx.font = fuente(400, 12.5, C.num);
            ctx.fillText((doble ? '' : hora(e.ini) + ' – ' + hora(e.fin) + '   ') + e.lugar, r.x + r.w - 14, r.y + (doble ? 6 + tf : r.h / 2 + tf * .35));
            ctx.textAlign = 'left';
          }
          ctx.restore();
        }
      }
      // «+n»: lo que no cabe en las barras
      if (n > cupo && oculto > .05) {
        ctx.globalAlpha = clamp(oculto * alfa, 0, 1); ctx.fillStyle = C.suave; ctx.font = fuente(600, 10.5); ctx.textBaseline = 'alphabetic';
        ctx.fillText('+' + (n - cupo), x + pad + 6, sup + cupo * (bh + sep) + bh * .72);
      }
    }

    function pintaCelda(dia, col, x, y, w, h, fuera) {
      let vis = mesAlfa;
      if (fuera) { vis = suave(70, 130, w) * .62 * mesAlfa; if (vis < .02) return; }
      const pad = clamp(Math.min(w, h) * .07, .8, 5), rx = x + pad / 2, ry = y + pad / 2, rw = w - pad, rh = h - pad;
      if (rw < 2.5 || rh < 2.5) return;
      const r = clamp(Math.min(rw, rh) * .14, 1.5, 15);
      const esHoy = !fuera && dia.m === HOY[0] && dia.d === HOY[1];
      const esHover = !fuera && hover && hover.m === dia.m && hover.d === dia.d;
      const esFoco = !fuera && teclado && foco.m === dia.m && foco.d === dia.d;
      ctx.globalAlpha = vis;
      ctx.fillStyle = esHover ? C['celda-hover'] : (fuera ? C['celda-fuera'] : (col >= 5 ? C['celda-fin'] : C.celda));
      rr(rx, ry, rw, rh, r); ctx.fill();
      if (esHoy) { ctx.strokeStyle = C.acento; ctx.lineWidth = clamp(Math.min(rw, rh) * .06, 1, 2.2); rr(rx + .5, ry + .5, rw - 1, rh - 1, r); ctx.stroke(); }
      // la cuadrícula de horas, solo cuando la celda es lo bastante alta
      const gr = suave(190, 300, rh), grande = suave(420, 760, rw);
      if (gr > .02 && dia.m >= 0) {
        const hdr = lerp(52, 86, grande), tTop = ry + hdr - (ry - y) * 0, span = Math.max(40, h - hdr - 12);
        ctx.strokeStyle = C.linea; ctx.lineWidth = 1; ctx.globalAlpha = vis * suave(240, 340, rh);
        ctx.beginPath();
        for (let k = 0; k <= H1 - H0; k++) { const yy = Math.round(y + hdr + k / (H1 - H0) * span) + .5; ctx.moveTo(rx + 8, yy); ctx.lineTo(rx + rw - 8, yy); }
        ctx.stroke();
        ctx.globalAlpha = vis;
        if (esHoy && gr > .4) {            // la línea de «ahora»
          const yy = y + hdr + (AHORA - H0) / (H1 - H0) * span;
          ctx.globalAlpha = vis * suave(280, 360, rh); ctx.strokeStyle = C.acento; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(rx + 4, yy); ctx.lineTo(rx + rw - 4, yy); ctx.stroke();
          ctx.fillStyle = C.acento; ctx.beginPath(); ctx.arc(rx + 6, yy, 3.6, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = vis;
        }
      }
      // el número del día
      if (rw >= 13 && rh >= 11) {
        let fs = clamp(Math.min(rh * .36, rw * .3), 7.5, 19);
        fs = lerp(lerp(fs, 22, gr), 34, grande);
        const nx = rx + clamp(rw * .1, 3, 14) + grande * 6, ny = ry + clamp(rh * .1, 2, 13) + fs * .8 + gr * 4;
        const s = String(dia.d);
        ctx.font = fuente(600, fs, C.sans); ctx.textBaseline = 'alphabetic';
        const tw = ctx.measureText(s).width;
        if (esHoy) { ctx.fillStyle = C.acento; ctx.beginPath(); ctx.arc(nx + tw / 2, ny - fs * .33, Math.max(tw / 2, fs * .5) + fs * .26, 0, 6.2832); ctx.fill(); }
        ctx.fillStyle = esHoy ? C['acento-t'] : (fuera ? C.tenue : C.tinta); ctx.globalAlpha = vis * (esHoy ? 1 : lerp(.78, 1, gr));
        ctx.fillText(s, nx, ny);
        if (gr > .08 && rw > 68) {
          ctx.globalAlpha = vis * gr; ctx.fillStyle = C.suave; ctx.font = fuente(500, lerp(13, 17, grande));
          ctx.fillText(rw >= 300 ? cap(DIAS_L[col]) : DIAS_C[col], nx + tw + fs * .5 + (esHoy ? fs * .3 : 0), ny - fs * .1);
          if (grande > .05) {
            ctx.globalAlpha = vis * grande; ctx.font = fuente(500, 14); ctx.fillStyle = C.suave;
            const tot = dia.ev.reduce((a, e) => a + (e.fin - e.ini), 0), hh = Math.floor(tot), mm = Math.round((tot - hh) * 60);
            ctx.fillText(plural(dia.ev.length, 'evento', 'eventos') + (dia.ev.length ? ' · ' + hh + ' h' + (mm ? ' ' + mm + ' min' : '') : ''), nx + 2, ny + 26);
          }
        }
        ctx.globalAlpha = vis;
      }
      pintaEventos(dia, rx, ry, rw, rh, vis);
      if (esFoco) { ctx.globalAlpha = 1; ctx.strokeStyle = C.acento; ctx.lineWidth = 2; rr(rx - 1, ry - 1, rw + 2, rh + 2, r + 1); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    function dibuja() {
      if (sucioTam) mide();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, Vw, Vh);
      const c = camara(), X = p => Vw / 2 + c.ox + (p - c.cx) * c.sx, Y = p => Vh / 2 + c.oy + (p - c.cy) * c.sy;
      ctx.textBaseline = 'alphabetic';
      for (let m = 0; m < 12; m++) {
        const b = bloque(m), x0 = X(b.x), y0 = Y(b.y), bw = MW * c.sx, bh = MH * c.sy;
        if (x0 > Vw + 4 || x0 + bw < -4 || y0 > Vh + 4 || y0 + bh < -4) continue;
        // al acercarse, los meses que no son el del centro se apagan: quedan de contexto y luego desaparecen
        const aBloque = 1 - (1 - clamp(mesS[m].x, 0, 1)) * (suave(.15, 1, zS.x) * .78 + suave(1.2, 1.8, zS.x) * .22);
        if (aBloque < .02) continue;
        mesAlfa = aBloque;
        // título del mes y letras de los días de la semana (se desvanecen cuando el zoom vertical los empuja fuera)
        const zT = TIT * c.sy, ta = (1 - suave(70, 120, zT)) * mesAlfa;
        if (ta > .02 && bw > 80) {
          const tf = clamp(Math.min(c.sx, c.sy) * 2.3, 10.5, 30), activo = (hover && hover.m === m) || (!hover && foco.m === m);
          ctx.globalAlpha = ta; ctx.font = fuente(600, tf); ctx.fillStyle = activo && zS.x < .7 ? C.acento : C.tinta;
          ctx.fillText(cap(MESES[m]), x0 + 3, y0 + zT * .5 + tf * .36);
          const wf = clamp(c.sx * .72, 0, 13);
          if (wf >= 8) {
            ctx.font = fuente(500, wf); ctx.fillStyle = C.tenue; ctx.textAlign = 'center';
            for (let k = 0; k < 7; k++) ctx.fillText(INI[k], X(b.x + (k + .5) * CW), Y(b.y + TIT + (HH - TIT) * .7));
            ctx.textAlign = 'left';
          }
          ctx.globalAlpha = 1;
        }
        const f0 = primero(m), nm = ndias(m), w = CW * c.sx, h = CH * c.sy;
        for (let i = 0; i < 42; i++) {
          const col = i % 7, row = (i / 7) | 0, cx0 = X(b.x + col * CW), cy0 = Y(b.y + HH + row * CH);
          if (cx0 > Vw || cx0 + w < 0 || cy0 > Vh || cy0 + h < 0) continue;
          const n = i - f0 + 1;
          let dia, fuera = false;
          if (n < 1) { fuera = true; const pm = m - 1, d = pm < 0 ? 31 + n : ndias(pm) + n; dia = pm < 0 ? { m: -1, d, ev: [] } : dias[pm][d - 1]; }
          else if (n > nm) { fuera = true; const nmm = m + 1, d = n - nm; dia = nmm > 11 ? { m: -1, d, ev: [] } : dias[nmm][d - 1]; }
          else dia = dias[m][n - 1];
          pintaCelda(dia, col, cx0, cy0, w, h, fuera);
        }
      }
      // en la vista de día, las bandas de los lados tapan a los vecinos que asoman
      const ba = suave(1.6, 2.4, zS.x);
      if (ba > .02) { ctx.globalAlpha = ba; ctx.fillStyle = C.ventana; ctx.fillRect(0, 0, izq() - 4, Vh); ctx.fillRect(Vw - der() + 3, 0, der(), Vh); ctx.globalAlpha = 1; }
      // el eje de las horas, pegado al borde izquierdo mientras la celda es alta
      const fc = celdaDe(foco), fb = bloque(foco.m), fy = Y(fb.y + HH + fc.row * CH), fh = CH * c.sy;
      const ga = suave(240, 340, fh);
      if (ga > .02) {
        const hdr = lerp(52, 86, suave(420, 760, CW * c.sx)), span = Math.max(40, fh - hdr - 12), estrecho = izq() < 50;
        ctx.globalAlpha = ga; ctx.fillStyle = C.tenue; ctx.font = fuente(400, 11, C.num); ctx.textAlign = 'right';
        for (let k = 0; k <= H1 - H0; k++) { const yy = fy + hdr + k / (H1 - H0) * span; if (yy > 6 && yy < Vh - 4) ctx.fillText(estrecho ? String(H0 + k) : dosd(H0 + k) + ':00', izq() - 10, yy + 4); }
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      }
    }

    /* ── la etiqueta de la cabecera y el selector ──────────────────────── */
    const cuenta = (m, d) => dias[m][d - 1].ev.length;
    function semana(f) {
      const { row } = celdaDe(f), f0 = primero(f.m), out = [];
      for (let k = 0; k < 7; k++) { const n = row * 7 + k - f0 + 1; out.push(new Date(ANIO, f.m, n)); }
      return out;
    }
    function textoEtiqueta(nivel) {
      const f = foco;
      if (nivel === 0) { const t = dias.reduce((a, mes) => a + mes.reduce((b, d) => b + d.ev.length, 0), 0); return [String(ANIO), 'Año completo · ' + plural(t, 'evento', 'eventos').toLowerCase()]; }
      if (nivel === 1) { const t = dias[f.m].reduce((a, d) => a + d.ev.length, 0); return [cap(MESES[f.m]), ANIO + ' · ' + plural(t, 'evento', 'eventos').toLowerCase()]; }
      if (nivel === 2) {
        const sem = semana(f), a = sem[0], z = sem[6];
        const t = sem.reduce((s, dt) => s + (dt.getFullYear() === ANIO ? cuenta(dt.getMonth(), dt.getDate()) : 0), 0);
        const rango = a.getMonth() === z.getMonth() ? a.getDate() + ' – ' + z.getDate() + ' ' + MESES_C[z.getMonth()] : a.getDate() + ' ' + MESES_C[a.getMonth()] + ' – ' + z.getDate() + ' ' + MESES_C[z.getMonth()];
        return [rango, 'Semana de ' + MESES[f.m] + ' · ' + plural(t, 'evento', 'eventos').toLowerCase()];
      }
      const dia = dias[f.m][f.d - 1];
      return [cap(DIAS_L[dia.wd]) + ' ' + f.d, cap(MESES[f.m]) + ' ' + ANIO + ' · ' + plural(dia.ev.length, 'evento', 'eventos').toLowerCase()];
    }
    let etiClave = '', etiId = 0, avisoId = 0;
    function actualizaEtiqueta(nivel) {
      const [a, b] = textoEtiqueta(nivel), clave = a + '|' + b;
      if (clave === etiClave) return;
      const primera = !etiClave; etiClave = clave;
      const pon = () => { etiA.textContent = a; etiB.textContent = b; };
      if (primera || quieto()) { pon(); return; }
      clearTimeout(etiId);
      eti.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-7px)' }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
      etiId = setTimeout(() => { pon(); eti.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' }); }, 120);
    }
    let nivelPrev = -1;
    function sincroniza() {
      const l = clamp(Math.round(zS.x), 0, 3);
      raiz.style.setProperty('--ep-z', clamp(zS.x, 0, 3).toFixed(3));
      if (l !== nivelPrev) { nivelPrev = l; botonesNivel.forEach((b, i) => { b.setAttribute('aria-checked', String(i === l)); b.tabIndex = i === l ? 0 : -1; }); if (typeof o.alCambiar === 'function') o.alCambiar({ nivel: l, mes: foco.m, dia: foco.d }); }
      actualizaEtiqueta(l);
      clearTimeout(avisoId);
      avisoId = setTimeout(() => { const [a, b] = textoEtiqueta(clamp(Math.round(zS.meta), 0, 3)); avisa(['Año', 'Mes', 'Semana', 'Día'][clamp(Math.round(zS.meta), 0, 3)] + ': ' + a + '. ' + b + '.'); }, 700);
    }

    /* ── el bucle: física y dibujo solo mientras algo se mueve ─────────── */
    let raf = 0, tPrev = 0, sucio = true;
    function paso(ts) {
      raf = 0;
      const dt = Math.min(.05, Math.max(0, (ts - tPrev) / 1000)); tPrev = ts;
      if (quieto()) { zS.x = Math.round(zS.meta); zS.v = 0; offX.x = offY.x = 0; catS.forEach(s => { s.x = s.meta; s.v = 0; }); mesS.forEach(s => { s.x = s.meta; s.v = 0; }); }
      else {
        const pasos = Math.max(1, Math.ceil(dt * 240)), h = dt / pasos;
        for (let i = 0; i < pasos; i++) { avanza(zS, h); avanza(offX, h); avanza(offY, h); catS.forEach(s => avanza(s, h)); mesS.forEach(s => avanza(s, h)); }
      }
      dibuja(); sincroniza(); sucio = false;
      const mueve = !reposo(zS) || !reposo(offX) || !reposo(offY) || catS.some(s => !reposo(s)) || mesS.some(s => !reposo(s));
      if (mueve) raf = requestAnimationFrame(paso);
    }
    function arranca() { if (!raf) { tPrev = performance.now(); raf = requestAnimationFrame(paso); } }

    /* ── ir a un nivel, mover el foco ──────────────────────────────────── */
    const nivelActual = () => clamp(Math.round(zS.meta), 0, 3);
    function irNivel(n) { zS.meta = clamp(n, 0, 3); arranca(); }
    const acerca = k => irNivel(nivelActual() + k);
    function enFecha(dt) { if (dt.getFullYear() !== ANIO) return false; ponFoco({ m: dt.getMonth(), d: dt.getDate() }); arranca(); return true; }
    const mover = dd => enFecha(new Date(ANIO, foco.m, foco.d + dd));
    function mes(k) { const m = clamp(foco.m + k, 0, 11); ponFoco({ m, d: Math.min(foco.d, ndias(m)) }); arranca(); }
    const paso_ = k => { const l = nivelActual(); if (l <= 1) mes(k); else if (l === 2) mover(7 * k); else mover(k); };
    function hoy() { ponFoco({ m: HOY[0], d: HOY[1] }); arranca(); }

    /* ── ratón, dedo y rueda ───────────────────────────────────────────── */
    let ultimaRueda = -1e9, snapId = 0, accX = 0;
    const asienta = () => { clearTimeout(snapId); snapId = setTimeout(() => { zS.meta = clamp(Math.round(zS.meta), 0, 3); arranca(); }, 360); };
    function enfoca(px, py) { const f = bajo(px, py, camara()); ponFoco({ m: f.m, d: f.d }); }
    cv.addEventListener('wheel', ev => {
      ev.preventDefault();
      const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, k = ev.deltaMode === 1 ? 16 : 1;
      if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) * 1.4) { accX += ev.deltaX * k; if (Math.abs(accX) > 70) { paso_(accX > 0 ? 1 : -1); accX = 0; } return; }
      const ahora = performance.now(), nuevo = ahora - ultimaRueda > 650;     // un gesto = ruedas seguidas; cada gesto elige su foco
      if (nuevo) enfoca(px, py);
      ultimaRueda = ahora;
      if (quieto()) { if (nuevo) acerca(ev.deltaY < 0 ? 1 : -1); return; }   // con movimiento reducido, un gesto = un nivel
      zS.meta = clamp(zS.meta - ev.deltaY * k * (ev.ctrlKey ? .012 : .0032), 0, 3);
      arranca(); asienta();
    }, { passive: false });

    const punteros = new Map(); let pinza = null, inicio = null;
    cv.addEventListener('pointerdown', ev => {
      const r = cv.getBoundingClientRect();
      punteros.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura también sirve */ }
      if (punteros.size === 2) {
        const [a, b] = Array.from(punteros.values());
        pinza = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zS.meta, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        enfoca(pinza.mx, pinza.my); inicio = null;
      } else if (punteros.size === 1) { inicio = { x: ev.clientX - r.left, y: ev.clientY - r.top, t: performance.now() }; pinza = null; }
      teclado = false;
    });
    cv.addEventListener('pointermove', ev => {
      const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      if (punteros.has(ev.pointerId)) {
        punteros.set(ev.pointerId, { x: px, y: py });
        if (pinza && punteros.size === 2) {
          const [a, b] = Array.from(punteros.values());
          zS.meta = clamp(pinza.z + Math.log2((Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinza.d) * 1.5, 0, 3);
          arranca(); asienta(); return;
        }
      }
      if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') {
        const f = bajo(px, py, camara()), nh = f.dentro ? { m: f.m, d: f.d } : null;
        if ((nh && !hover) || (!nh && hover) || (nh && hover && (nh.m !== hover.m || nh.d !== hover.d))) { hover = nh; lienzo.classList.toggle('is-mano', !!nh && nivelActual() < 3); sucio = true; arranca(); }
      }
    });
    function suelta(ev) {
      const p = punteros.get(ev.pointerId); punteros.delete(ev.pointerId);
      if (pinza) { if (punteros.size < 2) { pinza = null; } return; }
      if (!p || !inicio) return;
      const dx = p.x - inicio.x, dy = p.y - inicio.y, dt = performance.now() - inicio.t; inicio = null;
      if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) { paso_(dx < 0 ? 1 : -1); return; }
      if (Math.hypot(dx, dy) < 8 && dt < 700) clic(p.x, p.y);
    }
    cv.addEventListener('pointerup', suelta);
    cv.addEventListener('pointercancel', ev => { punteros.delete(ev.pointerId); pinza = null; inicio = null; });
    cv.addEventListener('pointerleave', () => { if (hover) { hover = null; lienzo.classList.remove('is-mano'); sucio = true; arranca(); } });

    // un clic baja un nivel; en el año, un día con eventos baja hasta el propio día
    function clic(px, py) {
      const f = bajo(px, py, camara());
      if (!f.dentro) return;
      const l = clamp(Math.round(zS.x), 0, 3);
      ponFoco({ m: f.m, d: f.d });
      if (l === 0) irNivel(cuenta(f.m, f.d) ? 3 : 1);
      else if (l < 3) irNivel(l + 1);
      hover = null; lienzo.classList.remove('is-mano'); arranca();
    }

    /* ── teclado ───────────────────────────────────────────────────────── */
    cv.addEventListener('focus', () => { teclado = cv.matches(':focus-visible'); sucio = true; arranca(); });
    cv.addEventListener('blur', () => { teclado = false; sucio = true; arranca(); });
    cv.addEventListener('keydown', ev => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const k = ev.key; let ok = true;
      teclado = true;
      if (k === 'ArrowLeft') mover(-1); else if (k === 'ArrowRight') mover(1); else if (k === 'ArrowUp') mover(-7); else if (k === 'ArrowDown') mover(7);
      else if (k === 'PageUp') mes(-1); else if (k === 'PageDown') mes(1); else if (k === 'Home') hoy();
      else if (k === 'Enter' || k === '+' || k === '=') acerca(1); else if (k === 'Escape' || k === '-' || k === '_') acerca(-1);
      else if (k >= '1' && k <= '4') irNivel(+k - 1); else ok = false;
      if (ok) { ev.preventDefault(); const d = dias[foco.m][foco.d - 1]; sucio = true; arranca(); avisa(cap(DIAS_L[d.wd]) + ' ' + d.d + ' de ' + MESES[foco.m] + '. ' + plural(d.ev.length, 'evento', 'eventos') + (d.ev.length ? ': ' + d.ev.map(e => e.t + ' a las ' + hora(e.ini)).join(', ') + '.' : '.')); }
    });

    /* ── la cabecera ───────────────────────────────────────────────────── */
    botonesNivel.forEach((b, i) => {
      b.addEventListener('click', () => irNivel(i));
      b.addEventListener('keydown', ev => {
        let j = -1;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') j = Math.min(3, i + 1); else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') j = Math.max(0, i - 1);
        if (j >= 0) { ev.preventDefault(); irNivel(j); botonesNivel[j].focus(); }
      });
    });
    $('[data-ant]').addEventListener('click', () => paso_(-1));
    $('[data-sig]').addEventListener('click', () => paso_(1));
    $('[data-hoy]').addEventListener('click', hoy);
    chips.forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); catS[+b.dataset.cat].meta = on ? 1 : 0; arranca();
    }));

    /* ── el tamaño del lienzo ──────────────────────────────────────────── */
    if ('ResizeObserver' in window) new ResizeObserver(() => { sucioTam = true; arranca(); }).observe(lienzo);
    else addEventListener('resize', () => { sucioTam = true; arranca(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sucio = true; arranca(); });
    sucioTam = true; dibuja(); sincroniza(); arranca();

    return {
      nivel: n => { irNivel(n); },
      foco: (m, d) => { ponFoco({ m, d }); arranca(); },
      hoy,
      get zoom() { return zS.x; },
    };
  }

  window.Epoca = Epoca;
})();
