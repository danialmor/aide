/* AIDE · Moxen-inspired functional tabs.
   All dates use Aide's shared epoch-day calendar engine and all records use
   the existing online AIDE data/API. No template keeps a separate calendar DB. */
(function () {
  'use strict';
  const A = window.Aide;
  if (!A || !A.views) return;
  const D = A.date, E = A.ev, h = A.h;
  const specs = [
    { key:'moxen-anaquel', title:'Anaquel', fa:'داشبورد تقویمی', desc:'نمای کلی امروز، رویدادها و کارهای باز.', mode:'dashboard' },
    { key:'moxen-convite', title:'Convite', fa:'دعوت و قرارها', desc:'مدیریت قرارها و رویدادهای آینده.', mode:'appointments' },
    { key:'moxen-epoca', title:'Época', fa:'مرور سال', desc:'مرور ماه‌ها و جابه‌جایی سریع بین بازه‌ها.', mode:'year' },
    { key:'moxen-lunario', title:'Lunario', fa:'تقویم ماهانه', desc:'تقویم ماهانه با رویدادها و تعطیلات سامانه.', mode:'month' },
    { key:'moxen-parangon', title:'Parangón', fa:'مقایسه بازه‌ها', desc:'مقایسه تعداد رویدادهای بازه قبلی و بعدی.', mode:'compare' },
    { key:'moxen-semana', title:'Semana', fa:'برنامه هفتگی', desc:'نمایش رویدادهای هفته با روز شروع تنظیم‌شده.', mode:'week' },
    { key:'moxen-solape', title:'Solape', fa:'تداخل رویدادها', desc:'نمایش رویدادهای هم‌پوشان در برنامه واقعی.', mode:'conflicts' },
    { key:'moxen-tregua', title:'Tregua', fa:'وقفه و یادآورها', desc:'دسترسی سریع به تنظیمات یادآور و تقویم.', mode:'reminders' },
    { key:'moxen-turno', title:'Turno', fa:'زمان‌های آزاد', desc:'بررسی زمان‌های آزاد و مراجعه به مدیریت دسترسی.', mode:'availability' },
    { key:'moxen-vencimientos', title:'Vencimientos', fa:'موعدها و سررسیدها', desc:'کارهای سررسیددار و رویدادهای مرتبط.', mode:'due' }
  ];
  const ui = A.ui.moxenTabs || (A.ui.moxenTabs = {});
  const esc = s => String(s == null ? '' : s);
  const card = (children, extra) => h('section', { class:'card', style:Object.assign({ minWidth:0, padding:'14px', marginBottom:'12px' },extra||{}) }, children);
  const chip = (text, extra) => h('span',{class:'chip',style:Object.assign({whiteSpace:'normal'},extra||{})},text);
  const btn = (label, fn, primary) => h('button',{type:'button',class:primary?'btn primary':'btn',onClick:fn},label);
  const dayEvents = day => E.expand(day,day).sort((a,b)=>(a.start||0)-(b.start||0));
  const eventCard = o => h('button',{type:'button',class:'item hov',style:{width:'100%',textAlign:'start',marginBottom:'6px',borderInlineStart:'3px solid var(--b-'+(o.cat||o.ev&&o.ev.cat||'meeting')+')'},onClick:()=>E.edit(o.ev||o)},
    h('span',{class:'grow',style:{minWidth:0}},h('b',{dir:'auto'},o.title||o.ev&&o.ev.title||'رویداد بدون عنوان'),h('small',{class:'muted',style:{display:'block'}},o.allDay?'تمام روز':A.time(o.start)+' – '+A.time(o.end))),
    chip(D.dnum(o.day)));
  const addEvent = day => E.edit(null,{date:D.iso(day),start:(A.settings().dayStart||9)*60,dur:A.settings().defDur||60});
  function renderMonth(spec, state) {
    const S=A.settings(), anchor=state.anchor, first=D.sMonthStart(anchor), len=D.sMonthLen(first);
    const ws=S.weekStart==null?(D.isJ()?5:0):S.weekStart, start=D.weekStart(first,ws);
    const count=Math.ceil(((first-start)+len)/7)*7, occ=E.expand(start,start+count-1), counts=Object.create(null);
    occ.forEach(o=>{counts[o.day]=(counts[o.day]||0)+1;});
    const labels=Array.from({length:7},(_,i)=>h('div',{class:'small muted',style:{textAlign:'center',padding:'5px 0',minWidth:0}},D.wletter((ws+i)%7)));
    const cells=Array.from({length:count},(_,i)=>{
      const day=start+i, inMonth=day>=first&&day<first+len, active=day===state.selected, n=counts[day]||0, holiday=inMonth&&A.isHoliday&&A.isHoliday(day);
      return h('button',{type:'button','aria-label':D.longS(day)+'، '+n+' رویداد',title:D.longS(day),onClick:()=>{state.selected=day;A.route();},style:{minWidth:0,minHeight:'49px',padding:'3px 1px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'3px',borderRadius:'9px',border:'1px solid '+(active?'var(--accent)':day===D.today()?'var(--accent)':'var(--line)'),background:active?'var(--today-bg)':n?'var(--paper)':'var(--canvas)',color:inMonth?'var(--ink)':'var(--faint)',opacity:inMonth?1:.4,cursor:'pointer'}},
        h('b',{style:{fontSize:'12px'}},D.dnum(day)),
        h('span',{style:{fontSize:'9px',lineHeight:1.2,minHeight:'8px',color:holiday?'var(--danger)':'var(--accent)'}},holiday?'●':n?'•'.repeat(Math.min(3,n)):''));
    });
    const events=dayEvents(state.selected);
    return h('div',{class:'stack',style:{gap:'12px'}},
      card([h('div',{class:'row wrap',style:{justifyContent:'space-between',gap:'8px',marginBottom:'12px'}},
        h('div',null,h('h2',{style:{margin:'0 0 3px',fontSize:'21px'}},D.mtitle(first)),h('div',{class:'small muted'},D.longS(first)+' — '+D.longS(first+len-1))),
        h('div',{class:'row wrap'},btn('‹ ماه قبل',()=>{state.anchor=D.sAddMonths(state.anchor,-1);state.selected=state.anchor;A.route();}),btn('امروز',()=>{state.anchor=D.today();state.selected=D.today();A.route();},true),btn('ماه بعد ›',()=>{state.anchor=D.sAddMonths(state.anchor,1);state.selected=state.anchor;A.route();}))),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'4px'}},...labels,...cells)]),
      card([h('div',{class:'row wrap',style:{justifyContent:'space-between',marginBottom:'10px'}},h('div',null,h('h3',{style:{margin:'0 0 3px'}},D.longS(state.selected)),h('div',{class:'small muted'},D.isJ()?D.long(state.selected):'')),btn('＋ رویداد جدید',()=>addEvent(state.selected),true)),
        events.length?h('div',{class:'stack'},...events.map(eventCard)):h('p',{class:'muted small'},'برای این روز رویدادی ثبت نشده است.')]));
  }
  function renderMain(spec,state) {
    const today=D.today(), events=E.expand(today,today+30).sort((a,b)=>a.day-b.day||(a.start||0)-(b.start||0));
    const tasks=(A.db.data&&A.db.data.tasks||[]).filter(t=>!t.done&&t.due&&D.parse(t.due)!=null).sort((a,b)=>D.parse(a.due)-D.parse(b.due));
    const mainHeading=h('div',{class:'row wrap',style:{alignItems:'start',gap:'10px'}},
      h('div',{class:'grow',style:{minWidth:'180px'}},h('h2',{style:{margin:'0 0 4px'}},spec.fa),h('p',{class:'muted small'},spec.desc)),
      chip(D.isJ()?'تقویم شمسی فعال':'تقویم میلادی فعال'));
    const stats=card([h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(115px,1fr))',gap:'9px'}},
      ...[['امروز',D.dnum(today)+' '+D.mname(today)],['رویدادهای ۳۰ روز آینده',String(events.length)],['کارهای باز سررسیددار',String(tasks.length)]].map(([a,b])=>h('div',{style:{padding:'12px',borderRadius:'12px',background:'var(--canvas)',border:'1px solid var(--line)'}},h('div',{class:'small muted'},a),h('b',{style:{display:'block',fontSize:'20px',marginTop:'5px'}},b))))]));
    let special=[];
    if(spec.mode==='appointments') special=events.slice(0,6).map(eventCard);
    else if(spec.mode==='due') special=tasks.slice(0,6).map(t=>h('button',{type:'button',class:'item hov',style:{width:'100%',textAlign:'start'},onClick:()=>{location.hash='#/tasks';A.route();}},h('span',{class:'grow'},h('b',null,t.title),h('small',{class:'muted',style:{display:'block'}},D.longS(D.parse(t.due)))),chip('سررسید')));
    else if(spec.mode==='conflicts') {
      const byDay={}; events.filter(o=>!o.allDay&&o.end>o.start).forEach(o=>(byDay[o.day]||(byDay[o.day]=[])).push(o));
      const pairs=[]; Object.entries(byDay).forEach(([day,list])=>{list.sort((a,b)=>a.start-b.start);for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(list[i].start<list[j].end&&list[j].start<list[i].end)pairs.push({day:+day,a:list[i],b:list[j]});});
      special=pairs.slice(0,8).map(p=>h('button',{type:'button',class:'item hov',style:{width:'100%',textAlign:'start'},onClick:()=>{state.selected=p.day;state.anchor=p.day;state.tab='calendar';A.route();}},h('span',{class:'grow'},h('b',null,D.longS(p.day)),h('small',{class:'muted',style:{display:'block'}},A.time(p.a.start)+'–'+A.time(p.a.end)+' · '+(p.a.title||'')+' / '+(p.b.title||''))),chip('تداخل')));
      if(!special.length) special=[h('p',{class:'muted small'},'در ۳۰ روز آینده تداخل زمانی پیدا نشد.')];
    } else if(spec.mode==='availability') {
      const wins=A.windows?A.windows(30,7,today).slice(0,6):[];
      special=wins.length?wins.map(w=>h('button',{type:'button',class:'item hov',style:{width:'100%',textAlign:'start'},onClick:()=>{state.selected=w.day;state.anchor=w.day;state.tab='calendar';A.route();}},h('span',{class:'grow'},D.longS(w.day)),chip(A.time(w.from)+'–'+A.time(w.to)))):[h('p',{class:'muted small'},'برای مشاهده و تنظیم زمان‌های آزاد، بخش دسترسی را باز کنید.')];
      special.push(btn('مدیریت زمان‌های آزاد',()=>{location.hash='#/availability';A.route();}));
    } else if(spec.mode==='reminders') {
      special=[h('p',{class:'muted small'},'یادآورها و زمان‌بندی از تنظیمات و رویدادهای اصلی AIDE پیروی می‌کنند.'),btn('تنظیمات یادآورها',()=>{location.hash='#/settings';A.route();})];
    } else if(spec.mode==='compare') {
      const before=E.expand(today-7,today-1).length, after=E.expand(today,today+6).length;
      special=[h('div',{class:'row wrap'},chip('۷ روز گذشته: '+before),chip('۷ روز آینده: '+after)),h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'5px'}},...Array.from({length:7},(_,i)=>{const n=E.expand(today+i,today+i).length;return h('button',{type:'button',class:'card',style:{padding:'8px 2px',minWidth:0,textAlign:'center'},onClick:()=>{state.selected=today+i;state.anchor=today+i;state.tab='calendar';A.route();}},h('b',null,D.dnum(today+i)),h('small',{class:'muted',style:{display:'block'}},n+' رویداد'));}))];
    } else if(spec.mode==='year') {
      const first=D.sYearStart?D.sYearStart(today):D.sMonthStart(today), starts=[];let cur=first;
      for(let i=0;i<12;i++){starts.push(cur);cur+=D.sMonthLen(cur);}
      special=[h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(115px,1fr))',gap:'8px'}},...starts.map(m=>h('button',{type:'button',class:'card',style:{padding:'10px',textAlign:'start'},onClick:()=>{state.anchor=m;state.selected=m;state.tab='calendar';A.route();}},h('b',null,D.mtitle(m)),h('small',{class:'muted',style:{display:'block',marginTop:'5px'}},E.expand(m,m+D.sMonthLen(m)-1).length+' رویداد'))))];
    } else if(spec.mode==='week') {
      const ws=D.weekStart(today,A.settings().weekStart==null?(D.isJ()?5:0):A.settings().weekStart);
      special=[h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'5px'}},...Array.from({length:7},(_,i)=>{const day=ws+i, ev=dayEvents(day);return h('button',{type:'button',class:'card',style:{padding:'8px 3px',minWidth:0,textAlign:'center'},onClick:()=>{state.selected=day;state.anchor=day;state.tab='calendar';A.route();}},h('small',{class:'muted'},D.wletter((A.settings().weekStart==null?(D.isJ()?5:0):A.settings().weekStart+i)%7)),h('b',{style:{display:'block',margin:'4px 0'}},D.dnum(day)),h('small',{class:'muted'},ev.length+' رویداد'))}))];
    } else special=events.slice(0,5).map(eventCard);
    return h('div',{class:'stack',style:{gap:'12px'}},card([mainHeading]),stats,card([h('div',{class:'row wrap',style:{justifyContent:'space-between',marginBottom:'10px'}},h('h3',{style:{margin:0}},spec.mode==='conflicts'?'تداخل‌های شناسایی‌شده':spec.mode==='due'?'سررسیدهای باز':spec.mode==='availability'?'بازه‌های آزاد':spec.mode==='reminders'?'یادآورها و تنظیمات':'نمای اختصاصی '+spec.title),btn('رفتن به تقویم',()=>{state.tab='calendar';A.route();},true)),...(special.length?special:[h('p',{class:'muted small'},'موردی برای نمایش وجود ندارد.')])]));
  }
  function renderEvents(spec,state) {
    const today=D.today(), events=E.expand(today-7,today+90).sort((a,b)=>a.day-b.day||(a.start||0)-(b.start||0));
    return card([h('div',{class:'row wrap',style:{justifyContent:'space-between',marginBottom:'10px'}},h('div',null,h('h2',{style:{margin:'0 0 3px'}},'رویدادهای مرتبط'),h('p',{class:'small muted'},'این فهرست مستقیماً از رویدادهای اصلی AIDE خوانده می‌شود.')),btn('＋ رویداد جدید',()=>addEvent(state.selected),true)),events.length?h('div',{class:'stack'},...events.map(eventCard)):h('p',{class:'muted'},'رویدادی برای نمایش وجود ندارد.')]);
  }
  specs.forEach(spec=>{
    A.views[spec.key]={
      title:spec.title, sub:spec.fa, flush:false,
      render(root) {
        const today=D.today(), state=ui[spec.key]||(ui[spec.key]={tab:'overview',anchor:today,selected:today});
        if(!Number.isFinite(state.anchor))state.anchor=today;
        if(!Number.isFinite(state.selected))state.selected=today;
        const tabs=[['overview','نمای اختصاصی'],['calendar','تقویم'],['events','رویدادها']];
        const nav=h('div',{class:'seg',role:'tablist','aria-label':'بخش‌های '+spec.title,style:{marginBottom:'12px',display:'flex',flexWrap:'wrap'}},...tabs.map(([key,label])=>h('button',{type:'button',role:'tab','aria-selected':state.tab===key,onClick:()=>{state.tab=key;A.route();}},label)));
        const head=card([h('div',{class:'row wrap',style:{justifyContent:'space-between',alignItems:'start',gap:'10px'}},h('div',{class:'grow',style:{minWidth:'150px'}},h('h1',{style:{fontSize:'23px',margin:'0 0 4px'}},spec.title),h('p',{class:'muted small',style:{margin:0}},spec.fa+' · '+(D.isJ()?'تقویم شمسی':'تقویم میلادی')),h('p',{class:'small muted',style:{margin:'6px 0 0'}},'تاریخ‌ها و رویدادها از موتور مشترک و ذخیره‌سازی آنلاین AIDE استفاده می‌کنند.')),h('div',{class:'row wrap'},btn('تقویم سراسری',()=>{location.hash='#/calendar';A.route();}),btn('＋ رویداد جدید',()=>addEvent(state.selected),true)))]);
        root.append(head,nav);
        if(state.tab==='calendar')root.append(renderMonth(spec,state));
        else if(state.tab==='events')root.append(renderEvents(spec,state));
        else root.append(renderMain(spec,state));
      }
    };
  });
})();