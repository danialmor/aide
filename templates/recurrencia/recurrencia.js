/* =====================================================================
   Recurrencia · Moxen
   Un editor de repeticiones («cada semana», «el primer lunes») que dibuja
   sus próximas fechas en un calendario.

   · Eliges la frecuencia en un conmutador (diaria, semanal, mensual, anual) y
     debajo aparecen los controles propios de cada una: píldoras de días,
     ruedas («primer», «lunes»), pasos de día y un reloj de dos manecillas.
   · Cada cambio reescribe a la vista, letra a letra, una frase en lenguaje
     natural («Se repite cada semana, los lunes y miércoles…») y la expresión
     técnica en una ficha de código (`0 9 * * 1,3`), campo por campo.
   · El calendario enciende en ola las próximas fechas (las cinco primeras, fuertes;
     las demás, suaves) y una lista muestra esas cinco, que se reordenan con FLIP:
     las que siguen se deslizan, las nuevas entran y las que sobran se van.
   · Arrastrar el reloj cambia la hora de todas a la vez: las cifras de cada
     fila ruedan en cascada. La manecilla de los minutos pinta una cuña.
   · «Guardar» se vuelve «Guardando…» y luego ✓ dibujado; «Restablecer» devuelve
     todo a como empezó, con los mismos resortes.
   · Teclado: el conmutador y los meses son grupos de radios (flechas), las
     píldoras y los atajos son botones, las ruedas responden a ↑ ↓ y las
     manecillas del reloj son deslizadores (flechas, Re Pág, Inicio y Fin).
     Un aviso hablado cuenta la frase y la próxima fecha.

   Cómo se monta (ver index.html):
     <main data-recurrencia> … </main>
     const r = Recurrencia(document.querySelector('[data-recurrencia]'), {
       hoy: [2026, 9, 14],        // año, mes (0 = enero) y día de «hoy»: fijo, para que el ejemplo no cambie
       ahora: [8, 15],            // hoy cuenta solo si el aviso es más tarde que esta hora
       regla: { freq: 'mensual' } // estado de partida (ver REGLA0 más abajo)
       alCambiar: ({ regla, cron, proximas }) => {},
     });
     r.estado();  r.pon({ freq: 'anual', mes: 4 });  r.restablecer();  r.guardar();

   Qué se personaliza:
   · Los colores están al inicio del CSS: --rc-acento es lo elegido, --rc-menta
     las fechas «de después» y --rc-coral el error. ?tema=oscuro los redefine.
   · Los resortes están en las curvas --rc-muelle y --rc-rueda (que este script
     rellena con linear()) y en MUELLE (las manecillas).
   · La expresión sigue la forma de cron de cinco campos (min hora día mes semana),
     con `1#1` («el primer lunes») y `1L` («el último lunes») como en los planificadores
     más usados. Las repeticiones con intervalo en semanas o días no se ofrecen
     porque cron no puede expresarlas con exactitud.
   · Sin dependencias, sin Date para animar (solo para calcular fechas con valores fijos)
     y sin azar: la página y el vídeo coinciden.
   ===================================================================== */
(function () {
  'use strict';

  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const escapa = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NS = 'http://www.w3.org/2000/svg';

  // un resorte: x es el valor, meta a dónde va, k la rigidez y c la amortiguación
  const resorte = (x, k, c) => ({ x, v: 0, meta: x, k, c });
  function avanza(r, h) { r.v += (r.k * (r.meta - r.x) - r.c * r.v) * h; r.x += r.v * h; }
  const reposo = r => Math.abs(r.v) < .02 && Math.abs(r.meta - r.x) < .02;
  const MUELLE = { manecilla: { k: 420, c: 30 } };      // las manecillas: firmes, para seguir al dedo

  // un resorte convertido en curva CSS linear(), para lo que se mueve con CSS o con WAAPI
  function muelle(k, c) {
    if (!(window.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)'))) return 'cubic-bezier(.34, 1.4, .64, 1)';
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

  /* =====================================================================
     Los nombres y las fechas
     Todo el cálculo va por «número de día» (días desde 1970 en UTC): sin
     horarios de verano ni zonas, y sin leer nunca el reloj del equipo.
     ===================================================================== */
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DIAS_PL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const ORD = ['primer', 'segundo', 'tercer', 'cuarto', 'último'];
  const CADA = [1, 2, 3, 4, 6];                        // cada cuántos meses (los que cron expresa con */n)
  const CADA_TXT = ['mes', '2 meses', '3 meses', '4 meses', '6 meses'];

  const dnDe = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 864e5);
  const fechaDe = dn => { const f = new Date(dn * 864e5); return { y: f.getUTCFullYear(), m: f.getUTCMonth(), d: f.getUTCDate(), w: (f.getUTCDay() + 6) % 7 }; };
  const diasMes = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lista = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
  const dos = n => (n < 10 ? '0' : '') + n;

  // el estado de partida: lunes y miércoles, a las 9:00
  const REGLA0 = () => ({
    freq: 'semanal',
    dias: [true, false, true, false, false, false, false],     // lunes … domingo
    sinFin: false,                                             // diaria: omitir sábado y domingo
    cadaMes: 1, modoMes: 'nth', diaMes: 15, ord: 0, diaSem: 0, // mensual: «el día 15» o «el primer lunes»
    mes: 2, diaAnual: 15,                                      // anual: «el 15 de marzo»
    h: 9, min: 0, pm: false,
  });
  const copia = r => Object.assign({}, r, { dias: r.dias.slice() });

  /* =====================================================================
     Las cifras que ruedan: cada dígito es una columna con una tira (en blanco,
     0 … 9) y solo se mueve la tira. El patrón dice qué es cada posición:
     'dd:dd' son cuatro dígitos con dos puntos en medio.
     ===================================================================== */
  function Cifras(el, patron) {
    el.classList.add('rc-cif');
    el.textContent = '';
    const cols = Array.from(patron).map(t => {
      const c = document.createElement('span');
      c.setAttribute('aria-hidden', 'true');
      if (t === 'd') { c.className = 'rc-col'; c.innerHTML = '<span class="rc-tira">&nbsp;<br>0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</span>'; }
      else { c.className = 'rc-sep'; c.textContent = t; }
      el.appendChild(c);
      return c;
    });
    // `texto` mide lo mismo que el patrón; un espacio es una columna vacía; `i` retrasa la tanda (cascada entre filas)
    function pon(texto, i, quieto) {
      el.setAttribute('role', 'text');
      el.setAttribute('aria-label', texto.trim());
      if (quieto) el.classList.add('rc-quieta'); else void el.offsetWidth;
      Array.from(texto).forEach((ch, k) => {
        const c = cols[k];
        if (c.className !== 'rc-col') return;
        if (ch === ' ') c.setAttribute('data-vacia', ''); else c.removeAttribute('data-vacia');
        c.style.setProperty('--d', ch === ' ' ? 0 : +ch + 1);
        c.style.setProperty('--i', (i || 0) + (texto.length - 1 - k));
      });
      if (quieto) { void el.offsetWidth; el.classList.remove('rc-quieta'); }
    }
    return { pon };
  }

  /* =====================================================================
     La burbuja que viaja: una pieza detrás de las opciones que se desliza con
     resorte (CSS) hasta la elegida
     ===================================================================== */
  function Burbuja(cont, bub) {
    function a(el, quieto) {
      if (!el) return;
      const c = cont.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (!r.width) return;
      if (quieto) bub.classList.add('is-quieta');
      bub.style.width = r.width + 'px';
      bub.style.height = r.height + 'px';
      bub.style.transform = 'translate(' + (r.left - c.left) + 'px, ' + (r.top - c.top) + 'px)';
      if (quieto) { void bub.offsetWidth; bub.classList.remove('is-quieta'); }
    }
    return { a };
  }

  /* =====================================================================
     El componente
     ===================================================================== */
  function Recurrencia(raiz, opciones) {
    const o = Object.assign({ hoy: [2026, 9, 14], ahora: [8, 15], regla: null, alCambiar: null }, opciones);
    const $ = s => raiz.querySelector(s), $$ = s => Array.from(raiz.querySelectorAll(s));
    const reduce = () => reduceMQ.matches;
    const HOY = dnDe(o.hoy[0], o.hoy[1], o.hoy[2]), AHORA = o.ahora[0] * 60 + o.ahora[1];
    const REGLA_INICIAL = Object.assign(REGLA0(), o.regla);
    let R = copia(REGLA_INICIAL);
    const nombre0 = $('.rc-nombre').value;

    raiz.style.setProperty('--rc-muelle', muelle(230, 16));
    raiz.style.setProperty('--rc-rueda', muelle(210, 19));
    const CURVA_FLIP = muelle(250, 23);

    const frasEl = $('[data-frase]'), cronEl = $('[data-cron]'), listaEl = $('[data-lista]'), vacioEl = $('[data-vacio]'),
      rejillaEl = $('[data-rejilla]'), mesTxt = $('[data-mes-t]'), estadoEl = $('[data-estado-t]'), vivo = $('[data-vivo]'),
      btnGuardar = $('[data-guardar]'), btnCopiar = $('[data-copiar]'), digitalEl = $('[data-digital]'), panel = $('[data-panel]'),
      cuna = $('[data-cuna]'), dial = $('[data-dial]');

    const relojes = new Set();
    const luego = (fn, ms) => { const id = setTimeout(() => { relojes.delete(id); fn(); }, ms); relojes.add(id); return id; };
    const olvida = () => { relojes.forEach(clearTimeout); relojes.clear(); };
    let avisoId = 0;
    const avisa = s => { clearTimeout(avisoId); avisoId = setTimeout(() => { vivo.textContent = ''; vivo.textContent = s; }, 700); };

    /* ── la regla: cuándo cae cada fecha ─────────────────────────────── */
    const h24 = () => (R.h % 12) + (R.pm ? 12 : 0);
    const horaTxt = () => R.h + ':' + dos(R.min);
    const ampmTxt = () => R.pm ? 'p. m.' : 'a. m.';
    const valida = dn => dn > HOY || (dn === HOY && h24() * 60 + R.min > AHORA);

    function coincide(f) {
      switch (R.freq) {
        case 'diaria': return !R.sinFin || f.w < 5;
        case 'semanal': return R.dias[f.w];
        case 'mensual': {
          if (f.m % R.cadaMes) return false;                 // cron: */n en el campo del mes cuenta desde enero
          const dm = diasMes(f.y, f.m);
          if (R.modoMes === 'dia') return f.d === Math.min(R.diaMes, dm);
          if (f.w !== R.diaSem) return false;
          return R.ord < 4 ? Math.ceil(f.d / 7) === R.ord + 1 : f.d + 7 > dm;
        }
        default: return f.m === R.mes && f.d === Math.min(R.diaAnual, diasMes(f.y, f.m));
      }
    }
    const ocurre = dn => valida(dn) && coincide(fechaDe(dn));
    function proximas(n) {
      const out = [];
      for (let dn = HOY; dn < HOY + 3000 && out.length < n; dn++) if (ocurre(dn)) out.push(dn);
      return out;
    }

    // la expresión de cinco campos: minuto, hora, día del mes, mes y día de la semana
    function cron() {
      let dom = '*', mon = '*', dow = '*';
      if (R.freq === 'diaria') dow = R.sinFin ? '1-5' : '*';
      else if (R.freq === 'semanal') {
        const n = R.dias.map((v, i) => v ? (i + 1) % 7 : -1).filter(v => v >= 0).sort((a, b) => a - b);
        if (n.length === 7) dow = '*';
        else {
          const partes = [];
          for (let i = 0; i < n.length;) {
            let j = i;
            while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
            if (j - i >= 2) partes.push(n[i] + '-' + n[j]); else for (let k = i; k <= j; k++) partes.push(String(n[k]));
            i = j + 1;
          }
          dow = partes.join(',');
        }
      } else if (R.freq === 'mensual') {
        mon = R.cadaMes > 1 ? '*/' + R.cadaMes : '*';
        if (R.modoMes === 'dia') dom = String(R.diaMes);
        else dow = (R.diaSem + 1) % 7 + (R.ord < 4 ? '#' + (R.ord + 1) : 'L');
      } else { dom = String(R.diaAnual); mon = String(R.mes + 1); }
      return [String(R.min), String(h24()), dom, mon, dow];
    }
    const CRON_ET = ['min', 'hora', 'día', 'mes', 'sem'];

    // la frase: trozos [texto, resaltado]; la cola (la hora) se trata aparte para no reescribirla al mover el reloj
    function frase() {
      const seg = [['Se repite ', 0]];
      const sel = R.dias.map((v, i) => v ? i : -1).filter(i => i >= 0), k = sel.join('');
      if (R.freq === 'diaria') seg.push([R.sinFin ? 'de lunes a viernes' : 'todos los días', 1]);
      else if (R.freq === 'semanal') {
        if (sel.length === 7) seg.push(['todos los días', 1]);
        else if (k === '01234') seg.push(['de lunes a viernes', 1]);
        else if (k === '56') seg.push(['los fines de semana', 1]);
        else if (sel.length === 1) seg.push(['cada ' + DIAS[sel[0]], 1]);
        else seg.push(['cada semana', 1], [', ', 0], ['los\u00A0' + lista(sel.map(i => DIAS_PL[i])), 1]);
      } else if (R.freq === 'mensual') {
        seg.push([R.modoMes === 'dia' ? 'el día ' + R.diaMes : 'el ' + ORD[R.ord] + ' ' + DIAS[R.diaSem], 1]);
        if (R.cadaMes === 1) seg.push([' de ', 0], ['cada mes', 1]); else seg.push([', ', 0], ['cada ' + R.cadaMes + ' meses', 1]);
        if (R.modoMes === 'dia' && R.diaMes > 28) seg.push([' (o el último día)', 0]);
      } else seg.push(['el ' + R.diaAnual + ' de ' + MESES[R.mes], 1], [' de ', 0], ['cada año', 1]);
      // espacios duros: «a las 9:00 a. m.» no se parte entre líneas
      const cola = [[',\u00A0a\u00A0' + (R.h === 1 ? 'la' : 'las') + '\u00A0', 0], [horaTxt() + '\u00A0' + ampmTxt().replace(' ', '\u00A0'), 1]];
      if (!/\.$/.test(ampmTxt())) cola.push(['.', 0]);
      const plano = [];
      seg.forEach(([t, e]) => Array.from(t).forEach(c => plano.push({ c, e, t: false })));
      cola.forEach(([t, e]) => Array.from(t).forEach(c => plano.push({ c, e, t: true })));
      return plano;
    }

    /* =====================================================================
       La frase que se escribe sola: borra lo que ya no coincide y teclea lo
       nuevo (nunca empieza de cero), sin detenerse si cambia a mitad de camino
       ===================================================================== */
    const Maquina = (function () {
      let objetivo = [], actual = [], activo = false, ult = 0, aT = 0, aB = 0, tic = false;
      const igual = (a, b) => a.c === b.c && a.e === b.e && a.t === b.t;
      function pinta() {
        let h = '', i = 0;
        while (i < actual.length) {
          let j = i, s = '';
          const e = actual[i].e, t = actual[i].t;
          while (j < actual.length && actual[j].e === e && actual[j].t === t) { s += escapa(actual[j].c); j++; }
          const cl = t && tic ? ' class="rc-tic"' : '';
          h += e ? '<b' + cl + '>' + s + '</b>' : (cl ? '<span' + cl + '>' + s + '</span>' : s);
          i = j;
        }
        frasEl.innerHTML = h + '<i class="rc-caret"></i>';
        frasEl.classList.toggle('is-escribe', activo);
      }
      function paso(ts) {
        const dt = ult ? Math.min(60, ts - ult) : 16;
        ult = ts;
        let p = 0;
        while (p < actual.length && p < objetivo.length && igual(actual[p], objetivo[p])) p++;
        if (actual.length > p) { aB += dt * .24; const q = Math.floor(aB); aB -= q; actual.length = Math.max(p, actual.length - q); }
        else if (actual.length < objetivo.length) { aT += dt * .062; const q = Math.floor(aT); aT -= q; for (let k = 0; k < q && actual.length < objetivo.length; k++) actual.push(objetivo[actual.length]); }
        else { activo = false; ult = 0; pinta(); return; }
        pinta();
        requestAnimationFrame(paso);
      }
      return {
        pon(nuevo, quieto) {
          const completo = !activo && actual.length === objetivo.length;
          const cuerpoIgual = nuevo.filter(x => !x.t).length === actual.filter(x => !x.t).length &&
            nuevo.every((x, i) => x.t || (actual[i] && igual(actual[i], x)));
          const colaIgual = completo && nuevo.length === actual.length && nuevo.every((x, i) => igual(actual[i], x));
          objetivo = nuevo;
          if (quieto || reduce()) { actual = nuevo.slice(); activo = false; tic = false; pinta(); return; }
          if (colaIgual) return;
          if (completo && cuerpoIgual) { actual = nuevo.slice(); tic = true; pinta(); tic = false; return; }   // solo cambió la hora: se cambia en el sitio
          if (!activo) { activo = true; ult = 0; requestAnimationFrame(paso); }
        },
      };
    })();

    /* =====================================================================
       La ficha de código: cinco campos, y destella el que cambió
       ===================================================================== */
    const camposCron = CRON_ET.map(et => {
      const c = document.createElement('span');
      c.className = 'rc-cf';
      c.innerHTML = '<span class="rc-cf-v"></span><small>' + et + '</small>';
      cronEl.appendChild(c);
      return { c, v: c.firstChild, txt: '' };
    });
    function pintaCron(quieto) {
      const campos = cron();
      campos.forEach((t, i) => {
        const f = camposCron[i];
        if (f.txt === t) return;
        const habia = f.txt !== '';
        f.txt = t; f.v.textContent = t;
        if (habia && !quieto && !reduce()) { f.c.classList.remove('is-cambio'); void f.c.offsetWidth; f.c.classList.add('is-cambio'); }
      });
      cronEl.setAttribute('aria-label', 'Expresión de repetición: ' + campos.join(' '));
      return campos.join(' ');
    }

    /* =====================================================================
       La hora: cifras grandes y el reloj
       ===================================================================== */
    const horaStr = () => (R.h < 10 ? ' ' : '') + R.h + ':' + dos(R.min);
    const digital = Cifras(digitalEl, 'dd:dd');
    const ampmEl = $('[data-ampm]'), ampmB = Burbuja(ampmEl, ampmEl.querySelector('.rc-bub'));

    // el reloj: marcas, cuña de los minutos y dos manecillas con resorte
    const gMarcas = $('[data-marcas]'), marcas = [];
    for (let i = 0; i < 60; i++) {
      const l = document.createElementNS(NS, 'line'), a = i * 6 * Math.PI / 180, h = i % 5 === 0, r1 = h ? 70 : 74, r2 = 80;
      l.setAttribute('x1', (Math.sin(a) * r1).toFixed(2)); l.setAttribute('y1', (-Math.cos(a) * r1).toFixed(2));
      l.setAttribute('x2', (Math.sin(a) * r2).toFixed(2)); l.setAttribute('y2', (-Math.cos(a) * r2).toFixed(2));
      if (h) l.setAttribute('class', 'is-h');
      gMarcas.appendChild(l); marcas.push(l);
    }
    const manH = $('[data-man="h"]'), manM = $('[data-man="m"]');
    const aH = resorte(0, MUELLE.manecilla.k, MUELLE.manecilla.c), aM = resorte(0, MUELLE.manecilla.k, MUELLE.manecilla.c);
    const angH = () => (R.h % 12) * 30 + R.min * .5, angM = () => R.min * 6;
    const corto = (r, deg) => r.x + ((deg - r.x) % 360 + 540) % 360 - 180;       // el camino más corto, sin dar la vuelta entera
    let animReloj = 0;
    function pintaReloj() {
      manH.setAttribute('transform', 'rotate(' + aH.x.toFixed(2) + ')');
      manM.setAttribute('transform', 'rotate(' + aM.x.toFixed(2) + ')');
      const a = ((aM.x % 360) + 360) % 360;
      if (a < .6) cuna.setAttribute('d', '');
      else {
        const rad = a * Math.PI / 180, R0 = 80;
        cuna.setAttribute('d', 'M0 0 L0 ' + (-R0) + ' A' + R0 + ' ' + R0 + ' 0 ' + (a > 180 ? 1 : 0) + ' 1 ' + (Math.sin(rad) * R0).toFixed(2) + ' ' + (-Math.cos(rad) * R0).toFixed(2) + ' Z');
      }
    }
    let ultR = 0;
    function cicloReloj(ts) {
      const dt = ultR ? Math.min(.05, (ts - ultR) / 1000) : 1 / 60;
      ultR = ts;
      avanza(aH, dt); avanza(aM, dt);
      pintaReloj();
      if (reposo(aH) && reposo(aM)) { aH.x = aH.meta; aM.x = aM.meta; aH.v = aM.v = 0; pintaReloj(); animReloj = 0; ultR = 0; return; }
      animReloj = requestAnimationFrame(cicloReloj);
    }
    function mueveReloj(quieto) {
      aH.meta = corto(aH, angH()); aM.meta = corto(aM, angM());
      if (quieto || reduce()) { aH.x = aH.meta; aM.x = aM.meta; aH.v = aM.v = 0; pintaReloj(); return; }
      if (!animReloj) animReloj = requestAnimationFrame(cicloReloj);
    }
    function pintaHora(quieto) {
      digital.pon(horaStr(), 0, quieto);
      marcas.forEach((l, k) => l.classList.toggle('is-tic', k === (R.h % 12) * 5 || k === R.min));
      manH.setAttribute('aria-valuenow', R.h); manH.setAttribute('aria-valuetext', R.h + ' ' + ampmTxt());
      manM.setAttribute('aria-valuenow', R.min); manM.setAttribute('aria-valuetext', R.min + ' minutos');
      $$('[data-pm]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.pm === (R.pm ? 1 : 0))));
      ampmB.a(ampmEl.querySelector('[aria-checked="true"]'), quieto);
      mueveReloj(quieto);
    }

    // arrastrar: la manecilla más cercana al dedo sigue su ángulo y se ajusta a la hora o a los cinco minutos
    let agarra = null;
    const enDial = e => { const r = dial.getBoundingClientRect(), k = 180 / r.width; return { x: (e.clientX - r.left - r.width / 2) * k, y: (e.clientY - r.top - r.height / 2) * k }; };
    const puntaDe = (a, r) => ({ x: Math.sin(a * Math.PI / 180) * r, y: -Math.cos(a * Math.PI / 180) * r });
    function sigue(e) {
      const p = enDial(e);
      let ang = Math.atan2(p.x, -p.y) * 180 / Math.PI; if (ang < 0) ang += 360;
      if (agarra === 'h') {
        const h = Math.round(ang / 30) % 12 || 12;
        if (h !== R.h) { R.h = h; cambia({ solo: 'hora' }); }
      } else {
        const m = (Math.round(ang / 30) * 5) % 60;
        if (m !== R.min) { R.min = m; cambia({ solo: 'hora' }); }
      }
    }
    dial.addEventListener('pointerdown', e => {
      if (e.button) return;
      const p = enDial(e), th = puntaDe(aH.meta, 42), tm = puntaDe(aM.meta, 64);
      const dh = Math.hypot(p.x - th.x, p.y - th.y), dm = Math.hypot(p.x - tm.x, p.y - tm.y);
      agarra = Math.hypot(p.x, p.y) < 30 ? 'h' : (dh < dm * .9 ? 'h' : 'm');
      dial.setPointerCapture(e.pointerId);
      dial.classList.add('is-arrastre');
      manH.querySelector('.rc-asa').classList.toggle('is-ag', agarra === 'h');
      manM.querySelector('.rc-asa').classList.toggle('is-ag', agarra === 'm');
      sigue(e);
      e.preventDefault();
    });
    dial.addEventListener('pointermove', e => { if (agarra) sigue(e); });
    const suelta = () => { if (!agarra) return; agarra = null; dial.classList.remove('is-arrastre'); };
    dial.addEventListener('pointerup', suelta);
    dial.addEventListener('pointercancel', suelta);
    // teclado: las manecillas son deslizadores
    manH.addEventListener('keydown', e => {
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 3, PageDown: -3 }[e.key];
      let h = R.h;
      if (d) h = ((R.h - 1 + d) % 12 + 12) % 12 + 1; else if (e.key === 'Home') h = 1; else if (e.key === 'End') h = 12; else return;
      e.preventDefault();
      if (h !== R.h) { R.h = h; cambia({ solo: 'hora' }); }
    });
    manM.addEventListener('keydown', e => {
      const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 15, PageDown: -15 }[e.key];
      let m = R.min;
      if (d) m = ((R.min + d) % 60 + 60) % 60; else if (e.key === 'Home') m = 0; else if (e.key === 'End') m = 55; else return;
      e.preventDefault();
      if (m !== R.min) { R.min = m; cambia({ solo: 'hora' }); }
    });
    $$('[data-pm]').forEach(b => b.addEventListener('click', () => { const pm = b.dataset.pm === '1'; if (pm !== R.pm) { R.pm = pm; cambia({ solo: 'hora' }); } }));
    ampmEl.addEventListener('keydown', e => {
      if (!/^Arrow/.test(e.key)) return;
      e.preventDefault();
      R.pm = !R.pm; cambia({ solo: 'hora' });
      ampmEl.querySelector('[aria-checked="true"]').focus();
    });

    /* =====================================================================
       La frecuencia y sus controles
       ===================================================================== */
    const seg = $('[data-seg]'), segB = Burbuja(seg, seg.querySelector('.rc-bub')), segBs = $$('[data-freq]');
    const ctls = $$('[data-ctl]');
    const pildoras = $$('[data-dias] .rc-pil'), fija = $('[data-fija]'), capDias = $('[data-cap-dias]'), swSinFin = $('[data-sin-fin]'), atajos = $$('[data-atajo]');
    const ATAJOS = { habiles: [1, 1, 1, 1, 1, 0, 0], finde: [0, 0, 0, 0, 0, 1, 1], todos: [1, 1, 1, 1, 1, 1, 1] };
    const mesesEl = $('[data-meses]'), mesesB = Burbuja(mesesEl, mesesEl.querySelector('.rc-bub'));
    const mesBs = MESES_C.map((m, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rc-mes-b'; b.setAttribute('role', 'radio'); b.dataset.mes = i; b.textContent = m; b.setAttribute('aria-label', MESES[i]);
      mesesEl.appendChild(b);
      return b;
    });
    const modos = $$('[data-modo]');
    const cifraEn = el => { const s = document.createElement('span'); el.appendChild(s); return Cifras(s, 'dd'); };
    const cifN = { diaMes: cifraEn($('[data-n="diaMes"]')), diaAnual: cifraEn($('[data-n="diaAnual"]')) };
    const nDia = f => (f < 10 ? ' ' : '') + f;

    // las ruedas: un clic pasa al siguiente valor (↑ ↓ en el teclado) y el texto sube desde abajo
    const RUEDAS = {
      cadaMes: { vals: CADA, txt: v => CADA_TXT[CADA.indexOf(v)] },
      ord: { vals: [0, 1, 2, 3, 4], txt: v => ORD[v] },
      diaSem: { vals: [0, 1, 2, 3, 4, 5, 6], txt: v => DIAS[v] },
    };
    $$('[data-rueda]').forEach(el => {
      const k = el.dataset.rueda, def = RUEDAS[k], t = el.querySelector('.rc-rueda-t');
      def.el = el; def.t = t;
      const mueve = d => {
        const i = def.vals.indexOf(R[k]);
        R[k] = def.vals[((i + d) % def.vals.length + def.vals.length) % def.vals.length];
        if (k !== 'cadaMes') R.modoMes = 'nth';
        cambia({ rueda: k, dir: d });
      };
      el.addEventListener('click', () => mueve(1));
      el.addEventListener('keydown', e => {
        if (e.key === 'ArrowUp') { e.preventDefault(); mueve(-1); }
        else if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); mueve(1); }
        else if (e.key === 'Home') { e.preventDefault(); R[k] = def.vals[0]; cambia({ rueda: k, dir: -1 }); }
        else if (e.key === 'End') { e.preventDefault(); R[k] = def.vals[def.vals.length - 1]; cambia({ rueda: k, dir: 1 }); }
      });
    });

    // los pasos (−/+): un clic mueve uno; mantener pulsado repite
    const LIMITES = { diaMes: () => [1, 31], diaAnual: () => [1, diasMes(2027, R.mes)] };
    $$('[data-paso]').forEach(b => {
      const k = b.dataset.paso, d = +b.dataset.d;
      let rep = 0;
      const mueve = () => {
        const [a, z] = LIMITES[k]();
        const v = lim(R[k] + d, a, z);
        if (v === R[k]) return false;
        R[k] = v;
        if (k === 'diaMes') R.modoMes = 'dia';
        cambia({ paso: k });
        return true;
      };
      const para = () => { clearTimeout(rep); clearInterval(rep); rep = 0; };
      b.addEventListener('pointerdown', e => {
        if (e.button) return;
        mueve();
        rep = setTimeout(() => { rep = setInterval(() => { if (!mueve()) para(); }, 85); }, 420);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, para));
      b.addEventListener('click', e => { if (e.detail === 0) mueve(); });          // el teclado
    });

    modos.forEach(m => {
      const radio = m.querySelector('input');
      const elige = () => { if (R.modoMes !== m.dataset.modo) { R.modoMes = m.dataset.modo; cambia({ modo: true }); } };
      radio.addEventListener('change', elige);
      m.addEventListener('pointerdown', elige);          // tocar los controles de la otra fila también la elige
    });

    pildoras.forEach(b => b.addEventListener('click', () => {
      const w = +b.dataset.w;
      if (R.dias[w] && R.dias.filter(Boolean).length === 1) {           // no deja la semana sin ningún día
        b.classList.remove('is-tope'); void b.offsetWidth; b.classList.add('is-tope');
        capDias.textContent = 'Deja al menos un día'; capDias.classList.add('is-error');
        luego(() => { capDias.textContent = 'Días de la semana'; capDias.classList.remove('is-error'); }, 1800);
        return;
      }
      R.dias[w] = !R.dias[w];
      cambia({ pildora: w });
    }));
    atajos.forEach(b => b.addEventListener('click', () => { R.dias = ATAJOS[b.dataset.atajo].map(Boolean); cambia({ atajo: true }); }));
    swSinFin.addEventListener('click', () => { R.sinFin = !R.sinFin; cambia({ sinFin: true }); });

    segBs.forEach(b => b.addEventListener('click', () => { if (R.freq !== b.dataset.freq) { R.freq = b.dataset.freq; cambia({ freq: true }); } }));
    seg.addEventListener('keydown', e => {
      if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      e.preventDefault();
      const i = segBs.findIndex(b => b.dataset.freq === R.freq), d = /Right|Down/.test(e.key) ? 1 : -1;
      R.freq = segBs[(i + d + segBs.length) % segBs.length].dataset.freq;
      cambia({ freq: true });
      seg.querySelector('[aria-checked="true"]').focus();
    });
    mesBs.forEach(b => b.addEventListener('click', () => { R.mes = +b.dataset.mes; R.diaAnual = Math.min(R.diaAnual, diasMes(2027, R.mes)); cambia({ mes: true }); }));
    mesesEl.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[e.key];
      if (!d) return;
      e.preventDefault();
      R.mes = (R.mes + d + 12) % 12; R.diaAnual = Math.min(R.diaAnual, diasMes(2027, R.mes));
      cambia({ mes: true });
      mesBs[R.mes].focus();
    });

    // pinta el estado de todos los controles (sin moverlos de sitio: eso lo hacen las burbujas)
    function pintaControles(quieto, dir) {
      segBs.forEach(b => { const on = b.dataset.freq === R.freq; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      segB.a(seg.querySelector('[aria-checked="true"]'), quieto);
      ctls.forEach(c => {
        const on = c.dataset.ctl === R.freq;
        c.classList.toggle('is-act', on);
        if (on) c.removeAttribute('inert'); else c.setAttribute('inert', '');
        c.setAttribute('aria-hidden', String(!on));
      });
      pildoras.forEach(b => b.setAttribute('aria-pressed', String(R.dias[+b.dataset.w])));
      fija.classList.toggle('is-sin-fin', R.sinFin);
      swSinFin.setAttribute('aria-checked', String(R.sinFin));
      const k = R.dias.map(v => +v).join('');
      atajos.forEach(b => b.setAttribute('aria-pressed', String(ATAJOS[b.dataset.atajo].join('') === k)));
      Object.keys(RUEDAS).forEach(n => {
        const d = RUEDAS[n], t = d.txt(R[n]);
        if (d.t.textContent !== t) {
          d.t.textContent = t;
          if (!quieto && !reduce()) d.t.animate([{ transform: 'translateY(' + (dir || 1) * 70 + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: CURVA_FLIP });
        }
        d.el.setAttribute('aria-valuenow', R[n]); d.el.setAttribute('aria-valuetext', t);
      });
      modos.forEach(m => { const on = m.dataset.modo === R.modoMes; m.classList.toggle('is-sel', on); m.querySelector('input').checked = on; });
      Object.keys(cifN).forEach(n => cifN[n].pon(nDia(R[n]), 0, quieto));
      $$('[data-paso]').forEach(b => { const [a, z] = LIMITES[b.dataset.paso](); b.setAttribute('aria-disabled', String(R[b.dataset.paso] + +b.dataset.d < a || R[b.dataset.paso] + +b.dataset.d > z)); });
      mesBs.forEach(b => { const on = +b.dataset.mes === R.mes; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      mesesB.a(mesBs[R.mes], quieto);
    }

    /* =====================================================================
       El calendario: seis semanas siempre, para que no salte de alto
       ===================================================================== */
    let vista = { y: o.hoy[0], m: o.hoy[1] };
    const celdas = [], porDn = new Map();
    for (let i = 0; i < 42; i++) {
      const c = document.createElement('span');
      c.className = 'rc-dia';
      c.innerHTML = '<i class="rc-punto"></i><b></b>';
      rejillaEl.appendChild(c); celdas.push(c);
    }
    mesTxt.innerHTML = '<span></span>';
    let mesAct = mesTxt.firstChild;
    const nombreMes = v => MESES[v.m][0].toUpperCase() + MESES[v.m].slice(1) + ' ' + v.y;

    function pintaCal(prox, quieto) {
      const primeraDn = prox.length ? prox[0] : null;
      let dir = 0;
      if (primeraDn !== null) {
        const f = fechaDe(primeraDn);
        if (f.y !== vista.y || f.m !== vista.m) { dir = (f.y * 12 + f.m) > (vista.y * 12 + vista.m) ? 1 : -1; vista = { y: f.y, m: f.m }; }
      }
      renderMes(prox, dir, quieto);
    }
    function mueveMes(d) {
      const t = vista.y * 12 + vista.m + d;
      vista = { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
      renderMes(proximas(5), d, false);
    }
    function renderMes(prox, dir, quieto) {
      const dn0 = dnDe(vista.y, vista.m, 1) - fechaDe(dnDe(vista.y, vista.m, 1)).w;
      const set5 = new Set(prox);
      let ult5 = prox.length ? prox[prox.length - 1] : -1;
      const nuevas = [];
      porDn.clear();
      celdas.forEach((c, i) => {
        const dn = dn0 + i, f = fechaDe(dn);
        porDn.set(dn, c);
        c.dataset.dn = dn;
        c.lastChild.textContent = f.d;
        if (f.m !== vista.m) c.setAttribute('data-otro', ''); else c.removeAttribute('data-otro');
        if (dn === HOY) c.setAttribute('data-hoy', ''); else c.removeAttribute('data-hoy');
        const m = ocurre(dn) ? (set5.has(dn) || dn < ult5 ? '1' : '2') : '';
        if ((c.dataset.o || '') !== m || (dir && m)) { if (m) nuevas.push(c); }
        if (m) c.dataset.o = m; else delete c.dataset.o;
      });
      // el título del mes sube o baja según el sentido
      const t = nombreMes(vista);
      if (mesAct.textContent !== t) {
        if (quieto || reduce() || !dir) mesAct.textContent = t;
        else {
          const viejo = mesAct, nuevo = document.createElement('span');
          nuevo.textContent = t; mesTxt.appendChild(nuevo); mesAct = nuevo;
          viejo.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + (-dir * 70) + '%)', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }).onfinish = () => viejo.remove();
          nuevo.animate([{ transform: 'translateY(' + (dir * 70) + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: CURVA_FLIP, fill: 'backwards' });
        }
      }
      if (quieto || reduce()) return;
      if (dir) rejillaEl.animate([{ transform: 'translateX(' + dir * 26 + 'px)', opacity: .15 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: CURVA_FLIP });
      // la ola: cada fecha que se enciende lo hace un poco después de la anterior, en orden de fechas
      nuevas.sort((a, b) => +a.dataset.dn - +b.dataset.dn);
      const paso = Math.min(80, 650 / Math.max(1, nuevas.length));
      nuevas.forEach((c, k) => c.firstChild.animate(
        [{ transform: 'scale(.15)', opacity: 0 }, { transform: 'scale(1.18)', opacity: 1, offset: .55 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 700, delay: (dir ? 120 : 0) + k * paso, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' }));
    }
    $$('[data-mes]').forEach(b => b.addEventListener('click', () => { if (b.dataset.mes === '-1' || b.dataset.mes === '1') mueveMes(+b.dataset.mes); }));

    /* =====================================================================
       Las próximas cinco: una lista con FLIP
       ===================================================================== */
    const filas = new Map();                              // dn → li
    const relativo = dn => { const d = dn - HOY; return d === 0 ? 'hoy' : d === 1 ? 'mañana' : d < 60 ? 'en ' + d + ' días' : 'en ' + Math.round(d / 30.4) + ' meses'; };
    function creaFila(dn) {
      const f = fechaDe(dn), li = document.createElement('li');
      li.className = 'rc-fecha'; li.dataset.dn = dn;
      li.innerHTML = '<span class="rc-f-dia">' + f.d + '</span><span class="rc-f-txt"><b>' + DIAS[f.w][0].toUpperCase() + DIAS[f.w].slice(1) + '</b><small>' + MESES_C[f.m] + ' · ' + relativo(dn) + '</small></span><span class="rc-f-hora"><span class="rc-h"></span><small></small></span>';
      li._cif = Cifras(li.querySelector('.rc-h'), 'dd:dd');
      return li;
    }
    function pintaLista(prox, quieto) {
      const animar = !quieto && !reduce();
      const antes = new Map(), arriba = listaEl.getBoundingClientRect().top;
      filas.forEach((li, dn) => antes.set(dn, li.getBoundingClientRect().top));
      const nuevos = new Set(prox);
      // las que sobran se van: salen del flujo (quedan donde estaban) y se funden
      filas.forEach((li, dn) => {
        if (nuevos.has(dn)) return;
        filas.delete(dn);
        if (!animar) { li.remove(); return; }
        li.style.top = (antes.get(dn) - arriba) + 'px';
        li.classList.add('is-saliendo');
        li.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-14px) scale(.97)' }], { duration: 230, easing: 'ease-in', fill: 'forwards' }).onfinish = () => li.remove();
      });
      const creadas = [];
      prox.forEach((dn, i) => {
        let li = filas.get(dn);
        if (!li) { li = creaFila(dn); filas.set(dn, li); creadas.push(li); }
        listaEl.appendChild(li);
        li.classList.toggle('is-primera', i === 0);
        li.querySelector('.rc-f-hora small').textContent = ampmTxt();
        li._i = i;
      });
      vacioEl.hidden = prox.length > 0;
      prox.forEach((dn, i) => {
        const li = filas.get(dn);
        li._cif.pon(horaStr(), animar ? i : 0, quieto || creadas.indexOf(li) >= 0 && !animar);
      });
      if (!animar) return;
      let k = 0;
      prox.forEach(dn => {
        const li = filas.get(dn);
        if (antes.has(dn)) {
          const dy = antes.get(dn) - li.getBoundingClientRect().top;
          if (Math.abs(dy) > .5) li.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 700, easing: CURVA_FLIP });
        } else {
          li.animate([{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 120 + (k++) * 55, easing: CURVA_FLIP, fill: 'backwards' });
        }
      });
    }
    // pasar el cursor por una fecha del calendario o de la lista resalta su pareja
    const resalta = (dn, on) => {
      const c = porDn.get(dn), li = filas.get(dn);
      if (c) c.classList.toggle('is-hov', on);
      if (li) li.classList.toggle('is-hov', on);
    };
    [rejillaEl, listaEl].forEach(zona => {
      let ult = null;
      zona.addEventListener('pointerover', e => {
        const el = e.target.closest('[data-dn]');
        const dn = el && zona.contains(el) && (zona === listaEl || el.dataset.o) ? +el.dataset.dn : null;
        if (dn === ult) return;
        if (ult !== null) resalta(ult, false);
        ult = dn;
        if (dn !== null) resalta(dn, true);
      });
      zona.addEventListener('pointerleave', () => { if (ult !== null) resalta(ult, false); ult = null; });
    });

    /* =====================================================================
       El pie: próximo aviso, guardar y copiar
       ===================================================================== */
    let guardado = false;
    function pintaEstado(prox) {
      estadoEl.classList.toggle('is-programado', guardado);
      estadoEl.classList.toggle('is-error', !prox.length);
      if (!prox.length) { estadoEl.innerHTML = '<i></i><span>No hay próximas fechas</span>'; return; }
      const f = fechaDe(prox[0]);
      estadoEl.innerHTML = '<i></i><span>' + (guardado ? 'Programado · próximo aviso ' : 'Próximo aviso ') + '<b>' + DIAS[f.w] + ' ' + f.d + ' ' + MESES_C[f.m] + ', ' + horaTxt() + ' ' + ampmTxt() + '</b> · ' + relativo(prox[0]) + '</span>';
    }
    const fijaBoton = e => btnGuardar.setAttribute('data-estado', e);
    function guarda() {
      if (btnGuardar.dataset.estado !== 'reposo') return;
      fijaBoton('guardando');
      luego(() => {
        guardado = true;
        fijaBoton('guardado');
        pintaEstado(proximas(5));
        const li = listaEl.querySelector('.rc-fecha:not(.is-saliendo)');
        if (li && !reduce()) li.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.045)', offset: .35 }, { transform: 'scale(1)' }], { duration: 700, easing: CURVA_FLIP });
        avisa('Recordatorio guardado. ' + estadoEl.textContent);
        luego(() => { if (btnGuardar.dataset.estado === 'guardado') fijaBoton('reposo'); }, 2600);
      }, reduce() ? 60 : 700);
    }
    btnGuardar.addEventListener('click', guarda);

    let copiaId = 0;
    btnCopiar.addEventListener('click', () => {
      const texto = camposCron.map(f => f.txt).join(' ');
      const ok = () => {
        btnCopiar.classList.add('is-ok'); avisa('Expresión copiada: ' + texto);
        clearTimeout(copiaId); copiaId = luego(() => btnCopiar.classList.remove('is-ok'), 1700);
      };
      const alternativa = () => {
        const t = document.createElement('textarea');
        t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e) { /* sin permiso: el efecto se ve igual */ }
        t.remove(); ok();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, alternativa); else alternativa();
    });

    /* =====================================================================
       Todo junto: cada cambio recalcula y repinta las cinco piezas
       ===================================================================== */
    function cambia(info, quieto) {
      info = info || {};
      const prox = proximas(5);
      pintaControles(quieto, info.dir);
      if (info.freq) panel.dataset.freq = R.freq;
      Maquina.pon(frase(), quieto);
      pintaCron(quieto);
      pintaHora(quieto);
      pintaCal(prox, quieto);
      pintaLista(prox, quieto);
      if (!quieto && guardado) { guardado = false; }
      if (btnGuardar.dataset.estado === 'guardado' && !quieto) fijaBoton('reposo');
      pintaEstado(prox);
      const frasePlana = frasEl.textContent;
      if (quieto) return frasePlana;
      avisa(prox.length ? 'Se actualizó la repetición. ' + estadoEl.textContent : 'No hay fechas');
      if (o.alCambiar) o.alCambiar({ regla: copia(R), cron: camposCron.map(f => f.txt).join(' '), proximas: prox.map(dn => { const f = fechaDe(dn); return [f.y, f.m, f.d]; }) });
      return frasePlana;
    }

    function restablecer() {
      olvida();
      R = copia(REGLA_INICIAL);
      $('.rc-nombre').value = nombre0;
      guardado = false;
      fijaBoton('reposo');
      btnCopiar.classList.remove('is-ok');
      capDias.textContent = 'Días de la semana'; capDias.classList.remove('is-error');
      cambia({ freq: true, dir: 1 });
    }
    $('[data-restablecer]').addEventListener('click', restablecer);

    // cuando llegan las fuentes o cambia el ancho, las burbujas se recolocan sin animar
    const recoloca = () => { segB.a(seg.querySelector('[aria-checked="true"]'), true); ampmB.a(ampmEl.querySelector('[aria-checked="true"]'), true); mesesB.a(mesBs[R.mes], true); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(recoloca);
    addEventListener('resize', recoloca);
    addEventListener('load', recoloca);

    /* ── arranque: todo pintado sin animar y, un instante después, la primera ola ─ */
    panel.dataset.freq = R.freq;
    cambia({}, true);
    celdas.forEach(c => delete c.dataset.o);                // el calendario empieza vacío y las fechas entran en ola
    raiz.classList.add('is-entra');
    luego(() => renderMes(proximas(5), 0, false), reduce() ? 0 : 420);

    return {
      estado: () => ({ regla: copia(R), cron: camposCron.map(f => f.txt).join(' '), proximas: proximas(5).map(dn => { const f = fechaDe(dn); return [f.y, f.m, f.d]; }) }),
      pon(p) { Object.assign(R, p); if (p.dias) R.dias = p.dias.slice(); cambia({ freq: !!p.freq }); },
      restablecer, guardar: guarda,
    };
  }

  window.Recurrencia = Recurrencia;
})();
