import * as THREE from './vendor/three.module.js';

const colors = {
  wood: 0x865c3c, aged: 0x634735, chestnut: 0x996946, paleWood: 0xb58d60,
  charcoal: 0x443d34, plaster: 0xe7d6ae, paper: 0xf5e8c4, lowerWall: 0xbcb09a,
  stone: 0xa8a18b, lightStone: 0xc4b99d, shade: 0x756c58,
  roof: 0x44565b, ridge: 0x607071, roofEdge: 0x34464b,
  blueRoof: 0x515d69, blueRidge: 0x738087, darkRoof: 0x414b4d,
  straw: 0xb49358, strawEdge: 0x866d47, strawLight: 0xc5aa71,
  ochre: 0xc59857, sage: 0x687d64, moss: 0x506657, madder: 0x9d5448,
  jar: 0x795746, jarRim: 0x564333, brass: 0xc7ab6e, sack: 0xb49a70
};
const materials = new Map();
const cube = new THREE.BoxGeometry(1, 1, 1);
const up = new THREE.Vector3(0, 1, 0);
const cylinders = new Map();

function material(color) {
  if (!materials.has(color)) {
    materials.set(color, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  }
  return materials.get(color);
}


function add(group, geo, color, x=0, y=0, z=0) {
  const part = new THREE.Mesh(geo, material(color));
  part.position.set(x,y,z);
  group.add(part);
  return part;
}
function box(g, x,y,z, w,h,d, color) {
  const mesh = add(g,cube,color,x,y,z);
  mesh.scale.set(w,h,d);
  return mesh;
}
function turn(g,x,y,z,top,bottom,height,color,segments=8) {
  const ratio=top/bottom;
  const key=segments+':'+ratio.toFixed(2);
  if (!cylinders.has(key)) cylinders.set(key,new THREE.CylinderGeometry(ratio,1,1,segments));
  const mesh=add(g,cylinders.get(key),color,x,y,z);
  mesh.scale.set(bottom,height,bottom);
  return mesh;
}
function strut(g, a, b, width, color) {
  const dir=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const beam=box(g,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,dir.length(),width,color);
  beam.quaternion.setFromUnitVectors(up, dir.normalize());
  return beam;
}
function surface(g, nx, ny, point, color) {
  const verts=[], uv=[], ids=[];
  for(let row=0;row<=ny;row++) for(let col=0;col<=nx;col++) {
    verts.push(...point(col/nx,row/ny));
    uv.push(col/nx,row/ny);
    if(row<ny && col<nx) {
      const a=row*(nx+1)+col, b=a+nx+1;
      ids.push(a,b,a+1,b,b+1,a+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(ids);
  geometry.computeVertexNormals();
  return add(g,geometry,color);
}

function roof(g,w,d,h,e,type){
  const hw=w/2+.35, hd=d/2+.38;
  const ridge=Math.max(w*.15,hw-hd*.80);
  const rise=Math.min(2.15,Math.max(.83,hd*.62));
  const isStraw=type==='cottage';
  const tone=isStraw?colors.straw:type==='market'?colors.blueRoof:type==='rival'?colors.darkRoof:colors.roof;
  const rib=isStraw?colors.strawLight:type==='market'?colors.blueRidge:colors.ridge;
  const rim=isStraw?colors.strawEdge:colors.roofEdge;

  // Each hip shares its sloping seam with the long tile field. Layers toward
  // the eaves bend out, then sweep back up at the corners.
  function level(t,edge){
    return h+rise*(.12*t+.88*t*t) + (1-t)*Math.pow(Math.abs(edge),3.4)*e
      + t*t*Math.pow(Math.abs(edge),4)*e*.62;
  }
  function front(side,u,t){
    const across=u*2-1;
    return [across*THREE.MathUtils.lerp(hw,ridge,t),level(t,across),side*hd*(1-t)];
  }
  function hip(side,u,t){
    const across=u*2-1;
    return [side*THREE.MathUtils.lerp(hw,ridge,t),
      level(t,1) - (1-t)*(1-Math.abs(across))*e*.35,
      across*hd*(1-t)];
  }
  // Long narrow rows read as repeated fired tiles even at the highest zoom.
  const count=Math.max(12,Math.round(w*2.9));
  const lineWidth=isStraw?.027:.049;
  for(const side of [-1,1]) {
    const point=(u,t)=>front(side,u,t);
    const sidePoint=(u,t)=>hip(side,u,t);
    surface(g,12,5,point,tone);
    surface(g,6,5,sidePoint,tone);
    // Fascia below all four sheet edges; tile caps cast a crisp eave shadow.
    for(const [face,length] of [[point,12],[sidePoint,6]]) {
      surface(g,length,1,(u,t)=>{
        const p=face(u,0);
        return [p[0],p[1]-.14*(1-t),p[2]];
      },rim);
    }
    for(let i=1;i<count;i++){
      if (isStraw && i%3!==0)continue;
      surface(g,1,5,(u,t)=>{
        const p=point((i+(u-.5)*lineWidth*count/(2*hw))/count,t);
        return [p[0],p[1]+.021,p[2]];
      },rib);
    }
    for(let i=1;i<Math.ceil(d*2);i+=isStraw?2:1){
      surface(g,1,4,(u,t)=>{
        const p=sidePoint((i+(u-.5)*.13)/Math.ceil(d*2),t);
        return [p[0],p[1]+.020,p[2]];
      },rib);
    }
    for(const end of [0,1]) {
      for(let j=0;j<5;j++){
        const a=point(end,j/5), b=point(end,(j+1)/5);
        a[1]+=.055;b[1]+=.055;
        strut(g,a,b,isStraw?.105:.135,rib);
      }
    }
  }
  // Paired upturned caps shape the ridge silhouette against the hills.
  for(let i=0;i<8;i++){
    const ridgeEnd=u=>{const f=u*2-1;return [f*ridge,level(1,f)+.075,0];};
    strut(g,ridgeEnd(i/8),ridgeEnd((i+1)/8),isStraw?.18:.195,rib);
  }
}

function lattice(g,x,y,z,w,h,side=0) {
  const frame=new THREE.Group();
  frame.position.set(x,y,z);frame.rotation.y=side;g.add(frame);
  box(frame,0,0,0,w,h,.070,colors.aged);
  box(frame,0,0,.045,w-.09,h-.1,.02,colors.paper);
  const cols=Math.max(2,Math.round(w/.28));
  for(let i=1;i<cols;i++)box(frame,w*(i/cols-.5),0,.066,.032,h-.08,.028,colors.chestnut);
  for (const fy of [-.30,-.08,.18,.33])box(frame,0,h*fy,.07,w-.06,.025,.028,colors.chestnut);
}

function jar(g,x,z,s){
  turn(g,x,.22*s,z,.28*s,.18*s,.40*s,colors.jar);
  turn(g,x,.47*s,z,.20*s,.28*s,.10*s,colors.jar);
  turn(g,x,.56*s,z,.22*s,.20*s,.09*s,colors.jarRim);
  turn(g,x,.62*s,z,.15*s,.23*s,.045*s,colors.aged);
}
function market(g,w,d,wall,front,tone){
  const cw=w*.79;
  const out=d/2+.38;
  const gap=Math.max(.35,out-front);
  const awning=(u,v)=>[(u-.5)*cw,wall*.82-.28*v-.075*Math.sin(Math.PI*v),front+v*gap];
  for(let i=0;i<7;i++){
    const shade=i%2===0?tone:colors.plaster;
    surface(g,1,4,(u,v)=>awning((i+u)/7,v),shade);
    box(g,(i+.5)*cw/7-cw/2,wall*.82-.35,out,cw/7,.145,.04,shade);
  }
  for(const s of [-1,1])box(g,s*cw*.485,wall*.40,out-.03,.075,wall*.80,.075,colors.paleWood);
  const table=box(g,0,.60,out-.32,cw*.93,.17,.55,colors.paleWood);
  for(const s of [-1,1])box(g,s*cw*.40,.30,table.position.z,.11,.60,.24,colors.aged);
  for(let j=0;j<4;j++) {
    const x=(j-1.5)*cw*.19;
    const goods=[colors.paper,colors.ochre,colors.sage,colors.madder][j];
    for(let k=0;k<(j%2?2:3);k++)box(g,x+.03*k,.715+k*.067,out-.32,cw*.13,.061,.34,goods);
  }
}
function workshop(g,w,d,front){
  const reach=d/2+.18;
  const rx=-w*.20, rw=Math.min(2.25,w*.46);
  for(const s of [-1,1]) {
    box(g,rx+s*rw*.50,.665,reach,.067,1.33,.075,colors.paleWood);
    strut(g,[rx+s*rw*.50,.15,reach-.25],[rx+s*rw*.50,1.1,reach],.046,colors.aged);
  }
  box(g,rx,1.28,reach,rw+.14,.074,.09,colors.wood);
  for(const j of [-1,0,1]){
    const sheet=box(g,rx+j*rw*.305,.91,reach+.012,rw*.253,.66,.026,colors.paper);
    sheet.rotation.x=-.10;
  }
  const vatx=w*.30;
  box(g,vatx,.285,reach-.14,Math.min(1.1,w*.21),.57,.74,colors.aged);
  box(g,vatx,.58,reach-.14,Math.min(1,w*.19),.025,.61,colors.sage);
  strut(g,[vatx-.22,.60,reach-.11],[vatx+.19,1.20,reach-.11],.045,colors.paleWood);
  jar(g,w*.405,front+.15,.77);
}

export function makeHanok({width=6,depth=4,type='home',rotation=0}={}) {
  const w=width,d=depth;
  const g=new THREE.Group();
  g.rotation.y=rotation;
  const commercial=type==='market'||type==='rival';
  const solidDepth=d*.73;
  const back=-d*.42, front=back+solidDepth;
  const plinth=.23, h=Math.max(1.43,Math.min(2.28,1.43+d*.105));
  box(g,0,plinth*.50,0,w+.1,plinth,d+.12,colors.stone);
  box(g,0,plinth+.05,front+(d/2-front)/2,w,.10,d/2-front,colors.paleWood);
  box(g,0,plinth+h*.50,back+solidDepth/2,w-.14,h,solidDepth,colors.plaster);
  // Stone skirt and eave rails run all the way round the house to support free camera rotation.
  box(g,0,plinth+.14,back+solidDepth/2,w-.09,.28,solidDepth+.04,colors.lowerWall);
  box(g,0,plinth+h-.07,back+solidDepth/2,w+.08,.20,solidDepth+.14,colors.aged);
  const bays=Math.max(2,Math.round(w/1.9));
  const gap=w/bays;
  for(let i=0;i<=bays;i++){
    const x=-w/2+i*gap;
    for(const z of [front,back]){
      box(g,x,plinth+h*.50,z,.13,h,.14,colors.chestnut);
      box(g,x,plinth+.06,z,.21,.12,.21,colors.lightStone);
    }
  }
  for(let i=0;i<bays;i++){
    const x=-w/2+(i+.5)*gap;
    const door=i===Math.floor((bays-1)/2);
    lattice(g,x,plinth+(door?.49:.60)*h,front+.035,gap*(door?.77:.70),h*(door?.91:.55));
    if (door)box(g,x+gap*.22,plinth+.42*h,front+.129,.07,.085,.052,colors.brass);
    if(i%2===0)lattice(g,x,plinth+h*.57,back-.035,Math.min(1.27,gap*.62),h*.43,Math.PI);
  }
  for(const side of [-1,1]){
    lattice(g,side*(w/2-.033),plinth+h*.59,back+solidDepth*.58,solidDepth*.43,h*.52,side*Math.PI/2);
    box(g,side*(w/2-.02),plinth+h*.48,back+solidDepth*.15,.12,h,.105,colors.wood);
  }
  box(g,0,plinth+h+.06,0,w+.23,.21,d+.18,colors.aged);
  roof(g,w,d,plinth+h+.155,Math.min(.35,d*.068),type);
  if(commercial){
    market(g,w,d,h+plinth,front,type==='market'?colors.madder:colors.sage);
  }else if(type==='workshop'){
    workshop(g,w,d,front);
  }else{
    const step=Math.min(w*.35,1.8);
    box(g,0,.08,d/2+.24,step,.15,.37,colors.lightStone);
    jar(g,w*.36,d/2-.20,.92);
    if(w>5)jar(g,w*.25,d/2-.16,.69);
  }
  return g;
}
