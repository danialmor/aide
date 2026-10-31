/* AIDE · Independent Moxen-inspired calendar experiences.
 * Native AIDE implementation: shared calendar engine + AIDE events/settings.
 * No original template source is bundled. Per-account preferences are saved through A.save().
 */
(function () {
  'use strict';
  const A = window.Aide;
  if (!A || !A.views || !A.date || !A.ev) return;
  const D = A.date, E = A.ev, h = A.h;
  const specs = [
    ['moxen-anaquel','Anaquel','تقویم بِن‌تو و داشبورد تعاملی'],
    ['moxen-convite','Convite','دعوت‌نامه و تأیید حضور'],
    ['moxen-epoca','Época','مرور پیوسته سال تا روز'],
    ['moxen-lunario','Lunario','تقویم ماهانه با جزئیات روز'],
    ['moxen-parangon','Parangón','مقایسه دو بازه زمانی'],
    ['moxen-semana','Semana','برنامه‌ریز هفتگی زمان‌محور'],
    ['moxen-solape','Solape','تشخیص تداخل و واردکردن ICS'],
    ['moxen-tregua','Tregua','وقفه موقت و تاریخ بازگشت'],
    ['moxen-turno','Turno','انتخاب زمان آزاد و رزرو'],
    ['moxen-vencimientos','Vencimientos','تقویم سررسید و هزینه‌ها']
  ];
  const state = A.ui.moxenDistinct || (A.ui.moxenDistinct = {});
  const esc = s => String(s == null ? '' : s);
  const st = (key, fallback) => {
    const settings=A.settings();
    if (settings[key] == null) settings[key]=fallback;
    return settings[key];
  };
  const persist = () => A.save('settings');
  const dayEvents = day => E.expand(day,day).sort((a,b)=>(a.start||0)-(b.start||0));
  const rangeEvents = (a,b) => E.expand(a,b).sort((x,y)=>x.day-y.day||(x.start||0)-(y.start||0));
  const btn = (label, fn, primary=false, extra={}) => h('button',Object.assign({type:'button',class:primary?'btn primary':'btn',onClick:fn},extra),label);
  const card = (children, extra={}) => h('section',{class:'card',style:Object.assign({padding:'14px',minWidth:0,marginBottom:'12px'},extra)},children);
  const chip = (label, style={}) => h('span',{class:'chip',style:Object.assign({whiteSpace:'normal'},style)},label);
  const title = (name, subtitle, extra) => h('div',{class:'row wrap',style:{justifyContent:'space-between',alignItems:'start',gap:'10px',marginBottom:'12px'}},
    h('div',{class:'grow',style:{minWidth:'160px'}},h('h2',{style:{margin:'0 0 5px',fontSize:'23px'}},name),h('p',{class:'small muted',style:{margin:0}},subtitle)),
    extra||h('span',{class:'small muted'},D.isJ()?'تقویم شمسی':'تقویم میلادی'));
  const openEvent = o => E.edit(o.ev||o);
  const addEvent = (day, minute) => E.edit(null,{date:D.iso(day),start:minute==null?(A.settings().dayStart||9)*60:minute,dur:A.settings().defDur||60});
  const evCard = o => h('button',{type:'button',class:'item hov',style:{width:'100%',textAlign:'start',marginBottom:'6px',borderInlineStart:'3px solid var(--accent)'},onClick:()=>openEvent(o)},
    h('span',{class:'grow',style:{minWidth:0}},h('b',{dir:'auto'},o.title||o.ev&&o.ev.title||'رویداد بدون عنوان'),h('small',{class:'muted',style:{display:'block'}},D.longS(o.day)+' · '+(o.allDay?'تمام روز':A.time(o.start)+'–'+A.time(o.end)))),
    chip(D.dnum(o.day)));
  const dateLabel = day => D.longS(day);
  const moveMonth = (s,delta) => {s.anchor=D.sAddMonths(s.anchor,delta);s.selected=s.anchor;A.route();};
  const monthGrid = (s, opts={}) => {
    const first=D.sMonthStart(s.anchor), len=D.sMonthLen(first), settings=A.settings();
    const ws=settings.weekStart==null?(D.isJ()?5:0):settings.weekStart, start=D.weekStart(first,ws), count=Math.ceil((first-start+len)/7)*7;
    const occ=rangeEvents(start,start+count-1), counts={};
    occ.forEach(o=>counts[o.day]=(counts[o.day]||0)+1);
    const heads=Array.from({length:7},(_,i)=>h('div',{class:'small muted',style:{textAlign:'center',padding:'5px 0'}},D.wletter((ws+i)%7)));
    const cells=Array.from({length:count},(_,i)=>{
      const day=start+i, inMonth=day>=first&&day<first+len, active=day===s.selected, n=counts[day]||0, holiday=inMonth&&A.isHoliday&&A.isHoliday(day);
      return h('button',{type:'button',title:dateLabel(day),'aria-label':dateLabel(day)+'، '+n+' رویداد',onClick:()=>{s.selected=day;s.anchor=day;A.route();},
        style:{minWidth:0,minHeight:opts.compact?'38px':'61px',padding:'4px 1px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'4px',borderRadius:opts.round?'50%':'10px',border:'1px solid '+(active?'var(--accent)':day===D.today()?'var(--accent)':'var(--line)'),background:active?'var(--today-bg)':n?'var(--paper)':'var(--canvas)',color:inMonth?'var(--ink)':'var(--faint)',opacity:inMonth?1:.35,cursor:'pointer'}},
        h('b',{style:{fontSize:'12px'}},D.dnum(day)),
        h('span',{style:{fontSize:'9px',lineHeight:1,minHeight:'7px',color:holiday?'var(--danger)':'var(--accent)'}},holiday?'●':n?'•'.repeat(Math.min(3,n)):''));
    });
    return {first,len,start,count,occ,grid:h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'4px'}},...heads,...cells)};
  };
  function calendarPanel(s, opts={}) {
    const g=monthGrid(s,opts), events=dayEvents(s.selected);
    return h('div',{class:'stack',style:{gap:'12px'}},
      card([title(D.mtitle(g.first),D.longS(g.first)+' — '+D.longS(g.first+g.len-1),
        h('div',{class:'row wrap'},btn('‹',()=>moveMonth(s,-1),false,{'aria-label':'ماه قبل'}),btn('امروز',()=>{s.anchor=D.today();s.selected=D.today();A.route();},true),btn('›',()=>moveMonth(s,1),false,{'aria-label':'ماه بعد'}))),g.grid]),
      card([title(dateLabel(s.selected),'رویدادهای انتخاب‌شده'),
        h('div',{class:'row wrap',style:{marginBottom:'8px'}},btn('＋ ثبت رویداد',()=>addEvent(s.selected),true)),
        events.length?h('div',{class:'stack'},...events.map(evCard)):h('p',{class:'muted small'},'برای این روز رویدادی ثبت نشده است.')]));
  }
  function stateFor(key) {
    const today=D.today(), s=state[key]||(state[key]={anchor:today,selected:today,mode:'month'});
    if(!Number.isFinite(s.anchor))s.anchor=today;if(!Number.isFinite(s.selected))s.selected=today;
    return s;
  }
  function renderAnaquel(root,s) {
    const today=D.today(), events=rangeEvents(today,today+14), open=s.openTile||'calendar';
    const tiles=[
      {id:'clock',name:'ساعت و امروز',value:D.dnum(today)+' '+D.mname(today),detail:'تاریخ امروز و دسترسی سریع'},
      {id:'calendar',name:'تقویم',value:D.mtitle(D.sMonthStart(today)),detail:'نمای ماه و رویدادهای روز'},
      {id:'agenda',name:'رویدادهای نزدیک',value:String(events.length),detail:'برنامه دو هفته آینده'},
      {id:'focus',name:'روز انتخابی',value:D.dnum(s.selected),detail:dateLabel(s.selected)}
    ];
    root.append(card([title('Anaquel · داشبورد تقویمی','کارت‌ها را انتخاب کنید تا بزرگ شوند؛ داده‌ها از تقویم اصلی AIDE خوانده می‌شوند.',chip('BENTO'))]),
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:'10px',marginBottom:'12px'}},...tiles.map(t=>h('button',{type:'button',class:'card hov',onClick:()=>{s.openTile=t.id;A.route();},style:{padding:'16px',textAlign:'start',minHeight:open===t.id?'145px':'108px',gridColumn:open===t.id?'span 2':'span 1',border:'1px solid '+(open===t.id?'var(--accent)':'var(--line)'),background:open===t.id?'var(--today-bg)':'var(--paper)',transition:'all .22s'}},
        h('span',{class:'small muted'},t.name),h('b',{style:{display:'block',fontSize:'22px',margin:'12px 0 5px'}},t.value),h('span',{class:'small muted'},open===t.id?t.detail:'برای گسترش انتخاب کنید')))));
    if(open==='calendar')root.append(calendarPanel(s,{compact:true,round:true}));
    else if(open==='agenda')root.append(card([title('رویدادهای نزدیک','۱۵ روز آینده'),...(events.length?events.map(evCard):[h('p',{class:'muted'},'رویدادی ثبت نشده است.')])]));
    else if(open==='focus')root.append(card([title(dateLabel(s.selected),'برنامه روز'),...dayEvents(s.selected).map(evCard),btn('＋ افزودن رویداد',()=>addEvent(s.selected),true)]));
    else root.append(card([title('ساعت و تاریخ','تاریخ سامانه'),h('div',{style:{fontSize:'30px',fontWeight:'700',margin:'18px 0'}},dateLabel(today)),btn('رفتن به امروز',()=>{s.anchor=today;s.selected=today;s.openTile='calendar';A.route();},true)]));
  }
  function renderConvite(root,s) {
    const events=rangeEvents(D.today(),D.today()+90), rsvps=st('moxenConviteRsvp',{});
    root.append(card([title('Convite · دعوت‌نامه‌ها','تأیید حضور برای رویدادهای موجود در AIDE',chip('RSVP')),
      h('p',{class:'small muted'},'وضعیت حضور ذخیره می‌شود و به حساب فعلی شما متصل است. برای اشتراک‌گذاری، فایل تقویم رویداد ساخته می‌شود.')]));
    if(!events.length){root.append(card([h('p',{class:'muted'},'در ۹۰ روز آینده رویدادی پیدا نشد.'),btn('＋ ساخت رویداد',()=>addEvent(D.today()),true)]));return;}
    root.append(card(events.slice(0,30).map(o=>{
      const id=String((o.ev&&o.ev.id)||o.id||o.day+'-'+o.start+'-'+o.title), status=rsvps[id]||'pending';
      return h('div',{class:'item',style:{marginBottom:'8px',alignItems:'start'}},
        h('span',{class:'grow',style:{minWidth:0}},h('b',null,o.title||'رویداد'),h('small',{class:'muted',style:{display:'block'}},dateLabel(o.day)+' · '+(o.allDay?'تمام روز':A.time(o.start)))),
        h('div',{class:'row wrap'},btn(status==='yes'?'حاضر می‌شوم ✓':'حضور دارم',()=>{rsvps[id]='yes';persist();A.route();},status==='yes'),btn(status==='no'?'عدم حضور ✓':'نمی‌رسم',()=>{rsvps[id]='no';persist();A.route();},false),btn('ICS',()=>downloadICS([o],'aide-invitation.ics')),btn('متن دعوت',()=>{const txt='دعوت به '+(o.title||'رویداد')+String.fromCharCode(10)+'زمان: '+dateLabel(o.day)+' '+(o.allDay?'تمام روز':A.time(o.start))+String.fromCharCode(10)+'وضعیت حضور: '+(rsvps[id]==='yes'?'حاضر می‌شوم':rsvps[id]==='no'?'عدم حضور':'پاسخ داده نشده');if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).catch(()=>window.prompt('متن دعوت را کپی کنید',txt));else window.prompt('متن دعوت را کپی کنید',txt);})));
    })));
  }
  function renderEpoca(root,s) {
    const mode=s.mode||'year', today=D.today();
    if(!root.__epocaZoomBound){
      root.__epocaZoomBound=true;
      root.addEventListener('wheel',e=>{
        if(!e.ctrlKey&&!e.metaKey&&Math.abs(e.deltaY)<18)return;
        if(e.cancelable)e.preventDefault();
        const order=['year','month','week','day'], at=order.indexOf(s.mode||'year');
        s.mode=order[Math.max(0,Math.min(3,at+(e.deltaY>0?1:-1)))];
        A.route();
      },{passive:false});
    }
    root.append(card([title('Época · مرور پیوسته','با انتخاب سال، ماه، هفته یا روز بین مقیاس‌ها جابه‌جا شوید.',
      h('div',{class:'row wrap'},...['year','month','week','day'].map(m=>btn(({year:'سال',month:'ماه',week:'هفته',day:'روز'})[m],()=>{s.mode=m;A.route();},mode===m))))]));
    if(mode==='year'){
      const first=D.sYearStart?D.sYearStart(s.anchor):D.sMonthStart(s.anchor), months=[];let cur=first;
      for(let i=0;i<12;i++){months.push(cur);cur+=D.sMonthLen(cur);}
      root.append(card([h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:'9px'}},...months.map(m=>h('button',{type:'button',class:'card hov',style:{padding:'12px',textAlign:'start'},onClick:()=>{s.anchor=m;s.selected=m;s.mode='month';A.route();}},h('b',null,D.mtitle(m)),h('div',{style:{height:'7px',background:'var(--line)',borderRadius:'8px',margin:'10px 0',overflow:'hidden'}},h('span',{style:{display:'block',height:'100%',width:Math.min(100,rangeEvents(m,m+D.sMonthLen(m)-1).length*8)+'%',background:'var(--accent)'}})),h('small',{class:'muted'},rangeEvents(m,m+D.sMonthLen(m)-1).length+' رویداد'))))]));
    } else if(mode==='month') root.append(calendarPanel(s));
    else if(mode==='week'){
      const ws=A.settings().weekStart==null?(D.isJ()?5:0):A.settings().weekStart, first=D.weekStart(s.anchor,ws);
      root.append(card([h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'6px'}},...Array.from({length:7},(_,i)=>{const d=first+i;return h('button',{type:'button',class:'card',style:{padding:'10px 3px',textAlign:'center',minWidth:0},onClick:()=>{s.selected=d;s.mode='day';A.route();}},h('small',{class:'muted'},D.wletter((ws+i)%7)),h('b',{style:{display:'block',margin:'7px 0'}},D.dnum(d)),chip(String(dayEvents(d).length)));}))]));
    } else root.append(card([title(dateLabel(s.selected),'رویدادهای روز'),...dayEvents(s.selected).map(evCard),btn('＋ رویداد',()=>addEvent(s.selected),true)]));
    root.append(card([btn('← مقیاس بزرگ‌تر',()=>{s.mode=mode==='day'?'week':mode==='week'?'month':'year';A.route();}),btn('امروز',()=>{s.anchor=today;s.selected=today;A.route();}),btn('مقیاس کوچک‌تر →',()=>{s.mode=mode==='year'?'month':mode==='month'?'week':'day';A.route();},true)]));
  }
  function renderLunario(root,s) {
    const g=monthGrid(s), selected=dayEvents(s.selected), monthEvents=rangeEvents(g.first,g.first+g.len-1);
    const multi=monthEvents.filter(o=>o.ev&&o.ev.endDate&&D.parse(o.ev.endDate)>o.day);
    root.append(card([title('Lunario · تقویم ماهانه','نمای ماه، شمار رویدادهای هر روز و جزئیات روز انتخابی.',
      h('div',{class:'row wrap'},btn('‹ ماه قبل',()=>moveMonth(s,-1)),btn('امروز',()=>{s.anchor=D.today();s.selected=D.today();A.route();},true),btn('ماه بعد ›',()=>moveMonth(s,1))))]));
    root.append(card([g.grid]));
    if(multi.length)root.append(card([title('رویدادهای چندروزه','رویدادهایی که بیش از یک روز ادامه دارند'),...multi.slice(0,20).map(evCard)]));
    const weeks=[];for(let i=0;i<g.count;i+=7)weeks.push(g.occ.filter(o=>o.day>=g.start+i&&o.day<g.start+i+7).length);
    root.append(card([title('تراکم هفته‌ها','نمای خلاصه تعداد رویدادها'),
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'4px',alignItems:'end',height:'62px'}},...weeks.map((n,i)=>h('div',{title:'هفته '+(i+1)+': '+n+' رویداد',style:{height:Math.max(8,Math.min(58,n*5+8))+'px',borderRadius:'6px 6px 2px 2px',background:'var(--accent)',opacity:.45+n/(Math.max(1,...weeks))*0.5}})))]));
    root.append(card([title(dateLabel(s.selected),'جزئیات روز'),...selected.map(evCard),btn('＋ رویداد جدید',()=>addEvent(s.selected),true)]));
  }
  function renderParangon(root,s) {
    const today=D.today(), a=Number.isFinite(s.from)?s.from:today-6, b=Number.isFinite(s.to)?Math.max(a,s.to):today;
    const span=Math.max(1,Math.min(366,b-a+1)), prevA=s.compare==='year'?a-364:a-span, prevB=s.compare==='year'?b-364:a-1;
    const current=rangeEvents(a,b), previous=rangeEvents(prevA,prevB), max=Math.max(1,current.length,previous.length);
    const stats=[{name:'بازه انتخابی',n:current.length,color:'var(--accent)'},{name:s.compare==='year'?'همین بازه در سال قبل':'بازه قبلی',n:previous.length,color:'var(--muted)'},{name:'اختلاف',n:current.length-previous.length,color:current.length>=previous.length?'var(--accent)':'var(--danger)'}];
    const bars=h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:'10px'}},
      ...stats.map(x=>h('div',{style:{padding:'14px',background:'var(--canvas)',border:'1px solid var(--line)',borderRadius:'12px'}},
        h('small',{class:'muted'},x.name),
        h('b',{style:{display:'block',fontSize:'28px',margin:'8px 0'}},(x.n>0?'+':'')+x.n),
        h('div',{style:{height:'7px',background:'var(--line)',borderRadius:'9px',overflow:'hidden'}},
          h('span',{style:{display:'block',height:'100%',width:Math.abs(x.n)/max*100+'%',background:x.color}})))));
    root.append(card([
      title('Parangón · مقایسه بازه‌ها','دو بازه را انتخاب کنید و تعداد رویدادها را با دوره قبل مقایسه کنید.',chip('COMPARE')),
      h('div',{class:'row wrap'},
        h('label',{class:'small'},'شروع بازه ',h('input',{type:'date',value:D.iso(a),onChange:e=>{const n=D.parse(e.target.value);if(n!=null){s.from=n;A.route();}},style:{display:'block',maxWidth:'100%'}})),
        h('label',{class:'small'},'پایان بازه ',h('input',{type:'date',value:D.iso(b),onChange:e=>{const n=D.parse(e.target.value);if(n!=null){s.to=Math.max(n,a);A.route();}},style:{display:'block',maxWidth:'100%'}}))),
      h('div',{class:'row wrap',style:{marginTop:'10px'}},
        btn('۷ روز',()=>{s.from=today-6;s.to=today;A.route();}),
        btn('۳۰ روز',()=>{s.from=today-29;s.to=today;A.route();}),
        btn('سال تا امروز',()=>{s.from=D.sYearStart?D.sYearStart(today):today-364;s.to=today;A.route();}),
        btn(s.compare==='year'?'مقایسه با بازه قبلی':'مقایسه با سال قبل',()=>{s.compare=s.compare==='year'?'period':'year';A.route();},true)
      )
    ]));
    const nBars=Math.min(span,31), dailyCurrent=Array.from({length:nBars},(_,i)=>rangeEvents(a+Math.floor(i*span/nBars),a+Math.floor(i*span/nBars)).length), dailyPrevious=Array.from({length:nBars},(_,i)=>rangeEvents(prevA+Math.floor(i*span/nBars),prevA+Math.floor(i*span/nBars)).length);
    const miniChart=h('div',{style:{display:'grid',gridTemplateColumns:'repeat('+nBars+',minmax(2px,1fr))',gap:'3px',height:'64px',alignItems:'end',marginTop:'12px'}},
      ...dailyCurrent.map((n,i)=>h('div',{title:dateLabel(a+Math.floor(i*span/nBars))+': '+n+' رویداد',style:{height:Math.max(4,Math.min(60,n*12+4))+'px',background:'var(--accent)',borderRadius:'3px 3px 0 0',position:'relative'}},
        h('span',{style:{position:'absolute',bottom:0,left:0,right:0,height:Math.max(2,Math.min(58,dailyPrevious[i]*12+2))+'px',borderTop:'2px dashed var(--ink)',opacity:.6}}))));
    root.append(card([bars,miniChart,h('p',{class:'small muted'},dateLabel(a)+' تا '+dateLabel(b)+' در برابر '+dateLabel(prevA)+' تا '+dateLabel(prevB))]));
    root.append(card([title('رویدادهای بازه فعلی',current.length+' مورد'),...current.slice(0,30).map(evCard)]));
  }
  function renderSemana(root,s) {
    const ws=A.settings().weekStart==null?(D.isJ()?5:0):A.settings().weekStart, first=D.weekStart(s.anchor,ws), startHour=Math.max(0,Math.min(22,Number(s.startHour==null?8:s.startHour))), endHour=Math.max(startHour+2,Math.min(24,Number(s.endHour==null?20:s.endHour)));
    root.append(card([title('Semana · برنامه‌ریز هفتگی','روی هر بازه خالی بزنید تا رویداد در همان روز و ساعت ساخته شود؛ رویدادهای هم‌زمان در فهرست همان روز دیده می‌شوند.',
      h('div',{class:'row wrap'},btn('‹ هفته قبل',()=>{s.anchor-=7;A.route();}),btn('امروز',()=>{s.anchor=D.today();s.selected=D.today();A.route();},true),btn('هفته بعد ›',()=>{s.anchor+=7;A.route();}))),
      h('div',{class:'row wrap',style:{marginBottom:'8px'}},h('label',{class:'small'},'از ساعت ',h('select',{value:startHour,onChange:e=>{s.startHour=+e.target.value;A.route();}},...Array.from({length:18},(_,i)=>h('option',{value:i},String(i).padStart(2,'0')+':00')))),h('label',{class:'small'},'تا ساعت ',h('select',{value:endHour,onChange:e=>{s.endHour=+e.target.value;A.route();}},...Array.from({length:24},(_,i)=>h('option',{value:i+1},String(i+1).padStart(2,'0')+':00')))))]));
    const grid=h('div',{style:{display:'grid',gridTemplateColumns:'48px repeat(7,minmax(0,1fr))',gap:'3px',overflowX:'auto'}});
    grid.append(h('div',{}),...Array.from({length:7},(_,i)=>h('button',{type:'button',class:'btn',style:{padding:'6px 2px',fontSize:'11px'},onClick:()=>{s.selected=first+i;A.route();}},D.wletter((ws+i)%7)+' '+D.dnum(first+i))));
    for(let hr=startHour;hr<endHour;hr++){
      grid.append(h('div',{class:'small muted',style:{paddingTop:'8px',fontSize:'10px'}},String(hr).padStart(2,'0')+':00'));
      for(let i=0;i<7;i++){
        const day=first+i, minute=hr*60, evs=dayEvents(day).filter(o=>!o.allDay&&o.start<minute+60&&o.end>minute);
        grid.append(h('button',{type:'button',title:dateLabel(day)+' '+String(hr).padStart(2,'0')+':00',onClick:()=>addEvent(day,minute),style:{minWidth:'0',minHeight:'38px',padding:'3px',border:'1px solid var(--line)',borderRadius:'5px',background:evs.length?'var(--today-bg)':'var(--canvas)',fontSize:'10px',overflow:'hidden',textAlign:'start'}},evs.length?evs.map(o=>o.title||'رویداد').join('، '):'＋'));
      }
    }
    root.append(card([grid]),card([title('برنامه روز انتخابی',dateLabel(s.selected)),...dayEvents(s.selected).map(evCard),btn('＋ ثبت رویداد در این روز',()=>addEvent(s.selected),true)]));
  }
  function parseICS(text) {
    const lines=text.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'').split(/\r?\n/), items=[];let cur=null;
    for(const line of lines){if(line==='BEGIN:VEVENT'){cur={};continue;}if(line==='END:VEVENT'){if(cur&&cur.start!=null)items.push(cur);cur=null;continue;}if(!cur)continue;
      const m=line.match(/^([^;:]+)(?:;[^:]*)?:(.*)$/);if(!m)continue;const k=m[1].toUpperCase(),v=m[2];
      if(k==='SUMMARY')cur.title=v.replace(/\\n/g,' ');
      if(k==='DTSTART')cur.start=icsDay(v);
      if(k==='DTEND')cur.end=icsDay(v);
    }return items;
  }
  function icsDay(v){const m=String(v).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);if(!m)return null;return {date:m[1]+'-'+m[2]+'-'+m[3],minute:m[4]?+m[4]*60+(+m[5]):null};}
  function downloadICS(events,filename) {
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AIDE//Calendar//FA'];
    events.forEach((o,i)=>{const iso=D.iso(o.day).replace(/-/g,'');const min=o.start||0;const stamp=iso+'T'+String(Math.floor(min/60)).padStart(2,'0')+String(min%60).padStart(2,'0')+'00';
      lines.push('BEGIN:VEVENT','UID:aide-'+Date.now()+'-'+i+'@aide','DTSTART:'+stamp,'SUMMARY:'+(o.title||'AIDE event').replace(/[\r\n,;]/g,' '),'END:VEVENT');});
    lines.push('END:VCALENDAR');const blob=new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename||'aide-calendar.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function renderSolape(root,s) {
    const local=rangeEvents(D.today()-30,D.today()+120), settings=A.settings(), imported=s.imported||settings.moxenSolapeImported||[];
    const all=local.map(o=>Object.assign({source:'AIDE'},o)).concat(imported.map(o=>Object.assign({source:'ICS'},o)));
    const pairs=[];
    for(let i=0;i<all.length;i++) for(let j=i+1;j<all.length;j++) {
      const a=all[i],b=all[j];
      if(a.day!==b.day||a.allDay||b.allDay||a.source===b.source) continue;
      if((a.start||0)<(b.end||0)&&(b.start||0)<(a.end||0)) {
        const key=[a.id||a.title||'',b.id||b.title||'',a.day,a.start,b.start].join('|');
        if(!(s.ignoredConflicts||[]).includes(key)) pairs.push({a,b,day:a.day,key});
      }
    }
    const fileInput=h('input',{type:'file',accept:'.ics',style:{display:'none'},onChange:e=>{
      const f=e.target.files&&e.target.files[0]; if(!f)return;
      const reader=new FileReader();
      reader.onload=()=>{
        s.imported=parseICS(String(reader.result)).map((o,i)=>{
          const day=o.start&&D.parse(o.start.date);
          return day==null?null:{id:'ics-'+i,title:o.title||'رویداد واردشده',day,start:o.start.minute==null?0:o.start.minute,
            end:o.end&&o.end.minute!=null?o.end.minute:(o.start.minute||0)+60,allDay:o.start.minute==null,source:'ICS'};
        }).filter(Boolean);
        settings.moxenSolapeImported=s.imported; A.save('settings');
        A.route();
      };
      reader.readAsText(f);
    }});
    root.append(card([
      title('Solape · بررسی تداخل‌ها','رویدادهای AIDE را با فایل ICS مقایسه کنید. فایل واردشده فقط برای بررسی همین نشست خوانده می‌شود.',chip('ICS')),
      h('label',{class:'btn',style:{display:'inline-flex',alignItems:'center',cursor:'pointer'}},'＋ واردکردن فایل ICS',fileInput),
      btn('خروجی تقویم AIDE',()=>downloadICS(local,'aide-calendar.ics'),true),
      btn('حذف فایل واردشده',()=>{s.imported=[];settings.moxenSolapeImported=[];A.save('settings');A.route();}),
      btn('خروجی ترکیبی',()=>downloadICS(local.concat(imported),'aide-combined-calendar.ics'))
    ]));
    root.append(card([
      title('نتیجه بررسی',pairs.length+' تداخل پیدا شد'),
      pairs.length ? h('div',{class:'stack'},...pairs.slice(0,40).map(p=>
        h('div',{class:'item',style:{alignItems:'start'}},
          h('span',{class:'grow'},
            h('b',null,dateLabel(p.day)),
            h('small',{class:'muted',style:{display:'block'}},(p.a.title||'رویداد AIDE')+' ('+A.time(p.a.start)+') ↔ '+(p.b.title||'رویداد ICS')+' ('+A.time(p.b.start)+')')),
          btn('ساخت رویداد در زمان دیگر',()=>addEvent(p.day,Math.min(23*60,(p.a.end||p.a.start+60))),true),
          btn('نادیده‌گرفتن این تداخل',()=>{s.ignoredConflicts=s.ignoredConflicts||[];s.ignoredConflicts.push(p.key);A.route();})
        )
      )) : h('p',{class:'muted'},'تداخل بین رویدادهای AIDE و فایل واردشده پیدا نشد.')
    ]));
  }
  function addMonths(day,n){return D.sAddMonths(day,n);}
  function renderTregua(root,s) {
    const settings=A.settings(), until=Number(settings.moxenTreguaUntil||0), active=until>D.today();
    root.append(card([title('Tregua · وقفه موقت','یادآوری‌های این نمای اختصاصی را برای مدتی متوقف کنید؛ رویدادهای اصلی AIDE حذف یا تغییر نمی‌کنند.',
      chip(active?'وقفه فعال':'فعال')),
      h('div',{style:{padding:'18px',borderRadius:'14px',background:active?'var(--today-bg)':'var(--canvas)',border:'1px solid var(--line)'}},
        h('div',{class:'small muted'},active?'بازگشت برنامه‌ریزی‌شده':'وضعیت فعلی'),
        h('b',{style:{display:'block',fontSize:'23px',margin:'8px 0'}},active?dateLabel(until):'یادآورها فعال هستند'),
        h('p',{class:'small muted'},active?'تا تاریخ بازگشت، یادآوری‌های این صفحه متوقف‌اند.':'یک بازه انتخاب کنید تا اعلان‌های این صفحه موقتاً کنار گذاشته شوند.')),
      h('div',{class:'row wrap',style:{marginTop:'12px'}},...[
        {n:1,label:'وقفه ۱ ماهه'},{n:2,label:'وقفه ۲ ماهه'},{n:3,label:'وقفه ۳ ماهه'}
      ].map(x=>btn(x.label,()=>{settings.moxenTreguaUntil=addMonths(D.today(),x.n);persist();A.route();},false)),
      active?btn('لغو وقفه و فعال‌سازی',()=>{settings.moxenTreguaUntil=0;persist();A.route();},true):null)]));
    root.append(card([title('چه چیزی حفظ می‌شود؟','شفافیت درباره داده‌ها'),
      h('div',{class:'stack'},h('div',{class:'item'},h('span',{class:'grow'},h('b',null,'رویدادها و قرارها'),h('small',{class:'muted',style:{display:'block'}},'در تقویم اصلی AIDE باقی می‌مانند.')),chip('حفظ می‌شود')),
        h('div',{class:'item'},h('span',{class:'grow'},h('b',null,'تنظیم وقفه'),h('small',{class:'muted',style:{display:'block'}},'در تنظیمات آنلاین حساب ذخیره می‌شود.')),chip('آنلاین')))]));
  }
  function renderTurno(root,s) {
    const day=s.selected, start=Number(A.settings().dayStart==null?9:A.settings().dayStart)*60, end=Math.min(24*60,Number(A.settings().dayEnd==null?17:A.settings().dayEnd)*60);
    const occupied=dayEvents(day).filter(o=>!o.allDay), slots=[];
    for(let t=start;t+60<=end;t+=30){const busy=occupied.some(o=>t<(o.end||o.start+60)&&t+60>(o.start||0));if(!busy)slots.push(t);}
    root.append(card([title('Turno · رزرو زمان','روز را انتخاب کنید، یکی از بازه‌های آزاد را برگزینید و برای ثبت نهایی رویداد بسازید.',chip('BOOKING')),
      h('label',{class:'small'},'تاریخ رزرو',h('input',{type:'date',value:D.iso(day),onChange:e=>{const n=D.parse(e.target.value);if(n!=null){s.selected=n;s.anchor=n;s.slot=null;A.route();}},style:{display:'block',marginTop:'5px',maxWidth:'100%'}})),
      h('div',{class:'row wrap',style:{marginTop:'12px'}},btn('روز قبل',()=>{s.selected--;s.anchor=s.selected;s.slot=null;A.route();}),btn('امروز',()=>{s.selected=D.today();s.anchor=s.selected;s.slot=null;A.route();},true),btn('روز بعد',()=>{s.selected++;s.anchor=s.selected;s.slot=null;A.route();}))]));
    root.append(card([title(dateLabel(day),'بازه‌های یک‌ساعته آزاد'),
      slots.length?h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(92px,1fr))',gap:'8px'}},...slots.map(t=>btn(A.time(t)+' – '+A.time(t+60),()=>{s.slot=t;A.route();},s.slot===t))):h('p',{class:'muted'},'در این روز بازه آزادی در ساعات کاری تنظیم‌شده وجود ندارد.'),
      s.slot!=null?h('div',{class:'card',style:{padding:'12px',marginTop:'12px',background:'var(--today-bg)'}},h('b',null,'رزرو انتخاب‌شده: '+A.time(s.slot)),h('p',{class:'small muted'},'با تأیید، فرم رویداد AIDE با تاریخ و ساعت انتخابی باز می‌شود.'),btn('تأیید و ثبت در تقویم',()=>addEvent(day,s.slot),true)):null,
      btn('دانلود برنامه روز',()=>downloadICS(dayEvents(day),'aide-day.ics'))]));
  }
  function renderVencimientos(root,s) {
    const settings=A.settings(), bills=Array.isArray(settings.moxenBills)?settings.moxenBills:[], first=D.sMonthStart(s.anchor), len=D.sMonthLen(s.anchor), yearStart=D.sYearStart?D.sYearStart(first):first-364, mode=s.totalMode||'month';
    const active=bills.filter(b=>!b.cancelled), monthBills=active.filter(b=>{const day=D.parse(b.date);return day!=null&&day>=first&&day<first+len;}), total=monthBills.reduce((n,b)=>n+(Number(b.amount)||0),0);
    const yearlyBills=active.filter(b=>{const day=D.parse(b.date);return day!=null&&day>=yearStart&&day<yearStart+365;}), yearly=yearlyBills.reduce((n,b)=>n+(Number(b.amount)||0),0);
    const displayed=mode==='year'?yearlyBills:monthBills, displayedTotal=mode==='year'?yearly:total;
    root.append(card([title('Vencimientos · تقویم سررسیدها','سررسیدهای پرداخت، مبلغ ماهانه و جمع سالانه؛ فهرست در تنظیمات آنلاین حساب ذخیره می‌شود.',
      h('div',{class:'row wrap'},btn('‹ ماه قبل',()=>moveMonth(s,-1)),btn('امروز',()=>{s.anchor=D.today();s.selected=D.today();A.route();},true),btn('ماه بعد ›',()=>moveMonth(s,1)))),
      h('div',{class:'row wrap',style:{marginBottom:'10px'}},btn('نمای ماهانه',()=>{s.totalMode='month';A.route();},mode==='month'),btn('نمای سالانه',()=>{s.totalMode='year';A.route();},mode==='year')),
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:'9px'}},...[
        ['جمع ماه',total.toLocaleString('fa-IR')],['جمع سال',yearly.toLocaleString('fa-IR')],['جمع نمای فعلی',displayedTotal.toLocaleString('fa-IR')],['تعداد پرداخت‌ها',String(displayed.length)]
      ].map(x=>h('div',{style:{padding:'12px',background:'var(--canvas)',border:'1px solid var(--line)',borderRadius:'12px'}},h('small',{class:'muted'},x[0]),h('b',{style:{display:'block',fontSize:'21px',marginTop:'7px'}},x[1]))))]));
    const g=monthGrid(s,{compact:true});
    root.append(card([g.grid]));
    root.append(card([title('افزودن سررسید','نام، مبلغ و تاریخ پرداخت'),
      h('form',{class:'stack',onSubmit:e=>{e.preventDefault();const f=e.currentTarget;const name=f.elements.name.value.trim(),amount=Number(f.elements.amount.value),date=f.elements.date.value;if(!name||!date||!Number.isFinite(amount))return;bills.push({id:'bill-'+Date.now(),name,amount,date,cancelled:false});settings.moxenBills=bills;persist();f.reset();A.route();}},
        h('input',{name:'name',required:true,placeholder:'نام سرویس یا پرداخت'}),
        h('input',{name:'amount',type:'number',min:'0',step:'any',required:true,placeholder:'مبلغ'}),
        h('input',{name:'date',type:'date',required:true,value:D.iso(s.selected)}),
        h('button',{type:'submit',class:'btn primary'},'＋ ثبت سررسید'))]));
    root.append(card([title('فهرست پرداخت‌ها','لغو، بازگردانی و فیلتر بر اساس ماه یا سال'),
      bills.length?h('div',{class:'stack'},...bills.filter(b=>mode==='year'||(D.parse(b.date)!=null&&D.parse(b.date)>=first&&D.parse(b.date)<first+len)||b.cancelled).map(b=>h('div',{class:'item',style:{opacity:b.cancelled?.55:1}},h('span',{class:'grow',style:{minWidth:0}},h('b',{style:{textDecoration:b.cancelled?'line-through':'none'}},b.name),h('small',{class:'muted',style:{display:'block'}},b.date+' · '+Number(b.amount).toLocaleString('fa-IR'))),b.cancelled?btn('بازگردانی',()=>{b.cancelled=false;persist();A.route();},true):btn('لغو',()=>{b.cancelled=true;persist();A.route();},false)))):h('p',{class:'muted'},'هنوز سررسیدی ثبت نشده است.'),
      btn('بازگردانی آخرین لغو',()=>{const b=[...bills].reverse().find(x=>x.cancelled);if(b){b.cancelled=false;persist();A.route();}},true)]));
  }
  const renderers={
    'moxen-anaquel':renderAnaquel,'moxen-convite':renderConvite,'moxen-epoca':renderEpoca,'moxen-lunario':renderLunario,
    'moxen-parangon':renderParangon,'moxen-semana':renderSemana,'moxen-solape':renderSolape,'moxen-tregua':renderTregua,
    'moxen-turno':renderTurno,'moxen-vencimientos':renderVencimientos
  };
  specs.forEach(([key,name,desc])=>{
    A.views[key]={title:name,sub:desc,flush:false,render(root){
      const s=stateFor(key);
      root.append(card([h('div',{class:'row wrap',style:{justifyContent:'space-between',alignItems:'center',gap:'8px'}},
        h('div',{class:'grow',style:{minWidth:'140px'}},h('h1',{style:{fontSize:'22px',margin:'0 0 4px'}},name),h('p',{class:'small muted',style:{margin:0}},desc)),
        h('div',{class:'row wrap'},chip(D.isJ()?'شمسی':'میلادی'),btn('تقویم اصلی',()=>{location.hash='#/calendar';A.route();})))]));
      renderers[key](root,s);
    }};
  });
})();