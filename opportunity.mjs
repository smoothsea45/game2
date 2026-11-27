// One deed and one buyer appointment share registration hours on the simulation clock.
// In that interval a walker cannot travel between the two doors (over 70 metres).
const LEAD = 54;
const WINDOW = 14;
const RIVAL_SIGNING = 6;
const LOT_PRICE = 12;
const DAILY_RENT = 4;
const DAY = 360;
const CLIENT_PREMIUM = 1;
const destination = {plot:'plot', meeting:'market'};

export function freshOpportunity() {
  return {startedAt:null, closed:false, landOwner:null, acquiredAt:null, rentDays:0,
    met:false, queued:null, rivalPurse:18, rivalResume:null, rivalReadyAt:null};
}
const isTime = n => Number.isFinite(n) && n >= 0;
const isCount = n => Number.isSafeInteger(n) && n >= 0;
function opens(o) {return o.startedAt + LEAD;}
function closes(o) {return opens(o) + WINDOW;}
function phase(s) {
  const o=s.opportunity;
  if (o.startedAt===null) return 'ready';
  if (s.time>=closes(o)) return 'closed';
  return s.time<opens(o)?'waiting':'open';
}
export function clientBonus(s) {return s.opportunity?.met ? CLIENT_PREMIUM : 0;}
export function opportunityView(s) {
  const o=s.opportunity, state=phase(s), started=o.startedAt!==null;
  return {phase:state,opensAt:started?opens(o):null,closesAt:started?closes(o):null,
    secondsUntilOpen:started?Math.max(0,opens(o)-s.time):LEAD,
    secondsLeft:started?Math.max(0,closes(o)-s.time):LEAD+WINDOW,
    landOwner:o.landOwner,met:o.met,queued:o.queued,landPrice:LOT_PRICE,
    relationshipBonus:CLIENT_PREMIUM,rentPerDay:DAILY_RENT,rivalPurse:o.rivalPurse,
    nextRentAt:o.acquiredAt===null?null:o.acquiredAt+(o.rentDays+1)*DAY};
}
function validResume(a,r) {
  const inDetour=['rivalPlotTravel','rivalPlotWait','rivalPlotBack'].includes(a.task);
  if (r===null) return !inDetour;
  return inDetour && !!r && ['rivalWork','rivalDeliver','rivalReturn'].includes(r.task)
    && isTime(r.remaining) && isTime(r.duration) && r.remaining<=r.duration
    && (a.task!=='rivalPlotBack'||r.task==='rivalWork');
}
export function validOpportunity(s) {
  const o=s.opportunity, rival=s.agents.find(a=>a.id==='rival');
  if (!o||!rival||!isCount(o.rivalPurse)||!isCount(o.rentDays)
    || typeof o.met!=='boolean'||typeof o.closed!=='boolean'
    || ![null,'rival','master'].includes(o.landOwner)||![null,'plot','meeting'].includes(o.queued)
    || !validResume(rival,o.rivalResume))return false;
  if(o.startedAt===null)return !o.closed&&o.landOwner===null&&o.acquiredAt===null&&!o.met
    &&o.rentDays===0&&o.queued===null&&o.rivalResume===null&&o.rivalReadyAt===null;
  if(!isTime(o.startedAt)||o.startedAt>s.time)return false;
  if(o.landOwner===null){if(o.acquiredAt!==null||o.rentDays!==0)return false;}
  else if(!isTime(o.acquiredAt)||o.acquiredAt<opens(o)||o.acquiredAt>=closes(o)||o.acquiredAt>s.time
    ||o.rentDays>Math.floor((s.time-o.acquiredAt)/DAY))return false;
  if(o.met&&(o.landOwner==='master'||s.time<opens(o)))return false;
  if(o.closed&&(s.time<closes(o)||o.queued!==null))return false;
  if(rival.task==='rivalPlotWait')return isTime(o.rivalReadyAt)&&rival.at==='plot';
  return o.rivalReadyAt===null;
}
function parked(a,where){return a.task==='idle'&&a.at===where;}
function canRegister(s,a,kind){
  const o=s.opportunity;
  return parked(a,destination[kind]) && (kind==='plot'?o.landOwner===null&&s.grain>=LOT_PRICE:!o.met);
}
export function opportunityOptions(s,a){
  if(a.id!=='master')return [];
  const o=s.opportunity,p=phase(s);
  if(p==='ready')return [{id:'startOpportunity',label:'두 약속의 초대장 열기',detail:'양주 빈터 매입과 한성 거래처 면담을 같은 시각에 잡습니다.',enabled:true}];
  if(p==='closed')return [];
  const choices=[];
  if(o.landOwner===null)choices.push({id:'claimPlot',label:p==='waiting'?'빈터 매입 대기':'빈터 매입',
    detail:'양주 빈터 현장 · 곡식 '+LOT_PRICE+'말 · 보유 하루당 사용료 '+DAILY_RENT+'말',enabled:o.queued!=='plot'&&canRegister(s,a,'plot')});
  if(!o.met)choices.push({id:'meetClient',label:p==='waiting'?'거래처 면담 대기':'거래처 면담',
    detail:'종로 시전 현장 · 이후 한성 한지 판매 시 장당 '+CLIENT_PREMIUM+'말 추가',enabled:o.queued!=='meeting'&&canRegister(s,a,'meeting')});
  return choices;
}
function buyLot(s,buyer,note){
  const o=s.opportunity, wallet=buyer==='master'?s:o, purse=buyer==='master'?'grain':'rivalPurse';
  if(o.landOwner!==null||wallet[purse]<LOT_PRICE)return false;
  wallet[purse]-=LOT_PRICE;o.landOwner=buyer;o.acquiredAt=s.time;
  note(s,(buyer==='master'?'윤서진':'박만길')+'이 양주 현장에서 곡식 '+LOT_PRICE+'말을 치르고 빈터 문서를 받았다.');
  return true;
}
function confirm(s,kind,note){
  if(kind==='plot')return buyLot(s,'master',note);
  s.opportunity.met=true;
  note(s,'윤서진이 종로에서 단골 서책상과 납품 약속을 맺었다. 한지 한 장마다 곡식 1말을 더 받는다.');
  return true;
}
function resumeRival(s,a,{go}){
  const o=s.opportunity,r=o.rivalResume;
  if(!r||a.task==='rivalPlotBack')return;
  o.rivalReadyAt=null;
  if(r.task==='rivalWork'){
    go(a,'rival','rivalPlotBack','지물전으로 돌아가 멈춘 일을 이으러 가는 중');
  }else{
    o.rivalResume=null;
    if(r.task==='rivalDeliver')go(a,'market','rivalDeliver','지닌 한지를 들고 종로 시전으로');
    else go(a,'rival','rivalReturn','지물전으로 돌아가는 중');
  }
}
export function opportunityCommand(s,a,id,target,hooks){
  if(!['startOpportunity','claimPlot','meetClient'].includes(id))return null;
  if(a.id!=='master')return {ok:false,message:'가주가 직접 참석해야 합니다.'};
  const o=s.opportunity,p=phase(s),{go,note}=hooks;
  if(id==='startOpportunity'){
    if(p!=='ready')return {ok:false,message:'이번 약속은 이미 정해졌습니다.'};
    const r=s.agents.find(actor=>actor.id==='rival');
    o.startedAt=s.time;
    o.rivalResume={task:r.task,remaining:r.remaining,duration:r.duration};
    go(r,'plot','rivalPlotTravel','양주 빈터의 문서를 보러 가는 중');
    note(s,'양주 빈터 문서를 쓰는 시각에 한성 서책상도 만나자고 한다. 박만길이 양주로 출발했다.');
    return {ok:true,message:'약속이 잡혔습니다. 양주 빈터 또는 종로 시전으로 가주를 보내세요.'};
  }
  if(p!=='waiting'&&p!=='open')return {ok:false,message:'접수할 수 있는 시각이 아닙니다.'};
  const kind=id==='claimPlot'?'plot':'meeting';
  if(!canRegister(s,a,kind))return {ok:false,message:kind==='plot'?'가주가 양주 빈터에 도착해야 하며, 빈터와 곡식 12말이 필요합니다.':'가주가 종로 시전에 도착해야 하며 면담은 한 번만 가능합니다.'};
  if(o.queued===kind)return {ok:false,message:'이미 현장에서 기다리는 중입니다.'};
  if(p==='waiting'){
    o.queued=kind;
    return {ok:true,message:'가주가 현장에서 기다립니다. 접수 시각 전에 떠나면 대기가 취소됩니다.'};
  }
  return {ok:confirm(s,kind,note),message:kind==='plot'?'빈터 문서를 받았습니다.':'한성 단골 거래처를 확보했습니다.'};
}
export function opportunityArrive(s,a,hooks){
  if(a.id!=='rival')return false;
  const o=s.opportunity;
  if(a.task==='rivalPlotBack'){
    const r=o.rivalResume;
    hooks.wait(a,'rivalWork','멈췄던 지물전 작업을 잇는 중',r.remaining,'work');
    a.duration=r.duration;o.rivalResume=null;
    return true;
  }
  if(a.task!=='rivalPlotTravel')return false;
  hooks.wait(a,'rivalPlotWait','양주 빈터에서 매입 문서를 살피는 중');
  o.rivalReadyAt=Math.max(s.time,opens(o))+RIVAL_SIGNING;
  return true;
}
export function opportunityTick(s,delta,hooks){
  const o=s.opportunity;
  if(o.startedAt===null)return;
  if(!o.closed){
    const a=s.agents.find(a=>a.id==='master'),r=s.agents.find(a=>a.id==='rival');
    if(o.queued&&!canRegister(s,a,o.queued)){
      o.queued=null;hooks.note(s,'가주가 현장 접수 조건을 벗어나 대기를 취소했다.');
    }
    const p=phase(s);
    if(p==='open'){
      if(o.queued){confirm(s,o.queued,hooks.note);o.queued=null;}
      if(!o.landOwner&&r.task==='rivalPlotWait'&&r.at==='plot'&&s.time>=o.rivalReadyAt)
        buyLot(s,'rival',hooks.note);
    }
    if(o.landOwner||p==='closed')resumeRival(s,r,hooks);
    if(p==='closed'){
      o.closed=true;o.queued=null;
      if(!o.met)hooks.note(s,'한성 서책상의 면담 시간이 끝났다.');
      if(!o.landOwner)hooks.note(s,'양주 빈터의 매입 접수가 끝났다. 이번에는 주인이 정해지지 않았다.');
    }
  }
  if(o.landOwner){
    const days=Math.floor((s.time-o.acquiredAt)/DAY);
    if(days>o.rentDays){
      const rent=(days-o.rentDays)*DAILY_RENT;o.rentDays=days;
      if(o.landOwner==='master')s.grain+=rent;else o.rivalPurse+=rent;
      hooks.note(s,(o.landOwner==='master'?'윤서진':'박만길')+'의 양주 빈터에 짐을 부린 객주가 사용료 '+rent+'말을 치렀다.');
    }
  }
}
