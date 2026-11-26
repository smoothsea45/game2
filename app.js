import {makeRoadMap} from './road-map.js';
import {places, people, fresh, tick, command, options, price, clock, loadGame} from './simulation.mjs';

const el = id => document.getElementById(id);
const glyphs = {
  book:'M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1ZM12 6v14',
  sun:'M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  pause:'M8 5v14M16 5v14',play:'m8 4 10 8-10 8Z',flag:'M5 22V3q4-3 8 0t7 0l-2 5 2 4q-4 3-8 0t-7 0',
  target:'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0M12 2v5m0 10v5M2 12h5m10 0h5',
  frame:'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5',rotateLeft:'m9 3-4 4 4 4M5 7h8a7 7 0 1 1-6 11',
  rotateRight:'m15 3 4 4-4 4m4-4h-8a7 7 0 1 0 6 11',plus:'M12 5v14M5 12h14',minus:'M5 12h14',
  pointer:'m4 3 5 17 3-6 6 5 2-2-6-5 6-2Z',arrowRight:'m9 5 7 7-7 7',
  feather:'M4 21 16 9m-9 9q-2-7 4-12 4-4 10-4 0 9-6 14-4 3-8 2Z',
  close:'m5 5 14 14M19 5 5 19',grain:'M12 22V6m0 11q-7-1-7-7 6 0 7 7Zm0-6q7-1 7-7-6 0-7 7Zm0-4q-4-3 0-6 4 3 0 6Z',
  bark:'m4 17 12-13 4 3L8 21Zm3-5-3-3m10 0 1-6m0 12 6-1',
  sheet:'m2 8 10-5 10 5-10 5Zm1 5 9 5 9-5M3 17l9 5 9-5',stall:'M4 10v10h16V10M2 10l3-6h14l3 6q-2 3-5 0-2 3-5 0-2 3-5 0-3 3-5 0Zm5 10v-5h4v5',
  price:'M3 19h18M4 14l5-5 4 3 7-8m-5 0h5v5',haul:'M2 6h3l3 10h10l3-7H6m3 11h1m7 0h1',
  hand:'M6 11V7a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6q0 6-6 6-3 0-5-3l-4-6q-1-3 2-2Z',
  coin:'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0m7-2h4v4h-4Z'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','glyph');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path = document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d',glyphs[name]);svg.append(path);return svg;
}
document.querySelectorAll('[data-icon]').forEach(node => node.replaceWith(icon(node.dataset.icon)));

const saveKey='hanseong-garok-realtime-v1';
let game;
try {game=loadGame(localStorage.getItem(saveKey));} catch {}
game ||= fresh();
let selected='apprentice', following=null, lastSpeed=game.speed||1, visual, toastTimer;
const landscape=matchMedia('(orientation: landscape)');
const card=el('command-card'),dialog=el('book-dialog');
const pocketButtons=[...document.querySelectorAll('[data-pocket]')];
let openPocket=null,pocketSignature='',portraitId=null;
const actor = id => game.agents.find(a => a.id===id);
const rosterNodes = {}, resourceValues = {}, actionNodes = new Map();
const portrait = {master:'head',apprentice:'apprentice',porter:'porter',rival:'rival'};
for(const [id,person] of Object.entries(people)){
  const b=document.createElement('button');b.type='button';b.className='person';b.dataset.person=id;
  b.title=person.name+' · '+person.role;b.setAttribute('aria-label',b.title+' 선택');
  const img=document.createElement('img');img.src='./portraits/'+portrait[id]+'.webp';img.alt='';img.draggable=false;
  const label=document.createElement('span');label.textContent=person.role;
  b.append(img,label);b.onclick=()=>selectPerson(id);b.setAttribute('aria-controls','command-card');
  el('roster').append(b);rosterNodes[id]=b;
}
const resources=[
  ['grain','가산','말','grain'],['bark','닥 재료','묶음','bark'],['paper','공방 한지','장','sheet'],
  ['stock','시전 한지','장','stall'],['price','한지 시세','말/장','price']
];
for(const [key,title,unit,image] of resources){
  const block=document.createElement('div');block.className='resource';block.title=title;
  const info=document.createElement('div'), small=document.createElement('small'), big=document.createElement('b'), em=document.createElement('em');
  const value=document.createTextNode('0');small.textContent=title;em.textContent=unit;big.append(value,em);info.append(small,big);
  block.append(icon(image),info);el('inventory').append(block);resourceValues[key]=value;
}
for(const [key,p] of Object.entries(places))el('destination').add(new Option(p.name,key));
el('destination').value='market';

function notify(text,error=false){
  el('toast').textContent=text;el('toast').classList.toggle('error',error);el('toast').hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').hidden=true,3000);
}
function persist(){
  try {localStorage.setItem(saveKey,JSON.stringify(game));el('save-state').textContent='이 기기에 자동 저장';}
  catch {el('save-state').textContent='저장 공간을 사용할 수 없습니다';}
}
function issue(id,target){
  const result=command(game,selected,id,target);
  notify(people[selected].name+' · '+result.message,!result.ok);
  if(result.ok){persist();dismissCard();}
  renderHUD();
}
function dismissCard(){
  card.classList.remove('open');
  for(const button of Object.values(rosterNodes))button.setAttribute('aria-expanded','false');
}
function setCameraMenu(open){
  el('camera-tools').classList.toggle('open',open);
  el('camera-open').setAttribute('aria-expanded',String(open));
}
function dismissBook(){
  if(dialog.open)dialog.close();
  openPocket=null;pocketSignature='';
  for(const button of pocketButtons)button.setAttribute('aria-expanded','false');
}
function selectPerson(id){
  if(!Object.hasOwn(people,id))return;
  selected=id;
  if(following)following=id;
  dismissBook();setCameraMenu(false);
  if(landscape.matches){
    if(visual&&!visual.projectActor(id))following=id;
    card.classList.add('open');
    for(const [key,b] of Object.entries(rosterNodes))b.setAttribute('aria-expanded',String(id===key));
  }
  renderHUD();positionCard();
}
// Put the arrow beside the actor's projected head. The map and floating layers share viewport coordinates.
function positionCard(){
  if(!landscape.matches||!card.classList.contains('open'))return;
  const sceneBox=el('scene').getBoundingClientRect(),head=visual?.projectActor(selected);
  const hud=document.querySelector('.masthead').getBoundingClientRect();
  const party=el('roster').getBoundingClientRect();
  const minX=hud.left,maxX=Math.max(minX,hud.right-card.offsetWidth);
  const minY=hud.bottom+5,maxY=Math.max(minY,party.top-card.offsetHeight-9);
  const headX=sceneBox.left+(head?.x??sceneBox.width/2),headY=sceneBox.top+(head?.y??sceneBox.height/2);
  const toRight=headX+card.offsetWidth+16<=hud.right||headX<sceneBox.width/2;
  const wantedX=toRight?headX+15:headX-card.offsetWidth-15;
  const clampedX=Math.min(maxX,Math.max(minX,wantedX)),clampedY=Math.min(maxY,Math.max(minY,headY-card.offsetHeight*.35));
  card.style.transform='translate('+Math.round(clampedX)+'px,'+Math.round(clampedY)+'px)';
  card.style.setProperty('--arrow-y',Math.min(card.offsetHeight-9,Math.max(9,headY-clampedY))+'px');
  card.dataset.side=toRight?'right':'left';
  card.dataset.detached=String(!head||Math.abs(clampedX-wantedX)>25);
}
el('command-close').onclick=()=>{dismissCard();rosterNodes[selected].focus({preventScroll:true});};
el('camera-open').onclick=()=>{
  const open=el('camera-open').getAttribute('aria-expanded')!=='true';
  dismissCard();dismissBook();setCameraMenu(open);
};
function pick(hit,button){
  if(!hit)return;
  if(landscape.matches&&openPocket){dismissBook();if(hit.type!=='actor')return;}
  setCameraMenu(false);
  if(hit.type==='actor'&&button!==2){selectPerson(hit.id);return;}
  if(hit.type==='place')issue('move',hit.id);
  else if(Number.isFinite(hit.x)&&Number.isFinite(hit.z))issue('move',{x:hit.x,z:hit.z});
}
el('go').onclick=()=>issue('move',el('destination').value);
el('follow').onclick=()=>{
  following=following===selected?null:selected;
  if(landscape.matches){dismissCard();notify(following?people[selected].name+' 따라가기':'인물 따라가기 해제');}
  renderHUD();
};
function setSpeed(n){
  if(n>0)lastSpeed=n;
  game.speed=n;renderHUD();persist();
}
el('pause').onclick=()=>setSpeed(game.speed?0:lastSpeed);
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>setSpeed(Number(b.dataset.speed)));
const cameras={
  reset:()=>{following=null;visual?.reset();renderHUD();},left:()=>visual?.rotate(-Math.PI/8),
  right:()=>visual?.rotate(Math.PI/8),zoomIn:()=>visual?.zoom(1.18),zoomOut:()=>visual?.zoom(1/1.18)
};
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>cameras[b.dataset.camera]());
const actionIcon={produce:'sheet',haul:'haul',sell:'coin',buy:'bark',labor:'hand',contract:'book'};
function updateActions(){
  const choices=options(game,selected);
  const wanted=new Set(choices.map(c=>c.id));
  for(const [id,parts] of actionNodes){
    if(!wanted.has(id)){parts.button.remove();actionNodes.delete(id);}
  }
  let note=el('rival-note');
  if(!choices.length){
    if(!note){note=document.createElement('p');note.id='rival-note';note.className='rival-note';el('actions').append(note);}
    note.textContent='이웃 지물전의 상인입니다. 그가 시전에 종이를 풀면 한지 시세가 달라집니다.';
  } else {note?.remove();}
  let primary=true;
  for(const c of choices){
    let parts=actionNodes.get(c.id);
    if(!parts){
      const button=document.createElement('button');button.type='button';button.className='action';button.dataset.action=c.id;
      const copy=document.createElement('span'),title=document.createElement('strong'),desc=document.createElement('small');
      copy.className='action-copy';copy.append(title,desc);button.append(icon(actionIcon[c.id]||'flag'),copy,icon('arrowRight'));
      button.onclick=()=>issue(c.id);el('actions').append(button);parts={button,title,desc};actionNodes.set(c.id,parts);
    }
    parts.button.disabled=!c.enabled;parts.button.classList.toggle('primary',c.enabled&&primary);
    if(c.enabled)primary=false;
    parts.title.textContent=c.label;parts.desc.textContent=c.detail;
  }
}
let pauseState;
function renderHUD(){
  const t=clock(game),a=actor(selected);
  el('time').textContent=t.text;el('day').textContent=t.day+'일째';
  const paused=game.speed===0;
  if(paused!==pauseState){
    const b=el('pause'),name=paused?'시간 재개':'일시정지';b.replaceChildren(icon(paused?'play':'pause'));
    b.title=name+' (스페이스)';b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',String(paused));pauseState=paused;
  }
  el('pause-badge').hidden=!paused;
  document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(game.speed===Number(b.dataset.speed))));
  const completed=[game.crafted>0,game.delivered>0,game.sold>0].filter(Boolean).length;
  el('goal-count').textContent=completed+' / 3';
  let goal='도제 분이를 선택해 한지 뜨기를 지시하세요.';
  if(completed===0&&['toCraft','craft'].includes(actor('apprentice').task))goal='도제가 일하는 동안 가주를 종로 시전으로 보내세요.';
  if(completed===1)goal=actor('porter').task==='delivery'?'짐꾼이 시전으로 향합니다. 가주를 시전에 보내세요.':'짐꾼 돌석에게 한지 운송을 지시하세요.';
  if(completed===2)goal=actor('master').at==='market'?'시전에 도착한 가주를 선택해 한지를 판매하세요.':'가주 윤서진을 종로 시전으로 보내 한지를 판매하세요.';
  if(completed===3)goal='첫 거래를 성사시켰습니다. 공방을 계속 운영해 보세요.';
  el('goal-text').textContent=goal;
  [...el('goal-track').children].forEach((v,i)=>v.classList.toggle('done',i<completed));
  for(const [key] of resources)resourceValues[key].nodeValue=String(key==='price'?price(game):game[key]);
  for(const [key,b] of Object.entries(rosterNodes)){
    const person=actor(key);
    b.setAttribute('aria-pressed',String(key===selected));
    b.dataset.mode=person.mode;b.title=people[key].name+' · '+people[key].role+' · '+person.action;
  }
  if(portraitId!==selected){el('active-portrait').src='./portraits/'+portrait[selected]+'.webp';portraitId=selected;}
  el('actor-role').textContent=people[selected].role;el('actor-name').textContent=people[selected].name;
  el('actor-status').textContent=(a.at?places[a.at].name+' · ':'')+a.action+(a.cargo?' · 등짐 '+a.cargo+'장':'')+(a.mode==='work'?' · '+Math.ceil(a.remaining)+'초':'');
  el('work-meter').hidden=a.mode!=='work'||!a.duration;
  if(!el('work-meter').hidden)el('work-meter').firstElementChild.style.width=(100*(1-a.remaining/a.duration))+'%';
  el('follow').setAttribute('aria-pressed',String(following===selected));
  el('travel').hidden=selected==='rival';
  const busy=!['idle','waitPaper','move'].includes(a.task);el('go').disabled=busy;el('go').title=busy?'맡은 일을 마치면 이동할 수 있습니다.':'선택한 인물을 보냅니다.';
  updateActions();
  if(game.log.length){
    el('news-time').textContent=clock({time:game.log[0].time}).text;
    el('news-text').textContent=game.log[0].text;
  }
  if(openPocket&&openPocket!=='help')renderPocket();
}
function renderPocket(){
  const which=openPocket,content=el('dialog-content');
  const amounts=resources.map(([key])=>key==='price'?price(game):game[key]);
  const firstLog=game.log[0];
  const signatures={stock:amounts.join(','),goal:el('goal-text').textContent,log:firstLog?.time+'|'+firstLog?.text,help:'help'};
  const signature=which+'|'+signatures[which];
  if(signature===pocketSignature)return;
  pocketSignature=signature;
  content.replaceChildren();
  if(which==='stock'){
    el('dialog-title').textContent='가문 재고';
    resources.forEach(([,name,unit,image],i)=>{
      const row=document.createElement('div'),label=document.createElement('span'),qty=document.createElement('b');
      row.className='stock-line';label.append(icon(image),document.createTextNode(name));qty.textContent=amounts[i]+' '+unit;
      row.append(label,qty);content.append(row);
    });
  }else if(which==='goal'){
    el('dialog-title').textContent='첫 거래';
    const list=document.createElement('ol');list.className='goal-list';
    for(const [name,done] of [['도제와 한지 4장 뜨기',game.crafted>0],['짐꾼으로 시전까지 운송',game.delivered>0],['가주가 시전에서 한지 팔기',game.sold>0]]){
      const li=document.createElement('li');li.classList.toggle('done',done);li.textContent=name+(done?' · 완료':'');list.append(li);
    }
    const next=document.createElement('p');next.className='pocket-note';next.textContent=el('goal-text').textContent;content.append(list,next);
  }else if(which==='help'){
    el('dialog-title').textContent='운종가에서의 하루';
    for(const text of [
      '1600년 한성. 종로 지물전에서 가족과 일꾼을 지휘해 첫 한 짐을 팔아 보세요.',
      '지도 위 사람이나 초상화를 눌러 인물을 선택하세요. 길이나 건물을 클릭·탭하면 그곳으로 걷습니다. 마우스 오른쪽 버튼으로도 이동할 수 있습니다.',
      '분이에게 한지 뜨기, 돌석에게 한지 운송을 지시하세요. 윤서진을 종로 시전으로 보낸 뒤 짐이 도착하면 판매하세요. 다음 물량을 준비할 때는 가주가 공방에서 닥을 매입할 수 있습니다.',
      '지도를 끌어 시점을 옮기고, 휠이나 두 손가락으로 확대하세요. 시점 버튼으로 회전하고, 따라가기로 선택한 인물을 추적합니다.',
      '스페이스는 일시정지, 숫자 1–4는 인물 선택입니다. 정지 중에도 명령을 내릴 수 있고, 다른 탭으로 이동하면 시간이 멈춥니다. 진행 상황은 이 브라우저에 저장됩니다.'
    ]){const p=document.createElement('p');p.textContent=text;content.append(p);}
  }else{
    el('dialog-title').textContent='가문 일지';
    const list=document.createElement('ol');
    for(const entry of game.log){
      const li=document.createElement('li'),stamp=document.createElement('time'),t=clock({time:entry.time});
      stamp.textContent=t.day+'일 '+t.text;li.append(stamp,document.createTextNode(entry.text));list.append(li);
    }content.append(list);
  }
}
function openBook(which){
  if(which===openPocket&&dialog.open){dismissBook();return;}
  dismissCard();setCameraMenu(false);openPocket=which;pocketSignature='';
  renderPocket();
  for(const b of pocketButtons)b.setAttribute('aria-expanded',String(b.dataset.pocket===which));
  if(!dialog.open){if(landscape.matches)dialog.show();else dialog.showModal();}
}
pocketButtons.forEach(b=>b.onclick=()=>openBook(b.dataset.pocket));
el('help').onclick=()=>openBook('help');el('journal-open').onclick=()=>openBook('log');el('close').onclick=dismissBook;
dialog.addEventListener('close',()=>{if(!dialog.open)dismissBook();});
landscape.addEventListener('change',()=>{
  dismissBook();dismissCard();setCameraMenu(false);
  card.style.removeProperty('transform');
});
el('book-dialog').onclick=e=>{if(e.target===el('book-dialog')){
  const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();
}};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&(card.classList.contains('open')||dialog.open||el('camera-tools').classList.contains('open'))){
    e.preventDefault();dismissCard();dismissBook();setCameraMenu(false);return;
  }
  if(e.defaultPrevented||e.altKey||e.metaKey||e.ctrlKey||el('book-dialog').open||e.target.matches('input,select,textarea'))return;
  if(e.code==='Space'&&!e.target.closest('button')){e.preventDefault();if(!e.repeat)setSpeed(game.speed?0:lastSpeed);}
  const key=Number(e.key);if(key>=1&&key<=4)selectPerson(Object.keys(people)[key-1]);
});

renderHUD();persist();
try {
  const {createScene}=await import('./scene.js');
  visual=createScene(el('scene'),{onPick:pick,onPan:()=>{if(following){following=null;renderHUD();}}});
} catch(err) {
  console.warn('3D 장면 초기화 실패',err);
  visual=makeRoadMap(el('scene'),pick);
  el('map-hint').textContent='이 기기에서는 평면 지도로 표시합니다. 인물을 선택하고 목적지를 눌러 주세요.';
  notify('3D 화면을 열 수 없어 평면 지도로 시작합니다.');
}
if(landscape.matches&&game.crafted===0&&game.time<8&&el('toast').hidden){
  notify('도제 분이의 초상화를 눌러 한지 뜨기를 지시하세요.');
}
let previous=0,lastHUD=0,lastSave=0;
function frame(now){
  if(!document.hidden){
    const dt=previous?Math.min((now-previous)/1000,.25):0;
    tick(game,dt*game.speed);
    visual.render({actors:game.agents,selectedId:selected,followId:following,seconds:game.time,paused:!game.speed,hideActorLabel:landscape.matches&&card.classList.contains('open')});
    positionCard();
    if(now-lastHUD>200){renderHUD();lastHUD=now;}
    if(now-lastSave>3500){persist();lastSave=now;}
  }
  previous=now;requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{previous=0;if(document.hidden)persist();});
window.addEventListener('pagehide',persist);
requestAnimationFrame(frame);
