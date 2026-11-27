import {holdingsAtPlace} from './inventory.mjs';
import {propertyView} from './estate.mjs';
import {clock, districtName, options, people, places} from './simulation.mjs';

const itemNames = {paper:'한지', bark:'닥'};
const units = {paper:'장', bark:'묶음'};
const keeperNames = {shelf:'선반', reserved:'작업용', seller:'시장 물량', pickup:'인수대', stall:'판매대', office:'납품분'};
const owners = {player:'윤 가문', rival:'박 가문', office:'관아', market:'시장'};
const panels = new WeakMap();

function newPanel(container) {
  const root = document.createElement('section');
  root.className = 'place-panel';
  root.innerHTML = `
    <p class="place-owner"></p>
    <p class="place-revenue" hidden></p>
    <section class="place-section"><h3>이곳의 물품</h3><dl class="place-bins"></dl><p class="place-empty">보관 중인 물품이 없습니다.</p></section>
    <section class="place-section"><h3>현장과 이동</h3><ul class="place-people"></ul><p class="place-quiet">이곳에 있거나 오는 인물이 없습니다.</p></section>
    <div class="place-actions">
      <button type="button" data-place-order="move"></button>
      <button type="button" data-place-order="workshop">공방 운영</button>
      <button type="button" data-place-order="goal">가주 일정</button>
      <button type="button" data-place-order="buy">닥 매입</button>
      <button type="button" data-place-order="sell">한지 판매</button>
    </div>`;
  const nodes=Object.fromEntries(['owner','revenue','bins','empty','people','quiet'].map(key=>[key,root.querySelector('.place-'+key)]));
  const controls = [...root.querySelectorAll('[data-place-order]')];
  const panel = {root,nodes,controls,binsKey:null,peopleKey:null,act:null};
  for (const button of controls) button.onclick=()=>panel.act(button.dataset.placeOrder);
  panels.set(container,panel);
  return panel;
}
function writeText(node, value) {
  if (node.textContent!==value) node.textContent=value;
}
function rowsAtPlace(game,id) {
  return holdingsAtPlace(game,id).map(row=>({
    label:(owners[row.owner]||row.owner)+' · '+(keeperNames[row.holder]||row.holder)+' · '+(itemNames[row.item]||row.item),
    amount:row.quantity+(units[row.item]||'개')
  })).sort((a,b)=>a.label.localeCompare(b.label,'ko'));
}

export function renderPlacePanel(container,game,id,selected,act) {
  const panel=panels.get(container)||newPanel(container);
  const {root,nodes,controls}=panel;
  panel.act=act;
  if(root.parentElement!==container)container.replaceChildren(root);
  const title=propertyView(game,id);
  writeText(nodes.owner,districtName(places[id].x)+' · '+title.ownerLabel+(title.kind==='family'?' 소유':''));
  nodes.revenue.hidden=title.nextRentAt==null;
  if(!nodes.revenue.hidden){
    const next=clock({time:title.nextRentAt});
    writeText(nodes.revenue,'다음 사용료 '+title.rentPerDay+'말 · '+next.day+'일 '+next.text);
  }
  const rows=rowsAtPlace(game,id),binsKey=JSON.stringify(rows);
  if(panel.binsKey!==binsKey){
    panel.binsKey=binsKey;nodes.bins.replaceChildren();
    for(const row of rows){
      const group=document.createElement('div'),label=document.createElement('dt'),qty=document.createElement('dd');
      label.textContent=row.label;qty.textContent=row.amount;group.append(label,qty);nodes.bins.append(group);
    }
    nodes.empty.hidden=rows.length>0;
  }
  const visible=game.agents.filter(a=>a.at===id||a.target===id).map(a=>{
    const cargo=a.cargo?' · '+itemNames[a.cargoItem]+' '+a.cargo+units[a.cargoItem]:'';
    return people[a.id].name+' · '+(a.at===id?a.action:'오는 중')+cargo;
  });
  const peopleKey=JSON.stringify(visible);
  if(panel.peopleKey!==peopleKey){
    panel.peopleKey=peopleKey;nodes.people.replaceChildren();
    for(const text of visible){const li=document.createElement('li');li.textContent=text;nodes.people.append(li);}
    nodes.quiet.hidden=visible.length>0;
  }
  const actor=game.agents.find(a=>a.id===selected);
  const canMove=selected!=='rival'&&['idle','waitPaper','move'].includes(actor.task);
  const saleOptions=selected==='master'&&id==='market'&&actor.at===id?options(game,selected):[];
  for(const b of controls){
    const order=b.dataset.placeOrder;
    if(order==='move'){
      b.hidden=selected==='rival';
      b.disabled=!canMove||actor.at===id||actor.target===id;
      const detail=actor.at===id?' · 현장에 있음':actor.target===id?' · 오는 중':!canMove?' · 작업 중':' 보내기';
      writeText(b,people[selected].name+detail);
    }else if(order==='workshop')b.hidden=id!=='workshop';
    else if(order==='goal')b.hidden=id!=='plot'&&(id!=='market'||game.opportunity.startedAt===null||game.opportunity.closed);
    else {
      const choice=saleOptions.find(c=>c.id===order);
      b.hidden=!choice;b.disabled=!choice?.enabled;
      if(choice){writeText(b,choice.label);b.title=choice.detail;}
    }
  }
}
