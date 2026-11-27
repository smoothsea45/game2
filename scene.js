import * as T from './vendor/three.module.js';
import {village} from './landscape.js';
import {makePerson} from './characters.js';
import {places,people} from './simulation.mjs';

const roofs = {
  home:{x:4.9,z:-5.15,w:4.8,d:7},
  workshop:{x:-20.8,z:-5,w:5,d:6.8},
  market:{x:21.3,z:4.5,w:4.9,d:7.8},
  rival:{x:-21,z:5,w:5,d:6.4},
  yangju:{x:85,z:5.7,w:5.2,d:7.1}
};
const labelStyles = {
  position:'absolute',whiteSpace:'nowrap',display:'block',margin:'0',padding:'3px 6px',
  border:'1px solid #b5a582',borderRadius:'3px',background:'#fff7dfed',color:'#353b31',
  font:'700 11px/1.25 "Nanum Myeongjo","Noto Serif KR",Georgia,serif',pointerEvents:'auto',
  boxShadow:'0 2px 5px #33291235',cursor:'pointer',transform:'translate(-50%,-100%)',
  touchAction:'manipulation',letterSpacing:'.01em'
};
const clamp=T.MathUtils.clamp;
const elevation=.65;

export function createScene(container,{onPick,onPan}={}) {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
  const canvas=renderer.domElement;
  canvas.setAttribute('aria-label','한성과 양주를 잇는 3D 거리. 인물과 건물을 선택하거나 길을 눌러 이동할 수 있습니다.');
  Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',touchAction:'none',cursor:'grab'});
  container.appendChild(canvas);
  const scene=new T.Scene();
  scene.fog=new T.FogExp2('#e4dac3',.0072);
  scene.background=new T.Color('#eadfc9');
  const camera=new T.OrthographicCamera(-25,25,18,-18,.1,250);
  const fill=new T.HemisphereLight('#fff6dd','#b2ae88',1.85);
  const sun=new T.DirectionalLight('#ffedc5',2.30);
  sun.position.set(-24,42,-16);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-37,right:37,top:32,bottom:-32,near:1,far:115});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(1536,1536);sun.shadow.bias=-.00045;sun.shadow.normalBias=.032;
  scene.add(fill,sun,sun.target,village());
  const peopleModels=new Map(Object.keys(people).map(id=>[id,makePerson(id)]));
  for(const m of peopleModels.values())scene.add(m.group);

  // A roof can hide a traveler when the player orbits the camera. Only the
  // occluded part of this location marker is drawn, so open-road figures stay natural.
  const occlusionGeometry=new T.SphereGeometry(.22,8,5);
  const occlusionMaterial=new T.MeshBasicMaterial({
    color:'#efc777',depthFunc:T.GreaterDepth,depthWrite:false,transparent:true,opacity:.93
  });
  for(const person of peopleModels.values()){
    const marker=new T.Mesh(occlusionGeometry,occlusionMaterial);
    marker.position.y=2.28;marker.renderOrder=2;person.group.add(marker);
  }

  const extras=[makePerson('vendor'),makePerson('resident'),makePerson('resident'),makePerson('vendor')];
  for(const person of extras)scene.add(person.group);
  const circle=new T.Mesh(new T.RingGeometry(.59,.76,36),
    new T.MeshBasicMaterial({color:'#db9d3b',side:T.DoubleSide,depthWrite:false}));
  circle.rotation.x=-Math.PI/2;
  scene.add(circle);
  const labels=document.createElement('div');
  Object.assign(labels.style,{position:'absolute',inset:'0',overflow:'hidden',pointerEvents:'none'});
  container.appendChild(labels);
  const signs={};
  for(const [id,p] of Object.entries(places)){
    const node=document.createElement('button');node.type='button';node.textContent=p.name;
    node.setAttribute('aria-label',p.name+' 이동');Object.assign(node.style,labelStyles);
    node.addEventListener('click',e=>{e.stopPropagation();onPick?.({type:'place',id,x:p.x,z:p.z},0);});
    node.addEventListener('contextmenu',e=>{e.preventDefault();onPick?.({type:'place',id,x:p.x,z:p.z},2);});
    labels.appendChild(node);
    signs[id]={node};
  }
  const activeLabel=document.createElement('span');
  Object.assign(activeLabel.style,labelStyles,{color:'#fff7dc',background:'#244939ed',borderColor:'#c7b277',pointerEvents:'none'});
  labels.appendChild(activeLabel);

  const target=new T.Vector3(0,0,-.5),screen=new T.Vector3(),hitPoint=new T.Vector3(),pointer=new T.Vector2();
  const cast=new T.Raycaster(),ground=new T.Plane(new T.Vector3(0,1,0),0);
  const rayBoxes=Object.entries(roofs).filter(([id])=>places[id]).map(([id,{x,z,w,d}])=>[id,new T.Box3(
    new T.Vector3(x-w/2,0,z-d/2),new T.Vector3(x+w/2,3.8,z+d/2))]);
  let width=1,height=1,zoomLevel=1,angle=.30,frustum=35,currentActors=[],selected=null;
  let hideActorLabel=false;
  let inertialFrame=false,previousFollow=null;
  const eastLimit=Math.max(...Object.values(places).map(p=>p.x))+10;
  function focusPlace(id){
    const point=places[id];if(!point)return;
    target.set(point.x,0,point.z);inertialFrame=true;updateCamera();
  }
  function updateCamera(){
    const aspect=width/height;
    // Fit all four properties, while keeping narrower phone screens useful for close-ups.
    frustum=Math.max(23,52/aspect)/zoomLevel;
    camera.left=-frustum*aspect/2;camera.right=-camera.left;
    // Show the rooftops beyond the main street while keeping characters in the central play area.
    camera.top=frustum*.53;camera.bottom=-frustum*.47;
    camera.position.set(target.x+Math.sin(angle)*Math.cos(elevation)*92,
      Math.sin(elevation)*92,target.z+Math.cos(angle)*Math.cos(elevation)*92);
    camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    // Track both settlements with a local shadow window of constant resolution.
    const lightX=Math.round(target.x*4)/4,lightZ=Math.round(target.z*4)/4;
    sun.target.position.set(lightX,0,lightZ);sun.position.set(lightX-24,42,lightZ-16);
  }
  function resize(){
    width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);
    renderer.setSize(width,height,false);updateCamera();
  }
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function projected(x,y,z){
    screen.set(x,y,z).project(camera);
    return {x:(screen.x+1)*width/2,y:(1-screen.y)*height/2};
  }
  function projectActor(id) {
    const actor=currentActors.find(a=>a.id===id);
    if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.z))return null;
    const head=projected(actor.x,2.05,actor.z);
    if(screen.z < -1 || screen.z > 1 || head.x<0 || head.x>width || head.y<0 || head.y>height)return null;
    return head;
  }
  function overlaps(a,b) {
    return Math.abs(a.x-b.x)<(a.w+b.w)*.5+3 && Math.abs(a.y-b.y)<(a.h+b.h)*.5+2;
  }
  function positionLabel(node,p,textWidth,occupied,selectedTag){
    const h=19;
    let found=false;
    for(const shift of [0,-18,17]){
      const r={x:p.x,y:p.y+shift-h*.5,w:textWidth,h};
      if(r.x-textWidth/2<1||r.x+textWidth/2>width-1||r.y<2||r.y+h/2>height-2)continue;
      if(occupied.some(o=>overlaps(o,r)))continue;
      occupied.push(r);node.style.left=Math.round(p.x)+'px';node.style.top=Math.round(p.y+shift)+'px';
      found=true;break;
    }
    node.style.visibility=found?'visible':'hidden';
    if(selectedTag)node.style.zIndex='1';
  }
  function positionLabels(){
    const occupied=currentActors.map(a=>{
      const head=projected(a.x,1.95,a.z),foot=projected(a.x,.05,a.z);
      return {x:head.x,y:(head.y+foot.y)/2,w:10,h:Math.abs(foot.y-head.y)};
    });
    const active=currentActors.find(a=>a.id===selected);
    if(active&&!hideActorLabel) {
      activeLabel.textContent=people[active.id]?.name??'';
      positionLabel(activeLabel,projected(active.x,2.42,active.z),51,occupied,true);
    }else activeLabel.style.visibility='hidden';
    for(const [id,{node}] of Object.entries(signs)){
      // At phone overview scale, leave the rival roof pickable without its extra placard.
      if(id==='rival'&&height<520&&zoomLevel<1.18){node.style.visibility='hidden';continue;}
      const {x,z}=roofs[id]??places[id];
      positionLabel(node,projected(x,4.25,z),places[id].name.length*11+14,occupied,false);
    }
  }
  function pick(clientX,clientY,button){
    const rect=canvas.getBoundingClientRect(),px=clientX-rect.left,py=clientY-rect.top;
    // The on-screen bodies remain selectable at a comfortable touch size when zoomed out.
    let closest=null,least=Infinity;
    for(const actor of currentActors){
      const foot=projected(actor.x,0,actor.z),head=projected(actor.x,2,actor.z);
      const mid=(head.y+foot.y)*.5;
      const dx=px-head.x,dy=py-mid;
      const metric=(dx/Math.max(9,Math.abs(foot.y-head.y)*.43))**2+(dy/Math.max(12,Math.abs(foot.y-head.y)*.63))**2;
      if(metric<=1&&metric<least){least=metric;closest=actor;}
    }
    if(closest){onPick?.({type:'actor',id:closest.id,x:closest.x,z:closest.z},button);return;}
    pointer.set(px/width*2-1,1-py/height*2);cast.setFromCamera(pointer,camera);
    let placeId=null,nearest=Infinity;
    for(const [id,box] of rayBoxes){
      if(cast.ray.intersectBox(box,hitPoint)){
        const distance=cast.ray.origin.distanceToSquared(hitPoint);
        if(distance<nearest){nearest=distance;placeId=id;}
      }
    }
    if(placeId){onPick?.({type:'place',id:placeId,x:places[placeId].x,z:places[placeId].z},button);return;}
    if(cast.ray.intersectPlane(ground,hitPoint))onPick?.({type:'ground',x:hitPoint.x,z:hitPoint.z},button);
  }
  const pointers=new Map();
  let gesture=null,start=null,dragged=false;
  function pan(dx,dy){
    const scale=frustum/height,s= Math.sin(angle),c=Math.cos(angle);
    target.x=clamp(target.x-scale*(c*dx+s*dy/Math.sin(elevation)),-30,eastLimit);
    target.z=clamp(target.z-scale*(-s*dx+c*dy/Math.sin(elevation)),-17,17);
    inertialFrame=true;onPan?.();updateCamera();
  }
  function zoom(factor){zoomLevel=clamp(zoomLevel*factor,.73,3.5);updateCamera();}
  function rotate(rad){angle+=rad;updateCamera();}
  function pair(){
    const [a,b]=[...pointers.values()];
    return {length:Math.max(4,Math.hypot(b.x-a.x,b.y-a.y)),angle:Math.atan2(b.y-a.y,b.x-a.x),
      x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  }
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    e.preventDefault();canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){
      start={x:e.clientX,y:e.clientY,button:e.button};
      dragged=false;canvas.style.cursor='grabbing';
    }else if(pointers.size===2){dragged=true;gesture=pair();}
  });
  canvas.addEventListener('pointermove',e=>{
    const prev=pointers.get(e.pointerId);if(!prev)return;
    const x=e.clientX,y=e.clientY;pointers.set(e.pointerId,{x,y});
    if(pointers.size===2){
      const next=pair();
      if(gesture){zoom(next.length/gesture.length);rotate(gesture.angle-next.angle);pan(next.x-gesture.x,next.y-gesture.y);}
      gesture=next;return;
    }
    if(pointers.size!==1||!start)return;
    if(Math.hypot(x-start.x,y-start.y)>5)dragged=true;
    if(dragged){
      if(e.shiftKey||start.button===1)rotate((prev.x-x)*.012);
      else pan(x-prev.x,y-prev.y);
    }
  });
  function release(e,canPick){
    if(!pointers.has(e.pointerId))return;
    if(canPick&&pointers.size===1&&!dragged&&start)pick(e.clientX,e.clientY,start.button);
    pointers.delete(e.pointerId);
    if(pointers.size<2)gesture=null;
    if(!pointers.size){start=null;canvas.style.cursor='grab';}
  }
  canvas.addEventListener('pointerup',e=>release(e,true));
  canvas.addEventListener('pointercancel',e=>release(e,false));
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-Math.sign(e.deltaY)*.13));},{passive:false});
  let lastLight=-20,lastUpdate=0;
  function render({actors,selectedId,followId,seconds=0,hideActorLabel:hideLabel=false}){
    currentActors=actors;selected=selectedId;hideActorLabel=hideLabel;
    for(const a of actors)peopleModels.get(a.id)?.animate(a,seconds,a.id===selectedId);
    const active=actors.find(a=>a.id===selectedId),follow=actors.find(a=>a.id===followId);
    const now=performance.now(),dt=Math.min(.15,(now-lastUpdate)/1000);lastUpdate=now;
    if(follow&&!inertialFrame) {
      const ease=follow.id===previousFollow ? 1-Math.exp(-dt*7) : 1;target.x+=(follow.x-target.x)*ease;target.z+=(follow.z-target.z)*ease;updateCamera();
    }
    previousFollow=inertialFrame?null:(follow?.id??null);inertialFrame=false;
    if(active){circle.visible=true;circle.position.set(active.x,.068,active.z);}else circle.visible=false;
    extras[0].animate({x:18.3,z:-3.2,mode:'work',heading:-.9,cargo:0},seconds,false);
    extras[3].animate({x:75.4,z:-5.5,mode:'work',heading:1.18,cargo:0},seconds,false);
    // Residents keep to the two parallel lanes and turn at their ends.
    for(let i=1;i<=2;i++){
      const t=(seconds*(i===1?.78:.62)+i*9)%56;
      const forward=t<28, x=forward?-14+t:42-t;
      extras[i].animate({x,z:i===1?9:-10,mode:'walk',heading:forward?Math.PI/2:-Math.PI/2,cargo:0},seconds,false);
    }
    if(Math.abs(lastLight-seconds)>2) {
      const hour=(7+seconds/15)%24;
      const light=Math.max(.04,Math.sin((hour-6)/12*Math.PI));
      sun.intensity=.40+light*1.86;fill.intensity=1.35+light*.55;
      scene.background.setHSL(.12,.31,.58+light*.26);
      scene.fog.color.copy(scene.background);lastLight=seconds;
    }
    positionLabels();renderer.render(scene,camera);
  }
  return {render,rotate,zoom,projectActor,focusPlace,getFocusX:()=>target.x,reset(){target.set(0,0,-.5);angle=.30;zoomLevel=1;updateCamera();},
    dispose(){observer.disconnect();renderer.dispose();canvas.remove();labels.remove();}};
}
