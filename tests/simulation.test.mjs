import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command, fresh, loadGame, price, tick } from '../simulation.mjs';

function startFirstDelivery() {
  const state = fresh();
  assert.ok(command(state, 'apprentice', 'produce').ok);
  assert.ok(command(state, 'porter', 'haul').ok);
  assert.ok(command(state, 'master', 'move', 'market').ok);
  return state;
}

function advanceUntil(state, predicate, limit = 60) {
  for (let second = 0; second < limit && !predicate(); second++) {
    tick(state, 1);
  }
  assert.ok(predicate(), 'the simulation reached the expected event');
}

test('people move and work concurrently; sales require delivered paper and the master at market', () => {
  const state = startFirstDelivery();
  tick(state, 2);
  const actor = id => state.agents.find(person => person.id === id);
  assert.equal(actor('apprentice').mode, 'work');
  assert.equal(actor('master').mode, 'walk');
  assert.equal(actor('porter').mode, 'walk');

  advanceUntil(state, () => actor('master').at === 'market' && actor('porter').cargo === 4);
  assert.equal(state.crafted, 4);
  assert.equal(state.paper, 0);
  assert.equal(state.stock, 0);
  assert.equal(command(state, 'master', 'sell').ok, false);

  assert.ok(command(state, 'master', 'move', 'home').ok);
  advanceUntil(state, () => state.stock === 4 && actor('master').at === 'home');
  assert.equal(actor('porter').cargo, 0);
  assert.equal(command(state, 'master', 'sell').ok, false);
  assert.equal(command(state, 'porter', 'sell').ok, false);

  assert.ok(command(state, 'master', 'move', 'market').ok);
  advanceUntil(state, () => actor('master').at === 'market');
  const cashAfterSale = state.grain + state.stock * price(state);
  assert.ok(command(state, 'master', 'sell').ok);
  assert.equal(state.grain, cashAfterSale);
  assert.equal(state.stock, 0);
  assert.equal(state.sold, 4);
  assert.equal(command(state, 'master', 'sell').ok, false);
});

test('a mid-haul save resumes with the same route, cargo, deliveries and market', () => {
  const state = startFirstDelivery();
  advanceUntil(state, () => state.agents.some(person => person.id === 'porter' && person.cargo > 0));
  tick(state, 3);
  const restored = loadGame(JSON.stringify(state));
  assert.deepEqual(restored, state);
  assert.equal(restored.stock, 0);

  for (let frame = 0; frame < 180; frame++) {
    tick(state, 0.2);
    tick(restored, 0.2);
  }
  assert.deepEqual(restored, state);
  assert.equal(restored.delivered, 4);
  assert.equal(restored.stock, 4);
  assert.equal(restored.rivalSales, 1);
});

test('the rival changes the market price only on delivering the cargo', () => {
  const state = fresh();
  advanceUntil(state, () => state.agents.some(person => person.id === 'rival' && person.cargo === 6));
  assert.equal(state.rivalSales, 0);
  let priorPrice;
  while (state.rivalSales === 0 && state.time < 60) {
    priorPrice = price(state);
    tick(state, 0.1);
  }
  assert.equal(state.rivalSales, 1);
  assert.ok(price(state) < priorPrice);
});
