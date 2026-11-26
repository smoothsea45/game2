export const seasons = ['봄','여름','가을','겨울'];
const reports = [
  ['서당에서 새 책을 엮는다. 종이를 찾는 이가 늘었다.', 5, 3],
  ['장마로 닥을 실은 배가 늦었다. 닥값이 올랐다.', 4, 5],
  ['햇닥이 장에 들어왔다. 닥을 싸게 마련할 수 있다.', 3, 2],
  ['창호를 바르는 철이다. 두꺼운 종이가 잘 팔린다.', 6, 4],
  ['다른 지물전도 문을 열었다. 시전의 종잇값이 내렸다.', 3, 3],
  ['한강 나루에 배가 들었다. 장시의 거래가 활발하다.', 5, 3]
];
export function fresh() {
  return {turn:0, ap:2, grain:18, bark:2, paper:2, fame:0, spouse:false, training:0, level:1, office:false, generation:1, since:0, log:['1600년 봄 · 종로에 지물전의 문을 다시 열었다.']};
}
export function date(s) {return (1600+Math.floor(s.turn/4))+'년 '+seasons[s.turn%4];}
export function report(s) {return reports[(s.turn + Math.floor(s.turn/4)*3)%reports.length];}
export function actions(s) {
  const [,price,cost] = report(s);
  const sheets = 3+s.level+Number(s.spouse);
  return [
    {id:'buy',tab:'shop',name:'닥 들이기',desc:'닥 2묶음 매입',tag:'곡식 −'+cost,ok:s.grain>=cost,apply(){s.grain-=cost;s.bark+=2;}},
    {id:'make',tab:'shop',name:'한지 뜨기',desc:'닥 1묶음으로 한지 '+sheets+'장 생산',tag:'닥 −1',ok:s.bark>=1,apply(){s.bark--;s.paper+=sheets;}},
    {id:'expand',tab:'shop',name:'지통 늘리기',desc:s.level>=3?'공방 확장 완료':'생산할 때마다 한지 1장 추가',tag:'곡식 −18',ok:s.grain>=18&&s.level<3,apply(){s.grain-=18;s.level++;}},
    {id:'sell',tab:'market',name:'한지 내다 팔기',desc:'한지 2장 판매',tag:'곡식 +'+price*2,ok:s.paper>=2,apply(){s.paper-=2;s.grain+=price*2;}},
    {id:'order',tab:'market',name:'관아 주문 납품',desc:'한지 4장 납품 · 신망 +2',tag:'곡식 +12',ok:s.paper>=4,apply(){s.paper-=4;s.grain+=12;s.fame+=2;}},
    {id:'work',tab:'market',name:'장터 일손 돕기',desc:'짐을 나르고 품삯을 받습니다',tag:'곡식 +4',ok:true,apply(){s.grain+=4;}},
    {id:'marry',tab:'house',name:s.spouse?'혼인 성사':'혼인 맺기',desc:'신망 2 필요 · 혼인 후 생산량 +1',tag:'곡식 −12',ok:!s.spouse&&s.fame>=2&&s.grain>=12,apply(){s.spouse=true;s.grain-=12;}},
    {id:'office',tab:'house',name:s.office?'관아 서리 재직':'서리로 천거받기',desc:'신망 6 필요 · 계절마다 녹봉 3',tag:'곡식 −8',ok:!s.office&&s.fame>=6&&s.grain>=8,apply(){s.office=true;s.grain-=8;}},
    {id:'teach',tab:'house',name:'후계자 가르치기',desc:'친족에게 장부와 종이 뜨기를 전수',tag:s.training+' / 3회',ok:s.training<3&&s.paper>=1,apply(){s.paper--;s.training++;}},
    {id:'inherit',tab:'house',name:'가업 물려주기',desc:'배움 3회 · 신망 6 · 가산 30 필요',tag:'세대 계승',ok:s.training===3&&s.fame>=6&&s.grain>=30,apply(){s.generation++;s.training=0;s.since=s.turn;s.office=false;s.spouse=false;}}
  ];
}
export function act(s,id){
  const a=actions(s).find(v=>v.id===id);
  if(!a||!a.ok||s.ap<1)return false;
  s.ap--;a.apply();
  const messages={buy:'공방에 닥 두 묶음을 들였다.',make:'물질을 마치고 새 한지를 말렸다.',expand:'지통을 더 놓아 공방을 넓혔다.',sell:'시전에서 한지 두 장을 팔았다.',order:'관아에 종이를 대고 신망을 얻었다.',work:'장터의 짐을 나르고 품삯을 받았다.',marry:'혼례를 치렀다. 두 사람이 함께 공방을 꾸린다.',office:'관아의 서리가 되어 장부 일을 맡았다.',teach:'후계자가 가업을 한 수 배웠다.',inherit:s.generation+'대 가장이 지물전의 열쇠를 물려받았다.'};
  record(s,messages[id]);return true;
}
function record(s,msg){s.log.unshift(date(s)+' · '+msg);s.log=s.log.slice(0,30);}
export function advance(s){
  const income=s.office?3:0;
  const due=s.spouse?3:2;
  const paid=Math.min(s.grain+income,due);
  s.grain+=income-paid;
  if(paid<due)s.fame=Math.max(0,s.fame-1);
  s.turn++;s.ap=2;
  record(s,'살림값 '+paid+'말을 치렀다.'+(income?' 녹봉 3말을 받았다.':'')+(paid<due?' 살림값이 모자라 신망이 떨어졌다.':''));
}
