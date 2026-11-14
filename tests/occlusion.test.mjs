import test from 'node:test';
import assert from 'node:assert/strict';
import {createHorizonOcclusion,OCCLUSION} from '../src/render/horizon-occlusion.ts';

// Flat plain with a 60 m wall-like ridge across z = 200..260 (north of the camera).
const height=(x,z)=>z>200&&z<260?60:0;
test('H5 relief occlusion: what lies behind a ridge is hidden, crests and open sight lines stay drawn',()=>{
  const occ=createHorizonOcclusion(height);const cam={x:0,y:5,z:0};
  assert.equal(occ.visible(0,600,10),true,'before the first refresh everything is visible');
  let done=false;for(let i=0;i<10&&!done;i++)done=occ.update(cam,16);assert.ok(done,'refresh completes in slices');
  assert.equal(occ.visible(0,600,10),false,'a 10 m object far behind the ridge is hidden');
  assert.equal(occ.visible(0,600,300),true,'a tall landmark above the ridge line stays visible');
  assert.equal(occ.visible(0,230,60),true,'the crest itself is not hidden');
  assert.equal(occ.visible(0,-600,10),true,'open sight line to the south');
  assert.equal(occ.visible(400,0,2),true,'open sight line to the east');
  assert.equal(occ.visible(0,30,0),true,'near objects are never culled');
  // Moving the camera above the ridge reveals the area behind it.
  done=false;const high={x:0,y:400,z:0};for(let i=0;i<10&&!done;i++)done=occ.update(high,16);assert.ok(done);
  assert.equal(occ.visible(0,600,10),true,'seen from above, the valley behind is visible');
  assert.ok(occ.stats.refreshes===2&&occ.stats.samples===2*OCCLUSION.sectors*Math.ceil(OCCLUSION.maxDistance/OCCLUSION.step));
});
