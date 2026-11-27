import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  command, fresh, inventoryAt, loadGame, tick, workshopCommand, workshopStatus
} from '../simulation.mjs';

function person(state, id) {
  return state.agents.find(actor => actor.id === id);
}

function order(state, id, action, target) {
  const result = command(state, id, action, target);
  assert.ok(result.ok, result.message);
}

function manage(state, action, amount) {
  const result = workshopCommand(state, action, amount);
  assert.ok(result.ok, result.message);
}

function until(state, condition, reason) {
  for (let elapsed = 0; elapsed < 300 && !condition(); elapsed += 0.5) tick(state, 0.5);
  assert.ok(condition(), reason);
}

function restore(state) {
  const restored = loadGame(JSON.stringify(state));
  assert.ok(restored, 'active orders and their balances survive a save');
  return restored;
}

function bark(state, holder) {
  return inventoryAt(state, 'player', holder, 'bark');
}

// Exhaust the initial four bark bundles and sell their sixteen sheets through
// the regular player commands. Subsequent output must come from new purchases.
function clearStarterStock() {
  const state = fresh();
  order(state, 'master', 'move', 'market');
  until(state, () => person(state, 'master').at === 'market', 'master arrived at market');
  for (let round = 0; round < 4; round++) {
    order(state, 'apprentice', 'produce');
    order(state, 'porter', 'haul');
    until(state, () => state.stock === 4, 'initial batch reached the stall');
    order(state, 'master', 'sell');
  }
  assert.equal(state.bark + state.paper + state.stock, 0);
  return state;
}

test('both real legacy saves restore an active single batch and its existing freight without enabling delegation', () => {
  // v2 was captured by playing commit 8c0c147: the master was travelling to
  // Yangju, the apprentice had seven seconds left, and the porter carried four.
  for (const file of ['v1-production-delivery.json', 'v2-production-delivery.json']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    const legacy = JSON.parse(text);
    const state = loadGame(text);
    assert.ok(state, file);
    assert.equal(state.version, 4);
    assert.equal(state.workshop.enabled, false);
    assert.equal(state.workshop.budget, 0);
    assert.equal(person(state, 'apprentice').batchesLeft, 1);
    assert.equal(person(state, 'apprentice').remaining, 7);
    assert.equal(bark(state, 'workshop:reserved'), 1);
    assert.equal(person(state, 'porter').cargoItem, 'paper');
    assert.equal(person(state, 'porter').cargo, 4);
    assert.deepEqual(person(state, 'master').path, person(legacy, 'master').path);
    assert.deepEqual(person(state, 'porter').path, person(legacy, 'porter').path);
    const restored = restore(state);
    tick(state, 60);
    tick(restored, 60);
    assert.deepEqual(restored, state);
    assert.equal(state.crafted, 8);
    assert.equal(state.bark, 2);
    assert.equal(state.paper, 4);
    assert.equal(state.stock, 4);
    assert.equal(state.workshop.sales, 0);
    if (legacy.version === 2) assert.equal(person(state, 'master').at, 'yangju');
  }
});

test('manual maximum snapshots today’s available input and leaves later deliveries for the next order', () => {
  const state = fresh();
  order(state, 'master', 'move', 'market');
  order(state, 'apprentice', 'move', 'yangju');
  until(state, () => person(state, 'apprentice').at === 'yangju', 'apprentice reached Yangju');
  order(state, 'apprentice', 'produceMax');
  assert.equal(person(state, 'apprentice').batchesLeft, 4);
  assert.equal(bark(state, 'workshop:reserved'), 1);
  assert.equal(command(state, 'apprentice', 'produceMax').ok, false);
  order(state, 'master', 'buy');
  order(state, 'porter', 'haulBark');
  until(state, () => state.crafted === 4, 'first of four manual batches finished');
  const restored = restore(state);
  until(restored, () => restored.crafted === 16, 'all four authorized batches finished');
  tick(restored, 60);
  assert.equal(restored.crafted, 16);
  assert.equal(restored.paper, 16);
  assert.equal(bark(restored, 'workshop:reserved'), 0);
  assert.equal(bark(restored, 'workshop'), 3);
  assert.equal(person(restored, 'apprentice').batchesLeft, 0);
});

test('interrupting a maximum batch keeps finished sheets and refunds just the open bundle', () => {
  const state = fresh();
  order(state, 'apprentice', 'produceMax');
  until(state, () => state.crafted === 4 && bark(state, 'workshop:reserved') === 1,
    'one batch finished and the next bundle is reserved');
  const restored = restore(state);
  order(restored, 'apprentice', 'cancel');
  assert.equal(person(restored, 'apprentice').batchesLeft, 0);
  assert.equal(bark(restored, 'workshop:reserved'), 0);
  assert.equal(bark(restored, 'workshop'), 3);
  assert.equal(restored.paper, 4);
  assert.equal(command(restored, 'apprentice', 'cancel').ok, false);
  tick(restored, 60);
  assert.equal(restored.crafted, 4);
});

test('paying the Jongno seller changes title at market; interrupted bark must still reach the workshop', () => {
  const state = fresh();
  order(state, 'master', 'move', 'workshop');
  until(state, () => person(state, 'master').at === 'workshop', 'master reached his workshop');
  assert.equal(command(state, 'master', 'buy').ok, false);
  order(state, 'master', 'move', 'market');
  assert.equal(command(state, 'master', 'buy').ok, false);
  until(state, () => person(state, 'master').at === 'market', 'master reached the seller');

  const cash = state.grain;
  const marketStock = inventoryAt(state, 'market', 'market', 'bark');
  order(state, 'master', 'buy');
  assert.equal(state.grain, cash - 5);
  assert.equal(inventoryAt(state, 'market', 'market', 'bark'), marketStock - 3);
  assert.equal(bark(state, 'marketPickup'), 3);
  assert.equal(bark(state, 'workshop'), 4);
  order(state, 'porter', 'haulBark');
  assert.equal(bark(state, 'porter'), 0);
  until(state, () => bark(state, 'porter') === 3, 'porter physically picked up the three paid bundles');
  assert.equal(bark(state, 'marketPickup'), 0);
  assert.equal(person(state, 'porter').cargoItem, 'bark');
  order(state, 'porter', 'cancel');
  order(state, 'porter', 'move', 'home');
  tick(state, 2);
  const restored = restore(state);
  until(restored, () => person(restored, 'porter').at === 'home', 'porter took his load to the house');
  assert.equal(bark(restored, 'workshop'), 4);
  assert.equal(bark(restored, 'porter'), 3);
  order(restored, 'porter', 'haulBark');
  until(restored, () => bark(restored, 'workshop') === 7, 'the same bark arrived at the workshop');
  assert.equal(bark(restored, 'porter'), 0);
  assert.equal(bark(restored, 'marketPickup'), 0);
  assert.equal(restored.grain, cash - 5);
  assert.equal(restored.workshop.spent, 0);
});

test('two delegation purchases are collected, processed, delivered and sold while the master stays away', () => {
  const state = clearStarterStock();
  order(state, 'master', 'move', 'yangju');
  until(state, () => person(state, 'master').at === 'yangju', 'master left Hanseong');
  const cash = state.grain;
  const previousCrafted = state.crafted;
  const previousSold = state.sold;
  manage(state, 'fund', 10);
  manage(state, 'start');
  let game = state;
  let grossSales = 0;
  let purchasesCollected = 0;
  let pickupsCompleted = 0;
  let savedWhileLoaded = false;
  for (let elapsed = 0; elapsed < 1600; elapsed += 0.25) {
    const previousLoad = bark(game, 'porter');
    const previousSales = game.workshop.sales;
    tick(game, 0.25);
    const load = bark(game, 'porter');
    if (previousLoad === 0 && load > 0) purchasesCollected++;
    if (previousLoad > 0 && load === 0) pickupsCompleted++;
    if (game.workshop.sales !== previousSales) {
      assert.equal(game.workshop.sales, previousSales + 1);
      const receipt = game.workshop.lastSale;
      assert.equal(receipt.total, receipt.quantity * receipt.unitPrice);
      grossSales += receipt.total;
    }
    assert.equal(person(game, 'master').at, 'yangju');
    assert.equal(game.grain + game.workshop.budget, cash - game.workshop.spent + grossSales);
    const production = game.crafted - previousCrafted;
    const ownedBark = bark(game, 'marketPickup') + load + game.bark + bark(game, 'workshop:reserved');
    assert.equal(ownedBark + production / 4, game.workshop.spent / 5 * 3);
    const unsoldPaper = game.paper + game.stock + inventoryAt(game, 'player', 'porter', 'paper');
    assert.equal(unsoldPaper + game.sold - previousSold, production);
    if (!savedWhileLoaded && load > 0) {
      game = restore(game);
      savedWhileLoaded = true;
    }
    if (game.sold - previousSold === 24) break;
  }
  assert.ok(savedWhileLoaded);
  assert.equal(purchasesCollected, 2);
  assert.equal(pickupsCompleted, 2);
  assert.equal(game.workshop.spent, 10);
  assert.equal(game.workshop.budget, 0);
  assert.equal(game.sold - previousSold, 24);
  assert.ok(game.workshop.sales >= 2);
  assert.equal(game.workshop.enabled, true);
  assert.match(workshopStatus(game), /예산|운영비|운영 자금/);
});

test('delegation waits for a top-up and a stopped mandate spends nothing after a reload', () => {
  const state = clearStarterStock();
  const cash = state.grain;
  manage(state, 'fund', 5);
  manage(state, 'withdraw', 5);
  assert.equal(state.grain, cash);
  assert.equal(state.workshop.budget, 0);
  assert.equal(workshopCommand(state, 'withdraw', 5).ok, false);
  manage(state, 'start');
  tick(state, 60);
  assert.equal(state.workshop.spent, 0);
  assert.equal(state.workshop.sales, 0);
  assert.equal(state.workshop.enabled, true);
  assert.match(workshopStatus(state), /예산|운영비|운영 자금/);

  const restored = restore(state);
  manage(restored, 'fund', 5);
  until(restored, () => restored.workshop.spent === 5, 'top-up funded one physical purchase');
  manage(restored, 'stop');
  const stopped = restore(restored);
  const salesBeforeStop = stopped.workshop.sales;
  manage(stopped, 'fund', 5);
  tick(stopped, 120);
  assert.equal(stopped.workshop.enabled, false);
  assert.equal(stopped.workshop.budget, 5);
  assert.equal(stopped.workshop.spent, 5);
  assert.equal(stopped.workshop.sales, salesBeforeStop);
});

test('the seller cannot charge for missing bark and tomorrow’s delivery can be bought once', () => {
  const state = clearStarterStock();
  for (let lot = 0; lot < 4; lot++) order(state, 'master', 'buy');
  const cash = state.grain;
  assert.equal(inventoryAt(state, 'market', 'market', 'bark'), 0);
  assert.equal(command(state, 'master', 'buy').ok, false);
  assert.equal(state.grain, cash);
  assert.equal(bark(state, 'marketPickup'), 12);
  tick(state, 360); // One day at four in-game minutes per simulation second.
  assert.equal(inventoryAt(state, 'market', 'market', 'bark'), 3);
  order(state, 'master', 'buy');
  assert.equal(command(state, 'master', 'buy').ok, false);
  assert.equal(state.grain, cash - 5);
  assert.equal(bark(state, 'marketPickup'), 15);
});

test('a direct employee cancellation pauses delegation across reload and returns its reservation', () => {
  const state = fresh();
  manage(state, 'start');
  tick(state, 1);
  assert.equal(bark(state, 'workshop:reserved'), 1);
  order(state, 'apprentice', 'cancel');
  const restored = restore(state);
  tick(restored, 60);
  assert.equal(restored.workshop.enabled, false);
  assert.match(workshopStatus(restored), /직접|직원 지시/);
  assert.equal(restored.bark, 4);
  assert.equal(bark(restored, 'workshop:reserved'), 0);
  assert.equal(restored.crafted, 0);
});
