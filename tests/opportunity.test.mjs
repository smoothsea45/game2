import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh, command, tick, loadGame, price} from '../simulation.mjs';
import {opportunityView, clientBonus} from '../opportunity.mjs';
import {quantity, bins} from '../inventory.mjs';

const person=(s,id)=>s.agents.find(a=>a.id===id);
function order(s,id,action,to){
  const response=command(s,id,action,to);assert.ok(response.ok,response.message);
}
function travel(s,place){
  order(s,'master','move',place);
  for(let t=0;t<90&&person(s,'master').at!==place;t+=.25)tick(s,.25);
  assert.equal(person(s,'master').at,place);
}
function load(s){const resumed=loadGame(JSON.stringify(s));assert.ok(resumed,'save accepted');return resumed;}

test('a new invitation uses the current clock even on day 100; the master must travel to the sale',()=>{
  const s=fresh();s.time=360*99;
  order(s,'master','startOpportunity');
  let v=opportunityView(s);assert.equal(v.phase,'waiting');assert.equal(v.opensAt,s.time+54);
  assert.equal(command(s,'master','startOpportunity').ok,false);
  assert.equal(command(s,'master','claimPlot').ok,false);
  travel(s,'plot');order(s,'master','claimPlot');
  assert.equal(opportunityView(s).landOwner,null);
  const before=s.grain;tick(s,v.opensAt-s.time+.25);
  assert.equal(opportunityView(s).landOwner,'master');assert.equal(s.grain,before-v.landPrice);
  assert.equal(command(s,'master','claimPlot').ok,false);
  travel(s,'market');assert.equal(command(s,'master','meetClient').ok,false);
  const restored=load(s);assert.equal(opportunityView(restored).phase,'closed');
  const rentAt=opportunityView(restored).nextRentAt;
  tick(restored,rentAt-restored.time+.25);assert.equal(restored.grain,before-v.landPrice+v.rentPerDay);
});

test('an early sign-in is cancelled on departure, and the rival pays the same price at the Yangju site',()=>{
  const s=fresh();order(s,'master','startOpportunity');travel(s,'market');
  order(s,'master','meetClient');order(s,'master','move','home');tick(s,1);
  assert.equal(opportunityView(s).queued,null);assert.equal(clientBonus(s),0);
  const v=opportunityView(s);tick(s,v.opensAt-s.time);
  assert.equal(opportunityView(s).landOwner,null);assert.equal(person(s,'rival').at,'plot');
  const onSite=load(s);tick(onSite,6.5);
  assert.equal(opportunityView(onSite).landOwner,'rival');assert.equal(opportunityView(onSite).rivalPurse,v.rivalPurse-v.landPrice);
  assert.equal(clientBonus(onSite),0);
});

test('meeting unlocks recurring premiums on actual market sales; a carrying rival resumes the original delivery',()=>{
  const s=fresh();tick(s,11);assert.equal(person(s,'rival').task,'rivalDeliver');
  const held=quantity(s,bins.rival),initialSales=s.rivalSales;
  assert.ok(held>0);order(s,'master','startOpportunity');
  assert.equal(quantity(s,bins.rival),held);
  order(s,'apprentice','produce');order(s,'porter','haul');travel(s,'market');
  order(s,'master','meetClient');const saved=load(s);
  saved.speed=0;const now=saved.time;tick(saved,30);assert.equal(saved.time,now);saved.speed=1;
  for(const g of [s,saved]){
    tick(g,opportunityView(g).opensAt-g.time+.25);assert.equal(clientBonus(g),1);
    const base=price(g),cash=g.grain;order(g,'master','sell');assert.equal(g.grain,cash+4*(base+1));
    travel(g,'plot');assert.equal(command(g,'master','claimPlot').ok,false);
    for(let elapsed=0;elapsed<90&&g.rivalSales===initialSales;elapsed+=.25)tick(g,.25);
    assert.equal(g.rivalSales,initialSales+1);
    assert.equal(quantity(g,bins.rival),0);
  }
  assert.deepEqual(s,saved);assert.deepEqual(s,load(saved));
});

test('no rich-by-default land transfer when even an on-site rival has insufficient cash',()=>{
  const s=fresh();s.opportunity.rivalPurse=0;order(s,'master','startOpportunity');
  tick(s,69);const v=opportunityView(load(s));assert.equal(v.phase,'closed');
  assert.equal(v.landOwner,null);assert.equal(v.met,false);
});

test('every leg of the rival detour survives a save without replacing an interrupted shipment or work timer',()=>{
  for(const initialTime of [2,16,39]){
    const s=fresh();tick(s,initialTime);
    const prior=person(s,'rival').task;order(s,'master','startOpportunity');
    assert.equal(s.opportunity.rivalResume.task,prior);
    const cargo=quantity(s,bins.rival),shop=quantity(s,bins.rivalShop);
    let restored=load(s);
    for(let t=0;t<125;t+=.5){
      tick(s,.5);tick(restored,.5);
      assert.deepEqual(restored,s);
      if(person(s,'rival').task.startsWith('rivalPlot')){
        assert.equal(quantity(s,bins.rival),cargo);
        assert.equal(quantity(s,bins.rivalShop),shop);
      }
      restored=load(restored);
    }
    assert.equal(s.opportunity.rivalResume,null);
    assert.equal(opportunityView(s).landOwner,'rival');
  }
});
