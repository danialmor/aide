/* =====================================================================
   Vencimientos · Moxen
   Un calendario de los cobros de las suscripciones del mes: un círculo de
   color por servicio en su día de cobro, con el total mensual y el anual.
   Lo que se puede hacer:
   · Pasar el cursor (o el foco) por un círculo lo hace crecer con un resorte,
     enciende su día y su fila de la lista y abre una nota con el nombre, el
     importe y el día. Con una fila de la lista pasa lo mismo al revés.
   · El conmutador «Mensual / Anual» reescala todos los círculos a la vez
     (su tamaño sale de lo que cuesta cada servicio, con un resorte), cambia
     los importes y hace rodar el total como un odómetro, cifra a cifra.
   · Pulsar un círculo (o su fila) lo marca para cancelar: un trazo lo tacha,
     cae del calendario con gravedad y rebota contra el suelo de la cuadrícula
     hasta apagarse, el total baja rodando, su día deja un anillo discontinuo,
     aparece «Ahorras al año» y la barra de semanas se reparte de nuevo: la semana
     más cargada se enciende, y si era la de ese servicio, la etiqueta se muda.
     «Deshacer» (o pulsar la fila cancelada) lo devuelve con un salto.
   · Teclado: cada círculo y cada fila son botones (Intro o Espacio cancelan);
     el conmutador responde a ← →; con Deshacer se recupera la última cancelación.

   Montaje (se inicia solo sobre [data-vencimientos]; el HTML de la demo es la plantilla):
     const v = Vencimientos(document.querySelector('[data-vencimientos]'), {
       servicios: [{ id, nombre, icono, tono, dia, imp }],    // icono: nube, sobre, lapiz, barras, escudo, servidor o globo
       mes: { nombre: 'Octubre', anio: 2026, dias: 31, primer: 3, hoy: 14 },   // primer: 0 = lunes … 6 = domingo
       alCambiar: ({ modo, total, cancelados, ahorro }) => {},
     });
     v.modo('anio');  v.cancela('analitica');  v.deshace();
   Qué cambia qué: los cuatro tonos pastel (--vc-azul, --vc-durazno, --vc-menta, --vc-lila)
   y sus versiones hondas (--vc-*-t) están al principio de vencimientos.css; cada servicio
   elige su tono con «tono». Los importes son de ejemplo y no llevan moneda. Sin
   dependencias; el tiempo sale de transiciones y requestAnimationFrame con pasos
   fijos, y no hay azar: la página y el vídeo coinciden.
   ===================================================================== */
(function () {
  'use strict';

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const quieto = () => mq.matches;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  const avanza = (r, h) => { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; };
  // un resorte convertido en curva CSS linear(): lo usan las transiciones y las animaciones
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
  const MUELLE = muelle(250, 19);
  // 12,5 → «12,50» · 1116 → «1.116,00» (el punto de los miles y la coma de los decimales)
  const fmt = n => { const c = Math.round(n * 100), e = Math.floor(c / 100), d = c % 100; return String(e).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(d).padStart(2, '0'); };

  const ICONOS = {
    nube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18.5h9.2a4 4 0 0 0 .7-7.9 5.6 5.6 0 0 0-10.7-1.2 4.6 4.6 0 0 0 .8 9.1Z"/></svg>',
    sobre: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 8 7.5 5.5L19.5 8"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 .9-4L16.3 4.6a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L9 18.1 5 19Z"/><path d="m14.5 6.5 3 3"/></svg>',
    barras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19v-7M12 19V6M18 19v-9"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8 19 6.5v5.2c0 4.3-2.8 7.2-7 8.7-4.2-1.5-7-4.4-7-8.7V6.5l7-2.7Z"/><path d="m9 12 2.2 2.2L15.2 10"/></svg>',
    servidor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4.5" width="16" height="6.5" rx="2.4"/><rect x="4" y="13" width="16" height="6.5" rx="2.4"/><path d="M7.5 7.7h.01M7.5 16.2h.01"/></svg>',
    globo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4M12 3.8c2.4 2.3 3.6 5 3.6 8.2s-1.2 5.9-3.6 8.2c-2.4-2.3-3.6-5-3.6-8.2S9.6 6.1 12 3.8Z"/></svg>',
  };
  const TACHA = '<svg class="vc-tacha" viewBox="0 0 76 76" aria-hidden="true"><path d="M18 58 58 18" pathLength="1" stroke-linecap="round"/></svg>';
  const TONOS = { azul: ['var(--vc-azul)', 'var(--vc-azul-t)'], durazno: ['var(--vc-durazno)', 'var(--vc-durazno-t)'], menta: ['var(--vc-menta)', 'var(--vc-menta-t)'], lila: ['var(--vc-lila)', 'var(--vc-lila-t)'] };

  // servicios de ejemplo (genéricos, sin marcas) con su día de cobro y su importe mensual, sin moneda
  const SERVICIOS = [
    { id: 'almacenamiento', nombre: 'Almacenamiento', icono: 'nube', tono: 'azul', dia: 3, imp: 12 },
    { id: 'correo', nombre: 'Correo', icono: 'sobre', tono: 'durazno', dia: 7, imp: 6.5 },
    { id: 'diseno', nombre: 'Diseño', icono: 'lapiz', tono: 'lila', dia: 11, imp: 18 },
    { id: 'analitica', nombre: 'Analítica', icono: 'barras', tono: 'menta', dia: 15, imp: 28 },
    { id: 'respaldos', nombre: 'Respaldos', icono: 'escudo', tono: 'azul', dia: 19, imp: 9 },
    { id: 'hospedaje', nombre: 'Hospedaje', icono: 'servidor', tono: 'durazno', dia: 23, imp: 15 },
    { id: 'dominio', nombre: 'Dominio', icono: 'globo', tono: 'lila', dia: 28, imp: 4.5 },
  ];
  const MES = { nombre: 'Octubre', anio: 2026, dias: 31, primer: 3, hoy: 14 };

  /* =====================================================================
     Las cifras que ruedan
     Cada dígito es una columna recortada con una tira del 0 al 9; para
     cambiarlo solo se mueve la tira (--d). Los dígitos del final salen antes
     (--i), como un odómetro. Si el número cambia de largo, las columnas
     nuevas nacen en 0 y ruedan hasta su cifra.
     ===================================================================== */
  function Cifras(el) {
    let cols = [];
    function columna(ch) {
      const dig = /\d/.test(ch), c = document.createElement('span');
      c.dataset.tipo = dig ? 'd' : 's';
      if (dig) {
        c.className = 'vc-col';
        const t = document.createElement('span');
        t.className = 'vc-tira';
        t.innerHTML = '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>';
        c.appendChild(t);
      } else { c.className = 'vc-sep'; c.textContent = ch; }
      return c;
    }
    function pon(texto, anima) {
      const resto = Array.from(texto);
      el.setAttribute('role', 'text'); el.setAttribute('aria-label', texto);
      while (cols.length > resto.length) el.removeChild(cols.shift());
      while (cols.length < resto.length) {
        const c = columna(resto[resto.length - cols.length - 1]);
        el.insertBefore(c, el.firstChild); cols.unshift(c);
        if (anima && c.dataset.tipo === 'd') c.style.setProperty('--d', 0);
      }
      resto.forEach((ch, i) => {
        if (cols[i].dataset.tipo === (/\d/.test(ch) ? 'd' : 's')) return;
        const c = columna(ch);
        el.replaceChild(c, cols[i]); cols[i] = c;
        if (anima && c.dataset.tipo === 'd') c.style.setProperty('--d', 0);
      });
      if (anima) void el.offsetWidth;
      resto.forEach((ch, i) => {
        const c = cols[i];
        if (c.dataset.tipo === 'd') { c.style.setProperty('--i', resto.length - 1 - i); c.style.setProperty('--d', ch); }
        else if (c.textContent !== ch) c.textContent = ch;
      });
    }
    return { pon };
  }

  function Vencimientos(raiz, opc) {
    opc = Object.assign({ servicios: SERVICIOS, mes: MES, alCambiar: null }, opc || {});
    const q = s => raiz.querySelector(s);
    const tarjeta = q('.vc-tarjeta'), grid = q('[data-grid]'), lista = q('[data-lista]'), conm = q('[data-conm]');
    const totalEl = q('[data-total]'), etq = q('[data-etq]'), ahorroEl = q('[data-ahorro]'), ahorroN = q('[data-ahorro-n]');
    const btnDeshacer = q('[data-deshacer]'), deshacerN = q('[data-deshacer-n]');
    const segsEl = q('[data-segs]'), barraPie = q('[data-barra-pie]');
    const tip = q('[data-tip]'), tipNom = q('[data-tip-nom]'), tipImp = q('[data-tip-imp]'), tipDia = q('[data-tip-dia]');
    const aviso = q('[data-aviso]');
    const proxChip = q('[data-prox-chip]'), proxN = q('[data-prox-n]'), proxD = q('[data-prox-d]'), proxEl = q('[data-prox]');
    const M = opc.mes, S = opc.servicios.map(s => Object.assign({}, s));
    raiz.style.setProperty('--vc-muelle', MUELLE);
    q('[data-n-cobros]').textContent = S.length;
    q('.vc-mes').textContent = M.nombre; q('.vc-anio').textContent = M.anio;
    const impMax = Math.max(...S.map(s => s.imp));

    /* ── el estado ──────────────────────────────────────────────────── */
    let modo = 'mes';
    const cancelados = [];                                 // la pila de lo cancelado, para «Deshacer»
    let tam = { ancho: 100, alto: 76 };

    /* ── la cuadrícula del mes ──────────────────────────────────────── */
    const nCel = Math.ceil((M.primer + M.dias) / 7) * 7, previos = 30;       // los días ajenos del mes anterior terminan en 30
    const celdas = [];
    for (let i = 0; i < nCel; i++) {
      const d = i - M.primer + 1, dentro = d >= 1 && d <= M.dias;
      const c = document.createElement('div');
      c.className = 'vc-dia' + (dentro ? '' : ' es-ajeno') + (dentro && d === M.hoy ? ' es-hoy' : '');
      const num = dentro ? d : d < 1 ? previos + d : d - M.dias;
      c.innerHTML = '<span class="vc-num">' + num + '</span>';
      if (dentro && d === M.hoy) c.setAttribute('aria-label', 'Hoy, ' + d);
      grid.appendChild(c);
      celdas[d] = c;
    }
    const semanaDe = dia => Math.floor((dia - 1 + M.primer) / 7);
    const nSem = semanaDe(M.dias) + 1;

    /* ── un círculo y una fila por servicio ─────────────────────────── */
    S.forEach((s, i) => {
      const [c, ct] = TONOS[s.tono];
      s.est = 'activo'; s.celda = celdas[s.dia];
      s.celda.style.setProperty('--c', c); s.celda.style.setProperty('--ct', ct);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'vc-bola' + (s.dia < M.hoy ? ' es-pagado' : ''); b.style.cssText = '--c:' + c + ';--ct:' + ct + ';';
      b.innerHTML = ICONOS[s.icono] + TACHA;
      const hueco = document.createElement('i'); hueco.className = 'vc-hueco'; hueco.setAttribute('aria-hidden', 'true');
      s.celda.append(hueco, b);
      s.el = b;
      const li = document.createElement('li');
      li.innerHTML = '<button type="button" class="vc-fila" style="--c:' + c + ';--ct:' + ct + ';"><span class="vc-chip">' + ICONOS[s.icono] + '</span><span class="vc-nom">' + esc(s.nombre) + '</span><span class="vc-dd">día ' + s.dia + '</span><span class="vc-imp"></span></button>';
      lista.appendChild(li);
      s.fila = li.firstChild; s.impEl = li.querySelector('.vc-imp');
      s.y = 0; s.r = 0; s.vy = 0; s.vr = 0; s.fade = 0; s.rebotes = 0; s.tt = 0;
      // quién destaca a quién: el círculo, su día y su fila se encienden juntos
      const resalta = on => {
        [b, s.fila, s.celda].forEach(e => e.classList.toggle('es-resalta', on));
        if (on && s.est !== 'cancelado') muestraTip(s); else if (!on) ocultaTip();
      };
      b.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') resalta(true); });
      b.addEventListener('pointerleave', () => resalta(false));
      b.addEventListener('focus', () => resalta(true)); b.addEventListener('blur', () => resalta(false));
      s.fila.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') resalta(true); });
      s.fila.addEventListener('pointerleave', () => resalta(false));
      s.fila.addEventListener('focus', () => resalta(true)); s.fila.addEventListener('blur', () => resalta(false));
      b.addEventListener('click', () => cancela(s.id));
      s.fila.addEventListener('click', () => { if (s.est === 'activo') cancela(s.id); else if (s.est === 'cancelado' || s.est === 'cae' || s.est === 'tachado') restaura(s.id); });
    });
    const porId = id => S.find(s => s.id === id);

    /* ── la nota flotante ───────────────────────────────────────────── */
    const importeDe = s => modo === 'mes' ? s.imp : s.imp * 12;
    let sTip = null;                                       // el servicio al que apunta la nota
    function muestraTip(s) {
      sTip = s;
      tipNom.textContent = s.nombre;
      tipImp.textContent = fmt(importeDe(s)) + (modo === 'mes' ? ' al mes' : ' al año');
      tipDia.textContent = (s.dia < M.hoy ? 'Cobrado el día ' : s.dia === M.hoy ? 'Se cobra hoy, día ' : 'Se cobra el día ') + s.dia;
      tip.classList.add('es-visible');
      const rt = tarjeta.getBoundingClientRect(), rb = s.el.getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight;
      const x = lim(rb.left - rt.left + rb.width / 2 - w / 2, 8, rt.width - w - 8), y = rb.top - rt.top - h - 12;
      tip.style.setProperty('--px', x + 'px');
      tip.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      tip.style.setProperty('--flecha', (rb.left - rt.left + rb.width / 2 - x) + 'px');
    }
    function ocultaTip() { sTip = null; tip.classList.remove('es-visible'); }

    /* ── los importes, el total y el reparto por semanas ────────────── */
    const cifras = Cifras(totalEl);
    const activos = () => S.filter(s => s.est === 'activo' || s.est === 'vuelve');
    const totalMes = () => activos().reduce((a, s) => a + s.imp, 0);
    const ahorroAnual = () => S.filter(s => !(s.est === 'activo' || s.est === 'vuelve')).reduce((a, s) => a + s.imp * 12, 0);

    // las semanas: una barra repartida a lo que se cobra en cada una; la más cargada se enciende
    const segs = [];
    for (let w = 0; w < nSem; w++) {
      const e = document.createElement('div');
      e.className = 'vc-seg';
      e.innerHTML = '<span class="vc-seg-t"><i>S' + (w + 1) + '</i><em></em></span>';
      segsEl.appendChild(e);
      segs.push({ el: e, t: e.querySelector('em'), imp: -1 });
    }
    function pintaSemanas() {
      const a = new Array(nSem).fill(0);
      activos().forEach(s => { a[semanaDe(s.dia)] += s.imp; });
      const suma = a.reduce((x, y) => x + y, 0), mayor = suma > 0 ? a.indexOf(Math.max(...a)) : -1;
      segs.forEach((sg, w) => {
        sg.el.style.setProperty('--g', suma > 0 ? Math.max(a[w], suma * .105).toFixed(3) : 1);
        sg.el.classList.toggle('es-mayor', w === mayor);
        if (sg.imp !== a[w]) { sg.imp = a[w]; sg.t.textContent = fmt(a[w]); }
      });
      const txt = mayor < 0 ? 'Este mes no queda ningún cobro' : 'La semana ' + (mayor + 1) + ' es la más cargada';
      if (barraPie.textContent !== txt) {
        barraPie.textContent = txt;
        if (!quieto()) barraPie.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: MUELLE });
      }
      segsEl.setAttribute('aria-label', 'Cobros por semana: ' + a.map((x, w) => 'semana ' + (w + 1) + ', ' + fmt(x)).join('; '));
    }
    function pintaImportes(anima) {
      S.forEach((s, i) => {
        const t = fmt(importeDe(s));
        if (s.impEl.textContent === t) return;
        s.impEl.textContent = t;
        if (anima && !quieto()) s.impEl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: i * 30, easing: MUELLE, fill: 'backwards' });
        s.fila.setAttribute('aria-label', s.nombre + ', día ' + s.dia + ', ' + t + (modo === 'mes' ? ' al mes' : ' al año') + (s.est === 'activo' ? '. Pulsa para cancelar' : '. Cancelado, pulsa para restaurar'));
      });
    }
    // el próximo cobro desde hoy: el primer servicio activo con un día posterior
    let proxId = null;
    function pintaProx(anima) {
      const p = activos().filter(s => s.dia >= M.hoy).sort((a, b) => a.dia - b.dia)[0];
      const id = p ? p.id : '';
      if (id === proxId) return;
      proxId = id;
      const d = p ? p.dia - M.hoy : 0;
      proxN.textContent = p ? p.nombre : 'Sin más cobros este mes';
      proxD.textContent = p ? (d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días') : '—';
      proxChip.innerHTML = p ? ICONOS[p.icono] : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>';
      proxChip.style.cssText = p ? '--c:' + TONOS[p.tono][0] + ';--ct:' + TONOS[p.tono][1] + ';' : '--c: var(--vc-hondo); --ct: var(--vc-suave);';
      if (anima && !quieto()) {
        proxEl.animate([{ opacity: .2, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 560, easing: MUELLE });
        proxChip.animate([{ transform: 'scale(.5) rotate(-20deg)' }, { transform: 'none' }], { duration: 620, easing: MUELLE });
      }
    }
    function pintaTotal(anima) {
      const v = totalMes() * (modo === 'mes' ? 1 : 12);
      cifras.pon(fmt(v), anima);
      etq.textContent = modo === 'mes' ? 'Total al mes' : 'Total al año';
      const a = ahorroAnual();
      const visible = a > 0;
      if (visible) {
        const t = fmt(a);
        if (ahorroN.textContent !== t) { ahorroN.textContent = t; if (anima && !quieto()) ahorroN.animate([{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 600, easing: MUELLE }); }
      }
      ahorroEl.classList.toggle('es-visible', visible);
      q('[data-ahorros]').classList.toggle('hay', visible);
      const estaba = !btnDeshacer.hidden;
      btnDeshacer.hidden = !cancelados.length;
      if (cancelados.length) {
        const ultimo = porId(cancelados[cancelados.length - 1]).nombre;
        deshacerN.textContent = ' ' + ultimo; btnDeshacer.title = 'Deshacer: ' + ultimo;
        if (!estaba && anima && !quieto()) btnDeshacer.animate([{ opacity: 0, transform: 'translateX(-14px) scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 640, easing: MUELLE });
      }
      pintaSemanas(); pintaProx(anima);
      if (opc.alCambiar) opc.alCambiar({ modo, total: v, cancelados: cancelados.slice(), ahorro: a });
    }

    /* ── el tamaño de cada círculo: sale del importe y del modo ─────── */
    function tamaños() {
      const r = celdas[M.hoy].getBoundingClientRect();
      tam = { ancho: r.width, alto: r.height };
      const cm = Math.min(tam.ancho, tam.alto);
      S.forEach(s => {
        const f = Math.sqrt(s.imp / impMax);
        const d = cm * (modo === 'mes' ? .48 + .36 * f : .62 + .22 * f);
        s.el.style.setProperty('--k', (d / 76).toFixed(4));
      });
    }

    /* ── el conmutador mensual / anual ──────────────────────────────── */
    function ponModo(m, foco) {
      if (m === modo) return;
      modo = m;
      conm.dataset.modo = m;
      conm.querySelectorAll('button').forEach(b => { const on = b.dataset.modo === m; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; if (on && foco) b.focus(); });
      tamaños(); pintaImportes(true); pintaTotal(true);
      if (sTip) muestraTip(sTip);
      aviso.textContent = m === 'anio' ? 'Mostrando el total anual: ' + fmt(totalMes() * 12) : 'Mostrando el total mensual: ' + fmt(totalMes());
    }
    conm.querySelectorAll('button').forEach(b => {
      b.tabIndex = b.dataset.modo === modo ? 0 : -1;
      b.addEventListener('click', () => ponModo(b.dataset.modo));
      b.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); ponModo('anio', true); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); ponModo('mes', true); }
      });
    });

    /* ── cancelar: el trazo, la caída con rebote y el ahorro ────────── */
    // la física de los círculos (la caída y el salto de vuelta) corre con pasos fijos
    const fis = new Set();
    let raf = 0, ult = null, acc = 0;
    const G = 3400, PASO = 1 / 120;
    function pasoFis(s, h) {
      if (s.est === 'tachado') { s.tt += h; if (s.tt >= .36) empiezaCaida(s); return; }
      if (s.est === 'cae') {
        s.vy += G * h; s.y += s.vy * h; s.r += s.vr * h;
        if (s.y >= s.piso) {                               // el suelo es el borde de abajo de la cuadrícula
          s.y = s.piso;
          if (Math.abs(s.vy) < 380 || s.rebotes >= 3) s.est = 'apaga';
          else { s.vy = -s.vy * .5; s.vr *= .55; s.rebotes++; }
        }
      } else if (s.est === 'apaga') {
        s.fade += h / .26;
        if (s.fade >= 1) { s.est = 'cancelado'; s.el.classList.add('es-fuera'); s.el.classList.remove('es-fis', 'is-tachado'); fis.delete(s); s.celda.classList.add('es-cancelado'); }
      } else if (s.est === 'vuelve') {
        avanza(s.ry, h); avanza(s.rm, h); s.fade = Math.min(1, s.fade + h / .14);
        if (Math.abs(s.ry.x) < .15 && Math.abs(s.rm.x - 1) < .004 && Math.abs(s.ry.v) < 2 && s.fade >= 1) { s.est = 'activo'; fis.delete(s); s.el.classList.remove('es-fis'); s.el.style.removeProperty('--y'); s.el.style.removeProperty('--m'); s.el.style.opacity = ''; s.y = 0; }
      }
    }
    function pintaFis(s) {
      if (s.est === 'tachado') return;
      if (s.est === 'vuelve') { s.el.style.setProperty('--y', s.ry.x.toFixed(2) + 'px'); s.el.style.setProperty('--m', Math.max(0, s.rm.x).toFixed(4)); s.el.style.opacity = s.fade.toFixed(3); s.el.style.setProperty('--r', '0rad'); return; }
      s.el.style.setProperty('--y', s.y.toFixed(2) + 'px'); s.el.style.setProperty('--r', s.r.toFixed(4) + 'rad');
      if (s.est === 'apaga') { s.el.style.opacity = (1 - s.fade).toFixed(3); s.el.style.setProperty('--m', (1 - .3 * s.fade).toFixed(4)); }
    }
    function tick(ts) {
      raf = 0;
      if (ult == null) ult = ts;
      acc += Math.min(ts - ult, 100) / 1000; ult = ts;
      let pasos = 0;
      while (acc >= PASO && pasos < 14) { fis.forEach(s => pasoFis(s, PASO)); acc -= PASO; pasos++; }
      if (pasos === 14) acc = 0;
      fis.forEach(pintaFis);
      if (fis.size) raf = requestAnimationFrame(tick); else ult = null;
    }
    const despierta = () => { if (!raf) raf = requestAnimationFrame(tick); };

    function empiezaCaida(s) {
      // la distancia al suelo: del círculo al borde de abajo de la cuadrícula
      const rg = grid.getBoundingClientRect(), rb = s.el.getBoundingClientRect();
      s.piso = Math.max(30, rg.bottom + 4 - rb.bottom + (rb.height * (1 - 1) / 2));
      s.est = 'cae'; s.y = 0; s.vy = -360; s.vr = (S.indexOf(s) % 2 ? 1 : -1) * 2.6; s.r = 0; s.rebotes = 0; s.fade = 0;
      s.el.classList.add('es-fis'); s.el.style.setProperty('--h', 1); s.el.style.zIndex = 6;
      // el total baja mientras cae
      pintaTotal(true); pintaImportes(false);
      aviso.textContent = s.nombre + ' marcado para cancelar. Ahorras ' + fmt(ahorroAnual()) + ' al año.';
    }
    function cancela(id) {
      const s = porId(id);
      if (!s || s.est !== 'activo') return;
      ocultaTip();
      if (document.activeElement === s.el) s.fila.focus({ preventScroll: true });     // el círculo se va: el foco pasa a su fila
      s.est = 'tachado'; s.tt = 0; cancelados.push(id);
      s.el.classList.add('is-tachado'); s.fila.classList.add('es-cancelado');
      s.fila.setAttribute('aria-label', s.nombre + ' cancelado. Pulsa para restaurar');
      if (quieto()) {                                      // sin movimiento: se va y ya
        s.est = 'cancelado'; s.el.classList.add('es-fuera'); s.celda.classList.add('es-cancelado');
        pintaTotal(false); aviso.textContent = s.nombre + ' marcado para cancelar. Ahorras ' + fmt(ahorroAnual()) + ' al año.';
        return;
      }
      fis.add(s); despierta();
    }
    function restaura(id) {
      const s = porId(id);
      if (!s || s.est === 'activo' || s.est === 'vuelve') return;
      const i = cancelados.indexOf(id); if (i > -1) cancelados.splice(i, 1);
      s.fila.classList.remove('es-cancelado'); s.celda.classList.remove('es-cancelado');
      s.el.classList.remove('is-tachado', 'es-fuera');
      s.el.style.zIndex = '';
      if (quieto()) { s.est = 'activo'; s.el.style.cssText = s.el.style.cssText.replace(/--y:[^;]*;?|--m:[^;]*;?|--r:[^;]*;?/g, ''); s.el.style.opacity = ''; pintaTotal(false); pintaImportes(false); aviso.textContent = s.nombre + ' restaurado.'; return; }
      // un salto: sube desde abajo con un resorte que se pasa y vuelve
      const desdeY = s.est === 'cae' || s.est === 'apaga' ? s.y : 52;
      s.est = 'vuelve'; s.ry = resorte(desdeY, 240, 15.5); s.ry.meta = 0; s.ry.v = -520; s.rm = resorte(.4, 280, 17); s.rm.meta = 1; s.fade = 0;
      s.tt = 0; s.el.classList.add('es-fis'); fis.add(s); despierta();
      pintaTotal(true); pintaImportes(false);
      aviso.textContent = s.nombre + ' restaurado.';
    }
    btnDeshacer.addEventListener('click', () => { if (cancelados.length) restaura(cancelados[cancelados.length - 1]); });

    /* ── arranque ───────────────────────────────────────────────────── */
    tamaños();
    S.forEach(s => { s.el.setAttribute('aria-label', s.nombre + ', día ' + s.dia + '. Pulsa para marcar para cancelar'); });
    pintaImportes(false);
    pintaTotal(false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { tamaños(); });
    let tR = 0;
    addEventListener('resize', () => { clearTimeout(tR); tR = setTimeout(tamaños, 80); });

    return {
      modo: m => ponModo(m), cancela, restaura, deshace: () => { if (cancelados.length) restaura(cancelados[cancelados.length - 1]); },
      get total() { return totalMes() * (modo === 'mes' ? 1 : 12); },
    };
  }

  window.Vencimientos = Vencimientos;
  document.querySelectorAll('[data-vencimientos]').forEach(e => { e.vencimientos = Vencimientos(e); });
})();
