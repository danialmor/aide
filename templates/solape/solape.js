/* =====================================================================
   Solape · Moxen
   Lee uno o varios calendarios .ics, los despliega en una agenda por días, encuentra lo que choca y escribe un .ics unido con los
   choques resueltos.

   · Funciona de verdad:
       1. Lector de iCalendar (RFC 5545): desdobla las líneas plegadas (CRLF + espacio o tabulación), separa nombre, parámetros (con
          comillas) y valor, recorre los VEVENT (ignorando sus VALARM) y guarda los VTIMEZONE tal cual. Entiende DTSTART/DTEND/DURATION
          como fecha, fecha-hora flotante, UTC (Z) o con TZID, además de SUMMARY, LOCATION, RRULE, EXDATE, RECURRENCE-ID, TRANSP y STATUS
          (los eventos «libres» o cancelados no cuentan). Los nombres de zona de Windows más comunes se traducen a IANA.
       2. Zonas con Intl.DateTimeFormat: una hora de pared de una zona se lleva a un instante resolviendo su desfase (dos pasadas, para
          que el cambio de hora no la desplace) y todo se muestra en tu zona. El evento de otra zona lleva una etiqueta con su hora de
          origen («Madrid 18:00»).
       3. Repeticiones: RRULE diaria, semanal (BYDAY, INTERVAL, WKST lunes), mensual (BYMONTHDAY, también negativo, y BYDAY con ordinal:
          «1MO», «-1FR») y anual, con COUNT y UNTIL. Se recorre día a día en la zona del propio evento, así que «cada jueves a las 09:30»
          sigue siendo a las 09:30 de allí aunque cambie la hora. EXDATE las omite (se ven como «omitida») y un VEVENT con
          RECURRENCE-ID sustituye a su ocurrencia («movida»).
       4. Choques: los eventos ocupados (ni libres, ni cancelados, ni de todo el día, ni omitidos) se ordenan por inicio y se barre la línea
          del tiempo con una lista de activos: cada par que se pisa da un choque con su tramo común.
       5. Resolver: «Mover a 10:30» deja el evento justo después del otro (o en el primer hueco libre) y «Omitir esta vez» lo quita solo de
          esa vez. Se guardan como operaciones sobre una ocurrencia y se pueden deshacer (⌘/Ctrl Z).
       6. Exportar: escribe un VCALENDAR con los eventos de los calendarios activos: la serie conserva su RRULE y suma un EXDATE por cada
          «omitir», un «mover» de una serie es un VEVENT con RECURRENCE-ID y uno suelto cambia su hora, y un evento suelto omitido se quita.
          Las zonas conservan su VTIMEZONE si el original lo traía (si no, esa hora se escribe en UTC), las líneas se pliegan a 75 octetos
          UTF-8 con CRLF, cada evento lleva su CATEGORIES con el calendario de origen y todo el texto se escapa. Después se relee el archivo
          escrito con el mismo lector, se vuelven a contar los choques y se muestra «Releído: … 0 choques».
   · Los dos calendarios de ejemplo, «Trabajo» y «Casa», se escriben a mano en iCalendar (con líneas plegadas, una serie con EXDATE, una
     con RECURRENCE-ID, una hora en UTC, otra con TZID y una libre); las horas de las dos últimas se calculan al abrir para que, vivas
     donde vivas, el choque caiga en el mismo sitio.
   · Accesible: la agenda y la lista de choques se recorren con el teclado (← → semana, ↑ ↓ choques, M mover, O omitir, ⌘/Ctrl Z deshacer),
     cada evento dice su hora, su calendario y con qué choca, y con movimiento reducido no hay costuras que se cosan ni vuelos.

   Montaje (se inicia solo sobre [data-solape]):
     const s = Solape(document.querySelector('[data-solape]'), { zona: 'America/Bogota' });
     s.abre(textoIcs, 'Trabajo.ics');   s.ejemplo();   s.exporta() → { texto, eventos, choques };   s.estado();
   Utilidades sueltas, sin interfaz:
     Solape.leeIcs(texto, nombre) → { nombre, eventos, vtz, avisos }      Solape.expande(calendarios, desde, hasta, zona) → ocurrencias
     Solape.buscaChoques(ocurrencias) → [{ a, b, ini, fin }]               Solape.escribeIcs(calendarios, ops, zona, ventana) → texto

   Todo es determinista: la hora de «ahora» solo sella el DTSTAMP del archivo exportado; el tiempo de las animaciones sale de
   requestAnimationFrame y setTimeout, las costuras son animaciones WAAPI y lo que se limpia al terminar va con un setTimeout, nunca con
   `onfinish`. Sin dependencias.
   ===================================================================== */
(function () {
  'use strict';

  const MS_DIA = 864e5, HORA = 36e5, MIN = 6e4;
  const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const DIAS_L = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CODIGOS = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
  const pad = n => String(n).padStart(2, '0');
  const lim = (v, a, b) => v < a ? a : v > b ? b : v;

  /* =====================================================================
     1 · Fechas y zonas
     ===================================================================== */
  const diaNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / MS_DIA);       // día civil → número de días desde 1970
  const civil = n => { const t = new Date(n * MS_DIA); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  const diaSem = n => (((n + 3) % 7) + 7) % 7;                                   // 0 = lunes (el 1-1-1970 fue jueves)
  const diasDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  const WINDOWS = {
    'Romance Standard Time': 'Europe/Paris', 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest', 'GMT Standard Time': 'Europe/London',
    'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
    'SA Pacific Standard Time': 'America/Bogota', 'Pacific SA Standard Time': 'America/Santiago', 'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
    'E. South America Standard Time': 'America/Sao_Paulo', 'Mexico Standard Time': 'America/Mexico_City', 'Tokyo Standard Time': 'Asia/Tokyo', 'India Standard Time': 'Asia/Kolkata', 'UTC': 'UTC',
  };
  const fmts = {};
  const fmtZona = tz => fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  function zonaValida(tz) { if (!tz) return null; if (WINDOWS[tz]) tz = WINDOWS[tz]; try { fmtZona(tz); return tz; } catch (e) { return null; } }
  /* Los componentes de pared de un instante en una zona. */
  function partes(ms, tz) {
    const o = {}; fmtZona(tz).formatToParts(ms).forEach(p => { if (p.type !== 'literal') o[p.type] = +p.value; });
    return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, mi: o.minute, s: o.second };
  }
  const desfase = (ms, tz) => { const p = partes(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
  /* El instante en que la pared de una zona marca esa hora: se resuelve el desfase dos veces para no equivocarse en un cambio de hora. */
  function instante(w, tz) {
    if (tz === 'UTC') return Date.UTC(w.y, w.m - 1, w.d, w.h || 0, w.mi || 0, w.s || 0);
    const base = Date.UTC(w.y, w.m - 1, w.d, w.h || 0, w.mi || 0, w.s || 0);
    let t = base - desfase(base, tz); const o2 = desfase(t, tz);
    if (base - o2 !== t) t = base - o2;
    return t;
  }
  const lugarDe = tz => (tz || '').split('/').pop().replace(/_/g, ' ');

  /* =====================================================================
     2 · El lector de iCalendar
     ===================================================================== */
  const desdobla = t => String(t).replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n').filter(l => l.trim() !== '');
  function partesLinea(l) {
    let q = false, corte = -1;
    for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') q = !q; else if (c === ':' && !q) { corte = i; break; } }
    if (corte < 0) return null;
    const cab = l.slice(0, corte), valor = l.slice(corte + 1), trozos = [];
    let ult = 0; q = false;
    for (let i = 0; i <= cab.length; i++) { const c = cab[i]; if (c === '"') q = !q; if ((c === ';' && !q) || i === cab.length) { trozos.push(cab.slice(ult, i)); ult = i + 1; } }
    const params = {};
    trozos.slice(1).forEach(t => { const e = t.indexOf('='); if (e > 0) params[t.slice(0, e).toUpperCase()] = t.slice(e + 1).replace(/^"|"$/g, ''); });
    return { nombre: trozos[0].toUpperCase(), params, valor };
  }
  const textoIcs = v => String(v).replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');
  const escapaTexto = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  /* Una fecha de iCalendar: { tipo: 'fecha' | 'utc' | 'zona' | 'flotante', y, m, d, h, mi, s, tz }. */
  function fechaIcs(valor, params, avisos) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(valor).trim());
    if (!m) return null;
    const f = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), tz: null, tipo: 'flotante' };
    if (m[4] == null || (params && params.VALUE === 'DATE')) f.tipo = 'fecha';
    else if (m[7]) f.tipo = 'utc';
    else if (params && params.TZID) {
      const tz = zonaValida(params.TZID);
      if (tz) { f.tipo = 'zona'; f.tz = tz; f.tzOriginal = params.TZID; } else if (avisos) avisos.push('La zona «' + params.TZID + '» no se reconoce: esa hora se leyó como tuya.');
    }
    return f;
  }
  function duracionIcs(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
    if (!m) return 0;
    const t = ((+m[2] || 0) * 7 + (+m[3] || 0)) * MS_DIA + (+m[4] || 0) * HORA + (+m[5] || 0) * MIN + (+m[6] || 0) * 1000;
    return m[1] === '-' ? -t : t;
  }
  function reglaIcs(v) {
    const r = { texto: v, freq: null, intervalo: 1, cuenta: null, hasta: null, porDia: [], porDiaMes: [], porMes: [], wkst: 0 };
    String(v).split(';').forEach(par => {
      const e = par.indexOf('='); if (e < 0) return;
      const k = par.slice(0, e).toUpperCase(), val = par.slice(e + 1);
      if (k === 'FREQ') r.freq = val.toUpperCase();
      else if (k === 'INTERVAL') r.intervalo = Math.max(1, +val || 1);
      else if (k === 'COUNT') r.cuenta = +val;
      else if (k === 'UNTIL') r.hasta = fechaIcs(val);
      else if (k === 'BYDAY') val.split(',').forEach(s => { const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i.exec(s.trim()); if (m) r.porDia.push({ n: m[1] ? +m[1] : 0, dia: CODIGOS[m[2].toUpperCase()] }); });
      else if (k === 'BYMONTHDAY') r.porDiaMes = val.split(',').map(Number).filter(Boolean);
      else if (k === 'BYMONTH') r.porMes = val.split(',').map(Number).filter(Boolean);
      else if (k === 'WKST' && CODIGOS[val.toUpperCase()] != null) r.wkst = CODIGOS[val.toUpperCase()];
    });
    return r;
  }

  function leeIcs(texto, nombreArchivo) {
    const cal = { nombre: '', eventos: [], vtz: {}, avisos: [], archivo: nombreArchivo || '' };
    let ev = null, vtz = null;
    for (const l of desdobla(texto)) {
      const p = partesLinea(l); if (!p) continue;
      if (p.nombre === 'BEGIN') {
        if (p.valor === 'VEVENT') ev = { props: [], alarma: false, alarmas: [] };
        else if (p.valor === 'VALARM' && ev) { ev.alarma = true; ev.alarmas.push(l); }
        else if (p.valor === 'VTIMEZONE') vtz = [l];
        else if (vtz) vtz.push(l);
        continue;
      }
      if (p.nombre === 'END') {
        if (p.valor === 'VEVENT' && ev) { const e = creaEvento(ev, cal); if (e) cal.eventos.push(e); ev = null; }
        else if (p.valor === 'VALARM' && ev) { ev.alarma = false; ev.alarmas.push(l); }
        else if (p.valor === 'VTIMEZONE' && vtz) { vtz.push(l); const id = (vtz.map(partesLinea).find(x => x && x.nombre === 'TZID') || {}).valor; if (id) cal.vtz[id] = vtz; vtz = null; }
        else if (vtz) vtz.push(l);
        continue;
      }
      if (vtz) { vtz.push(l); continue; }
      if (ev) { if (ev.alarma) ev.alarmas.push(l); else { p.raw = l; ev.props.push(p); } continue; }
      if (p.nombre === 'X-WR-CALNAME') cal.nombre = textoIcs(p.valor);
    }
    if (!cal.nombre) cal.nombre = (nombreArchivo || 'Calendario').replace(/\.ics$/i, '').replace(/[-_]+/g, ' ').trim() || 'Calendario';
    return cal;
  }
  const PROPIAS = new Set(['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'DURATION', 'RRULE', 'EXDATE', 'RECURRENCE-ID', 'SEQUENCE', 'SUMMARY', 'LOCATION', 'TRANSP', 'STATUS', 'CATEGORIES']);
  function creaEvento(ev, cal) {
    const g = n => ev.props.find(p => p.nombre === n), todos = n => ev.props.filter(p => p.nombre === n);
    const ini = g('DTSTART'); if (!ini) { cal.avisos.push('Un evento sin DTSTART se saltó.'); return null; }
    const f0 = fechaIcs(ini.valor, ini.params, cal.avisos); if (!f0) { cal.avisos.push('No entendí la fecha «' + ini.valor + '».'); return null; }
    const fin = g('DTEND'), dur = g('DURATION'), rr = g('RRULE'), rid = g('RECURRENCE-ID');
    const e = {
      uid: g('UID') ? g('UID').valor : 'sin-uid-' + cal.eventos.length + '@solape', titulo: g('SUMMARY') ? textoIcs(g('SUMMARY').valor) : '(sin título)', lugar: g('LOCATION') ? textoIcs(g('LOCATION').valor) : '',
      ini: f0, fin: fin ? fechaIcs(fin.valor, fin.params, cal.avisos) : null, duracion: dur ? duracionIcs(dur.valor) : null,
      regla: rr ? reglaIcs(rr.valor) : null, exdates: [], recurrenceId: rid ? fechaIcs(rid.valor, rid.params, cal.avisos) : null,
      libre: !!(g('TRANSP') && g('TRANSP').valor.toUpperCase() === 'TRANSPARENT'), cancelado: !!(g('STATUS') && g('STATUS').valor.toUpperCase() === 'CANCELLED'),
      secuencia: g('SEQUENCE') ? +g('SEQUENCE').valor || 0 : 0,
      // lo que no se interpreta (DESCRIPTION, ORGANIZER, ATTENDEE, URL, CLASS…) y las alarmas viajan tal cual al .ics unido
      categorias: todos('CATEGORIES').map(c => c.valor).join(','),
      extra: ev.props.filter(p => !PROPIAS.has(p.nombre)).map(p => p.raw), alarmas: ev.alarmas,
    };
    if (g('RDATE')) cal.avisos.push('«' + e.titulo + '» trae RDATE: se conserva al exportar, pero esas fechas sueltas no se despliegan.');
    todos('EXDATE').forEach(x => x.valor.split(',').forEach(v => { const f = fechaIcs(v, Object.assign({}, x.params, v.length === 8 ? { VALUE: 'DATE' } : {}), cal.avisos); if (f) e.exdates.push(f); }));
    return e;
  }

  /* =====================================================================
     3 · Desplegar las repeticiones
     ===================================================================== */
  const zonaDe = (f, local) => f.tipo === 'utc' ? 'UTC' : f.tipo === 'zona' ? f.tz : local;
  const aInstante = (f, local) => instante(f, zonaDe(f, local));
  function duracionDe(e, local) {
    if (e.fin) return aInstante(e.fin, local) - aInstante(e.ini, local);
    if (e.duracion != null) return e.duracion;
    return e.ini.tipo === 'fecha' ? MS_DIA : 0;
  }

  /* ¿Cae la serie en el día civil n (en la zona del evento)? */
  function reglaCoincide(r, e, n) {
    const n0 = diaNum(e.ini.y, e.ini.m, e.ini.d);
    if (n < n0) return false;
    const c = civil(n), c0 = civil(n0), ds = diaSem(n);
    if (r.porMes.length && r.porMes.indexOf(c.m) < 0) return false;
    if (r.freq === 'DAILY') {
      if ((n - n0) % r.intervalo) return false;
      return !r.porDia.length || r.porDia.some(x => x.dia === ds);
    }
    if (r.freq === 'WEEKLY') {
      const sem = d => Math.floor((d - ((diaSem(d) - r.wkst + 7) % 7)) / 7);      // el inicio de la semana, con WKST
      if ((sem(n) - sem(n0)) % r.intervalo) return false;
      const dias = r.porDia.length ? r.porDia.map(x => x.dia) : [diaSem(n0)];
      return dias.indexOf(ds) >= 0;
    }
    if (r.freq === 'MONTHLY') {
      if (((c.y - c0.y) * 12 + c.m - c0.m) % r.intervalo) return false;
      const total = diasDelMes(c.y, c.m);
      if (r.porDiaMes.length) return r.porDiaMes.some(d => (d > 0 ? d : total + d + 1) === c.d);
      if (r.porDia.length) {
        const ord = Math.floor((c.d - 1) / 7) + 1, ordFin = -Math.floor((total - c.d) / 7) - 1;
        return r.porDia.some(x => x.dia === ds && (x.n === 0 || x.n === ord || x.n === ordFin));
      }
      return c.d === c0.d;
    }
    if (r.freq === 'YEARLY') return (c.y - c0.y) % r.intervalo === 0 && c.m === c0.m && c.d === c0.d;
    return n === n0;
  }

  /* Las ocurrencias de los calendarios que tocan [desde, hasta). Cada una: { id, uid, cal, titulo, lugar, ini, fin, … }. */
  function expande(cals, desde, hasta, local) {
    const salida = [];
    cals.forEach((cal, ci) => {
      const porUid = {};
      cal.eventos.forEach(e => { if (e.recurrenceId) (porUid[e.uid] = porUid[e.uid] || []).push(e); });
      const maestros = new Set(cal.eventos.filter(e => !e.recurrenceId && e.regla).map(e => e.uid));
      const base = (e, ini, fin, extra) => Object.assign({
        id: e.uid + '#' + ini, uid: e.uid, cal: ci, calId: cal.id, ev: e, titulo: e.titulo, lugar: e.lugar, ini, fin,
        todoElDia: e.ini.tipo === 'fecha', libre: e.libre || e.cancelado, recurrente: !!e.regla, omitida: false, movida: false,
        tz: (e.ini.tipo === 'zona' && e.ini.tz !== local) ? e.ini.tz : null, tzOrigen: zonaDe(e.ini, local), origenIni: ini,
      }, extra || {});
      cal.eventos.forEach(e => {
        if (e.cancelado) return;
        const tz = zonaDe(e.ini, local), dur = duracionDe(e, local), ini0 = aInstante(e.ini, local);
        if (e.recurrenceId && maestros.has(e.uid)) return;                                // ya sustituye a su ocurrencia
        const dentro = (i, f) => i < hasta && Math.max(f, i + 1) > desde;
        if (!e.regla) {
          if (dentro(ini0, ini0 + dur)) salida.push(base(e, ini0, ini0 + dur, { movida: !!e.recurrenceId }));
          return;
        }
        const r = e.regla, ex = new Set(e.exdates.filter(f => f.tipo !== 'fecha').map(f => aInstante(f, local))), exDias = new Set(e.exdates.filter(f => f.tipo === 'fecha').map(f => diaNum(f.y, f.m, f.d)));
        const sust = {}; (porUid[e.uid] || []).forEach(o => { sust[aInstante(o.recurrenceId, local)] = o; });
        let hastaMs = Infinity;
        if (r.hasta) hastaMs = r.hasta.tipo === 'fecha' ? instante({ y: r.hasta.y, m: r.hasta.m, d: r.hasta.d, h: 23, mi: 59, s: 59 }, tz) : aInstante(r.hasta, local);
        const n0 = diaNum(e.ini.y, e.ini.m, e.ini.d), nFin = diaNum(...(p => [p.y, p.m, p.d])(partes(hasta, tz))) + 1;
        let cuenta = 0;
        for (let n = n0; n <= nFin && n - n0 < 40000; n++) {
          if (!reglaCoincide(r, e, n)) continue;
          const c = civil(n), ini = instante({ y: c.y, m: c.m, d: c.d, h: e.ini.h, mi: e.ini.mi, s: e.ini.s }, tz);
          if (ini > hastaMs) break;
          cuenta++;
          if (r.cuenta != null && cuenta > r.cuenta) break;
          let oc;
          const o = sust[ini];
          if (o) { const i2 = aInstante(o.ini, local); oc = base(o, i2, i2 + duracionDe(o, local), { id: e.uid + '#' + ini, movida: i2 !== ini, recurrente: true, modificada: true, origenIni: ini }); oc.libre = o.libre || o.cancelado; if (o.cancelado) continue; }
          else oc = base(e, ini, ini + dur);
          if (ex.has(ini) || exDias.has(n)) oc.omitida = true;
          if (dentro(oc.ini, oc.fin)) salida.push(oc);
        }
      });
    });
    return salida.sort((a, b) => a.ini - b.ini || a.fin - b.fin);
  }

  /* =====================================================================
     4 · Los choques: un barrido de intervalos
     ===================================================================== */
  function buscaChoques(occ) {
    const v = occ.filter(o => !o.omitida && !o.todoElDia && !o.libre && o.fin > o.ini).sort((a, b) => a.ini - b.ini || a.fin - b.fin);
    const res = []; let act = [];
    for (const o of v) {
      act = act.filter(a => a.fin > o.ini);
      for (const a of act) { const ini = Math.max(a.ini, o.ini), fin = Math.min(a.fin, o.fin); if (fin > ini) res.push({ id: a.id + '|' + o.id, a, b: o, ini, fin }); }
      act.push(o);
    }
    return res.sort((x, y) => x.ini - y.ini || x.fin - y.fin);
  }

  /* =====================================================================
     5 · Escribir el .ics unido
     ===================================================================== */
  /* Pliega una línea a 75 octetos UTF-8: las continuaciones empiezan con un espacio. */
  function pliega(linea) {
    const partes_ = []; let actual = '', bytes = 0, tope = 75;
    for (const ch of linea) {
      const b = new TextEncoder().encode(ch).length;
      if (bytes + b > tope) { partes_.push(actual); actual = ' '; bytes = 1; tope = 75; }
      actual += ch; bytes += b;
    }
    partes_.push(actual);
    return partes_.join('\r\n');
  }
  const duracionTexto = ms => { const m = Math.round(ms / MIN), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60; return 'P' + (d ? d + 'D' : '') + (h || mi || !d ? 'T' + (h ? h + 'H' : '') + (mi || (!h && !d) ? mi + 'M' : '') : ''); };
  const f2 = f => f.y + pad(f.m) + pad(f.d);
  const fh = w => f2(w) + 'T' + pad(w.h) + pad(w.mi) + pad(w.s);

  /* La hora de una ocurrencia escrita con la forma de su evento: fecha, flotante, UTC o con TZID (si el original traía su VTIMEZONE). */
  function escribeHora(nombre, ms, ev, cal, local) {
    const t = ev.ini.tipo;
    if (t === 'fecha') { const c = civil(Math.floor(ms / MS_DIA)); return [nombre + ';VALUE=DATE:' + f2(c)]; }
    if (t === 'flotante') return [nombre + ':' + fh(partes(ms, local))];
    if (t === 'zona' && cal.vtz[ev.ini.tzOriginal || ev.ini.tz]) return [nombre + ';TZID=' + (ev.ini.tzOriginal || ev.ini.tz) + ':' + fh(partes(ms, ev.ini.tz))];
    return [nombre + ':' + fh(partes(ms, 'UTC')) + 'Z'];
  }
  /* ops: [{ tipo: 'mover' | 'omitir', id, ini, fin }]; ocs: las ocurrencias de la ventana, para saber el instante original de cada id. */
  function escribeIcs(cals, ops, local, ocs, sello) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moxen//Solape//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Calendario unido'];
    const zonas = new Set(), cuerpo = [];
    const porId = {}; (ocs || []).forEach(o => { porId[o.id] = o; });
    const stamp = sello || fh(partes(Math.floor(new Date().getTime() / 1000) * 1000, 'UTC')) + 'Z';
    let n = 0;
    cals.forEach(cal => {
      cal.eventos.forEach(e => {
        const misOps = ops.filter(o => o.id.slice(0, o.id.lastIndexOf('#')) === e.uid && (porId[o.id] ? porId[o.id].calId === cal.id : true));
        const quita = misOps.filter(o => o.tipo === 'omitir'), mueve = misOps.filter(o => o.tipo === 'mover');
        if (!e.regla && !e.recurrenceId && quita.length) return;                           // un evento suelto omitido se quita
        const usaZona = e.ini.tipo === 'zona' && cal.vtz[e.ini.tzOriginal || e.ini.tz];
        if (usaZona) zonas.add(e.ini.tzOriginal || e.ini.tz);
        const cabecera = () => ['BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + stamp];
        const comunes = () => ['SUMMARY:' + escapaTexto(e.titulo)].concat(e.lugar ? ['LOCATION:' + escapaTexto(e.lugar)] : [], e.libre ? ['TRANSP:TRANSPARENT'] : [], e.cancelado ? ['STATUS:CANCELLED'] : [], ['CATEGORIES:' + [e.categorias, escapaTexto(cal.nombre)].filter(Boolean).join(',')]);
        const dur = duracionDe(e, local), ini0 = aInstante(e.ini, local);
        let ini = ini0, fin = ini0 + dur, sec = e.secuencia;
        if (!e.regla && mueve.length) { ini = mueve[mueve.length - 1].ini; fin = mueve[mueve.length - 1].fin; sec++; }
        const lin = cabecera();
        if (e.recurrenceId) lin.push.apply(lin, escribeHora('RECURRENCE-ID', aInstante(e.recurrenceId, local), e.recurrenceId.tipo === e.ini.tipo ? e : { ini: e.recurrenceId }, cal, local));
        lin.push.apply(lin, escribeHora('DTSTART', ini, e, cal, local));
        lin.push.apply(lin, e.fin || e.duracion == null ? escribeHora('DTEND', fin, e, cal, local) : ['DURATION:' + duracionTexto(dur)]);
        lin.push.apply(lin, comunes());
        if (e.regla) lin.push('RRULE:' + e.regla.texto);
        if (e.regla) {
          const ex = e.exdates.map(f => aInstante(f, local)).concat(quita.map(o => porId[o.id] ? porId[o.id].origenIni : +o.id.slice(o.id.lastIndexOf('#') + 1)));
          const vistos = new Set();
          ex.forEach(ms => { if (vistos.has(ms)) return; vistos.add(ms); lin.push.apply(lin, escribeHora('EXDATE', ms, e, cal, local)); });
        }
        lin.push.apply(lin, e.extra); lin.push.apply(lin, e.alarmas);
        if (sec) lin.push('SEQUENCE:' + sec);
        lin.push('END:VEVENT'); cuerpo.push(lin); n++;
        // mover una ocurrencia de una serie = un VEVENT con RECURRENCE-ID
        if (e.regla) mueve.forEach(o => {
          const orig = porId[o.id] ? porId[o.id].origenIni : +o.id.slice(o.id.lastIndexOf('#') + 1);
          const l2 = cabecera();
          l2.push.apply(l2, escribeHora('RECURRENCE-ID', orig, e, cal, local));
          l2.push.apply(l2, escribeHora('DTSTART', o.ini, e, cal, local));
          l2.push.apply(l2, escribeHora('DTEND', o.fin, e, cal, local));
          l2.push.apply(l2, comunes()); l2.push.apply(l2, e.extra); l2.push('SEQUENCE:' + (e.secuencia + 1), 'END:VEVENT'); cuerpo.push(l2); n++;
        });
      });
    });
    cals.forEach(cal => Object.keys(cal.vtz).forEach(id => { if (zonas.has(id) && !L.some(x => x === 'TZID:' + id)) { L.push.apply(L, cal.vtz[id]); zonas.delete(id); } }));
    cuerpo.forEach(l => L.push.apply(L, l));
    L.push('END:VCALENDAR');
    return L.map(pliega).join('\r\n') + '\r\n';
  }

  /* =====================================================================
     6 · Los calendarios de ejemplo, escritos a mano en iCalendar
     ===================================================================== */
  const MADRID_VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Madrid', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  const SEMANA_EJEMPLO = { y: 2026, m: 10, d: 19 };                  // el lunes de la primera semana de los ejemplos
  function textosEjemplo(local) {
    const hh = (d, h, mi) => '2026' + pad(10 + (d > 31 ? 1 : 0)) + pad(d > 31 ? d - 31 : d) + 'T' + pad(h) + pad(mi) + '00';
    const doble = (cuerpo) => cuerpo.join('\r\n') + '\r\n';
    // una hora local que se escribe en UTC, y otra en la zona de un colega: salen de pared local para que el choque caiga siempre en el mismo sitio
    const aUtc = (d, h, mi) => fh(partes(instante({ y: 2026, m: 10, d, h, mi, s: 0 }, local), 'UTC')) + 'Z';
    const enMadrid = (d, h, mi, suma) => fh(partes(instante({ y: 2026, m: 10, d, h, mi, s: 0 }, local) + (suma || 0) * MIN, 'Europe/Madrid'));
    const trabajo = doble(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moxen//Ejemplo Trabajo//ES', 'X-WR-CALNAME:Trabajo'].concat(MADRID_VTZ, [
      'BEGIN:VEVENT', 'UID:revision-diseno@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(20, 9, 30), 'DTEND:' + hh(20, 10, 30), 'SUMMARY:Revisión de diseño', 'LOCATION:Sala 2', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:sincronia@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(19, 9, 30), 'DTEND:' + hh(19, 10, 0), 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=4',
      'EXDATE:' + hh(29, 9, 30), 'SUMMARY:Sincronía de equipo', 'DESCRIPTION:Qué se hizo\\, qué sigue y qué se atasca. Cada uno cuenta lo suyo en un minuto; lo largo se agenda aparte.', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:planificacion@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(21, 11, 0), 'DTEND:' + hh(21, 12, 30), 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;COUNT=3', 'SUMMARY:Planificación quincenal', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:lectura@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(21, 11, 30), 'DTEND:' + hh(21, 12, 30), 'TRANSP:TRANSPARENT', 'SUMMARY:Bloque de lectura (libre)', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:demo@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + aUtc(22, 15, 0), 'DTEND:' + aUtc(22, 16, 0), 'SUMMARY:Demo con el cliente', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:proveedor@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART;TZID=Europe/Madrid:' + enMadrid(23, 12, 0), 'DTEND;TZID=Europe/Madrid:' + enMadrid(23, 12, 0, 45), 'SUMMARY:Llamada con el proveedor', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:cierre-semana@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(23, 17, 0), 'DTEND:' + hh(23, 17, 30), 'RRULE:FREQ=WEEKLY;COUNT=4', 'SUMMARY:Cierre de semana', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:cierre-semana@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'RECURRENCE-ID:' + hh(30, 17, 0), 'DTSTART:' + hh(30, 16, 0), 'DTEND:' + hh(30, 16, 30), 'SUMMARY:Cierre de semana', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:metricas@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(27, 14, 0), 'DTEND:' + hh(27, 15, 0), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=27;COUNT=3', 'SUMMARY:Revisión de métricas', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:trimestre@trabajo.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART;VALUE=DATE:20261030', 'DTEND;VALUE=DATE:20261031', 'SUMMARY:Cierre de trimestre', 'END:VEVENT',
      'END:VCALENDAR']));
    const casa = doble(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moxen//Ejemplo Casa//ES', 'X-WR-CALNAME:Casa',
      'BEGIN:VEVENT', 'UID:dental@casa.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(20, 10, 0), 'DTEND:' + hh(20, 11, 0), 'SUMMARY:Revisión dental', 'LOCATION:Clínica del barrio', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:pilates@casa.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(22, 9, 45), 'DTEND:' + hh(22, 10, 30), 'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4', 'SUMMARY:Clase de pilates', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:almuerzo@casa.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(23, 12, 30), 'DTEND:' + hh(23, 13, 30), 'SUMMARY:Almuerzo en casa', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:caminata@casa.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(19, 7, 30), 'DTEND:' + hh(19, 8, 0), 'RRULE:FREQ=DAILY;COUNT=6', 'SUMMARY:Caminata', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:compra@casa.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(24, 10, 0), 'DTEND:' + hh(24, 11, 0), 'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Compra semanal', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:facturas@casa.ejemplo', 'DTSTAMP:20261001T080000Z', 'DTSTART:' + hh(23, 18, 0), 'DTEND:' + hh(23, 18, 30), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=23;COUNT=2', 'SUMMARY:Revisar las facturas del hogar', 'END:VEVENT',
      'END:VCALENDAR']);
    return { trabajo: trabajo.replace(/(DESCRIPTION:[^\r\n]{30})/, '$1\r\n '), casa };
  }

  const Solape = function (raiz, op) { return iniciaUI(raiz, op); };
  Object.assign(Solape, { leeIcs, expande, buscaChoques, escribeIcs, instante, partes, textosEjemplo, reglaCoincide, desdobla });

  /* =====================================================================
     7 · La interfaz
     ===================================================================== */
  function iniciaUI(raiz, op) {
    op = op || {};
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const quieto = () => mq.matches;
    const $ = (s, r) => (r || raiz).querySelector(s), $$ = (s, r) => [...(r || raiz).querySelectorAll(s)];
    const NS = 'http://www.w3.org/2000/svg';
    const anima = (el, kf, o) => (quieto() || !el || !el.animate) ? null : el.animate(kf, o);
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* Un resorte convertido en curva `linear()` de CSS: devuelve la curva y lo que dura. */
    const APOYA = !!(window.CSS && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)'));
    function muelle(k, c) {
      const pts = [0]; let x = 0, v = 0, t = 0;
      while (t < 3) { v += (k * (1 - x) - c * v) / 240; x += v / 240; t += 1 / 240; pts.push(x); if (t > .15 && Math.abs(1 - x) < .001 && Math.abs(v) < .01) break; }
      const n = 40, out = [];
      for (let i = 0; i < n + 1; i++) out.push(pts[Math.round(i / n * (pts.length - 1))].toFixed(4));
      out[n] = '1';
      return { curva: APOYA ? 'linear(' + out.join(', ') + ')' : 'cubic-bezier(.34, 1.4, .64, 1)', ms: Math.round(t * 1000) };
    }
    const R1 = muelle(260, 22), R2 = muelle(380, 19), RM = muelle(210, 25);
    const rs = document.documentElement.style;
    rs.setProperty('--so-r1', R1.curva); rs.setProperty('--so-r2', R2.curva); rs.setProperty('--so-rm', RM.curva);
    rs.setProperty('--so-r1-ms', R1.ms + 'ms'); rs.setProperty('--so-r2-ms', R2.ms + 'ms'); rs.setProperty('--so-rm-ms', RM.ms + 'ms');

    // la zona del que mira: la del navegador, o la que se pida (?zona=Europe/Madrid, útil para probar)
    const pedida = op.zona || (/[?&]zona=([\w%/+-]+)/.exec(location.search) || [])[1];
    const LOCAL = zonaValida(pedida && decodeURIComponent(pedida)) || zonaValida(Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';

    const dias = $('[data-dias]'), todo = $('[data-todo]'), horas = $('[data-horas]'), cols = $('[data-cols]'), horario = $('[data-horario]'), lista = $('[data-lista]');
    const cals_ = $('[data-cals]'), pie = $('[data-pie]'), vacio = $('[data-vacio]'), btnExp = $('[data-exporta]'), expT = $('[data-exporta-t]'), btnDes = $('[data-deshacer]');
    const cuentaEl = $('[data-cuenta]'), nIni = $('[data-n-ini]'), nAhora = $('[data-n-ahora]'), latN = $('[data-lat-n]');
    const cssv = n => getComputedStyle(raiz).getPropertyValue(n).trim();
    const tonoN = i => cssv('--so-tono-' + (i % 4 + 1)) || ['#3046c8', '#2b2e36', '#6f84e0', '#857f72'][i % 4];
    const PH = 36, SEMANAS = 4;

    const estado = { cals: [], ops: [], inicio: 0, sem: 0, inicial: 0, sel: null, objetivo: 'b', horaMin: 8, horaMax: 18, ocs: [], choques: [], aviso: '', ultimo: null, ejemplo: true };
    let nCal = 0;

    /* ---------- cifras que ruedan ---------- */
    function Cifras(el) {
      let cols_ = [], valor = null;
      return {
        pon(v, seco) {
          const s = String(v);
          if (valor === null || s.length !== cols_.length) {
            el.textContent = ''; cols_ = [];
            [...s].forEach(() => { const c = document.createElement('span'); c.className = 'so-dig'; const t = document.createElement('span'); t.className = 'so-dt'; for (let d = 0; d <= 9; d++) { const i = document.createElement('i'); i.textContent = d; t.appendChild(i); } c.appendChild(t); el.appendChild(c); cols_.push(t); });
            seco = true;
          }
          [...s].forEach((ch, i) => { const t = cols_[i]; if (seco) { t.style.transition = 'none'; t.style.transform = 'translateY(' + (-ch) * 1.1 + 'em)'; void t.offsetWidth; t.style.transition = ''; } else { t.style.transitionDelay = (s.length - 1 - i) * 40 + 'ms'; t.style.transform = 'translateY(' + (-ch) * 1.1 + 'em)'; } });
          valor = v;
        },
      };
    }
    const cifIni = Cifras(nIni), cifAhora = Cifras(nAhora);

    /* ---------- formatos ---------- */
    const lp = ms => partes(ms, LOCAL);
    const hhmm = ms => { const p = lp(ms); return pad(p.h) + ':' + pad(p.mi); };
    const horaEn = (ms, tz) => { const p = partes(ms, tz); return pad(p.h) + ':' + pad(p.mi); };
    const rgbDe = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
    const diaDe = ms => { const p = lp(ms); return diaNum(p.y, p.m, p.d); };
    const nombreDia = n => DIAS[diaSem(n)] + ' ' + civil(n).d;
    const nombreDiaLargo = n => DIAS_L[diaSem(n)] + ' ' + civil(n).d + ' de ' + MESES_L[civil(n).m - 1];
    const rango = o => hhmm(o.ini) + '–' + hhmm(o.fin);
    const tonoDe = o => (estado.cals[o.cal] || { tono: tonoN(0) }).tono;
    const nombreCal = o => (estado.cals[o.cal] || { nombre: '' }).nombre;

    function repiteTexto(o) {
      const r = o.ev && o.ev.regla; if (!r) return '';
      const cada = r.intervalo > 1 ? 'cada ' + r.intervalo + ' ' : 'cada ';
      if (r.freq === 'DAILY') return r.intervalo > 1 ? cada + 'días' : 'cada día';
      if (r.freq === 'WEEKLY') { const d = r.porDia.length ? r.porDia.map(x => DIAS[x.dia]).join(' y ') : DIAS[diaSem(diaNum(o.ev.ini.y, o.ev.ini.m, o.ev.ini.d))]; return (r.intervalo > 1 ? cada + 'semanas' : 'cada semana') + ' · ' + d; }
      if (r.freq === 'MONTHLY') return r.intervalo > 1 ? cada + 'meses' : 'cada mes';
      return 'se repite';
    }

    /* ---------- calcular: ocurrencias, operaciones y choques ---------- */
    const ventana = () => [instante({ y: civil(estado.inicio).y, m: civil(estado.inicio).m, d: civil(estado.inicio).d, h: 0, mi: 0, s: 0 }, LOCAL), instante((c => ({ y: c.y, m: c.m, d: c.d, h: 0, mi: 0, s: 0 }))(civil(estado.inicio + SEMANAS * 7)), LOCAL)];
    const activos = () => estado.cals.filter(c => c.activo);
    function calcula() {
      const [d, h] = ventana();
      const ocs = expande(activos(), d, h, LOCAL);
      const porId = {}; ocs.forEach(o => { porId[o.id] = o; });
      estado.ops.forEach(o => {
        const x = porId[o.id]; if (!x) return;
        if (o.tipo === 'omitir') { x.omitida = true; x.porUsuario = true; } else { x.ini = o.ini; x.fin = o.fin; x.movida = true; x.porUsuario = true; }
      });
      ocs.sort((a, b) => a.ini - b.ini || a.fin - b.fin);
      estado.ocs = ocs; estado.choques = buscaChoques(ocs);
      let mn = 24, mx = 0;
      ocs.forEach(o => { if (o.todoElDia) return; const a = lp(o.ini), b = lp(o.fin); mn = Math.min(mn, a.h); mx = Math.max(mx, b.h + (b.mi || b.s ? 1 : 0)); });
      estado.horaMin = lim(Math.min(mn, 8), 0, 10); estado.horaMax = lim(Math.max(mx, 18), 14, 24);
      if (estado.horaMax - estado.horaMin < 8) estado.horaMax = estado.horaMin + 8;
    }
    const choqueDe = id => estado.choques.find(c => c.id === id);
    const choquesDe = o => estado.choques.filter(c => c.a.id === o.id || c.b.id === o.id);

    /* ---------- anclar la ventana: las cuatro semanas desde la primera cita ---------- */
    function ancla() {
      if (estado.ejemplo) { estado.inicio = diaNum(SEMANA_EJEMPLO.y, SEMANA_EJEMPLO.m, SEMANA_EJEMPLO.d); return; }
      let n = Infinity;
      estado.cals.forEach(c => c.eventos.forEach(e => { if (!e.regla || e.recurrenceId) { const x = diaNum(e.ini.y, e.ini.m, e.ini.d); if (x < n) n = x; } }));
      if (n === Infinity) estado.cals.forEach(c => c.eventos.forEach(e => { const x = diaNum(e.ini.y, e.ini.m, e.ini.d); if (x < n) n = x; }));
      if (n === Infinity) n = diaNum(2026, 10, 19);
      estado.inicio = n - diaSem(n);
    }

    /* =====================================================================
       Pintar
       ===================================================================== */
    const mapaEv = new Map(), mapaCos = new Map(), mapaLis = new Map();
    let tIntro = 0;

    function pintaCalendarios() {
      cals_.textContent = '';
      estado.cals.forEach((c, i) => {
        const li = document.createElement('li');
        const series = c.eventos.filter(e => e.regla).length;
        li.innerHTML = '<label class="so-cal" style="--tono:' + c.tono + '"><input type="checkbox"' + (c.activo ? ' checked' : '') + ' data-i="' + i + '"><i aria-hidden="true"></i><b>' + esc(c.nombre) + '</b><small>' + c.eventos.filter(e => !e.recurrenceId).length + ' eventos' + (series ? ' · ' + series + (series === 1 ? ' serie' : ' series') : '') + '</small></label>' + (estado.ejemplo ? '' : '<button type="button" class="so-quita" data-q="' + i + '" aria-label="Quitar ' + esc(c.nombre) + '"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8"/></svg></button>');
        cals_.appendChild(li);
      });
      if (!estado.ejemplo) { const li = document.createElement('li'); li.innerHTML = '<button type="button" class="so-boton so-boton--mini" data-ej>Volver al ejemplo</button>'; cals_.appendChild(li); }
    }
    function pintaSemana() {
      const lun = estado.inicio + estado.sem * 7, a = civil(lun), b = civil(lun + 6);
      $('[data-sem-rango]').textContent = a.d + (a.m !== b.m ? ' ' + MESES[a.m - 1] : '') + ' – ' + b.d + ' ' + MESES[b.m - 1] + ' ' + b.y;
      $('[data-sem-n]').textContent = 'semana ' + (estado.sem + 1) + ' de ' + SEMANAS;
      $('[data-ant]').disabled = estado.sem === 0; $('[data-sig]').disabled = estado.sem === SEMANAS - 1;
      const pt = $('[data-puntos]'); pt.textContent = '';
      for (let s = 0; s < SEMANAS; s++) {
        const li = document.createElement('li'), n = estado.choques.filter(c => { const d = diaDe(c.ini); return d >= estado.inicio + s * 7 && d < estado.inicio + s * 7 + 7; }).length;
        li.className = 'so-punto' + (s === estado.sem ? ' so-punto--ahora' : '') + (n ? ' so-punto--choca' : ''); if (n) li.dataset.n = n; pt.appendChild(li);
      }
    }

    /* Reparte los eventos de un día en columnas: los que se pisan quedan lado a lado. */
    function distribuye(lista_) {
      const res = new Map(); let grupo = [], fin = -Infinity;
      const cierra = () => {
        const cols_ = [];
        grupo.forEach(e => { let c = cols_.findIndex(f => f <= e.ini); if (c < 0) { c = cols_.length; cols_.push(0); } cols_[c] = e.finVis; e._col = c; });
        grupo.forEach(e => res.set(e.id, { col: e._col, n: cols_.length }));
        grupo = [];
      };
      lista_.forEach(e => { if (grupo.length && e.ini >= fin) { cierra(); fin = -Infinity; } grupo.push(e); fin = Math.max(fin, e.finVis); });
      if (grupo.length) cierra();
      return res;
    }
    /* Los eventos que se pisan se escalonan: cada uno ocupa más de la mitad y el de después tapa un poco al de antes. */
    const geom = l => { const w = 100 / (1 + (l.n - 1) * .42); return { l: l.col * .42 * w, w }; };
    const yDe = ms => { const p = lp(ms); return ((p.h - estado.horaMin) + p.mi / 60 + p.s / 3600) * PH; };

    function pintaEstructura() {
      const lun = estado.inicio + estado.sem * 7;
      dias.textContent = ''; todo.textContent = '';
      cols.style.height = ((estado.horaMax - estado.horaMin) * PH) + 'px'; horas.style.height = cols.style.height;
      horario.style.setProperty('--so-ph', PH + 'px');
      horas.textContent = '';
      for (let h = estado.horaMin; h < estado.horaMax; h++) { const s = document.createElement('span'); s.style.top = ((h - estado.horaMin) * PH) + 'px'; s.textContent = pad(h) + ':00'; horas.appendChild(s); }
      cols.textContent = '';
      for (let i = 0; i < 7; i++) {
        const n = lun + i, c = civil(n);
        const h = document.createElement('div'); h.className = 'so-dia' + (i > 4 ? ' so-dia--fin' : ''); h.dataset.d = i; h.innerHTML = '<span>' + DIAS[i] + '</span><b>' + c.d + '</b><em class="so-dia-n" hidden></em>'; dias.appendChild(h);
        const t = document.createElement('div'); t.className = 'so-todo-dia' + (i > 4 ? ' so-dia--fin' : ''); t.dataset.d = i; todo.appendChild(t);
        const col = document.createElement('div'); col.className = 'so-col' + (i > 4 ? ' so-col--fin' : ''); col.dataset.d = i; cols.appendChild(col);
      }
      mapaEv.clear(); mapaCos.clear();
    }

    function pintaAgenda(o) {
      o = o || {};
      if (o.estructura) pintaEstructura();
      const lun = estado.inicio + estado.sem * 7;
      const visibles = estado.ocs.filter(x => { const d = diaDe(x.ini); return d >= lun && d < lun + 7; });
      const enChoque = new Set(); estado.choques.forEach(c => { enChoque.add(c.a.id); enChoque.add(c.b.id); });
      const vivos = new Set(), chocesVivos = new Set();
      // layout por día
      const lay = new Map();
      for (let i = 0; i < 7; i++) {
        const delDia = visibles.filter(x => diaDe(x.ini) === lun + i && !x.todoElDia && !x.omitida && !x.libre).map(x => Object.assign(x, { finVis: Math.max(x.fin, x.ini + 28 * MIN) }));
        distribuye(delDia).forEach((v, id) => lay.set(id, v));
      }
      // la fila de todo el día: eventos de día entero y ocurrencias omitidas
      $$('.so-todo-dia', todo).forEach((t, i) => { const n = lun + i; t.textContent = ''; t.dataset.vacio = '1'; });
      estado.ocs.forEach(x => {
        if (!(x.todoElDia || x.omitida)) return;
        let a = diaDe(x.ini), b = x.todoElDia ? diaDe(Math.max(x.ini, x.fin - 1)) : a;
        for (let d = Math.max(a, lun); d <= Math.min(b, lun + 6); d++) {
          const t = todo.children[d - lun]; if (!t) continue;
          delete t.dataset.vacio;
          const e = document.createElement('div');
          e.className = 'so-chip' + (x.omitida ? ' so-chip--omitida' : ''); e.style.setProperty('--tono', tonoDe(x));
          e.innerHTML = (x.omitida ? '<s>' + esc(x.titulo) + '</s><em>' + (x.porUsuario ? 'omitida esta vez' : 'omitida') + '</em>' : esc(x.titulo));
          e.title = x.titulo + (x.omitida ? ' · ' + nombreDiaLargo(diaDe(x.ini)) + ' ' + hhmm(x.ini) + ' · ' + (x.porUsuario ? 'omitida esta vez (EXDATE al exportar)' : 'omitida en el calendario (EXDATE)') : ' · todo el día');
          t.appendChild(e);
        }
      });
      // los eventos con hora
      visibles.forEach(x => {
        if (x.todoElDia || x.omitida) return;
        const col = cols.children[diaDe(x.ini) - lun]; if (!col) return;
        vivos.add(x.id);
        let el = mapaEv.get(x.id);
        const nuevo = !el;
        if (!el) {
          el = document.createElement('div'); el.className = 'so-ev'; el.tabIndex = 0; el.setAttribute('role', 'button'); el.dataset.id = x.id;
          el.innerHTML = '<i class="so-ev-barra"></i><b class="so-ev-t"></b><span class="so-ev-h"></span><span class="so-ev-m"></span>';
          mapaEv.set(x.id, el);
        }
        if (el.parentNode !== col) col.appendChild(el);
        const l = lay.get(x.id) || { col: 0, n: 1 }, top = yDe(x.ini), fin = Math.min(yDe(x.fin), (estado.horaMax - estado.horaMin) * PH), alto = Math.max(fin - top, 16);
        const g = geom(l);
        el.style.setProperty('--tono', tonoDe(x)); el.style.setProperty('--rgb', rgbDe(tonoDe(x))); el.style.setProperty('--l', g.l.toFixed(2)); el.style.setProperty('--w', g.w.toFixed(2)); el.style.zIndex = 1 + l.col;
        el.style.top = top.toFixed(1) + 'px'; el.style.height = alto.toFixed(1) + 'px';
        el.classList.toggle('so-ev--libre', !!x.libre); el.classList.toggle('so-ev--choca', enChoque.has(x.id)); el.classList.toggle('so-ev--c1', alto < 27); el.classList.toggle('so-ev--c2', alto >= 27 && alto < 44);
        $('.so-ev-t', el).textContent = x.titulo; $('.so-ev-h', el).textContent = rango(x);
        const marcas = []; if (x.recurrente) marcas.push('<svg class="so-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 0 1 8.500-3.500M13 3v2.500h-2.500M13 8a5 5 0 0 1-8.500 3.500M3 13v-2.500h2.500"/></svg>');
        if (x.tz) marcas.push('<u title="Hora de origen">' + esc(lugarDe(x.tz)) + ' ' + horaEn(x.ini, x.tz) + '</u>');
        if (x.movida) marcas.push('<u class="so-mov">movida</u>');
        $('.so-ev-m', el).innerHTML = marcas.join('');
        const ch = choquesDe(x);
        el.setAttribute('aria-label', x.titulo + ', ' + nombreDiaLargo(diaDe(x.ini)) + ', ' + rango(x).replace('–', ' a ') + ', calendario ' + nombreCal(x) + (x.recurrente ? ', ' + repiteTexto(x) : '') + (x.tz ? ', hora de ' + lugarDe(x.tz) : '') + (x.libre ? ', marcado como libre' : '') + (ch.length ? ', choca con ' + ch.map(c => (c.a.id === x.id ? c.b : c.a).titulo).join(' y ') : ''));
        el.dataset.k = nuevo ? '1' : '';
      });
      mapaEv.forEach((el, id) => { if (!vivos.has(id)) { mapaEv.delete(id); if (o.suave && !quieto()) { el.classList.add('so-ev--sale'); setTimeout(() => el.remove(), 360); } else el.remove(); } });
      // las costuras y las bandas de cada choque de la semana
      estado.choques.forEach(c => {
        const d = diaDe(c.ini); if (d < lun || d >= lun + 7) return;
        const la = lay.get(c.a.id), lb = lay.get(c.b.id); if (!la || !lb) return;
        const col = cols.children[d - lun]; if (!col) return;
        chocesVivos.add(c.id);
        let cos = mapaCos.get(c.id);
        if (!cos) { cos = crearCostura(c); mapaCos.set(c.id, cos.el); cos = cos.el; col.appendChild(cos); cos.dataset.nueva = '1'; }
        const ga = geom(la), gb = geom(lb), l0 = Math.min(ga.l, gb.l), r0 = Math.max(ga.l + ga.w, gb.l + gb.w), zx = Math.max(ga.l, gb.l);
        const ya = yDe(c.ini), yb = yDe(c.fin), h = Math.max(yb - ya, 16), y0 = ya - (h - (yb - ya)) / 2;       // un choque corto se cose con un mínimo de 16 px para que se vea
        cos.style.top = y0.toFixed(1) + 'px'; cos.style.height = h.toFixed(1) + 'px';
        cos.style.setProperty('--l', l0.toFixed(2)); cos.style.setProperty('--w', (r0 - l0).toFixed(2)); cos.style.setProperty('--zx', ((zx - l0) / (r0 - l0) * 100).toFixed(2));
        // el zigzag se redibuja con su alto
        const sv = $('svg', cos), cam = zigzag(h);
        sv.setAttribute('viewBox', '0 0 12 ' + h.toFixed(1)); sv.setAttribute('height', h.toFixed(1)); $('.so-zz', sv).setAttribute('d', cam);
        cos.dataset.sel = c.id === estado.sel ? '1' : '';
        $('.so-zz-fondo', sv).setAttribute('d', cam);
      });
      mapaCos.forEach((cos, id) => { if (!chocesVivos.has(id)) { mapaCos.delete(id); descose(cos); } });
      // los contadores de cada día
      $$('.so-dia', dias).forEach((h, i) => { const n = estado.choques.filter(c => diaDe(c.ini) === lun + i).length, e = $('.so-dia-n', h); e.hidden = !n; e.textContent = n ? String(n) : ''; e.title = n ? n + (n === 1 ? ' choque' : ' choques') : ''; });
    }
    /* La costura en zigzag: una línea quebrada que une los dos eventos a lo largo del tramo común. */
    function zigzag(h) {
      let d = 'M6 0', y = 0, x = 1.5; const paso = 6;
      while (y + paso < h) { y += paso; d += ' L' + (x === 1.5 ? 10.5 : 1.5) + ' ' + y.toFixed(1); x = x === 1.5 ? 10.5 : 1.5; }
      return d + ' L6 ' + h.toFixed(1);
    }
    function crearCostura(c) {
      const el = document.createElement('div'); el.className = 'so-costura'; el.dataset.id = c.id;
      el.innerHTML = '<i class="so-banda"></i><svg class="so-hilo" viewBox="0 0 12 10" width="12" height="10" aria-hidden="true" preserveAspectRatio="none"><path class="so-zz-fondo" d="M6 0"/><path class="so-zz" d="M6 0" pathLength="1"/></svg>';
      return { el };
    }
    /* Una costura que se deshace: el hilo se recoge, la banda se apaga y luego se quita. */
    function descose(cos) {
      if (quieto()) { cos.remove(); return; }
      cos.dataset.sale = '1';
      anima($('.so-zz', cos), [{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }], { duration: 520, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' });
      setTimeout(() => cos.remove(), 760);
    }

    /* La lista lateral de choques. */
    function textoChoque(c) { const d = diaDe(c.ini); return DIAS[diaSem(d)] + ' ' + civil(d).d + ' · ' + hhmm(c.ini) + '–' + hhmm(c.fin); }
    function huecoLibre(obj, otro) {
      const dur = obj.fin - obj.ini; let ini = otro.fin;
      for (let k = 0; k < 12; k++) {
        const e = estado.ocs.find(x => x !== obj && x !== otro && !x.omitida && !x.todoElDia && !x.libre && x.ini < ini + dur && x.fin > ini);
        if (!e) break; ini = e.fin;
      }
      return { ini, fin: ini + dur };
    }
    const objetivoDe = c => estado.objetivo === 'a' ? { obj: c.a, otro: c.b } : { obj: c.b, otro: c.a };
    function pintaLista(o) {
      o = o || {};
      const ids = new Set(estado.choques.map(c => c.id));
      estado.choques.forEach((c, k) => {
        let li = mapaLis.get(c.id);
        if (!li) {
          li = document.createElement('li'); li.className = 'so-ch'; li.dataset.id = c.id; mapaLis.set(c.id, li);
          li.innerHTML = '<button type="button" class="so-ch-b" aria-expanded="false"><span class="so-ch-fecha"></span><span class="so-ch-par"><span class="so-par-e"><i></i><b></b></span><em>↔</em><span class="so-par-e"><i></i><b></b></span></span></button><div class="so-ch-det"><div class="so-ch-det-in"></div></div>';
          if (!quieto() && !o.sinAnim) anima(li, [{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { duration: R2.ms, delay: o.retraso != null ? o.retraso + k * 90 : 0, easing: R2.curva, fill: 'backwards' });
        }
        if (lista.children[k] !== li) lista.insertBefore(li, lista.children[k] || null);
        $('.so-ch-fecha', li).textContent = textoChoque(c);
        const par = $('.so-ch-par', li), is = $$('i', par), bs = $$('b', par);
        is[0].style.background = tonoDe(c.a); bs[0].textContent = c.a.titulo; is[1].style.background = tonoDe(c.b); bs[1].textContent = c.b.titulo;
        const sel = c.id === estado.sel; li.classList.toggle('so-ch--sel', sel); $('.so-ch-b', li).setAttribute('aria-expanded', String(sel));
        $('.so-ch-b', li).setAttribute('aria-label', textoChoque(c) + ': ' + c.a.titulo + ' contra ' + c.b.titulo);
        if (sel) pintaDetalle(li, c);
      });
      mapaLis.forEach((li, id) => { if (!ids.has(id)) { mapaLis.delete(id); if (quieto()) li.remove(); else { li.classList.add('so-ch--sale'); setTimeout(() => li.remove(), 520); } } });
      latN.textContent = estado.choques.length ? String(estado.choques.length) : '';
      vacio.hidden = estado.choques.length > 0;
      if (!vacio.hidden && !o.sinAnim) anima(vacio, [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: R2.ms, delay: 320, easing: R2.curva, fill: 'backwards' });
    }
    function pintaDetalle(li, c) {
      const det = $('.so-ch-det-in', li), { obj, otro } = objetivoDe(c), h = huecoLibre(obj, otro);
      det.innerHTML =
        '<p class="so-det-lin">Cambiar:</p><div class="so-quien" role="radiogroup" aria-label="Qué evento cambiar">' +
        [['a', c.a], ['b', c.b]].map(([k, e]) => '<button type="button" role="radio" aria-checked="' + (estado.objetivo === k) + '" data-obj="' + k + '" style="--tono:' + tonoDe(e) + '"><i></i><span>' + esc(e.titulo) + '</span><small>' + esc(nombreCal(e)) + (e.recurrente ? ' · serie' : '') + '</small></button>').join('') +
        '</div><div class="so-acciones"><button type="button" class="so-acc so-acc--mover" data-mover>Mover a ' + hhmm(h.ini) + '</button><button type="button" class="so-acc" data-omitir>Omitir esta vez</button></div>' +
        '<p class="so-det-nota">' + (obj.recurrente ? 'Es parte de una serie: el cambio afecta solo a esta vez (' + 'se exporta como ' + 'RECURRENCE-ID o EXDATE).' : 'No es parte de una serie: omitirlo lo quita del calendario unido.') + '</p>';
    }

    function pintaCuenta(seco) {
      cifIni.pon(estado.inicial, seco); cifAhora.pon(estado.choques.length, seco);
      const ok = estado.choques.length === 0 && estado.inicial > 0;
      cuentaEl.classList.toggle('so-cuenta--ok', ok);
      cuentaEl.setAttribute('role', 'img'); cuentaEl.setAttribute('aria-label', estado.inicial + ' choques al abrir, ahora ' + estado.choques.length + (ok ? ': sin choques' : ''));
      btnDes.disabled = !estado.ops.length;
    }
    function pintaTodo(o) {
      calcula(); pintaCalendarios(); pintaSemana(); pintaAgenda(o); pintaLista(o); pintaCuenta(o && o.seco);
    }
    function mensaje(t) { estado.aviso = t; pie.textContent = t; clearTimeout(mensaje._t); mensaje._t = setTimeout(() => { if (estado.aviso === t) { estado.aviso = ''; if (!estado.ultimo) pieIdle(); } }, 4600); }
    function pieIdle() {
      const n = estado.cals.reduce((s, c) => s + c.eventos.filter(e => !e.recurrenceId).length, 0), oc = estado.ocs.length;
      pie.textContent = estado.cals.length ? n + ' eventos en ' + estado.cals.length + (estado.cals.length === 1 ? ' calendario' : ' calendarios') + ' · ' + oc + ' citas en las ' + SEMANAS + ' semanas desde el ' + civil(estado.inicio).d + ' de ' + MESES_L[civil(estado.inicio).m - 1] + ' · tu zona: ' + LOCAL + ' · ← → cambian de semana, M mueve, O omite, ⌘/Ctrl Z deshace.' : 'Suelta uno o varios archivos .ics, o abre los de ejemplo.';
    }

    /* =====================================================================
       Interacción
       ===================================================================== */
    function iraSemana(s, dir) {
      s = lim(s, 0, SEMANAS - 1); if (s === estado.sem) return;
      const prev = estado.sem; estado.sem = s;
      const salida = dir || (s > prev ? 1 : -1);
      pintaSemana();
      if (!quieto()) {
        anima(cols, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-26 * salida) + 'px)' }], { duration: 110, easing: 'ease-in' });
        setTimeout(() => {
          pintaAgenda({ estructura: true });
          anima(cols, [{ opacity: 0, transform: 'translateX(' + (26 * salida) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
          anima(dias, [{ opacity: .3 }, { opacity: 1 }], { duration: 300 });
          marcaCosturas();
        }, 110);
      } else pintaAgenda({ estructura: true });
      anunciaSemana();
    }
    function anunciaSemana() {
      const n = estado.choques.filter(c => { const d = diaDe(c.ini); return d >= estado.inicio + estado.sem * 7 && d < estado.inicio + estado.sem * 7 + 7; }).length;
      mensaje('Semana del ' + $('[data-sem-rango]').textContent + ': ' + (n ? n + (n === 1 ? ' choque' : ' choques') : 'sin choques') + '.');
    }
    function semanaDe(ms) { return Math.floor((diaDe(ms) - estado.inicio) / 7); }
    function seleccionaChoque(id, o) {
      o = o || {};
      estado.sel = id; estado.objetivo = 'b';
      const c = id && choqueDe(id);
      if (c) {
        const s = lim(semanaDe(c.ini), 0, SEMANAS - 1);
        if (s !== estado.sem) iraSemana(s);
      }
      pintaLista({ sinAnim: true }); pintaAgenda();
      if (c) {
        const li = mapaLis.get(c.id); if (li && !o.sinScroll && li.scrollIntoView) li.scrollIntoView({ block: 'nearest', behavior: quieto() ? 'auto' : 'smooth' });
        pulsa(c);
        const m = $('.so-ev[data-id="' + cssEsc(c.b.id) + '"]'); void m;
      }
    }
    const cssEsc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/(["\\#])/g, '\\$1');
    function pulsa(c) {
      [c.a, c.b].forEach(x => { const el = mapaEv.get(x.id); if (el) anima(el, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.12)' }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' }); });
      const cos = mapaCos.get(c.id); if (cos) anima($('.so-banda', cos), [{ opacity: .5 }, { opacity: 1 }, { opacity: .8 }], { duration: 600, easing: 'ease-out' });
    }

    /* Aplicar una operación: mover una ocurrencia o omitirla esta vez. */
    function aplicaOp(tipo) {
      const c = estado.sel && choqueDe(estado.sel); if (!c) return;
      const { obj, otro } = objetivoDe(c);
      const antes = estado.choques.length;
      const sigue = estado.choques.filter(x => x.id !== c.id)[0];
      if (tipo === 'mover') { const h = huecoLibre(obj, otro); estado.ops.push({ tipo: 'mover', id: obj.id, ini: h.ini, fin: h.fin, de: obj.ini }); mensaje('«' + obj.titulo + '» pasa a ' + hhmm(h.ini) + '–' + hhmm(h.fin) + ' el ' + nombreDiaLargo(diaDe(h.ini)) + (obj.recurrente ? ': solo esa vez.' : '.')); }
      else { estado.ops.push({ tipo: 'omitir', id: obj.id }); mensaje('«' + obj.titulo + '» se omite el ' + nombreDiaLargo(diaDe(obj.ini)) + (obj.recurrente ? ': solo esta vez.' : ': se quita del unido.')); }
      estado.ultimo = null; ocultaExito();
      estado.sel = null;
      calcula(); pintaSemana(); pintaAgenda({ suave: true }); pintaLista(); pintaCuenta();
      if (estado.choques.length < antes) { anunciaResuelto(); }
      const cuenta = estado.choques.length;
      if (cuenta === 0 && estado.inicial > 0) sella();
      else if (sigue && choqueDe(sigue.id) && op.auto !== false) { clearTimeout(aplicaOp._t); aplicaOp._t = setTimeout(() => { if (!estado.sel && choqueDe(sigue.id)) seleccionaChoque(sigue.id, { sinScroll: true }); }, quieto() ? 0 : 520); }
    }
    function anunciaResuelto() { const n = estado.choques.length; cuentaEl.setAttribute('aria-label', estado.inicial + ' choques al abrir, ahora ' + n); }
    function sella() {
      anima($('.so-sello', cuentaEl), [{ transform: 'scale(1.9) rotate(-18deg)', opacity: 0 }, { transform: 'scale(.88) rotate(4deg)', opacity: 1, offset: .55 }, { transform: 'scale(1) rotate(-2deg)', opacity: 1 }], { duration: 760, delay: 420, easing: 'cubic-bezier(.3,1.2,.5,1)', fill: 'backwards' });
      anima($('.so-sello .visto', cuentaEl), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420, delay: 800, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      anima(cuentaEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 520, delay: 700, easing: 'ease-out' });
    }
    function deshace() {
      if (!estado.ops.length) return;
      const op_ = estado.ops.pop(); estado.ultimo = null; ocultaExito();
      calcula(); pintaSemana(); pintaAgenda({ suave: true }); pintaLista(); pintaCuenta();
      const o = estado.ocs.find(x => x.id === op_.id);
      mensaje('Deshecho: ' + (op_.tipo === 'mover' ? 'vuelve a su hora' : 'vuelve a la agenda') + (o ? ' «' + o.titulo + '»' : '') + '.');
    }
    btnDes.addEventListener('click', deshace);

    lista.addEventListener('click', e => {
      const q = e.target.closest('[data-obj]'); if (q) { estado.objetivo = q.dataset.obj; const c = choqueDe(estado.sel); if (c) pintaDetalle(mapaLis.get(c.id), c); return; }
      if (e.target.closest('[data-mover]')) { aplicaOp('mover'); return; }
      if (e.target.closest('[data-omitir]')) { aplicaOp('omitir'); return; }
      const li = e.target.closest('.so-ch'); if (!li) return;
      seleccionaChoque(estado.sel === li.dataset.id ? null : li.dataset.id);
    });
    lista.addEventListener('keydown', e => {
      const b = e.target.closest('.so-ch-b'); if (!b) return;
      const d = { ArrowDown: 1, ArrowUp: -1 }[e.key]; if (!d) return;
      e.preventDefault();
      const ids = estado.choques.map(c => c.id), i = ids.indexOf(b.closest('.so-ch').dataset.id), n = ids[lim(i + d, 0, ids.length - 1)];
      seleccionaChoque(n, { sinScroll: false }); const nb = $('.so-ch-b', mapaLis.get(n)); if (nb) nb.focus();
    });
    cols.addEventListener('click', e => {
      const ev = e.target.closest('.so-ev'); if (!ev) return;
      const o = estado.ocs.find(x => x.id === ev.dataset.id); if (!o) return;
      const ch = choquesDe(o);
      if (ch.length) { seleccionaChoque(ch[0].id); return; }
      mensaje(o.titulo + ' · ' + nombreDiaLargo(diaDe(o.ini)) + ' ' + rango(o) + ' · ' + nombreCal(o) + (o.recurrente ? ' · ' + repiteTexto(o) : '') + (o.tz ? ' · ' + lugarDe(o.tz) + ' ' + horaEn(o.ini, o.tz) + ' allí' : '') + (o.libre ? ' · libre, no cuenta para los choques' : ''));
    });
    cols.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('so-ev')) { e.preventDefault(); e.target.click(); } });
    cals_.addEventListener('change', e => { const i = e.target.dataset.i; if (i == null) return; estado.cals[+i].activo = e.target.checked; estado.ops = estado.ops.filter(o => true); estado.sel = null; estado.ultimo = null; pintaTodo({ estructura: true, sinAnim: true }); mensaje((e.target.checked ? 'Se suma ' : 'Se quita ') + estado.cals[+i].nombre + ': ' + estado.choques.length + (estado.choques.length === 1 ? ' choque.' : ' choques.')); });
    cals_.addEventListener('click', e => {
      const q = e.target.closest('[data-q]'); if (q) { estado.cals.splice(+q.dataset.q, 1); if (!estado.cals.length) { ejemplo(); return; } estado.ops = []; estado.sel = null; ancla(); estado.sem = 0; estado.inicial = 0; pintaTodo({ estructura: true, sinAnim: true }); estado.inicial = estado.choques.length; pintaCuenta(true); return; }
      if (e.target.closest('[data-ej]')) ejemplo();
    });
    $('[data-ant]').addEventListener('click', () => iraSemana(estado.sem - 1));
    $('[data-sig]').addEventListener('click', () => iraSemana(estado.sem + 1));

    document.addEventListener('keydown', e => {
      const t = e.target, tag = t && t.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && t.type !== 'checkbox') || (t && t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); deshace(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight' && !t.closest('.so-lista')) { e.preventDefault(); iraSemana(estado.sem + 1); }
      else if (e.key === 'ArrowLeft' && !t.closest('.so-lista')) { e.preventDefault(); iraSemana(estado.sem - 1); }
      else if (e.key === 'm' || e.key === 'M') { if (estado.sel) { e.preventDefault(); aplicaOp('mover'); } else if (estado.choques.length) { e.preventDefault(); seleccionaChoque(estado.choques[0].id); } }
      else if (e.key === 'o' || e.key === 'O') { if (estado.sel) { e.preventDefault(); aplicaOp('omitir'); } }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); reinicia(); }
      else if (e.key === 'Escape' && estado.sel) { seleccionaChoque(null); }
    });

    /* ---------- exportar ---------- */
    function ocultaExito() { clearTimeout(ocultaExito._t); delete btnExp.dataset.ok; expT.textContent = 'Exportar .ics unido'; }
    function baja(blob, nombre) {
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = nombre; a.style.display = 'none'; document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
    }
    function exporta() {
      calcula();
      const texto = escribeIcs(activos(), estado.ops, LOCAL, estado.ocs);
      const relei = leeIcs(texto, 'calendario-unido.ics'), [d, h] = ventana();
      const ocs2 = expande([Object.assign({}, relei, { id: 'rel' })], d, h, LOCAL), ch2 = buscaChoques(ocs2);
      const eventos = relei.eventos.filter(e => !e.recurrenceId).length + relei.eventos.filter(e => e.recurrenceId).length;
      baja(new Blob([texto], { type: 'text/calendar;charset=utf-8' }), 'calendario-unido.ics');
      btnExp.dataset.ok = ''; expT.textContent = 'Exportado';
      clearTimeout(ocultaExito._t); ocultaExito._t = setTimeout(ocultaExito, 3800);
      estado.ultimo = { eventos, choques: ch2.length, bytes: new Blob([texto]).size, citas: ocs2.filter(o => !o.omitida).length };
      pie.textContent = '';
      const l1 = document.createElement('span'); l1.innerHTML = '<b class="so-ok">✓</b> calendario-unido.ics · ' + eventos + ' eventos de ' + activos().length + (activos().length === 1 ? ' calendario' : ' calendarios') + ' · ' + estado.ops.length + (estado.ops.length === 1 ? ' cambio' : ' cambios') + ' · ' + (estado.bytes = new Blob([texto]).size) + ' bytes';
      const l2 = document.createElement('span'); l2.className = 'so-rel'; l2.textContent = 'Releído: ' + eventos + ' eventos, ' + estado.ultimo.citas + ' citas y ' + ch2.length + (ch2.length === 1 ? ' choque' : ' choques') + ' en las ' + SEMANAS + ' semanas';
      pie.appendChild(l1); pie.appendChild(l2);
      return { texto, eventos, choques: ch2.length };
    }
    btnExp.addEventListener('click', exporta);

    /* ---------- abrir archivos ---------- */
    function abre(texto, nombre) {
      const cal = leeIcs(texto, nombre);
      if (!cal.eventos.length) { mensaje('«' + (nombre || 'El archivo') + '» no trae eventos: ¿es un .ics?'); return false; }
      if (estado.ejemplo) { estado.cals = []; estado.ejemplo = false; nCal = 0; }
      cal.id = 'c' + (nCal++); cal.tono = tonoN(estado.cals.length); cal.activo = true;
      estado.cals.push(cal);
      estado.ops = []; estado.sel = null; estado.sem = 0; estado.ultimo = null; ancla();
      pintaTodo({ estructura: true, retraso: 400 });
      estado.inicial = estado.choques.length; pintaCuenta();
      mensaje('«' + cal.nombre + '»: ' + cal.eventos.length + ' eventos' + (cal.avisos.length ? ' · ' + cal.avisos[0] : '') + '.');
      return true;
    }
    async function abreArchivos(fs) {
      for (const f of fs) {
        if (!/\.ics$/i.test(f.name) && !/calendar/i.test(f.type)) { mensaje('«' + f.name + '» no es un .ics.'); continue; }
        try { abre(await f.text(), f.name); } catch (e) { mensaje('No pude leer «' + f.name + '».'); }
      }
    }
    $('[data-abrir]').addEventListener('click', () => $('[data-archivo]').click());
    $('[data-archivo]').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) abreArchivos(fs); });
    let prof = 0;
    const traeArchivos = e => e.dataTransfer && [...(e.dataTransfer.types || [])].indexOf('Files') >= 0;
    document.addEventListener('dragenter', e => { if (!traeArchivos(e)) return; prof++; raiz.dataset.arrastra = 'si'; });
    document.addEventListener('dragover', e => { if (!traeArchivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    document.addEventListener('dragleave', e => { if (!traeArchivos(e)) return; prof = Math.max(0, prof - 1); if (!prof) delete raiz.dataset.arrastra; });
    document.addEventListener('drop', e => { if (!traeArchivos(e)) return; e.preventDefault(); prof = 0; delete raiz.dataset.arrastra; const fs = [...e.dataTransfer.files]; if (fs.length) abreArchivos(fs); });

    /* =====================================================================
       Arranque: los ejemplos y el despliegue de la entrada
       ===================================================================== */
    function marcaCosturas() {
      // las costuras se cosen una tras otra, de arriba abajo
      let k = 0;
      mapaCos.forEach(cos => { delete cos.dataset.nueva; const zz = $('.so-zz', cos); anima(zz, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 620, delay: 120 + k * 160, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' }); anima($('.so-banda', cos), [{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 120 + k * 160, fill: 'backwards' }); k++; });
    }
    function entra() {
      if (quieto()) return;
      // los eventos caen en su día; las series se despliegan desde su primera aparición de la semana
      const primeras = {};
      const evs = [...mapaEv.entries()].map(([id, el]) => ({ id, el, o: estado.ocs.find(x => x.id === id) })).filter(x => x.o);
      evs.forEach(x => { const u = x.o.uid, d = diaDe(x.o.ini); if (x.o.recurrente && (primeras[u] == null || d < primeras[u].d)) primeras[u] = { d, el: x.el }; });
      const lun = estado.inicio + estado.sem * 7;
      evs.forEach((x, k) => {
        const d = diaDe(x.o.ini) - lun, base = 80 + d * 70 + (yDe(x.o.ini) / PH) * 6;
        const pr = x.o.recurrente && primeras[x.o.uid];
        if (pr && pr.d !== diaDe(x.o.ini)) {
          const dx = (pr.d - diaDe(x.o.ini)) * (cols.clientWidth / 7);
          anima(x.el, [{ transform: 'translateX(' + dx.toFixed(0) + 'px) scale(.92)', opacity: 0 }, { transform: 'translateX(' + (dx * .15).toFixed(0) + 'px)', opacity: 1, offset: .55 }, { transform: 'none', opacity: 1 }], { duration: 900, delay: 700 + d * 90, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
        } else anima(x.el, [{ transform: 'translateY(-16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: R2.ms, delay: base, easing: R2.curva, fill: 'backwards' });
      });
      anima(dias, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
      // las costuras, cuando ya están los eventos
      let k = 0;
      mapaCos.forEach(cos => { const zz = $('.so-zz', cos); anima(zz, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 640, delay: 1500 + k * 220, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' }); anima($('.so-banda', cos), [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 1500 + k * 220, fill: 'backwards' }); k++; });
      anima(cuentaEl, [{ opacity: .4 }, { opacity: 1 }], { duration: 400, delay: 1500 });
      $$('.so-dia-n, .so-lat-n', raiz).forEach(b => anima(b, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: R2.ms, delay: 1650, easing: R2.curva, fill: 'backwards' }));
    }
    function ejemplo() {
      const t = textosEjemplo(LOCAL);
      estado.cals = []; nCal = 0; estado.ejemplo = true;
      [['Trabajo.ics', t.trabajo], ['Casa.ics', t.casa]].forEach(([n, x]) => { const c = leeIcs(x, n); c.id = 'c' + (nCal++); c.tono = tonoN(estado.cals.length); c.activo = true; estado.cals.push(c); });
      reinicia(true);
    }
    function reinicia(desdeEjemplo) {
      clearTimeout(tIntro); clearTimeout(aplicaOp._t);
      if (!desdeEjemplo && !estado.ejemplo) { /* un calendario propio se queda: solo se deshacen los cambios */ }
      estado.ops = []; estado.sel = null; estado.sem = 0; estado.ultimo = null; estado.aviso = ''; ancla();
      ocultaExito();
      calcula(); estado.inicial = estado.choques.length;
      mapaLis.forEach(li => li.remove()); mapaLis.clear();
      cifIni.pon(0, true); cifAhora.pon(0, true); cuentaEl.classList.remove('so-cuenta--ok');
      pintaCalendarios(); pintaSemana(); pintaAgenda({ estructura: true }); pintaLista({ sinAnim: false, retraso: 1700 }); btnDes.disabled = true;
      pieIdle();
      entra();
      tIntro = setTimeout(() => { cifIni.pon(estado.inicial); cifAhora.pon(estado.choques.length); pintaCuenta(); }, quieto() ? 0 : 1500);
      if (quieto()) pintaCuenta(true);
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (estado.cals.length) pintaAgenda(); });
    if (window.ResizeObserver) new ResizeObserver(() => { /* el layout es en porcentajes */ }).observe(cols);
    ejemplo();
    raiz.dataset.listo = '';

    return {
      abre, ejemplo, reinicia: () => reinicia(), exporta, deshace,
      estado: () => ({ zona: LOCAL, semana: estado.sem, choques: estado.choques.map(c => ({ id: c.id, dia: textoChoque(c), a: c.a.titulo, b: c.b.titulo, ini: c.ini, fin: c.fin })), inicial: estado.inicial, ops: estado.ops.length, citas: estado.ocs.length, ocurrencias: estado.ocs.map(o => ({ titulo: o.titulo, ini: o.ini, fin: o.fin, omitida: o.omitida, movida: o.movida, tz: o.tz, recurrente: o.recurrente, libre: o.libre })) }),
      selecciona: i => { const c = estado.choques[i]; if (c) seleccionaChoque(c.id); }, mueve: () => aplicaOp('mover'), omite: () => aplicaOp('omitir'),
      semana: s => iraSemana(s),
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = Solape;
  else {
    window.Solape = Solape;
    const arranca = () => document.querySelectorAll('[data-solape]').forEach(el => { el._solape = Solape(el); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
  }
})();
