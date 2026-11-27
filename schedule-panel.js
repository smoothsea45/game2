import {clock, options} from './simulation.mjs';
import {opportunityView} from './opportunity.mjs';

function dateAt(time) {
  const moment=clock({time});
  return moment.day+'일 '+moment.text;
}

export function renderSchedule(panel,game,act,{rehearsal,canReplay}) {
  if(!panel.querySelector('.schedule-window')){
    // Keep controls in place while the clock advances under a player's finger.
    panel.innerHTML=`
      <section class="schedule-window">
        <p class="schedule-time"></p>
        <p class="schedule-intro"></p>
        <button type="button" data-schedule="startOpportunity">두 약속 열기</button>
        <div class="schedule-choice"><h3>양주 빈터</h3><p class="plot-terms"></p><button type="button" data-schedule="plot"></button></div>
        <div class="schedule-choice"><h3>종로 거래처 면담</h3><p class="meeting-terms"></p><button type="button" data-schedule="market"></button></div>
        <p class="schedule-outcome"></p>
        <button class="schedule-replay" type="button"></button>
        <details><summary>첫 한지 거래</summary><p class="schedule-trade"></p></details>
      </section>`;
    panel.querySelectorAll('[data-schedule]').forEach(button=>{
      button.onclick=()=>act(button.dataset.schedule);
    });
  }
  const view=opportunityView(game), master=game.agents.find(a=>a.id==='master');
  const ready=view.phase==='ready', closed=view.phase==='closed', active=!ready&&!closed;
  const text=(selector,value)=>{const node=panel.querySelector(selector);if(node.textContent!==value)node.textContent=value;};
  const progress=ready?'두 곳의 약속이 같은 시각에 열립니다.':
    closed?'접수가 끝났습니다.':dateAt(view.opensAt)+' – '+dateAt(view.closesAt)+
    (view.phase==='waiting'?'  ·  접수 전':'  ·  접수 중');
  text('.schedule-time',progress);
  text('.schedule-intro',ready?'준비가 되면 두 약속을 여세요. 양주로 떠나는 박만길도 같은 값에 빈터를 살 수 있습니다.':
    active?'가주를 보낸 뒤 현장에서 매입 또는 면담을 신청하세요. 먼저 도착하면 접수 시각까지 기다릴 수 있습니다.':'두 약속의 결과는 가문에 기록됩니다.');
  panel.querySelector('[data-schedule="startOpportunity"]').hidden=!ready;
  const price=view.landPrice;
  const lotOwned=view.landOwner==='master';
  text('.plot-terms',view.landOwner?
    (lotOwned?'윤 가문 소유':'박만길 가문 소유')+' · 하루 사용료 '+view.rentPerDay+'말':
    '매입가 '+price+'말 · 보유 하루마다 '+view.rentPerDay+'말'+(game.grain<price?' · 가산 '+game.grain+'말':''));
  text('.meeting-terms',view.met?
    '단골 거래처 확보 · 한지 한 장에 '+view.relationshipBonus+'말 추가':
    '면담에 참석하면 시전에서 한지 한 장에 '+view.relationshipBonus+'말을 더 받습니다.');
  const choices=options(game,'master');
  for(const [place,task,queued,name] of [['plot','claimPlot','plot','빈터로 이동'],['market','meetClient','meeting','시전으로 이동']]){
    const button=panel.querySelector('[data-schedule="'+place+'"]');
    button.hidden=!active||(place==='plot'?!!view.landOwner:view.met);
    const at=master.at===place&&master.task==='idle';
    const enRoute=master.mode==='walk'&&master.target===place;
    const choice=choices.find(c=>c.id===task);
    button.disabled=at?!choice?.enabled||view.queued===queued:enRoute||!['move','idle'].includes(master.task);
    button.textContent=at?(view.queued===queued?'현장에서 접수 대기':choice?.label||(place==='plot'?'빈터 매입':'면담 참석')):enRoute?'이동 중':name;
  }
  const outcome=closed?[lotOwned?'양주 빈터 매입':view.landOwner==='rival'?'박만길이 빈터를 매입함':'빈터 미매각',view.met?'거래처 면담 성사':'면담 종료'].join(' · '):'';
  text('.schedule-outcome',outcome);
  const replay=panel.querySelector('.schedule-replay');
  replay.hidden=!rehearsal&&!(closed&&canReplay);
  replay.textContent=rehearsal?'본편으로 돌아가기':'같은 시각에서 다른 선택 체험';
  replay.onclick=()=>act(rehearsal?'return':'replay');
  text('.schedule-trade',[
    (game.crafted?'✓':'○')+' 분이가 한지 뜨기',
    (game.delivered?'✓':'○')+' 돌석이 시전에 운송',
    (game.sold?'✓':'○')+' 시전에서 판매'
  ].join('  /  '));
}
