import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,loadGame,tick} from '../simulation.mjs';
import {propertyView} from '../estate.mjs';
import {opportunityView} from '../opportunity.mjs';

test('property titles use the same family ids across business, residence and purchased land',()=>{
  const s=fresh();
  assert.equal(propertyView(s,'home').owner,'player');
  assert.equal(propertyView(s,'workshop').owner,'player');
  assert.equal(propertyView(s,'rival').owner,'rival');
  assert.equal(propertyView(s,'plot').kind,'unowned');
  assert.equal(propertyView(s,'market').kind,'public');
  assert.equal(propertyView(s,'yangju').kind,'public');
  assert.equal(propertyView(s,'unknown'),null);
  assert.equal(Object.hasOwn(s.properties,'market'),false);
});

for(const family of ['player','rival']){
  test('a v3 '+family+' deed retains its acquisition time and paid rent through another save',()=>{
    // Real v3 games after choosing opposite opportunities and collecting two days of rent.
    const raw=readFileSync(new URL('./v3-'+family+'-deed.json',import.meta.url),'utf8');
    const old=JSON.parse(raw), s=loadGame(raw);
    assert.ok(s);
    assert.deepEqual(s.properties.plot,{
      owner:family,acquiredAt:old.opportunity.acquiredAt,rentDays:old.opportunity.rentDays
    });
    assert.equal(s.grain,old.grain);
    assert.equal(s.opportunity.rivalPurse,old.opportunity.rivalPurse);
    assert.deepEqual(s.log,old.log);
    for(const key of ['landOwner','acquiredAt','rentDays'])assert.ok(!Object.hasOwn(s.opportunity,key));
    assert.equal(opportunityView(s).landOwner,old.opportunity.landOwner);
    assert.equal(opportunityView(s).met,old.opportunity.met);
    const property=propertyView(s,'plot');
    assert.equal(property.nextRentAt,property.acquiredAt+3*360);
    const balance=()=>family==='player'?s.grain:s.opportunity.rivalPurse;
    tick(s,property.nextRentAt-s.time-.25);
    assert.equal(s.properties.plot.rentDays,2);
    const before=balance();
    tick(s,.25);
    assert.equal(s.properties.plot.rentDays,3);
    assert.equal(balance(),before+4);
    const restored=loadGame(JSON.stringify(s));
    assert.ok(restored);
    tick(restored,1);
    assert.equal(restored.properties.plot.rentDays,3);
    assert.equal(family==='player'?restored.grain:restored.opportunity.rivalPurse,balance());
  });
}

test('invalid owner and duplicate v4 deed fields cannot silently override registered rights',()=>{
  const invalid=JSON.parse(JSON.stringify(fresh()));
  invalid.properties.plot.owner='master';
  assert.equal(loadGame(JSON.stringify(invalid)),null);
  const duplicated=JSON.parse(JSON.stringify(fresh()));
  duplicated.opportunity.landOwner='master';
  assert.equal(loadGame(JSON.stringify(duplicated)),null);
});
