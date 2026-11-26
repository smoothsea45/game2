import {fresh, date, actions, act, advance, report} from './engine.mjs';
const key='hanseong-family-v1';
const el=id=>document.getElementById(id);
let game=fresh();
try{
  const raw=JSON.parse(localStorage.getItem(key));
  if(raw&&Object.keys(game).every(k=>typeof raw[k]===typeof game[k])&&Array.isArray(raw.log))game=raw;
}catch{}
let tab='shop';
const places={
  shop:['紙','종로 지물전','닥을 들여 종이를 뜨는 우리 가문의 일터.'],
  market:['市','종로 시전','장을 살펴 물건을 팔고 관아의 주문을 받습니다.'],
  house:['家','가문의 안채','인연을 맺고 훗날 가업을 이을 사람을 기릅니다.']
};
const icons={
  grain:'<path d="M12 21V5m0 11Q4 16 5 10q6 0 7 6Zm0-5q7 0 7-6-6 0-7 6ZM12 7Q8 4 12 1q4 3 0 6Z"/>',
  bark:'<path d="m4 18 13-13 3 3L7 21zm3-6L4 9m10 0 1-6m0 11 6-1"/>',
  paper:'<path d="m3 9 9-5 9 5-9 5zm0 4 9 5 9-5M3 17l9 5 9-5"/>',
  fame:'<path d="m3 11 9-7 9 7M5 11h14M7 13v5m5-5v5m5-5v5M4 20h16"/>'
};
function render(){
  el('date').textContent=date(game);
  el('turn').textContent=game.generation+'대 가주 · 행동 '+game.ap+'/2';
  el('stats').innerHTML=[['grain','가산','말'],['bark','닥','묶음'],['paper','한지','장'],['fame','신망','점']].map(([k,label,unit])=>'<div class="stat"><svg aria-hidden="true" viewBox="0 0 24 24">'+icons[k]+'</svg><div><small>'+label+'</small><b>'+game[k]+'<em>'+unit+'</em></b></div></div>').join('');
  const [,price,cost]=report(game);
  el('news').textContent=report(game)[0];
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
  const [symbol,name,note]=places[tab];
  const list=actions(game).filter(a=>a.tab===tab);
  el('panel').innerHTML='<div class="location"><div class="stamp">'+symbol+'</div><div><h2>'+name+'</h2><p>'+note+'</p></div></div><div class="rule"><span>이번 계절의 행동</span><span>'+('●'.repeat(game.ap)+'○'.repeat(2-game.ap))+'</span></div>'+list.map(a=>'<button class="action" data-action="'+a.id+'" '+(!game.ap||!a.ok?'disabled':'')+'><div><b>'+a.name+'</b><small>'+a.desc+(a.id==='teach'?' · 한지 −1':'')+'</small></div><em>'+a.tag+'</em></button>').join('')+'<p class="marketline">'+(tab==='shop'?'닥 2묶음 시세 · 곡식 '+cost+'말':tab==='market'?'한지 1장 시세 · 곡식 '+price+'말':'현 가주 · '+(game.office?'관아 서리':'지물전 주인')+' · '+(game.spouse?'기혼':'미혼'))+'</p>';
  el('advance').innerHTML='다음 계절로 <span>→</span>';
  el('advance').title='이번 계절을 마치고 살림값 '+(game.spouse?3:2)+'말을 지불합니다.';
  el('log').replaceChildren(...game.log.slice(0,4).map(line=>{const li=document.createElement('li');const [d,...rest]=line.split(' · ');const time=document.createElement('time');time.textContent=d;li.append(time,rest.join(' · '));return li;}));
  el('legacy').innerHTML='<b>'+game.generation+'대 지물전</b><p>'+(game.generation>1?'계승을 이루었습니다. 다음 세대의 이야기를 이어가세요.':'후계자를 길러 다음 세대에 지물전을 물려주세요.')+'</p>'+[['후계자 수업',game.training,3],['가문 신망',game.fame,6],['가산',game.grain,30]].map(([n,v,max])=>'<div class="progress"><span>'+n+'</span><progress max="'+max+'" value="'+Math.min(max,v)+'"></progress><small>'+v+' / '+max+'</small></div>').join('');
}
function save(){
  try{localStorage.setItem(key,JSON.stringify(game));el('save').textContent='이 기기에 자동 저장됨';}catch{el('save').textContent='이 브라우저에서는 저장할 수 없습니다';}
}
function showResult(){
  render();save();el('notice').textContent=game.log[0];
  const toast=el('toast');toast.textContent=game.log[0].split(' · ').slice(1).join(' · ');toast.hidden=false;clearTimeout(showResult.timer);showResult.timer=setTimeout(()=>toast.hidden=true,3000);
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tab){tab=b.dataset.tab;render();if(b.classList.contains('pin')&&matchMedia('(max-width:800px)').matches)el('tabs').scrollIntoView({block:'nearest'});}
  else if(b.dataset.action&&act(game,b.dataset.action))showResult();
});
el('advance').onclick=()=>{advance(game);showResult();};
el('help').onclick=()=>el('guide').showModal();
el('close').onclick=()=>el('guide').close();
render();save();
