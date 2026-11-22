/* =====================================================================
   Itinerario · Moxen
   Una hoja de ruta trimestral por carriles, hecha para que se sienta como
   un objeto: cada barra es una pieza pastel que se agarra y se mueve con
   SNAP a semanas —sigue al puntero por saltos de semana con su propio
   resorte, se inclina un poco al arrancar y se asienta con un rebote—, se
   estira desde sus asas y no pasa por encima de su vecina (la goma se
   tensa). Una etiqueta oscura la acompaña con las fechas, que ruedan como
   un odómetro. El avance de cada barra se llena con un resorte y, al llegar
   al 100 %, aparece un ✓ que salta y un brillo cruza la barra. Los hitos
   son banderines que caen con rebote al aparecer, se arrastran por semanas
   y ondean al moverse. «Mes» y «Trimestre» cambian la escala del tiempo con
   un resorte (todo se estira a la vez) y la línea de «hoy» queda pegada al
   borde cuando se sale de la vista.

   Se monta sobre [data-itinerario] (ver index.html):

     const it = Itinerario(document.querySelector('[data-itinerario]'), {
       semanas: 13,          // semanas del trimestre
       inicio: 5,            // días desde el 1 del primer mes hasta el primer lunes
       meses: ['abr', 'may', 'jun', 'jul'],  diasMes: [30, 31, 30, 31],
       mesesLargos: ['Abril', 'Mayo', 'Junio', 'Julio'],
       hoy: 5.72,            // «hoy», en semanas desde el inicio
       visibles: 5,          // semanas a la vista en la escala «Mes»
       muelle: [330, 26],    // rigidez y amortiguación de las barras
       carriles: [{ id: 'dis', nombre: 'Diseño' }, …],   // el color sale del orden (0–3)
       barras: [['id', 'carril', fila, 'Nombre', inicio, largo, avance 0–1], …],
       hitos:  [['id', 'carril', semana, 'Nombre'], …],
       alCambiar: (tipo, dato) => {},   // 'barra' | 'hito' | 'avance' | 'zoom'
     });
     it.zoom('mes');   it.elige('pro');   it.mueve('pro', 7);   it.avance('pro', 1);

   Teclado: cada barra y cada hito se enfocan con Tab. ← → mueven una semana;
   Mayús + ← → estiran o encogen el final; Alt + Mayús + ← → mueven el inicio;
   + y − suben o bajan el avance de 10 en 10. El avance también se arrastra en el
   inspector (flechas en el riel) y «Completar» lo lleva al 100 %. Con las flechas
   de los meses, o arrastrando el fondo, se recorre el tiempo en «Mes».
   El color de cada carril son variables de itinerario.css (--it-c0 … --it-c3).
   Solo se anima transform y opacity (más el ancho de la barra, que es la escala);
   sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  /* ── resortes ─────────────────────────────────────────────────────── */
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, h) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; }
  const paso2 = (r, dt) => { const h = dt / 2; avanza(r, h); avanza(r, h); };
  const reposa = (r, e) => Math.abs(r.meta - r.x) < (e || .001) && Math.abs(r.v) < (e || .001) * 12;
  function h(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }

  /* ── los datos de ejemplo ─────────────────────────────────────────── */
  const CARRILES = [{ id: 'dis', nombre: 'Diseño' }, { id: 'des', nombre: 'Desarrollo' }, { id: 'con', nombre: 'Contenido' }, { id: 'lan', nombre: 'Lanzamiento' }];
  const BARRAS = [
    ['inv', 'dis', 0, 'Investigación', 0, 3, 1],
    ['pro', 'dis', 1, 'Prototipo', 2, 5, .7],
    ['sis', 'dis', 0, 'Sistema visual', 5, 4, .35],
    ['bas', 'des', 0, 'Base técnica', 1, 5, .9],
    ['int', 'des', 1, 'Interfaz', 4, 5, .55],
    ['pag', 'des', 0, 'Pagos', 7, 4, .1],
    ['voz', 'con', 0, 'Guía de voz', 1, 3, 1],
    ['ayu', 'con', 0, 'Textos de ayuda', 6, 5, .4],
    ['pla', 'lan', 0, 'Plan de salida', 3, 4, .6],
    ['pru', 'lan', 0, 'Pruebas', 8, 3, .2],
    ['sal', 'lan', 1, 'Salida', 10, 3, 0],
  ];
  const HITOS = [['bri', 'con', 3, 'Guía publicada'], ['pto', 'dis', 6, 'Prototipo listo'], ['bet', 'des', 9, 'Beta cerrada'], ['pub', 'lan', 11, 'Salida pública']];

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.5 12.5 4.3 4.3L18.5 8"/></svg>';
  const BANDERA = '<svg viewBox="0 0 26 34" aria-hidden="true"><path class="it-polo" d="M4 3v30"/><path class="it-pano" d="M4 4h17l-4.5 5.6L21 15.2H4z"/></svg>';
  const FLAG_T = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20.5V4M6 5h11.5l-3 4 3 4H6"/></svg>';

  function Itinerario(escena, opciones) {
    const o = Object.assign({
      semanas: 13, inicio: 5, hoy: 5.72, visibles: 5, muelle: [330, 26],
      meses: ['abr', 'may', 'jun', 'jul'], diasMes: [30, 31, 30, 31], mesesLargos: ['Abril', 'Mayo', 'Junio', 'Julio'],
      carriles: CARRILES, barras: BARRAS, hitos: HITOS, alCambiar: null,
    }, opciones);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const q = s => escena.querySelector(s);
    const vista = q('[data-vista]'), mundo = q('[data-mundo]'), lado = q('[data-lado]'), capaHoy = q('[data-hoy-capa]'), etqHoy = q('[data-hoy-etq]');
    const seg = q('[data-seg]'), mesNav = q('[data-mes-nav]'), mesNom = q('[data-mes-nom]'), pie = q('.it-pie');
    const selNom = q('[data-sel-nom]'), selPt = q('[data-sel-pt]'), selA = q('[data-sel-a]'), selB = q('[data-sel-b]'), selN = q('[data-sel-n]');
    const riel = q('[data-riel]'), avN = q('[data-av-n]'), btnCompleta = q('[data-completa]'), btnCompletaT = q('[data-completa-t]'), vivo = q('[data-vivo]');
    const SEM = o.semanas;
    let visibles = o.visibles;
    const curva = 'cubic-bezier(.22, 1, .36, 1)';

    /* ── medidas del dibujo (px) ─────────────────────────────────────── */
    const AX = 52, TIRA = 50, FILA = 44, ALTO_B = 34, PAD = 7, GAP = 8;

    /* ── fechas: sin Date, a mano ────────────────────────────────────── */
    function mesDeDia(d) { let m = 0; while (m < o.diasMes.length - 1 && d >= o.diasMes[m]) { d -= o.diasMes[m]; m++; } return { m, d: d + 1 }; }
    const dia = d => { const r = mesDeDia(d); return r.d + ' ' + o.meses[r.m]; };
    const lunes = w => dia(o.inicio + 7 * w);
    const viernes = w => dia(o.inicio + 7 * w + 4);
    const hoyTxt = 'Hoy · ' + dia(Math.floor(o.inicio + 7 * o.hoy));

    /* ── carriles y su altura ────────────────────────────────────────── */
    const carriles = o.carriles.map((c, i) => ({ id: c.id, nombre: c.nombre, tono: i % 4, filas: 1, top: 0, alto: 0, barras: [], m: 0 }));
    const porId = id => carriles.find(c => c.id === id);
    o.barras.forEach(b => { const c = porId(b[1]); c.filas = Math.max(c.filas, b[2] + 1); });
    let y = AX + TIRA + 4;
    carriles.forEach(c => { c.top = y; c.alto = c.filas * FILA + 2 * PAD; y += c.alto + GAP; });
    const ALTO = y - GAP + 6;
    mundo.style.height = ALTO + 'px'; lado.style.height = ALTO + 'px';

    /* ── el eje, la rejilla y las bandas ─────────────────────────────── */
    const semanasLunes = Array.from({ length: SEM }, (_, w) => mesDeDia(o.inicio + 7 * w));
    const eje = h('div', 'it-eje'); eje.setAttribute('aria-hidden', 'true');
    const mesesBloque = [];
    semanasLunes.forEach((s, w) => {
      const sm = h('div', 'it-semn'); sm.style.left = 'calc(var(--sem) * ' + w + ')';
      const peq = h('small', null, 'S' + (w + 1)), num = h('span', null, String(s.d)), em = h('em', null, o.meses[s.m]);
      sm.append(num, em, peq); eje.append(sm);
      let b = mesesBloque[mesesBloque.length - 1];
      if (!b || b.m !== s.m) { b = { m: s.m, ini: w, n: 0 }; mesesBloque.push(b); }
      b.n++;
    });
    mesesBloque.forEach((b, i) => {
      const e = h('div', 'it-mesn'); e.style.left = 'calc(var(--sem) * ' + b.ini + ')'; e.style.width = 'calc(var(--sem) * ' + b.n + ')';
      b.txt = h('b', null, o.mesesLargos[b.m]); e.append(b.txt); eje.append(e);
      if (i > 0) { const l = h('i', 'it-mesl'); l.style.left = 'calc(var(--sem) * ' + b.ini + ')'; eje.append(l); }
    });
    mundo.append(eje);
    const hoyLinea = h('i', 'it-hoy-l'); hoyLinea.setAttribute('aria-hidden', 'true'); hoyLinea.style.setProperty('--hoy', o.hoy); mundo.append(hoyLinea);
    const rejilla = h('div', 'it-rejilla'); rejilla.setAttribute('aria-hidden', 'true'); mundo.append(rejilla);
    carriles.forEach(c => {
      const b = h('div', 'it-banda it-t' + c.tono); b.style.top = c.top + 'px'; b.style.height = c.alto + 'px'; b.setAttribute('aria-hidden', 'true'); mundo.append(b);
      // y su etiqueta a la izquierda
      const e = h('div', 'it-etiqueta it-t' + c.tono); e.style.top = c.top + 'px'; e.style.height = c.alto + 'px';
      const pt = h('i', 'it-pt'); const tx = h('div'); tx.append(h('p', 'it-car-nom', c.nombre));
      c.meta = h('p', 'it-car-meta'); c.rielEl = h('div', 'it-car-riel'); c.rielEl.append(h('i'));
      tx.append(c.meta, c.rielEl); e.append(pt, tx); lado.append(e);
    });
    const th = h('div', 'it-hitos-t'); th.style.top = AX + 'px'; th.style.height = TIRA + 'px'; th.innerHTML = FLAG_T + '<span>Hitos</span>'; lado.append(th);

    /* ── las barras ──────────────────────────────────────────────────── */
    const [K, C] = o.muelle;
    const barras = o.barras.map((d, i) => {
      const c = porId(d[1]);
      const b = { id: d[0], c, fila: d[2], nombre: d[3], a: resorte(d[4], K, C), l: resorte(d[5], K, C), pm: d[6], antes: d[6] < 1 ? d[6] : .6, hecho: d[6] >= 1,
        p: resorte(0, 110, 17), lift: resorte(0, 260, 22), e: resorte(0, 120, 17), ok: resorte(0, 300, 15), goma: 0, rot: 0, vis: { a: -1, l: -1, p: -1, g: 99, lift: -1, rot: 99, ok: -1 }, ret: .12 + i * .075, entra: false, corta: null };
      const el = h('div', 'it-barra it-entra it-t' + c.tono); b.el = el;
      el.tabIndex = 0; el.setAttribute('role', 'group'); el.setAttribute('aria-roledescription', 'barra de tarea'); el.dataset.id = b.id;
      el.style.top = (c.top + PAD + b.fila * FILA + (FILA - ALTO_B) / 2) + 'px';
      b.prog = h('i', 'it-prog'); b.brillo = h('i', 'it-brillo');
      b.asaI = h('i', 'it-asa it-asa-i'); b.asaD = h('i', 'it-asa it-asa-d');
      b.okEl = h('span', 'it-ok'); b.okEl.innerHTML = CHECK;
      b.nom = h('span', 'it-nom', b.nombre); b.pct = h('span', 'it-pct');
      b.cont = h('span', 'it-cont'); b.cont.append(b.okEl, b.nom);
      el.append(b.prog, b.brillo, b.asaI, b.cont, b.pct, b.asaD);
      mundo.append(el); c.barras.push(b);
      engancha(b);
      return b;
    });

    /* ── los hitos ───────────────────────────────────────────────────── */
    const hitos = o.hitos.map((d, i) => {
      const c = porId(d[1]);
      const hi = { id: d[0], c, nombre: d[3], w: resorte(d[2], K * .8, C), sw: resorte(0, 150, 7), caida: resorte(60, 190, 11), esc: resorte(.6, 220, 12), ret: .5 + i * .16, vis: { w: -1, sw: 99, caida: -1 }, antes: 0 };
      const el = h('div', 'it-hito it-t' + c.tono); hi.el = el; el.dataset.id = hi.id;
      hi.bt = h('button', 'it-bandera'); hi.bt.type = 'button'; hi.bt.innerHTML = BANDERA + '<span class="it-hito-n"></span>'; hi.bt.querySelector('.it-hito-n').textContent = hi.nombre;
      hi.bt.style.opacity = 0;
      el.append(hi.bt); mundo.append(el);
      enganchaHito(hi);
      return hi;
    });

    /* la etiqueta con las fechas que acompaña a lo que se mueve */
    const etq = h('div', 'it-etq'); etq.setAttribute('aria-hidden', 'true');
    const eA = h('span', 'it-rc'), eB = h('span', 'it-rc'), eN = h('span', 'it-rc it-dur'), sepE = h('span', 'it-sep', '→');
    [eA, eB, eN].forEach(e => e.append(h('i', null, '')));
    etq.append(eA, sepE, eB, eN); mundo.append(etq);
    let etqDe = null, etqT = 0;

    /* ── el cilindro que rueda: el texto viejo sale y el nuevo entra ─── */
    function rueda(cont, txt, sube) {
      const viejo = cont.lastElementChild;
      if (viejo && viejo.textContent === txt) return;
      const nuevo = h('i', null, txt); cont.append(nuevo);
      if (!viejo) return;
      if (reduce) { viejo.remove(); return; }
      const d = sube ? 1 : -1;
      nuevo.animate([{ transform: 'translateY(' + 100 * d + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: curva });
      viejo.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + -100 * d + '%)', opacity: 0 }], { duration: 380, easing: curva, fill: 'forwards' }).onfinish = () => viejo.remove();
    }
    const fin = b => b.a.meta + b.l.meta;

    /* ── la escala: «Trimestre» o «Mes» ─────────────────────────────── */
    let modo = 'trimestre', anchoVista = 900, semTri = 70, semMes = 180;
    const sem = resorte(70, 150, 21), izq = resorte(0, 150, 21);
    let mesVista = -1;
    function mide() {
      anchoVista = vista.clientWidth || 900;
      visibles = anchoVista < 520 ? 3 : o.visibles;
      semTri = anchoVista / SEM; semMes = anchoVista / visibles;
      sem.meta = modo === 'mes' ? semMes : semTri;
      if (reduce || !listo) sem.x = sem.meta;
      riel.style.setProperty('--rw', riel.clientWidth + 'px');
    }
    function mesIni(m) { return mesesBloque[m] ? mesesBloque[m].ini : 0; }
    function mesDeCentro() {
      const centro = izq.meta + visibles / 2; let m = 0;
      mesesBloque.forEach((b, i) => { if (b.ini <= centro) m = i; });
      return m;
    }
    function irMes(m, suave) {
      m = lim(m, 0, mesesBloque.length - 1);
      izq.meta = lim(mesIni(m), 0, SEM - visibles);
      if (suave === false || reduce) { izq.x = izq.meta; izq.v = 0; }
      pintaMes();
    }
    function pintaMes() {
      const m = modo === 'mes' ? mesDeCentro() : mesDeDia0();
      if (m === mesVista) return;
      rueda(mesNom, o.mesesLargos[mesesBloque[m].m], m > mesVista);
      mesVista = m;
    }
    const mesDeDia0 = () => mesDeCentro();
    function zoom(que, suave) {
      if (que !== 'mes' && que !== 'trimestre') return;
      modo = que; escena.dataset.modo = que;
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.zoom === que)));
      sem.meta = que === 'mes' ? semMes : semTri;
      if (que === 'mes') irMes(mesDeDiaHoy(), suave); else { izq.meta = 0; if (suave === false || reduce) { izq.x = 0; izq.v = 0; } pintaMes(); }
      if (suave === false || reduce) { sem.x = sem.meta; sem.v = 0; }
      if (o.alCambiar) o.alCambiar('zoom', que);
    }
    function mesDeDiaHoy() { let m = 0; mesesBloque.forEach((b, i) => { if (b.ini <= Math.floor(o.hoy)) m = i; }); return m; }
    seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => zoom(b.dataset.zoom)));
    seg.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); const n = modo === 'mes' ? 'trimestre' : 'mes'; zoom(n); seg.querySelector('[data-zoom="' + n + '"]').focus();
    });
    mesNav.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => { if (modo === 'mes') irMes(mesDeCentro() + (+b.dataset.mes)); }));
    q('[data-hoy]').addEventListener('click', () => {
      if (modo === 'mes') irMes(mesDeDiaHoy());
      hoyPulso = 1;
    });
    let hoyPulso = 0;

    /* arrastrar el fondo recorre el tiempo (en «Mes») y la rueda también */
    let pan = null;
    vista.addEventListener('pointerdown', e => {
      if (e.button > 0 || modo !== 'mes' || e.target.closest('.it-barra, .it-bandera')) return;
      pan = { id: e.pointerId, x0: e.clientX, i0: izq.x, v: 0, ult: e.clientX, tu: performance.now() };
      vista.classList.add('it-pan');
      try { vista.setPointerCapture(e.pointerId); } catch (_) { /* no pasa nada */ }
    });
    vista.addEventListener('pointermove', e => {
      if (!pan || e.pointerId !== pan.id) return;
      const v = lim(pan.i0 - (e.clientX - pan.x0) / sem.x, 0, SEM - visibles);
      const ahora = performance.now(), t = Math.max(8, ahora - pan.tu);
      pan.v = pan.v * .5 + (-(e.clientX - pan.ult) / sem.x / t * 1000) * .5; pan.ult = e.clientX; pan.tu = ahora;
      izq.x = izq.meta = v; izq.v = 0; pintaMes();
    });
    const sueltaPan = e => {
      if (!pan || (e && e.pointerId !== pan.id)) return;
      izq.meta = lim(izq.x + pan.v * .3, 0, SEM - visibles); pan = null; vista.classList.remove('it-pan'); pintaMes();
    };
    vista.addEventListener('pointerup', sueltaPan); vista.addEventListener('pointercancel', sueltaPan);
    vista.addEventListener('wheel', e => {
      if (modo !== 'mes' || e.ctrlKey) return;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      if (!dx) return;
      e.preventDefault(); izq.meta = lim(izq.meta + dx / sem.x, 0, SEM - visibles); pintaMes();
    }, { passive: false });

    /* ── selección e inspector ───────────────────────────────────────── */
    let sel = null;
    const rv = resorte(0, 200, 20);
    function elige(b, foco) {
      if (typeof b === 'string') b = barras.find(x => x.id === b);
      if (!b || sel === b) return;
      if (sel) sel.el.classList.remove('it-elegida');
      sel = b; b.el.classList.add('it-elegida');
      pie.className = 'it-pie it-t' + b.c.tono;
      selNom.textContent = b.nombre;
      pintaInspector(); pintaAvance();
      if (foco) b.el.focus({ preventScroll: true });
    }
    function pintaInspector() {
      if (!sel) return;
      const b = sel, a = b.a.meta, l = b.l.meta;
      rueda(selA, lunes(a), a >= (+selA.dataset.v || 0)); selA.dataset.v = a;
      rueda(selB, viernes(a + l - 1), a + l >= (+selB.dataset.v || 0)); selB.dataset.v = a + l;
      rueda(selN, l + (l === 1 ? ' semana' : ' semanas'), l >= (+selN.dataset.v || 0)); selN.dataset.v = l;
    }
    function pintaAvance() {
      if (!sel) return;
      rv.meta = sel.pm;
      const pct = Math.round(sel.pm * 100);
      riel.setAttribute('aria-valuenow', pct); riel.setAttribute('aria-valuetext', pct + ' %');
      btnCompletaT.textContent = sel.pm >= 1 ? 'Reabrir' : 'Completar';
    }
    /* el avance: se llena con su resorte; al llegar al 100 % salta el ✓ y pasa un brillo */
    function avance(b, v, desdeUsuario) {
      if (typeof b === 'string') b = barras.find(x => x.id === b);
      v = lim(Math.round(v * 20) / 20, 0, 1);
      if (v === b.pm) return;
      const antes = b.pm; b.pm = v; b.p.meta = v;
      if (v >= 1 && !b.hecho) {
        b.hecho = true; b.ok.meta = 1; b.ok.x = 0; b.ok.v = 0; b.antes = antes < 1 ? antes : b.antes;
        if (!reduce) { b.brillo.classList.remove('it-pasa'); void b.brillo.offsetWidth; b.brillo.classList.add('it-pasa'); }
        anuncia(b.nombre + ' completada');
      } else if (v < 1 && b.hecho) { b.hecho = false; b.ok.meta = 0; }
      if (b === sel) pintaAvance();
      pintaPct(b); meta(b.c);
      if (o.alCambiar && desdeUsuario !== false) o.alCambiar('avance', { id: b.id, avance: v });
    }
    function pintaPct(b) { b.pct.textContent = Math.round(b.pm * 100) + '%'; describe(b); }
    function describe(b) {
      b.el.setAttribute('aria-label', b.nombre + ', ' + b.c.nombre + ', del ' + lunes(b.a.meta) + ' al ' + viernes(b.a.meta + b.l.meta - 1) + ', ' + Math.round(b.pm * 100) + ' % de avance');
    }
    function meta(c) {
      const n = c.barras.length, tot = c.barras.reduce((s, b) => s + b.l.meta, 0), av = c.barras.reduce((s, b) => s + b.pm * b.l.meta, 0) / (tot || 1);
      c.meta.textContent = n + (n === 1 ? ' tarea' : ' tareas') + ' · ' + Math.round(av * 100) + ' %';
    }
    function anuncia(t) { vivo.textContent = ''; setTimeout(() => { vivo.textContent = t; }, 30); }
    btnCompleta.addEventListener('click', () => { if (sel) avance(sel, sel.pm >= 1 ? sel.antes : 1); });
    /* el riel del inspector */
    let arrR = null;
    const valorRiel = e => { const r = riel.getBoundingClientRect(); return lim((e.clientX - r.left) / r.width, 0, 1); };
    riel.addEventListener('pointerdown', e => {
      if (!sel || e.button > 0) return;
      arrR = e.pointerId; try { riel.setPointerCapture(e.pointerId); } catch (_) { /* no pasa nada */ }
      avance(sel, valorRiel(e)); bola.meta = 1.25;
    });
    riel.addEventListener('pointermove', e => { if (arrR === e.pointerId && sel) avance(sel, valorRiel(e)); });
    const sueltaR = e => { if (arrR === e.pointerId) { arrR = null; bola.meta = 1; } };
    riel.addEventListener('pointerup', sueltaR); riel.addEventListener('pointercancel', sueltaR);
    riel.addEventListener('keydown', e => {
      if (!sel) return;
      const d = { ArrowRight: .05, ArrowUp: .05, ArrowLeft: -.05, ArrowDown: -.05, PageUp: .25, PageDown: -.25 }[e.key];
      if (e.key === 'Home') avance(sel, 0); else if (e.key === 'End') avance(sel, 1); else if (d) avance(sel, sel.pm + d); else return;
      e.preventDefault();
    });
    const bola = resorte(1, 300, 16);

    /* ── mover y estirar barras ──────────────────────────────────────── */
    function limites(b) {
      let mn = 0, mx = SEM;
      b.c.barras.forEach(x => {
        if (x === b || x.fila !== b.fila) return;
        if (x.a.meta >= fin(b) - .01) mx = Math.min(mx, x.a.meta);
        else if (fin(x) <= b.a.meta + .01) mn = Math.max(mn, fin(x));
      });
      return { mn, mx };
    }
    function muestraEtq(que, ms) {
      etqDe = que; etqT = ms;
      etq.classList.toggle('it-uno', !!que.w);
      pintaEtq(); etqVisible = 1;
    }
    let etqVisible = 0;
    function pintaEtq() {
      if (!etqDe) return;
      if (etqDe.w) { rueda(eA, lunes(etqDe.w.meta), etqDe.w.meta >= (+eA.dataset.v || 0)); eA.dataset.v = etqDe.w.meta; sepE.hidden = eB.hidden = eN.hidden = true; return; }
      sepE.hidden = eB.hidden = eN.hidden = false;
      const a = etqDe.a.meta, l = etqDe.l.meta;
      rueda(eA, lunes(a), a >= (+eA.dataset.v || 0)); eA.dataset.v = a;
      rueda(eB, viernes(a + l - 1), a + l >= (+eB.dataset.v || 0)); eB.dataset.v = a + l;
      rueda(eN, l + ' sem', l >= (+eN.dataset.v || 0)); eN.dataset.v = l;
    }
    function cambio(b) {
      pintaInspector(); describe(b); meta(b.c);
      if (b === sel) pintaInspector();
      if (etqDe === b) pintaEtq();
      if (o.alCambiar) o.alCambiar('barra', { id: b.id, inicio: b.a.meta, largo: b.l.meta });
    }
    function fijaBarra(b, ini, largo) {
      ini = Math.round(ini); largo = Math.round(largo);
      if (ini === b.a.meta && largo === b.l.meta) return false;
      b.a.meta = ini; b.l.meta = largo; cambio(b); return true;
    }
    function engancha(b) {
      const el = b.el;
      let g = null, lm = null;
      el.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        const asa = e.target.closest('.it-asa');
        g = { id: e.pointerId, modo: asa ? (asa === b.asaI ? 'izq' : 'der') : 'mover', x0: e.clientX, a0: b.a.meta, l0: b.l.meta, mov: false };
        lm = limites(b);
        elige(b);
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* no pasa nada */ }
      });
      el.addEventListener('pointermove', e => {
        if (!g || e.pointerId !== g.id) return;
        if (!g.mov) { if (Math.abs(e.clientX - g.x0) < 3) return; g.mov = true; el.classList.add('it-mueve'); b.lift.meta = g.modo === 'mover' ? 1 : .55; muestraEtq(b, 1e9); }
        const dw = (e.clientX - g.x0) / sem.x;
        if (g.modo === 'mover') {
          const libre = g.a0 + dw, obj = lim(Math.round(libre), lm.mn, lm.mx - g.l0);
          b.a.meta = obj; b.goma = lim((libre - obj) * sem.x * .32, -16, 16);
        } else if (g.modo === 'der') {
          const libre = g.a0 + g.l0 + dw, f = lim(Math.round(libre), g.a0 + 1, lm.mx);
          b.l.meta = f - g.a0; b.goma = 0;
        } else {
          const libre = g.a0 + dw, ini = lim(Math.round(libre), lm.mn, g.a0 + g.l0 - 1);
          b.a.meta = ini; b.l.meta = g.a0 + g.l0 - ini; b.goma = 0;
        }
        cambio(b);
      });
      const suelta = e => {
        if (!g || (e && e.pointerId !== g.id)) return;
        const hubo = g.mov; g = null; el.classList.remove('it-mueve'); b.lift.meta = 0; b.goma = 0;
        if (hubo) { etqT = 900; anuncia(b.nombre + ': del ' + lunes(b.a.meta) + ' al ' + viernes(b.a.meta + b.l.meta - 1)); }
      };
      el.addEventListener('pointerup', suelta); el.addEventListener('pointercancel', suelta);
      el.addEventListener('focus', () => { elige(b); });
      el.addEventListener('keydown', e => {
        const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        lm = limites(b);
        if (dx) {
          e.preventDefault();
          let ok = false;
          if (e.shiftKey && e.altKey) { const ini = lim(b.a.meta + dx, lm.mn, fin(b) - 1); ok = fijaBarra(b, ini, fin(b) - ini); }
          else if (e.shiftKey) { const f = lim(fin(b) + dx, b.a.meta + 1, lm.mx); ok = fijaBarra(b, b.a.meta, f - b.a.meta); }
          else { const ini = lim(b.a.meta + dx, lm.mn, lm.mx - b.l.meta); ok = fijaBarra(b, ini, b.l.meta); }
          if (!ok) { b.goma = dx * 10; b.golpe = 1; }
          muestraEtq(b, 1300); return;
        }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); avance(b, b.pm + .1); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); avance(b, b.pm - .1); }
        else if (e.key === 'Escape') el.blur();
      });
      pintaPct(b);
    }

    /* ── mover hitos ─────────────────────────────────────────────────── */
    function enganchaHito(hi) {
      const bt = hi.bt; let g = null;
      bt.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        g = { id: e.pointerId, x0: e.clientX, w0: hi.w.meta, mov: false };
        try { bt.setPointerCapture(e.pointerId); } catch (_) { /* no pasa nada */ }
      });
      bt.addEventListener('pointermove', e => {
        if (!g || e.pointerId !== g.id) return;
        if (!g.mov) { if (Math.abs(e.clientX - g.x0) < 3) return; g.mov = true; hi.el.classList.add('it-mueve'); hi.esc.meta = 1.12; muestraEtq(hi, 1e9); }
        hi.w.meta = lim(Math.round(g.w0 + (e.clientX - g.x0) / sem.x), 0, SEM - 1);
        pintaEtq(); cambioHito(hi);
      });
      const suelta = e => {
        if (!g || (e && e.pointerId !== g.id)) return;
        const hubo = g.mov; g = null; hi.el.classList.remove('it-mueve'); hi.esc.meta = 1;
        if (hubo) { etqT = 900; anuncia(hi.nombre + ': ' + lunes(hi.w.meta)); }
      };
      bt.addEventListener('pointerup', suelta); bt.addEventListener('pointercancel', suelta);
      bt.addEventListener('keydown', e => {
        const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!dx) return;
        e.preventDefault(); hi.w.meta = lim(hi.w.meta + dx, 0, SEM - 1); muestraEtq(hi, 1300); cambioHito(hi);
      });
      describeHito(hi);
    }
    function describeHito(hi) { hi.bt.setAttribute('aria-label', 'Hito: ' + hi.nombre + ', ' + lunes(hi.w.meta)); }
    function cambioHito(hi) { describeHito(hi); hi.el.classList.toggle('it-izq', hi.w.meta >= SEM - 1); if (o.alCambiar) o.alCambiar('hito', { id: hi.id, semana: hi.w.meta }); }

    /* ── el cuadro ───────────────────────────────────────────────────── */
    let antes = 0, t = 0, listo = false, uSem = -1, uScroll = 1e9, uAncho = null, uEstr = null;
    const set = (el, k, v) => el.style.setProperty(k, v);
    function cuadro(ts) {
      const dt = lim((ts - (antes || ts)) / 1000, 0, 1 / 30); antes = ts; t += dt;

      // la escala y el desplazamiento
      if (reduce) { sem.x = sem.meta; izq.x = izq.meta; sem.v = izq.v = 0; } else { paso2(sem, dt); if (!pan) paso2(izq, dt); }
      if (Math.abs(sem.x - uSem) > .01) {
        uSem = sem.x; set(mundo, '--sem', sem.x.toFixed(2) + 'px'); mundo.style.width = (SEM * sem.x).toFixed(1) + 'px';
        const ancho = sem.x > 118; if (ancho !== uAncho) { uAncho = ancho; mundo.classList.toggle('it-ancho', ancho); }
        const estr = sem.x < 44; if (estr !== uEstr) { uEstr = estr; mundo.classList.toggle('it-estrecho', estr); }
      }
      const px = izq.x * sem.x;
      if (Math.abs(px - uScroll) > .02 || Math.abs(sem.x - uSem) > 0) {
        uScroll = px; mundo.style.transform = 'translate3d(' + (-px).toFixed(1) + 'px,0,0)';
        mesesBloque.forEach(m => {
          const base = m.ini * sem.x, w = m.n * sem.x, tw = m.txt.offsetWidth || 50;
          m.txt.style.transform = 'translate3d(' + lim(px - base, 0, Math.max(0, w - tw - 14)).toFixed(1) + 'px,0,0)';
        });
      }

      // las barras
      barras.forEach(b => {
        const aparece = t >= b.ret;
        if (aparece && !b.entra) { b.entra = true; b.e.meta = 1; setTimeout(() => { b.p.meta = b.pm; if (b.hecho) { b.ok.meta = 1; } }, reduce ? 0 : 380); }
        if (reduce) { b.a.x = b.a.meta; b.l.x = b.l.meta; b.p.x = b.p.meta; b.lift.x = b.lift.meta; b.e.x = b.e.meta; b.ok.x = b.ok.meta; b.a.v = b.l.v = 0; }
        else { paso2(b.a, dt); paso2(b.l, dt); paso2(b.p, dt); paso2(b.lift, dt); paso2(b.e, dt); paso2(b.ok, dt); }
        const v = b.vis;
        if (Math.abs(b.a.x - v.a) > .0005) { v.a = b.a.x; set(b.el, '--a', b.a.x.toFixed(4)); }
        if (Math.abs(b.l.x - v.l) > .0005) { v.l = b.l.x; set(b.el, '--l', b.l.x.toFixed(4)); }
        // el nombre se queda a la vista aunque la barra empiece fuera
        const ancho = b.l.x * sem.x - 6, dsp = lim(px - (b.a.x * sem.x + 3), 0, Math.max(0, ancho - 150));
        if (Math.abs(dsp - (b.dsp || 0)) > .3) { b.dsp = dsp; b.cont.style.transform = dsp ? 'translate3d(' + dsp.toFixed(1) + 'px,0,0)' : ''; }
        const corta = b.l.x * sem.x < 104; if (corta !== b.corta) { b.corta = corta; b.el.classList.toggle('it-corta', corta); }
        if (Math.abs(b.p.x - v.p) > .0005) { v.p = b.p.x; set(b.el, '--p', lim(b.p.x, 0, 1).toFixed(4)); }
        if (Math.abs(b.lift.x - v.lift) > .001) { v.lift = b.lift.x; set(b.el, '--lift', b.lift.x.toFixed(3)); }
        if (Math.abs(b.ok.x - v.ok) > .001) { v.ok = b.ok.x; set(b.el, '--ok', Math.max(0, b.ok.x).toFixed(3)); }
        if (b.entra && b.el.classList.contains('it-entra')) { set(b.el, '--e', lim(b.e.x, 0, 1).toFixed(3)); if (b.e.x > .995 && Math.abs(b.e.v) < .02) b.el.classList.remove('it-entra'); }
        else if (!b.entra) set(b.el, '--e', 0);
        // la goma y la inclinación: la barra se ladea con la velocidad y se estira hacia el puntero
        b.golpe = (b.golpe || 0) * .86;
        const rot = reduce ? 0 : lim(-b.a.v * .45 - (b.l.v * .0), -4.5, 4.5);
        const g = b.goma + (b.golpe > .02 ? b.goma * 0 : 0);
        if (Math.abs(rot - v.rot) > .02 || Math.abs(g - v.g) > .2) { v.rot = rot; v.g = g; set(b.el, '--rot', rot.toFixed(2) + 'deg'); set(b.el, '--g', g.toFixed(1) + 'px'); }
        if (b.goma && !b.el.classList.contains('it-mueve')) b.goma *= .8;
      });
      carriles.forEach(c => {
        let tot = 0, av = 0; c.barras.forEach(b => { tot += b.l.x; av += lim(b.p.x, 0, 1) * b.l.x; });
        const m = tot ? av / tot : 0;
        if (Math.abs(m - c.m) > .002) { c.m = m; c.rielEl.firstChild.style.setProperty('--m', m.toFixed(3)); c.rielEl.style.setProperty('--m', m.toFixed(3)); }
      });

      // los hitos
      hitos.forEach(hi => {
        const aparece = t >= hi.ret;
        if (aparece && !hi.entra) { hi.entra = true; hi.caida.meta = 0; hi.esc.meta = 1; }
        if (reduce) { hi.w.x = hi.w.meta; hi.caida.x = hi.caida.meta; hi.esc.x = hi.esc.meta; hi.w.v = 0; hi.sw.x = 0; }
        else {
          paso2(hi.w, dt); paso2(hi.caida, dt); paso2(hi.esc, dt);
          hi.sw.meta = lim(-hi.w.v * 5, -24, 24); paso2(hi.sw, dt);
        }
        const v = hi.vis;
        if (Math.abs(hi.w.x - v.w) > .0005) { v.w = hi.w.x; set(hi.el, '--w', hi.w.x.toFixed(4)); }
        if (Math.abs(hi.sw.x - v.sw) > .05) { v.sw = hi.sw.x; set(hi.bt, '--sw', hi.sw.x.toFixed(2) + 'deg'); }
        if (Math.abs(hi.caida.x - v.caida) > .1 || hi.esc.x !== v.esc) { v.caida = hi.caida.x; v.esc = hi.esc.x; set(hi.bt, '--caida', hi.caida.x.toFixed(1)); set(hi.bt, '--esc', Math.max(.01, hi.esc.x).toFixed(3)); set(hi.bt, '--op', lim(1 - hi.caida.x / 40, 0, 1).toFixed(2)); hi.bt.style.opacity = ''; }
      });

      // la etiqueta de fechas
      if (etqDe) {
        const e = etqDe, esHito = !!e.w;
        const cx = esHito ? e.w.x * sem.x : (e.a.x + e.l.x / 2) * sem.x;
        const top = esHito ? AX - 26 : parseFloat(e.el.style.top) - 40;
        const ew = etq.offsetWidth || 150;
        const x = lim(cx - ew / 2, 6, SEM * sem.x - ew - 6);
        etq.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)';
        etq.style.setProperty('--tx', (cx - x - ew / 2).toFixed(1) + 'px');
        if (etqT < 1e8) { etqT -= dt * 1000; if (etqT <= 0) { etqVisible = 0; } }
        const objetivo = etqVisible; const o0 = +etq.dataset.o || 0, o1 = o0 + (objetivo - o0) * (1 - Math.exp(-dt * (reduce ? 999 : 18)));
        etq.dataset.o = o1.toFixed(3); etq.style.opacity = o1.toFixed(3);
        if (o1 < .01 && !objetivo) { etqDe = null; etq.style.opacity = 0; }
      }

      // la línea de hoy: pegada al borde si se sale de la vista
      const hx = o.hoy * sem.x - px, ew = etqHoy.offsetWidth || 80;
      let txt = hoyTxt, ex;
      if (hx < 8) { txt = '‹ Hoy'; ex = 6; } else if (hx > anchoVista - 8) { txt = 'Hoy ›'; ex = anchoVista - ew - 6; }
      else ex = lim(hx - ew / 2, 6, anchoVista - ew - 6);
      if (etqHoy.textContent !== txt) etqHoy.textContent = txt;
      const pulso = hoyPulso ? 1 + Math.sin(hoyPulso * 14) * .08 * hoyPulso : 1;
      if (hoyPulso) { hoyPulso = Math.max(0, hoyPulso - dt * 1.3); }
      etqHoy.style.transform = 'translate3d(' + ex.toFixed(1) + 'px,0,0) scale(' + pulso.toFixed(3) + ')';
      hoyLinea.style.transform = pulso !== 1 ? 'scaleX(' + (1 + (pulso - 1) * 4).toFixed(2) + ')' : '';

      // el riel del inspector
      if (reduce) { rv.x = rv.meta; bola.x = bola.meta; } else { paso2(rv, dt); paso2(bola, dt); }
      set(riel, '--v', lim(rv.x, 0, 1).toFixed(4)); set(riel, '--bs', bola.x.toFixed(3));
      const pc = String(Math.round(lim(rv.x, 0, 1) * 100));
      const celda = avN.lastElementChild; if (celda && celda.textContent !== pc) celda.textContent = pc;

      requestAnimationFrame(cuadro);
    }
    // la barra elegida respira un poco al elegirla desde el teclado: el foco ya la marca

    /* ── arranque ────────────────────────────────────────────────────── */
    function arranca() {
      mide();
      sem.x = sem.meta = semTri; escena.dataset.modo = 'trimestre';
      uSem = -1;
      barras.forEach(b => { describe(b); });
      carriles.forEach(c => meta(c));
      carriles.forEach(c => { c.rielEl.style.setProperty('--m', 0); });
      hitos.forEach(hi => { hi.el.classList.toggle('it-izq', hi.w.meta >= SEM - 1); describeHito(hi); });
      mesVista = -1; pintaMes();
      elige('pro');
      if (anchoVista < 520) zoom('mes', false);
      listo = true;
      requestAnimationFrame(cuadro);
    }
    addEventListener('resize', () => { mide(); }, { passive: true });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(arranca);

    return {
      zoom, elige: b => elige(b, true), avance: (b, v) => avance(b, v),
      mueve: (id, ini) => { const b = barras.find(x => x.id === id); if (!b) return; const l = limites(b); fijaBarra(b, lim(ini, l.mn, l.mx - b.l.meta), b.l.meta); },
    };
  }

  window.Itinerario = Itinerario;
})();
