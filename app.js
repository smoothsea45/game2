import {browserSaveLock, familySlot, openFamilyStore} from './persistence.mjs';
import {makeRoadMap} from './road-map.js';
import {places, people, tick, command, options, price, clock, loadGame, districtName, inventoryAt, workshopCommand} from './simulation.mjs';

import {renderWorkshopPanel} from './workshop-panel.js';
import {renderSchedule} from './schedule-panel.js';
import {renderPlacePanel} from './place-panel.js';

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

const familyStore = openFamilyStore(() => globalThis.localStorage, browserSaveLock());
let {game, view:savedView, checkpoint} = familyStore.loaded;
let saveBlocked = familyStore.frozen;
let saveNotice = '', mainSession = null;
let selected=Object.hasOwn(people,savedView?.selected)?savedView.selected:'apprentice';
let following=Object.hasOwn(people,savedView?.following)?savedView.following:null;
let lastSpeed=game.speed||1, visual, toastTimer;
const landscape=matchMedia('(orientation: landscape)');
const card=el('command-card'),dialog=el('book-dialog');
const pocketButtons=[...document.querySelectorAll('[data-pocket]')];
let openPocket=null,pocketSignature='',portraitId=null, inspectedPlace=null;
const actor = id => game.agents.find(a => a.id===id);
const rosterNodes = {}, resourceValues = {}, actionNodes = new Map();
const portrait = {master:'head',apprentice:'apprentice',porter:'porter',rival:'rival'};
for(const [id,person] of Object.entries(people)){
  const b=document.createElement('button');b.type='button';b.className='person';b.dataset.person=id;
  b.title=person.name+' · '+person.role;b.setAttribute('aria-label',b.title+' 선택');
  if(landscape.matches)b.setAttribute('aria-expanded','false');
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
function showSaveNotice(kind, message, reload = false) {
  if (saveNotice === kind) return;
  saveNotice = kind;
  const notice = el('save-notice'), button = el('save-notice-action');
  el('save-notice-text').textContent = message;
  notice.hidden = false;
  button.textContent = reload ? '최신 기록 열기' : '닫기';
  button.onclick = reload ? () => window.location.reload() : () => { notice.hidden = true; };
}
function hasSaveConflict() {
  if (!saveBlocked && familyStore.stale()) stopStaleTab();
  return saveBlocked;
}
function stopStaleTab() {
  if (saveBlocked) return;
  saveBlocked = true;
  if (dialog.open) dismissBook();
  dismissCard();
  el('save-state').textContent = '다른 탭의 저장 기록이 있습니다';
  showSaveNotice('conflict', '다른 탭에 새 기록이 있어 이 탭을 일시정지했습니다.', true);
}
function persist(){
  if(mainSession || hasSaveConflict())return;
  const view = visual ? {selected, following, place:(visual.getFocusX?.()??0)>50?'yangju':'home'} : savedView;
  familyStore.save(game, view, checkpoint).then(result => {
    if (result === 'conflict') { stopStaleTab(); return; }
    if (saveBlocked || result === 'blocked') return;
    if (result === 'invalid') {
      el('save-state').textContent = '이전 기록이 보존되었습니다';
      showSaveNotice('invalid', '현재 상태를 저장하지 못했습니다. 마지막 정상 저장본을 보존했습니다.');
    } else if (result === 'unavailable') {
      el('save-state').textContent = '저장 공간을 사용할 수 없습니다';
      showSaveNotice('unavailable', '진행 상황을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
    } else {
      el('save-state').textContent = '이 기기에 자동 저장';
      if (saveNotice === 'unavailable' || saveNotice === 'invalid') {
        saveNotice = ''; el('save-notice').hidden = true;
      }
    }
  });
}
window.addEventListener('storage', event => {
  if (event.key === familySlot || event.key === null) hasSaveConflict();
});
function issue(id,target,person=selected){
  if (hasSaveConflict()) return;
  const before=id==='startOpportunity'&&!mainSession?JSON.stringify(game):null;
  const result=command(game,person,id,target);
  notify(people[person].name+' · '+result.message,!result.ok);
  if(result.ok){
    if(before)checkpoint=before;
    if(id==='move'&&typeof target==='string'&&Math.abs(actor(person).x-places[target].x)>40) following=person;
    persist();dismissCard();
    if(id==='startOpportunity'&&openPocket!=='goal')openBook('goal');
  }
  renderHUD();
}
function manageWorkshop(action,amount){
  if (hasSaveConflict()) return;
  const r=workshopCommand(game,action,amount);
  if(r.ok)persist();
  notify(r.message,!r.ok);renderHUD();
}
function scheduleAction(action){
  if (hasSaveConflict()) return;
  if(action==='return'&&mainSession){
    ({game,selected,following}=mainSession);
    const place=mainSession.place;mainSession=null;
    visual?.focusPlace?.(place);lastSpeed=game.speed||1;persist();renderHUD();
    notify('원래 가문으로 돌아왔습니다.');return;
  }
  if(action==='replay'&&checkpoint&&!mainSession){
    const branch=loadGame(checkpoint);
    if(!branch||!command(branch,'master','startOpportunity').ok){notify('약속 시작 기록을 불러올 수 없습니다.',true);return;}
    persist();
    mainSession={game,selected,following,place:(visual?.getFocusX?.()??0)>50?'yangju':'home'};
    game=branch;selected='master';following='master';lastSpeed=game.speed||1;
    renderHUD();notify('다른 선택을 체험 중입니다. 일정에서 본편으로 돌아갈 수 있습니다.');return;
  }
  if(action==='plot'||action==='market'){
    const a=actor('master');
    if(a.at===action&&a.task==='idle'){
      issue(action==='plot'?'claimPlot':'meetClient',undefined,'master');
    }else{
      selected='master';following='master';issue('move',action,'master');
    }
    return;
  }
  issue(action,undefined,'master');
}
function dismissCard(){
  card.classList.remove('open');
  for(const button of Object.values(rosterNodes)){
    if(landscape.matches)button.setAttribute('aria-expanded','false');else button.removeAttribute('aria-expanded');
  }
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
    if(visual?.projectActor&&!visual.projectActor(id))following=id;
    card.classList.add('open');
    for(const [key,b] of Object.entries(rosterNodes))b.setAttribute('aria-expanded',String(id===key));
  }
  renderHUD();positionCard();
}
// Put the arrow beside the actor's projected head. The map and floating layers share viewport coordinates.
function positionCard(){
  if(!landscape.matches||!card.classList.contains('open'))return;
  const sceneBox=el('scene').getBoundingClientRect(),head=visual?.projectActor?.(selected);
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
  setCameraMenu(false);
  if(hit.type==='place'&&button!==2){
    const same=openPocket==='place'&&inspectedPlace===hit.id;
    inspectedPlace=hit.id;
    if(same||openPocket!=='place')openBook('place');
    else renderPocket();
    return;
  }
  if(landscape.matches&&openPocket){
    dismissBook();
    if(hit.type==='ground'&&button!==2)return;
  }
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
  if (hasSaveConflict()) return;
  if(n>0)lastSpeed=n;
  game.speed=n;renderHUD();persist();
}
el('pause').onclick=()=>setSpeed(game.speed?0:lastSpeed);
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>setSpeed(Number(b.dataset.speed)));
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{
  following=null;dismissCard();setCameraMenu(false);
  visual?.focusPlace?.(button.dataset.view);renderHUD();persist();
});
const cameras={
  reset:()=>{following=null;visual?.reset();renderHUD();},left:()=>visual?.rotate(-Math.PI/8),
  right:()=>visual?.rotate(Math.PI/8),zoomIn:()=>visual?.zoom(1.18),zoomOut:()=>visual?.zoom(1/1.18)
};
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>cameras[b.dataset.camera]());
const actionIcon={produce:'sheet',haul:'haul',sell:'coin',buy:'bark',labor:'hand',contract:'book',cancel:'close',produceMax:'sheet',haulBark:'bark',startOpportunity:'book',claimPlot:'flag',meetClient:'hand'};
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
  const region=districtName(visual?.getFocusX?.()??0);
  const regionLabel=region==='한성'?['漢城府','운종가','한성부 · 운종가']:region==='양주'?['楊州','양주 장터','양주 · 장터']:['街路','고을길','한성 · 양주 사이'];
  el('district-brand').textContent=regionLabel[2]+(mainSession?' · 체험':'');el('district-seal').textContent=regionLabel[0];el('district-name').textContent=regionLabel[1];
  document.querySelector('[data-view="home"]').setAttribute('aria-pressed',String(region==='한성'));
  document.querySelector('[data-view="yangju"]').setAttribute('aria-pressed',String(region==='양주'));
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
  let goal='도제 분이를 선택해 한 번 뜨기 또는 최대 생산을 지시하세요.';
  if(completed===0&&['toCraft','craft'].includes(actor('apprentice').task))goal='도제가 일하는 동안 가주를 종로 시전으로 보내세요.';
  if(completed===1)goal=actor('porter').task==='delivery'?'짐꾼이 시전으로 향합니다. 가주를 시전에 보내세요.':'짐꾼 돌석에게 한지 운송을 지시하세요.';
  if(completed===2)goal=actor('master').at==='market'?'시전에 도착한 가주를 선택해 한지를 판매하세요.':'가주 윤서진을 종로 시전으로 보내 한지를 판매하세요.';
  if(completed===3)goal='첫 거래를 성사시켰습니다. 공방을 계속 운영해 보세요.';
  if(game.workshop.enabled&&completed<3)goal='공방을 위임했습니다. 운영 장부에서 다음 운송과 판매를 확인하세요.';
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
  el('actor-status').textContent=(a.at?places[a.at].name:districtName(a.x))+' · '+a.action+(a.cargo?' · '+(a.cargoItem==='bark'?'닥 '+a.cargo+'묶음':'한지 '+a.cargo+'장'):'')+(a.id==='apprentice'&&a.batchesLeft>1?' · 남은 작업 '+a.batchesLeft+'회':'')+(a.mode==='work'?' · '+Math.ceil(a.remaining)+'초':'');
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
  if(which==='place'){
    el('dialog-title').textContent=places[inspectedPlace].name;
    renderPlacePanel(content,game,inspectedPlace,selected,order=>{
      if(order==='workshop'||order==='goal'){openBook(order);return;}
      if(order==='move'){dismissBook();issue('move',inspectedPlace);return;}
      issue(order);
    });return;
  }
  if(which==='workshop'){
    el('dialog-title').textContent='공방 운영';
    renderWorkshopPanel(content,game,manageWorkshop);return;
  }
  if(which==='goal'){
    el('dialog-title').textContent=mainSession?'가주 일정 · 다른 선택 체험':'가주 일정';
    renderSchedule(content,game,scheduleAction,{rehearsal:!!mainSession,canReplay:!!checkpoint});return;
  }
  const amounts=resources.map(([key])=>key==='price'?price(game):game[key]);
  const carried=inventoryAt(game,'player','porter','paper');
  const marketBark=inventoryAt(game,'market','market','bark'), pickupBark=inventoryAt(game,'player','marketPickup','bark');
  const packedBark=inventoryAt(game,'player','porter','bark');
  const reserved=inventoryAt(game,'player','workshop:reserved','bark');
  const firstLog=game.log[0];
  const signatures={stock:[...amounts,carried,reserved,marketBark,pickupBark,packedBark].join(','),log:firstLog?.time+'|'+firstLog?.text,help:'help'};
  const signature=which+'|'+signatures[which];
  if(signature===pocketSignature)return;
  pocketSignature=signature;
  content.replaceChildren();
  if(which==='stock'){
    el('dialog-title').textContent='가문 재고';
    const stockRows=[
      ['가산',game.grain,'말','grain'],['시전 상인의 닥 · 매입 가능',marketBark,'묶음','bark'],
      ['시전에서 사 둔 닥',pickupBark,'묶음','bark'],['돌석의 등짐 · 닥',packedBark,'묶음','haul'],
      ['공방 · 닥 재료',game.bark,'묶음','bark'],
      ['작업에 배정한 닥',reserved,'묶음','bark'],['공방 선반 · 한지',game.paper,'장','sheet'],
      ['돌석의 등짐 · 한지',carried,'장','haul'],['시전 판매대 · 한지',game.stock,'장','stall'],
      ['한지 시세',price(game),'말/장','price']
    ];
    for(const [name,value,unit,image] of stockRows){
      const row=document.createElement('div'),label=document.createElement('span'),qty=document.createElement('b');
      row.className='stock-line';label.append(icon(image),document.createTextNode(name));qty.textContent=value+' '+unit;
      row.append(label,qty);content.append(row);
    }
  }else if(which==='help'){
    el('dialog-title').textContent='한성과 양주 오가기';
    for(const text of [
      '1600년 한성. 종로 지물전에서 가족과 일꾼을 지휘해 첫 한 짐을 팔아 보세요.',
      '지도 위 사람이나 초상화를 눌러 인물을 선택하세요. 건물을 누르면 소유 가문과 재고, 오고 있는 짐을 볼 수 있습니다. 보내기를 누르거나 길을 눌러 이동하세요. 마우스 오른쪽 버튼은 바로 이동입니다.',
      '분이의 한지 작업은 한 번 또는 현재 닥으로 가능한 최대 수량을 고를 수 있습니다. 한 번에 닥 1묶음을 써서 한지 4장을 뜹니다.',
      '윤서진을 종로 시전에 보내 닥을 매입하세요. 돌석에게 닥 인수·운송을 맡겨 공방에 내려놓으면 다음 생산에 쓸 수 있습니다.',
      '공방 운영에서 위임을 켜면 분이가 생산하고 돌석이 운송·대리 판매합니다. 운영 예산을 맡겨 두면 돌석이 장터에서 닥도 사 옵니다.',
      '가주 일정의 두 약속을 열면 양주 빈터와 종로 거래처가 같은 시각에 접수합니다. 가주가 도착하면 일정에서 매입 또는 면담을 신청하세요.',
      '인물의 이동 지시에서 양주 장터를 선택해 보내세요. 한성을 비운 동안에도 공방과 운송은 이어집니다. 시점의 한성·양주 버튼은 지도만 옮깁니다.',
      '가문 재고에서 공방과 시전, 돌석의 등짐을 따로 확인할 수 있습니다. 운송을 멈추면 짐은 돌석에게 남습니다. 한지 운송 재개를 누르면 남은 한지를 시전으로 가져갑니다.',
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
el('ledger-open').onclick=()=>openBook('stock');
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

renderHUD();
if (familyStore.recovery) showSaveNotice('recovery', familyStore.recovery, saveBlocked);
persist();
try {
  const {createScene}=await import('./scene.js');
  visual=createScene(el('scene'),{onPick:pick,onPan:()=>{if(following){following=null;renderHUD();}}});
} catch(err) {
  console.warn('3D 장면 초기화 실패',err);
  visual=makeRoadMap(el('scene'),pick,()=>{following=null;});
  el('map-hint').textContent='이 기기에서는 평면 지도로 표시합니다. 건물을 눌러 살피거나 길을 눌러 이동하세요.';
  notify('3D 화면을 열 수 없어 평면 지도로 시작합니다.');
}
if(savedView?.place==='yangju'&&!following)visual.focusPlace?.('yangju');
if(landscape.matches&&game.crafted===0&&game.time<8&&el('toast').hidden){
  notify('도제 분이의 초상화에서 한 번 뜨기 또는 최대 생산을 선택하세요.');
}
let previous=0,lastHUD=0,lastSave=0;
function frame(now){
  if(!document.hidden){
    const dt=previous?Math.min((now-previous)/1000,.25):0;
    if (!saveBlocked) tick(game,dt*game.speed);
    visual.render({actors:game.agents,selectedId:selected,followId:following,seconds:game.time,paused:!game.speed,meetingAvailable:game.opportunity.startedAt!==null&&!game.opportunity.closed&&!game.opportunity.met,plotOwner:game.properties.plot.owner,hideActorLabel:landscape.matches&&card.classList.contains('open')});
    positionCard();
    if(now-lastHUD>200){renderHUD();lastHUD=now;}
    if(now-lastSave>3500){persist();lastSave=now;}
  }
  previous=now;requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{previous=0;if(document.hidden)persist();});
window.addEventListener('pagehide',persist);
requestAnimationFrame(frame);
