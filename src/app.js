const APP_VERSION='1.1.0';
const SK = 'rs4';
const ICON_PENCIL = '<svg class="ico-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>';
const ICON_CHEVRON = '<svg class="ico-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

const BOOM='BOOM 💥';

let S = JSON.parse(localStorage.getItem(SK) || 'null') || {
  cities:[], buffer:30, rallyWait:300, leadOffset:0, supportOffset:-1,
  counters:[{id:1,impactOff:-2}],
  waveNum:0, running:false, hitTime:null, lastWave:null,
  logs:[], castleName:'svs 1654 vs', fatFingers:false
};
const DEFAULT_CASTLE='svs 1654 vs';
if(!S.logs) S.logs=[];
if(!S.castleName||!String(S.castleName).trim())S.castleName=DEFAULT_CASTLE;
if(S.rallyWait===undefined)S.rallyWait=300;
if(S.leadOffset===undefined)S.leadOffset=0;
if(S.supportOffset===undefined)S.supportOffset=-1;
if(!S.counters||!S.counters.length)S.counters=[{id:1,impactOff:-2}];
S.counters.forEach(c=>{if(c.impactOff===undefined)c.impactOff=-(c.offset??2);});
if(!S.impactDefaultsV2){
  if(S.leadOffset===1&&S.supportOffset===0&&S.counters.length===1&&S.counters[0].impactOff===-1){
    S.leadOffset=0;S.supportOffset=-1;S.counters[0].impactOff=-2;
  }
  S.impactDefaultsV2=true;
}
S.cities.forEach(c=>{if(c.type==='counter'&&!c.counterId)c.counterId=S.counters[0].id;});
if(S.lastWave===undefined) S.lastWave=null;
if(S.fatFingers===undefined) S.fatFingers=false;
S.cities.forEach(c=>{if(c.captain===undefined)c.captain=false;if(c.lead===undefined)c.lead=false;});
(function migrateLeads(){
  let li=S.cities.findIndex(c=>c.lead);
  if(li<0){
    li=S.cities.findIndex(c=>c.type==='main'&&!c.captain);
    if(li>=0)S.cities[li].lead=true;
  }
  S.cities.forEach((c,i)=>{
    if(c.type==='counter'){c.lead=false;c.captain=false;}
    else if(c.lead){c.type='main';c.captain=false;}
    else if(c.type==='main'){c.lead=false;c.captain=true;}
  });
})();

let ticker=null, previewTicker=null, beepCtx=null, beeped={}, tab='cities', editId=null;

function sv(){localStorage.setItem(SK,JSON.stringify(S));}
function castleTitle(){
  const n=(S.castleName||'').trim();
  return n||DEFAULT_CASTLE;
}
function updateAppTitle(){document.title=castleTitle();}
function updateVersionLabel(){
  const el=document.getElementById('footer-ver');
  if(el)el.textContent='v'+APP_VERSION;
}
function applyFatFingersMode(){
  document.body.classList.toggle('fat-fingers',!!S.fatFingers);
}
function toggleFatFingers(){
  S.fatFingers=!S.fatFingers;
  sv();
  applyFatFingersMode();
  render();
}
function fmtCountdown(s){
  const t=Math.ceil(s);
  if(t<=0)return'';
  return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
}
const ARRIVAL_BOOM_SEC=3;
function rallyWait(){return Math.max(0,S.rallyWait||0);}
function fmtRallyShort(sec){
  const s=sec!=null?sec:rallyWait();
  if(s>=60&&s%60===0)return(s/60)+'m';
  return s+'s';
}
function cityArrivalMs(c,hitTime){
  if(c.sendAt!=null)return c.sendAt+rallyWait()*1000+c.travel*1000;
  const off=sendOffset(c);
  return hitTime-off*1000;
}
function secsUntilArrival(c,hitTime){
  return(cityArrivalMs(c,hitTime)-Date.now())/1000;
}
function isCityArrivalBoom(c,hitTime){
  if(!hitTime)return false;
  const s=secsUntilArrival(c,hitTime);
  return s<=0&&s>-ARRIVAL_BOOM_SEC;
}
function arrivingCards(cards,hitTime){
  return cards.filter(c=>isCityArrivalBoom(c,hitTime));
}
function impactBoomText(cards,hitTime){
  const arr=arrivingCards(cards,hitTime);
  if(!arr.length)return'';
  const names=arr.map(c=>c.name).join(', ');
  return BOOM+' '+names;
}
function impactCountdownText(cards,hitTime,live){
  if(!live||!hitTime)return'';
  const boom=impactBoomText(cards,hitTime);
  if(boom)return boom;
  const secs=(hitTime-Date.now())/1000;
  if(secs<1)return'';
  return fmtCountdown(secs);
}
function impactBarBoom(cards,hitTime,live){
  return live&&hitTime&&arrivingCards(cards,hitTime).length>0;
}
function cardTimerText(s,sending,sent){
  if(sent)return'SENT';
  if(sending)return'SEND';
  return fmtCountdown(s);
}
function fmtClock(ts){return new Date(ts).toTimeString().slice(0,8);}
function fmtDate(ts){const d=new Date(ts);return d.toLocaleDateString()+' '+d.toTimeString().slice(0,5);}

function counterLabel(id){
  const i=S.counters.findIndex(c=>c.id===(id||S.counters[0]?.id));
  return i<=0?'Counter':'Counter '+(i+1);
}
function counterImpactOff(c){
  const g=S.counters.find(x=>x.id===(c.counterId||S.counters[0]?.id));
  return g?g.impactOff:0;
}
function impactOffsetFor(c){
  if(c.lead)return S.leadOffset||0;
  if(c.type==='counter')return counterImpactOff(c);
  return S.supportOffset||0;
}
function sendOffset(c){return-impactOffsetFor(c);}
function fmtImpactOff(n){
  if(n>0)return'+'+n+'s';
  if(n<0)return n+'s';
  return'0';
}
function effectiveTravel(c){return Math.max(1,rallyWait()+c.travel+sendOffset(c));}

function rallyRole(c){
  if(c.type==='counter')return{label:counterLabel(c.counterId),cls:'rl-counter'};
  if(c.lead)return{label:'Lead',cls:'rl-lead'};
  return{label:'Support',cls:'rl-support'};
}
function cityRoleValue(c){
  if(c.type==='counter')return'counter:'+(c.counterId||S.counters[0]?.id||1);
  if(c.lead)return'lead';
  return'support';
}
function roleOptionsHtml(sel){
  let h=`<option value="lead"${sel==='lead'?' selected':''}>Lead</option>
    <option value="support"${sel==='support'?' selected':''}>Support</option>`;
  S.counters.forEach(cnt=>{
    const v='counter:'+cnt.id;
    h+=`<option value="${v}"${sel===v?' selected':''}>${counterLabel(cnt.id)}</option>`;
  });
  return h;
}
function applyCityRole(i,role){
  if(role==='lead'){
    S.cities.forEach((c,j)=>{
      if(j===i){c.lead=true;c.captain=false;c.type='main';delete c.counterId;}
      else if(c.lead){c.lead=false;c.captain=true;c.type='main';delete c.counterId;}
    });
  }else if(role.startsWith('counter:')){
    const c=S.cities[i];
    c.lead=false;c.captain=false;c.type='counter';
    c.counterId=parseInt(role.split(':')[1])||S.counters[0]?.id;
  }else{
    const c=S.cities[i];
    c.lead=false;c.captain=true;c.type='main';
    delete c.counterId;
  }
}
function setLeadOffset(val){S.leadOffset=parseInt(val)||0;sv();}
function setSupportOffset(val){
  S.supportOffset=Math.min(0,parseInt(val)||0);
  sv();render();
}
function setCounterImpactOff(id,val){
  const g=S.counters.find(c=>c.id===id);
  if(g){g.impactOff=Math.min(0,parseInt(val)||0);sv();render();}
}
function logArrivalTs(c,rallySec){const rw=rallySec!=null?rallySec:rallyWait();return c.sendAt+rw*1000+c.travel*1000;}
function addCounter(){
  const id=Math.max(0,...S.counters.map(c=>c.id))+1;
  S.counters.push({id,impactOff:-2});
  sv();render();
}
function removeCounter(id){
  if(S.counters.length<=1)return;
  if(S.cities.some(c=>c.type==='counter'&&(c.counterId||S.counters[0].id)===id)){
    alert('A city still uses this counter group. Change it first.');
    return;
  }
  S.counters=S.counters.filter(c=>c.id!==id);
  sv();render();
}
function cityBadges(c){
  const r=rallyRole(c);
  const bcls=r.cls==='rl-counter'?'bc':r.cls==='rl-support'?'bcap':'bm';
  return`<span class="badge ${bcls}"><span class="role-dot ${r.cls}"></span>${r.label}</span>`;
}

function beep(f,d){
  try{
    if(!beepCtx)beepCtx=new(window.AudioContext||window.webkitAudioContext)();
    const o=beepCtx.createOscillator(),g=beepCtx.createGain();
    o.connect(g);g.connect(beepCtx.destination);
    o.frequency.value=f;
    g.gain.setValueAtTime(0.3,beepCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,beepCtx.currentTime+d);
    o.start();o.stop(beepCtx.currentTime+d);
  }catch(e){}
}
function beepImpact(strong){
  try{
    if(!beepCtx)beepCtx=new(window.AudioContext||window.webkitAudioContext)();
    const t=beepCtx.currentTime;
    const dur=strong?0.55:0.32;
    const g=beepCtx.createGain();
    g.connect(beepCtx.destination);
    g.gain.setValueAtTime(strong?0.42:0.28,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    const o=beepCtx.createOscillator();
    o.type=strong?'triangle':'sine';
    o.frequency.setValueAtTime(strong?160:200,t);
    o.frequency.exponentialRampToValueAtTime(strong?48:65,t+dur*0.85);
    o.connect(g);
    o.start(t);o.stop(t+dur);
    if(strong){
      const o2=beepCtx.createOscillator();
      o2.type='sine';
      o2.frequency.value=80;
      o2.connect(g);
      o2.start(t+0.1);o2.stop(t+0.45);
    }
    if(navigator.vibrate)navigator.vibrate(strong?[80,40,120]:40);
  }catch(e){}
}

function editBtnIcon(open){return open ? ICON_CHEVRON : ICON_PENCIL;}

function activeCards(){
  if(!S.hitTime)return[];
  return S.cities.filter(c=>c.active).map(c=>{
    const off=sendOffset(c);
    const sendAt=S.hitTime-(rallyWait()+c.travel+off)*1000;
    return{...c,sendAt,secsLeft:(sendAt-Date.now())/1000};
  }).sort((a,b)=>a.sendAt-b.sendAt);
}

function waveSnapshot(){
  const cards=activeCards();
  return{
    waveNum:S.waveNum,
    hitTime:S.hitTime,
    canceledAt:Date.now(),
    cities:cards.map(c=>({
      id:c.id,name:c.name,travel:c.travel,type:c.type,captain:!!c.captain,lead:!!c.lead,
      counterId:c.counterId,sendAt:c.sendAt,secsLeft:c.secsLeft
    }))
  };
}

function hasWaveTab(){return S.running||!!S.lastWave;}

function startWave(){
  const act=S.cities.filter(c=>c.active);
  if(!act.length)return;
  const maxT=Math.max(...act.map(effectiveTravel));
  S.hitTime=Date.now()+(maxT+S.buffer)*1000;
  S.running=true; S.waveNum++; S.lastWave=null; beeped={}; tab='wave';
  sv(); if(ticker)clearInterval(ticker); ticker=null; render();
}

function pushWaveLog(canceled){
  const cards=activeCards();
  if(!S.hitTime||!cards.length)return;
  S.logs.unshift({
    id:Date.now(),
    castle:castleTitle(),
    wave:S.waveNum,
    hitTime:S.hitTime,
    canceled:!!canceled,
    canceledAt:canceled?Date.now():null,
    rallyWait:rallyWait(),
    appVersion:APP_VERSION,
    cities:cards.map(c=>({
      name:c.name,travel:c.travel,type:c.type,lead:!!c.lead,captain:!!c.captain,
      counterId:c.counterId,impactOff:impactOffsetFor(c),sendAt:c.sendAt
    }))
  });
  if(S.logs.length>50)S.logs=S.logs.slice(0,50);
}

function cancelWave(){
  if(S.hitTime){
    pushWaveLog(true);
    S.lastWave=waveSnapshot();
  }
  S.running=false; S.hitTime=null;
  if(ticker){clearInterval(ticker);ticker=null;}
  sv(); render();
}

function finishWave(){
  pushWaveLog(false);
  if(ticker){clearInterval(ticker);ticker=null;}
  S.running=false; S.hitTime=null;
  sv(); setTimeout(startWave,60);
}

function resetDay(){
  if(!confirm('Reset wave count and logs for a new castle? Cities will be kept.'))return;
  S.waveNum=0; S.running=false; S.hitTime=null; S.lastWave=null; S.logs=[];
  if(ticker){clearInterval(ticker);ticker=null;}
  sv(); render();
}

function goWave(){
  try{beepCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}
  startWave();
}

function previewPlan(){
  const act=S.cities.filter(c=>c.active);
  if(!act.length)return null;
  const prep=Math.max(0,S.buffer||0);
  const maxT=Math.max(...act.map(effectiveTravel));
  const hitTime=Date.now()+(maxT+prep)*1000;
  const cards=act.map(c=>{
    const off=sendOffset(c);
    const sendAt=hitTime-(rallyWait()+c.travel+off)*1000;
    const impactAt=sendAt+rallyWait()*1000+c.travel*1000;
    return{...c,sendAt,impactAt};
  }).sort((a,b)=>a.sendAt-b.sendAt);
  return{waveNum:S.waveNum+1,hitTime,prep,cards,firstSendAt:cards[0].sendAt};
}
function previewPrepHint(prep){
  if(prep>0)return prep+'s prep after GO';
  return'no prep — first send on GO';
}
function previewCityLineText(c){
  const r=rallyRole(c);
  return`${c.name} · ${r.label} · send ${fmtClock(c.sendAt)} · impact ${fmtClock(c.impactAt)}`;
}
function planToClipboardText(plan){
  let t=`${castleTitle()} — Wave ${plan.waveNum}\n`;
  t+=`${previewPrepHint(plan.prep)} · first send ${fmtClock(plan.firstSendAt)}\n`;
  t+=`Castle hit: ${fmtClock(plan.hitTime)}\n\n`;
  plan.cards.forEach(c=>{t+=previewCityLineText(c)+'\n';});
  return t.trim();
}
function wavePreviewInnerHtml(plan){
  const lines=plan.cards.map(c=>{
    const r=rallyRole(c);
    return`<div class="wvpreview-line ${r.cls}">
      <span class="role-dot ${r.cls}"></span>
      <strong>${c.name}</strong> · ${r.label} · send <span class="wvpreview-t">${fmtClock(c.sendAt)}</span> · impact <span class="wvpreview-t">${fmtClock(c.impactAt)}</span>
    </div>`;
  }).join('');
  return`<div class="wvpreview-hd">Wave ${plan.waveNum} preview <span class="wvpreview-sub">— ${previewPrepHint(plan.prep)}</span></div>
    <div class="wvpreview-hit">First send ${fmtClock(plan.firstSendAt)} · Castle hit ${fmtClock(plan.hitTime)}</div>
    <div class="wvpreview-lines">${lines}</div>`;
}
function wavePreviewHtml(){
  if(S.running)return'';
  const plan=previewPlan();
  if(!plan)return'';
  return`<div class="wvpreview" id="wvpreview">
    <div id="wvpreview-body">${wavePreviewInnerHtml(plan)}</div>
    <button type="button" class="btnS" id="copyplanbtn" onclick="copyWavePlan()" style="margin-top:10px;margin-bottom:0">
      <i class="ti ti-copy" aria-hidden="true"></i> Copy plan
    </button>
  </div>`;
}
function updateWavePreview(){
  const body=document.getElementById('wvpreview-body');
  if(!body)return;
  const plan=previewPlan();
  const wrap=document.getElementById('wvpreview');
  if(!plan){
    if(wrap)wrap.style.display='none';
    return;
  }
  if(wrap)wrap.style.display='';
  body.innerHTML=wavePreviewInnerHtml(plan);
}
function copyWavePlan(){
  const plan=previewPlan();
  if(!plan){alert('No active cities to copy.');return;}
  const text=planToClipboardText(plan);
  const done=()=>{
    const btn=document.getElementById('copyplanbtn');
    if(!btn)return;
    const orig=btn.innerHTML;
    btn.innerHTML='<i class="ti ti-check" aria-hidden="true"></i> Copied!';
    setTimeout(()=>{btn.innerHTML=orig;},2000);
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>copyWavePlanFallback(text,done));
  }else copyWavePlanFallback(text,done);
}
function copyWavePlanFallback(text,done){
  const ta=document.createElement('textarea');
  ta.value=text;ta.style.cssText='position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try{document.execCommand('copy');done();}
  catch(e){alert('Copy failed — select and copy manually:\n\n'+text);}
  ta.remove();
}

function goWaveBtnHtml(onWave){
  const canGo=S.cities.some(c=>c.active);
  if(S.running)
    return onWave
      ?`<button type="button" class="btnP" disabled>Wave in progress</button>`
      :`<button type="button" class="btnP" onclick="switchTab('wave')">
          <i class="ti ti-chart-arrows" aria-hidden="true"></i> &nbsp;Wave in progress — open Wave tab
        </button>`;
  return`<button type="button" class="btnP" onclick="goWave()" ${canGo?'':'disabled'}>
    <i class="ti ti-player-play" aria-hidden="true"></i> &nbsp;GO — Wave ${S.waveNum+1}
  </button>`;
}

function switchTab(t){tab=t;editId=null;render();}
function toggleEdit(id){editId=(editId===id?null:id);render();}

function saveEdit(i){
  const n=document.getElementById('en'+i).value.trim();
  const t=parseInt(document.getElementById('et'+i).value);
  const role=document.getElementById('erol'+i).value;
  const ac=document.getElementById('ea'+i).value==='1';
  if(!n||!t||t<1)return;
  applyCityRole(i,role);
  S.cities[i]={...S.cities[i],name:n,travel:t,active:ac};
  editId=null; sv(); render();
}

function delCity(i){
  if(!confirm('Delete '+S.cities[i].name+'?'))return;
  S.cities.splice(i,1); editId=null; sv(); render();
}

function addCity(){
  const n=document.getElementById('an').value.trim();
  const t=parseInt(document.getElementById('at').value);
  const role=document.getElementById('arole').value;
  if(!n||!t||t<1)return;
  S.cities.push({id:Date.now(),name:n,travel:t,type:'main',active:true,captain:true,lead:false});
  applyCityRole(S.cities.length-1,role);
  sv(); render();
}

function cityListHtml(){
  if(!S.cities.length)return'<div class="empty">No cities yet — add one below.</div>';
  return S.cities.map((c,i)=>{
    const open=editId===c.id;
    return`<div class="card ${c.active?'':'dim'}">
      <div class="crow">
        <div class="cinfo">
          <div class="cname">${c.name}</div>
          <div class="cmeta">${fmtRallyShort()} rally + ${c.travel}s march &nbsp;·&nbsp; impact ${fmtImpactOff(impactOffsetFor(c))} &nbsp;·&nbsp; ${cityBadges(c)}${c.active?'':' &nbsp;·&nbsp; skipped'}</div>
        </div>
        <button type="button" class="ibtn" onclick="toggleEdit(${c.id})" aria-label="${open?'Close edit':'Edit city'}" title="${open?'Close':'Edit'}">
          ${editBtnIcon(open)}
        </button>
      </div>
      <div class="epanel ${open?'on':''}">
        <div class="eg">
          <input id="en${i}" type="text" value="${c.name}" placeholder="Name">
          <input id="et${i}" type="number" value="${c.travel}" min="1" placeholder="March s">
        </div>
        <div class="eg">
          <select id="erol${i}">${roleOptionsHtml(cityRoleValue(c))}</select>
          <select id="ea${i}">
            <option value="1"${c.active?' selected':''}>Active</option>
            <option value="0"${!c.active?' selected':''}>Skipped</option>
          </select>
        </div>
        <div class="ebtns">
          <button type="button" class="sv" onclick="saveEdit(${i})"><i class="ti ti-check" aria-hidden="true"></i> Save</button>
          <button type="button" class="dl" onclick="delCity(${i})"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function navHtml(){
  const waveBtn=hasWaveTab()
    ?`<button type="button" class="nt ${tab==='wave'?'on':''}" onclick="switchTab('wave')">Wave</button>`
    :'';
  return`<div class="nav">
    ${waveBtn}
    <button type="button" class="nt ${tab==='cities'?'on':''}" onclick="switchTab('cities')">Cities</button>
    <button type="button" class="nt ${tab==='settings'?'on':''}" onclick="switchTab('settings')">Settings</button>
    <button type="button" class="nt ${tab==='logs'?'on':''}" onclick="switchTab('logs')">Logs ${S.logs.length?'('+S.logs.length+')':''}</button>
  </div>`;
}

function impactBarHtml(live,hitTime,waveNum,cards){
  const hitLbl=hitTime?fmtClock(hitTime):'—';
  const countdown=live?impactCountdownText(cards,hitTime,true):(hitTime?'Canceled':'—');
  const boom=impactBarBoom(cards,hitTime,live);
  return`<div class="impact-bar">
    <span class="ib-wave">Wave ${waveNum}</span>
    <span class="ib-hit">Castle ${hitLbl}</span>
    <div class="ib-impact">
      <span class="ib-lbl">Impact</span>
      <span class="ib-timer${boom?' boom':''}" id="ht">${countdown}</span>
    </div>
  </div>`;
}

function citiesTabHtml(){
  return`
    ${cityListHtml()}
    ${wavePreviewHtml()}
    <div class="addbox">
      <input id="an" type="text" placeholder="City / lead name">
      <div class="g2">
        <input id="at" type="number" placeholder="March (sec)" min="1">
        <select id="arole">${roleOptionsHtml(!S.cities.some(c=>c.lead)?'lead':'support')}</select>
      </div>
      <button type="button" class="btnS" onclick="addCity()" style="margin-top:10px">
        <i class="ti ti-plus" aria-hidden="true"></i> Add city
      </button>
    </div>
    ${goWaveBtnHtml(false)}`;
}

function settingsTabHtml(){
  return`
    <div>
      <div class="srow">
        <div><div class="slbl">Castle name</div><div class="shint">For logs</div></div>
        <input type="text" value="${S.castleName}" placeholder="${DEFAULT_CASTLE}" style="width:240px;min-width:240px;text-align:right" onchange="S.castleName=this.value.trim()||DEFAULT_CASTLE;sv();updateAppTitle()">
      </div>
      <div class="srow">
        <div><div class="slbl">Rally wait (seconds)</div><div class="shint">Wait after send before march (300 = 5 min)</div></div>
        <input type="number" min="0" max="900" value="${S.rallyWait}" onchange="S.rallyWait=Math.max(0,parseInt(this.value)||0);sv()">
      </div>
      <div class="srow">
        <div><div class="slbl">Buffer (seconds)</div><div class="shint">Prep time before first send</div></div>
        <input type="number" min="0" max="600" value="${S.buffer}" onchange="S.buffer=Math.max(0,parseInt(this.value)||0);sv()">
      </div>
      <div class="cset">
        <div class="cset-hd">Impact timing</div>
        <div class="shint" style="margin:0 0 10px;font-size:12px">Lead is impact (0). Support &amp; counters: 0 or negative only — never after lead.</div>
        <div class="srow">
          <div><div class="slbl">Lead</div><div class="shint">Impact (0) — on castle hit</div></div>
          <input type="number" min="-120" max="120" value="${S.leadOffset}" onchange="setLeadOffset(this.value)">
        </div>
        <div class="srow">
          <div><div class="slbl">Support</div><div class="shint">Default −1 (1s before lead). Set 0 to land with lead</div></div>
          <input type="number" min="-120" max="0" value="${S.supportOffset}" onchange="setSupportOffset(this.value)">
        </div>
        ${S.counters.map(cnt=>`
          <div class="srow">
            <div><div class="slbl">${counterLabel(cnt.id)}</div><div class="shint">Default −2 (1s before support)</div></div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" min="-120" max="0" value="${cnt.impactOff}" onchange="setCounterImpactOff(${cnt.id},this.value)">
              ${S.counters.length>1?`<button type="button" class="btnRm" onclick="removeCounter(${cnt.id})" title="Remove">×</button>`:''}
            </div>
          </div>`).join('')}
        <button type="button" class="btnS" onclick="addCounter()" style="margin-top:8px">
          <i class="ti ti-plus" aria-hidden="true"></i> Add counter
        </button>
      </div>
    </div>
    <div class="srow" style="border:none;padding-top:8px">
      <div><div class="slbl">App version</div><div class="shint">Current release</div></div>
      <span style="font-size:15px;font-weight:600;font-variant-numeric:tabular-nums">v${APP_VERSION}</span>
    </div>
    <button type="button" class="btnFat ${S.fatFingers?'on':''}" onclick="toggleFatFingers()" aria-pressed="${S.fatFingers?'true':'false'}">
      🐙 Fat tentacles — ${S.fatFingers?'ON':'OFF'}
    </button>
    <button type="button" class="btnD" onclick="resetDay()">
      <i class="ti ti-refresh" aria-hidden="true"></i> New castle — reset waves &amp; logs
    </button>`;
}

function logImpactOff(c){return c.impactOff!==undefined?c.impactOff:impactOffsetFor(c);}
function logCityLineText(c,rallySec){
  const r=rallyRole(c);
  return`${c.name} · ${r.label} · impact ${fmtImpactOff(logImpactOff(c))} · ${fmtRallyShort(rallySec)}+${c.travel}s · send ${fmtClock(c.sendAt)} · impact ${fmtClock(logArrivalTs(c,rallySec))}`;
}
function logCityLineHtml(c,rallySec){
  const r=rallyRole(c);
  return`<div class="logcity-line ${r.cls}">
    <span class="role-dot ${r.cls}"></span>${logCityLineText(c,rallySec)}
  </div>`;
}
function logsToMarkdown(){
  const title=castleTitle();
  const exported=fmtDate(Date.now());
  let md=`# ${title} — Rally logs\n\n`;
  md+=`_App v${APP_VERSION} · exported ${exported}_\n\n`;
  if(!S.logs.length)return md+'_No waves logged yet._\n';
  S.logs.forEach(l=>{
    const when=l.canceled?(l.canceledAt||l.hitTime):l.hitTime;
    const status=l.canceled?'Canceled':'Hit';
    const ver=l.appVersion?` · app v${l.appVersion}`:'';
    md+=`## ${l.castle} — Wave ${l.wave}${l.canceled?' (Canceled)':''}\n\n`;
    md+=`**${status}** ${fmtDate(when)}${ver}\n\n`;
    l.cities.forEach(c=>{md+=`- ${logCityLineText(c,l.rallyWait)}\n`;});
    md+='\n';
  });
  return md;
}
function downloadLogsMd(){
  if(!S.logs.length){alert('No logs to download.');return;}
  const md=logsToMarkdown();
  const blob=new Blob([md],{type:'text/markdown;charset=utf-8'});
  const a=document.createElement('a');
  const safe=castleTitle().replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-')||'rally-logs';
  a.href=URL.createObjectURL(blob);
  a.download=safe+'-logs-v'+APP_VERSION+'.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function logsTabHtml(){
  const dlBtn=S.logs.length?`<button type="button" class="btnS" onclick="downloadLogsMd()" style="margin-bottom:1rem">
    <i class="ti ti-download" aria-hidden="true"></i> Download logs (.md)
  </button>`:'';
  const list=S.logs.length?S.logs.map(l=>{
    const when=l.canceled?(l.canceledAt||l.hitTime):l.hitTime;
    const stamp=l.canceled?`Canceled ${fmtDate(when)}`:`Hit ${fmtDate(when)}`;
    return`<div class="logitem">
      <div class="logtop">
        <span class="logtitle">${l.castle} — Wave ${l.wave}${l.canceled?'<span class="logbadge">Canceled</span>':''}</span>
        <span class="logtime">${stamp}</span>
      </div>
      <div class="logcities">${l.cities.map(c=>logCityLineHtml(c,l.rallyWait)).join('')}</div>
    </div>`;
  }).join('')
    :'<div class="empty">No waves logged yet.</div>';
  return dlBtn+list;
}

function tabContent(){
  if(tab==='wave'&&hasWaveTab())return wavePanelHtml();
  if(tab==='wave'){tab='cities';}
  if(tab==='cities')return citiesTabHtml();
  if(tab==='settings')return settingsTabHtml();
  return logsTabHtml();
}

function cdCardRow(c,beepOnSend,hitTime,live){
  const s=c.secsLeft,sending=s<=0&&s>-3,sent=s<=-3,hot=s>0&&s<=5;
  const arriving=live&&hitTime&&isCityArrivalBoom(c,hitTime);
  if(beepOnSend&&sending&&!beeped['s'+c.id]){beeped['s'+c.id]=true;beep(880,0.15);}
  const txt=cardTimerText(s,sending,sent);
  const cls=[sent||sending?'ok':hot?'hot':'',arriving?'boom':''].filter(Boolean).join(' ');
  const role=rallyRole(c);
  return`<div class="cdc ${role.cls} ${sending?'flash':''} ${arriving?'arrive':''} ${sent&&!arriving?'done':''}" title="${role.label}">
      <span class="cdtimer ${cls}">${txt}</span>
      <span class="cdname"><span class="cdname-txt">${c.name}</span></span>
    </div>`;
}

function cdCardHtml(cards){return cards.map(c=>cdCardRow(c,true)).join('');}

function wavePanelHtml(){
  const live=S.running;
  const cards=live?activeCards():(S.lastWave?.cities||[]);
  const hitTime=live?S.hitTime:S.lastWave?.hitTime;
  const waveNum=live?S.waveNum:(S.lastWave?.waveNum??S.waveNum);
  const allSent=live&&cards.every(c=>c.secsLeft<=-3);
  const note=!live?`<div class="wave-note">Wave canceled — snapshot from ${fmtClock(S.lastWave.canceledAt)}. Timers are frozen for review.</div>`:'';
  const liveCtrl=live
    ?`<button type="button" class="bigbtn" id="mainbtn" onclick="${allSent?'finishWave()':'cancelWave()'}">${allSent?'Next wave':'Cancel wave'}</button>`
    :'';
  return`<div class="wave-panel">
    ${note}
    ${impactBarHtml(live,hitTime,waveNum,cards)}
    <div id="cards">${cards.map(c=>cdCardRow(c,false,hitTime,live)).join('')}</div>
    ${liveCtrl}
    ${goWaveBtnHtml(true)}
  </div>`;
}

function processWaveTick(){
  const cards=activeCards();
  const hitTime=S.hitTime;
  const hitSecs=(hitTime-Date.now())/1000;
  if(hitSecs<=0&&hitSecs>-1&&!beeped.impactHit){
    beeped.impactHit=true;
    beepImpact(true);
  }
  cards.forEach(c=>{
    const s=c.secsLeft,sending=s<=0&&s>-3;
    if(sending&&!beeped['s'+c.id]){beeped['s'+c.id]=true;beep(880,0.15);}
    if(isCityArrivalBoom(c,hitTime)&&!beeped['a'+c.id]){
      beeped['a'+c.id]=true;
      if(c.lead&&beeped.impactHit)return;
      beepImpact(!!c.lead);
    }
  });
  return{cards,allSent:cards.every(c=>c.secsLeft<=-3),hitTime};
}

function updateImpactBar(cards,hitTime,live){
  const ht=document.getElementById('ht');
  if(!ht)return;
  ht.textContent=live?impactCountdownText(cards,hitTime,true):'—';
  ht.classList.toggle('boom',impactBarBoom(cards,hitTime,live));
}

function tick(){
  if(!S.running){clearInterval(ticker);ticker=null;return;}
  const {cards,allSent,hitTime}=processWaveTick();

  updateImpactBar(cards,hitTime,true);

  const ce=document.getElementById('cards');
  if(ce){
    ce.innerHTML=cards.map(c=>cdCardRow(c,false,hitTime,true)).join('');
    const mb=document.getElementById('mainbtn');
    if(mb){mb.textContent=allSent?'Next wave':'Cancel wave';mb.onclick=allSent?finishWave:cancelWave;}
  }
}

function render(){
  if(tab==='wave'&&!hasWaveTab())tab='cities';
  document.getElementById('app').innerHTML=`<div class="page on">
    ${navHtml()}
    ${tabContent()}
  </div>`;
  updateAppTitle();
  if(S.running&&!ticker)ticker=setInterval(tick,250);
  if(!S.running&&ticker){clearInterval(ticker);ticker=null;}
  if(tab==='cities'&&!S.running){
    if(!previewTicker)previewTicker=setInterval(updateWavePreview,1000);
  }else if(previewTicker){clearInterval(previewTicker);previewTicker=null;}
}
applyFatFingersMode();
updateVersionLabel();
render();