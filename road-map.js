import {places,roads} from './simulation.mjs';

// The plot and its street door are separate: the road endpoint stays navigable.
export const yangjuPlot = {x:75.1,z:-6.7,w:5.1,d:6.7,signX:77.5,signZ:-6.3};
const titleDeed = {
  vacant:{state:'매물',cloth:'#bd9140',ink:'#705718'},
  player:{state:'우리 가문',cloth:'#378473',ink:'#235a4e'},
  rival:{state:'경쟁 가문',cloth:'#ab6252',ink:'#81483e'}
};
export function plotAppearance(owner){
  return titleDeed[owner==='player'||owner==='rival'?owner:'vacant'];
}

// The road diagram still accepts orders on devices without a working WebGL context.
export function makeRoadMap(mount,pick,onPan){
  mount.replaceChildren();
  const canvas=document.createElement('canvas');mount.append(canvas);
  canvas.setAttribute('aria-label','한성 · 양주 길 지도. 드래그하여 둘러보고 인물과 장터를 선택하세요.');
  canvas.style.touchAction='none';
  const ctx=canvas.getContext('2d');
  if(!ctx)return {render(){},projectActor(){return null;},focusPlace(){},getFocusX(){return 0;},zoom(){},rotate(){},reset(){}};
  let angle=0,magnification=1,focus={x:0,z:0},hitBoxes=[],transform;
  const colors={master:'#315c4c',apprentice:'#ad6147',porter:'#606a8b',rival:'#825747'};
  const eastLimit=Math.max(...Object.values(places).map(p=>p.x))+10;
  function terrain(deed){
    // Draw quiet map symbols in world coordinates, underneath routes and labels.
    ctx.fillStyle='#a9b99a';
    for(const [x,z,w,d] of [[40,-14,10,7],[51,-14,12,7],[44,-6.3,9,3.4],[54,-6.3,11,3.4],[47,5,14,6],[62,5,8,6]]){
      ctx.fillRect(x,z,w,d);ctx.strokeStyle='#c5ceb0';ctx.lineWidth=.2;
      for(let row=z+.7;row<z+d;row+=1.2){
        ctx.beginPath();ctx.moveTo(x+.35,row);ctx.lineTo(x+w-.35,row);ctx.stroke();
      }
    }
    const parcel=yangjuPlot, left=parcel.x-parcel.w/2, north=parcel.z-parcel.d/2;
    ctx.fillStyle='#c9b68f';ctx.fillRect(left,north,parcel.w,parcel.d);
    ctx.strokeStyle=deed.ink;ctx.lineWidth=.16;ctx.setLineDash([.6,.24]);
    ctx.strokeRect(left,north,parcel.w,parcel.d);ctx.setLineDash([]);
    for(const x of [left,left+parcel.w])for(const z of [north,north+parcel.d]){
      ctx.fillStyle='#6c5943';ctx.fillRect(x-.18,z-.18,.36,.36);
    }
    ctx.fillStyle=deed.cloth;ctx.beginPath();ctx.moveTo(parcel.signX,parcel.signZ);
    ctx.lineTo(parcel.signX-1.35,parcel.signZ+.36);ctx.lineTo(parcel.signX,parcel.signZ+.76);ctx.fill();
    for(const [x,z,w,d,rural] of [
      [-21,-5,4.4,6.2,false],[5,-5,4.3,6.5,false],[21,4.5,4.5,7,false],[-21,5,4.5,6,false],
      [-9,-6,6,3,false],[-6,5,6,3,false],[8,5,6,3,false],[31,-5,5,3,false],
      [85,5.7,4.4,6.4,true],[84,-7.4,6.6,3.8,true],[93,1.4,5.4,3.5,true]
    ]){
      const l=x-w/2,t=z-d/2;
      ctx.fillStyle=rural?'#b6a077':'#85988a';ctx.fillRect(l,t,w,d);
      ctx.strokeStyle=rural?'#917b5d':'#62796f';ctx.lineWidth=.16;ctx.strokeRect(l,t,w,d);
      ctx.beginPath();ctx.moveTo(l,t);ctx.lineTo(x,t+.8);ctx.lineTo(x,t+d-.8);
      ctx.lineTo(l,t+d);ctx.moveTo(l+w,t);ctx.lineTo(x,t+.8);ctx.moveTo(l+w,t+d);ctx.lineTo(x,t+d-.8);ctx.stroke();
    }
  }
  function render({actors,selectedId,followId,plotOwner=null,meetingAvailable=false}){
    const w=mount.clientWidth,h=mount.clientHeight,ratio=Math.min(window.devicePixelRatio||1,2);
    if(!w||!h)return;
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
    const tracked=actors.find(a=>a.id===followId);if(tracked)focus={x:tracked.x,z:tracked.z};
    const scale=Math.min(w/57,h/36)*magnification;
    const cx=Math.cos(angle),sx=Math.sin(angle);
    transform={scale,cx,sx,w,h};
    const project=p=>({x:w/2+((p.x-focus.x)*cx-(p.z-focus.z)*sx)*scale,y:h/2+((p.x-focus.x)*sx+(p.z-focus.z)*cx)*scale});
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#d8d6b7';ctx.fillRect(0,0,w,h);
    const deed=plotAppearance(plotOwner);
    ctx.save();ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.rotate(angle);ctx.translate(-focus.x,-focus.z);terrain(deed);ctx.restore();
    ctx.strokeStyle='#f6e8c7';ctx.lineWidth=Math.max(4,scale*1.2);ctx.lineCap='round';
    for(const [from,to] of roads){const a=project(from),b=project(to);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    hitBoxes=[];
    for(const [id,p] of Object.entries(places)){
      const parcel=id==='plot',meeting=id==='market'&&meetingAvailable;
      let title=p.name;
      if(parcel)title+=' · '+deed.state;
      if(meeting)title+=' · 서책상 면담';
      const pos=project(parcel?yangjuPlot:p),dir=p.z<0?-1:1,cy=pos.y+dir*25;
      ctx.font='bold 12px serif';const width=ctx.measureText(title).width+14;
      ctx.fillStyle=meeting?'#455773':'#f8f2de';ctx.fillRect(pos.x-width/2,cy-10,width,20);ctx.strokeStyle=parcel?deed.ink:'#676f58';ctx.lineWidth=1;ctx.strokeRect(pos.x-width/2,cy-10,width,20);
      ctx.fillStyle=meeting?'#fff8e7':parcel?deed.ink:'#2d4235';ctx.textAlign='center';ctx.fillText(title,pos.x,cy+4);
      hitBoxes.push({type:'place',id,x:p.x,z:p.z,left:pos.x-width/2,right:pos.x+width/2,top:cy-12,bottom:cy+12});
    }
    for(const a of actors){
      const p=project(a);ctx.beginPath();ctx.arc(p.x,p.y,a.id===selectedId?8:6,0,2*Math.PI);ctx.fillStyle=colors[a.id];ctx.fill();
      ctx.lineWidth=a.id===selectedId?3:1;ctx.strokeStyle=a.id===selectedId?'#ffdda1':'#fff9e3';ctx.stroke();
      hitBoxes.push({type:'actor',id:a.id,x:a.x,z:a.z,left:p.x-8,right:p.x+8,top:p.y-8,bottom:p.y+8});
    }
  }
  function canvasPick(e){
    if(!transform)return;const box=canvas.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;
    const hit=hitBoxes.slice().reverse().find(item=>x>=item.left&&x<=item.right&&y>=item.top&&y<=item.bottom);
    if(hit){pick(hit,e.button);return;}
    const {w,h,cx,sx,scale}=transform,dx=(x-w/2)/scale,dy=(y-h/2)/scale;
    const ground={x:focus.x+cx*dx+sx*dy,z:focus.z-sx*dx+cx*dy};
    if(places.plot && Math.abs(ground.x-yangjuPlot.x)<=yangjuPlot.w/2 && Math.abs(ground.z-yangjuPlot.z)<=yangjuPlot.d/2){
      pick({type:'place',id:'plot',x:places.plot.x,z:places.plot.z},e.button);return;
    }
    pick({type:'ground',...ground},e.button);
  }
  let drag=null;
  canvas.onpointerdown=e=>{
    if(e.button!==0||drag)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,focus:{...focus},moved:false};
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    if(!drag||e.pointerId!==drag.id||!transform)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<5)return;
    if(!drag.moved)onPan?.();
    drag.moved=true;
    const {cx,sx,scale}=transform;
    focus={x:Math.min(eastLimit,Math.max(-30,drag.focus.x-(cx*dx+sx*dy)/scale)),
      z:Math.min(17,Math.max(-17,drag.focus.z-(-sx*dx+cx*dy)/scale))};
  };
  canvas.onpointerup=e=>{if(drag?.id===e.pointerId){if(!drag.moved)canvasPick(e);drag=null;}};
  canvas.onpointercancel=e=>{if(drag?.id===e.pointerId)drag=null;};
  canvas.oncontextmenu=e=>{e.preventDefault();canvasPick(e);};
  function projectActor(id){
    const box=hitBoxes.find(item=>item.type==='actor'&&item.id===id);
    if(!box||!transform)return null;
    const x=(box.left+box.right)/2,y=box.top;
    return x>=0&&x<=transform.w&&y>=0&&y<=transform.h?{x,y}:null;
  }
  return {render,projectActor,getFocusX:()=>focus.x,focusPlace(id){if(places[id])focus={x:places[id].x,z:places[id].z};},
    rotate(n){angle+=n;},zoom(n){magnification=Math.min(2.5,Math.max(.6,magnification*n));},reset(){focus={x:0,z:0};angle=0;magnification=1;}};
}
