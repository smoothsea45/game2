// Distances are metres on the ground plane. Buildings are reached at their street doors.
const point = (x, z) => ({x, z});
export const places = {
  home: {name: '본가', x: 0, z: -5},
  workshop: {name: '한지 공방', x: -16, z: -4},
  market: {name: '종로 시전', x: 16, z: 4},
  rival: {name: '경쟁 지물전', x: -16, z: 5}
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
  ...[-16, 0, 16].map(x => [point(x, -10), point(x, 9)])
];
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
const intersections = [-16,0,16].flatMap(x=>[-10,0,9].map(z=>point(x,z)));
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
    action:'명령 대기',cargo:0,remaining:0,duration:0,path:[]};
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
  return {version:1,time:0,speed:1,agents,grain:18,bark:4,paper:0,stock:0,supply:4,sold:0,
    crafted:0, delivered:0, rivalSales:0, contractDay:0, log:[{time:0,text:'한성의 새벽 장이 섰다. 오늘 첫 한지를 지어 내다 팔자.'}]};
}
const tasks=new Set(['idle','move','toCraft','craft','toPickup','waitPaper','delivery','rivalWork','rivalDeliver','rivalReturn','labor']);
const counts=['grain','bark','paper','stock','supply','sold','crafted','delivered','rivalSales','contractDay'];
const isCount=n=>Number.isSafeInteger(n)&&n>=0;
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
function onStreet(p) {
  return finitePoint(p)&&distance(p,streetPoint(p))<0.001;
}
export function loadGame(text) {
  try {
    const s=JSON.parse(text);
    if (s?.version!==1||!Number.isFinite(s.time)||s.time<0||![0,1,2,4].includes(s.speed)||
      !counts.every(k=>isCount(s[k]))||!Array.isArray(s.agents)||s.agents.length!==4||
      !Array.isArray(s.log)||!s.log.every(v=>Number.isFinite(v.time)&&typeof v.text==='string')) return null;
    const ids=new Set();
    for(const a of s.agents) {
      if(!Object.hasOwn(people,a.id)||ids.has(a.id)||!onStreet(a)||!Array.isArray(a.path)||
        !a.path.every(onStreet)||!tasks.has(a.task)||!['walk','idle','work'].includes(a.mode)||
        ![a.at,a.target].every(v=>v===null||Object.hasOwn(places,v))||typeof a.action!=='string'||
        !Number.isFinite(a.remaining)||!Number.isFinite(a.duration)||a.remaining<0||a.duration<0||
        !isCount(a.cargo)||!Number.isFinite(a.heading))return null;
      ids.add(a.id);
    }
    return s;
  } catch {return null;}
}
function available(a) {return a.task==='idle'||a.task==='move'||a.task==='waitPaper';}
function parked(a,place) {return a.task==='idle'&&a.at===place;}
function complete(s,a) {
  switch(a.task) {
    case 'move':
      wait(a,'idle',a.at?places[a.at].name+' 도착':'길에서 대기');break;
    case 'toCraft':
      wait(a,'craft','발로 한지를 뜨는 중',9,'work');break;
    case 'craft':
      s.paper+=4;s.crafted+=4;
      note(s,'분이가 한지 4장을 공방 선반에 올렸다.');
      wait(a,'idle','한지 한 묶음 완성');break;
    case 'toPickup':
    case 'waitPaper':
      if(!s.paper){wait(a,'waitPaper','공방에서 한지를 기다리는 중');break;}
      a.cargo=Math.min(4,s.paper);s.paper-=a.cargo;
      note(s,'돌석이 공방에서 한지 '+a.cargo+'장을 지고 출발했다.');
      go(a,'market','delivery','시전으로 한지 운반 중');break;
    case 'delivery':
      s.stock+=a.cargo;s.delivered+=a.cargo;
      note(s,'돌석이 시전 판매대에 한지 '+a.cargo+'장을 내려놓았다.');
      a.cargo=0;wait(a,'idle','시전에 짐을 내려놓음');break;
    case 'rivalWork':
      a.cargo=6;go(a,'market','rivalDeliver','이웃 점포의 한지를 싣고 장으로');break;
    case 'rivalDeliver': {
      const oldPrice=price(s);
      s.supply+=a.cargo;s.rivalSales++;a.cargo=0;
      note(s,'경쟁 상인이 한지 6장을 풀었다. 시세 '+oldPrice+'말 → '+price(s)+'말.');
      go(a,'rival','rivalReturn','가게로 돌아가는 중');break;
    }
    case 'rivalReturn':
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
    const delta=Math.min(left,0.25),oldTime=s.time;left-=delta;s.time+=delta;
    if(Math.floor(oldTime/9)<Math.floor(s.time/9))s.supply=Math.max(0,s.supply-1);
    for(const a of s.agents)progressActor(s,a,delta);
  }
}
const result = (ok,message) => ({ok,message});
function choice(id,label,detail,enabled) {return {id,label,detail,enabled};}
export function options(s,id) {
  const a=s.agents.find(person=>person.id===id);if(!a||id==='rival')return [];
  if(id==='apprentice')return [choice('produce','한지 뜨기','공방에서 닥 1묶음 → 한지 4장 · 작업 9초',available(a)&&s.bark>0)];
  if(id==='porter')return [choice('haul','한지 운송','공방에서 최대 4장을 지고 시전으로 · 재고가 없으면 대기',available(a)&&a.task!=='waitPaper')];
  const atShop=parked(a,'workshop'),atMarket=parked(a,'market'),quantity=Math.min(4,s.stock);
  const day=clock(s).day;
  const choices=[
    choice('sell','한지 판매',quantity?'시전에서 '+quantity+'장 × '+price(s)+'말':'시전에서 운송된 한지를 판매',atMarket&&quantity>0),
    choice('buy','닥 매입','공방 납품처에서 곡식 5말 → 닥 3묶음',atShop&&s.grain>=5),
    choice('labor','장터 품일','시전에서 6초 일하고 곡식 3말 받기',atMarket)
  ];
  if(day>=2)choices.push(choice('contract','관아 주문 납품',s.contractDay===day?'오늘 주문 납품 완료':'시전에서 한지 6장 납품 · 곡식 48말',atMarket&&s.stock>=6&&s.contractDay!==day));
  return choices;
}
export function command(s,id,cmd,target) {
  const a=s.agents.find(person=>person.id===id);
  if(!a||id==='rival')return result(false,'경쟁 상인은 자기 가문의 지시를 따릅니다.');
  if(cmd==='move') {
    if(!available(a))return result(false,'맡은 작업을 마친 뒤 이동할 수 있습니다.');
    const named=typeof target==='string';
    if(named?!Object.hasOwn(places,target):!finitePoint(target))return result(false,'길이나 건물을 선택하세요.');
    go(a,target,'move',named?places[target].name+' 방면으로 이동 중':'길을 따라 이동 중');
    return result(true,named?places[target].name+' 이동 지시':'이동 지시');
  }
  const option=options(s,id).find(o=>o.id===cmd);
  if(!option?.enabled)return result(false,option?option.detail:'이 인물에게 맞는 명령을 선택하세요.');
  switch(cmd){
    case 'produce':
      // Reserve input at assignment, so a saved or repeated order cannot spend it twice.
      s.bark--;
      go(a,'workshop','toCraft','공방으로 출근 중');break;
    case 'haul':
      go(a,'workshop','toPickup','공방으로 짐을 받으러 가는 중');break;
    case 'buy':
      s.grain-=5;s.bark+=3;note(s,'가주가 공방에서 닥 3묶음을 5말에 들였다.');break;
    case 'sell':{
      const count=Math.min(4,s.stock),value=count*price(s);
      s.stock-=count;s.sold+=count;s.supply+=count;s.grain+=value;
      note(s,'시전에서 한지 '+count+'장을 팔아 곡식 '+value+'말을 받았다.');break;
    }
    case 'labor':
      wait(a,'labor','시전 장부 정리를 돕는 중',6,'work');break;
    case 'contract':
      s.stock-=6;s.sold+=6;s.grain+=48;s.contractDay=clock(s).day;
      note(s,'관아에 한지 6장을 납품하고 곡식 48말을 받았다.');break;
  }
  return result(true,option.label+' · '+(a.mode==='idle'?'완료':'지시함'));
}
