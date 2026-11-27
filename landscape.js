import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {makeHanok} from './architecture.js';
import {places,roads,yangjuPlot} from './world.mjs';

// A single static mesh lets even the distant village share one draw call.
export function village() {
  const root = new T.Group();
  const materials = new Map();
  const primitives = new Map();
  let seed = 1600;
  const random = () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function mat(color) {
    if(!materials.has(color))materials.set(color,new T.MeshLambertMaterial({color}));
    return materials.get(color);
  }
  function shape(key,builder) {
    if(!primitives.has(key))primitives.set(key,builder());
    return primitives.get(key);
  }
  function add(geo,color,x,y,z,sx=1,sy=1,sz=1) {
    const m=new T.Mesh(geo,mat(color));
    m.position.set(x,y,z);m.scale.set(sx,sy,sz);root.add(m);
    return m;
  }
  const cube=shape('box',()=>new T.BoxGeometry());
  const tuft=shape('green',()=>new T.IcosahedronGeometry(1,0));
  const round=shape('round',()=>new T.DodecahedronGeometry(1,0));
  const trunk=shape('trunk',()=>new T.CylinderGeometry(.8,1,1,6));
  const cylinder=shape('cylinder',()=>new T.CylinderGeometry(1,1,1,8));
  function box(x,y,z,w,h,d,col) {return add(cube,col,x,y,z,w,h,d);}
  function brush(x,y,z,w,h,d,col) {return add(tuft,col,x,y,z,w,h,d);}
  function stem(a,b,r,col) {
    const start=new T.Vector3(...a),end=new T.Vector3(...b);
    const delta=end.clone().sub(start),center=start.add(end).multiplyScalar(.5);
    const m=add(trunk,col,center.x,center.y,center.z,r,delta.length(),r);
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  }
  function pine(x,z,h) {
    const bend=(random()-.5)*h*.18;
    const bark='#775745';
    stem([x,0,z],[x+bend,h*.62,z],h*.049,bark);
    stem([x+bend,h*.62,z],[x+bend*.4,h*.88,z+.13],h*.036,bark);
    const greens=['#4f7658','#638569','#53785f','#718f6b'];
    for(let i=0;i<5;i++) {
      const angle=i*2.4+random()*.5;
      const reach=i===4?0:h*(.17+random()*.10);
      const y=h*(.53+i*.096),px=x+Math.cos(angle)*reach,pz=z+Math.sin(angle)*reach;
      if(reach)stem([x+bend*.7,y-.4,z],[px,y,pz],h*.023,bark);
      const foliage=add(round,greens[i%greens.length],px,y+h*.025,pz,h*.25,h*.115,h*.23);
      foliage.rotation.y=angle;
      brush(px+h*.06,y+h*.095,pz,h*.2,h*.088,h*.15,greens[(i+1)%greens.length]);
    }
  }
  function rock(x,z,r) {
    const m=add(round,'#aaa996',x,r*.21,z,r,r*.58,r*.71);
    m.rotation.y=random()*6;
  }
  // Dry stone boundary walls with tiled caps.
  function wall(x,z,w,d) {
    box(x,.36,z,w,.72,d,'#c1b59a');
    box(x,.08,z,w+.06,.16,d+.05,'#9d9884');
    box(x,.79,z,w+.12,.14,d+.12,'#69777a');
    box(x,.87,z,w,.07,d,'#8d9390');
  }
  function fence(x,z,length,alongX) {
    for(let i=0;i<=length;i+=1.35) {
      box(x+(alongX?i:0),.40,z+(alongX?0:i),.13,.8,.13,'#866953');
    }
    for(const y of [.29,.58])box(x+(alongX?length/2:0),y,z+(alongX?0:length/2),alongX?length:.09,.07,alongX?.09:length,'#a48a64');
  }
  function roofed(x,z,width,depth,type='cottage',rotation=0) {
    const h=makeHanok({width,depth,type,rotation});
    h.position.set(x,.03,z);
    root.add(h);
  }
  function yard(x,z,w,d) {
    box(x,-.055,z,w,.13,d,'#d7c6a4');
    for(let i=0;i<9;i++) {
      const px=x+(random()-.5)*(w-.5),pz=z+(random()-.5)*(d-.5);
      box(px,.014,pz,.2+random()*.32,.008,.09+random()*.17,'#c9b795');
    }
  }
  function crate(x,z) {
    box(x,.29,z,.9,.54,.62,'#b38b5d');
    for(const dx of [-.34,.34])box(x+dx,.3,z,.076,.58,.68,'#846744');
  }
  function jar(x,z,s) {
    const geo=shape('jars',()=>new T.LatheGeometry([
      new T.Vector2(.22,0),new T.Vector2(.38,.09),new T.Vector2(.48,.48),
      new T.Vector2(.42,.69),new T.Vector2(.29,.79),new T.Vector2(.34,.85)
    ],10));
    add(geo,'#765543',x,.015,z,s,s,s);
    add(cylinder,'#664939',x,.87*s,z,.34*s,.045*s,.34*s);
  }
  function fabricStall(x,z,angle,col) {
    const group=new T.Group();group.position.set(x,0,z);group.rotation.y=angle;root.add(group);
    function part(px,py,pz,w,h,d,c) {
      const m=new T.Mesh(cube,mat(c));m.position.set(px,py,pz);m.scale.set(w,h,d);group.add(m);return m;
    }
    for(const a of [-1.32,1.32])for(const b of [-.74,.74])part(a,1.03,b,.10,2.07,.10,'#876b47');
    part(0,.73,0,2.95,.16,1.36,'#a47b53');
    for(const b of [-1,1]) {
      const r=part(0,2.18,b*.51,3.3,.10,1.08,col);
      r.rotation.x=b*.27;
    }
    const goods=['#cc9c64','#9a6848','#dfba8d','#ac7851'];
    for(let i=0;i<5;i++){
      const q=new T.Mesh(round,mat(goods[i%4]));
      q.position.set(-1.05+i*.52,.94,(random()-.5)*.65);
      q.scale.set(.3,.23,.34);group.add(q);
    }
  }
  // Draw the street centerlines used for pathfinding, including the eastern road.
  box(0,-.23,0,310,.3,300,'#b8bc92');
  for(const s of roads) {
    const [a,b]=s;
    const dx=Math.abs(b.x-a.x),dz=Math.abs(b.z-a.z);
    const width=(a.z===0 && b.z===0)?3.65:2.20;
    const x=(a.x+b.x)*.5,z=(a.z+b.z)*.5;
    box(x,-.035,z,dx||width,.07,dz||width,'#d5bb91');
    // Wagon tracks are shallow marks, broken at crossroads.
    const steps=Math.floor((dx||dz)/1.1);
    for(let i=0;i<steps;i++){
      const t=random(),u=(random()-.5)*width*.9;
      box(a.x+(b.x-a.x)*t+(dx?0:u),.003,a.z+(b.z-a.z)*t+(dz?0:u),
        dx?random()*.5+.2:.08,.008,dx?.08:random()*.5+.2,i%2?'#c6aa83':'#e0c9a7');
    }
  }
  // Main properties are entered from open forecourts. Roofs sit to the side of each door.
  function drawProperty(place,yardWidth=place.footprint.w+.84,yardDepth=place.footprint.d+.4) {
    const {x,z,width,depth,type,rotation}=place.model;
    yard(x,z,yardWidth,yardDepth);
    roofed(x,z,width,depth,type,rotation);
  }
  for(const place of Object.values(places)) {
    if(place.model && place!==places.yangju)drawProperty(place);
  }
  const quarter=[
    [-9,-6.3,7,3.4,'cottage',0],[-6,5.25,6.5,3.3,'cottage',Math.PI],
    [9.1,5,6.4,3.2,'cottage',Math.PI],[11.7,-6.3,4.25,3.2,'cottage',0]
  ];
  for(const [x,z,w,d,type,yaw] of quarter) {
    const sideways=Math.abs(Math.sin(yaw))>.5;
    yard(x,z,(sideways?d:w)+1.6,(sideways?w:d)+1.1);
    roofed(x,z,w,d,type,yaw);
  }
  // Gate stairs and stepping stones tile the short approaches.
  for(const {x,z,model} of Object.values(places)) {
    if(!model)continue;
    for(let i=1;i<4;i++) {
      const reach=.3+i*.54;
      const step=box(x-Math.sin(model.rotation)*reach,.045,z-Math.cos(model.rotation)*reach,.83,.08,.43,'#bcb9a5');
      step.rotation.y=model.rotation;
    }
  }
  wall(-10.4,-8.85,9.2,.30);wall(8,-8.9,11,.3);wall(7,8.08,10,.3);
  fence(-13.6,2.15,3.8,false);fence(-12.5,-2.28,4,true);
  fabricStall(19.2,-3.6,Math.PI/2,'#b9694c');fabricStall(22.5,-5,.18,'#698e89');
  fabricStall(12.7,2.65,-.07,'#b58552');
  jar(-11.4,3.5,.9);jar(-10.6,3.6,.7);jar(6.6,-2.4,.8);jar(7.35,-2.48,.63);
  crate(18.85,8.1);crate(19.9,8.1);crate(-18.6,-8.6);
  for(let i=0;i<8;i++) {
    const x=-13.5+i%4*.43,z=-4.4+Math.floor(i/4)*.36;
    const log=add(trunk,'#a08254',x,.17,z,.12,1.4,.12);log.rotation.x=Math.PI/2;
  }
  // Receding residential lanes; intentional gaps give views into yards.
  for(let i=0;i<8;i++) {
    const x=-34+i*9.9+random()*1.35;
    roofed(x,-16.0-random()*1.4,6+random()*1.8,3.7,'cottage',i%3===0?.12:0);
    if(i%2===0)roofed(x+2.4,-24-random()*2,5.7,3.6,'cottage',-.08);
  }
  for(const [x,z,w,d,rot] of [[-30,5,6,4,0],[-31,-5,6,3,1.5],[31,-4,7,4,-1.2],
    [31,7,6.5,4,.10],[-29,13,7,4,0],[-19,16,7,3.5,0],[-10,17,6,3.4,.1],
    [14,17.5,6.4,3.8,.16],[29,15,6,3,.6]])roofed(x,z,w,d,'cottage',rot);
  // Low gravel bank and a meandering stream along the town's west edge.
  const stream=[];
  const channelX=z=>-37+Math.sin(z*.072)*3+Math.cos(z*.11);
  for(let z=-46;z<42;z+=2) {
    const a=channelX(z),b=channelX(z+2);
    stream.push(a-1.55,.01,z,a+1.55,.01,z,b-1.55,.01,z+2,b-1.55,.01,z+2,a+1.55,.01,z,b+1.55,.01,z+2);
    if(z%4===0)box(a+(random()-.5)*1.9,.018,z,.12,.012,random()*1.2+.4,'#b3c9ba');
    if(z%6===0)rock(a-1.8,z,.33+random()*.35);
  }
  const water=new T.BufferGeometry();
  water.setAttribute('position',new T.Float32BufferAttribute(stream,3));water.computeVertexNormals();
  add(water,'#86acaa',0,0,0);
  for(const [x,z,h] of [[-13,-7.7,3.7],[-3.3,-6.4,4.1],[10.1,-2.6,3.8],
    [-12,6.2,4.2],[3.1,6.5,3.2],[19,-8,4.3],[25,4.5,4.5],[-25,2,3.8],[-18,10.9,4.6]])pine(x,z,h);
  const colors=['#9aaf81','#a6b58b','#8eaa84','#bec39a'];
  for(let i=0;i<95;i++) {
    const x=random()*106-53,z=random()*76-45;
    if(x>-26&&x<26&&z>-13&&z<11)continue;
    if(Math.abs(x-channelX(z))<2.4 || (x>23 && Math.abs(z)<4))continue;
    if(i%3===0)pine(x,z,2.7+random()*2.6);
    else brush(x,.24,z,.45+random(),.52+random()*.75,.46+random(),colors[i%4]);
  }
  // Bunds divide the rice paddies; seedlings and shallow water catch the hill light.
  function paddy(x,z,w,d,tone) {
    box(x,-.03,z,w,.13,d,'#a99c71');
    box(x,.041,z,w-.44,.025,d-.44,tone);
    for(let row=0;row<Math.floor(d/.9);row++){
      const pz=z-d/2+.55+row*.9;
      for(let col=0;col<Math.floor(w/1.25);col++){
        const px=x-w/2+.74+col*1.25;
        brush(px,.13,pz,.24,.19,.09,row%2?'#919e63':'#9aaa70');
      }
    }
  }
  for(const [x,z,w,d,tone] of [
    [46,-7,10,6,'#9db1a0'],[57,-7,10.5,6,'#a6b49a'],
    [48,-14.4,14,7,'#a3b6a1'],[61,-14.4,10,7,'#9cb1a1'],
    [52,9,12,7,'#a7b395'],[64,9,10.6,7,'#a6b298'],
    [91,-12,9,6,'#a2afa0']
  ])paddy(x,z,w,d,tone);
  // Rain cap and carved directions on the wayside post at the end of the city street.
  function marker(x,z) {
    box(x,1.12,z,.20,2.24,.20,'#79563b');
    box(x,2.14,z,1.65,.30,.14,'#c8ae7b');
    const arrow=box(x+.84,2.14,z,.22,.22,.14,'#c8ae7b');arrow.rotation.z=-Math.PI/4;
    for(const offset of [-.44,-.18,.08,.34])
      box(x+offset,2.13,z+.077,.095,.12,.018,'#66563e');
    box(x,2.31,z,.34,.12,.31,'#584b3f');
  }
  marker(26.5,-2.15);marker(74,-2.15);
  for(const [x,z,h] of [[39,-6,3.8],[45,13.8,3.5],[65,-8,4.2],[70,8.4,3.9],
      [96,-9,5.3],[93,7.5,4.5],[84,-14,4],[71,-14,4.1]])pine(x,z,h);
  for(const [x,z] of [[41,-3.2],[65,3.4],[70,-4.0],[95,6.2]])rock(x,z,.56);
  // A rural grain market. Separate barn, thatched inn, baskets and tied rice sheaves
  // contrast with the packed tiled shops in Hanseong; both approaches remain clear.
  drawProperty(places.yangju,7.7,8.5);
  yard(83.8,-6.9,8.8,5.5);
  roofed(83.8,-7.4,6.6,3.8,'cottage');
  roofed(93.4,1.4,5.4,3.5,'cottage',-.10);
  fabricStall(68.4,-5.2,.04,'#b99855');
  fabricStall(69.4,-8.25,-Math.PI/2,'#829d88');
  fabricStall(84.2,10.5,Math.PI,'#aa7755');
  // Empty earth is bounded by stakes and flax rope. An open gate faces the
  // road and meets the plot's doorstep without obstructing passing travelers.
  const plot=yangjuPlot, left=plot.x-plot.w/2, right=plot.x+plot.w/2;
  const back=plot.z-plot.d/2, front=plot.z+plot.d/2;
  box(plot.x,-.025,plot.z,plot.w,.12,plot.d,'#bba176');
  box(plot.x,.042,plot.z,plot.w-.22,.045,plot.d-.22,'#cbb58b');
  for(let row=0;row<3;row++) {
    const x=left+1+row*.72;
    box(x,.073,back+2,.16,.055,2.1,'#b39b76');
  }
  const gate=places.plot;
  box((gate.x+right)/2,.006,gate.z,gate.x-right,.024,1.40,'#d3be99');
  const corners=[[left,front],[left,back],[right,back],[right,front]];
  const gateFront=gate.z+.82,gateBack=gate.z-.82;
  function boundary(a,b){
    const mid=[(a[0]+b[0])/2,.37,(a[1]+b[1])/2];
    stem([a[0],.59,a[1]],mid,.031,'#a58960');
    stem(mid,[b[0],.59,b[1]],.031,'#a58960');
  }
  for(const [x,z] of [...corners,[right,gateFront],[right,gateBack]]) {
    box(x,.43,z,.13,.86,.13,'#816045');
    box(x,.62,z,.145,.075,.145,'#bea276');
  }
  boundary(corners[0],corners[1]);boundary(corners[1],corners[2]);
  boundary(corners[0],corners[3]);boundary(corners[2],[right,gateBack]);
  boundary(corners[3],[right,gateFront]);
  box(plot.signX,1.16,plot.signZ,.14,2.32,.14,'#72553d');
  box(plot.signX-.50,2.22,plot.signZ,1.20,.09,.09,'#846749');
  // Narrowing haystacks, tied with straw rope, gathered for storage.
  const straw=shape('sheaf',()=>new T.ConeGeometry(1,1,8));
  for(const [x,z,s] of [[87.8,-4.4,1.2],[89.1,-4.8,1],[87.8,-6.1,.9],[92,4,.72],[85.6,9.1,.65]]) {
    add(straw,'#c5a467',x,.74*s,z,.70*s,1.48*s,.70*s);
    add(cylinder,'#947a4f',x,.64*s,z,.42*s,.065,.42*s);
  }
  fence(89.3,5.6,4.1,false);
  jar(82.1,8.1,1);jar(82.7,8.6,.8);
  crate(82.4,3.7);crate(83.5,3.7);
  // A freestanding indigo market banner can be seen over the roadside awnings.
  stem([81.5,0,1.65],[81.5,4.05,1.65],.075,'#7b644c');
  box(82.03,3.96,1.65,1.18,.075,.08,'#82694a');
  box(82.05,3.2,1.65,.90,1.45,.048,'#607f83');
  box(82.05,2.56,1.65,.90,.12,.053,'#c5b98f');
  // Backdrop ridges have continuous sloping facets rather than repeated cone peaks.
  function ridge(z0,width,heights,col) {
    const verts=[],colors=[];
    function tri(a,b,c,shade) {
      const tone=new T.Color(col).multiplyScalar(shade);
      verts.push(...a,...b,...c);
      for(let k=0;k<3;k++)colors.push(tone.r,tone.g,tone.b);
    }
    const profile=heights.map((y,i)=>({x:(i/(heights.length-1)-.5)*width,y,z:z0+(random()-.5)*11}));
    for(let i=0;i<profile.length-1;i++){
      const a=profile[i],b=profile[i+1],frontA=[a.x+(random()-.5)*3,-.1,z0+14],frontB=[b.x,-.1,z0+14];
      const peakA=[a.x,a.y,a.z],peakB=[b.x,b.y,b.z];
      const mid=[(a.x+b.x)*.5,(a.y+b.y)*.25,z0+8];
      tri(frontA,peakA,mid,.94+random()*.06);tri(peakA,peakB,mid,.98);
      tri(peakB,frontB,mid,1.04);tri(frontB,frontA,mid,.96);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
    const mesh=new T.Mesh(g,new T.MeshLambertMaterial({color:0xffffff,vertexColors:true}));
    root.add(mesh);
  }
  ridge(-68,235,[7,13,16,10,19,28,22,17,21,16,19,12,10,15,12],'#739288');
  ridge(-48,215,[5,9,12,16,12,17,10,9,14,11,15,10,7,12,8],'#84a189');
  return bake(root);
}

function bake(root) {
  root.updateMatrixWorld(true);
  const parts=[],geoSet=new Set(),matSet=new Set();
  root.traverse(node=>{
    if(!node.isMesh)return;
    const geo=node.geometry;
    const mat=node.material;
    geoSet.add(geo);
    if(Array.isArray(mat))for(const m of mat)matSet.add(m);else matSet.add(mat);
    const g=geo.index?geo.toNonIndexed():geo.clone();
    if(!g.attributes.normal)g.computeVertexNormals();
    g.applyMatrix4(node.matrixWorld);
    const count=g.attributes.position.count;
    const colors=new Float32Array(count*3);
    const old=g.attributes.color;
    const color=(Array.isArray(mat)?mat[0]:mat).color??new T.Color('white');
    for(let i=0;i<count;i++){
      colors[i*3]=color.r*(old?old.getX(i):1);
      colors[i*3+1]=color.g*(old?old.getY(i):1);
      colors[i*3+2]=color.b*(old?old.getZ(i):1);
    }
    for(const key of Object.keys(g.attributes))if(key!=='position'&&key!=='normal')g.deleteAttribute(key);
    g.setAttribute('color',new T.BufferAttribute(colors,3));
    parts.push(g);
  });
  const geometry=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  for(const g of geoSet)g.dispose();
  for(const m of matSet)m.dispose();
  const merged=new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));
  merged.castShadow=true;merged.receiveShadow=true;
  return merged;
}
