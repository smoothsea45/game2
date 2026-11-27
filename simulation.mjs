import {bins, moveGoods, quantity, validInventory} from './inventory.mjs';
import {barkCost, barkLot, changeMandate, freshWorkshop, runMandate, validWorkshop} from './workshop.mjs';
import {clientBonus, freshOpportunity, opportunityArrive, opportunityCommand, opportunityOptions, opportunityTick, validOpportunity} from './opportunity.mjs';
export {inventoryAt, inventoryRows} from './inventory.mjs';
export {workshopStatus} from './workshop.mjs';

// Distances are metres on the ground plane. Buildings are reached at their street doors.
const point = (x, z) => ({x, z});
export const places = {
  home: {name: '본가', x: 0, z: -5},
  workshop: {name: '한지 공방', x: -16, z: -4},
  market: {name: '종로 시전', x: 16, z: 4},
  rival: {name: '경쟁 지물전', x: -16, z: 5},
  yangju: {name: '양주 장터', x: 79, z: 4},
  plot: {name: '양주 빈터', x: 79, z: -5}
};
export const people = {
  master: {name: '윤서진', role: '가주'},
  apprentice: {name: '분이', role: '도제'},
  porter: {name: '돌석', role: '짐꾼'},
  rival: {name: '박만길', role: '경쟁 상인'}
};
export const roads = [
  [point(-23, 0), point(23, 0)],
  [point(-16, -10), point(16, -10)],
  [point(-16, 9), point(16, 9)],
  ...[-16, 0, 16].map(x => [point(x, -10), point(x, 9)]),
  [point(23, 0), point(89, 0)],
  [point(79, -8), point(79, 9)]
];
export function districtName(x) {
  if (x <= 28) return '한성';
  if (x < 67) return '한성·양주 사이';
  return '양주';
}
const distance = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function projection(p, [a, b]) {
  const dx = b.x-a.x, dz = b.z-a.z;
  const t = clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz),0,1);
  return point(a.x+t*dx,a.z+t*dz);
}
function streetPoint(p) {
  let best = null, least = Infinity;
  for (const road of roads) {
    const snapped = projection(p, road);
    const d = distance(p, snapped);
    if (d < least) { best = snapped; least = d; }
  }
  return best;
}
// Door offsets keep the people visible when several share a destination.
const offsets = {master:0, apprentice:-0.8, porter:1.1, rival:-1.2};
function doorstep(id, place) {
  const p = places[place];
  return point(p.x, p.z+offsets[id]);
}
const intersections = [
  ...[-16,0,16].flatMap(x=>[-10,0,9].map(z=>point(x,z))),
  point(23,0), point(79,0)
];
function route(from, to) {
  const points = [point(from.x,from.z), to, ...intersections];
  const graph = points.map(()=>[]);
  for (const road of roads) {
    const indices = points.map((_,i)=>i).filter(i => distance(points[i],projection(points[i],road)) < 0.001);
    indices.sort((i,j)=>points[i].x-points[j].x || points[i].z-points[j].z);
    for (let i=1;i<indices.length;i++) {
      const a=indices[i-1], b=indices[i];
      graph[a].push(b);graph[b].push(a);
    }
  }
  const costs=points.map(()=>Infinity), previous=points.map(()=>-1), seen=new Set();
  costs[0]=0;
  while (true) {
    let current=-1;
    for(let i=0;i<points.length;i++) {
      if(!seen.has(i)&&Number.isFinite(costs[i])&&(current===-1||costs[i]<costs[current]))current=i;
    }
    if(current<0) throw new Error('Disconnected street');
    if(current===1) break;
    seen.add(current);
    for (const next of graph[current]) {
      const total=costs[current]+distance(points[current],points[next]);
      if(total<costs[next]) {costs[next]=total;previous[next]=current;}
    }
  }
  const result=[];
  for(let i=1;i!==0;i=previous[i])result.unshift(points[i]);
  return result;
}
export function clock(s) {
  const minutes=7*60+Math.floor(s.time*4);
  const day=Math.floor(minutes/1440)+1, hour=Math.floor(minutes/60)%24, minute=minutes%60;
  return {day,hour,minute,text:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')};
}
export function price(s) {return clamp(11-Math.floor(s.supply/3),3,11);}
function note(s,text) {
  s.log.unshift({time:s.time,text});
  if(s.log.length>40)s.log.length=40;
}
function actor(id,at) {
  return {id,...doorstep(id,at),at,target:null,heading:Math.PI/4,mode:'idle',task:'idle',
    action:'명령 대기',remaining:0,duration:0,path:[]};
}
function wait(a,task,action,seconds=0,mode='idle') {
  Object.assign(a,{mode,task,action,path:[],target:null,remaining:seconds,duration:seconds});
}
function go(a,target,task,action) {
  const isPlace=typeof target==='string';
  const to=isPlace?doorstep(a.id,target):streetPoint(target);
  Object.assign(a,{mode:'walk',task,action,at:null,target:isPlace?target:null,
    path:route(a,to),remaining:0,duration:0});
}
export function fresh(){
  const agents=[actor('master','home'),actor('apprentice','workshop'),actor('porter','home'),actor('rival','rival')];
  const rival=agents[3];
  wait(rival,'rivalWork','팔 종이를 꾸리는 중',10,'work');
  const state={version:3,time:0,speed:1,agents,inventory:[],grain:18,sold:0,
    crafted:0, delivered:0, rivalSales:0, contractDay:0, log:[{time:0,text:'한성의 새벽 장이 섰다. 오늘 첫 한지를 지어 내다 팔자.'}]};
  moveGoods(state,null,bins.bark,4);
  moveGoods(state,null,bins.market,4);
  moveGoods(state,null,bins.rivalShop,6);
  initStageTwo(state);
  return inventoryViews(state);
}
function initStageTwo(s) {
  s.workshop=freshWorkshop();
  s.opportunity=freshOpportunity(s);
  const apprentice=s.agents.find(a=>a.id==='apprentice');
  apprentice.batchesLeft=hasCraftOrder(s)?1:0;
  moveGoods(s,null,bins.marketBark,12);
  s.version=3;
}
const taskModes={
  idle:'idle',move:'walk',toCraft:'walk',craft:'work',toPickup:'walk',waitPaper:'idle',
  delivery:'walk',toBarkShop:'walk',toBarkPickup:'walk',barkDelivery:'walk',rivalWork:'work',
  rivalDeliver:'walk',rivalReturn:'walk',rivalPlotTravel:'walk',rivalPlotWait:'idle',rivalPlotBack:'walk',labor:'work'
};
const roleTasks={
  master:['idle','move','labor'],apprentice:['idle','move','toCraft','craft'],
  porter:['idle','move','toPickup','waitPaper','delivery','toBarkShop','toBarkPickup','barkDelivery'],
  rival:['rivalWork','rivalDeliver','rivalReturn','rivalPlotTravel','rivalPlotWait','rivalPlotBack']
};
const counts=['grain','sold','crafted','delivered','rivalSales','contractDay'];
const isCount=n=>Number.isSafeInteger(n)&&n>=0;
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
function onStreet(p) {
  return finitePoint(p)&&distance(p,streetPoint(p))<0.001;
}
const aliases={bark:bins.bark,paper:bins.workshop,stock:bins.stall,supply:bins.market};
function inventoryViews(s) {
  // Compatibility for renderers and existing simulation callers. Only the
  // inventory rows are enumerable, so a save never contains a second balance.
  for(const [key,bin] of Object.entries(aliases)) {
    Object.defineProperty(s,key,{get:()=>quantity(s,bin)});
  }
  for(const a of s.agents) {
    const paperBin=a.id==='porter'?bins.porter:a.id==='rival'?bins.rival:null;
    const paper=()=>paperBin?quantity(s,paperBin):0;
    const bark=()=>a.id==='porter'?quantity(s,bins.porterBark):0;
    Object.defineProperties(a,{
      cargo:{get:()=>paper()+bark()},
      cargoItem:{get:()=>paper()?'paper':bark()?'bark':null}
    });
  }
  return s;
}
function hasCraftOrder(s) {
  return s.agents.some(a=>a.task==='toCraft'||a.task==='craft');
}
function migrateInventory(s) {
  s.inventory=[];
  for(const [key,bin] of Object.entries(aliases)) {
    moveGoods(s,null,bin,s[key]);
    delete s[key];
  }
  for(const a of s.agents) {
    if(a.id==='porter')moveGoods(s,null,bins.porter,a.cargo);
    if(a.id==='rival'){
      moveGoods(s,null,bins.rival,a.cargo);
      if(a.task==='rivalWork')moveGoods(s,null,bins.rivalShop,6);
    }
    delete a.cargo;
  }
  // V1 removed the bundle at assignment without recording its reservation.
  if(hasCraftOrder(s))moveGoods(s,null,bins.reservedBark,1);
  s.version=2;
}
function validOrders(s) {
  const porter=s.agents.find(a=>a.id==='porter');
  const rival=s.agents.find(a=>a.id==='rival');
  const apprentice=s.agents.find(a=>a.id==='apprentice');
  const craft=hasCraftOrder(s),paper=quantity(s,bins.porter),bark=quantity(s,bins.porterBark);
  const rivalTask=rival.task.startsWith('rivalPlot')?s.opportunity.rivalResume?.task:rival.task;
  return quantity(s,bins.reservedBark)===(craft?1:0)
    && isCount(apprentice.batchesLeft) && (apprentice.batchesLeft>0)===craft
    && apprentice.batchesLeft<=quantity(s,bins.bark)+(craft?1:0)
    && paper<=4 && bark<=barkLot && !(paper&&bark)
    && (porter.task!=='delivery'||paper>0) && (porter.task!=='barkDelivery'||bark>0)
    && (!['toPickup','waitPaper','toBarkShop','toBarkPickup'].includes(porter.task)||paper+bark===0)
    && quantity(s,bins.rival)===(rivalTask==='rivalDeliver'?6:0)
    && quantity(s,bins.rivalShop)===(rivalTask==='rivalWork'?6:0);
}
export function loadGame(text) {
  try {
    const s=JSON.parse(text);
    if (![1,2,3].includes(s?.version)||!Number.isFinite(s.time)||s.time<0||![0,1,2,4].includes(s.speed)||
      !counts.every(k=>isCount(s[k]))||!Array.isArray(s.agents)||s.agents.length!==4||
      !Array.isArray(s.log)||!s.log.every(v=>Number.isFinite(v.time)&&typeof v.text==='string')) return null;
    const legacy=s.version===1;
    if(legacy?!Object.keys(aliases).every(key=>isCount(s[key])):!validInventory(s.inventory))return null;
    const ids=new Set();
    for(const a of s.agents) {
      if(!Object.hasOwn(people,a.id)||ids.has(a.id)||!onStreet(a)||!Array.isArray(a.path)||
        !a.path.every(onStreet)||!roleTasks[a.id].includes(a.task)||taskModes[a.task]!==a.mode||
        ![a.at,a.target].every(v=>v===null||Object.hasOwn(places,v))||typeof a.action!=='string'||
        !Number.isFinite(a.remaining)||!Number.isFinite(a.duration)||a.remaining<0||a.duration<0||
        (legacy&&(!isCount(a.cargo)||(!['porter','rival'].includes(a.id)&&a.cargo!==0)))||
        !Number.isFinite(a.heading))return null;
      ids.add(a.id);
    }
    if(legacy)migrateInventory(s);
    if(s.version===2)initStageTwo(s);
    return validWorkshop(s.workshop)&&validOpportunity(s)&&validOrders(s)?inventoryViews(s):null;
  } catch {return null;}
}
function available(a) {return a.task==='idle'||a.task==='move'||a.task==='waitPaper';}
function parked(a,place) {return a.task==='idle'&&a.at===place;}
function startCraft(s,a,batches) {
  a.batchesLeft=batches;
  go(a,'workshop','toCraft','공방으로 출근 중');
  moveGoods(s,bins.bark,bins.reservedBark,1);
}
function startPaperTrip(s,a) {
  if(a.cargoItem==='paper')go(a,'market','delivery','시전으로 한지 운반 중');
  else go(a,'workshop','toPickup','공방으로 한지를 받으러 가는 중');
}
function startBarkTrip(s,a) {
  if(a.cargoItem==='bark')go(a,'workshop','barkDelivery','공방으로 닥 운반 중');
  else if(quantity(s,bins.pickupBark))go(a,'market','toBarkPickup','시전에 맡긴 닥을 받으러 가는 중');
  else go(a,'market','toBarkShop','닥을 사러 종로 시전으로');
}
function buyBark(s,delegated) {
  moveGoods(s,bins.marketBark,bins.pickupBark,barkLot);
  if(delegated){s.workshop.budget-=barkCost;s.workshop.spent+=barkCost;}
  else s.grain-=barkCost;
  note(s,(delegated?'돌석이 운영비로':'가주가')+' 종로에서 닥 3묶음을 5말에 사서 인수대에 맡겼다.');
}
function sellPaper(s) {
  const count=Math.min(4,s.stock), unitPrice=price(s)+clientBonus(s), total=count*unitPrice;
  moveGoods(s,bins.stall,bins.market,count);
  s.sold+=count;s.grain+=total;
  note(s,'종로 시전에서 한지 '+count+'장을 팔아 곡식 '+total+'말을 받았다.');
  return {time:s.time,quantity:count,unitPrice,total};
}
const workshopActions={startCraft,startPaperTrip,startBarkTrip,go,buyBark,sellPaper};
const opportunityActions={go,wait,note};
function complete(s,a) {
  if(opportunityArrive(s,a,opportunityActions))return;
  switch(a.task) {
    case 'move':
      wait(a,'idle',a.at?places[a.at].name+' 도착':'길에서 대기');break;
    case 'toCraft':
      wait(a,'craft','발로 한지를 뜨는 중',9,'work');break;
    case 'craft':
      moveGoods(s,bins.reservedBark,null,1);
      moveGoods(s,null,bins.workshop,4);
      s.crafted+=4;
      a.batchesLeft--;
      note(s,'분이가 한지 4장을 공방 선반에 올렸다.');
      if(a.batchesLeft>0) {
        moveGoods(s,bins.bark,bins.reservedBark,1);
        wait(a,'craft','발로 한지를 뜨는 중',9,'work');break;
      }
      wait(a,'idle','한지 한 묶음 완성');break;
    case 'toPickup':
    case 'waitPaper':
      if(!s.paper){wait(a,'waitPaper','공방에서 한지를 기다리는 중');break;}
      moveGoods(s,bins.workshop,bins.porter,Math.min(4,s.paper));
      note(s,'돌석이 공방에서 한지 '+a.cargo+'장을 지고 출발했다.');
      go(a,'market','delivery','시전으로 한지 운반 중');break;
    case 'delivery': {
      const delivered=a.cargo;
      moveGoods(s,bins.porter,bins.stall,delivered);
      s.delivered+=delivered;
      note(s,'돌석이 시전 판매대에 한지 '+delivered+'장을 내려놓았다.');
      wait(a,'idle','시전에 짐을 내려놓음');break;
    }
    case 'toBarkShop':
      wait(a,'idle','종로 인수대 도착');break;
    case 'toBarkPickup': {
      const count=Math.min(barkLot,quantity(s,bins.pickupBark));
      if(!count){wait(a,'idle','인수할 닥이 없음');break;}
      moveGoods(s,bins.pickupBark,bins.porterBark,count);
      note(s,'돌석이 시전 인수대에서 닥 '+count+'묶음을 받아 공방으로 출발했다.');
      go(a,'workshop','barkDelivery','공방으로 닥 운반 중');break;
    }
    case 'barkDelivery': {
      const count=a.cargo;
      moveGoods(s,bins.porterBark,bins.bark,count);
      note(s,'돌석이 공방에 닥 '+count+'묶음을 내려놓았다.');
      wait(a,'idle','공방에 닥을 내려놓음');break;
    }
    case 'rivalWork':
      moveGoods(s,bins.rivalShop,bins.rival,6);
      go(a,'market','rivalDeliver','이웃 점포의 한지를 싣고 장으로');break;
    case 'rivalDeliver': {
      const oldPrice=price(s);
      s.opportunity.rivalPurse+=oldPrice*a.cargo;
      moveGoods(s,bins.rival,bins.market,a.cargo);
      s.rivalSales++;
      note(s,'경쟁 상인이 한지 6장을 풀었다. 시세 '+oldPrice+'말 → '+price(s)+'말.');
      go(a,'rival','rivalReturn','가게로 돌아가는 중');break;
    }
    case 'rivalReturn':
      moveGoods(s,null,bins.rivalShop,6);
      wait(a,'rivalWork','다음 장에 낼 종이를 꾸리는 중',21,'work');break;
    case 'labor':
      s.grain+=3;note(s,'가주가 장터 품삯으로 곡식 3말을 받았다.');
      wait(a,'idle','장터 품일을 마침');break;
  }
}
function progressActor(s,a,seconds) {
  let left=seconds;
  while(left>0.000001) {
    if(a.mode==='walk') {
      const next=a.path[0];
      if(!next) {
        a.at=a.target;a.target=null;complete(s,a);continue;
      }
      const length=distance(a,next);
      const pace=a.cargo?1.85:2.55;
      if(length>0.0001)a.heading=Math.atan2(next.x-a.x,next.z-a.z);
      const step=pace*left;
      if(length<=step){
        a.x=next.x;a.z=next.z;a.path.shift();left-=length/pace;
      }else{
        a.x+=(next.x-a.x)*step/length;a.z+=(next.z-a.z)*step/length;return;
      }
    }else if(a.mode==='work'){
      const used=Math.min(left,a.remaining);
      a.remaining-=used;left-=used;
      if(a.remaining<=0.000001){a.remaining=0;complete(s,a);}
      else return;
    }else if(a.task==='waitPaper'&&s.paper>0){complete(s,a);}
    else return;
  }
}
export function tick(s,seconds){
  if(!Number.isFinite(seconds)||seconds<=0||s.speed===0)return;
  let left=seconds;
  // Bounded event steps keep concurrent arrivals and market updates in chronological order at 4×.
  while(left>0.000001){
    const delta=Math.min(left,0.25),oldTime=s.time,oldDay=clock(s).day;left-=delta;s.time+=delta;
    if(Math.floor(oldTime/9)<Math.floor(s.time/9)&&s.supply>0)moveGoods(s,bins.market,null,1);
    if(clock(s).day!==oldDay){
      const arriving=Math.min(barkLot,12-quantity(s,bins.marketBark));
      if(arriving>0)moveGoods(s,null,bins.marketBark,arriving);
    }
    opportunityTick(s,delta,opportunityActions);
    for(const a of s.agents)progressActor(s,a,delta);
    runMandate(s,workshopActions);
  }
}
const result = (ok,message) => ({ok,message});
function choice(id,label,detail,enabled) {return {id,label,detail,enabled};}
export function options(s,id) {
  const a=s.agents.find(person=>person.id===id);if(!a||id==='rival')return [];
  const cancel=a.task==='idle'?[]:[choice('cancel','명령 중단',cancelDetail(a),true)];
  if(id==='apprentice'){
    const ready=available(a)&&s.bark>0;
    return [...cancel,choice('produce','한 번 뜨기','닥 1묶음 → 한지 4장 · 작업 9초',ready),
      choice('produceMax','최대 생산','지금 있는 닥 '+s.bark+'묶음으로 한지 '+s.bark*4+'장 · 한 묶음씩 생산',ready)];
  }
  if(id==='porter'){
    const paper=a.cargoItem==='paper',bark=a.cargoItem==='bark';
    const pickup=quantity(s,bins.pickupBark);
    return [...cancel,choice('haul',paper?'한지 운송 재개':'한지 운송',paper?'지닌 한지 '+a.cargo+'장을 시전 판매대에 운반':'공방에서 최대 4장을 지고 시전으로 · 재고가 없으면 대기',!bark&&available(a)&&a.task!=='waitPaper'),
      choice('haulBark',bark?'닥 운송 재개':'닥 인수·운송',bark?'지닌 닥 '+a.cargo+'묶음을 공방으로 운반':'종로 인수대에 맡긴 닥 '+pickup+'묶음 · 한 번에 3묶음씩',!paper&&available(a)&&(bark||pickup>0))];
  }
  const atMarket=parked(a,'market'),count=Math.min(4,s.stock),barkLeft=quantity(s,bins.marketBark);
  const day=clock(s).day;
  const choices=[
    choice('sell','한지 판매',count?'시전에서 '+count+'장 × '+(price(s)+clientBonus(s))+'말':'시전에서 운송된 한지를 판매',atMarket&&count>0),
    choice('buy','시전에서 닥 매입','종로 재고 '+barkLeft+'묶음 · 곡식 5말 → 닥 3묶음, 짐꾼이 공방으로 운반',atMarket&&s.grain>=barkCost&&barkLeft>=barkLot),
    choice('labor','장터 품일','시전에서 6초 일하고 곡식 3말 받기',atMarket)
  ];
  if(day>=2)choices.push(choice('contract','관아 주문 납품',s.contractDay===day?'오늘 주문 납품 완료':'시전에서 한지 6장 납품 · 곡식 48말',atMarket&&s.stock>=6&&s.contractDay!==day));
  return [...cancel,...opportunityOptions(s,a),...choices];
}
function cargoLabel(a){
  return a.cargoItem==='bark'?'닥 '+a.cargo+'묶음':'한지 '+a.cargo+'장';
}
function cancelDetail(a){
  if(a.task==='craft'||a.task==='toCraft')return '중단하면 작업용 닥 1묶음을 공방 재고로 돌립니다.';
  if(a.cargo)return '이 자리에서 멈춥니다. '+cargoLabel(a)+'은 돌석이 보관합니다.';
  if(a.task==='labor')return '품일을 중단합니다. 끝내기 전에는 품삯을 받지 않습니다.';
  return '현재 명령을 중단하고 이 자리에서 기다립니다.';
}
function cancelOrder(s,a){
  let message='명령을 중단하고 이 자리에서 기다립니다.';
  if(a.task==='craft'||a.task==='toCraft'){
    moveGoods(s,bins.reservedBark,bins.bark,1);
    a.batchesLeft=0;
    message='작업을 중단하고 닥 1묶음을 재고로 돌렸습니다.';
  }else if(a.cargo){
    message=cargoLabel(a)+'을 보관한 채 멈췄습니다.';
  }
  wait(a,'idle',a.cargo?'짐을 지고 운송 지시 대기':'명령 대기');
  note(s,people[a.id].name+' · '+message);
  return result(true,message);
}
export function workshopCommand(s,cmd,amount=5){
  const response=changeMandate(s,cmd,amount);
  if(response.ok)note(s,response.message);
  return response;
}
function manualControl(s,id) {
  if(s.workshop.enabled&&['apprentice','porter'].includes(id)){
    s.workshop.enabled=false;s.workshop.manualPause=true;
    note(s,'직원에게 직접 지시해 공방 운영 위임을 멈췄다.');
  }
}
export function command(s,id,cmd,target) {
  const a=s.agents.find(person=>person.id===id);
  if(!a||id==='rival')return result(false,'경쟁 상인은 자기 가문의 지시를 따릅니다.');
  if(cmd==='move') {
    if(!available(a))return result(false,'맡은 작업을 마친 뒤 이동할 수 있습니다.');
    const named=typeof target==='string';
    if(named?!Object.hasOwn(places,target):!finitePoint(target))return result(false,'길이나 건물을 선택하세요.');
    manualControl(s,id);
    go(a,target,'move',named?places[target].name+' 방면으로 이동 중':'길을 따라 이동 중');
    return result(true,named?places[target].name+' 이동 지시':'이동 지시');
  }
  const opportunity=opportunityCommand(s,a,cmd,target,opportunityActions);
  if(opportunity)return opportunity;
  const option=options(s,id).find(o=>o.id===cmd);
  if(!option?.enabled)return result(false,option?option.detail:'이 인물에게 맞는 명령을 선택하세요.');
  manualControl(s,id);
  switch(cmd){
    case 'cancel':
      return cancelOrder(s,a);
    case 'produce':
    case 'produceMax':
      startCraft(s,a,cmd==='produce'?1:s.bark);break;
    case 'haul':
      startPaperTrip(s,a);break;
    case 'haulBark':
      startBarkTrip(s,a);break;
    case 'buy':
      buyBark(s,false);break;
    case 'sell':
      sellPaper(s);break;
    case 'labor':
      wait(a,'labor','시전 장부 정리를 돕는 중',6,'work');break;
    case 'contract':
      moveGoods(s,bins.stall,bins.office,6);s.sold+=6;s.grain+=48;s.contractDay=clock(s).day;
      note(s,'관아에 한지 6장을 납품하고 곡식 48말을 받았다.');break;
  }
  return result(true,option.label+' · '+(a.mode==='idle'?'완료':'지시함'));
}
