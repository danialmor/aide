/* =====================================================================
   Estadía · Moxen
   Un selector de rango de fechas para reservas, hoteles o informes por
   período. Eliges la llegada y, al mover el cursor (o las flechas), una
   banda se estira desde ese día hasta el que señalas: el extremo que
   viaja lo sigue con un resorte que se pasa un poco y vuelve. La banda
   se parte en un tramo por semana (redonda solo en sus extremos, con
   cortes rectos en los cambios de fila) y cruza de un mes al otro. Al
   elegir la salida se asienta con un rebote, las noches ruedan y las
   fechas del campo giran; los atajos llevan la banda entera con resorte
   y las flechas deslizan los meses con el rango encima.

     const e = Estadia(document.querySelector('[data-estadia]'), {
       hoy: '2026-11-09',      // la fecha de hoy, AAAA-MM-DD (la pones tú)
       meses: 2,               // meses a la vista (en el teléfono, uno)
       minNoches: 1,
       abierto: true,
       alAplicar: ({ desde, hasta, noches }) => { … },
     });
     e.elige('2026-11-12', '2026-11-19');   e.aplica();   e.borra();

   Teclado: flechas por los días, Intro elige, Re Pág / Av Pág cambian de
   mes, Inicio / Fin van al lunes o al domingo y Esc cierra.
   Todo lo que se mueve es transform u opacity. Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  /* ── las fechas, a mano ───────────────────────────────────────────
     Cada día es un número entero (días desde el 1-1-1970) y todo se
     cuenta con aritmética: sin husos horarios ni cambios de hora que
     corran un día, y el «hoy» lo decides tú (del servidor, por ejemplo). */
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DIA_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const SEMANA = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

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
  const corta = n => { const f = aFecha(n); return DIA_CORTO[semanaDe(n)] + ' ' + f.d + ' ' + MES_CORTO[f.m - 1]; };
  const larga = n => { const f = aFecha(n); return DIAS[semanaDe(n)] + ' ' + f.d + ' de ' + MESES[f.m - 1] + ' de ' + f.a; };
  const sumaMes = (v, k) => { const t = v.a * 12 + (v.m - 1) + k; return { a: Math.floor(t / 12), m: t % 12 + 1 }; };
  // el mismo día en otro mes (el 31 pasa a ser el último del mes más corto)
  function otroMes(n, k) { const f = aFecha(n), v = sumaMes(f, k); return aNumero(v.a, v.m, Math.min(f.d, diasDelMes(v.a, v.m))); }
  function rotulo(a, b) {
    const fa = aFecha(a), fb = aFecha(b);
    return fa.m === fb.m ? fa.d + ' – ' + fb.d + ' ' + MES_CORTO[fb.m - 1] : fa.d + ' ' + MES_CORTO[fa.m - 1] + ' – ' + fb.d + ' ' + MES_CORTO[fb.m - 1];
  }

  /* ── resortes ─────────────────────────────────────────────────────
     Uno por cada cosa que se mueve, con el paso real del cuadro (dt):
     así va igual a 60 que a 120 Hz. */
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, dt) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * dt; r.x += r.v * dt; }
  const parado = r => Math.abs(r.meta - r.x) < .002 && Math.abs(r.v) < .01;
  const sujeta = (v, a, b) => Math.max(a, Math.min(b, v));

  // un resorte convertido en curva CSS linear(), para lo que se mueve con CSS (la cifra, las placas)
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

  let cuenta = 0;
  function Estadia(raiz, opciones) {
    const o = Object.assign({ hoy: '2026-01-01', meses: 2, minNoches: 1, desde: null, hasta: null, abierto: false, cierraAlAplicar: true, alAplicar: null, alCambiar: null }, opciones);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const uid = 'ea' + (++cuenta);
    const HOY = leeISO(o.hoy);
    const $ = s => raiz.querySelector(s);
    const campo = $('.ea-campo'), selector = $('.ea-selector'), caja = $('.ea-meses');
    const valDesde = $('[data-valor="desde"]'), valHasta = $('[data-valor="hasta"]');
    const atajos = Array.from(raiz.querySelectorAll('[data-atajo]')), marcaAtajo = $('.ea-atajo-marca');
    const flechas = Array.from(raiz.querySelectorAll('[data-mover]'));
    const total = $('.ea-total'), palabra = $('.ea-palabra'), detalle = $('.ea-detalle'), oculto = $('.ea-oculto');
    const borrar = $('.ea-borrar'), aplicar = $('.ea-aplicar');
    raiz.style.setProperty('--ea-muelle', muelle(260, 20));

    // la cifra de las noches: tres columnas, cada una una tira de 0 a 9
    const cifra = $('.ea-cifra');
    cifra.innerHTML = ('<span class="ea-rueda"><span>' + '0123456789'.split('').map(d => '<span>' + d + '</span>').join('') + '</span></span>').repeat(3);
    const ruedas = Array.from(cifra.children);

    let fase = 'inicio', ini = null, fin = null, foco = HOY, abierto = false;
    let vista = { a: aFecha(HOY).a, m: aFecha(HOY).m }, cuantos = 2, pista = null, meses = [], botones = new Map();
    // los extremos (en días, con decimales mientras viajan), su escala, la banda y el rebote
    const S = resorte(HOY, 240, 23), E = resorte(HOY, 240, 23);
    const escI = resorte(0, 380, 20), escF = resorte(0, 380, 20), vivo = resorte(0, 260, 28), golpe = resorte(0, 520, 12);
    const todos = [S, E, escI, escF, vivo, golpe];

    /* ── los meses ─────────────────────────────────────────────────── */
    /* Cada mes: su título, la fila de la semana y la rejilla (role=grid),
       con una tira de banda por cada semana que tenga días del mes. */
    function construyeMes(a, m) {
      const el = document.createElement('section');
      el.className = 'ea-mes';
      const id = uid + '-' + a + '-' + m;
      el.innerHTML = '<h3 class="ea-titulo" id="' + id + '">' + MESES[m - 1] + ' <span>' + a + '</span></h3>' +
        '<div class="ea-semana" aria-hidden="true">' + SEMANA.map(s => '<span>' + s + '</span>').join('') + '</div>';
      const rejilla = document.createElement('div');
      rejilla.className = 'ea-rejilla';
      rejilla.setAttribute('role', 'grid');
      rejilla.setAttribute('aria-labelledby', id);
      const banda = document.createElement('div');
      banda.className = 'ea-banda';
      banda.setAttribute('aria-hidden', 'true');
      rejilla.appendChild(banda);
      const primero = aNumero(a, m, 1), dias = diasDelMes(a, m), col0 = diaSemana(a, m, 1);
      const filas = [], celdas = new Map(), propios = new Map();
      for (let f = 0; f < 6; f++) {
        const fila = document.createElement('div');
        fila.className = 'ea-fila';
        fila.setAttribute('role', 'row');
        let nA = null, nB = null, cA = 0;
        for (let c = 0; c < 7; c++) {
          const d = f * 7 + c - col0 + 1;
          const celda = document.createElement('div');
          celda.setAttribute('role', 'gridcell');
          if (d >= 1 && d <= dias) {
            const n = primero + d - 1;
            if (nA === null) { nA = n; cA = c; }
            nB = n;
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'ea-dia'; b.tabIndex = -1; b.textContent = d;
            b.dataset.n = n; b.dataset.dia = aISO(n);
            b.setAttribute('aria-label', larga(n) + (n === HOY ? ', hoy' : ''));
            if (n < HOY) b.setAttribute('aria-disabled', 'true');
            if (n === HOY) { b.classList.add('is-hoy'); b.setAttribute('aria-current', 'date'); }
            celda.setAttribute('aria-selected', 'false');
            celda.appendChild(b);
            celdas.set(n, celda); propios.set(n, b);
          }
          fila.appendChild(celda);
        }
        rejilla.appendChild(fila);
        if (nA === null) continue;
        const tira = document.createElement('div');
        tira.className = 'ea-tira';
        tira.style.setProperty('--c', cA); tira.style.setProperty('--f', f); tira.style.setProperty('--k', nB - nA + 1);
        tira.innerHTML = '<i class="ea-tramo"></i><span class="ea-pos ea-fin"><i></i></span><span class="ea-pos ea-ini"><i></i></span>';
        banda.appendChild(tira);
        filas.push({ nA, k: nB - nA + 1, tramo: tira.children[0], pF: tira.children[1], dF: tira.children[1].firstChild, pI: tira.children[2], dI: tira.children[2].firstChild });
      }
      el.appendChild(rejilla);
      return { el, filas, celdas, botones: propios };
    }

    const primeroVisible = () => aNumero(vista.a, vista.m, 1);
    function ultimoVisible() { const v = sumaMes(vista, cuantos - 1); return aNumero(v.a, v.m, diasDelMes(v.a, v.m)); }

    /* Una pista por vista. Al cambiar de mes, la vieja sale y la nueva
       entra desde el otro lado: los meses que comparten (diciembre, al
       pasar de nov–dic a dic–ene) quedan uno encima del otro todo el
       viaje, así que parece una sola tira que se desliza. */
    function monta(dir) {
      const el = document.createElement('div');
      el.className = 'ea-pista';
      el.style.setProperty('--ea-n', cuantos);
      const nueva = { el, meses: [] };
      for (let i = 0; i < cuantos; i++) {
        const v = sumaMes(vista, i), mes = construyeMes(v.a, v.m);
        el.appendChild(mes.el); nueva.meses.push(mes);
      }
      caja.appendChild(el);
      const vieja = pista;
      pista = nueva;
      meses = meses.concat(nueva.meses);
      botones = new Map();
      nueva.meses.forEach(m => m.botones.forEach((b, n) => botones.set(n, b)));
      if (vieja) {
        vieja.el.inert = true;
        if (dir && !reduce) {
          const paso = cuantos > 1 ? nueva.meses[1].el.offsetLeft - nueva.meses[0].el.offsetLeft : caja.clientWidth + 32;
          const como = { duration: 640, easing: 'cubic-bezier(.22, 1, .36, 1)' };
          vieja.el.animate([{ transform: 'none' }, { transform: 'translateX(' + (-Math.sign(dir) * paso) + 'px)' }], Object.assign({ fill: 'forwards' }, como));
          el.animate([{ transform: 'translateX(' + (Math.sign(dir) * paso) + 'px)' }, { transform: 'none' }], como);
          setTimeout(() => quita(vieja), como.duration + 40);
        } else quita(vieja);
      }
      flechas[0].disabled = primeroVisible() <= HOY;
      marcaDias();
      pinta();
    }
    function quita(p) { p.el.remove(); meses = meses.filter(m => !p.meses.includes(m)); }
    function desliza(k) {
      if (!k) return;
      if (k < 0 && primeroVisible() <= HOY) return;
      vista = sumaMes(vista, k);
      monta(k);
      // el foco del teclado se queda dentro de lo que se ve
      if (foco < primeroVisible() || foco > ultimoVisible()) foco = Math.max(HOY, primeroVisible());
      marcaFoco();
    }
    // que el día n se vea: si cae fuera, los meses se deslizan hasta él
    function muestra(n) {
      const f = aFecha(n), dif = (f.a - vista.a) * 12 + (f.m - vista.m);
      if (dif < 0) desliza(dif); else if (dif >= cuantos) desliza(dif - cuantos + 1);
    }

    /* ── la banda ──────────────────────────────────────────────────── */
    /* Cada tira mide su fila en fracciones (0 = borde izquierdo de su
       primer día, 1 = borde derecho del último) y el centro del día n cae
       en (n − primero + ½) / días. El tramo va de un extremo al otro y lo
       que se sale de la fila lo recorta la tira: así el corte en el cambio
       de semana sale recto solo. Los discos son los extremos redondos. */
    function pinta() {
      const lo = Math.min(S.x, E.x), hi = Math.max(S.x, E.x);
      const g = reduce ? 0 : golpe.x, banda = sujeta(vivo.x, 0, 1);
      // el extremo que viaja se estira un poco con la velocidad, como una gota
      const estira = reduce ? 0 : Math.min(.16, Math.abs(E.v) * .007);
      for (const mes of meses) for (const f of mes.filas) {
        const base = f.nA - .5, k = f.k;
        const xl = sujeta((lo - base) / k, 0, 1), xr = sujeta((hi - base) / k, 0, 1);
        if (banda > .002 && xr - xl > .0005) {
          f.tramo.style.transform = 'translateX(' + (xl * 100).toFixed(3) + '%) scale(' + (xr - xl).toFixed(5) + ',' + (1 + g * .3).toFixed(4) + ')';
          f.tramo.style.opacity = banda.toFixed(3);
        } else f.tramo.style.opacity = '0';
        disco(f.pI, f.dI, (S.x - base) / k, k, escI.x * (1 + g * .6), 0);
        disco(f.pF, f.dF, (E.x - base) / k, k, escF.x * (1 + g * .6), estira);
      }
    }
    function disco(pos, d, x, k, s, estira) {
      // a más de un día de la fila no se pinta: ahí ya no se vería nada
      if (s < .01 || x < -1 / k || x > 1 + 1 / k) { pos.style.visibility = 'hidden'; return; }
      pos.style.visibility = '';
      pos.style.transform = 'translateX(' + (x * 100).toFixed(3) + '%)';
      d.style.transform = 'scale(' + (s * (1 + estira)).toFixed(4) + ',' + (s * (1 - estira * .55)).toFixed(4) + ')';
    }

    /* ── el bucle de los resortes ─────────────────────────────────── */
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

    /* ── elegir ────────────────────────────────────────────────────── */
    function elige(n) {
      if (n < HOY) return;
      foco = n; marcaFoco();
      if (fase === 'fin' && n > ini) {
        if (n - ini < o.minNoches) return;
        // la salida: el extremo llega, se llena y la banda se asienta con un rebote
        fin = n; fase = 'listo';
        E.meta = n; escF.meta = 1;
        golpe.v += 2.6;
      } else {
        // una llegada nueva: si ya había banda, se recoge hacia el día elegido
        const habia = ini !== null && vivo.x > .05;
        ini = n; fin = null; fase = 'fin';
        if (!habia) { S.x = E.x = n; S.v = E.v = 0; escI.x = 0; escF.x = .5; }
        S.meta = E.meta = n; escI.meta = escF.meta = 1; vivo.meta = 1;
        golpe.v += 1.2;
      }
      cambia();
    }
    // mientras se busca la salida, la banda sigue al día señalado
    function previa(n) {
      if (fase !== 'fin') return;
      const hasta = n - ini >= o.minNoches ? n : ini;
      if (E.meta === hasta) return;
      E.meta = hasta;
      rueda(hasta - ini);
      anda();
    }
    function ponRango(a, b) {
      a = Math.max(a, HOY); b = Math.max(b, a + o.minNoches);
      // si no había banda, nace desde el centro del rango y se abre hacia los dos lados
      if (ini === null || vivo.x < .05) { const m = (a + b) / 2; S.x = E.x = m; S.v = E.v = 0; escI.x = escF.x = .3; }
      ini = a; fin = b; fase = 'listo';
      S.meta = a; E.meta = b; escI.meta = escF.meta = vivo.meta = 1;
      muestra(b); muestra(a);
      foco = a; marcaFoco();
      cambia();
    }
    let relojOk = 0;
    function borra() {
      if (ini === null) return;
      // la banda se recoge hacia su centro y los discos se apagan
      const m = (S.x + E.x) / 2;
      S.meta = E.meta = m; escI.meta = escF.meta = vivo.meta = 0;
      ini = fin = null; fase = 'inicio';
      clearTimeout(relojOk); raiz.classList.remove('is-aplicado');
      cambia();
    }
    function aplica() {
      if (fin === null) return;
      const valor = { desde: aISO(ini), hasta: aISO(fin), noches: fin - ini };
      raiz.classList.remove('is-aplicado'); void raiz.offsetWidth;
      raiz.classList.add('is-aplicado');
      clearTimeout(relojOk);
      relojOk = setTimeout(() => raiz.classList.remove('is-aplicado'), 1500);
      oculto.textContent = 'Fechas aplicadas: ' + valor.noches + (valor.noches === 1 ? ' noche' : ' noches');
      if (o.alAplicar) o.alAplicar(valor);
      if (o.cierraAlAplicar) setTimeout(() => cierra(true), 700);
    }

    /* ── lo que acompaña: campo, noches, atajos, días ─────────────── */
    function cambia() {
      raiz.dataset.fase = fase;
      gira(valDesde, ini === null ? 'Agrega fecha' : corta(ini), ini === null);
      setTimeout(() => gira(valHasta, fin === null ? 'Agrega fecha' : corta(fin), fin === null), 70);
      rueda(fin !== null ? fin - ini : 0);
      const txt = ini === null ? 'Elige el día de llegada' : fin === null ? 'Ahora, el día de salida' : corta(ini) + '  →  ' + corta(fin);
      gira(detalle, txt);
      oculto.textContent = fin !== null ? (fin - ini) + ' noches: del ' + larga(ini) + ' al ' + larga(fin) : txt;
      aplicar.disabled = fin === null;
      marcaDias(); marcaAtajos();
      if (o.alCambiar) o.alCambiar(fin === null ? null : { desde: aISO(ini), hasta: aISO(fin), noches: fin - ini });
      anda();
    }
    // el texto que cambia gira como un tambor: el viejo sale por arriba, el nuevo entra de abajo
    function gira(caja, texto, vacio) {
      const viejo = caja.lastElementChild;
      if (viejo && viejo.textContent === texto) return;
      const nuevo = document.createElement('span');
      nuevo.textContent = texto;
      if (vacio) nuevo.classList.add('is-vacio');
      caja.appendChild(nuevo);
      if (!viejo) return;
      nuevo.classList.add('is-entra');
      viejo.classList.add('is-sale');
      setTimeout(() => viejo.remove(), 400);
    }
    function rueda(n) {
      const d = String(sujeta(n, 0, 999)).padStart(3, '0');
      ruedas.forEach((r, i) => {
        r.classList.toggle('is-vacia', i < 3 - Math.max(1, String(n).length));
        r.firstChild.style.transform = 'translateY(' + (-d[i] * 10) + '%)';
      });
      palabra.textContent = n === 1 ? 'noche' : 'noches';
      total.classList.toggle('is-cero', n === 0);
    }
    function marcaDias() {
      if (!pista) return;
      pista.meses.forEach(m => m.celdas.forEach((celda, n) => {
        celda.setAttribute('aria-selected', String(ini !== null && (fin !== null ? n >= ini && n <= fin : n === ini)));
        celda.firstChild.classList.toggle('is-corto', fase === 'fin' && n > ini && n - ini < o.minNoches);
        celda.firstChild.classList.toggle('is-extremo', n === ini || n === fin);
      }));
    }
    function rangoAtajo(tipo) {
      if (tipo === 'finde') {
        const w = semanaDe(HOY);
        if (w === 5) return [HOY, HOY + 1];
        const vie = HOY + (w <= 4 ? 4 - w : 5);
        return [vie, vie + 2];
      }
      if (/^dias:\d+$/.test(tipo)) return [HOY, HOY + +tipo.slice(5)];
      if (tipo === 'mes') { const f = aFecha(HOY); return [HOY, aNumero(f.a, f.m, diasDelMes(f.a, f.m))]; }
      return null;
    }
    // el atajo que coincide con el rango se marca, y la placa viaja hasta él
    function marcaAtajos() {
      let activo = null;
      atajos.forEach(b => {
        const r = rangoAtajo(b.dataset.atajo), si = !!r && fin !== null && r[0] === ini && Math.max(r[1], r[0] + o.minNoches) === fin;
        b.setAttribute('aria-pressed', String(si));
        if (si) activo = b;
      });
      if (!marcaAtajo) return;
      if (activo) {
        const salta = !marcaAtajo.classList.contains('is-visible');
        if (salta) marcaAtajo.style.transition = 'none';
        marcaAtajo.style.width = activo.offsetWidth + 'px'; marcaAtajo.style.height = activo.offsetHeight + 'px';
        marcaAtajo.style.transform = 'translate(' + activo.offsetLeft + 'px,' + activo.offsetTop + 'px)';
        if (salta) { void marcaAtajo.offsetWidth; marcaAtajo.style.transition = ''; }
      }
      marcaAtajo.classList.toggle('is-visible', !!activo);
    }
    // un solo día de la rejilla entra con Tab (el del foco); las flechas mueven ese foco
    function marcaFoco() {
      botones.forEach((b, n) => { b.tabIndex = n === foco ? 0 : -1; });
      if (!botones.has(foco)) { const b = botones.get(Math.max(HOY, primeroVisible())); if (b) b.tabIndex = 0; }
    }

    /* ── abrir y cerrar ───────────────────────────────────────────── */
    function abre(enfoca) {
      if (abierto) return;
      abierto = true;
      selector.hidden = false;
      void selector.offsetWidth;            // para que entre con su transición
      raiz.classList.add('is-abierto');
      campo.setAttribute('aria-expanded', 'true');
      if (enfoca) { const b = botones.get(foco); if (b) b.focus({ preventScroll: true }); }
    }
    function cierra(devuelve) {
      if (!abierto) return;
      abierto = false;
      raiz.classList.remove('is-abierto');
      campo.setAttribute('aria-expanded', 'false');
      setTimeout(() => { if (!abierto) selector.hidden = true; }, 420);
      if (devuelve) campo.focus({ preventScroll: true });
    }

    /* ── ratón, dedo y teclado ────────────────────────────────────── */
    const diaDe = e => { const b = e.target.closest && e.target.closest('.ea-dia'); return b && !b.closest('[inert]') ? +b.dataset.n : null; };
    caja.addEventListener('click', e => { const n = diaDe(e); if (n !== null) elige(n); });
    caja.addEventListener('pointermove', e => { const n = diaDe(e); if (n !== null && n >= HOY) previa(n); });
    // al salir de los meses (no del hueco entre ellos), la banda vuelve a la llegada
    caja.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && fase === 'fin') previa(ini); });
    caja.addEventListener('keydown', e => {
      const n = diaDe(e);
      if (n === null) return;
      const w = semanaDe(n);
      const a = { ArrowLeft: n - 1, ArrowRight: n + 1, ArrowUp: n - 7, ArrowDown: n + 7, Home: n - w, End: n + 6 - w, PageUp: otroMes(n, -1), PageDown: otroMes(n, 1) }[e.key];
      if (a === undefined) return;
      e.preventDefault();
      foco = Math.max(a, HOY);
      muestra(foco);
      marcaFoco();
      const b = botones.get(foco);
      if (b) b.focus({ preventScroll: true });
      previa(foco);
    });
    flechas.forEach(b => b.addEventListener('click', () => desliza(+b.dataset.mover)));
    atajos.forEach(b => {
      const r = rangoAtajo(b.dataset.atajo), small = b.querySelector('small');
      if (r && small) small.textContent = rotulo(r[0], Math.max(r[1], r[0] + o.minNoches));
      b.addEventListener('click', () => { if (r) ponRango(r[0], r[1]); });
    });
    borrar.addEventListener('click', borra);
    aplicar.addEventListener('click', aplica);
    campo.addEventListener('click', () => (abierto ? cierra(false) : abre(false)));
    campo.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); abre(true); } });
    raiz.addEventListener('keydown', e => { if (e.key === 'Escape' && abierto) { e.preventDefault(); cierra(true); } });

    // cuántos meses caben lo dice el CSS (--ea-meses); si cambia, se rearma la vista
    function cuantosCaben() { return Math.max(1, Math.min(o.meses, parseInt(getComputedStyle(raiz).getPropertyValue('--ea-meses'), 10) || o.meses)); }
    let espera = 0;
    addEventListener('resize', () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        const n = cuantosCaben();
        if (n !== cuantos) { cuantos = n; monta(0); marcaFoco(); }
        marcaAtajos();
      }, 120);
    });

    /* ── arranque ─────────────────────────────────────────────────── */
    cuantos = cuantosCaben();
    monta(0);
    if (o.desde && o.hasta) {
      ponRango(leeISO(o.desde), leeISO(o.hasta));
      todos.forEach(r => { r.x = r.meta; r.v = 0; });
    } else cambia();
    marcaFoco();
    if (o.abierto) { abierto = true; selector.hidden = false; raiz.classList.add('is-abierto'); campo.setAttribute('aria-expanded', 'true'); }
    pinta();

    return {
      elige: (desde, hasta) => ponRango(leeISO(desde), leeISO(hasta)),
      borra, aplica, abre: () => abre(true), cierra: () => cierra(false),
      valor: () => (fin === null ? null : { desde: aISO(ini), hasta: aISO(fin), noches: fin - ini }),
    };
  }

  window.Estadia = Estadia;
})();
