import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, fresh, loadGame, tick, workshopCommand } from '../simulation.mjs';
import { opportunityView } from '../opportunity.mjs';

function order(state, actor, action, target) {
  const result = command(state, actor, action, target);
  assert.ok(result.ok, result.message);
}

function restore(state) {
  const restored = loadGame(JSON.stringify(state));
  assert.ok(restored);
  return restored;
}

function runFrames(state, seconds, fps, speed) {
  state.speed = speed;
  const frames = seconds * fps / speed;
  const whole = Math.floor(frames);
  for (let frame = 0; frame < whole; frame++) tick(state, speed / fps);
  if (frames !== whole) tick(state, (frames - whole) * speed / fps);
}

test('market settlements and worker schedules agree across frame rates, speed and catch-up calls', () => {
  function simulate(fps, speed) {
    const s = fresh();
    runFrames(s, 5, fps, speed);
    assert.ok(workshopCommand(s, 'fund', 15).ok);
    assert.ok(workshopCommand(s, 'start').ok);
    runFrames(s, 600, fps, speed);
    s.speed = 1;
    return s;
  }
  const expected = simulate(4, 1);
  assert.equal(expected.time, 605);
  assert.equal(expected.sold, 52);
  assert.ok(expected.rivalSales > 0);
  for (const fps of [30, 60, 144]) {
    for (const speed of [1, 4]) {
      assert.deepEqual(simulate(fps, speed), expected, `${fps} FPS, ${speed}×`);
    }
  }
});

test('manual commands, a timed appointment and an interrupted rival settle alike across clock cadences', () => {
  function simulate(fps, speed) {
    const s = fresh();
    runFrames(s, 11, fps, speed);
    order(s, 'master', 'startOpportunity');
    order(s, 'master', 'move', 'market');
    order(s, 'apprentice', 'produce');
    order(s, 'porter', 'haul');
    runFrames(s, 20, fps, speed);
    order(s, 'master', 'meetClient');
    runFrames(s, 36, fps, speed);
    assert.equal(opportunityView(s).met, true);
    order(s, 'master', 'sell');
    runFrames(s, 95, fps, speed);
    s.speed = 1;
    return s;
  }
  const expected = simulate(60, 1);
  assert.equal(expected.sold, 4);
  assert.equal(opportunityView(expected).landOwner, 'rival');
  assert.deepEqual(simulate(30, 4), expected);
  assert.deepEqual(simulate(144, 1), expected);
});

test('a partial step survives saving, pausing and speed changes without stalling or running twice', () => {
  const s = fresh();
  order(s, 'master', 'move', 'yangju');
  tick(s, 1 / 128);
  assert.equal(s.time, 0);
  assert.equal(s.timeRemainder, 1 / 128);
  const restored = restore(s);
  restored.speed = 0;
  tick(restored, 360);
  assert.equal(restored.time, 0);
  assert.equal(restored.timeRemainder, 1 / 128);
  restored.speed = 4;
  tick(restored, 1 / 128);
  assert.equal(restored.time, 1 / 64);
  assert.equal(restored.timeRemainder, 0);
  const uninterrupted = fresh();
  order(uninterrupted, 'master', 'move', 'yangju');
  uninterrupted.speed = 4;
  tick(uninterrupted, 1 / 64);
  assert.deepEqual(restored, uninterrupted);
});

test('save actor ordering does not change dispatch priority or settlement', () => {
  const s = fresh();
  order(s, 'apprentice', 'produceMax');
  order(s, 'porter', 'haul');
  tick(s, 1 / 128);
  const serialized = JSON.parse(JSON.stringify(s));
  serialized.agents.reverse();
  const reordered = loadGame(JSON.stringify(serialized));
  assert.ok(reordered);
  tick(s, 50);
  tick(reordered, 50);
  assert.deepEqual(reordered, s);
});

test('a delegated porter abandons an empty wait to sell paper already at the stall with zero budget', () => {
  const s = fresh();
  order(s, 'apprentice', 'produceMax');
  tick(s, 40);
  for (let load = 0; load < 4; load++) {
    order(s, 'porter', 'haul');
    tick(s, 50);
  }
  assert.equal(s.stock, 16);
  assert.equal(s.bark, 0);
  order(s, 'porter', 'haul');
  tick(s, 30);
  const porter = s.agents.find(a => a.id === 'porter');
  assert.equal(porter.task, 'waitPaper');
  assert.equal(porter.at, 'workshop');
  assert.ok(workshopCommand(s, 'start').ok);
  tick(s, 3);
  assert.equal(s.sold, 0, 'the porter must reach the stall to sell');
  const restored = restore(s);
  tick(restored, 60);
  assert.equal(restored.stock, 0);
  assert.equal(restored.sold, 16);
  assert.equal(restored.workshop.sales, 4);
  assert.equal(restored.workshop.spent, 0);
});
