import {bins, quantity} from './inventory.mjs';

export const barkLot = 3;
export const barkCost = 5;
const lowStock = 1;

export function freshWorkshop() {
  return {enabled:false, manualPause:false, budget:0, sales:0, spent:0, lastSale:null};
}

const isCount = n => Number.isSafeInteger(n) && n >= 0;
export function validWorkshop(shop) {
  if (!shop || typeof shop.enabled !== 'boolean' || typeof shop.manualPause !== 'boolean') return false;
  if (![shop.budget, shop.sales, shop.spent].every(isCount)) return false;
  const sale = shop.lastSale;
  if (sale === null) return shop.sales === 0;
  return shop.sales > 0 && Number.isFinite(sale.time) && sale.time >= 0
    && Number.isSafeInteger(sale.quantity) && sale.quantity > 0 && sale.quantity <= 4
    && Number.isSafeInteger(sale.unitPrice) && sale.unitPrice > 0
    && sale.total === sale.unitPrice * sale.quantity;
}

export function changeMandate(s, cmd, amount) {
  const shop = s.workshop;
  if (cmd === 'start' || cmd === 'stop') {
    const enable = cmd === 'start';
    if (shop.enabled === enable) return {ok:false, message:enable?'이미 위임 중입니다.':'이미 수동 운영 중입니다.'};
    shop.enabled = enable;
    shop.manualPause = false;
    return {ok:true, message:enable?'공방 운영을 분이와 돌석에게 맡겼습니다.':'위임을 멈췄습니다. 진행 중인 일은 마무리합니다.'};
  }
  if (!['fund','withdraw'].includes(cmd) || !isCount(amount) || amount === 0) {
    return {ok:false, message:'옮길 운영비를 확인하세요.'};
  }
  const deposit = cmd === 'fund';
  if ((deposit ? s.grain : shop.budget) < amount) return {ok:false, message:deposit?'가산이 부족합니다.':'공방 운영비가 부족합니다.'};
  shop.budget += deposit ? amount : -amount;
  s.grain += deposit ? -amount : amount;
  return {ok:true, message:deposit?'공방 운영비에 '+amount+'말을 맡겼습니다.':'공방 운영비 '+amount+'말을 가산에 돌렸습니다.'};
}

export function workshopStatus(s) {
  const w = s.workshop;
  if (!w.enabled) return w.manualPause ? '직원에게 직접 지시해 위임을 멈췄습니다.' : '수동 운영 중입니다.';
  const porter = s.agents.find(a=>a.id==='porter');
  if (quantity(s,bins.porterBark)) return '돌석이 닥을 공방으로 운송 중입니다.';
  if (quantity(s,bins.pickupBark)) return '종로 시전에서 사 둔 닥을 받을 차례입니다.';
  if (s.bark <= lowStock && w.budget < barkCost) return '닥 매입 대기 · 운영비 '+barkCost+'말이 필요합니다. 남은 한지는 판매합니다.';
  if (s.bark <= lowStock && quantity(s,bins.marketBark) < barkLot) return '종로 닥이 부족합니다. 다음 날 시장 입고를 기다립니다.';
  if (porter.task === 'toBarkShop') return '돌석이 닥을 사러 종로 시전으로 가고 있습니다.';
  if (porter.task === 'delivery' || porter.task === 'toPickup') return '돌석이 판매할 한지를 시전으로 운송 중입니다.';
  if (s.stock) return '종로 판매대에 한지가 있습니다. 돌석이 도착하면 판매합니다.';
  return '분이가 닥 한 묶음씩 한지를 뜨고, 돌석이 운송과 판매를 맡습니다.';
}

// Only assign free workers. Finished goods already sitting on the stall can
// be sold only while the porter is physically there.
export function runMandate(s, actions) {
  const w = s.workshop;
  if (!w.enabled) return;
  const apprentice = s.agents.find(a=>a.id==='apprentice');
  if (apprentice.task === 'idle' && s.bark > 0) actions.startCraft(s,apprentice,1);
  const porter = s.agents.find(a=>a.id==='porter');
  const pickup = quantity(s,bins.pickupBark);
  const canBuy = s.bark <= lowStock && w.budget >= barkCost && quantity(s,bins.marketBark) >= barkLot;
  // Waiting for nonexistent sheets is interruptible. In particular the stall
  // can already hold a previous delivery that needs a seller, even with no cash.
  const waitingForPaper = porter.task === 'waitPaper' && !s.paper;
  if (porter.task !== 'idle' && !waitingForPaper) return;
  if (porter.cargoItem === 'paper') { actions.startPaperTrip(s,porter); return; }
  if (porter.cargoItem === 'bark') { actions.startBarkTrip(s,porter); return; }
  if (porter.at === 'market') {
    if (s.stock) {
      const sale = actions.sellPaper(s);
      w.sales++;
      w.lastSale = sale;
      if (s.stock) return;
    }
    if (!pickup && canBuy) actions.buyBark(s,true);
    if (quantity(s,bins.pickupBark)) { actions.startBarkTrip(s,porter); return; }
  }
  if (s.paper) actions.startPaperTrip(s,porter);
  else if (s.stock || pickup || canBuy) actions.go(porter,'market','toBarkShop','공방 일로 종로 시전으로');
}
