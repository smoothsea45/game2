import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoadMap} from '../road-map.js';
import {command, fresh, loadGame, tick} from '../simulation.mjs';
import {distance, doorstep, places, route, validTravel} from '../world.mjs';

test('every existing doorstep connects to every other doorstep along uninterrupted streets', () => {
  for (const actor of fresh().agents) {
    for (const from of Object.keys(places)) {
      for (const to of Object.keys(places)) {
        const start = doorstep(actor.id, from);
        const end = doorstep(actor.id, to);
        const leg = {...actor, ...start, at:null, target:to, mode:'walk', path:route(start,end)};
        assert.ok(validTravel(leg), actor.id+' '+from+' → '+to);
        assert.ok(distance(leg.path.at(-1), end) < 1e-8);
      }
    }
  }
});

test('a ground order at the Jongno entrance enables the same on-site purchase as a named order', () => {
  const state = fresh();
  const master = state.agents.find(a => a.id === 'master');
  const {x,z} = places.market;
  assert.ok(command(state,'master','move',{x,z}).ok);
  assert.equal(command(state,'master','buy').ok, false);
  assert.equal(master.target, 'market');
  tick(state, 12);
  assert.equal(master.at, 'market');
  assert.equal(distance(master, {x,z}), 0);
  assert.ok(command(state,'master','buy').ok);
  assert.ok(command(state,'master','move',{x:40,z:0}).ok);
  tick(state, 15);
  assert.equal(master.at, null);
  assert.equal(command(state,'master','buy').ok, false);
});

test('save validation checks whole street legs, real doors and order destinations', () => {
  const state=fresh();
  assert.ok(command(state,'master','move','market').ok);
  function edit(fn) {
    const raw=JSON.parse(JSON.stringify(state));
    fn(raw.agents);
    return loadGame(JSON.stringify(raw));
  }
  assert.ok(edit(()=>{}));
  assert.equal(edit(([master]) => {master.path=[doorstep('master','market')];}), null);
  assert.equal(edit(([master]) => {master.target='yangju';}), null);
  assert.equal(edit(([master]) => {
    Object.assign(master,{at:'market',target:null,path:[],mode:'idle',task:'idle'});
  }), null);
  assert.equal(edit(([,apprentice]) => {
    const door=doorstep('apprentice','home');
    Object.assign(apprentice,door,{at:'home',mode:'work',task:'craft'});
  }), null);
  assert.equal(edit(([, , ,rival]) => {
    Object.assign(rival,doorstep('rival','home'),{at:'home'});
  }), null);
  assert.ok(edit(([master]) => {
    Object.assign(master,doorstep('master','market'),{path:[]});
  }), 'a route at its final waypoint can be saved just before arrival settles');
});

test('tapping a roof or the Yangju parcel in the rotated fallback map selects the named place', t => {
  const width=1000, height=600, angle=.45, events=[];
  const ctx=new Proxy({measureText:s=>({width:s.length*8})}, {
    get:(context,key) => key in context ? context[key] : () => {}
  });
  const canvas={style:{}, setAttribute(){}, setPointerCapture(){}, getContext:()=>ctx,
    getBoundingClientRect:()=>({left:0,top:0})};
  for (const [name,value] of Object.entries({document:{createElement:()=>canvas},window:{devicePixelRatio:1}})) {
    const original=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{configurable:true,value});
    t.after(()=>{if(original) Object.defineProperty(globalThis,name,original); else delete globalThis[name];});
  }
  const map=makeRoadMap({clientWidth:width,clientHeight:height,replaceChildren(){},append(){}},
    (hit,button)=>events.push({hit,button}));
  map.rotate(angle);
  const scale=Math.min(width/57,height/36);
  for (const [id,door] of Object.entries(places)) {
    map.focusPlace(id);
    map.render({actors:[]});
    const dx=door.footprint.x-door.x, dz=door.footprint.z-door.z;
    const event={pointerId:1,button:0,
      clientX:width/2+scale*(dx*Math.cos(angle)-dz*Math.sin(angle)),
      clientY:height/2+scale*(dx*Math.sin(angle)+dz*Math.cos(angle))};
    canvas.onpointerdown(event);
    canvas.onpointerup(event);
    assert.deepEqual(events.pop(), {hit:{type:'place',id,x:door.x,z:door.z},button:0});
    canvas.oncontextmenu({...event,button:2,preventDefault(){}});
    assert.deepEqual(events.pop(), {hit:{type:'place',id,x:door.x,z:door.z},button:2});
  }
});
