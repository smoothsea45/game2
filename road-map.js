import {places,roads} from './simulation.mjs';

// The road diagram still accepts orders on devices without a working WebGL context.
export function makeRoadMap(mount,pick){
  mount.replaceChildren();
  const canvas=document.createElement('canvas');mount.append(canvas);
  const ctx=canvas.getContext('2d');
  if(!ctx)return {render(){},projectActor(){return null;},zoom(){},rotate(){},reset(){}};
  let angle=0,magnification=1,focus={x:0,z:0},hitBoxes=[],transform;
  const colors={master:'#315c4c',apprentice:'#ad6147',porter:'#606a8b',rival:'#825747'};
  function render({actors,selectedId,followId}){
    const w=mount.clientWidth,h=mount.clientHeight,ratio=Math.min(devicePixelRatio||1,2);
    if(!w||!h)return;
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
    const tracked=actors.find(a=>a.id===followId);if(tracked)focus={x:tracked.x,z:tracked.z};
    const scale=Math.min(w/57,h/36)*magnification;
    const cx=Math.cos(angle),sx=Math.sin(angle);
    transform={scale,cx,sx,w,h};
    const project=p=>({x:w/2+((p.x-focus.x)*cx-(p.z-focus.z)*sx)*scale,y:h/2+((p.x-focus.x)*sx+(p.z-focus.z)*cx)*scale});
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#d8d6b7';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#f6e8c7';ctx.lineWidth=Math.max(4,scale*1.2);ctx.lineCap='round';
    for(const [from,to] of roads){const a=project(from),b=project(to);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    hitBoxes=[];
    for(const [id,p] of Object.entries(places)){
      const pos=project(p),dir=p.z<0?-1:1,cy=pos.y+dir*25;
      ctx.font='bold 12px serif';const width=ctx.measureText(p.name).width+14;
      ctx.fillStyle='#f8f2de';ctx.fillRect(pos.x-width/2,cy-10,width,20);ctx.strokeStyle='#676f58';ctx.lineWidth=1;ctx.strokeRect(pos.x-width/2,cy-10,width,20);
      ctx.fillStyle='#2d4235';ctx.textAlign='center';ctx.fillText(p.name,pos.x,cy+4);
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
    pick({type:'ground',x:focus.x+cx*dx+sx*dy,z:focus.z-sx*dx+cx*dy},e.button);
  }
  canvas.onclick=canvasPick;canvas.oncontextmenu=e=>{e.preventDefault();canvasPick(e);};
  function projectActor(id){
    const box=hitBoxes.find(item=>item.type==='actor'&&item.id===id);
    if(!box||!transform)return null;
    const x=(box.left+box.right)/2,y=box.top;
    return x>=0&&x<=transform.w&&y>=0&&y<=transform.h?{x,y}:null;
  }
  return {render,projectActor,rotate(n){angle+=n;},zoom(n){magnification=Math.min(2.5,Math.max(.6,magnification*n));},reset(){focus={x:0,z:0};angle=0;magnification=1;}};
}
