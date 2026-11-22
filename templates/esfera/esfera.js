/* =====================================================================
   Esfera · Moxen
   Un temporizador de dial que se maneja con la mano. El tiempo es un
   sector rojo que nace en las 12: se arrastra por el dial (o con las
   flechas, o con la rueda) y se pega a los minutos, con un imán un poco
   más fuerte en los múltiplos de cinco; al avanzar, las marcas y los
   números que el sector cubre se encienden en rojo, el asa da un
   saltito en cada minuto y la mesa recibe un reflejo rojo que crece con
   el sector. ▶ lo hace correr: el sector se consume sin parar y la
   lectura cambia dígito a dígito. Al llegar a cero el dial tiembla como
   un despertador, tres ondas salen de su borde, una luz barre la cara,
   saltan chispas y baja un aviso con tu recordatorio; pasados unos
   segundos todo vuelve solo al valor de partida.

     const e = Esfera(document.querySelector('[data-esfera]'), {
       inicial: 25,          // minutos al abrir y tras el aviso
       maximo: 60,           // el dial da una vuelta completa
       velocidad: 1,         // 1 = tiempo real; 60 = cada segundo vale un minuto (la demo)
       despedida: 2800,      // ms que se queda el aviso antes de volver al inicio
       alTerminar: ({ minutos, texto }) => { … },   // sonido, notificación, tu lógica
       alCambiar: minutos => { … },
     });
     e.pon(12); e.inicia(); e.pausa(); e.reinicia();

   Qué cambia qué: en el .css, --es-fondo es la mesa; --es-rojo (claro y
   hondo) es el sector y todo lo que se enciende; --es-tinta es el negro
   de los números y del botón; --es-cara-* es el cuadrante y --es-cubo-*
   / --es-domo-* la perilla central. El texto del recordatorio es el
   <input data-nota>. Teclado: en el dial, flechas ±1 min, Re Pág / Av Pág
   ±5, Inicio / Fin, Intro o espacio inicia y pausa; Esc reinicia en
   cualquier parte. Se anima transform, opacity y los atributos del
   sector SVG; el tiempo sale del reloj de rAF, no de Date. Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  /* ── resortes ─────────────────────────────────────────────────────── */
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, h) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; }
  const reposo = r => Math.abs(r.v) < .02 && Math.abs(r.meta - r.x) < .02;

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

  // azar con semilla: las chispas salen siempre igual (la página y el vídeo coinciden)
  function mulberry32(s) {
    return () => {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const NS = 'http://www.w3.org/2000/svg';
  const RS = 212;          // radio del sector (unidades del SVG, que mide 600 × 600)
  const RR = 252;          // radio del recorte que enciende las marcas
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // el sector: del minuto 0 (arriba) hasta m, en el sentido de las agujas
  function arco(m, r) {
    if (m <= .005) return '';
    if (m >= 59.99) return 'M0 ' + -r + 'A' + r + ' ' + r + ' 0 1 1 0 ' + r + 'A' + r + ' ' + r + ' 0 1 1 0 ' + -r + 'Z';
    const a = m * 6 * Math.PI / 180;
    return 'M0 0L0 ' + -r + 'A' + r + ' ' + r + ' 0 ' + (m > 30 ? 1 : 0) + ' 1 ' + (r * Math.sin(a)).toFixed(2) + ' ' + (-r * Math.cos(a)).toFixed(2) + 'Z';
  }

  /* =====================================================================
     La lectura MM:SS. Cada dígito es una columna recortada: el que cambia
     cae y el nuevo entra desde arriba (al bajar el tiempo) o sube desde
     abajo (al subirlo). Si cambia más rápido que la animación (la demo a
     ×60), se cambia sin animar para que no se amontonen.
     ===================================================================== */
  function Digitos(el, reduce) {
    const cols = [];
    let ultimo = '';
    function monta(texto) {
      el.textContent = '';
      Array.from(texto).forEach(ch => {
        const c = document.createElement('span');
        if (ch === ':') { c.className = 'es-dos'; }
        else {
          c.className = 'es-dig'; c.__t = -1e9;
          const d = document.createElement('span'); d.className = 'es-dd'; d.textContent = ch; c.appendChild(d);
        }
        el.appendChild(c); cols.push(c);
      });
    }
    function cambia(c, ch, dir) {
      const ahora = performance.now();
      if (reduce || ahora - c.__t < 170) {
        while (c.children.length > 1) c.removeChild(c.firstChild);
        c.lastElementChild.textContent = ch; c.__t = ahora; return;
      }
      c.__t = ahora;
      const viejo = c.lastElementChild, nuevo = document.createElement('span');
      nuevo.className = 'es-dd'; nuevo.textContent = ch; c.appendChild(nuevo);
      const op = { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'both' };
      viejo.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + dir * 100 + '%)', opacity: 0 }], op).onfinish = () => viejo.remove();
      nuevo.animate([{ transform: 'translateY(' + -dir * 100 + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], op);
    }
    function pon(texto, dir) {
      if (!cols.length) { monta(texto); ultimo = texto; return; }
      if (texto === ultimo) return;
      Array.from(texto).forEach((ch, i) => { if (ch !== ultimo[i] && ch !== ':') cambia(cols[i], ch, dir || 1); });
      ultimo = texto;
    }
    return { pon };
  }

  /* =====================================================================
     La esfera
     ===================================================================== */
  function Esfera(raiz, opciones) {
    const o = Object.assign({
      inicial: 25, maximo: 60, velocidad: 60, despedida: 2800, semilla: 11, alTerminar: null, alCambiar: null,
    }, opciones);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = s => raiz.querySelector(s), $$ = s => Array.from(raiz.querySelectorAll(s));
    raiz.style.setProperty('--es-muelle', muelle(230, 15));

    const reloj = $('[data-reloj]'), caja = $('.es-caja'), sectorEl = $('[data-sector]'), sombraEl = $('[data-sector-sombra]'), brilloEl = $('[data-sector-brillo]');
    const recorte = $('[data-recorte]'), filo = $('[data-filo]'), asa = $('[data-asa]'), asaEsc = $('[data-asa-escala]');
    const led = $('[data-led]'), ledHalo = $('[data-led-halo]'), vivasG = $('[data-marcas-vivas]');
    const estadoEl = $('[data-estado]'), subEl = $('[data-sub]'), cifrasEl = $('[data-cifras]'), notaEl = $('[data-nota]');
    const campo = $('[data-campo]'), juega = $('[data-juega]'), aviso = $('[data-aviso]'), avisoTxt = $('[data-aviso-txt]');
    const ritmoBtn = $('[data-ritmo]'), ritmoTxt = $('.es-ritmo-txt'), vivo = $('[data-vivo]');
    const chips = $$('.es-chip'), pasos = $$('.es-paso'), barrido = $('.es-barrido'), ondas = $$('.es-onda'), chispasEl = $('[data-chispas]');
    const cifras = Digitos(cifrasEl, reduce);
    const azar = mulberry32(o.semilla);

    // las 60 marcas (apagadas y encendidas) y los doce números
    function linea(g, i) {
      const mayor = i % 5 === 0, a = i * 6 * Math.PI / 180, r1 = mayor ? 220 : 227, r2 = 242;
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', (Math.sin(a) * r1).toFixed(2)); l.setAttribute('y1', (-Math.cos(a) * r1).toFixed(2));
      l.setAttribute('x2', (Math.sin(a) * r2).toFixed(2)); l.setAttribute('y2', (-Math.cos(a) * r2).toFixed(2));
      l.setAttribute('stroke-width', mayor ? 4.2 : 2);
      g.appendChild(l);
    }
    for (let i = 0; i < 60; i++) { linea($('[data-marcas]'), i); linea(vivasG, i); }
    const numeros = [];
    for (let k = 1; k <= 12; k++) {
      const n = k * 5, a = n * 6 * Math.PI / 180, t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'es-n'); t.setAttribute('x', (Math.sin(a) * 272).toFixed(2)); t.setAttribute('y', (-Math.cos(a) * 272).toFixed(2));
      t.textContent = n;
      $('[data-numeros]').appendChild(t); numeros.push({ el: t, n, on: false });
    }

    /* ── el estado ──────────────────────────────────────────────────── */
    let estado = 'reposo';                    // reposo · corre · pausa · fin
    let fijo = clamp(Math.round(o.inicial), 0, o.maximo);   // los minutos elegidos
    let rest = fijo * 60;                     // segundos que quedan
    let velocidad = o.velocidad;
    const sec = resorte(fijo, 250, 21);       // el sector que se ve, en minutos
    const asaE = resorte(1, 300, 14);         // la escala del asa
    let raf = 0, previo = 0, tremor = null, luces = false, calorPrevio = -1, ultimaSub = '', ultimoMin = fijo;

    const relojes = new Set();
    const luego = (fn, ms) => { const id = setTimeout(() => { relojes.delete(id); fn(); }, ms); relojes.add(id); return id; };
    const avisa = s => { vivo.textContent = ''; vivo.textContent = s; };
    const base = () => estado === 'corre' || estado === 'pausa' ? Math.round(rest / 60) : fijo;

    /* ── pintar ─────────────────────────────────────────────────────── */
    function pinta() {
      const m = clamp(sec.x, 0, 60), a = m * 6 * Math.PI / 180;
      const d = arco(m, RS);
      sectorEl.setAttribute('d', d); brilloEl.setAttribute('d', d); sombraEl.setAttribute('d', arco(m, RS - 3));
      recorte.setAttribute('d', arco(luces ? 60 : m, RR));
      asa.setAttribute('transform', 'translate(' + (RS * Math.sin(a)).toFixed(2) + ' ' + (-RS * Math.cos(a)).toFixed(2) + ')');
      asaEsc.style.transform = 'scale(' + asaE.x.toFixed(3) + ')';
      filo.setAttribute('transform', 'rotate(' + (m * 6).toFixed(2) + ')');
      filo.style.display = m > .05 ? '' : 'none';
      const mm = luces ? 60 : m;
      numeros.forEach(n => { const on = mm >= n.n - .5; if (on !== n.on) { n.on = on; n.el.classList.toggle('on', on); } });
      const calor = +(m / 60).toFixed(3);
      if (Math.abs(calor - calorPrevio) > .002) { calorPrevio = calor; caja.style.setProperty('--es-calor', calor); }
    }

    /* ── la lectura, las etiquetas y la accesibilidad ───────────────── */
    function lectura(dir) {
      const s = estado === 'reposo' ? fijo * 60 : estado === 'fin' ? 0 : Math.max(0, Math.ceil(rest - 1e-6));
      cifras.pon(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'), dir);
      const q = Math.ceil(s / 60);
      let sub;
      if (estado === 'reposo') sub = fijo === 0 ? 'Arrastra el dial para elegir' : 'Suena en ' + fijo + ' min';
      else if (estado === 'corre') sub = q <= 1 ? 'Queda menos de un minuto' : 'Quedan ' + q + ' min';
      else if (estado === 'pausa') sub = 'En pausa · ' + (q <= 1 ? 'menos de 1 min' : q + ' min');
      else sub = 'Tiempo cumplido';
      if (sub !== ultimaSub) { ultimaSub = sub; subEl.textContent = sub; }
      const n = estado === 'reposo' ? fijo : q;
      reloj.setAttribute('aria-valuenow', n);
      reloj.setAttribute('aria-valuetext', (estado === 'corre' ? 'Corriendo, quedan ' : estado === 'pausa' ? 'En pausa, quedan ' : '') + n + (n === 1 ? ' minuto' : ' minutos'));
    }
    function etiquetas() {
      const txt = { reposo: 'Listo para empezar', corre: 'Corriendo', pausa: 'En pausa', fin: '¡Tiempo!' }[estado];
      estadoEl.textContent = txt;
      estadoEl.className = 'es-estado is-' + estado;
      cifrasEl.classList.toggle('is-fin', estado === 'fin');
      cifrasEl.classList.toggle('is-pausa', estado === 'pausa');
      juega.classList.toggle('is-corre', estado === 'corre');
      juega.setAttribute('aria-label', estado === 'corre' ? 'Pausar' : estado === 'pausa' ? 'Continuar' : 'Iniciar');
      const enc = estado === 'corre' || estado === 'fin';
      led.classList.toggle('on', enc); ledHalo.classList.toggle('on', enc);
      reloj.classList.toggle('is-bloqueado', estado === 'fin');
      chips.forEach(c => c.classList.toggle('is-activo', estado === 'reposo' && +c.dataset.min === fijo));
      if (document.activeElement !== campo) campo.value = fijo;
      pasos.forEach(p => { p.disabled = estado === 'fin' || (+p.dataset.paso < 0 ? base() <= 0 : base() >= o.maximo); });
    }

    /* ── el bucle ───────────────────────────────────────────────────── */
    function despierta() { if (!raf) { previo = 0; raf = requestAnimationFrame(cuadro); } }
    function cuadro(ms) {
      raf = 0;
      const real = previo ? (ms - previo) / 1000 : 1 / 60;          // el tiempo de verdad, sin tope: un temporizador no se atrasa
      const h = Math.min(.05, real); previo = ms;
      let activo = false;
      if (estado === 'corre') {
        rest -= real * velocidad;
        if (rest <= 0) { rest = 0; sec.x = sec.meta = 0; sec.v = 0; termina(); }
        else { sec.x = sec.meta = rest / 60; sec.v = 0; }
        lectura(1); activo = true;
        if (Math.ceil(rest / 60) !== ultimoMin) { ultimoMin = Math.ceil(rest / 60); }
      } else if (reduce) {
        sec.x = sec.meta; sec.v = 0; asaE.x = asaE.meta; asaE.v = 0;
      } else {
        for (let i = 0; i < 2; i++) { avanza(sec, h / 2); avanza(asaE, h / 2); }
        if (reposo(sec) && reposo(asaE)) { sec.x = sec.meta; sec.v = 0; asaE.x = asaE.meta; asaE.v = 0; } else activo = true;
      }
      if (tremor) {
        tremor.t += h;
        const t = tremor.t, A = 3.4 * Math.exp(-t * 3.1);
        reloj.style.transform = 'rotate(' + (A * Math.sin(t * 52)).toFixed(3) + 'deg) translateY(' + (-Math.abs(A) * .5 * Math.sin(t * 52)).toFixed(2) + 'px)';
        if (t > 1.7) { tremor = null; reloj.style.transform = ''; } else activo = true;
      }
      pinta();
      if (activo) raf = requestAnimationFrame(cuadro);
    }

    /* ── elegir el tiempo ───────────────────────────────────────────── */
    function elige(m, silencio) {
      if (estado === 'fin') return;
      m = clamp(Math.round(m), 0, o.maximo);
      const antes = base();
      fijo = m; rest = m * 60; sec.meta = m;
      if (estado === 'corre' || estado === 'pausa') { sec.x = m; sec.v = 0; }
      if (m !== antes) {
        asaE.v = Math.min(asaE.v + 3.2, 7);
        lectura(m > antes ? -1 : 1);
        if (o.alCambiar) o.alCambiar(m);
        if (!silencio) { /* el valor lo anuncia aria-valuetext del deslizador */ }
      }
      etiquetas(); despierta();
    }

    /* ── correr, pausar, llegar a cero ──────────────────────────────── */
    function alterna() {
      if (estado === 'fin') return;
      if (estado === 'corre') { estado = 'pausa'; sec.meta = sec.x = rest / 60; avisa('En pausa'); }
      else {
        if (estado === 'reposo') {
          if (fijo <= 0) { rechaza(); return; }
          rest = fijo * 60; avisa('Temporizador iniciado: ' + fijo + (fijo === 1 ? ' minuto' : ' minutos'));
        } else avisa('Continúa');
        estado = 'corre'; sec.x = sec.meta = rest / 60; sec.v = 0; ultimoMin = Math.ceil(rest / 60);
      }
      lectura(1); etiquetas(); despierta();
    }
    function rechaza() {
      juega.classList.remove('is-aviso'); void juega.offsetWidth; juega.classList.add('is-aviso');
      asaE.v += 6; despierta(); avisa('Elige primero un tiempo');
    }
    function termina() {
      estado = 'fin';
      const texto = notaEl.value.trim() || 'Tu recordatorio';
      avisoTxt.textContent = texto;
      aviso.classList.add('is-visible');
      lectura(1); etiquetas();
      avisa('Se acabó el tiempo: ' + texto);
      efectos();
      if (o.alTerminar) o.alTerminar({ minutos: fijo, texto });
      luego(() => reinicia(), o.despedida);
    }
    // la llegada a cero: el dial tiembla, tres ondas, un barrido de luz y chispas
    function efectos() {
      luces = true; luego(() => { luces = false; pinta(); }, 1100);
      if (reduce) return;
      tremor = { t: 0 };
      const curva = 'cubic-bezier(.2, .7, .3, 1)';
      ondas.forEach((el, i) => el.animate([{ transform: 'scale(1)', opacity: .62 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 1500, delay: i * 230, easing: curva, fill: 'backwards' }));
      barrido.animate([{ transform: 'rotate(0deg)', opacity: 1 }, { transform: 'rotate(560deg)', opacity: 0 }], { duration: 1500, easing: 'cubic-bezier(.35, .1, .2, 1)' });
      vivasG.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: .15 }, { opacity: 1 }, { opacity: .2 }, { opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in-out' });
      ledHalo.animate([{ opacity: 0 }, { opacity: .95 }, { opacity: .1 }, { opacity: .95 }, { opacity: .1 }, { opacity: .95 }, { opacity: .85 }], { duration: 1300 });
      const R = reloj.clientWidth / 2;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16 + (azar() - .5) * .05) * TAU, near = R * (.9 + azar() * .06), far = R * (1.12 + azar() * .42);
        const s = document.createElement('i');
        chispasEl.appendChild(s);
        const x0 = Math.sin(ang) * near, y0 = -Math.cos(ang) * near, x1 = Math.sin(ang) * far, y1 = -Math.cos(ang) * far, rot = (azar() - .5) * 240, esc = .55 + azar() * .85;
        s.animate([
          { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.1) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + (x0 + (x1 - x0) * .7) + 'px,' + (y0 + (y1 - y0) * .7) + 'px) scale(' + esc + ') rotate(' + rot * .7 + 'deg)', opacity: 1, offset: .6 },
          { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.2) rotate(' + rot + 'deg)', opacity: 0 },
        ], { duration: 950 + azar() * 500, delay: azar() * 140, easing: 'cubic-bezier(.12, .7, .3, 1)', fill: 'backwards' }).onfinish = () => s.remove();
      }
    }
    function reinicia() {
      relojes.forEach(clearTimeout); relojes.clear();
      estado = 'reposo'; fijo = clamp(Math.round(o.inicial), 0, o.maximo); rest = fijo * 60; sec.meta = fijo;
      luces = false; tremor = null; reloj.style.transform = '';
      aviso.classList.remove('is-visible');
      lectura(-1); etiquetas(); despierta();
    }

    /* ── el dial: arrastrar ─────────────────────────────────────────── */
    let arrastra = false, ultimoRaw = 0;
    function lectura2(e) {
      const r = reloj.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      let a = Math.atan2(dx, -dy); if (a < 0) a += TAU;
      return { m: a / TAU * 60, dist: Math.hypot(dx, dy) / (r.width / 2) };
    }
    function mueve(raw, primero) {
      let m = raw;
      // dar la vuelta por las 12 no salta de 60 a 0: se queda en el extremo
      if (!primero && Math.abs(m - ultimoRaw) > 30) m = ultimoRaw > 30 ? 60 : 0;
      ultimoRaw = m;
      // el imán: los múltiplos de cinco atrapan un poco más
      const cinco = Math.round(m / 5) * 5;
      elige(Math.abs(m - cinco) < .42 ? cinco : m);
    }
    reloj.addEventListener('pointerdown', e => {
      if (estado === 'fin' || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const p = lectura2(e);
      if (p.dist < .2) return;                       // la perilla central no se agarra
      e.preventDefault();
      reloj.focus({ preventScroll: true });
      arrastra = true; reloj.setPointerCapture(e.pointerId); reloj.classList.add('is-arrastra');
      asaE.meta = 1.3; mueve(p.m, true); despierta();
    });
    reloj.addEventListener('pointermove', e => { if (arrastra) mueve(lectura2(e).m, false); });
    function suelta() {
      if (!arrastra) return;
      arrastra = false; reloj.classList.remove('is-arrastra'); asaE.meta = 1; despierta();
    }
    reloj.addEventListener('pointerup', suelta);
    reloj.addEventListener('pointercancel', suelta);
    reloj.addEventListener('lostpointercapture', suelta);

    /* ── teclado y rueda ────────────────────────────────────────────── */
    reloj.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (d) { e.preventDefault(); elige(base() + d); return; }
      if (e.key === 'Home') { e.preventDefault(); elige(0); }
      else if (e.key === 'End') { e.preventDefault(); elige(o.maximo); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(); }
    });
    // el anillo de foco del dial solo se ve cuando se llega con el teclado (no al arrastrar con el ratón)
    document.addEventListener('keydown', e => { raiz.classList.add('es-teclado'); if (e.key === 'Escape') reinicia(); });
    document.addEventListener('pointerdown', () => raiz.classList.remove('es-teclado'));
    // la rueda: cada «muesca» (o cada 40 px de un trackpad) mueve un minuto
    let acum = 0;
    function rueda(e) {
      if (estado === 'fin') return;
      e.preventDefault();
      acum += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      while (Math.abs(acum) >= 40) { elige(base() + (acum > 0 ? -1 : 1)); acum -= Math.sign(acum) * 40; }
    }
    reloj.addEventListener('wheel', rueda, { passive: false });
    $('.es-ajuste').addEventListener('wheel', rueda, { passive: false });

    /* ── el panel ───────────────────────────────────────────────────── */
    chips.forEach(c => c.addEventListener('click', () => elige(+c.dataset.min)));
    pasos.forEach(p => p.addEventListener('click', () => elige(base() + +p.dataset.paso)));
    juega.addEventListener('click', alterna);
    $('[data-reinicia]').addEventListener('click', reinicia);
    campo.addEventListener('focus', () => campo.select());
    campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 2); });
    function confirma() { const v = campo.value === '' ? base() : +campo.value; elige(v); campo.value = base(); }
    campo.addEventListener('change', confirma);
    campo.addEventListener('blur', confirma);
    campo.addEventListener('keydown', e => {
      if (e.key === 'Enter') { confirma(); campo.blur(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); elige((campo.value === '' ? base() : +campo.value) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1)); campo.value = base(); campo.select(); }
    });
    notaEl.addEventListener('keydown', e => { if (e.key === 'Enter') notaEl.blur(); });
    ritmoBtn.addEventListener('click', () => {
      const rapido = ritmoBtn.getAttribute('aria-checked') !== 'true';
      ritmoBtn.setAttribute('aria-checked', String(rapido));
      velocidad = rapido ? o.velocidad : 1;
      ritmoTxt.textContent = rapido ? 'Demostración: 1 s = 1 min' : 'Tiempo real';
    });
    if (o.velocidad <= 1) { ritmoBtn.setAttribute('aria-checked', 'false'); ritmoTxt.textContent = 'Tiempo real'; }

    // al abrir: todo en su sitio, sin animación de entrada
    asaE.x = asaE.meta = 1;
    lectura(1); etiquetas(); pinta();
    return { pon: m => elige(m), inicia: () => { if (estado !== 'corre') alterna(); }, pausa: () => { if (estado === 'corre') alterna(); }, reinicia, estado: () => estado };
  }

  window.Esfera = Esfera;
})();
