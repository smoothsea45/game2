import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openFamilyStore, familySlot, backupSlot} from '../persistence.mjs';
import {fresh, command, loadGame, tick} from '../simulation.mjs';

const oldKey = 'hanseong-garok-realtime-v3';
const camera = {selected:'master', following:'master', place:'yangju'};
function setup() {
  const records = new Map();
  const storage = {
    getItem:key => records.get(key) ?? null,
    setItem:(key, value) => records.set(key, value)
  };
  // A write mutex equivalent to the per-origin browser Web Lock.
  let queue = Promise.resolve();
  const serialize = work => { queue = queue.then(work, work); return queue; };
  const open = () => openFamilyStore(() => storage, serialize);
  return {storage, records, open};
}

test('a stale tab cannot replace main progress on pagehide or on another retry', async () => {
  const {open, records} = setup();
  const initial = open();
  await initial.save(initial.loaded.game, null, null);
  const stale = open(), active = open();
  const before = JSON.stringify(active.loaded.game);
  assert.ok(command(active.loaded.game, 'master', 'startOpportunity').ok);
  tick(active.loaded.game, 9);
  const live = active.save(active.loaded.game, camera, before);
  const late = stale.save(stale.loaded.game, null, null);
  assert.equal(await live, 'saved');
  assert.equal(await late, 'conflict');
  assert.equal(await stale.save(stale.loaded.game, null, null), 'blocked');
  const resumed = open().loaded;
  assert.equal(resumed.game.time, 9);
  assert.equal(resumed.game.opportunity.startedAt, 0);
  assert.equal(resumed.checkpoint, before);
  assert.deepEqual(resumed.view, camera);
  assert.equal(JSON.parse(records.get(backupSlot)).checkpoint, null);
});

test('migrates valid old family and checkpoint independently of malformed camera data', async () => {
  const {open, records} = setup();
  const game = fresh(), before = JSON.stringify(game);
  command(game, 'master', 'startOpportunity'); tick(game, 70);
  const oldGame = JSON.stringify(game);
  records.set(oldKey, oldGame);
  records.set(oldKey + '-view', '{');
  records.set(oldKey + '-appointment', before);
  const migrated = open();
  assert.equal(migrated.loaded.game.time, 70);
  assert.equal(migrated.loaded.checkpoint, before);
  assert.equal(migrated.loaded.view, null);
  await migrated.save(migrated.loaded.game, camera, before);
  assert.equal(records.get(oldKey), oldGame);
  assert.deepEqual(open().loaded.view, camera);
  // An old, still-open client only knows its old key.
  records.set(oldKey, before);
  assert.equal(open().loaded.game.time, 70);
});

test('recovers in-flight legacy gameplay with an older key when newer legacy save is damaged', async () => {
  const {open, records} = setup();
  const v2 = readFileSync(new URL('./v2-production-delivery.json', import.meta.url), 'utf8');
  records.set(oldKey, '{bad'); records.set('hanseong-garok-realtime-v2', v2);
  const store = open();
  assert.ok(store.recovery);
  assert.equal(store.loaded.game.time, 11);
  assert.equal(store.loaded.game.agents.find(a => a.id === 'porter').cargo, 4);
  await store.save(store.loaded.game, null, null);
  assert.equal(records.get(oldKey), '{bad');
  assert.equal(records.get('hanseong-garok-realtime-v2'), v2);
});

test('a truncated primary is archived intact when restoring last good family and view', async () => {
  const {open, records} = setup();
  const store = open(), game = store.loaded.game;
  tick(game, 12); await store.save(game, camera, null);
  tick(game, 1); await store.save(game, null, null);
  const backup = records.get(backupSlot);
  records.set(familySlot, '{broken');
  const restored = open();
  assert.ok(restored.recovery);
  assert.equal(restored.loaded.game.time, 12);
  assert.deepEqual(restored.loaded.view, camera);
  assert.equal(records.get(familySlot), '{broken');
  await restored.save(restored.loaded.game, camera, null);
  assert.equal(records.get(backupSlot), backup);
  assert.ok([...records.values()].includes('{broken'));
});

test('unreadable primary without backup is preserved, unknown newer formats stay read-only', async () => {
  const {open, records} = setup();
  records.set(familySlot, 'bad');
  const restored = open();
  assert.ok(restored.recovery);
  await restored.save(restored.loaded.game, null, null);
  assert.ok([...records.values()].includes('bad'));
  for (const future of [{format: 9}, {format: 1, game:JSON.stringify({version:fresh().version + 1})}]) {
    const raw = JSON.stringify(future);
    records.set(familySlot, raw);
    const reader = open();
    assert.equal(reader.frozen, true);
    assert.equal(await reader.save(fresh(), null, null), 'blocked');
    assert.equal(records.get(familySlot), raw);
  }
});

test('quota failure during archive and invalid in-memory work both preserve the primary', async () => {
  const {open, records, storage} = setup();
  records.set(familySlot, '{unreadable');
  const store = open();
  const original = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(await store.save(fresh(), null, null), 'unavailable');
  assert.equal(records.get(familySlot), '{unreadable');
  storage.setItem = original;
  assert.equal(await store.save(fresh(), null, null), 'saved');
  const primary = records.get(familySlot), invalid = fresh();
  invalid.grain = -1;
  assert.equal(await store.save(invalid, null, null), 'invalid');
  assert.equal(records.get(familySlot), primary);
});

test('a legacy checkpoint from a different event time is not offered for replay', () => {
  const {records, open} = setup();
  const primary = fresh(), foreign = fresh();
  command(primary, 'master', 'startOpportunity'); tick(primary, 70);
  tick(foreign, 20);
  records.set(oldKey, JSON.stringify(primary)); records.set(oldKey+'-appointment', JSON.stringify(foreign));
  assert.equal(open().loaded.checkpoint, null);
  assert.equal(loadGame(records.get(oldKey)).opportunity.closed, true);
});

test('a queued save captures the main timeline before a rehearsal can start', async () => {
  const {storage, records} = setup();
  let release;
  const lock = new Promise(resolve => { release = resolve; });
  const store = openFamilyStore(() => storage, work => lock.then(work));
  const game = store.loaded.game;
  const checkpoint = JSON.stringify(game);
  command(game, 'master', 'startOpportunity'); tick(game, 70);
  const savedTime = game.time;
  const pending = store.save(game, camera, checkpoint);
  tick(game, 20);
  release();
  await pending;
  const committed = JSON.parse(records.get(familySlot));
  assert.equal(loadGame(committed.game).time, savedTime);
  assert.equal(committed.checkpoint, checkpoint);
});
