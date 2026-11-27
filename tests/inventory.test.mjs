import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fresh, holdingsAtPlace, inventoryAt, loadGame} from '../simulation.mjs';
import {bins, moveGoods, placeBin, quantity} from '../inventory.mjs';

test('stock belongs to a specific market or workshop across a save, independently of title', () => {
  const s=fresh();
  const yangju=placeBin('market','yangju','seller','bark');
  moveGoods(s,bins.marketBark,yangju,4);
  const familiesBark=placeBin('player','rival','shelf','bark');
  moveGoods(s,bins.bark,familiesBark,2);
  const rivalBark=placeBin('rival','rival','shelf','bark');
  moveGoods(s,familiesBark,rivalBark,1);

  const restored=loadGame(JSON.stringify(s));
  assert.ok(restored);
  assert.equal(inventoryAt(restored,'market','market','bark'),8);
  assert.equal(quantity(restored,yangju),4);
  assert.equal(quantity(restored,bins.bark),2);
  assert.equal(quantity(restored,familiesBark),1);
  assert.equal(quantity(restored,rivalBark),1);
  const rows=holdingsAtPlace(restored,'yangju');
  assert.deepEqual(rows,[{...yangju,quantity:4}]);
  rows[0].quantity=20;
  assert.equal(quantity(restored,yangju),4);
});

test('carried stock follows a person and does not appear at the nearby building', () => {
  const s=fresh();
  moveGoods(s,bins.marketBark,bins.pickupBark,3);
  moveGoods(s,bins.pickupBark,bins.porterBark,3);
  const restored=loadGame(JSON.stringify(s));
  assert.ok(restored);
  assert.equal(inventoryAt(restored,'player','porter','bark'),3);
  assert.equal(restored.agents.find(a=>a.id==='porter').cargoItem,'bark');
  assert.deepEqual(holdingsAtPlace(restored,'home'),[]);
  assert.ok(holdingsAtPlace(restored,'market').every(row=>row.owner==='market'));
});

test('a transfer to the same balance conserves its full stock; invalid transfers debit nothing', () => {
  const s=fresh(), old=JSON.stringify(s.inventory);
  moveGoods(s,bins.bark,{...bins.bark},s.bark);
  assert.equal(JSON.stringify(s.inventory),old);
  for (const to of [
    placeBin('unknown','market','seller','bark'), placeBin('player','unknown','shelf','bark'),
    placeBin('player','plot','shelf','bark'), placeBin('player',null,'unknown','bark'),
    placeBin('player','workshop','shelf','unknown'), bins.workshop
  ]) {
    assert.throws(()=>moveGoods(s,bins.bark,to,1));
    assert.throws(()=>moveGoods(s,to,bins.bark,1));
    assert.equal(JSON.stringify(s.inventory),old);
  }
  assert.throws(()=>moveGoods(s,bins.bark,bins.bark,s.bark+1));
  assert.equal(JSON.stringify(s.inventory),old);
  assert.ok(loadGame(JSON.stringify(s)));
});

test('restoring rejects a duplicate balance or storage role unavailable at its address', () => {
  const raw=JSON.parse(JSON.stringify(fresh()));
  raw.inventory.push({...raw.inventory[0]});
  assert.equal(loadGame(JSON.stringify(raw)),null);
  raw.inventory.pop();
  raw.inventory[0].placeId='market';
  assert.equal(loadGame(JSON.stringify(raw)),null);
});
