/* =====================================================================
   Semana · Moxen
   Una vista semanal de calendario que se siente en la mano. Las horas
   van a la izquierda, siete columnas dibujadas con degradados, el día de
   hoy resaltado y una línea de «ahora» con su bolita que avanza sola.
   Los eventos son pastel con barra lateral y:
     · se arrastran (ratón, dedo con pulsación larga o teclado) y se
       acomodan cada 15 min: mientras viajan, un globo dice la hora, una
       sombra punteada muestra dónde caerán y los vecinos se reparten en
       columnas en vivo; al soltar rebotan con un resorte y sueltan un
       destello;
     · se estiran por su borde inferior;
     · se crean arrastrando sobre un hueco (o con un clic, o con «Nuevo»)
       y nacen con un pop y el nombre ya en edición: Intro confirma,
       Esc cancela;
     · con el teclado: ↑ ↓ mueven 15 min, ← → un día, Mayús + ↑ ↓ cambian
       la duración, Intro renombra y Supr borra (con «Deshacer»).
   Cambiar de semana (‹ ›, Re Pág / Av Pág, «Hoy») desliza la cuadrícula:
   la página que sale y la que entra viajan juntas con una curva de
   resorte y sus eventos van un poco por delante, para dar profundidad.

     const s = Semana(document.querySelector('[data-semana]'), {
       hoy: [2026, 10, 14],      // «hoy» de la demostración (año, mes, día)
       ahora: 10 * 60 + 42,      // minuto del día donde empieza la línea de ahora
       velocidad: 1.2,           // minutos de agenda por segundo (0 = quieta)
       abre: 8, cierra: 20,      // horas visibles
       paso: 15, minimo: 30,     // el imán y la duración mínima, en minutos
       eventos: semana => [{ id, dia: 0-6, ini: minutos, dur: minutos, titulo, color }],
       alCambiar: lista => fetch(…),   // tras cada cambio, los eventos de la semana
     });
     s.ir(1); s.hoy(); s.nuevo(); s.reinicia();

   Los colores son seis: terracota, salvia, cielo, rosa, lila y amarillo
   (--sm-c-… es el pastel y --sm-b-… la barra). La altura de una hora es
   --sm-hora. Solo se anima transform y opacity (y el alto de un evento
   mientras se estira). Sin dependencias ni Date: las fechas se calculan
   con enteros, y el azar es mulberry32.
   ===================================================================== */
(function () {
  'use strict';

  /* ── resortes ─────────────────────────────────────────────────────── */
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, h) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; }
  const reposo = r => Math.abs(r.v) < .05 && Math.abs(r.meta - r.x) < .05;
  const fija = (r, p) => { r.k = p[0]; r.c = p[1]; };
  // las rigideces: [k, c]
  const P = {
    reparto: [250, 24],    // los vecinos que se hacen a un lado
    sigue: [780, 58],      // el evento que va pegado al puntero
    rebote: [250, 14],     // al soltar: pasa de largo y vuelve
    pop: [380, 15],        // al nacer
    alza: [340, 22],       // al levantarlo
    baja: [430, 13],       // al posarlo
    firme: [520, 40],      // ancho y alto
  };

  // un resorte convertido en curva CSS linear(), para lo que se mueve con CSS/WAAPI
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

  // azar con semilla: las semanas de ejemplo salen siempre iguales (la página y el vídeo coinciden)
  function mulberry32(s) {
    return () => {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ── fechas con enteros (días desde 1970), sin Date ───────────────── */
  function aDias(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    const e = Math.floor(y / 400), ye = y - e * 400, doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    return e * 146097 + ye * 365 + Math.floor(ye / 4) - Math.floor(ye / 100) + doy - 719468;
  }
  function deDias(z) {
    z += 719468;
    const e = Math.floor(z / 146097), doe = z - e * 146097;
    const ye = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * ye + Math.floor(ye / 4) - Math.floor(ye / 100)), mp = Math.floor((5 * doy + 2) / 153);
    const m = mp + (mp < 10 ? 3 : -9);
    return { y: ye + e * 400 + (m <= 2 ? 1 : 0), m, d: doy - Math.floor((153 * mp + 2) / 5) + 1 };
  }
  const lunesDe = sem => 7 * sem - 3;                         // el 1-1-1970 fue jueves
  const semanaDe = n => Math.floor((n + 3) / 7);
  const semanaIso = sem => {                                  // la semana ISO cuenta desde su jueves
    const jue = lunesDe(sem) + 3, y = deDias(jue).y;
    return Math.floor((jue - aDias(y, 1, 1)) / 7) + 1;
  };

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIA3 = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const COLORES = ['salvia', 'cielo', 'rosa', 'lila', 'amarillo', 'terracota'];
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const durTxt = d => d < 60 ? d + ' min' : Math.floor(d / 60) + ' h' + (d % 60 ? ' ' + d % 60 + ' min' : '');
  const acota = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ── los eventos de ejemplo ───────────────────────────────────────── */
  const h = (a, b) => a * 60 + (b || 0);
  // la semana de «hoy», escrita a mano: [día (0 = lunes), inicio, duración, título, color]
  const BASE = [
    [0, h(8, 30), 45, 'Plan de la semana', 'amarillo'], [0, h(10), 60, 'Revisión de ideas', 'lila'],
    [0, h(13), 90, 'Almuerzo largo', 'rosa'], [0, h(17, 30), 45, 'Caminata corta', 'salvia'],
    [1, h(10), 150, 'Taller de cerámica', 'terracota'], [1, h(15), 120, 'Sesión de foco', 'cielo'],
    [2, h(8, 30), 45, 'Café y lectura', 'amarillo'], [2, h(10), 120, 'Sesión de foco', 'cielo'],
    [2, h(13), 90, 'Almuerzo largo', 'rosa'], [2, h(15, 30), 90, 'Clase de dibujo', 'lila'], [2, h(16), 60, 'Pausa activa', 'salvia'],
    [3, h(11), 60, 'Revisión de ideas', 'lila'], [3, h(14), 150, 'Taller de cerámica', 'terracota'],
    [4, h(9), 120, 'Sesión de foco', 'cielo'], [4, h(16), 60, 'Cierre de semana', 'cielo'], [4, h(18, 30), 90, 'Cena en casa', 'rosa'],
    [5, h(10), 90, 'Mercado y plantas', 'salvia'], [5, h(15), 120, 'Tarde de lectura', 'amarillo'],
    [6, h(11), 120, 'Paseo largo', 'salvia'],
  ];
  // las demás semanas salen de este surtido, con azar sembrado por la semana
  const SURTIDO = [
    ['Taller de cerámica', 'terracota', 150], ['Revisión de ideas', 'lila', 60], ['Almuerzo largo', 'rosa', 90],
    ['Sesión de foco', 'cielo', 120], ['Pausa activa', 'salvia', 45], ['Café y lectura', 'amarillo', 45],
    ['Clase de dibujo', 'lila', 90], ['Cierre de semana', 'cielo', 60], ['Mercado y plantas', 'salvia', 90],
    ['Paseo largo', 'salvia', 120], ['Plan de la semana', 'amarillo', 45], ['Cena en casa', 'rosa', 90],
    ['Tarde de lectura', 'amarillo', 120], ['Ensayo de escritura', 'lila', 75],
  ];

  /* =====================================================================
     El calendario
     ===================================================================== */
  function Semana(raiz, opciones) {
    const o = Object.assign({
      hoy: [2026, 10, 14], ahora: h(10, 42), velocidad: 1.2,
      abre: 8, cierra: 20, paso: 15, minimo: 30, semilla: 7,
      eventos: null, alCambiar: null,
    }, opciones);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = s => raiz.querySelector(s);
    const viewport = $('[data-viewport]'), horasEl = $('[data-horas]'), vivo = $('[data-vivo]');
    const mesEl = $('[data-mes]'), anioEl = $('[data-anio]'), rangoEl = $('[data-rango]'), hoyBtn = $('[data-hoy]');
    const avisoEl = $('[data-aviso]'), avisoTxt = $('[data-aviso-txt]');
    const MIN0 = o.abre * 60, MIN1 = o.cierra * 60, N_HORAS = o.cierra - o.abre;
    const hoyN = aDias(o.hoy[0], o.hoy[1], o.hoy[2]), semHoy = semanaDe(hoyN);
    const curvaSlide = muelle(190, 27);
    raiz.style.setProperty('--sm-muelle', muelle(210, 15));
    raiz.style.setProperty('--sm-n-horas', N_HORAS);
    const anuncia = s => { vivo.textContent = ''; vivo.textContent = s; };

    // los relojes: reinicia() los cancela
    const relojes = new Set();
    const luego = (fn, ms) => { const id = setTimeout(() => { relojes.delete(id); fn(); }, ms); relojes.add(id); return id; };

    /* ── la geometría: se lee de --sm-hora y del ancho de la página ── */
    const G = { pxMin: 40 / 60, colW: 100, ancho: 700 };
    function mide() {
      const hora = parseFloat(getComputedStyle(raiz).getPropertyValue('--sm-hora')) || 40;
      G.pxMin = hora / 60;
      G.ancho = (pag ? pag.cuerpo : viewport).clientWidth || 700;
      G.colW = G.ancho / 7;
    }
    const yDe = min => (min - MIN0) * G.pxMin;
    const minDe = y => Math.round(((y - 1) / G.pxMin + MIN0) / o.paso) * o.paso;     // el borde de un evento
    const huecoDe = y => Math.floor((y / G.pxMin + MIN0) / o.paso) * o.paso;          // un hueco vacío

    /* ── los datos: cada semana guarda sus eventos (se editan en su sitio) ── */
    const almacen = new Map();
    let contador = 0, siguienteColor = 0;
    function demo(sem) {
      if (o.eventos) return o.eventos(sem).map(e => Object.assign({ id: 'x' + (contador++) }, e));
      if (sem === semHoy) return BASE.map((e, i) => ({ id: 'w' + sem + '-' + i, dia: e[0], ini: e[1], dur: e[2], titulo: e[3], color: e[4] }));
      const azar = mulberry32(o.semilla * 7919 + sem * 104729), lista = [], n = 13 + Math.floor(azar() * 4);
      for (let i = 0; i < n; i++) {
        const [titulo, color, dur] = SURTIDO[Math.floor(azar() * SURTIDO.length)];
        let dia = Math.floor(azar() * 5), ini = h(8) + Math.floor(azar() * ((MIN1 - dur - h(8)) / 30 + 1)) * 30;
        if (/Mercado|Paseo|Tarde de lectura/.test(titulo)) dia = 5 + Math.floor(azar() * 2);
        if (titulo === 'Plan de la semana') { dia = 0; ini = h(8, 30); }
        if (titulo === 'Cierre de semana') { dia = 4; ini = h(16); }
        if (lista.some(e => e.dia === dia && e.ini < ini + dur && e.ini + e.dur > ini && azar() < .85)) continue;
        if (lista.some(e => e.dia === dia && e.titulo === titulo)) continue;
        lista.push({ id: 'w' + sem + '-' + i, dia, ini, dur, titulo, color });
      }
      return lista;
    }
    const modelos = sem => { if (!almacen.has(sem)) almacen.set(sem, demo(sem)); return almacen.get(sem); };

    /* ── la hora de la izquierda ─────────────────────────────────── */
    let horaAhora = null, etiquetas = [];
    (function () {
      let t = '<div class="sm-horas-lista">';
      for (let i = 0; i <= N_HORAS; i++) t += '<span class="sm-hora-txt" style="top:calc(var(--sm-hora) * ' + i + ')">' + hm((o.abre + i) * 60) + '</span>';
      horasEl.innerHTML = t + '<span class="sm-ahora-hora"></span></div>';
      horaAhora = horasEl.querySelector('.sm-ahora-hora'); etiquetas = Array.from(horasEl.querySelectorAll('.sm-hora-txt'));
    })();

    /* =================================================================
       Las páginas (una por semana) y sus eventos
       ================================================================= */
    let pag = null, semana = semHoy, trans = false;
    const ocultos = new Set();
    const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

    function creaPagina(sem) {
      const lunes = lunesDe(sem), p = { sem, vistas: [], ahora: null };
      p.el = el('div', 'sm-pagina');
      p.el.setAttribute('role', 'group');
      const f0 = deDias(lunes), f6 = deDias(lunes + 6);
      p.el.setAttribute('aria-label', 'Semana del ' + f0.d + ' de ' + MESES[f0.m - 1].toLowerCase() + ' al ' + f6.d + ' de ' + MESES[f6.m - 1].toLowerCase());
      const dias = el('div', 'sm-dias');
      let idxHoy = -1;
      for (let i = 0; i < 7; i++) {
        const n = lunes + i, f = deDias(n), d = el('div', 'sm-dia' + (n === hoyN ? ' is-hoy' : '') + (i >= 5 ? ' is-finde' : ''));
        if (n === hoyN) { idxHoy = i; d.setAttribute('aria-current', 'date'); }
        d.innerHTML = '<span class="sm-dia-nom">' + DIA3[i] + '</span><span class="sm-dia-num">' + f.d + '</span>';
        d.setAttribute('aria-label', DIAL[i] + ' ' + f.d);
        dias.appendChild(d);
      }
      p.cuerpo = el('div', 'sm-cuerpo');
      p.cuerpo.innerHTML = '<div class="sm-rejilla" aria-hidden="true"></div><div class="sm-finde" aria-hidden="true"></div>';
      if (idxHoy >= 0) { const c = el('div', 'sm-hoy-col'); c.style.left = (idxHoy * 100 / 7) + '%'; c.setAttribute('aria-hidden', 'true'); p.cuerpo.appendChild(c); }
      p.eventos = el('div', 'sm-eventos');
      p.sitio = el('div', 'sm-sitio'); p.fantasma = el('div', 'sm-fantasma'); p.globo = el('div', 'sm-globo');
      p.sitio.setAttribute('aria-hidden', 'true'); p.fantasma.setAttribute('aria-hidden', 'true'); p.globo.setAttribute('aria-hidden', 'true');
      p.globo.innerHTML = '<i></i><span></span><small></small>';
      p.eventos.append(p.sitio, p.fantasma, p.globo);
      if (idxHoy >= 0) {
        // la línea de «ahora» va en dos capas: entera por debajo de los eventos (para no tachar su texto)
        // y, por encima, un eco tenue con la bolita
        const pos = '<i class="sm-ahora-hoy" style="left:' + (idxHoy * 100 / 7) + '%;width:' + (100 / 7) + '%"></i>';
        p.ahora = el('div', 'sm-ahora'); p.ahora.setAttribute('aria-hidden', 'true');
        p.ahora.innerHTML = '<i class="sm-ahora-tenue"></i>' + pos;
        p.ahoraSobre = el('div', 'sm-ahora sm-ahora-sobre'); p.ahoraSobre.setAttribute('aria-hidden', 'true');
        p.ahoraSobre.innerHTML = pos + '<b class="sm-ahora-punto" style="left:' + (idxHoy * 100 / 7) + '%"></b>';
        p.eventos.append(p.ahora, p.ahoraSobre);
      }
      p.cuerpo.appendChild(p.eventos);
      p.el.append(dias, p.cuerpo);
      modelos(sem).slice().sort((a, b) => a.dia - b.dia || a.ini - b.ini).forEach(m => creaVista(p, m));
      return p;
    }

    function creaVista(p, m) {
      const e = el('div', 'sm-ev');
      e.dataset.color = m.color; e.dataset.id = m.id; e.tabIndex = 0; e.setAttribute('role', 'button');
      e.setAttribute('aria-describedby', 'sm-ayuda');
      e.innerHTML = '<span class="sm-ev-barra"></span><span class="sm-ev-cuerpo"><span class="sm-ev-t"></span><span class="sm-ev-h"></span></span><span class="sm-asa" aria-hidden="true"><i></i></span>';
      const v = {
        m, el: e, pag: p, tEl: e.querySelector('.sm-ev-t'), hEl: e.querySelector('.sm-ev-h'),
        x: resorte(0, ...P.reparto), y: resorte(0, ...P.reparto), w: resorte(0, ...P.firme), h: resorte(0, ...P.firme), s: resorte(1, ...P.baja),
        r: 0, col: 0, cols: 1, libre: false, sale: false, editando: false, orig: null,
      };
      e.__v = v;
      p.eventos.insertBefore(e, p.sitio);
      p.vistas.push(v);
      textos(v);
      return v;
    }
    function textos(v) {
      const m = v.m;
      if (!v.editando) v.tEl.textContent = m.titulo;
      v.hEl.innerHTML = '<span class="sm-ini">' + hm(m.ini) + '</span><span class="sm-fin"> – ' + hm(m.ini + m.dur) + '</span>';
      v.el.classList.toggle('is-corto', m.dur < 60);
      v.el.classList.toggle('is-diminuto', m.dur <= 30);
      v.el.classList.toggle('is-largo', m.dur >= 90);
      const f = deDias(lunesDe(v.pag.sem) + m.dia);
      v.el.setAttribute('aria-label', m.titulo + ', ' + DIAL[m.dia] + ' ' + f.d + ' de ' + MESES[f.m - 1].toLowerCase() + ', de ' + hm(m.ini) + ' a ' + hm(m.ini + m.dur));
      v.el.dataset.color = m.color;
    }

    /* ── el reparto en columnas de los que se solapan ─────────────── */
    const PAD = 4, GAP = 3;
    function reparte(p) {
      const dias = [[], [], [], [], [], [], []];
      p.vistas.forEach(v => { if (!v.sale && !ocultos.has(v.m.color)) dias[v.m.dia].push(v); });
      dias.forEach(lista => {
        lista.sort((a, b) => a.m.ini - b.m.ini || b.m.dur - a.m.dur);
        let grupo = [], fin = -1;
        const cierra = () => {
          const cols = [];
          grupo.forEach(v => {
            let c = cols.findIndex(f => f <= v.m.ini);
            if (c < 0) { c = cols.length; cols.push(0); }
            cols[c] = v.m.ini + v.m.dur; v.col = c;
          });
          grupo.forEach(v => { v.cols = cols.length; });
        };
        lista.forEach(v => {
          if (grupo.length && v.m.ini >= fin) { cierra(); grupo = []; fin = -1; }
          grupo.push(v); fin = Math.max(fin, v.m.ini + v.m.dur);
        });
        if (grupo.length) cierra();
      });
      p.vistas.forEach(coloca);
      if (g && g.v && g.v.pag === p && g.activo) ponFantasma(g.v);
    }
    function coloca(v) {
      const m = v.m, sub = (G.colW - PAD * 2) / v.cols;
      v.lx = m.dia * G.colW + PAD + v.col * sub; v.lw = sub - (v.cols > 1 ? GAP : 0);
      v.ly = yDe(m.ini) + 1; v.lh = m.dur * G.pxMin - 2;
      if (!v.libre) { v.x.meta = v.lx; v.y.meta = v.ly; }
      v.w.meta = v.libre ? G.colW - PAD * 2 : v.lw; v.h.meta = v.lh;
      const est = v.lw < 104; if (v._est !== est) { v._est = est; v.el.classList.toggle('is-estrecho', est); }
    }
    function salta(p) {
      p.vistas.forEach(v => { [v.x, v.y, v.w, v.h, v.s].forEach(r => { r.x = r.meta; r.v = 0; }); });
      dibuja(p);
    }
    const preset = (v, pos) => { fija(v.x, pos); fija(v.y, pos); };

    /* ── dibujar: solo transform y opacity, y el tamaño del que cambia ─ */
    function dibuja(p) {
      p.vistas.forEach(v => {
        const rt = v.libre && !reduce ? acota(v.x.v / 260, -4, 4) : 0;
        v.r += (rt - v.r) * .22;
        const tr = 'translate(' + v.x.x.toFixed(2) + 'px,' + v.y.x.toFixed(2) + 'px)' + (Math.abs(v.r) > .02 ? ' rotate(' + v.r.toFixed(2) + 'deg)' : '') + (Math.abs(v.s.x - 1) > .0005 ? ' scale(' + v.s.x.toFixed(4) + ')' : '');
        if (v._t !== tr) { v.el.style.transform = tr; v._t = tr; }
        const w = Math.max(0, v.w.x), ht = Math.max(0, v.h.x);
        if (v._w === undefined || Math.abs(w - v._w) > .08) { v.el.style.width = w.toFixed(2) + 'px'; v._w = w; }
        if (v._h === undefined || Math.abs(ht - v._h) > .08) { v.el.style.height = ht.toFixed(2) + 'px'; v._h = ht; }
      });
      if (g && g.activo && g.v && g.v.pag === p) globoSigue(g.v);
    }

    /* ── el globo con la hora, la sombra de dónde caerá y el hueco ── */
    function muestraGlobo(v) {
      const gl = v.pag.globo;
      gl.style.setProperty('--barra', 'var(--sm-b-' + v.m.color + ')');
      gl.classList.add('is-visible'); textoGlobo(v);
      clearTimeout(v.pag._gt);
    }
    function textoGlobo(v) {
      const gl = v.pag.globo, m = v.m;
      gl.children[1].textContent = hm(m.ini) + ' – ' + hm(m.ini + m.dur); gl._w = 0;
      gl.children[2].textContent = durTxt(m.dur) + ' · ' + DIA3[m.dia];
    }
    function globoSigue(v) {
      const gl = v.pag.globo, abajo = v.y.x < 46;
      // el globo no se sale de lo que se ve (en pantallas estrechas la rejilla se desplaza)
      const gw = gl._w || (gl._w = gl.offsetWidth || 150), vis = viewport.scrollLeft;
      const gx = acota(v.x.x + v.w.x / 2, vis + gw / 2 + 6, Math.max(vis + gw / 2 + 6, vis + viewport.clientWidth - gw / 2 - 6)), gy = abajo ? v.y.x + v.h.x + 12 : v.y.x - 12;
      const tr = 'translate(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px) translate(-50%,' + (abajo ? '0' : '-100%') + ')';
      if (gl._t !== tr) { gl.style.transform = tr; gl._t = tr; }
      if (gl._ab !== abajo) { gl.classList.toggle('is-abajo', abajo); gl._ab = abajo; }
    }
    function ocultaGlobo(p, ms) {
      clearTimeout(p._gt);
      p._gt = setTimeout(() => p.globo.classList.remove('is-visible'), ms || 0);
    }
    function ponFantasma(v) {
      const f = v.pag.fantasma;
      f.style.setProperty('--barra', 'var(--sm-b-' + v.m.color + ')');
      f.style.width = v.lw + 'px'; f.style.height = v.lh + 'px';
      f.style.transform = 'translate(' + v.lx + 'px,' + v.ly + 'px)';
      f.classList.add('is-visible');
      textoGlobo(v);
    }
    const quitaFantasma = p => p.fantasma.classList.remove('is-visible');

    /* ── el destello al soltar: un anillo que se abre y unas chispas ── */
    function destello(v) {
      if (reduce || v.pag !== pag) return;
      const p = v.pag, azar = mulberry32(v.m.ini * 31 + v.m.dia * 7 + v.m.dur);
      const ping = el('i', 'sm-ping');
      ping.dataset.color = v.m.color;
      ping.style.width = v.w.meta + 'px'; ping.style.height = v.h.meta + 'px';
      const base = 'translate(' + v.x.meta + 'px,' + v.y.meta + 'px)';
      p.eventos.appendChild(ping);
      const a = ping.animate([
        { transform: base + ' scale(1)', opacity: .95 },
        { transform: base + ' scale(' + (1 + 14 / Math.max(40, v.w.meta)).toFixed(3) + ',' + (1 + 14 / Math.max(24, v.h.meta)).toFixed(3) + ')', opacity: 0 },
      ], { duration: 640, easing: 'cubic-bezier(.2, .7, .3, 1)' });
      a.onfinish = () => ping.remove();
      luego(() => ping.remove(), 900);
      for (let i = 0; i < 6; i++) {
        const c = el('i', 'sm-chispa'); c.dataset.color = v.m.color;
        const lado = azar() < .5 ? 0 : 1, bx = v.x.meta + (lado ? v.w.meta - 6 : 6 + azar() * Math.min(40, v.w.meta * .4)), by = v.y.meta + (lado ? 4 : v.h.meta - 4 - azar() * 4);
        const ang = (lado ? -50 : 130) + (azar() - .5) * 110, d = 22 + azar() * 26, rad = ang * Math.PI / 180;
        p.eventos.appendChild(c);
        const ca = c.animate([
          { transform: 'translate(' + bx + 'px,' + by + 'px) rotate(45deg) scale(1)', opacity: 1 },
          { transform: 'translate(' + (bx + Math.cos(rad) * d) + 'px,' + (by + Math.sin(rad) * d) + 'px) rotate(' + (45 + (azar() - .5) * 200) + 'deg) scale(.1)', opacity: 0 },
        ], { duration: 520 + azar() * 220, easing: 'cubic-bezier(.2, .8, .3, 1)', delay: azar() * 60, fill: 'backwards' });
        ca.onfinish = () => c.remove();
        luego(() => c.remove(), 1000);
      }
    }

    /* =================================================================
       Los gestos: mover, estirar y crear (ratón, dedo y lápiz)
       ================================================================= */
    let g = null;
    const aPag = e => { const r = pag.cuerpo.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const vistaDe = nodo => { const n = nodo && nodo.closest && nodo.closest('.sm-ev'); return n && n.__v && n.__v.pag === pag ? n.__v : null; };

    function abajo(e) {
      if (e.button > 0 || trans || g) return;
      if (e.target.closest('input')) return;
      // si había un nombre en edición, este clic solo lo confirma
      if (edicion) { cierraEdicion(true); return; }
      const asa = e.target.closest('.sm-asa'), v = vistaDe(e.target);
      const touch = e.pointerType === 'touch', p0 = aPag(e);
      if (v && !v.sale) {
        g = { tipo: asa ? 'estira' : 'mueve', v, id: e.pointerId, x0: e.clientX, y0: e.clientY, activo: false, touch, p0, orig: { dia: v.m.dia, ini: v.m.ini, dur: v.m.dur } };
        g.ox = p0.x - v.x.x; g.oy = p0.y - v.y.x; g.dy0 = p0.y - (v.y.x + v.h.x);
        if (touch && !asa) g.timer = setTimeout(() => { if (g) arranca(); }, 260);
      } else if (e.target.closest('.sm-cuerpo')) {
        const dia = acota(Math.floor(p0.x / G.colW), 0, 6);
        g = { tipo: 'crea', v: null, id: e.pointerId, x0: e.clientX, y0: e.clientY, activo: false, touch, p0, dia, m0: acota(huecoDe(p0.y), MIN0, MIN1 - o.minimo) };
        if (touch) g.timer = setTimeout(() => { if (g) arranca(); }, 320);
      } else return;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) { /* ya no está activo */ }
      if (!touch) sitio.oculta();
    }

    // el gesto toma forma: se levanta el evento, o nace el nuevo
    function arranca() {
      if (!g || g.activo) return;
      g.activo = true;
      if (g.tipo === 'crea') {
        const v = nuevoEvento(g.dia, g.m0, o.minimo, true);
        g.v = v; v.el.classList.add('is-estira');
        g.orig = null;
      }
      const v = g.v;
      if (g.tipo === 'mueve') {
        v.libre = true; v.el.classList.add('is-alza');
        preset(v, P.sigue); fija(v.s, P.alza); v.s.meta = 1.035;
        v.el.focus({ preventScroll: true });
        viewport.style.cursor = 'grabbing';
      } else if (g.tipo === 'estira') {
        v.el.classList.add('is-estira'); fija(v.h, P.sigue); fija(v.y, P.firme);
        v.el.focus({ preventScroll: true });
      }
      muestraGlobo(v); ponFantasma(v);
    }

    function mueve(e) {
      if (!g) return hover(e);
      if (e.pointerId !== g.id) return;
      if (!g.activo) {
        if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < (g.touch ? 10 : 4)) return;
        if (g.touch) { cancelaGesto(); return; }          // se movió antes de la pulsación larga: es desplazarse
        arranca();
      }
      const p = aPag(e), v = g.v;
      // al borde de la pantalla estrecha, la columna se desliza sola
      if (viewport.scrollWidth > viewport.clientWidth + 1) {
        const r = viewport.getBoundingClientRect();
        if (e.clientX < r.left + 36) viewport.scrollLeft -= 12; else if (e.clientX > r.right - 36) viewport.scrollLeft += 12;
      }
      if (g.tipo === 'mueve') {
        const fx = p.x - g.ox, fy = p.y - g.oy;
        v.x.meta = fx; v.y.meta = fy;
        const dia = acota(Math.floor((fx + v.w.x / 2) / G.colW), 0, 6), ini = acota(minDe(fy), MIN0, MIN1 - v.m.dur);
        if (dia !== v.m.dia || ini !== v.m.ini) { v.m.dia = dia; v.m.ini = ini; reparte(pag); textos(v); }
      } else if (g.tipo === 'estira') {
        const fin = acota(Math.round(((p.y - g.dy0) / G.pxMin + MIN0) / o.paso) * o.paso, v.m.ini + o.minimo, MIN1);
        if (fin - v.m.ini !== v.m.dur) { v.m.dur = fin - v.m.ini; reparte(pag); textos(v); }
      } else {
        const pm = acota(Math.round((p.y / G.pxMin + MIN0) / o.paso) * o.paso, MIN0, MIN1);
        let lo = Math.min(g.m0, pm), hi = Math.max(g.m0 + o.paso, pm);
        if (hi - lo < o.minimo) hi = lo + o.minimo;
        if (hi > MIN1) { hi = MIN1; lo = Math.min(lo, hi - o.minimo); }
        if (lo !== v.m.ini || hi - lo !== v.m.dur) { v.m.ini = lo; v.m.dur = hi - lo; reparte(pag); [v.x, v.y, v.w, v.h].forEach(r => { r.x = r.meta; r.v = 0; }); textos(v); }
      }
    }

    function arriba(e) {
      if (!g || e.pointerId !== g.id) return;
      const q = g; g = null; clearTimeout(q.timer);
      viewport.style.cursor = '';
      try { viewport.releasePointerCapture(e.pointerId); } catch (_) { /* ya soltado */ }
      if (!q.activo) { clicSimple(q, e); return; }
      termina(q);
    }
    function termina(q) {
      const v = q.v;
      quitaFantasma(v.pag); ocultaGlobo(v.pag, 650);
      v.el.classList.remove('is-alza', 'is-estira');
      if (q.tipo === 'mueve') {
        v.libre = false; preset(v, P.rebote); fija(v.s, P.baja); v.s.meta = 1;
        v.s.v -= 2.2;                                      // se posa con un ligero hundimiento
        reparte(v.pag);
        anuncia(v.m.titulo + ' movido a ' + DIAL[v.m.dia] + ', de ' + hm(v.m.ini) + ' a ' + hm(v.m.ini + v.m.dur));
        v.pag === pag && destello(v);
      } else if (q.tipo === 'estira') {
        fija(v.h, P.rebote); fija(v.y, P.reparto); reparte(v.pag);
        v.h.v += 40;
        anuncia(v.m.titulo + ' ahora dura ' + durTxt(v.m.dur));
        destello(v);
      } else {
        v.pag.vistas.sort((a, b) => a.m.dia - b.m.dia || a.m.ini - b.m.ini);
        textos(v); reparte(v.pag); edita(v, true);
        anuncia('Nuevo evento el ' + DIAL[v.m.dia] + ', de ' + hm(v.m.ini) + ' a ' + hm(v.m.ini + v.m.dur) + '. Escribe su nombre.');
      }
      textos(v); cambio();
    }
    // un gesto interrumpido (Esc, cancelación del navegador, otra página) deja todo como estaba
    function cancelaGesto() {
      if (!g) return;
      const q = g; g = null; clearTimeout(q.timer);
      viewport.style.cursor = '';
      if (!q.activo) return;
      const v = q.v;
      quitaFantasma(v.pag); ocultaGlobo(v.pag, 0);
      v.el.classList.remove('is-alza', 'is-estira');
      if (q.tipo === 'crea') { quita(v, true); return; }
      v.libre = false; preset(v, P.rebote); fija(v.s, P.baja); v.s.meta = 1;
      Object.assign(v.m, q.orig); textos(v); reparte(v.pag);
    }
    function clicSimple(q, e) {
      if (q.tipo === 'mueve') {
        const v = q.v;
        if (ultimoClic && ultimoClic.v === v && e.timeStamp - ultimoClic.t < 380) { ultimoClic = null; edita(v, false); return; }
        ultimoClic = { v, t: e.timeStamp };
        v.el.focus({ preventScroll: true });
      } else if (q.tipo === 'crea' && !q.touch) {
        // un clic en un hueco: un evento de una hora que ya espera su nombre
        const v = nuevoEvento(q.dia, acota(q.m0, MIN0, MIN1 - 60), 60, true);
        v.pag.vistas.sort((a, b) => a.m.dia - b.m.dia || a.m.ini - b.m.ini);
        reparte(v.pag); edita(v, true); cambio();
      }
    }
    let ultimoClic = null;
    viewport.addEventListener('pointerdown', abajo);
    viewport.addEventListener('pointermove', mueve);
    viewport.addEventListener('pointerup', arriba);
    viewport.addEventListener('pointercancel', () => cancelaGesto());
    viewport.addEventListener('pointerleave', () => { if (!g) sitio.oculta(); });
    viewport.addEventListener('lostpointercapture', e => { if (g && e.pointerId === g.id && !g.activo) { clearTimeout(g.timer); g = null; } });
    // con el dedo, una vez levantado el evento, la página no debe desplazarse
    viewport.addEventListener('touchmove', e => { if (g && g.activo && e.cancelable) e.preventDefault(); }, { passive: false });
    viewport.addEventListener('contextmenu', e => { if (g && g.touch) e.preventDefault(); });

    // el hueco que se insinúa al pasar el cursor por un espacio libre
    const sitio = {
      oculta() { if (pag) pag.sitio.classList.remove('is-visible'); },
      muestra(e) {
        const s = pag.sitio, p = aPag(e), dia = acota(Math.floor(p.x / G.colW), 0, 6), ini = acota(huecoDe(p.y), MIN0, MIN1 - o.minimo);
        const tr = 'translate(' + (dia * G.colW + PAD) + 'px,' + (yDe(ini) + 1) + 'px)';
        if (s._t !== tr) { s.style.transform = tr; s._t = tr; s.textContent = '+ ' + hm(ini); }
        if (!s._w || s._w !== G.colW) { s.style.width = (G.colW - PAD * 2) + 'px'; s.style.height = (o.minimo * G.pxMin - 2) + 'px'; s._w = G.colW; }
        s.classList.add('is-visible');
      },
    };
    function hover(e) {
      if (e.pointerType !== 'mouse' || trans || !pag) return;
      if (e.target.closest('.sm-ev') || !e.target.closest('.sm-cuerpo') || edicion) sitio.oculta(); else sitio.muestra(e);
    }

    /* ── crear, nombrar y quitar ─────────────────────────────────── */
    function nuevoEvento(dia, ini, dur, pop) {
      const color = COLORES[siguienteColor++ % COLORES.length];
      const m = { id: 'n' + (contador++), dia, ini, dur, titulo: '', color };
      modelos(pag.sem).push(m);
      const v = creaVista(pag, m);
      v.libre = false; reparte(pag);
      [v.x, v.y, v.w, v.h].forEach(r => { r.x = r.meta; r.v = 0; });
      v.el.classList.add('is-entra');
      if (pop && !reduce) { v.s.x = .55; v.s.v = 0; v.s.meta = 1; fija(v.s, P.pop); }
      dibuja(pag); textos(v);
      return v;
    }
    let edicion = null;
    function edita(v, nuevo) {
      if (edicion) cierraEdicion(true);
      sitio.oculta();
      const inp = el('input'), t = v.tEl, previo = v.m.titulo;
      inp.type = 'text'; inp.value = nuevo ? '' : previo; inp.placeholder = 'Nuevo evento'; inp.maxLength = 40; inp.autocomplete = 'off';
      inp.setAttribute('aria-label', 'Nombre del evento');
      t.textContent = ''; t.appendChild(inp);
      v.editando = true; v.el.classList.add('is-edita', 'is-largo');
      edicion = { v, inp, nuevo, previo, hecho: false };
      inp.addEventListener('keydown', k => {
        k.stopPropagation();
        if (k.key === 'Enter') { k.preventDefault(); cierraEdicion(true); v.el.focus({ preventScroll: true }); }
        else if (k.key === 'Escape') { k.preventDefault(); cierraEdicion(false); v.el.focus({ preventScroll: true }); }
      });
      inp.addEventListener('blur', () => { if (edicion && edicion.inp === inp) cierraEdicion(true); });
      inp.focus({ preventScroll: true }); inp.select();
    }
    function cierraEdicion(ok) {
      if (!edicion || edicion.hecho) return;
      const { v, inp, nuevo, previo } = edicion;
      edicion.hecho = true; edicion = null;
      const txt = inp.value.trim();
      v.editando = false; v.el.classList.remove('is-edita');
      if (!ok && nuevo) { quita(v, true); anuncia('Evento cancelado'); return; }
      v.m.titulo = ok ? (txt || (nuevo ? 'Nuevo evento' : previo)) : previo;
      textos(v); cambio();
      if (ok && !reduce) { fija(v.s, P.baja); v.s.v += 3.2; }
      anuncia(ok ? 'Evento guardado: ' + v.m.titulo : 'Cambio cancelado');
    }
    // quitar un evento: se encoge y se desvanece; `sinAviso` no ofrece deshacer
    let deshacerDe = null, avisoT = 0;
    function quita(v, sinAviso) {
      const p = v.pag;
      v.sale = true; v.el.classList.add('is-sale'); fija(v.s, P.firme); v.s.meta = reduce ? 1 : .84;
      const lista = modelos(p.sem), i = lista.indexOf(v.m);
      if (i >= 0) lista.splice(i, 1);
      reparte(p);
      luego(() => { v.el.remove(); const k = p.vistas.indexOf(v); if (k >= 0) p.vistas.splice(k, 1); }, reduce ? 0 : 260);
      if (!sinAviso) {
        deshacerDe = { m: Object.assign({}, v.m), sem: p.sem, i };
        muestraAviso('Evento eliminado');
        anuncia(v.m.titulo + ' eliminado. Hay un botón para deshacer.');
        cambio();
      }
    }
    function muestraAviso(txt) {
      avisoTxt.textContent = txt; avisoEl.hidden = false;
      avisoEl.style.animation = 'none'; void avisoEl.offsetWidth; avisoEl.style.animation = '';
      clearTimeout(avisoT); avisoT = luego(ocultaAviso, 5200);
    }
    function ocultaAviso() { avisoEl.hidden = true; deshacerDe = null; }
    $('[data-deshacer]').addEventListener('click', () => {
      if (!deshacerDe) return;
      const d = deshacerDe; ocultaAviso();
      if (d.sem !== semana) return;
      const lista = modelos(d.sem); lista.splice(Math.min(d.i, lista.length), 0, d.m);
      const v = creaVista(pag, d.m);
      pag.vistas.sort((a, b) => a.m.dia - b.m.dia || a.m.ini - b.m.ini);
      reparte(pag); [v.x, v.y, v.w, v.h].forEach(r => { r.x = r.meta; r.v = 0; });
      v.el.classList.add('is-entra'); if (!reduce) { v.s.x = .7; fija(v.s, P.pop); }
      dibuja(pag); destello(v); v.el.focus({ preventScroll: true });
      anuncia(d.m.titulo + ' restaurado'); cambio();
    });

    /* ── el teclado ─────────────────────────────────────────────── */
    viewport.addEventListener('keydown', e => {
      const v = vistaDe(e.target);
      if (!v || e.target !== v.el || v.sale || trans) return;
      const m = v.m, sh = e.shiftKey;
      let dd = 0, dm = 0, dr = 0;
      switch (e.key) {
        case 'ArrowUp': if (sh) dr = -o.paso; else dm = -o.paso; break;
        case 'ArrowDown': if (sh) dr = o.paso; else dm = o.paso; break;
        case 'ArrowLeft': dd = -1; break;
        case 'ArrowRight': dd = 1; break;
        case 'Enter': case 'F2': e.preventDefault(); edita(v, false); return;
        case 'Delete': case 'Backspace': {
          e.preventDefault();
          const lista = pag.vistas.filter(x => !x.sale && x !== v), sig = lista.find(x => x.m.dia > m.dia || (x.m.dia === m.dia && x.m.ini >= m.ini)) || lista[lista.length - 1];
          quita(v, false);
          (sig ? sig.el : raiz.querySelector('[data-nuevo]')).focus({ preventScroll: true });
          return;
        }
        case 'Escape': v.el.blur(); return;
        default: return;
      }
      e.preventDefault();
      const dia = acota(m.dia + dd, 0, 6), dur = acota(m.dur + dr, o.minimo, MIN1 - m.ini), ini = acota(m.ini + dm, MIN0, MIN1 - dur);
      if (dia === m.dia && ini === m.ini && dur === m.dur) { anuncia('No se puede mover más allá'); return; }
      m.dia = dia; m.ini = ini; m.dur = dur;
      preset(v, P.rebote); fija(v.h, P.rebote); reparte(pag); textos(v);
      if (!reduce) { fija(v.s, P.baja); v.s.x = 1.03; v.s.meta = 1; }
      muestraGlobo(v); globoSigue(v); ocultaGlobo(pag, 900);
      destello(v); cambio();
      anuncia(DIAL[dia] + ', de ' + hm(ini) + ' a ' + hm(ini + dur));
    });
    document.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.key === 'Escape') { if (g) { cancelaGesto(); e.preventDefault(); } else if (!avisoEl.hidden) ocultaAviso(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'PageUp') { e.preventDefault(); ir(semana - 1); }
      else if (e.key === 'PageDown') { e.preventDefault(); ir(semana + 1); }
      else if ((e.key === 't' || e.key === 'T') && !e.target.closest('button')) { irHoy(); }
    });

    /* ── la cabecera: el mes grande, el rango y los botones ───────── */
    function cabecera(sem, dir, anima) {
      const lun = lunesDe(sem), f0 = deDias(lun), f6 = deDias(lun + 6), fj = deDias(lun + 3);
      const mes = MESES[fj.m - 1];
      const rango = 'Semana ' + semanaIso(sem) + ' · ' + f0.d + (f0.m !== f6.m ? ' ' + MES3[f0.m - 1] : '') + ' – ' + f6.d + ' ' + MES3[f6.m - 1];
      anioEl.textContent = fj.y;
      if (mesEl.textContent !== mes) {
        if (!anima || reduce) mesEl.textContent = mes;
        else {
          const sale = mesEl.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(' + (-dir * 105) + '%)', opacity: 0 }], { duration: 170, easing: 'cubic-bezier(.5, 0, .9, .5)', fill: 'forwards' });
          sale.onfinish = () => {
            mesEl.textContent = mes;
            mesEl.animate([{ transform: 'translateY(' + (dir * 105) + '%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 520, easing: curvaSlide });
            sale.cancel();
          };
        }
      }
      if (rangoEl.textContent !== rango) {
        rangoEl.textContent = rango;
        if (anima && !reduce) rangoEl.animate([{ transform: 'translateX(' + (dir * 14) + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      }
      hoyBtn.setAttribute('aria-current', sem === semHoy ? 'true' : 'false');
    }

    /* ── cambiar de semana: la página que sale y la que entra viajan juntas ── */
    function ir(sem) {
      if (trans || sem === semana) return;
      cierraEdicion(true); cancelaGesto(); ocultaAviso(); sitio.oculta();
      const dir = sem > semana ? 1 : -1, vieja = pag, nueva = creaPagina(sem);
      semana = sem;
      viewport.appendChild(nueva.el);
      pag = nueva; mide(); reparte(nueva); salta(nueva);
      nueva.vistas.forEach((v, i) => { v.el.classList.add('is-entra'); v.el.style.setProperty('--retardo', (.02 + i * .009).toFixed(3) + 's'); });
      cabecera(sem, dir, true);
      anuncia(rangoEl.textContent);
      vieja.el.classList.add('is-saliendo'); vieja.el.inert = true;
      let hecho = false;                                    // cada viaje cierra solo lo suyo, aunque otro empiece
      const fin = () => { if (hecho) return; hecho = true; trans = false; viewport.classList.remove('is-trans'); vieja.el.remove(); nueva.vistas.forEach(v => v.el.classList.remove('is-entra')); };
      trans = true; viewport.classList.add('is-trans');
      if (reduce) { fin(); return; }
      const W = viewport.clientWidth, op = { duration: 720, easing: curvaSlide };
      const anim = [
        vieja.el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * W) + 'px)' }], op),
        nueva.el.animate([{ transform: 'translateX(' + (dir * W) + 'px)' }, { transform: 'translateX(0)' }], op),
        vieja.eventos.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * 90) + 'px)' }], op),
        nueva.eventos.animate([{ transform: 'translateX(' + (dir * 90) + 'px)' }, { transform: 'translateX(0)' }], op),
      ];
      Promise.all(anim.map(a => a.finished)).then(fin, fin);
      setTimeout(fin, 900);                                 // por si el navegador no avisa del final
    }
    const irHoy = () => ir(semHoy);
    $('[data-ant]').addEventListener('click', () => ir(semana - 1));
    $('[data-sig]').addEventListener('click', () => ir(semana + 1));
    hoyBtn.addEventListener('click', irHoy);
    $('[data-nuevo]').addEventListener('click', () => {
      if (trans) return;
      cierraEdicion(true);
      // el primer hueco de una hora libre de hoy (o del lunes, si no es esta semana)
      const dia = semana === semHoy ? hoyN - lunesDe(semHoy) : 0;
      let ini = h(9);
      while (ini < MIN1 - 60 && modelos(semana).some(m => m.dia === dia && m.ini < ini + 60 && m.ini + m.dur > ini)) ini += 30;
      const v = nuevoEvento(dia, ini, 60, true);
      pag.vistas.sort((a, b) => a.m.dia - b.m.dia || a.m.ini - b.m.ini);
      reparte(pag); edita(v, true); cambio();
      anuncia('Nuevo evento. Escribe su nombre.');
    });
    // categorías: cada color se enciende y se apaga
    raiz.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      const c = b.dataset.cat, on = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!on));
      if (on) ocultos.add(c); else ocultos.delete(c);
      aplicaFiltros();
    }));
    function aplicaFiltros() {
      cierraEdicion(true);
      pag.vistas.forEach(v => {
        const oc = ocultos.has(v.m.color);
        v.el.classList.toggle('is-oculto', oc); v.el.tabIndex = oc ? -1 : 0;
        if (!reduce) { fija(v.s, P.baja); v.s.meta = oc ? .9 : 1; }
      });
      reparte(pag);
    }
    // volver al principio: lo movido regresa, lo nuevo se retira y lo borrado vuelve
    function reinicia() {
      if (trans) { setTimeout(reinicia, 120); return; }
      relojes.forEach(clearTimeout); relojes.clear();
      cierraEdicion(false); cancelaGesto(); ocultaAviso();
      almacen.clear(); ocultos.clear();
      raiz.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', 'true'));
      if (semana !== semHoy) { ir(semHoy); return; }
      const base = modelos(semana), previas = pag.vistas.slice();
      previas.forEach(v => {
        const nuevo = base.find(m => m.id === v.m.id);
        if (nuevo) {
          v.m = nuevo; v.el.classList.remove('is-sale', 'is-oculto'); v.el.tabIndex = 0; v.sale = false; v.libre = false;
          preset(v, P.rebote); fija(v.s, P.baja); v.s.meta = 1; textos(v);
        } else { v.sale = true; v.el.classList.add('is-sale'); fija(v.s, P.firme); v.s.meta = reduce ? 1 : .8; luego(() => { v.el.remove(); const k = pag.vistas.indexOf(v); if (k >= 0) pag.vistas.splice(k, 1); }, reduce ? 0 : 300); }
      });
      base.forEach(m => {
        if (previas.some(v => v.m === m)) return;
        const v = creaVista(pag, m);
        v.el.classList.add('is-entra'); reparte(pag); [v.x, v.y, v.w, v.h].forEach(r => { r.x = r.meta; r.v = 0; });
        if (!reduce) { v.s.x = .7; fija(v.s, P.pop); }
      });
      reparte(pag);
      anuncia('Semana restablecida');
    }
    $('[data-reinicia]').addEventListener('click', reinicia);

    function cambio() { if (o.alCambiar) o.alCambiar(modelos(semana).map(m => Object.assign({}, m))); }

    /* ── el bucle: los resortes y la línea de «ahora» ─────────────── */
    const PASO = 1 / 120;
    let raf = 0, previo = 0, resto = 0, t0 = null, minutoAhora = -1;
    function cuadro(ms) {
      raf = 0;
      if (document.hidden) return;
      if (t0 === null) t0 = ms;
      const dt = previo ? Math.min(.1, (ms - previo) / 1000) : 0; previo = ms; resto += dt;
      const rs = [];
      pag.vistas.forEach(v => rs.push(v.x, v.y, v.w, v.h, v.s));
      if (reduce) rs.forEach(r => { r.x = r.meta; r.v = 0; });
      else {
        let n = 0;
        while (resto >= PASO && n < 24) { rs.forEach(r => avanza(r, PASO)); resto -= PASO; n++; }
        if (n === 24) resto = 0;
      }
      dibuja(pag);
      ahora(ms);
      raf = requestAnimationFrame(cuadro);
    }
    function ahora(ms) {
      const a = pag.ahora, min = o.ahora + (reduce ? 0 : o.velocidad * (ms - t0) / 1000), dentro = min >= MIN0 && min <= MIN1;
      if (a) {
        const y = yDe(acota(min, MIN0, MIN1)), tr = 'translateY(' + y.toFixed(2) + 'px)';
        if (a._t !== tr) {
          a.style.transform = tr; pag.ahoraSobre.style.transform = tr; a._t = tr; horaAhora.style.transform = 'translateY(' + (y - 9).toFixed(2) + 'px)';
          etiquetas.forEach((l, i) => { const t = Math.abs(i * 60 * G.pxMin - y) < 13; if (l._tapada !== t) { l._tapada = t; l.style.opacity = t ? 0 : ''; } });
        }
        a.style.visibility = pag.ahoraSobre.style.visibility = dentro ? '' : 'hidden';
        const mm = Math.floor(min);
        if (mm !== minutoAhora) { minutoAhora = mm; horaAhora.textContent = hm(mm); }
      }
      horaAhora.classList.toggle('is-visible', !!a && dentro);
    }
    function despierta() { if (!raf) { previo = 0; raf = requestAnimationFrame(cuadro); } }
    document.addEventListener('visibilitychange', () => { previo = 0; if (!document.hidden) despierta(); });

    /* ── al empezar ─────────────────────────────────────────────── */
    pag = creaPagina(semana);
    viewport.appendChild(pag.el);
    mide(); reparte(pag); salta(pag);
    cabecera(semana, 1, false);
    pag.vistas.forEach((v, i) => {
      v.el.classList.add('is-entra'); v.el.style.setProperty('--retardo', (.1 + i * .035).toFixed(3) + 's');
      if (!reduce) { v.s.x = .88; fija(v.s, P.pop); luego(() => { v.el.classList.remove('is-entra'); }, 1400); }
      else luego(() => v.el.classList.remove('is-entra'), 0);
    });
    if (viewport.scrollWidth > viewport.clientWidth + 1) {
      const idx = hoyN - lunesDe(semHoy);
      viewport.scrollLeft = Math.max(0, (idx + .5) * G.colW - viewport.clientWidth / 2);
    }
    new ResizeObserver(() => {
      mide(); reparte(pag); salta(pag);
      if (g && g.v) ponFantasma(g.v);
    }).observe(viewport);
    if (document.fonts) document.fonts.ready.then(() => { pag.vistas.forEach(v => { v._w = v._h = undefined; }); });
    despierta();

    return {
      ir: d => ir(semana + d), hoy: irHoy, reinicia,
      nuevo: () => $('[data-nuevo]').click(),
      eventos: () => modelos(semana).map(m => Object.assign({}, m)),
    };
  }

  window.Semana = Semana;
})();
