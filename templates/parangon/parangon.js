/* =====================================================================
   Parangón · Moxen
   El selector de periodo de un panel de análisis: atajos (7 días, 30 días, este mes, este trimestre), un rango a
   medida y «Comparar con» el periodo anterior o el mismo del año pasado. Lo que lo distingue de un selector de
   fechas cualquiera es que el periodo viene acompañado de su pareja: una segunda banda fantasma sobre el
   calendario y, debajo, el minigráfico con la serie anterior punteada detrás de la actual y su diferencia.

   · Los atajos son píldoras con una marca que viaja de una a otra con resorte; la banda del calendario crece o se
     retira día a día, en ola, desde el primer día del tramo, y sus dos extremos son discos que se estampan.
     Arrastrar entre dos días (o clic en uno y clic en otro) crea un rango «A medida», que aparece como una
     píldora más. Los días futuros no se eligen.
   · «Comparar con» enciende la banda fantasma (puntos en violeta gris, de igual largo y justo antes, o las mismas
     fechas un año atrás), la serie anterior se destapa de izquierda a derecha en el minigráfico y la diferencia
     rueda en una píldora (+18 %). Si el periodo comparado queda fuera de los dos meses a la vista, un enlace
     en la cifra «Anterior» lleva el calendario hasta allá, y otro trae de vuelta al actual.
   · Teclado: flechas por los días, Mayús + flechas extiende desde el día donde estabas, Intro o Espacio fija el
     primer día y luego el último, Esc suelta, Re Pág / Av Pág cambian de meses. Con el cursor sobre el minigráfico,
     una cruz da el valor de cada día y el de su pareja.
   · «Aplicar» se resuelve en un ✓ azul y el campo de arriba muestra los dos rangos. Con `autoReinicia` la demo
     vuelve sola al principio, para que el vídeo haga bucle.

   Montaje (se inicia solo sobre [data-parangon]; el HTML de la demo es la plantilla):
     const p = Parangon(document.querySelector('[data-parangon]'), {
       hoy: '2026-11-18',     // el «hoy» de tu panel, AAAA-MM-DD (también en data-hoy); los días futuros no se eligen
       autoReinicia: false,
       valor: d => number,    // las visitas de un día (d = días desde 1970); aquí hay una serie de ejemplo
       alAplicar: ({ desde, hasta, comparar, desdeComparado, hastaComparado }) => {},   // fechas AAAA-MM-DD
     });
     p.elige('30d');  p.rango('2026-11-03', '2026-11-11');  p.comparar(true, 'anio');  p.aplica();  p.reinicia();

   Las fechas se cuentan a mano con enteros (días desde el 1-1-1970): sin husos horarios ni Date, y la serie de
   ejemplo sale de una función de hash, no del azar. Todo lo que se mueve es transform u opacity; las curvas
   del minigráfico se integran con resortes en requestAnimationFrame. Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const quieto = () => mq.matches;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const h = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const anima = (el, kf, op) => (quieto() || !el.animate) ? null : el.animate(kf, op);
  const CURVA = 'cubic-bezier(.22, 1, .36, 1)';
  /* Nada espera al `onfinish` de una animación (no llega si el reloj está controlado, como al grabar, o la pestaña
     está en segundo plano): lo que hay que hacer «al terminar» va en un setTimeout con la duración. */

  /* Un resorte convertido en curva `linear()` de CSS (y de Web Animations): devuelve la curva y lo que dura. */
  const APOYA = !!(window.CSS && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)'));
  function muelle(k, c) {
    const pts = [0];
    let x = 0, v = 0, t = 0;
    while (t < 3) {
      v += (k * (1 - x) - c * v) / 240; x += v / 240; t += 1 / 240;
      pts.push(x);
      if (t > .15 && Math.abs(1 - x) < .001 && Math.abs(v) < .01) break;
    }
    const n = 40, out = [];
    for (let i = 0; i < n + 1; i++) out.push(pts[Math.round(i / n * (pts.length - 1))].toFixed(4));
    out[n] = '1';
    return { curva: 'linear(' + out.join(', ') + ')', ms: Math.round(t * 1000) };
  }
  const R1 = APOYA ? muelle(260, 21) : { curva: 'cubic-bezier(.34, 1.4, .64, 1)', ms: 480 };
  const R2 = APOYA ? muelle(210, 15) : { curva: 'cubic-bezier(.34, 1.56, .64, 1)', ms: 620 };

  /* ── las fechas, a mano ─────────────────────────────────────────────
     Cada día es un entero (días desde el 1-1-1970); el día de la semana, el mes y el año salen con aritmética
     (algoritmos civiles de Howard Hinnant), sin Date. */
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DIA_C = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const dnum = (y, m, d) => {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400), yoe = y - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  };
  const civil = z => {
    z += 719468;
    const era = Math.floor(z / 146097), doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
    return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
  };
  const dsem = z => (((z + 3) % 7) + 7) % 7;                       // 0 = lunes … 6 = domingo
  const ym = z => { const c = civil(z); return c.y * 12 + c.m - 1; };
  const diasDelMes = (y, m) => dnum(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - dnum(y, m, 1);
  const parsea = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? dnum(+m[1], +m[2], +m[3]) : null; };
  const iso = z => { const c = civil(z); return c.y + '-' + String(c.m).padStart(2, '0') + '-' + String(c.d).padStart(2, '0'); };
  const haceUnAnio = z => { const c = civil(z); return dnum(c.y - 1, c.m, c.m === 2 && c.d === 29 ? 28 : c.d); };
  /* «12 – 18 nov 2026», «20 oct – 18 nov 2026», «28 dic 2025 – 3 ene 2026»; sin año si `corto`. */
  function fmtRango(a, b, corto) {
    const A = civil(a), B = civil(b);
    if (a === b) return A.d + ' ' + MES_C[A.m - 1] + (corto ? '' : ' ' + A.y);
    if (A.y === B.y && A.m === B.m) return A.d + ' – ' + B.d + ' ' + MES_C[B.m - 1] + (corto ? '' : ' ' + B.y);
    if (A.y === B.y) return A.d + ' ' + MES_C[A.m - 1] + ' – ' + B.d + ' ' + MES_C[B.m - 1] + (corto ? '' : ' ' + B.y);
    return A.d + ' ' + MES_C[A.m - 1] + ' ' + A.y + ' – ' + B.d + ' ' + MES_C[B.m - 1] + ' ' + B.y;
  }
  const fmtLargo = z => { const c = civil(z); return DIAS[dsem(z)] + ' ' + c.d + ' de ' + MESES[c.m - 1] + ' de ' + c.y; };
  const fmtDia = z => { const c = civil(z); return DIA_C[dsem(z)] + ' ' + c.d + ' ' + MES_C[c.m - 1]; };
  const miles = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const abrev = n => n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + ' k' : String(Math.round(n));
  const hash = i => { const x = Math.sin(i * 12.9898 + 7.3) * 43758.5453; return x - Math.floor(x); };

  /* ── los datos de la demostración ─────────────────────────────────── */
  /* Una serie diaria de visitas: ritmo semanal (los fines de semana bajan), una tendencia suave, una campaña que
     sube las últimas semanas y un temblor que sale del hash. */
  const SEMANAL = [1.06, 1.12, 1.1, 1.04, .94, .7, .64];
  function valorEjemplo(hoy) {
    return d => {
      const t = d - hoy;
      const tendencia = 1 + .0004 * t;
      const campana = .36 / (1 + Math.exp(-(t + 7) / 2));
      const ruido = (hash(d) - .5) * .13;
      return 790 * tendencia * (1 + campana) * SEMANAL[dsem(d)] * (1 + ruido);
    };
  }

  /* ── los números que ruedan: cada cifra es una columna 0–9 que sube o baja con resorte ───────────
     Las cifras de esta tipografía no miden lo mismo (el 1 es más angosto que el 0), así que cada columna toma el
     ancho de la cifra que muestra y lo cambia con el mismo resorte con que rueda: sin huecos raros alrededor del 1. */
  let fuentesListas = false;
  const medidas = {};
  function anchosDigitos(el) {
    const cs = getComputedStyle(el), clave = cs.fontFamily + cs.fontSize + cs.fontWeight + cs.letterSpacing;
    if (medidas[clave]) return medidas[clave];
    const sonda = h('span'); sonda.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0;font:inherit;letter-spacing:inherit';
    el.appendChild(sonda);
    const fs = parseFloat(cs.fontSize) || 16, w = [];
    for (let d = 0; d < 10; d++) { sonda.textContent = d; w.push(+(sonda.getBoundingClientRect().width / fs).toFixed(4)); }
    sonda.remove();
    if (fuentesListas) medidas[clave] = w;
    return w;
  }
  function rueda(el) {
    let actual = '', partes = [];
    function construye(txt) {
      el.textContent = ''; partes = [];
      const w = anchosDigitos(el);
      Array.from(txt).forEach((c, i) => {
        if (/[0-9]/.test(c)) {
          const ch = h('span', 'pg-ch'), col = h('span', 'pg-col');
          for (let k = 0; k < 10; k++) col.appendChild(h('b', '', k));
          ch.style.setProperty('--n', 0); ch.style.setProperty('--w', w[0]); ch.style.setProperty('--dl', (i * 40) + 'ms');
          ch.appendChild(col); el.appendChild(ch); partes.push({ d: true, ch });
        } else { const f = h('span', 'pg-fijo', c); el.appendChild(f); partes.push({ d: false, f }); }
      });
      void el.offsetWidth;
    }
    function pon(txt) {
      if (txt === actual) return;
      const mismoMolde = partes.length === txt.length && Array.from(txt).every((c, i) => partes[i].d === /[0-9]/.test(c));
      if (!mismoMolde) construye(txt);
      const w = anchosDigitos(el);
      Array.from(txt).forEach((c, i) => {
        const p = partes[i];
        if (p.d) { p.ch.style.setProperty('--n', c); p.ch.style.setProperty('--w', w[+c]); p.ch.style.setProperty('--dl', (i * 40) + 'ms'); } else if (p.f.textContent !== c) p.f.textContent = c;
      });
      actual = txt;
    }
    return { pon, remide() { const t = actual; actual = ''; partes = []; if (t) pon(t); } };
  }

  /* =====================================================================
     El componente
     ===================================================================== */
  function Parangon(raiz, opciones) {
    const op = Object.assign({ hoy: raiz.dataset.hoy || '2026-11-18', autoReinicia: false, valor: null, alAplicar: null }, opciones || {});
    const HOY = parsea(op.hoy);
    const valor = op.valor || valorEjemplo(HOY);
    const $ = s => raiz.querySelector(s);
    const campo = $('[data-campo]'), campoA = $('[data-campo-a]'), campoB = $('[data-campo-b]');
    const atajosEl = $('[data-atajos]'), mesesEl = $('[data-meses]'), pistaBtn = $('[data-pista]');
    const comp = $('[data-comp]'), sw = $('[data-sw]'), seg = $('[data-seg]');
    const segA = $('[data-seg-a]'), segB = $('[data-seg-b]');
    const subA = $('[data-sub-a]'), subB = $('[data-sub-b]'), totA = $('[data-tot-a]'), totB = $('[data-tot-b]');
    const graf = $('[data-graf]'), plot = $('[data-plot]'), ejeY = $('[data-ejey]'), ejeX = $('[data-ejex]');
    const leyA = $('[data-ley-a]'), leyB = $('[data-ley-b]'), delta = $('[data-delta]'), deltaN = $('[data-delta-n]');
    const pathPrev = $('[data-prev]'), pathArea = $('[data-area]'), pathLinea = $('[data-linea]');
    const cruz = $('[data-cruz]'), globo = $('[data-globo]');
    const cancelarBtn = $('[data-cancelar]'), aplicarBtn = $('[data-aplicar]'), apTxt = $('[data-ap-txt]');
    const anuncio = $('[data-anuncio]');
    const rTotA = rueda(totA), rTotB = rueda(totB), rDelta = rueda(deltaN);

    raiz.style.setProperty('--pg-r1', R1.curva); raiz.style.setProperty('--pg-t1', R1.ms + 'ms');
    raiz.style.setProperty('--pg-r2', R2.curva); raiz.style.setProperty('--pg-t2', R2.ms + 'ms');
    const decir = t => { anuncio.textContent = ''; setTimeout(() => { anuncio.textContent = t; }, 40); };

    /* ── el estado ─────────────────────────────────────────────────── */
    const cHoy = civil(HOY);
    const ATAJOS = [
      { id: '7d', txt: '7 días', r: () => [HOY - 6, HOY] },
      { id: '30d', txt: '30 días', r: () => [HOY - 29, HOY] },
      { id: 'mes', txt: 'Este mes', r: () => [dnum(cHoy.y, cHoy.m, 1), HOY] },
      { id: 'trim', txt: 'Este trimestre', r: () => [dnum(cHoy.y, Math.floor((cHoy.m - 1) / 3) * 3 + 1, 1), HOY] },
      { id: 'medida', txt: 'A medida', r: () => null },
    ];
    const MES_INICIAL = ym(HOY) - 1;                      // el mes de la izquierda: se ven el anterior y el de hoy
    const inicial = () => ({ tipo: '7d', a: ATAJOS[0].r(), comp: false, modo: 'anterior' });
    const S = Object.assign(inicial(), { mes: MES_INICIAL, ancla: null, antes: null, foco: HOY, arrastre: null, hover: null, aplicado: inicial(), aplicando: false, tReinicia: 0, tAplica: 0, tMes: 0 });
    const largo = () => S.a[1] - S.a[0] + 1;
    const comparado = () => S.modo === 'anio' ? [haceUnAnio(S.a[0]), haceUnAnio(S.a[1])] : [S.a[0] - largo(), S.a[0] - 1];

    /* ── los atajos ─────────────────────────────────────────────────── */
    const marca = h('span', 'pg-marca'); marca.setAttribute('aria-hidden', 'true');
    atajosEl.appendChild(marca);
    const btnAtajo = {};
    ATAJOS.forEach(a => {
      const b = h('button', 'pg-atajo' + (a.id === 'medida' ? ' es-medida' : '')); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.dataset.atajo = a.id;
      b.innerHTML = '<b>' + a.txt + '</b><small></small>';
      b.tabIndex = -1;
      atajosEl.appendChild(b); btnAtajo[a.id] = b;
      b.addEventListener('click', () => { if (a.id !== 'medida') elige(a.id); });
    });
    function pintaAtajos() {
      ATAJOS.forEach(a => {
        const b = btnAtajo[a.id], r = a.id === 'medida' ? (S.tipo === 'medida' ? S.a : null) : a.r();
        b.querySelector('small').textContent = r ? fmtRango(r[0], r[1], true) : '';
        const on = S.tipo === a.id;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on || (S.tipo === 'medida' && a.id === '7d') ? 0 : -1;
        if (a.id === 'medida') b.classList.toggle('is-visible', S.tipo === 'medida');
      });
      colocaMarca();
    }
    function colocaMarca() {
      const b = btnAtajo[S.tipo]; if (!b) return;
      requestAnimationFrame(() => {
        // la pestaña «A medida» se despliega: espera a que tenga su ancho
        marca.style.left = b.offsetLeft + 'px'; marca.style.width = b.offsetWidth + 'px'; marca.classList.add('is-puesta');
      });
      clearTimeout(S.tMarca); S.tMarca = setTimeout(() => { const bb = btnAtajo[S.tipo]; if (bb) { marca.style.left = bb.offsetLeft + 'px'; marca.style.width = bb.offsetWidth + 'px'; } }, 560);
    }
    atajosEl.addEventListener('keydown', e => {
      const lista = ATAJOS.filter(a => a.id !== 'medida' || S.tipo === 'medida');
      const i = lista.findIndex(a => a.id === document.activeElement.dataset.atajo);
      const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (paso && i > -1) { e.preventDefault(); const n = lista[(i + paso + lista.length) % lista.length]; btnAtajo[n.id].focus(); if (n.id !== 'medida') elige(n.id); }
    });

    /* ── el calendario: dos meses ───────────────────────────────────── */
    const celdas = new Map();
    function pintaMeses(dir) {
      const hacer = () => {
        mesesEl.textContent = ''; celdas.clear();
        for (let k = 0; k < 2; k++) {
          const idx = S.mes + k, y = Math.floor(idx / 12), m = idx % 12 + 1, primero = dnum(y, m, 1), n = diasDelMes(y, m);
          const mes = h('div', 'pg-mes'), tit = h('p', 'pg-mes-t', MESES[m - 1] + ' ' + y), sem = h('div', 'pg-sem'), dias = h('div', 'pg-dias');
          dias.setAttribute('role', 'group'); dias.setAttribute('aria-label', MESES[m - 1] + ' ' + y);
          SEMANA.forEach(s => sem.appendChild(h('span', '', s))); sem.setAttribute('aria-hidden', 'true');
          for (let i = 0; i < dsem(primero); i++) dias.appendChild(h('span', 'pg-hueco'));
          for (let d = 1; d <= n; d++) {
            const z = primero + d - 1, b = h('button', 'pg-dia'); b.type = 'button'; b.dataset.d = z; b.tabIndex = -1;
            b.innerHTML = '<i class="pg-fan"></i><i class="pg-banda"></i><i class="pg-disco"></i><span class="pg-n">' + d + '</span>';
            b.setAttribute('aria-label', fmtLargo(z));
            if (z > HOY) b.disabled = true;
            if (z === HOY) { b.dataset.hoy = '1'; b.setAttribute('aria-current', 'date'); }
            if (d === 1) b.dataset.p = '1'; if (d === n) b.dataset.u = '1';
            dias.appendChild(b); celdas.set(z, b);
          }
          mes.appendChild(tit); mes.appendChild(sem); mes.appendChild(dias); mesesEl.appendChild(mes);
        }
        pintaBandas(null); ponFoco(false);
      };
      if (dir && !quieto()) {
        mesesEl.classList.add('es-cambia');
        const salida = anima(mesesEl, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-dir * 22) + 'px)' }], { duration: 130, easing: 'ease-in', fill: 'forwards' });
        clearTimeout(S.tMes);
        S.tMes = setTimeout(() => {
          if (salida) salida.cancel();
          hacer();
          anima(mesesEl, [{ opacity: 0, transform: 'translateX(' + (dir * 22) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: CURVA });
          mesesEl.classList.remove('es-cambia');
        }, 140);
      } else hacer();
    }
    /* En el teléfono se ve un solo mes (el de la derecha); el resto de la lógica cuenta con lo que de verdad se ve. */
    const movil = () => matchMedia('(max-width: 860px)').matches;
    const extremosMes = () => {
      const i0 = S.mes + (movil() ? 1 : 0), i1 = S.mes + 1;
      return [dnum(Math.floor(i0 / 12), i0 % 12 + 1, 1), dnum(Math.floor(i1 / 12), i1 % 12 + 1, diasDelMes(Math.floor(i1 / 12), i1 % 12 + 1))];
    };
    function mueveMeses(dlt) {
      const nuevo = lim(S.mes + dlt, ym(HOY) - 36, ym(HOY) - 1);
      if (nuevo === S.mes) return;
      const dir = nuevo > S.mes ? 1 : -1; S.mes = nuevo; pintaMeses(dir); pintaPista();
    }
    $('[data-mover="-1"]').addEventListener('click', () => mueveMeses(-1));
    $('[data-mover="1"]').addEventListener('click', () => mueveMeses(1));

    /* Las bandas: cada día sabe si está en la banda actual (y si es un extremo o un borde de fila) y si está en la fantasma. */
    function pintaBandas(ola) {
      const [a0, a1] = S.a, g = S.comp ? comparado() : null;
      celdas.forEach((el, z) => {
        const inA = z >= a0 && z <= a1, inG = g && z >= g[0] && z <= g[1] && !inA;
        const borde = dsem(z) === 0 || el.dataset.p, bordeD = dsem(z) === 6 || el.dataset.u;
        const dl = ola ? (inA ? Math.min(420, (z - a0) * 9) : Math.min(260, Math.max(0, (ola.a1 - z) * 5))) : 0;
        el.style.setProperty('--dl', dl + 'ms');
        const set = (k, v) => { if (v) { if (el.dataset[k] == null) el.dataset[k] = '1'; } else if (el.dataset[k] != null) delete el.dataset[k]; };
        set('a', inA); set('e', inA && (z === a0 || z === a1));
        set('bi', inA && (z === a0 || borde)); set('bd', inA && (z === a1 || bordeD));
        set('g', inG); set('gi', inG && (z === g[0] || borde)); set('gd', inG && (z === g[1] || bordeD));
        if (inA) el.setAttribute('aria-pressed', 'true'); else el.removeAttribute('aria-pressed');
      });
    }

    /* ── el foco del teclado ─────────────────────────────────────────── */
    function ponFoco(enfoca) {
      let el = celdas.get(S.foco);
      if (!el || el.disabled) el = celdas.get(lim(S.a[1], extremosMes()[0], Math.min(HOY, extremosMes()[1]))) || celdas.get(HOY);
      celdas.forEach(c => { c.tabIndex = -1; });
      if (el) { el.tabIndex = 0; if (enfoca) el.focus({ preventScroll: true }); }
    }
    function enfocaDia(z, extiende) {
      z = lim(z, HOY - 36 * 31, HOY);
      const [v0, v1] = extremosMes(), cambia = z < v0 || z > v1;
      if (z < v0) mueveMeses(ym(z) - (S.mes + (movil() ? 1 : 0))); else if (z > v1) mueveMeses(ym(z) - (S.mes + 1));
      S.foco = z;
      if (extiende) {
        if (S.ancla == null) { S.antes = { a: S.a.slice(), tipo: S.tipo }; S.ancla = S.foco0 != null ? S.foco0 : z; }
        fijaRango(S.ancla, z, true);
      } else if (S.ancla != null) fijaRango(S.ancla, z, true);
      // el foco se mueve al instante; si hubo cambio de meses, cuando ya se pintaron los nuevos
      if (!cambia) ponFoco(true); else setTimeout(() => ponFoco(true), quieto() ? 0 : 170);
    }
    mesesEl.addEventListener('keydown', e => {
      const b = e.target.closest('.pg-dia'); if (!b) return;
      const z = +b.dataset.d;
      const paso = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (paso) { e.preventDefault(); S.foco0 = z; enfocaDia(z + paso, e.shiftKey); S.foco0 = null; }
      else if (e.key === 'Home') { e.preventDefault(); enfocaDia(z - dsem(z), e.shiftKey); }
      else if (e.key === 'End') { e.preventDefault(); enfocaDia(z + (6 - dsem(z)), e.shiftKey); }
      else if (e.key === 'PageUp') { e.preventDefault(); mueveMeses(-1); }
      else if (e.key === 'PageDown') { e.preventDefault(); mueveMeses(1); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (b.disabled) return;
        if (S.ancla == null) { S.antes = { a: S.a.slice(), tipo: S.tipo }; S.ancla = z; fijaRango(z, z, true); decir('Inicio: ' + fmtLargo(z) + '. Elige el último día.'); }
        else { const a = S.ancla; S.ancla = null; fijaRango(a, z, false); decir('Periodo elegido: ' + fmtRango(S.a[0], S.a[1]) + '.'); }
      } else if (e.key === 'Escape' && S.ancla != null) {
        e.preventDefault(); S.ancla = null;
        if (S.antes) { S.a = S.antes.a; S.tipo = S.antes.tipo; actualiza(null); }
      }
    });

    /* ── elegir: atajos y rango a medida (arrastrar o dos clics) ─────── */
    function elige(id) {
      const at = ATAJOS.find(a => a.id === id); if (!at || !at.r()) return;
      const viejo = S.a.slice();
      S.tipo = id; S.a = at.r(); S.ancla = null; S.antes = null;
      if (S.mes !== MES_INICIAL) { S.mes = MES_INICIAL; pintaMeses(0); }
      actualiza({ a1: viejo[1] });
    }
    function fijaRango(x, y) {
      const a = Math.min(x, y), b = Math.max(x, y);
      if (S.tipo === 'medida' && S.a[0] === a && S.a[1] === b) return;
      S.a = [a, b]; S.tipo = 'medida';
      actualiza(null);
    }
    const diaBajo = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const b = el && el.closest && el.closest('.pg-dia'); return b && !b.disabled ? +b.dataset.d : null; };
    mesesEl.addEventListener('pointerdown', e => {
      if (e.button) return;
      const b = e.target.closest('.pg-dia'); if (!b || b.disabled) return;
      const z = +b.dataset.d;
      if (S.ancla == null) { S.antes = { a: S.a.slice(), tipo: S.tipo }; S.arrastre = { z0: z, movido: false, nuevo: true }; fijaRango(z, z, true); }
      else S.arrastre = { z0: S.ancla, movido: true, nuevo: false };
      S.foco = z; ponFoco(false);
    });
    document.addEventListener('pointermove', e => {
      if (!S.arrastre && S.ancla == null) return;
      const z = diaBajo(e); if (z == null) return;
      if (S.arrastre) { if (z !== S.arrastre.z0) S.arrastre.movido = true; fijaRango(S.arrastre.z0, z, true); }
      else if (S.ancla != null && z !== S.hover) { S.hover = z; fijaRango(S.ancla, z, true); }
    });
    document.addEventListener('pointerup', e => {
      if (!S.arrastre) return;
      const ar = S.arrastre; S.arrastre = null;
      const z = diaBajo(e); const fin = z == null ? S.a[1] : z;
      if (ar.nuevo && !ar.movido && fin === ar.z0) { S.ancla = ar.z0; S.hover = null; decir('Inicio: ' + fmtLargo(ar.z0) + '. Elige el último día.'); }   // un clic: espera el segundo
      else { S.ancla = null; fijaRango(ar.z0, fin, false); decir('Periodo elegido: ' + fmtRango(S.a[0], S.a[1]) + '.'); }
    });
    document.addEventListener('pointercancel', () => { S.arrastre = null; });

    /* ── comparar ───────────────────────────────────────────────────── */
    function comparar(on, modo) {
      S.comp = on !== undefined ? !!on : !S.comp;
      if (modo) S.modo = modo;
      actualiza(null);
    }
    sw.addEventListener('click', () => comparar());
    seg.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => { if (S.comp) comparar(true, b.dataset.modo); }));
    seg.addEventListener('keydown', e => {
      const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!paso || !S.comp) return;
      e.preventDefault(); const nuevo = S.modo === 'anterior' ? 'anio' : 'anterior'; comparar(true, nuevo); seg.querySelector('[data-modo="' + nuevo + '"]').focus();
    });
    /* El periodo comparado puede quedar fuera de los dos meses a la vista: un enlace lleva hasta allá y de vuelta. */
    function pintaPista() {
      if (!S.comp) { pistaBtn.hidden = true; return; }
      const g = comparado(), [v0, v1] = extremosMes();
      const visibleG = g[0] >= v0 && g[1] <= v1, visibleA = S.a[1] >= v0 && S.a[0] <= v1;
      let txt = '', dest = null;
      if (!visibleA) { txt = 'Volver al periodo actual ›'; dest = S.a[1]; }
      else if (!visibleG) {
        const izq = g[1] < v0 || (g[0] < v0 && g[1] < S.a[0]);
        txt = g[1] < v0 || g[0] > v1 ? (izq ? '‹ Ver ' : 'Ver ') + fmtRango(g[0], g[1], civil(g[0]).y === civil(HOY).y) + (izq ? '' : ' ›') : '‹ Empieza el ' + civil(g[0]).d + ' ' + MES_C[civil(g[0]).m - 1];
        dest = g[1] < v0 ? g[1] : g[0] > v1 ? g[0] : g[0];
      }
      pistaBtn.hidden = !txt; pistaBtn.textContent = txt; pistaBtn._dest = dest;
    }
    pistaBtn.addEventListener('click', () => {
      if (pistaBtn._dest == null) return;
      const d = pistaBtn._dest, destMes = lim(ym(d) - 1, ym(HOY) - 36, ym(HOY) - 1);
      if (destMes !== S.mes) { const dir = destMes > S.mes ? 1 : -1; S.mes = destMes; pintaMeses(dir); pintaPista(); }
    });

    /* ── el minigráfico: dos curvas con resorte, la anterior detrás y punteada ─ */
    const NP = 72;
    const G = { cur: new Float32Array(NP).fill(.5), prev: new Float32Array(NP).fill(.5), tc: new Float32Array(NP).fill(.5), tp: new Float32Array(NP).fill(.5), vc: new Float32Array(NP), vp: new Float32Array(NP),
      dc: [], dp: [], max: 1000, raf: 0, ant: 0 };
    /* Catmull-Rom entre los puntos diarios, para que la curva salga suave al remuestrearla en NP puntos. */
    function remuestrea(v, max) {
      const L = v.length, out = new Float32Array(NP);
      const p = i => v[lim(i, 0, L - 1)];
      for (let j = 0; j < NP; j++) {
        const x = L === 1 ? 0 : j / (NP - 1) * (L - 1), i = Math.floor(x), f = x - i;
        const a = p(i - 1), b = p(i), c = p(i + 1), d = p(i + 2);
        const y = .5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
        out[j] = lim(y / max, 0, 1.05);
      }
      return out;
    }
    const bonito = v => { const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(x => f <= x + 1e-9) || 10) * e; };
    function objetivoGrafico() {
      const L = largo(), g = comparado();
      G.dc = Array.from({ length: L }, (_, i) => valor(S.a[0] + i));
      G.dp = Array.from({ length: L }, (_, i) => valor(g[0] + i));
      const mx = bonito(Math.max(...G.dc, ...(S.comp ? G.dp : [0])) * 1.1);
      G.max = mx;
      G.tc = remuestrea(G.dc.length === 1 ? [G.dc[0], G.dc[0]] : G.dc, mx);
      G.tp = remuestrea(G.dp.length === 1 ? [G.dp[0], G.dp[0]] : G.dp, mx);
      // ejes
      ejeY.textContent = '';
      [0, .5, 1].forEach(f => {
        const top = (94 - f * 86) / 100 * plot.clientHeight;
        const l = h('span', '', f === 0 ? '0' : abrev(mx * f)); l.style.top = top + 'px'; ejeY.appendChild(l);
        const r = h('i'); r.style.top = top + 'px'; ejeY.appendChild(r);
      });
      ejeX.textContent = '';
      // cada fecha va justo bajo su día: en el porcentaje del largo, y las de las puntas pegadas al borde
      const marcas = L < 5 ? Array.from({ length: L }, (_, i) => i) : [0, 1, 2, 3, 4].map(k => Math.round(k / 4 * (L - 1)));
      marcas.forEach((i, k) => {
        const sp = h('span', k === 0 ? 'es-ini' : k === marcas.length - 1 ? 'es-fin' : '', fmtDia(S.a[0] + i));
        sp.style.left = (L === 1 ? 50 : i / (L - 1) * 100) + '%'; ejeX.appendChild(sp);
      });
      if (quieto()) { G.cur.set(G.tc); G.prev.set(G.tp); dibuja(); } else arrancaG();
    }
    function dibuja() {
      const y = v => (94 - Math.min(1.05, v) * 86).toFixed(2);
      let l = '', p = '';
      for (let j = 0; j < NP; j++) { const x = (j / (NP - 1) * 1000).toFixed(1); l += (j ? 'L' : 'M') + x + ' ' + y(G.cur[j]); p += (j ? 'L' : 'M') + x + ' ' + y(G.prev[j]); }
      pathLinea.setAttribute('d', l); pathPrev.setAttribute('d', p);
      pathArea.setAttribute('d', l + 'L1000 100L0 100Z');
    }
    function arrancaG() { if (!G.raf) { G.ant = 0; G.raf = requestAnimationFrame(pasoG); } }
    function pasoG(ms) {
      const dt = G.ant ? Math.min(.05, (ms - G.ant) / 1000) : 0; G.ant = ms;
      let activo = false;
      const n = Math.max(1, Math.ceil(dt * 120)), hh = dt / n;
      for (let j = 0; j < NP; j++) {
        // una ola de izquierda a derecha: cada punto es un poco más lento que el anterior
        const K = 230 - 120 * (j / (NP - 1)), C = 2 * Math.sqrt(K) * .78;
        for (let i = 0; i < n; i++) {
          G.vc[j] += (K * (G.tc[j] - G.cur[j]) - C * G.vc[j]) * hh; G.cur[j] += G.vc[j] * hh;
          G.vp[j] += (K * (G.tp[j] - G.prev[j]) - C * G.vp[j]) * hh; G.prev[j] += G.vp[j] * hh;
        }
        if (Math.abs(G.tc[j] - G.cur[j]) > .0015 || Math.abs(G.vc[j]) > .01 || Math.abs(G.tp[j] - G.prev[j]) > .0015 || Math.abs(G.vp[j]) > .01) activo = true;
        else { G.cur[j] = G.tc[j]; G.prev[j] = G.tp[j]; G.vc[j] = G.vp[j] = 0; }
      }
      dibuja();
      G.raf = activo ? requestAnimationFrame(pasoG) : 0;
    }
    /* la cruz del minigráfico */
    plot.addEventListener('pointermove', e => {
      const r = plot.getBoundingClientRect(), L = G.dc.length; if (!L) return;
      const f = lim((e.clientX - r.left) / r.width, 0, 1), i = L === 1 ? 0 : Math.round(f * (L - 1)), fx = L === 1 ? .5 : i / (L - 1), x = fx * r.width;
      const j = fx * (NP - 1), j0 = Math.floor(j), jf = j - j0, j1 = Math.min(NP - 1, j0 + 1);
      const yc = (94 - (G.cur[j0] * (1 - jf) + G.cur[j1] * jf) * 86) / 100 * r.height, yp = (94 - (G.prev[j0] * (1 - jf) + G.prev[j1] * jf) * 86) / 100 * r.height;
      cruz.hidden = false; cruz.style.setProperty('--cx', x.toFixed(1) + 'px'); cruz.style.setProperty('--ya', yc.toFixed(1) + 'px'); cruz.style.setProperty('--yb', yp.toFixed(1) + 'px');
      const g = comparado();
      globo.innerHTML = '<b>' + fmtDia(S.a[0] + i) + '</b><span>' + miles(G.dc[i]) + ' visitas</span>' + (S.comp ? '<span><em>vs</em> ' + miles(G.dp[i]) + ' · ' + fmtDia(g[0] + i) + '</span>' : '');
      globo.hidden = false;
      globo.style.setProperty('--gx', lim(x - globo.offsetWidth / 2, -30, r.width - globo.offsetWidth + 20).toFixed(1) + 'px');
    });
    plot.addEventListener('pointerleave', () => { cruz.hidden = true; globo.hidden = true; });

    /* ── todo junto: lo que cambia cuando cambia el periodo ───────────── */
    let tAnuncio = 0;
    function actualiza(ola) {
      const g = comparado(), L = largo();
      if (ola === undefined) ola = null;
      pintaBandas(ola);
      pintaAtajos();
      // resumen
      const sumC = Math.round(Array.from({ length: L }, (_, i) => valor(S.a[0] + i)).reduce((x, y) => x + y, 0));
      const sumP = Math.round(Array.from({ length: L }, (_, i) => valor(g[0] + i)).reduce((x, y) => x + y, 0));
      comp.classList.toggle('is-on', S.comp); graf.classList.toggle('is-comp', S.comp);
      sw.setAttribute('aria-checked', S.comp ? 'true' : 'false');
      seg.dataset.modo = S.modo;
      seg.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-checked', b.dataset.modo === S.modo ? 'true' : 'false'));
      const gAnt = [S.a[0] - L, S.a[0] - 1], gAnio = [haceUnAnio(S.a[0]), haceUnAnio(S.a[1])];
      segA.textContent = fmtRango(gAnt[0], gAnt[1], civil(gAnt[0]).y === civil(HOY).y && civil(gAnt[1]).y === civil(HOY).y);
      segB.textContent = fmtRango(gAnio[0], gAnio[1]);
      const sufijo = L + (L === 1 ? ' día' : ' días');
      subA.textContent = fmtRango(S.a[0], S.a[1], true) + ' · ' + sufijo;
      subB.textContent = S.comp ? fmtRango(g[0], g[1], civil(g[0]).y === civil(HOY).y && civil(g[1]).y === civil(HOY).y) + ' · ' + sufijo : 'Sin comparar';
      rTotA.pon(abrev(sumC)); rTotB.pon(S.comp ? abrev(sumP) : '—');
      leyA.textContent = fmtRango(S.a[0], S.a[1], true); leyB.textContent = fmtRango(g[0], g[1], civil(g[0]).y === civil(HOY).y && civil(g[1]).y === civil(HOY).y);
      const dif = sumP > 0 ? sumC / sumP - 1 : 0, pc = Math.round(Math.abs(dif) * 100);
      rDelta.pon((dif < -0.004 ? '−' : '+') + pc + ' %');
      delta.classList.toggle('es-baja', dif < -0.004);
      objetivoGrafico();
      pintaPista();
      // cualquier cambio deshace el ✓ del botón
      if (!S.aplicando && aplicarBtn.classList.contains('is-ok')) { aplicarBtn.classList.remove('is-ok'); apTxt.textContent = 'Aplicar'; }
      clearTimeout(tAnuncio);
      tAnuncio = setTimeout(() => {
        if (S.arrastre) return;
        decir('Periodo: ' + fmtRango(S.a[0], S.a[1]) + ', ' + sufijo + '. ' + (S.comp ? 'Comparado con ' + fmtRango(g[0], g[1]) + ': ' + (dif < 0 ? 'baja ' : 'sube ') + pc + ' %.' : 'Sin comparar.'));
      }, 500);
    }

    /* ── el campo de arriba y «Aplicar» ──────────────────────────────── */
    function pintaCampo(anim) {
      const ap = S.aplicado, g = ap.modo === 'anio' ? [haceUnAnio(ap.a[0]), haceUnAnio(ap.a[1])] : [ap.a[0] - (ap.a[1] - ap.a[0] + 1), ap.a[0] - 1];
      const ta = fmtRango(ap.a[0], ap.a[1]), tb = fmtRango(g[0], g[1]);
      const cambioA = campoA.textContent !== ta, cambioB = campoB.textContent !== tb;
      campoA.textContent = ta; campoB.textContent = tb;
      campo.classList.toggle('is-comp', ap.comp);
      if (anim && cambioA) anima(campoA, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: R2.curva });
      if (anim && cambioB && ap.comp) anima(campoB, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 90, easing: R2.curva, fill: 'backwards' });
    }
    const instantanea = () => ({ tipo: S.tipo, a: S.a.slice(), comp: S.comp, modo: S.modo });
    function aplica() {
      if (S.aplicando) return;
      S.aplicando = true; clearTimeout(S.tReinicia);
      aplicarBtn.classList.remove('is-ok'); aplicarBtn.classList.add('is-cargando');
      clearTimeout(S.tAplica);
      S.tAplica = setTimeout(() => {
        aplicarBtn.classList.remove('is-cargando'); aplicarBtn.classList.add('is-ok'); apTxt.textContent = 'Aplicado';
        S.aplicado = instantanea(); pintaCampo(true);
        campo.classList.remove('is-ok'); void campo.offsetWidth; campo.classList.add('is-ok');
        setTimeout(() => campo.classList.remove('is-ok'), 1700);
        S.aplicando = false;
        const g = comparado();
        op.alAplicar && op.alAplicar({ desde: iso(S.a[0]), hasta: iso(S.a[1]), comparar: S.comp, desdeComparado: S.comp ? iso(g[0]) : null, hastaComparado: S.comp ? iso(g[1]) : null });
        decir('Aplicado: ' + fmtRango(S.a[0], S.a[1]) + (S.comp ? ', comparado con ' + fmtRango(g[0], g[1]) : '') + '.');
        if (op.autoReinicia) S.tReinicia = setTimeout(reinicia, 1250);
      }, quieto() ? 0 : 560);
    }
    aplicarBtn.addEventListener('click', aplica);
    cancelarBtn.addEventListener('click', () => {
      const ap = S.aplicado; S.ancla = null; S.arrastre = null;
      const viejo = S.a.slice();
      S.tipo = ap.tipo; S.a = ap.a.slice(); S.comp = ap.comp; S.modo = ap.modo;
      if (S.mes !== MES_INICIAL) { S.mes = MES_INICIAL; pintaMeses(0); }
      actualiza({ a1: viejo[1] });
    });
    function reinicia() {
      clearTimeout(S.tReinicia); clearTimeout(S.tAplica); S.aplicando = false;
      const ini = inicial(), viejo = S.a.slice();
      Object.assign(S, ini, { aplicado: inicial(), ancla: null, arrastre: null, antes: null, foco: HOY });
      aplicarBtn.classList.remove('is-ok', 'is-cargando'); apTxt.textContent = 'Aplicar';
      if (S.mes !== MES_INICIAL) { S.mes = MES_INICIAL; pintaMeses(0); }
      actualiza({ a1: viejo[1] });
      pintaCampo(true);
    }

    /* el teclado, a nivel de documento: Esc suelta un rango a medias aunque el foco esté en otro lado */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.ancla != null) { S.ancla = null; if (S.antes) { S.a = S.antes.a; S.tipo = S.antes.tipo; actualiza(null); } }
    });
    addEventListener('resize', () => { colocaMarca(); objetivoGrafico(); pintaPista(); });

    /* ── arranque ───────────────────────────────────────────────────── */
    pintaMeses(0);
    pintaCampo(false);
    actualiza(null);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fuentesListas = true; rTotA.remide(); rTotB.remide(); rDelta.remide(); colocaMarca(); });
    const api = {
      elige, comparar: (on, modo) => comparar(on, modo), aplica, reinicia,
      rango: (d, h2) => { const a = parsea(d), b = parsea(h2); if (a != null && b != null) { fijaRango(a, b, false); } },
      estado: () => ({ desde: iso(S.a[0]), hasta: iso(S.a[1]), tipo: S.tipo, comparar: S.comp, modo: S.modo }),
    };
    raiz.__parangon = api;
    return api;
  }

  window.Parangon = Parangon;
  document.querySelectorAll('[data-parangon]').forEach(el => Parangon(el, { autoReinicia: el.hasAttribute('data-auto-reinicia') }));
})();
