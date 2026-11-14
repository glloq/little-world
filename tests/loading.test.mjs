import test from 'node:test';
import assert from 'node:assert/strict';
import {loadingState} from '../src/ui/loading.ts';

test('loading screen: progress follows the real counters, ready only when the spawn area is built',()=>{
  const max={terrain:0,dressing:0};
  let s=loadingState({boot:.45,terrainPending:0,dressingPending:-1,speciesState:'loading'},max,100);assert.equal(s.ready,false);assert.match(s.label,/Lecture/);
  s=loadingState({boot:1,terrainPending:40,dressingPending:-1,speciesState:'loading'},max,1000);assert.equal(s.ready,false);assert.match(s.label,/relief/);const a=s.fraction;
  s=loadingState({boot:1,terrainPending:10,dressingPending:12,speciesState:'loading'},max,2000);assert.ok(s.fraction>a,'progress grows');
  s=loadingState({boot:1,terrainPending:0,dressingPending:3,speciesState:'ready'},max,3000);assert.equal(s.ready,false);assert.match(s.label,/Forêts/);assert.ok(s.fraction<1);
  s=loadingState({boot:1,terrainPending:0,dressingPending:0,speciesState:'ready'},max,4000);assert.equal(s.ready,true);assert.equal(s.fraction,1);
  // Worlds without dressing (beta map) and failed species libraries are not blocking.
  assert.equal(loadingState({boot:1,terrainPending:0,dressingPending:0,speciesState:'none'},{terrain:0,dressing:0},10).ready,true);
  assert.equal(loadingState({boot:1,terrainPending:0,dressingPending:0,speciesState:'failed'},{terrain:0,dressing:0},10).ready,true);
  // Safety timeout: a slow machine is never locked out.
  assert.equal(loadingState({boot:1,terrainPending:5,dressingPending:9,speciesState:'loading'},{terrain:9,dressing:9},26000).ready,true);
});
