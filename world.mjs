// Ground coordinates in metres. A place's x,z identify its entrance on a street;
// the footprint identifies the building or lot selected by the player.
const point = (x,z) => ({x,z});
export const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const epsilon = 0.001;
export const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

function property(name,door,model,storageRoles,initialOwner) {
  const [x,z,width,depth,type,rotation] = model;
  const across = Math.abs(Math.sin(rotation));
  const along = Math.abs(Math.cos(rotation));
  // Account for the overhang of the four eaves on the selectable roof.
  const w = (width+.70)*along + (depth+.76)*across;
  const d = (width+.70)*across + (depth+.76)*along;
  return {...door,name,storageRoles,...(initialOwner===undefined?{}:{initialOwner}),model:{x,z,width,depth,type,rotation},footprint:{x,z,w,d,h:3.8}};
}
const quarterTurn = Math.PI/2;
export const yangjuPlot = {x:75.1,z:-6.7,w:5.1,d:6.7,h:.86,signX:77.5,signZ:-6.3};
export const places = {
  home:property('본가',point(0,-5),[4.9,-5.15,6.5,4.3,'home',-quarterTurn],['shelf'],'player'),
  workshop:property('한지 공방',point(-16,-4),[-20.8,-5,6.2,4.5,'workshop',quarterTurn],['shelf','reserved'],'player'),
  market:property('종로 시전',point(16,4),[21.3,4.5,7.4,4.4,'market',-quarterTurn],['seller','pickup','stall','office']),
  rival:property('경쟁 지물전',point(-16,5),[-21,5,5.7,4.5,'rival',quarterTurn],['shelf','reserved'],'rival'),
  yangju:property('양주 장터',point(79,4),[85,5.7,6.4,4.4,'cottage',-quarterTurn],['seller','pickup','stall']),
  plot:{name:'양주 빈터',...point(79,-5),footprint:yangjuPlot,storageRoles:[],initialOwner:null,rentPerDay:4}
};
export const roads = [
  [point(-23,0),point(23,0)],
  [point(-16,-10),point(16,-10)],
  [point(-16,9),point(16,9)],
  ...[-16,0,16].map(x=>[point(x,-10),point(x,9)]),
  [point(23,0),point(89,0)],
  [point(79,-8),point(79,9)]
];
export function districtName(x) {
  if (x<=28) return '한성';
  return x<67 ? '한성·양주 사이' : '양주';
}
export function placeAtGround({x,z}) {
  return Object.keys(places).find(id=>{
    const r=places[id].footprint;
    return Math.abs(x-r.x)<=r.w/2 && Math.abs(z-r.z)<=r.d/2;
  }) ?? null;
}
const clamp = (n,lo,hi) => Math.min(hi,Math.max(lo,n));
function projection(p,[a,b]) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz),0,1);
  return point(a.x+t*dx,a.z+t*dz);
}
const onSegment = (p,road) => distance(p,projection(p,road))<epsilon;
function closestRoad(p) {
  let nearest=roads[0],least=Infinity;
  for(const road of roads){
    const d=distance(p,projection(p,road));
    if(d<least){nearest=road;least=d;}
  }
  return nearest;
}
export function streetPoint(p) {return projection(p,closestRoad(p));}
const offsets={master:0,apprentice:-.8,porter:1.1,rival:-1.2};
export function doorstep(actorId,placeId) {
  const door=places[placeId];
  const road=closestRoad(door),[a,b]=road;
  const dx=b.x-a.x,dz=b.z-a.z,offset=offsets[actorId]??0;
  const length=Math.hypot(dx,dz);
  return projection(point(door.x+offset*dx/length,door.z+offset*dz/length),road);
}
export function doorAtGround(actorId,p) {
  return Object.keys(places).find(id=>distance(p,places[id])<=1.2 || distance(p,doorstep(actorId,id))<epsilon)??null;
}

// All rendered street segments participate in routing. Shared ends, T-junctions,
// and perpendicular crossings become graph nodes without a second hand-drawn map.
function streetNodes() {
  const unique=new Map();
  const add=p=>unique.set(p.x+','+p.z,p);
  for(const [a,b] of roads){add(a);add(b);}
  const horizontal=roads.filter(([a,b])=>a.z===b.z);
  const vertical=roads.filter(([a,b])=>a.x===b.x);
  for(const h of horizontal)for(const v of vertical){
    const p=point(v[0].x,h[0].z);
    if(onSegment(p,h)&&onSegment(p,v))add(p);
  }
  return [...unique.values()];
}
const nodes=streetNodes();
export function route(from,to) {
  const points=[point(from.x,from.z),to,...nodes];
  const graph=points.map(()=>[]);
  for(const road of roads) {
    const indices=points.map((_,i)=>i).filter(i=>onSegment(points[i],road));
    indices.sort((i,j)=>points[i].x-points[j].x || points[i].z-points[j].z);
    for(let i=1;i<indices.length;i++){
      const a=indices[i-1],b=indices[i];
      graph[a].push(b);graph[b].push(a);
    }
  }
  const costs=points.map(()=>Infinity),previous=points.map(()=>-1),seen=new Set();
  costs[0]=0;
  while(true){
    let current=-1;
    for(let i=0;i<points.length;i++){
      if(!seen.has(i)&&Number.isFinite(costs[i])&&(current===-1||costs[i]<costs[current]))current=i;
    }
    if(current<0)throw new Error('Disconnected street');
    if(current===1)break;
    seen.add(current);
    for(const next of graph[current]){
      const total=costs[current]+distance(points[current],points[next]);
      if(total<costs[next]){costs[next]=total;previous[next]=current;}
    }
  }
  const path=[];
  for(let i=1;i!==0;i=previous[i])path.unshift(points[i]);
  return path;
}
export function validTravel(a) {
  if(!finitePoint(a)||!roads.some(road=>onSegment(a,road))||!Array.isArray(a.path))return false;
  for(const id of [a.at,a.target])if(id!==null&&!Object.hasOwn(places,id))return false;
  if(a.mode!=='walk'){
    return a.path.length===0 && a.target===null && (a.at===null || distance(a,doorstep(a.id,a.at))<epsilon);
  }
  if(a.at!==null)return false;
  let prev=a;
  for(const next of a.path){
    if(!finitePoint(next)||!roads.some(road=>onSegment(prev,road)&&onSegment(next,road)))return false;
    prev=next;
  }
  return a.target===null || distance(prev,doorstep(a.id,a.target))<epsilon;
}
