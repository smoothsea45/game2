import {clientBonus} from './opportunity.mjs';
import {clock, price, workshopStatus} from './simulation.mjs';

const panels = new WeakMap();

function buildPanel(container) {
  const root = document.createElement('section');
  root.className = 'workshop-panel';
  root.setAttribute('aria-label', '공방 위임 장부');
  root.innerHTML = `
    <div class="workshop-control">
      <strong class="workshop-state" data-readout="mode"></strong>
      <button type="button" class="workshop-toggle" data-order="start"></button>
    </div>
    <p class="workshop-status" data-readout="reason" role="status"></p>
    <dl class="workshop-balances">
      <div><dt>가문 곡식</dt><dd data-readout="grain"></dd></div>
      <div><dt>공방 예산</dt><dd data-readout="budget"></dd></div>
    </dl>
    <div class="workshop-transfers" role="group" aria-label="공방 예산 조정">
      <button type="button" data-order="fund"></button>
      <button type="button" data-order="withdraw"></button>
    </div>
    <p class="workshop-note">닥 매입에는 공방 예산을 쓰고, 판매 대금은 가문 곡식에 더합니다.</p>
    <dl class="workshop-rows">
      <div><dt>도제 분이</dt><dd data-readout="apprentice"></dd></div>
      <div><dt>짐꾼 돌석</dt><dd data-readout="porter"></dd></div>
      <div><dt>한지 시세</dt><dd data-readout="price"></dd></div>
      <div><dt>위임 판매</dt><dd data-readout="sales"></dd></div>
      <div><dt>최근 거래</dt><dd data-readout="last"></dd></div>
    </dl>
    <p class="workshop-note">직원에게 직접 지시하면 위임이 멈춥니다.</p>
  `;
  const values = Object.fromEntries([...root.querySelectorAll('[data-readout]')].map(node => [node.dataset.readout, node]));
  const buttons = Object.fromEntries([...root.querySelectorAll('[data-order]')].map(node => [node.dataset.order, node]));
  const panel = {root, values, buttons, act: null};
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-order]');
    if (!button || button.getAttribute('aria-disabled') === 'true') return;
    const amount = button.dataset.amount;
    if (amount === undefined) panel.act(button.dataset.order);
    else panel.act(button.dataset.order, Number(amount));
  });
  panels.set(container, panel);
  return panel;
}

function updateText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function transferButton(button, balance, label) {
  const amount = Math.min(5, balance);
  button.dataset.amount = String(amount);
  button.setAttribute('aria-disabled', String(amount === 0));
  updateText(button, amount ? amount + '말 ' + label : label);
}

function saleSummary(sale) {
  if (!sale) return '아직 거래가 없습니다.';
  const {day, text} = clock({time: sale.time});
  return `${day}일 ${text} · ${sale.quantity}장 × ${sale.unitPrice}말 = ${sale.total}말`;
}

export function renderWorkshopPanel(container, game, act) {
  const {workshop} = game;
  const panel = panels.get(container) || buildPanel(container);
  const {root, values, buttons} = panel;
  panel.act = act;
  if (root.parentElement !== container) container.replaceChildren(root);
  root.dataset.running = String(workshop.enabled);
  buttons.start.dataset.order = workshop.enabled ? 'stop' : 'start';
  updateText(buttons.start, workshop.enabled ? '위임 중지' : '위임 시작');
  updateText(values.mode, workshop.enabled ? '위임 운영 중' : '직접 운영 중');
  updateText(values.reason, workshopStatus(game));
  updateText(values.grain, game.grain + '말');
  updateText(values.budget, workshop.budget + '말');
  transferButton(buttons.fund, game.grain, '맡기기');
  transferButton(buttons.withdraw, workshop.budget, '회수하기');
  for (const worker of game.agents) {
    if (worker.id === 'apprentice' || worker.id === 'porter') updateText(values[worker.id], worker.action);
  }
  const bonus = clientBonus(game);
  updateText(values.price, '한 장에 ' + price(game) + '말' + (bonus ? ' · 단골 판매가 ' + (price(game) + bonus) + '말' : ''));
  updateText(values.sales, workshop.sales + '건');
  updateText(values.last, saleSummary(workshop.lastSale));
}
