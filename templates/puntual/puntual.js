/* =====================================================================
   Puntual · Moxen
   Un temporizador con carácter de aparato: una píldora negra con una matriz
   de LEDs rojos y la cuenta en blanco.

   · La matriz son los SEGUNDOS del minuto en curso: 60 puntos en una rejilla
     de 10 × 6 que se apagan en ESPIRAL, de fuera hacia dentro, uno por segundo
     (el último destello blanco de cada LED es lo que se ve al apagarse). Cada
     vez que se completa un minuto, la matriz vuelve a encenderse siguiendo la
     misma espiral. En reposo y mientras fijas el tiempo, muestra los segundos
     del tiempo fijado: al girar el tambor de segundos, la espiral se llena.
   · Tocar la píldora la ABRE hacia abajo (la altura es un resorte) y deja ver
     dos tambores, minutos y segundos. Son cilindros: los números se curvan con
     rotateX y perspectiva, tienen inercia, un resorte que los asienta en un
     número entero y, mientras giran, un DESENFOQUE DE MOVIMIENTO vertical (un
     filtro SVG con feGaussianBlur cuya desviación en Y sigue a la velocidad).
     Se giran con la rueda, arrastrando, con ↑ ↓ (de uno en uno) y Re Pág / Av Pág
     (de cinco en cinco). El «Iniciar» ámbar cierra la tarjeta y arranca.
   · Mientras corre, tocarla pausa y reanuda; Esc o «Cancelar» la deja como estaba.
   · Al llegar a cero, todos los LEDs destellan a la vez, la píldora se sacude y
     se pliega en un círculo ámbar con un ✓ que se dibuja; después vuelve sola.

   Cómo se monta (el HTML de index.html es la plantilla):
     const t = Puntual(document.querySelector('[data-puntual]'), {
       minutos: 5, segundos: 0,   // el tiempo con el que empieza (y al que vuelve, con restaura)
       velocidad: 1,              // 1 = tiempo real. La demostración usa 15 y lo dice en la píldora
       fin: 1500,                 // ms que se queda el ✓ antes de volver
       restaura: true,            // al terminar, vuelve al tiempo inicial (false: se queda con el último)
       alIniciar: ({ segundos }) => {}, alTerminar: ({ segundos }) => {}, alCancelar: ({ restante }) => {},
     });
     t.abre(); t.cierra(); t.inicia(); t.pausa(); t.cancela();
   Qué se personaliza: los colores y las tipografías al principio de puntual.css
   (--pu-led* tiñen la matriz, --pu-ambar el «Iniciar» y el ✓); el tamaño de la
   rejilla en COLS × FILAS (los puntos son los segundos: 60); los resortes en
   MUELLES. El tiempo sale de requestAnimationFrame (nada de Date) y la
   cuenta usa el reloj de cada cuadro.
   ===================================================================== */
(function () {
  'use strict';

  const COLS = 10, FILAS = 6, N = COLS * FILAS;               // 60 puntos: uno por segundo
  const MUELLES = { tarjeta: [170, 17], suelta: [72, 11.5], asienta: [150, 20] };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (a, n) => ((a % n) + n) % n;
  const dos = n => String(n).padStart(2, '0');
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, h) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; }
  const reposo = r => Math.abs(r.v) < .01 && Math.abs(r.meta - r.x) < .002;

  // un resorte convertido en curva CSS linear(), para lo que se mueve con CSS (la tarjeta)
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
  const formato = s => dos(Math.floor(s / 60)) + ':' + dos(s % 60);
  // los LEDs encendidos son los segundos del minuto en curso (un minuto exacto se ve entero)
  const litDe = s => s <= 0 ? 0 : (s % 60 === 0 ? 60 : s % 60);

  // el orden en que se apagan: una espiral de fuera hacia dentro, empezando arriba a la izquierda
  function espiral() {
    const orden = []; let t = 0, b = FILAS - 1, l = 0, r = COLS - 1;
    while (t <= b && l <= r) {
      for (let c = l; c <= r; c++) orden.push(t * COLS + c); t++;
      for (let f = t; f <= b; f++) orden.push(f * COLS + r); r--;
      if (t <= b) { for (let c = r; c >= l; c--) orden.push(b * COLS + c); b--; }
      if (l <= r) { for (let f = b; f >= t; f--) orden.push(f * COLS + l); l++; }
    }
    return orden;
  }

  /* =====================================================================
     Las cifras que ruedan (una tira del 0 al 9 por columna)
     ===================================================================== */
  function Reloj(el) {
    let mascara = '', cols = [];
    function pon(str) {
      const masc = str.replace(/\d/g, '0');
      if (masc !== mascara) {
        mascara = masc; el.textContent = ''; cols = [];
        Array.from(str).forEach(ch => {
          if (ch === ':') { const d = document.createElement('span'); d.className = 'pu-dp'; d.textContent = ':'; el.appendChild(d); cols.push(null); return; }
          const c = document.createElement('span'), t = document.createElement('span');
          c.className = 'pu-col'; t.className = 'pu-tira-d';
          t.innerHTML = '0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9';
          t.style.setProperty('--d', ch);
          c.appendChild(t); el.appendChild(c); cols.push(t);
        });
        return;
      }
      Array.from(str).forEach((ch, i) => { if (cols[i]) cols[i].style.setProperty('--d', ch); });
    }
    return { pon };
  }

  /* =====================================================================
     Un tambor: nueve números visibles sobre un cilindro, con inercia
     ===================================================================== */
  function Tambor(el, o) {
    const H = 56, ITEMS = 9, MID = 4, PASO = .5, RAD = H / Math.sin(PASO);   // PASO: ángulo entre dos números (rad); RAD: el radio que deja H px entre el central y el siguiente
    const tira = el.querySelector('[data-tira]'), filtro = document.querySelector('[data-mov="' + o.filtro + '"]');
    const items = Array.from({ length: ITEMS }, () => { const s = document.createElement('span'); s.className = 'pu-n'; tira.appendChild(s); return s; });
    if (filtro) tira.style.filter = 'url(#pu-mov-' + o.filtro + ')';
    const r = resorte(o.valor, MUELLES.asienta[0], MUELLES.asienta[1]);
    let raf = 0, tPrev = 0, arrastre = null, ultimo = -1;
    const valor = () => mod(Math.round(r.x), 60);

    function pinta() {
      const base = Math.round(r.x), quieto = o.quieto();
      for (let k = -MID; k <= MID; k++) {
        const idx = base + k, rel = idx - r.x, a = Math.abs(rel), n = items[k + MID], t = mod(idx, 60);
        if (n.__v !== t) { n.__v = t; n.textContent = dos(t); }
        // un cilindro de verdad: cada número sube por un seno, se aleja con el coseno y se inclina
        const th = clamp(rel * PASO, -1.5, 1.5);
        n.style.transform = quieto ? 'translateY(' + (rel * H).toFixed(1) + 'px)' : 'translateY(' + (RAD * Math.sin(th)).toFixed(2) + 'px) translateZ(' + (RAD * (Math.cos(th) - 1)).toFixed(2) + 'px) rotateX(' + (-th * 57.2958).toFixed(1) + 'deg)';
        n.style.opacity = clamp(1 - a * .3, 0, 1).toFixed(3);
      }
      // el desenfoque de movimiento sigue a la velocidad (solo en vertical)
      if (filtro) filtro.setAttribute('stdDeviation', quieto ? '0 0' : '0 ' + Math.min(8, Math.abs(r.v) * .12).toFixed(2));
      const v = valor();
      if (v !== ultimo) { ultimo = v; el.setAttribute('aria-valuenow', String(v)); el.setAttribute('aria-valuetext', v + (o.unidad || '')); if (typeof o.alCambiar === 'function') o.alCambiar(v); }
    }
    function paso(ts) {
      raf = 0;
      const dt = clamp((ts - tPrev) / 1000, 0, .05); tPrev = ts;
      if (!arrastre) {
        if (o.quieto()) { r.x = r.meta; r.v = 0; }
        else { const pasos = Math.max(1, Math.ceil(dt * 240)), h = dt / pasos; for (let i = 0; i < pasos; i++) avanza(r, h); }
      }
      pinta();
      if (arrastre || !reposo(r)) raf = requestAnimationFrame(paso);
      else { r.x = r.meta; r.v = 0; pinta(); }
    }
    function arranca() { if (!raf) { tPrev = performance.now(); raf = requestAnimationFrame(paso); } }

    // girar con un resorte hacia un entero (la rueda y el teclado)
    function mueve(d) { r.k = MUELLES.asienta[0]; r.c = MUELLES.asienta[1]; r.meta = Math.round(r.meta) + d; arranca(); }
    el.addEventListener('wheel', ev => { ev.preventDefault(); mueve(Math.round(clamp(ev.deltaY * (ev.deltaMode === 1 ? 16 : 1), -420, 420) / 60) || (ev.deltaY > 0 ? 1 : -1)); }, { passive: false });
    el.addEventListener('keydown', ev => {
      const k = ev.key; let d = 0;
      if (k === 'ArrowUp') d = 1; else if (k === 'ArrowDown') d = -1; else if (k === 'PageUp') d = 5; else if (k === 'PageDown') d = -5;
      else if (k === 'Home') d = -valor(); else if (k === 'End') d = 59 - valor(); else return;
      ev.preventDefault(); mueve(d);
    });
    // arrastrar: el número sigue al dedo y, al soltar, sigue con la inercia que llevaba
    el.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura también sirve */ }
      arrastre = { y0: ev.clientY, p0: r.x, muestras: [{ t: performance.now(), x: r.x }] };
      r.v = 0; r.meta = r.x; arranca();
    });
    el.addEventListener('pointermove', ev => {
      if (!arrastre) return;
      r.x = r.meta = arrastre.p0 + (arrastre.y0 - ev.clientY) / H;
      const ahora = performance.now(), m = arrastre.muestras; m.push({ t: ahora, x: r.x });
      while (m.length > 2 && ahora - m[0].t > 90) m.shift();
      const a = m[0], b = m[m.length - 1]; r.v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) * 1000 : 0;
      arranca();
    });
    const suelta = () => {
      if (!arrastre) return;
      arrastre = null;
      r.v = clamp(r.v, -90, 90);
      r.k = MUELLES.suelta[0]; r.c = MUELLES.suelta[1]; r.meta = Math.round(r.x + r.v * .22);
      arranca();
    };
    el.addEventListener('pointerup', suelta); el.addEventListener('pointercancel', suelta);
    ultimo = valor(); pinta();
    return {
      get valor() { return valor(); },
      pon(v) { r.x = r.meta = v; r.v = 0; r.k = MUELLES.asienta[0]; r.c = MUELLES.asienta[1]; pinta(); },
      foco() { el.focus({ preventScroll: true }); },
    };
  }

  /* =====================================================================
     El temporizador
     ===================================================================== */
  function Puntual(raiz, opciones) {
    const o = Object.assign({ minutos: 5, segundos: 0, velocidad: 1, fin: 1500, restaura: true, alIniciar: null, alTerminar: null, alCancelar: null }, opciones);
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const quieto = () => mq.matches;
    const $ = s => raiz.querySelector(s);
    const caja = $('[data-caja]'), tarjeta = $('[data-tarjeta]'), cabeza = $('[data-cabeza]'), matriz = $('[data-matriz]'), ajuste = $('[data-ajuste]');
    const etiqueta = $('[data-etiqueta]'), vel = $('[data-vel]'), pista = $('[data-pista]'), vivo = $('[data-vivo]'), btnInicia = $('[data-inicia]'), btnCancela = $('[data-cancela]');
    const reloj = Reloj($('[data-tiempo]'));
    raiz.style.setProperty('--pu-muelle', muelle(MUELLES.tarjeta[0], MUELLES.tarjeta[1]));
    raiz.style.setProperty('--pu-roda', Math.min(.26, .9 / o.velocidad).toFixed(3) + 's');       // las cifras ruedan más rápido cuanto más corre la cuenta (así se leen a ×15)
    const avisa = s => { vivo.textContent = ''; vivo.textContent = s; };

    // la matriz: 60 LEDs en filas; cada uno sabe su puesto en la espiral (--k)
    const leds = [], porOrden = new Array(N);
    espiral().forEach((idx, k) => { porOrden[k] = idx; });
    for (let i = 0; i < N; i++) { const l = document.createElement('i'); l.className = 'pu-led'; leds.push(l); matriz.appendChild(l); }
    const puesto = new Array(N);
    porOrden.forEach((idx, k) => { puesto[k] = leds[idx]; leds[idx].style.setProperty('--k', k); });
    let litActual = -1, ondaId = 0;
    function ponMatriz(lit, anim) {
      const corte = N - lit, sube = anim && litActual >= 0 && lit > litActual + 1;
      for (let k = 0; k < N; k++) {
        const off = k < corte, l = puesto[k];
        if (off !== l.__off) {
          l.__off = off; l.classList.toggle('is-off', off);
          if (off && anim && !quieto()) { l.classList.remove('is-apaga'); void l.offsetWidth; l.classList.add('is-apaga'); } else l.classList.remove('is-apaga');
        }
      }
      if (sube && !quieto()) { matriz.classList.remove('is-onda'); void matriz.offsetWidth; matriz.classList.add('is-onda'); clearTimeout(ondaId); ondaId = setTimeout(() => matriz.classList.remove('is-onda'), 1300); }
      litActual = lit;
    }

    let estado = 'reposo', min = o.minutos, seg = o.segundos, restante = 0, total = 0, mostrado = -1, raf = 0, tPrev = 0, finId = 0, ciclo = 0;
    const tambores = [
      Tambor($('[data-tambor="0"]'), { valor: min, filtro: 0, unidad: ' minutos', quieto, alCambiar: v => { min = v; vistaPrevia(); } }),
      Tambor($('[data-tambor="1"]'), { valor: seg, filtro: 1, unidad: ' segundos', quieto, alCambiar: v => { seg = v; vistaPrevia(); } }),
    ];
    const tiempoFijado = () => min * 60 + seg;
    // la cuenta y la matriz de lo que está fijado (en reposo y mientras giras los tambores)
    function vistaPrevia() {
      if (estado !== 'reposo' && estado !== 'ajuste') return;
      const t = tiempoFijado();
      reloj.pon(formato(t)); ponMatriz(litDe(t), false);
      btnInicia.setAttribute('aria-disabled', String(t <= 0));
      cabeza.setAttribute('aria-label', 'Temporizador fijado en ' + formato(t) + '. Pulsa para ' + (estado === 'ajuste' ? 'cerrar el ajuste' : 'cambiar el tiempo'));
    }

    const PISTAS = {
      reposo: 'Toca la píldora para fijar el tiempo',
      ajuste: 'Gira los tambores con la rueda, arrastrando o con <kbd>↑</kbd> <kbd>↓</kbd>',
      corre: 'Toca la píldora para pausar',
      pausa: 'En pausa · toca la píldora para seguir',
      fin: '¡Tiempo cumplido!',
      ok: 'Listo',
    };
    const ETIQUETAS = { reposo: 'Fijado', ajuste: 'Fijando', corre: 'Restante', pausa: 'En pausa', fin: '¡Hecho!', ok: 'Listo' };
    const ponPista = (k, aviso) => { pista.innerHTML = PISTAS[k] || k; pista.classList.toggle('is-aviso', !!aviso); };
    function ponEstado(e) {
      estado = e;
      tarjeta.dataset.estado = e; caja.dataset.estado = e;
      ajuste.inert = e !== 'ajuste';
      cabeza.tabIndex = e === 'ok' || e === 'fin' ? -1 : 0;
      etiqueta.textContent = ETIQUETAS[e];
      vel.hidden = !((e === 'corre' || e === 'pausa') && o.velocidad > 1); vel.textContent = '×' + o.velocidad + ' demo';
      btnCancela.hidden = !(e === 'corre' || e === 'pausa');
      ponPista(e);
    }

    /* ── abrir y cerrar el ajuste ───────────────────────────────────────── */
    function abre(teclado) {
      if (estado !== 'reposo') return;
      ponEstado('ajuste'); vistaPrevia();
      if (teclado) setTimeout(() => { if (estado === 'ajuste') tambores[0].foco(); }, 120);
    }
    function cierra(foco) {
      if (estado !== 'ajuste') return;
      ponEstado('reposo'); vistaPrevia();
      if (foco) cabeza.focus({ preventScroll: true });
    }
    cabeza.addEventListener('click', ev => {
      if (estado === 'reposo') abre(ev.detail === 0);
      else if (estado === 'ajuste') cierra(ev.detail === 0);
      else if (estado === 'corre' || estado === 'pausa') pausa();
      else if (estado === 'ok') reinicia(true);
    });
    cabeza.addEventListener('keydown', ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); cabeza.click(); } });
    document.addEventListener('pointerdown', ev => { if (estado === 'ajuste' && !tarjeta.contains(ev.target)) cierra(false); });
    raiz.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if (estado === 'ajuste') { ev.preventDefault(); cierra(true); }
      else if (estado === 'corre' || estado === 'pausa') { ev.preventDefault(); cancela(true); }
      else if (estado === 'ok') { ev.preventDefault(); reinicia(true); }
    });

    /* ── la cuenta atrás ────────────────────────────────────────────────── */
    function paso(ts) {
      raf = 0;
      if (estado !== 'corre') return;
      const dt = clamp((ts - tPrev) / 1000, 0, .25); tPrev = ts;
      restante -= dt * o.velocidad;
      const s = Math.max(0, Math.ceil(restante - 1e-9));
      if (s !== mostrado) {
        mostrado = s; reloj.pon(formato(s)); ponMatriz(litDe(s), true);
        if (o.velocidad === 1 && s > 0 && (s % 60 === 0 || s === 30 || s === 10)) avisa('Quedan ' + (s >= 60 ? s / 60 + (s === 60 ? ' minuto' : ' minutos') : s + ' segundos') + '.');
      }
      if (restante <= 0) { termina(); return; }
      raf = requestAnimationFrame(paso);
    }
    function arranca() { if (!raf) { tPrev = performance.now(); raf = requestAnimationFrame(paso); } }

    function inicia(teclado) {
      if (estado !== 'ajuste') return;
      total = tiempoFijado();
      if (total <= 0) {
        ponPista('Elige al menos un segundo', true); avisa('Elige al menos un segundo.');
        if (!quieto()) { tarjeta.classList.remove('is-no'); void tarjeta.offsetWidth; tarjeta.classList.add('is-no'); }
        return;
      }
      restante = total; mostrado = total;
      reloj.pon(formato(total)); ponMatriz(litDe(total), false);
      ponEstado('corre');
      if (teclado) cabeza.focus({ preventScroll: true });
      avisa('Temporizador iniciado: ' + formato(total) + '.');
      if (typeof o.alIniciar === 'function') o.alIniciar({ segundos: total });
      arranca();
    }
    btnInicia.addEventListener('click', ev => inicia(ev.detail === 0));

    function pausa() {
      if (estado === 'corre') { ponEstado('pausa'); avisa('En pausa.'); }
      else if (estado === 'pausa') { ponEstado('corre'); avisa('Reanudado.'); arranca(); }
    }
    btnCancela.addEventListener('click', ev => cancela(ev.detail === 0));
    function cancela(foco) {
      if (estado !== 'corre' && estado !== 'pausa') return;
      const dato = { restante: Math.max(0, Math.round(restante)) };
      ciclo++; cancelAnimationFrame(raf); raf = 0;
      ponEstado('reposo'); vistaPrevia();
      ponMatriz(litDe(tiempoFijado()), true);
      avisa('Temporizador cancelado.');
      if (foco) cabeza.focus({ preventScroll: true });
      if (typeof o.alCancelar === 'function') o.alCancelar(dato);
    }

    /* ── el final: destello, sacudida y ✓ ───────────────────────────────── */
    function termina() {
      const mi = ++ciclo;
      reloj.pon('00:00');
      ponEstado('fin');
      avisa('Tiempo cumplido.');
      if (typeof o.alTerminar === 'function') o.alTerminar({ segundos: total });
      // todos los LEDs se encienden y destellan a la vez
      for (let k = 0; k < N; k++) { puesto[k].__off = false; puesto[k].classList.remove('is-off', 'is-apaga'); }
      litActual = N;
      if (!quieto()) {
        matriz.classList.remove('is-destello'); void matriz.offsetWidth; matriz.classList.add('is-destello');
        setTimeout(() => { if (mi !== ciclo) return; tarjeta.classList.remove('is-sacude'); void tarjeta.offsetWidth; tarjeta.classList.add('is-sacude'); }, 380);
      }
      setTimeout(() => {
        if (mi !== ciclo) return;
        matriz.classList.remove('is-destello'); tarjeta.classList.remove('is-sacude');
        ponEstado('ok');
        finId = setTimeout(() => { if (mi === ciclo) reinicia(false); }, o.fin + (quieto() ? 0 : 450));
      }, quieto() ? 0 : 880);
    }
    function reinicia(foco) {
      clearTimeout(finId); ciclo++;
      if (o.restaura) { min = o.minutos; seg = o.segundos; tambores[0].pon(min); tambores[1].pon(seg); }
      ponEstado('reposo'); vistaPrevia();
      if (foco) cabeza.focus({ preventScroll: true });
    }

    ponEstado('reposo');
    vistaPrevia();

    return {
      abre: () => abre(false), cierra: () => cierra(false), inicia: () => inicia(false), pausa, cancela: () => cancela(false),
      get estado() { return estado; },
    };
  }

  window.Puntual = Puntual;
})();
