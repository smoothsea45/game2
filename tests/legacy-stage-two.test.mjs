import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { command, inventoryAt, loadGame, tick } from '../simulation.mjs';
import { opportunityView } from '../opportunity.mjs';
import { openFamilyStore } from '../persistence.mjs';

// Both files are unedited JSON.stringify saves from playing commit 9d9a2be.
// The checkpoint precedes the invitation in the same lineage as the main save.
const file = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const main = file('v3-plot-bark-delivery.json');
const checkpoint = file('v3-appointment-checkpoint.json');
const actor = (s, id) => s.agents.find(a => a.id === id);

function load(text) {
  const s = loadGame(text);
  assert.ok(s, 'save was accepted');
  return s;
}
function order(s, id, action, to) {
  const result = command(s, id, action, to);
  assert.ok(result.ok, result.message);
}
function until(s, predicate) {
  for (let step = 0; step < 600 && !predicate(); step++) tick(s, .25);
  assert.ok(predicate(), 'expected event within 150 simulation seconds');
}

test('a v3 deed, paid rents, active order and cargo keep their title and positions on import', () => {
  const old = JSON.parse(main), s = load(main);
  assert.equal(old.version, 3);
  assert.equal(s.time, 826.25);
  assert.equal(s.timeRemainder, 0);
  assert.equal(s.grain, 4);
  assert.deepEqual(s.properties.plot, {owner:'player', acquiredAt:65, rentDays:2});
  assert.equal(opportunityView(s).nextRentAt, 1145);
  assert.deepEqual(s.workshop, old.workshop);
  assert.deepEqual(s.agents, old.agents);
  assert.equal(actor(s, 'apprentice').remaining, 7);
  assert.equal(actor(s, 'apprentice').batchesLeft, 4);
  assert.equal(actor(s, 'porter').cargoItem, 'bark');
  assert.equal(actor(s, 'rival').cargoItem, 'paper');

  assert.equal(s.inventory.length, old.inventory.length);
  for (const row of old.inventory) {
    assert.equal(inventoryAt(s, row.owner, row.holder, row.item), row.quantity,
      [row.owner, row.holder, row.item].join('/'));
  }
  assert.deepEqual(load(JSON.stringify(s)), s);
});

test('continuing the migrated shipment fulfills the same orders as the uninterrupted v3 session', () => {
  const s = load(main);
  until(s, () => actor(s, 'apprentice').task === 'idle' && actor(s, 'porter').task === 'idle');
  order(s, 'porter', 'haulBark');
  until(s, () => actor(s, 'porter').task === 'idle');
  for (let trip = 0; trip < 2; trip++) {
    order(s, 'porter', 'haul');
    until(s, () => actor(s, 'porter').task === 'idle');
  }
  order(s, 'master', 'contract');

  // Same orders were run to completion without reloading in 9d9a2be. Compare
  // settlement and custody, since v4 settles nearby arrivals at a finer cadence.
  assert.deepEqual(
    [s.grain, s.crafted, s.sold, s.delivered, s.bark, s.paper, s.stock],
    [52, 16, 6, 8, 6, 8, 2]
  );
  assert.equal(inventoryAt(s, 'office', 'office', 'paper'), 6);
  assert.equal(inventoryAt(s, 'player', 'marketPickup', 'bark'), 0);
  assert.equal(actor(s, 'porter').cargo, 0);

  const resumed = load(JSON.stringify(s));
  tick(resumed, 1145 - resumed.time - .25);
  assert.equal(resumed.grain, 52);
  tick(resumed, .25);
  assert.equal(resumed.grain, 56);
  assert.equal(resumed.properties.plot.rentDays, 3);
  const afterRent = load(JSON.stringify(resumed));
  tick(afterRent, 1);
  assert.equal(afterRent.grain, 56);
});

test('the original v3 invitation checkpoint can replay the meeting and resume the interrupted rival haul', async () => {
  const oldSlot = 'hanseong-garok-realtime-v3';
  const records = new Map([[oldSlot, main], [oldSlot + '-appointment', checkpoint]]);
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value)
  };
  const open = () => openFamilyStore(() => storage, write => write());
  const family = open();
  assert.equal(family.loaded.checkpoint, checkpoint);
  assert.equal(await family.save(family.loaded.game, null, family.loaded.checkpoint), 'saved');
  const s = load(open().loaded.checkpoint);
  assert.equal(opportunityView(s).phase, 'ready');
  assert.equal(actor(s, 'rival').cargo, 6);
  order(s, 'master', 'startOpportunity');
  order(s, 'master', 'move', 'market');
  order(s, 'apprentice', 'produce');
  order(s, 'porter', 'haul');
  until(s, () => actor(s, 'master').at === 'market');
  order(s, 'master', 'meetClient');

  const branch = load(JSON.stringify(s));
  until(branch, () => opportunityView(branch).landOwner === 'rival');
  assert.equal(opportunityView(branch).met, true);
  assert.equal(opportunityView(branch).rivalPurse, 6);
  assert.equal(actor(branch, 'rival').cargo, 6);
  order(branch, 'master', 'sell');
  until(branch, () => branch.rivalSales === 1);

  // Outcomes of replaying the checkpoint on the released v3 engine.
  assert.equal(branch.grain, 66);
  assert.equal(branch.sold, 4);
  assert.equal(branch.stock, 0);
  assert.equal(actor(branch, 'rival').cargo, 0);
  assert.equal(opportunityView(branch).rivalPurse, 72);
  const original = open().loaded;
  assert.equal(opportunityView(original.game).landOwner, 'master');
  assert.equal(original.game.time, 826.25);
  assert.equal(opportunityView(load(original.checkpoint)).phase, 'ready');
});
