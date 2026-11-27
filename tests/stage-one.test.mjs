import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clock, command, fresh, inventoryAt, loadGame, price, tick } from '../simulation.mjs';

// Captured by playing commit 6ef8730: the first batch is on the road and
// the second has seven seconds left on the mould. Never regenerate with v2.
const legacySave = readFileSync(new URL('./v1-production-delivery.json', import.meta.url), 'utf8');

function actor(state, id) {
  return state.agents.find(person => person.id === id);
}

function order(state, id, action, target) {
  const result = command(state, id, action, target);
  assert.ok(result.ok, result.message);
}

function until(state, condition, description) {
  for (let elapsed = 0; elapsed < 300 && !condition(); elapsed++) tick(state, 1);
  assert.ok(condition(), description);
}

function resume(state) {
  const restored = loadGame(JSON.stringify(state));
  assert.ok(restored, 'saved state can be restored');
  return restored;
}

test('a real v1 save migrates ongoing work and treats carried paper separately from the stall', () => {
  const original = JSON.parse(legacySave);
  const state = loadGame(legacySave);
  assert.ok(state);
  assert.equal(state.version, 2);
  assert.equal(state.time, original.time);
  assert.equal(state.grain, original.grain);
  assert.equal(actor(state, 'apprentice').remaining, 7);
  assert.equal(actor(state, 'porter').x, actor(original, 'porter').x);
  assert.deepEqual(actor(state, 'porter').path, actor(original, 'porter').path);
  assert.equal(inventoryAt(state, 'player', 'workshop', 'bark'), 2);
  assert.equal(inventoryAt(state, 'player', 'workshop:reserved', 'bark'), 1);
  assert.equal(inventoryAt(state, 'player', 'porter', 'paper'), 4);
  assert.equal(inventoryAt(state, 'player', 'stall', 'paper'), 0);
  assert.equal(inventoryAt(state, 'rival', 'rival', 'paper'), 6);

  const restored = resume(state);
  tick(state, 45);
  tick(restored, 45);
  assert.deepEqual(restored, state);
  assert.equal(restored.crafted, 8);
  assert.equal(restored.delivered, 4);
  assert.equal(inventoryAt(restored, 'player', 'workshop', 'bark'), 2);
  assert.equal(inventoryAt(restored, 'player', 'workshop:reserved', 'bark'), 0);
  assert.equal(inventoryAt(restored, 'player', 'workshop', 'paper'), 4);
  assert.equal(inventoryAt(restored, 'player', 'porter', 'paper'), 0);
  assert.equal(inventoryAt(restored, 'player', 'stall', 'paper'), 4);
});

test('a cancelled production order refunds its reserved bark once, including after a reload', () => {
  const state = loadGame(legacySave);
  order(state, 'apprentice', 'cancel');
  assert.equal(inventoryAt(state, 'player', 'workshop', 'bark'), 3);
  assert.equal(inventoryAt(state, 'player', 'workshop:reserved', 'bark'), 0);

  const restored = resume(state);
  assert.equal(command(restored, 'apprentice', 'cancel').ok, false);
  order(restored, 'apprentice', 'produce');
  assert.equal(command(restored, 'apprentice', 'produce').ok, false);
  tick(restored, 20);
  assert.equal(restored.crafted, 8);
  assert.equal(inventoryAt(restored, 'player', 'workshop', 'bark'), 2);
  assert.equal(inventoryAt(restored, 'player', 'workshop:reserved', 'bark'), 0);
  assert.equal(inventoryAt(restored, 'player', 'workshop', 'paper'), 4);
});

test('a worker reserves a single input en route and can return it before work begins', () => {
  const state = fresh();
  order(state, 'apprentice', 'move', 'home');
  until(state, () => actor(state, 'apprentice').at === 'home', 'apprentice starts away from workshop');
  order(state, 'apprentice', 'produce');
  tick(state, 1);
  assert.equal(actor(state, 'apprentice').task, 'toCraft');
  const restored = resume(state);
  assert.equal(inventoryAt(restored, 'player', 'workshop', 'bark'), 3);
  assert.equal(inventoryAt(restored, 'player', 'workshop:reserved', 'bark'), 1);
  order(restored, 'apprentice', 'cancel');
  tick(restored, 15);
  assert.equal(inventoryAt(restored, 'player', 'workshop', 'bark'), 4);
  assert.equal(inventoryAt(restored, 'player', 'workshop:reserved', 'bark'), 0);
  assert.equal(restored.crafted, 0);
});

test('a porter can interrupt a delivery, carry the same goods elsewhere and complete it once', () => {
  const state = loadGame(legacySave);
  order(state, 'porter', 'cancel');
  assert.equal(inventoryAt(state, 'player', 'porter', 'paper'), 4);
  assert.equal(inventoryAt(state, 'player', 'stall', 'paper'), 0);
  order(state, 'porter', 'move', 'home');
  until(state, () => actor(state, 'porter').at === 'home', 'porter reached home with the cargo');
  const restored = resume(state);
  assert.equal(restored.delivered, 0);
  assert.equal(inventoryAt(restored, 'player', 'porter', 'paper'), 4);
  order(restored, 'porter', 'haul');
  assert.equal(actor(restored, 'porter').target, 'market');
  until(restored, () => restored.delivered === 4, 'existing freight was delivered');
  tick(restored, 10);
  assert.equal(restored.delivered, 4);
  assert.equal(inventoryAt(restored, 'player', 'workshop', 'paper'), 4);
  assert.equal(inventoryAt(restored, 'player', 'porter', 'paper'), 0);
  assert.equal(inventoryAt(restored, 'player', 'stall', 'paper'), 4);
});

test('selling or fulfilling the office order transfers title out of the player stall exactly once', () => {
  const state = loadGame(legacySave);
  order(state, 'master', 'move', 'market');
  until(state, () => state.delivered === 4 && state.paper === 4, 'second batch is ready for pickup');
  order(state, 'porter', 'haul');
  until(state, () => state.delivered === 8 && clock(state).day === 2, 'day two with eight sheets at market');
  const before = state.grain;
  order(state, 'master', 'contract');
  const restored = resume(state);
  assert.equal(command(restored, 'master', 'contract').ok, false);
  assert.equal(inventoryAt(restored, 'office', 'office', 'paper'), 6);
  assert.equal(inventoryAt(restored, 'player', 'stall', 'paper'), 2);
  assert.equal(restored.grain, before + 48);
  const expectedCash = restored.grain + 2 * price(restored);
  const publicSupply = inventoryAt(restored, 'market', 'market', 'paper');
  order(restored, 'master', 'sell');
  assert.equal(inventoryAt(restored, 'market', 'market', 'paper'), publicSupply + 2);
  assert.equal(inventoryAt(restored, 'player', 'stall', 'paper'), 0);
  assert.equal(restored.grain, expectedCash);
  assert.equal(restored.sold, 8);
  assert.equal(command(restored, 'master', 'sell').ok, false);
});

test('a journey to Yangju and back keeps other actors running and survives pause and 4x resume', () => {
  const state = fresh();
  order(state, 'apprentice', 'produce');
  order(state, 'porter', 'haul');
  order(state, 'master', 'move', 'yangju');
  tick(state, 1);
  assert.equal(actor(state, 'master').mode, 'walk');
  state.speed = 0;
  const paused = resume(state);
  tick(paused, 30);
  assert.deepEqual(paused, state);

  state.speed = 4;
  paused.speed = 4;
  const restored = resume(paused);
  assert.equal(restored.speed, 4);
  // As in the browser frame loop, tick receives the elapsed *simulation* time.
  for (let frame = 0; frame < 300 && actor(restored, 'master').at !== 'yangju'; frame++) {
    tick(state, 0.25 * state.speed);
    tick(restored, 0.25 * restored.speed);
  }
  assert.deepEqual(restored, state);
  assert.equal(actor(restored, 'master').at, 'yangju');
  until(restored, () => restored.delivered === 4 && restored.rivalSales > 0,
    'Hanseong deliveries and rival trading continue while the master is away');
  assert.equal(command(restored, 'master', 'sell').ok, false);
  order(restored, 'master', 'move', 'home');
  until(restored, () => actor(restored, 'master').at === 'home', 'master returned to Hanseong');
  assert.equal(restored.crafted, 4);
  assert.equal(restored.stock, 4);
});
